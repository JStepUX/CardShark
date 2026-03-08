"""
Prompt Assembly Service — single source of truth for LLM prompt construction.

Replaces the split-brain architecture where frontend built the prompt string
and backend rebuilt memory + (for KoboldCPP) the full prompt from scratch.

All prompt assembly now happens here, for all providers.
"""

import re
import html
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field


# ── Field Expiration ─────────────────────────────────────────────────────────
# Ported from frontend ContextSerializer.ts FIELD_EXPIRATION_CONFIG

COMPRESSION_LEVEL_HIERARCHY = ['none', 'chat_only', 'chat_dialogue', 'aggressive']

FIELD_EXPIRATION_CONFIG: Dict[str, Dict[str, Any]] = {
    'system_prompt': {
        'permanent': True,
        'expires_at_message': None,
        'minimum_compression_level': 'none',
    },
    'description': {
        'permanent': True,
        'expires_at_message': None,
        'minimum_compression_level': 'none',
    },
    'personality': {
        'permanent': True,
        'expires_at_message': None,
        'minimum_compression_level': 'none',
    },
    'scenario': {
        'permanent': False,
        'expires_at_message': 3,
        'minimum_compression_level': 'aggressive',
    },
    'mes_example': {
        'permanent': False,
        'expires_at_message': 5,
        'minimum_compression_level': 'chat_dialogue',
    },
    'first_mes': {
        'permanent': False,
        'expires_at_message': 3,
        'minimum_compression_level': 'aggressive',
    },
}


def _compression_level_includes(current: str, required: str) -> bool:
    """Check if current compression level meets or exceeds required level."""
    try:
        return (COMPRESSION_LEVEL_HIERARCHY.index(current) >=
                COMPRESSION_LEVEL_HIERARCHY.index(required))
    except ValueError:
        return False


def should_expire_field(
    field_key: str,
    compression_level: str,
    message_count: int,
) -> bool:
    """Determine if a character card field should be expired from context."""
    config = FIELD_EXPIRATION_CONFIG.get(field_key)
    if not config or config['permanent']:
        return False
    if compression_level == 'none':
        return False

    meets_compression = _compression_level_includes(
        compression_level, config['minimum_compression_level']
    )
    threshold = config['expires_at_message']
    meets_threshold = message_count >= (threshold if threshold is not None else float('inf'))

    return meets_compression and meets_threshold


def compute_excluded_fields(
    compression_level: str,
    message_count: int,
) -> List[str]:
    """Compute which character card fields should be excluded based on compression state."""
    excluded = []
    for field_key, config in FIELD_EXPIRATION_CONFIG.items():
        if should_expire_field(field_key, compression_level, message_count):
            excluded.append(field_key)
    return excluded


# ── HTML Stripping ───────────────────────────────────────────────────────────

_HTML_TAG_RE = re.compile(r'<[^>]*>')


def strip_html_tags(content: str) -> str:
    """Strip HTML tags from content, matching frontend stripHtmlTags()."""
    if not content:
        return ''
    text = _HTML_TAG_RE.sub('', content)
    text = html.unescape(text)
    return text.strip()


# ── Template Variable Resolution ─────────────────────────────────────────────

def replace_variables(template_str: str, variables: Dict[str, str]) -> str:
    """Replace {{key}} template variables in a string."""
    if not template_str:
        return ''
    result = template_str
    for key, value in variables.items():
        pattern = re.compile(r'\{\{' + re.escape(key) + r'\}\}', re.IGNORECASE)
        result = pattern.sub(value or '', result)
    return result


# ── Token Estimation ─────────────────────────────────────────────────────────

def estimate_tokens(text: str) -> int:
    """Estimate token count (~4 chars per token)."""
    if not text:
        return 0
    return len(text) // 4


# ── Assembly Result ──────────────────────────────────────────────────────────

@dataclass
class FieldTokenInfo:
    field_key: str
    field_label: str
    tokens: int
    status: str  # 'permanent', 'active', 'expired'
    expired_at_message: Optional[int] = None


@dataclass
class AssemblyResult:
    """Complete result of prompt assembly."""
    prompt: str
    memory: str
    stop_sequences: List[str]
    debug_info: Dict[str, Any] = field(default_factory=dict)


# ── Prompt Assembly Service ──────────────────────────────────────────────────

