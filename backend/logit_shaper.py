# backend/logit_shaper.py
# Description: Detects word-level repetition across recent {{char}} turns and
# temporarily bans offending words via KoboldCPP's banned_tokens parameter.
#
# Rule: 3/3/3 — 3 repetitions across 3 turns triggers a 3-turn ban.

import re
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

# ── Word extraction ──────────────────────────────────────────────────────────

_WORD_RE = re.compile(r"[a-zA-Z']+")

# Words with 4 or fewer characters are protected from banning
_MIN_WORD_LENGTH = 5

# ── Configuration ────────────────────────────────────────────────────────────

WINDOW_SIZE = 3        # Rolling window of recent turns to scan
REPETITION_THRESHOLD = 3  # Word must appear this many times across the window
BAN_TTL = 3            # Ban lasts this many new turns


def _extract_words(text: str) -> Dict[str, int]:
    """Extract word frequency map from text.

    - Regex: [a-zA-Z']+
    - Strip leading/trailing apostrophes (so 'Hello' -> Hello, but don't stays intact)
    - Lowercase keys
    """
    counts: Dict[str, int] = {}
    for match in _WORD_RE.finditer(text):
        raw = match.group()
        # Strip leading/trailing apostrophes
        word = raw.strip("'").lower()
        if not word:
            continue
        counts[word] = counts.get(word, 0) + 1
    return counts


def _is_protected(word: str, text: str) -> bool:
    """Check if a word should be protected from banning.

    Protected words:
    - Length <= 4 (common articles, prepositions, pronouns)
    - Non-sentence-start capitalized words (proper nouns like character names)
    """
    if len(word) <= _MIN_WORD_LENGTH - 1:
        return True

    # Check if the word appears capitalized mid-sentence (proper noun heuristic).
    # A "sentence start" is after . ! ? or start-of-string, followed by optional whitespace.
    # If the word ONLY appears at sentence starts, it's not a proper noun — not protected.
    # If it appears capitalized NOT at a sentence start, it's likely a proper noun — protected.
    pattern = re.compile(
        r'(?<![.!?\n])\s+(' + re.escape(word) + r')\b',
        re.IGNORECASE
    )
    for m in pattern.finditer(text):
        matched = m.group(1)
        if matched[0].isupper():
            # Found capitalized mid-sentence — likely a proper noun
            return True

    return False


# ── Data structures ──────────────────────────────────────────────────────────

@dataclass
class TurnRecord:
    """Snapshot of a single {{char}} turn."""
    turn_number: int
    words: Dict[str, int]  # word -> count within this turn
    raw_text: str


@dataclass
class BanEntry:
    """An active word ban."""
    word: str
    activated_at_turn: int
    ttl: int  # Remaining turns before expiry


# ── LogitShaper class ────────────────────────────────────────────────────────

class LogitShaper:
    """Per-session word repetition tracker and banner.

    Maintains a rolling window of recent {{char}} turns, detects words that
    repeat across the window, and produces a banned_tokens list for KoboldCPP.
    """

    def __init__(self) -> None:
        self.turn_buffer: List[TurnRecord] = []
        self.active_bans: List[BanEntry] = []
        self.current_turn_number: int = 0
        self.last_access: float = time.time()

    def analyze_output(self, text: str, is_regeneration: bool = False) -> None:
        """Process a completed {{char}} response.

        Args:
            text: The full response text from the model.
            is_regeneration: True for regenerate/continue (replaces current turn,
                             does not advance counter).
        """
        self.last_access = time.time()
        words = _extract_words(text)

        if is_regeneration:
            # Replace the most recent turn record (if any) without advancing
            if self.turn_buffer:
                self.turn_buffer[-1] = TurnRecord(
                    turn_number=self.current_turn_number,
                    words=words,
                    raw_text=text,
                )
            else:
                # No previous turn — treat as new
                self.current_turn_number += 1
                self.turn_buffer.append(TurnRecord(
                    turn_number=self.current_turn_number,
                    words=words,
                    raw_text=text,
                ))
        else:
            # New turn: advance counter, append record, trim window
            self.current_turn_number += 1
            self.turn_buffer.append(TurnRecord(
                turn_number=self.current_turn_number,
                words=words,
                raw_text=text,
            ))
            # Keep only the most recent WINDOW_SIZE turns
            if len(self.turn_buffer) > WINDOW_SIZE:
                self.turn_buffer = self.turn_buffer[-WINDOW_SIZE:]

        # Decay existing bans
        self._decay_bans()

        # Detect new bans (only when we have a full window)
        if len(self.turn_buffer) >= WINDOW_SIZE:
            self._detect_new_bans()

    def get_banned_tokens(self) -> List[str]:
        """Return the current list of banned words for KoboldCPP."""
        self.last_access = time.time()
        return [ban.word for ban in self.active_bans]

    def _decay_bans(self) -> None:
        """Remove bans whose TTL has expired."""
        still_active: List[BanEntry] = []
        for ban in self.active_bans:
            turns_elapsed = self.current_turn_number - ban.activated_at_turn
            if turns_elapsed < ban.ttl:
                still_active.append(ban)
        self.active_bans = still_active

    def _detect_new_bans(self) -> None:
        """Scan the rolling window for words that cross the repetition threshold."""
        # Aggregate word occurrences across the window (count turns, not total freq)
        word_turn_count: Dict[str, int] = {}
        # Sentinel "." prevents the first word from falsely appearing mid-sentence
        # (negative lookbehind at start-of-string would otherwise vacuously succeed)
        combined_text = "."
        for record in self.turn_buffer:
            combined_text += "\n" + record.raw_text
            for word in record.words:
                word_turn_count[word] = word_turn_count.get(word, 0) + 1

        # Already-banned words (by lowercase key)
        already_banned = {ban.word for ban in self.active_bans}

        for word, turn_count in word_turn_count.items():
            if turn_count >= REPETITION_THRESHOLD and word not in already_banned:
                if not _is_protected(word, combined_text):
                    self.active_bans.append(BanEntry(
                        word=word,
                        activated_at_turn=self.current_turn_number,
                        ttl=BAN_TTL,
                    ))


# ── Per-session registry ─────────────────────────────────────────────────────

_shaper_registry: Dict[str, LogitShaper] = {}


def get_or_create_shaper(session_uuid: str) -> LogitShaper:
    """Get or lazily create a LogitShaper for a chat session.

    Also triggers stale cleanup on every call.
    """
    cleanup_stale_shapers()

    if session_uuid not in _shaper_registry:
        _shaper_registry[session_uuid] = LogitShaper()

    shaper = _shaper_registry[session_uuid]
    shaper.last_access = time.time()
    return shaper


def cleanup_stale_shapers(max_age: int = 3600) -> None:
    """Remove shapers that haven't been accessed for max_age seconds."""
    now = time.time()
    stale_keys = [
        key for key, shaper in _shaper_registry.items()
        if (now - shaper.last_access) > max_age
    ]
    for key in stale_keys:
        del _shaper_registry[key]
