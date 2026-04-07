"""
Compression Service — server-side context compression with per-session caching.

Replaces the frontend's compressionService.ts when backend_assembly=true.
Decides when to compress, calls the LLM to generate summaries, and caches
results per chat session.

Phase 2 of the backend prompt assembly migration.
"""

import requests
import json
import time
import traceback
from typing import Dict, List, Optional, Any
from dataclasses import dataclass


# Match frontend constants (compressionService.ts:19-21)
COMPRESSION_THRESHOLD = 20           # don't compress below this many messages
RECENT_WINDOW = 10                   # always keep this many verbatim
COMPRESSION_REFRESH_THRESHOLD = 20   # re-compress after this many new messages

COMPRESSION_SYSTEM_PROMPT = (
    "You are a context compressor for a roleplay chat. "
    "Summarize the following messages into a concise narrative that preserves:\n"
    "- Key plot events and decisions\n"
    "- Character emotional states and relationship changes\n"
    "- Established facts about the world/setting\n"
    "- Any commitments, promises, or plans made\n\n"
    "Write in past tense, third person. Be concise but do not lose critical details.\n"
    "Do not editorialize or add interpretation. Just the facts of what happened."
)

# Stale cache eviction threshold (1 hour)
CACHE_MAX_AGE_SECONDS = 3600


@dataclass
class _CacheEntry:
    compressed_text: str
    compressed_at_count: int
    compression_level: str
    timestamp: float


@dataclass
class CompressionResult:
    """Result of compression check — consumed by the backend_assembly branch."""
    compressed_context: str              # Summary text, or '' if no compression
    messages_for_formatting: List[Dict]  # Messages to pass to PromptAssemblyService


