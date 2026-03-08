"""Tests for backend.services.compression_service — Phase 2 backend compression."""

import time
from unittest.mock import patch, MagicMock
import pytest

from backend.services.compression_service import (
    CompressionService,
    CompressionResult,
    COMPRESSION_THRESHOLD,
    RECENT_WINDOW,
    COMPRESSION_REFRESH_THRESHOLD,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────

class FakeLogger:
    """Minimal logger for tests."""
    def log_step(self, msg): pass
    def log_error(self, msg): pass
    def log_warning(self, msg): pass


@pytest.fixture
def logger():
    return FakeLogger()


@pytest.fixture
def service(logger):
    return CompressionService(logger)


def _make_history(n: int) -> list:
    """Create n alternating user/assistant messages."""
    history = []
    for i in range(n):
        role = 'user' if i % 2 == 0 else 'assistant'
        history.append({'role': role, 'content': f'Message {i}'})
    return history


DUMMY_API_CONFIG = {
    'provider': 'KoboldCPP',
    'url': 'http://localhost:5001',
    'apiKey': '',
    'generation_settings': {'max_context_length': 8192},
}


# ── Decision Logic Tests ─────────────────────────────────────────────────────

class TestCompressionDecision:
    """Tests for when compression triggers vs. is skipped."""

    def test_no_compression_when_level_none(self, service):
        history = _make_history(30)
        result = service.compress_if_needed(
            chat_history=history,
            compression_level='none',
            message_count=30,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
        )
        assert result.compressed_context == ''
        assert result.messages_for_formatting is history

    def test_no_compression_below_threshold(self, service):
        history = _make_history(15)
        result = service.compress_if_needed(
            chat_history=history,
            compression_level='chat_only',
            message_count=15,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
        )
        assert result.compressed_context == ''
        assert result.messages_for_formatting is history

    def test_no_compression_at_exact_threshold(self, service):
        history = _make_history(COMPRESSION_THRESHOLD)
        result = service.compress_if_needed(
            chat_history=history,
            compression_level='chat_only',
            message_count=COMPRESSION_THRESHOLD,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
        )
        assert result.compressed_context == ''
        assert result.messages_for_formatting is history

    @patch('backend.services.compression_service.CompressionService._generate_summary')
    def test_compression_triggers_above_threshold(self, mock_gen, service):
        mock_gen.return_value = 'Summary of old events.'
        history = _make_history(25)
        result = service.compress_if_needed(
            chat_history=history,
            compression_level='chat_only',
            message_count=25,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
            chat_session_uuid='test-session',
        )
        assert result.compressed_context == 'Summary of old events.'
        assert len(result.messages_for_formatting) == RECENT_WINDOW
        mock_gen.assert_called_once()

    @patch('backend.services.compression_service.CompressionService._generate_summary')
    def test_recent_window_is_correct_slice(self, mock_gen, service):
        mock_gen.return_value = 'Summary.'
        history = _make_history(35)
        result = service.compress_if_needed(
            chat_history=history,
            compression_level='aggressive',
            message_count=35,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
            chat_session_uuid='test-session',
        )
        # Recent window should be the last RECENT_WINDOW messages
        expected_recent = history[25:]
        assert result.messages_for_formatting == expected_recent
        assert len(result.messages_for_formatting) == RECENT_WINDOW


# ── Cache Tests ──────────────────────────────────────────────────────────────

class TestCompressionCache:
    """Tests for cache hit/miss/invalidation behavior."""

    @patch('backend.services.compression_service.CompressionService._generate_summary')
    def test_cache_hit_skips_llm_call(self, mock_gen, service):
        mock_gen.return_value = 'Summary.'
        history = _make_history(25)
        session_id = 'cache-test'

        # First call: generates summary
        r1 = service.compress_if_needed(
            chat_history=history,
            compression_level='chat_only',
            message_count=25,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
            chat_session_uuid=session_id,
        )
        assert mock_gen.call_count == 1
        assert r1.compressed_context == 'Summary.'

        # Second call (same count): cache hit, no new LLM call
        r2 = service.compress_if_needed(
            chat_history=history,
            compression_level='chat_only',
            message_count=25,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
            chat_session_uuid=session_id,
        )
        assert mock_gen.call_count == 1  # No additional call
        assert r2.compressed_context == 'Summary.'

    @patch('backend.services.compression_service.CompressionService._generate_summary')
    def test_cache_invalidated_on_level_change(self, mock_gen, service):
        mock_gen.return_value = 'Summary.'
        history = _make_history(25)
        session_id = 'level-change'

        # First call with chat_only
        service.compress_if_needed(
            chat_history=history,
            compression_level='chat_only',
            message_count=25,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
            chat_session_uuid=session_id,
        )
        assert mock_gen.call_count == 1

        # Second call with aggressive: cache miss (different level)
        service.compress_if_needed(
            chat_history=history,
            compression_level='aggressive',
            message_count=25,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
            chat_session_uuid=session_id,
        )
        assert mock_gen.call_count == 2

    @patch('backend.services.compression_service.CompressionService._generate_summary')
    def test_cache_stale_after_refresh_threshold(self, mock_gen, service):
        mock_gen.return_value = 'Summary.'
        session_id = 'stale-test'

        # First call at count 25
        service.compress_if_needed(
            chat_history=_make_history(25),
            compression_level='chat_only',
            message_count=25,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
            chat_session_uuid=session_id,
        )
        assert mock_gen.call_count == 1

        # Call at count 44: still within threshold (44-15=29 > 20, but compressed_at_count=15)
        # Wait, compressed_at_count = len(old_messages) = 25-10 = 15
        # count diff = 44-15 = 29 >= 20 → stale
        service.compress_if_needed(
            chat_history=_make_history(44),
            compression_level='chat_only',
            message_count=44,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
            chat_session_uuid=session_id,
        )
        assert mock_gen.call_count == 2  # Recompressed

    @patch('backend.services.compression_service.CompressionService._generate_summary')
    def test_cache_valid_within_refresh_threshold(self, mock_gen, service):
        mock_gen.return_value = 'Summary.'
        session_id = 'valid-test'

        # First call at count 25 → compressed_at_count = 15
        service.compress_if_needed(
            chat_history=_make_history(25),
            compression_level='chat_only',
            message_count=25,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
            chat_session_uuid=session_id,
        )
        assert mock_gen.call_count == 1

        # Call at count 30: diff = 30-15 = 15 < 20 → still valid
        service.compress_if_needed(
            chat_history=_make_history(30),
            compression_level='chat_only',
            message_count=30,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
            chat_session_uuid=session_id,
        )
        assert mock_gen.call_count == 1  # Cache hit

    def test_explicit_invalidation(self, service):
        # Seed cache directly
        from backend.services.compression_service import _CacheEntry
        service._cache['session-x'] = _CacheEntry(
            compressed_text='Old summary',
            compressed_at_count=15,
            compression_level='chat_only',
            timestamp=time.time(),
        )
        assert 'session-x' in service._cache
        service.invalidate_cache('session-x')
        assert 'session-x' not in service._cache

    def test_gc_stale_sessions(self, service):
        from backend.services.compression_service import _CacheEntry
        service._cache['old'] = _CacheEntry(
            compressed_text='Old',
            compressed_at_count=10,
            compression_level='chat_only',
            timestamp=time.time() - 7200,  # 2 hours ago
        )
        service._cache['recent'] = _CacheEntry(
            compressed_text='Recent',
            compressed_at_count=10,
            compression_level='chat_only',
            timestamp=time.time(),
        )
        service.gc_stale_sessions()
        assert 'old' not in service._cache
        assert 'recent' in service._cache


# ── Failure Handling ─────────────────────────────────────────────────────────

class TestCompressionFailure:
    """Tests for graceful degradation when compression fails."""

    @patch('backend.services.compression_service.CompressionService._generate_summary')
    def test_llm_failure_returns_full_history(self, mock_gen, service):
        mock_gen.side_effect = Exception('LLM timeout')
        history = _make_history(25)
        result = service.compress_if_needed(
            chat_history=history,
            compression_level='chat_only',
            message_count=25,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
        )
        assert result.compressed_context == ''
        assert result.messages_for_formatting is history

    @patch('backend.services.compression_service.CompressionService._generate_summary')
    def test_llm_returns_none_uses_full_history(self, mock_gen, service):
        mock_gen.return_value = None
        history = _make_history(25)
        result = service.compress_if_needed(
            chat_history=history,
            compression_level='chat_only',
            message_count=25,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
        )
        assert result.compressed_context == ''
        assert result.messages_for_formatting is history


# ── Message Formatting ───────────────────────────────────────────────────────

class TestMessageFormatting:
    """Tests for _format_messages helper."""

    def test_formats_roles_correctly(self, service):
        messages = [
            {'role': 'user', 'content': 'Hello'},
            {'role': 'assistant', 'content': 'Hi there'},
            {'role': 'system', 'content': 'Context info'},
        ]
        result = service._format_messages(messages, 'Alice')
        assert 'User: Hello' in result
        assert 'Alice: Hi there' in result
        assert 'System: Context info' in result

    def test_strips_html_from_messages(self, service):
        messages = [
            {'role': 'user', 'content': '<p>Hello <b>world</b></p>'},
        ]
        result = service._format_messages(messages, 'Alice')
        assert '<p>' not in result
        assert '<b>' not in result
        assert 'Hello world' in result

    def test_separates_messages_with_double_newline(self, service):
        messages = [
            {'role': 'user', 'content': 'First'},
            {'role': 'assistant', 'content': 'Second'},
        ]
        result = service._format_messages(messages, 'Alice')
        assert 'User: First\n\nAlice: Second' == result


# ── Different Session Isolation ──────────────────────────────────────────────

class TestSessionIsolation:
    """Tests that caches are isolated per session."""

    @patch('backend.services.compression_service.CompressionService._generate_summary')
    def test_different_sessions_independent_caches(self, mock_gen, service):
        mock_gen.return_value = 'Summary.'
        history = _make_history(25)

        service.compress_if_needed(
            chat_history=history,
            compression_level='chat_only',
            message_count=25,
            api_config=DUMMY_API_CONFIG,
            character_name='Alice',
            user_name='User',
            chat_session_uuid='session-a',
        )
        service.compress_if_needed(
            chat_history=history,
            compression_level='chat_only',
            message_count=25,
            api_config=DUMMY_API_CONFIG,
            character_name='Bob',
            user_name='User',
            chat_session_uuid='session-b',
        )
        # Both sessions triggered their own LLM call
        assert mock_gen.call_count == 2
