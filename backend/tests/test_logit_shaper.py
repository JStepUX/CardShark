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


class TestHardRegenerate:
    """
    Hard Regenerate should be treated by LogitShaper as a regeneration —
    it replaces the current turn rather than advancing the turn counter.
    This mirrors the check in api_handler.stream_generate() at the post-gen
    analyze step, which evaluates:
        is_regen = gen_type in REGENERATION_GEN_TYPES
    """

    @pytest.mark.parametrize(
        "gen_type,expected_is_regen",
        [
            ("hard_regenerate", True),
            ("regenerate", True),
            ("continue", True),
            ("generate", False),
            ("", False),
            ("greeting", False),
        ],
    )
    def test_gen_type_classification_matches_production_constant(
        self, gen_type, expected_is_regen
    ):
        """
        Couples the test to the *live* production tuple in api_handler.py.

        If someone removes 'hard_regenerate' from REGENERATION_GEN_TYPES (or
        from the membership check at the call site), the hard_regenerate row
        of this parametrize flips and the test fails. This is the same
        boolean expression executed inside stream_generate()'s post-gen
        analyze block.
        """
        from backend.api_handler import REGENERATION_GEN_TYPES

        # Guard: the constant must exist and be a tuple of strings.
        assert isinstance(REGENERATION_GEN_TYPES, tuple)
        assert all(isinstance(x, str) for x in REGENERATION_GEN_TYPES)

        # This is the exact expression evaluated at the api_handler call site.
        is_regen = gen_type in REGENERATION_GEN_TYPES
        assert is_regen is expected_is_regen, (
            f"gen_type={gen_type!r} classified as is_regen={is_regen} "
            f"but expected {expected_is_regen}. "
            f"REGENERATION_GEN_TYPES={REGENERATION_GEN_TYPES!r}. "
            f"If 'hard_regenerate' was removed from the production tuple, "
            f"the Hard Regenerate chat-bubble action will silently advance "
            f"the LogitShaper turn counter on every click."
        )

    def test_hard_regenerate_is_member_of_production_constant(self):
        """
        Explicit single-value guard: Hard Regenerate must be in the
        production tuple. Redundant with the parametrize above but named
        so a CI failure report names the feature directly.
        """
        from backend.api_handler import REGENERATION_GEN_TYPES

        assert "hard_regenerate" in REGENERATION_GEN_TYPES, (
            "'hard_regenerate' is missing from api_handler.REGENERATION_GEN_TYPES. "
            "Hard Regenerate clicks will advance the LogitShaper turn counter "
            "instead of replacing the current turn, breaking the feature."
        )

    def test_call_site_uses_production_constant(self):
        """
        Guards against someone reintroducing an inline literal tuple at the
        call site (which would make REGENERATION_GEN_TYPES dead code and
        re-enable the original tautology risk). Reads the source of
        stream_generate and asserts it references the constant by name.
        """
        import inspect
        from backend.api_handler import ApiHandler

        src = inspect.getsource(ApiHandler.stream_generate)
        assert "REGENERATION_GEN_TYPES" in src, (
            "stream_generate() no longer references REGENERATION_GEN_TYPES — "
            "the call site has drifted from the exported constant, so this "
            "test file is no longer guarding the live code path."
        )

    def test_hard_regenerate_does_not_advance_turn_counter(self):
        shaper = LogitShaper()
        # Seed one full turn to advance the counter to 1
        shaper.analyze_output("The warrior drew his sword.", is_regeneration=False)
        turn_after_first = shaper.current_turn_number
        assert turn_after_first == 1

        # Simulate multiple Hard Regens of that same turn —
        # counter must stay at 1 (turn is replaced, not appended).
        shaper.analyze_output("The warrior raised his blade.", is_regeneration=True)
        shaper.analyze_output("The warrior unsheathed his weapon.", is_regeneration=True)
        shaper.analyze_output("The warrior gripped his hilt.", is_regeneration=True)

        assert shaper.current_turn_number == turn_after_first, (
            "Hard Regenerate must not advance the LogitShaper turn counter — "
            "each click replaces the current turn rather than appending a new one."
        )