class CompressionService:
    """
    Server-side context compression with per-session caching.

    Mirrors the frontend's orchestrateCompression() logic:
    - Below COMPRESSION_THRESHOLD messages → no compression
    - compression_level == 'none' → no compression
    - Otherwise: compress old messages (all except RECENT_WINDOW),
      cache the result, reuse cache within COMPRESSION_REFRESH_THRESHOLD
    """

    def __init__(self, logger):
        self.logger = logger
        self._cache: Dict[str, _CacheEntry] = {}

    def compress_if_needed(
        self,
        *,
        chat_history: List[Dict[str, str]],
        compression_level: str,
        message_count: int,
        api_config: Dict[str, Any],
        character_name: str,
        user_name: str,
        chat_session_uuid: Optional[str] = None,
    ) -> CompressionResult:
        """
        Check if compression is needed and return a CompressionResult.

        The result contains:
        - compressed_context: the summary text (empty if no compression)
        - messages_for_formatting: the messages the assembler should format
          (recent window if compressed, full history if not)
        """
        # No compression: return full history
        if compression_level == 'none' or message_count <= COMPRESSION_THRESHOLD:
            return CompressionResult(
                compressed_context='',
                messages_for_formatting=chat_history,
            )

        cache_key = chat_session_uuid or ''
        split_point = message_count - RECENT_WINDOW
        recent_messages = chat_history[split_point:]

        # Check cache validity
        cached = self._cache.get(cache_key)
        if cached and self._is_cache_valid(cached, compression_level, message_count):
            self.logger.log_step(
                f"Compression: using cache "
                f"(compressed at {cached.compressed_at_count}, now {message_count})"
            )
            return CompressionResult(
                compressed_context=cached.compressed_text,
                messages_for_formatting=recent_messages,
            )

        # Need to compress
        old_messages = chat_history[:split_point]
        if not old_messages:
            return CompressionResult(
                compressed_context='',
                messages_for_formatting=chat_history,
            )

        self.logger.log_step(
            f"Compression: compressing {len(old_messages)} old messages "
            f"(keeping {len(recent_messages)} recent)"
        )

        try:
            summary = self._generate_summary(
                old_messages, api_config, character_name, user_name,
            )
            if summary:
                self._cache[cache_key] = _CacheEntry(
                    compressed_text=summary,
                    compressed_at_count=len(old_messages),
                    compression_level=compression_level,
                    timestamp=time.time(),
                )
                self.logger.log_step(
                    f"Compression: summary generated ({len(summary)} chars)"
                )
                return CompressionResult(
                    compressed_context=summary,
                    messages_for_formatting=recent_messages,
                )
        except Exception as e:
            self.logger.log_error(f"Compression failed, using full context: {e}")
            self.logger.log_error(traceback.format_exc())

        # Fallback: no compression, use full history
        return CompressionResult(
            compressed_context='',
            messages_for_formatting=chat_history,
        )

    def invalidate_cache(self, chat_session_uuid: str) -> None:
        """Invalidate cache for a session."""
        self._cache.pop(chat_session_uuid, None)

    def gc_stale_sessions(self) -> None:
        """Remove cache entries older than CACHE_MAX_AGE_SECONDS."""
        cutoff = time.time() - CACHE_MAX_AGE_SECONDS
        stale = [k for k, v in self._cache.items() if v.timestamp < cutoff]
        for k in stale:
            del self._cache[k]

    # ── Private helpers ──────────────────────────────────────────────────

    def _is_cache_valid(
        self, cache: _CacheEntry, level: str, message_count: int,
    ) -> bool:
        return (
            cache.compression_level == level
            and cache.compressed_at_count > 0
            and (message_count - cache.compressed_at_count) < COMPRESSION_REFRESH_THRESHOLD
        )

    def _format_messages(
        self,
        messages: List[Dict[str, str]],
        character_name: str,
    ) -> str:
        """Format messages into plain text for the compression prompt."""
        from backend.services.prompt_assembly_service import strip_html_tags

        parts = []
        for msg in messages:
            role = msg.get('role', 'user')
            content = strip_html_tags(msg.get('content', ''))
            if role == 'assistant':
                parts.append(f"{character_name}: {content}")
            elif role == 'user':
                parts.append(f"User: {content}")
            else:
                parts.append(f"System: {content}")
        return '\n\n'.join(parts)

    def _generate_summary(
        self,
        messages: List[Dict[str, str]],
        api_config: Dict[str, Any],
        character_name: str,
        user_name: str,
    ) -> Optional[str]:
        """
        Call the configured LLM to generate a compression summary.

        Uses sync requests.post (non-streaming) — same call pattern as
        generate_with_config() but sync since stream_generate() is sync.
        """
        from backend.api_provider_adapters import get_provider_adapter
        from backend.kobold_prompt_builder import is_kobold_provider
        from backend.api_handler import ThinkingTagFilter

        messages_text = self._format_messages(messages, character_name)
        user_prompt = f"Compress these messages:\n\n{messages_text}"
        prompt = f"{COMPRESSION_SYSTEM_PROMPT}\n\n{user_prompt}\n\nSummary:"

        provider = api_config.get('provider', '')
        url = api_config.get('url', '')
        api_key = api_config.get('apiKey', '')
        generation_settings = api_config.get('generation_settings', {})
        is_kobold = is_kobold_provider(api_config)

        adapter = get_provider_adapter(provider, self.logger, api_config)
        headers = adapter.prepare_headers(api_key)

        if is_kobold:
            # KoboldCPP: use non-streaming /api/generate endpoint
            endpoint = url.rstrip('/') + '/api/generate'
            data = {
                'prompt': prompt,
                'max_length': 1024,
                'temperature': 0.3,
                'max_context_length': generation_settings.get('max_context_length', 8192),
                'stop_sequence': [],
                'stream': False,
                'quiet': True,
                'trim_stop': True,
            }
        else:
            # OpenAI-compatible / Claude: use adapter's endpoint with stream=false
            endpoint = adapter.get_endpoint_url(url)
            # Build request data using adapter, then override for compression
            compression_settings = {
                **generation_settings,
                'max_length': 1024,
                'temperature': 0.3,
            }
            data = adapter.prepare_request_data(
                prompt, '', [], compression_settings,
            )
            data['stream'] = False

        self.logger.log_step(f"Compression: calling {provider} at {endpoint}")

        response = requests.post(
            endpoint, headers=headers, json=data, timeout=120,
        )

        if response.status_code != 200:
            self.logger.log_error(
                f"Compression API returned {response.status_code}: "
                f"{response.text[:500]}"
            )
            return None

        result = response.json()

        # Extract content based on provider
        if is_kobold:
            content = (
                result.get('response', '')
                or result.get('results', [{}])[0].get('text', '')
            )
        elif provider in ('OpenAI', 'OpenRouter', 'Featherless', 'Ollama'):
            content = (
                result.get('choices', [{}])[0]
                .get('message', {})
                .get('content', '')
            )
        elif provider == 'Claude':
            content = (
                result.get('content', [{}])[0]
                .get('text', '')
            )
        else:
            content = str(result)

        # Strip thinking tags
        content = ThinkingTagFilter.strip_thinking_tags(content)

        return content.strip() if content else None