class PromptAssemblyService:
    """
    Assembles LLM prompts from raw ingredients.

    Replaces:
    - Frontend: generationService.ts (formatChatHistory, assemblePrompt, buildPostHistoryBlock, getStopSequences)
    - Frontend: ContextSerializer.ts (createMemoryContext, shouldExpireField)
    - Backend: KoboldCPP rebuild block in api_handler.py:801-885

    Reuses:
    - Backend: LoreHandler.build_memory() (unchanged)
    - Backend: kobold_prompt_builder.py functions (unchanged)
    """

    def __init__(self, logger):
        self.logger = logger

    def assemble(
        self,
        *,
        chat_history: List[Dict[str, str]],
        character_data: Optional[Dict] = None,
        template_format: Optional[Dict[str, str]] = None,
        user_name: str = 'User',
        user_persona: str = '',
        compression_level: str = 'none',
        message_count: int = 0,
        compressed_context: str = '',
        session_notes: str = '',
        system_instruction: str = '',
        continuation_text: str = '',
        matched_lore: Optional[List[Dict]] = None,
        active_sticky_lore: Optional[List[Dict]] = None,
        token_budget: int = 0,
        is_kobold: bool = False,
    ) -> AssemblyResult:
        """
        Assemble a complete prompt from raw ingredients.

        This is the single codepath for all providers. Provider-specific
        formatting (KoboldCPP story-mode vs template-based instruct) is
        handled internally.
        """
        char_data = (character_data or {}).get('data', {}) if character_data else {}
        char_name = char_data.get('name', 'Character')

        # Step 1: Compute field expiration → excluded fields
        excluded_fields = compute_excluded_fields(compression_level, message_count)

        # Step 2: Build memory using existing LoreHandler.build_memory()
        memory = self._build_memory(
            character_data, excluded_fields, char_name, user_name,
            matched_lore, active_sticky_lore, token_budget,
        )

        # Step 3: Inject user persona
        if user_persona and user_persona.strip():
            persona_block = f"\n\n[About {user_name}]\n{user_persona.strip()}\n[End About {user_name}]"
            memory = (memory or '') + persona_block

        # Step 4: Build post-history block (raw, provider-specific wrapping below)
        post_history_raw = self._build_post_history_raw(
            char_data, session_notes, char_name, user_name,
        )

        # Step 5: Build field breakdown for debug info
        field_breakdown = self._build_field_breakdown(
            char_data, compression_level, message_count,
        )

        # Step 6: Provider-specific prompt construction
        if is_kobold:
            # KoboldCPP: build_story_prompt() wraps post_history in [...]
            result = self._assemble_kobold(
                memory=memory,
                chat_history=chat_history,
                char_name=char_name,
                user_name=user_name,
                system_instruction=system_instruction,
                compressed_context=compressed_context,
                post_history=post_history_raw,
                continuation_text=continuation_text,
            )
        else:
            # Instruct mode: wrap in [Session Notes]...[End Session Notes]
            post_history_wrapped = self._wrap_post_history_instruct(post_history_raw)
            result = self._assemble_instruct(
                memory=memory,
                chat_history=chat_history,
                char_name=char_name,
                user_name=user_name,
                template_format=template_format,
                system_instruction=system_instruction,
                compressed_context=compressed_context,
                post_history=post_history_wrapped,
                continuation_text=continuation_text,
                has_character=bool(character_data),
            )

        # Attach debug info
        result.debug_info = {
            'memory': result.memory,
            'prompt_length': len(result.prompt),
            'memory_length': len(result.memory),
            'field_breakdown': [
                {
                    'field_key': fb.field_key,
                    'field_label': fb.field_label,
                    'tokens': fb.tokens,
                    'status': fb.status,
                }
                for fb in field_breakdown
            ],
            'excluded_fields': excluded_fields,
            'compressed_context_length': len(compressed_context) if compressed_context else 0,
            'post_history_length': len(post_history_raw) if post_history_raw else 0,
            'message_count': len(chat_history),
            'provider': 'KoboldCPP' if is_kobold else 'instruct',
        }

        return result

    # ── Memory Building ──────────────────────────────────────────────────

    def _build_memory(
        self,
        character_data: Optional[Dict],
        excluded_fields: List[str],
        char_name: str,
        user_name: str,
        matched_lore: Optional[List[Dict]],
        active_sticky_lore: Optional[List[Dict]],
        token_budget: int,
    ) -> str:
        """Build memory using existing LoreHandler.build_memory()."""
        if not character_data or not character_data.get('data'):
            return ''

        try:
            from backend.lore_handler import LoreHandler
            lore_handler = LoreHandler(self.logger)
            return lore_handler.build_memory(
                character_data,
                excluded_fields=excluded_fields,
                char_name=char_name,
                user_name=user_name,
                lore_entries=matched_lore or [],
                active_sticky_entries=active_sticky_lore or [],
                token_budget=token_budget,
            )
        except (ImportError, ModuleNotFoundError):
            raise  # Broken import = code defect, don't swallow
        except Exception as e:
            self.logger.log_error(f"PromptAssemblyService: build_memory failed: {e}")
            return ''

    # ── Post-History Block ───────────────────────────────────────────────

    def _build_post_history_raw(
        self,
        char_data: Dict,
        session_notes: str,
        char_name: str,
        user_name: str,
    ) -> str:
        """
        Build raw post-history instructions (no wrapper brackets).
        Returns the resolved content that can be wrapped differently
        by instruct vs KoboldCPP paths.
        """
        card_post_history = (char_data.get('post_history_instructions') or '').strip()
        trimmed_notes = (session_notes or '').strip()

        if not card_post_history and not trimmed_notes:
            return ''

        parts = []
        if card_post_history:
            parts.append(card_post_history)
        if trimmed_notes:
            parts.append(trimmed_notes)

        raw = '\n'.join(parts)

        # Resolve {{char}} and {{user}} tokens (case-insensitive)
        raw = re.sub(r'\{\{char\}\}', char_name, raw, flags=re.IGNORECASE)
        raw = re.sub(r'\{\{user\}\}', user_name, raw, flags=re.IGNORECASE)

        return raw

    def _wrap_post_history_instruct(self, raw: str) -> str:
        """Wrap raw post-history in [Session Notes] for instruct mode."""
        if not raw:
            return ''
        return f"[Session Notes]\n{raw}\n[End Session Notes]"

    # ── Field Breakdown (debug) ──────────────────────────────────────────

    def _build_field_breakdown(
        self,
        char_data: Dict,
        compression_level: str,
        message_count: int,
    ) -> List[FieldTokenInfo]:
        """Build field breakdown for Context Window Modal debugging."""
        field_mappings = [
            ('system_prompt', 'System Prompt'),
            ('description', 'Description'),
            ('personality', 'Personality'),
            ('scenario', 'Scenario'),
            ('mes_example', 'Example Dialogue'),
        ]
        breakdown = []
        for key, label in field_mappings:
            value = char_data.get(key, '')
            tokens = estimate_tokens(value)
            config = FIELD_EXPIRATION_CONFIG.get(key)
            is_expired = should_expire_field(key, compression_level, message_count)
            if is_expired:
                breakdown.append(FieldTokenInfo(
                    field_key=key,
                    field_label=label,
                    tokens=tokens,
                    status='expired',
                    expired_at_message=config['expires_at_message'] if config else None,
                ))
            else:
                status = 'permanent' if (config and config['permanent']) else 'active'
                breakdown.append(FieldTokenInfo(
                    field_key=key, field_label=label, tokens=tokens, status=status,
                ))
        return breakdown

    # ── Instruct-Mode Assembly (non-KoboldCPP) ──────────────────────────

    def _assemble_instruct(
        self,
        *,
        memory: str,
        chat_history: List[Dict[str, str]],
        char_name: str,
        user_name: str,
        template_format: Optional[Dict[str, str]],
        system_instruction: str,
        compressed_context: str,
        post_history: str,
        continuation_text: str,
        has_character: bool,
    ) -> AssemblyResult:
        """
        Assemble prompt for non-KoboldCPP providers using template formatting.
        Matches frontend generationService.ts pipeline.
        """
        # System instruction prepended to memory
        if system_instruction:
            if memory:
                memory = f"{system_instruction}\n\n{memory}"
            else:
                memory = system_instruction

        # Format chat history using template
        formatted_history = self._format_chat_history(
            chat_history, char_name, user_name, template_format,
        )

        # Assemble final prompt (matches frontend assemblePrompt())
        prompt = ''
        if compressed_context:
            prompt += f"{compressed_context}\n\n"
        prompt += formatted_history

        if not prompt.strip():
            prompt = f"{char_name}:"

        if post_history:
            prompt += f"\n{post_history}"

        if has_character:
            if continuation_text:
                prompt += f"\n{char_name}: {continuation_text}"
            else:
                prompt += f"\n{char_name}:"

        # Stop sequences from template or defaults
        stop_sequences = self._get_stop_sequences(
            template_format, char_name, user_name,
        )
        if "</s>" not in stop_sequences:
            stop_sequences.append("</s>")

        return AssemblyResult(
            prompt=prompt,
            memory=memory,
            stop_sequences=stop_sequences,
        )

    # ── KoboldCPP Story-Mode Assembly ────────────────────────────────────

    def _assemble_kobold(
        self,
        *,
        memory: str,
        chat_history: List[Dict[str, str]],
        char_name: str,
        user_name: str,
        system_instruction: str,
        compressed_context: str,
        post_history: str,
        continuation_text: str,
    ) -> AssemblyResult:
        """
        Assemble prompt for KoboldCPP story-mode.
        Replaces the KoboldCPP-specific rebuild block in api_handler.py:801-885.
        Reuses existing kobold_prompt_builder.py functions.
        """
        from backend.kobold_prompt_builder import (
            fold_system_instruction, build_story_prompt,
            build_story_stop_sequences,
        )

        # Fold system instruction into memory as narrative framing
        if system_instruction:
            memory = fold_system_instruction(system_instruction, memory)

        # Append *** separator between memory and prompt
        if memory and not memory.rstrip().endswith('***'):
            memory = memory.rstrip() + '\n***'

        # Build prompt from chat history
        prompt = ''
        if compressed_context:
            prompt += compressed_context + '\n\n'

        if chat_history:
            prompt += build_story_prompt(
                chat_history, char_name, user_name,
                continuation_text, post_history,
            )
        elif post_history:
            # No history but we have post-history (e.g., greeting)
            prompt += f"{post_history}\n{char_name}:"
        else:
            prompt += f"{char_name}:"

        # Clean stop sequences
        stop_sequences = build_story_stop_sequences(char_name, user_name)

        return AssemblyResult(
            prompt=prompt,
            memory=memory,
            stop_sequences=stop_sequences,
        )

    # ── Chat History Formatting ──────────────────────────────────────────

    def _format_chat_history(
        self,
        messages: List[Dict[str, str]],
        char_name: str,
        user_name: str,
        template_format: Optional[Dict[str, str]],
    ) -> str:
        """
        Format chat history using template.
        Matches frontend formatChatHistory() in generationService.ts.
        """
        if not messages:
            return ''

        # Filter out thinking messages and strip HTML
        processed = []
        for msg in messages:
            role = msg.get('role', 'user')
            if role == 'thinking':
                continue
            content = strip_html_tags(msg.get('content', ''))
            processed.append({'role': role, 'content': content})

        if not processed:
            return ''

        if not template_format:
            # Default formatting (no template)
            parts = []
            for msg in processed:
                if msg['role'] == 'assistant':
                    parts.append(f"{char_name}: {msg['content']}")
                else:
                    parts.append(msg['content'])
            return '\n\n'.join(parts)

        # Template-based formatting
        user_fmt = template_format.get('userFormat', '{{content}}')
        assistant_fmt = template_format.get('assistantFormat', '{{char}}: {{content}}')
        system_fmt = template_format.get('systemFormat', '')

        parts = []
        for msg in processed:
            variables = {
                'content': msg['content'],
                'char': char_name,
                'user': user_name,
            }
            if msg['role'] == 'assistant':
                parts.append(replace_variables(assistant_fmt, variables))
            elif msg['role'] == 'system' and system_fmt:
                parts.append(replace_variables(system_fmt, variables))
            else:
                parts.append(replace_variables(user_fmt, variables))

        return '\n'.join(parts)

    # ── Stop Sequences ───────────────────────────────────────────────────

    def _get_stop_sequences(
        self,
        template_format: Optional[Dict[str, str]],
        char_name: str,
        user_name: str,
    ) -> List[str]:
        """
        Get stop sequences from template or generate defaults.
        Matches frontend getStopSequences() in generationService.ts.
        """
        default_stops = [
            f"\n{user_name}:",
            "\nUser:",
            "\nAssistant:",
        ]

        if not template_format:
            return default_stops

        template_stops = template_format.get('stopSequences', [])
        if not template_stops:
            return default_stops

        # Resolve {{char}} and {{user}} in stop sequences (case-insensitive)
        resolved = []
        for seq in template_stops:
            s = re.sub(r'\{\{char\}\}', char_name, seq, flags=re.IGNORECASE)
            s = re.sub(r'\{\{user\}\}', user_name, s, flags=re.IGNORECASE)
            resolved.append(s)

        return resolved
