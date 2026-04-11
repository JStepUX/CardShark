"""
Tests for logit_shaper: protected words whitelist and ban detection.

Verifies:
- Whitelisted structural words are never banned
- Short words (<=4 chars) are protected
- Contractions are protected
- Words exceeding the threshold in the rolling window get banned
- Bans decay after TTL expires
"""
import pytest
from pathlib import Path
import sys

project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from backend.logit_shaper import (
    _is_protected,
    _PROTECTED_WORDS,
    _extract_words,
    LogitShaper,
    WINDOW_SIZE,
    REPETITION_THRESHOLD,
    BAN_TTL,
)


class TestProtectedWords:
    def test_whitelist_is_loaded(self):
        assert len(_PROTECTED_WORDS) > 100, "Whitelist should contain 100+ structural words"

    def test_whitelisted_word_is_protected(self):
        # "through" is 7 chars (above min length) but in the whitelist
        assert "through" in _PROTECTED_WORDS
        assert _is_protected("through", "She walked through the door.")

    def test_non_whitelisted_long_word_is_not_protected(self):
        assert "shimmering" not in _PROTECTED_WORDS
        assert not _is_protected("shimmering", "The shimmering light.")

    def test_short_words_are_protected(self):
        assert _is_protected("the", "The cat sat.")
        assert _is_protected("and", "Cats and dogs.")

    def test_contractions_are_protected(self):
        assert _is_protected("don't", "I don't know.")
        assert _is_protected("won't", "She won't go.")

    def test_proper_noun_mid_sentence_is_protected(self):
        text = "The warrior saw Elena standing by the gate."
        assert _is_protected("elena", text)

    def test_word_at_sentence_start_only_is_not_protected(self):
        text = "Shimmering lights filled the room. Shimmering again."
        assert not _is_protected("shimmering", text)


class TestBanLifecycle:
    def _feed_turns(self, shaper: LogitShaper, texts: list[str]) -> None:
        for text in texts:
            shaper.analyze_output(text)

    def test_word_banned_after_threshold(self):
        shaper = LogitShaper()
        # "glistening" appears in 3 consecutive turns (meets 3/3 rule)
        self._feed_turns(shaper, [
            "The glistening surface caught her eye.",
            "A glistening blade lay on the table.",
            "His glistening armor reflected the light.",
        ])
        assert "glistening" in shaper.get_banned_tokens()

    def test_whitelisted_word_not_banned_even_if_repeated(self):
        shaper = LogitShaper()
        # "through" is in the whitelist — should never be banned
        self._feed_turns(shaper, [
            "She walked through the corridor.",
            "Light filtered through the window.",
            "He pushed through the crowd.",
        ])
        assert "through" not in shaper.get_banned_tokens()

    def test_ban_decays_after_ttl(self):
        shaper = LogitShaper()
        self._feed_turns(shaper, [
            "The glistening surface caught her eye.",
            "A glistening blade lay on the table.",
            "His glistening armor reflected the light.",
        ])
        assert "glistening" in shaper.get_banned_tokens()

        # Feed BAN_TTL more turns to expire the ban
        for i in range(BAN_TTL):
            shaper.analyze_output(f"Turn {i} with no repetition.")
        assert "glistening" not in shaper.get_banned_tokens()

    def test_below_threshold_no_ban(self):
        shaper = LogitShaper()
        # Only 2 turns with "glistening" — below threshold of 3
        self._feed_turns(shaper, [
            "The glistening surface caught her eye.",
            "A glistening blade lay on the table.",
            "A plain turn with nothing special.",
        ])
        assert "glistening" not in shaper.get_banned_tokens()
