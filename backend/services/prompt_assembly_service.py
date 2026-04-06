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
            result = self._assemble_kobold(
                memory=memory,
                chat_history=chat_history,
                char_name=char_name,
                user_name=user_name,
                template_format=template_format,
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

        # Generation stub: use template outputSequence or fall back to name
        if has_character:
            output_seq = self._get_output_sequence(template_format, char_name)
            if continuation_text:
                # Template sequences include their own spacing; bare name needs a space
                sep = '' if template_format else ' '
                prompt += f"\n{output_seq}{sep}{continuation_text}"
            else:
                prompt += f"\n{output_seq}"

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

    # ── KoboldCPP Assembly ───────────────────────────────────────────────

    def _assemble_kobold(
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
    ) -> AssemblyResult:
        """
        Assemble prompt for KoboldCPP.

        When template_format is provided, applies instruct template formatting
        (same as _assemble_instruct) while preserving the KoboldCPP memory/prompt
        split for truncation protection.

        When template_format is None, falls back to plain story-mode transcript
        for backward compatibility with completion-era models.
        """
        if template_format:
            return self._assemble_kobold_instruct(
                memory=memory,
                chat_history=chat_history,
                char_name=char_name,
                user_name=user_name,
                template_format=template_format,
                system_instruction=system_instruction,
                compressed_context=compressed_context,
                post_history=post_history,
                continuation_text=continuation_text,
            )
        else:
            return self._assemble_kobold_story(
                memory=memory,
                chat_history=chat_history,
                char_name=char_name,
                user_name=user_name,
                system_instruction=system_instruction,
                compressed_context=compressed_context,
                post_history=post_history,
                continuation_text=continuation_text,
            )

    def _assemble_kobold_instruct(
        self,
        *,
        memory: str,
        chat_history: List[Dict[str, str]],
        char_name: str,
        user_name: str,
        template_format: Dict[str, str],
        system_instruction: str,
        compressed_context: str,
        post_history: str,
        continuation_text: str,
    ) -> AssemblyResult:
        """
        KoboldCPP with instruct template applied.
        Uses the same template formatting as _assemble_instruct, but packs the
        result into KoboldCPP's memory/prompt split for truncation protection.
        """
        # Wrap memory (character card) in template system/user tokens
        memory = self._wrap_memory_for_kobold(
            memory, template_format, system_instruction, char_name, user_name,
        )

        # Format chat history using template (same as instruct path)
        formatted_history = self._format_chat_history(
            chat_history, char_name, user_name, template_format,
        )

        # Build prompt
        prompt = ''
        if compressed_context:
            prompt += f"{compressed_context}\n\n"
        prompt += formatted_history

        # Post-history wrapped in template user format
        if post_history:
            user_fmt = template_format.get('userFormat', '{{content}}')
            wrapped_post = replace_variables(user_fmt, {
                'content': post_history,
                'char': char_name,
                'user': user_name,
            })
            prompt += f"\n{wrapped_post}"

        # Open assistant turn at end of prompt
        output_seq = self._get_output_sequence(template_format, char_name)
        if continuation_text:
            prompt += f"\n{output_seq}{continuation_text}"
        elif output_seq:
            prompt += f"\n{output_seq}"
        else:
            prompt += f"\n{char_name}:"

        if not prompt.strip():
            prompt = output_seq or f"{char_name}:"

        # Stop sequences from template (no </s> for KoboldCPP)
        stop_sequences = self._get_stop_sequences(
            template_format, char_name, user_name,
        )

        return AssemblyResult(
            prompt=prompt,
            memory=memory,
            stop_sequences=stop_sequences,
        )

    def _assemble_kobold_story(
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
        KoboldCPP plain story-mode fallback (no template).
        Preserves the original behavior for completion-era models.
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

    # ── Template Helpers ─────────────────────────────────────────────────

    def _get_output_sequence(
        self,
        template_format: Optional[Dict[str, str]],
        char_name: str,
    ) -> str:
        """
        Get the open assistant turn prefix from a template.

        Uses the explicit outputSequence field if present, otherwise derives
        it by splitting assistantFormat on {{content}} and taking the prefix.
        Falls back to 'CharName:' when no template is available.
        """
        if not template_format:
            return f"{char_name}:"

        # Use explicit outputSequence if present and non-empty
        output_seq = template_format.get('outputSequence')
        if output_seq:
            return replace_variables(output_seq, {'char': char_name, 'user': ''})

        # Derive from assistantFormat by taking everything before {{content}}
        assistant_fmt = template_format.get('assistantFormat', '')
        if '{{content}}' in assistant_fmt:
            prefix = assistant_fmt.split('{{content}}')[0]
            return replace_variables(prefix, {'char': char_name, 'user': ''})

        return f"{char_name}:"

    def _wrap_memory_for_kobold(
        self,
        memory: str,
        template_format: Dict[str, str],
        system_instruction: str,
        char_name: str,
        user_name: str,
    ) -> str:
        """
        Wrap the memory block in template system/user tokens for KoboldCPP.

        For models with a system role: wraps in systemFormat.
        For models without (systemSameAsUser=true): wraps in userFormat.
        System instruction is prepended inside the wrapper.
        """
        # Build content: system instruction + character card memory
        content = memory or ''
        if system_instruction:
            content = f"{system_instruction}\n\n{content}" if content else system_instruction

        # Choose wrapper format
        system_fmt = template_format.get('systemFormat')
        system_same_as_user = template_format.get('systemSameAsUser', False)

        if system_fmt:
            wrapper = system_fmt
        elif system_same_as_user:
            wrapper = template_format.get('userFormat', '{{content}}')
        else:
            wrapper = '{{content}}'

        return replace_variables(wrapper, {
            'content': content,
            'char': char_name,
            'user': user_name,
        })

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
        system_same_as_user = template_format.get('systemSameAsUser', False)

        parts = []
        for msg in processed:
            variables = {
                'content': msg['content'],
                'char': char_name,
                'user': user_name,
            }
            if msg['role'] == 'assistant':
                parts.append(replace_variables(assistant_fmt, variables))
            elif msg['role'] == 'system':
                if system_fmt:
                    parts.append(replace_variables(system_fmt, variables))
                else:
                    # No system format: use user format (explicit via
                    # systemSameAsUser or as default fallback)
                    parts.append(replace_variables(user_fmt, variables))
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

    # ── Character Memory (lightweight) ──────────────────────────────────

    def _build_character_memory(
        self,
        character_data: Optional[Dict],
    ) -> str:
        """
        Build lightweight character memory from card fields.

        Used by legacy endpoints (greeting, impersonate) that don't need
        lore matching, compression, or field expiration. Constructs memory
        from system_prompt + description + personality + scenario.
        """
        if not character_data:
            return ''
        data = character_data.get('data', {})

        context_parts: List[str] = []
        description = data.get('description', '')
        personality = data.get('personality', '')
        scenario = data.get('scenario', '')
        if description:
            context_parts.append(f"Description: {description}")
        if personality:
            context_parts.append(f"Personality: {personality}")
        if scenario:
            context_parts.append(f"Scenario: {scenario}")

        character_context = "\n\n".join(context_parts)

        system_prompt = data.get('system_prompt', '')
        full_memory = ""
        if system_prompt:
            full_memory += system_prompt + "\n\n"
        if character_context:
            full_memory += "Character Data:\n" + character_context

        return full_memory

    # ══════════════════════════════════════════════════════════════════════
    # Phase 4: Legacy Endpoint Assembly Methods
    # ══════════════════════════════════════════════════════════════════════
    #
    # These methods centralize prompt construction for the four legacy
    # generation endpoints, replacing per-endpoint KoboldCPP override blocks
    # and duplicated prompt-building logic.
    #
    # Each returns an AssemblyResult with prompt, memory, stop_sequences.
    # ══════════════════════════════════════════════════════════════════════

    def assemble_greeting(
        self,
        *,
        character_data: Dict,
        generation_instruction: str,
        partial_message: str = '',
        is_kobold: bool = False,
        template_format: Optional[Dict[str, str]] = None,
    ) -> AssemblyResult:
        """
        Assemble prompt for greeting generation.

        Args:
            character_data: Full character card dict
            generation_instruction: The resolved instruction text
            partial_message: Optional partial text to continue from
            is_kobold: Whether the provider is KoboldCPP
            template_format: Active template fields (if any)
        """
        data = character_data.get('data', {})
        name = data.get('name', 'Character')

        # Build memory from character card fields
        memory = self._build_character_memory(character_data)

        if is_kobold and not template_format:
            # Story-mode fallback (no template selected)
            from backend.kobold_prompt_builder import (
                build_story_memory, build_greeting_prompt,
                build_story_stop_sequences,
            )
            memory = build_story_memory(
                character_data, system_instruction=generation_instruction,
            )
            prompt = build_greeting_prompt(name, partial_message)
            stop_sequences = build_story_stop_sequences(name, 'User')

            if memory and not memory.rstrip().endswith('***'):
                memory = memory.rstrip() + '\n***'

            return AssemblyResult(
                prompt=prompt, memory=memory, stop_sequences=stop_sequences,
            )

        # Template-aware path (both instruct providers and KoboldCPP with template)
        if is_kobold and template_format:
            memory = self._wrap_memory_for_kobold(
                memory, template_format, generation_instruction, name, 'User',
            )
        elif generation_instruction:
            memory = f"{generation_instruction}\n\n{memory}" if memory else generation_instruction

        # Build prompt with template output sequence
        output_seq = self._get_output_sequence(template_format, name)
        if partial_message and partial_message.strip():
            # Template sequences include their own spacing; bare name needs a space
            sep = '' if template_format else ' '
            prompt = f"\n{output_seq}{sep}{partial_message}"
        else:
            prompt = f"\n{output_seq}"

        # Stop sequences
        if template_format:
            stop_sequences = self._get_stop_sequences(template_format, name, 'User')
            if not is_kobold and "</s>" not in stop_sequences:
                stop_sequences.append("</s>")
        else:
            stop_sequences = ["User:", "Human:", "</s>", f"\n{name}:", "{{user}}:"]

        return AssemblyResult(
            prompt=prompt, memory=memory, stop_sequences=stop_sequences,
        )

    def assemble_impersonate(
        self,
        *,
        character_data: Dict,
        messages: List[Dict[str, str]],
        generation_instruction: str,
        partial_message: str = '',
        user_name: str = 'User',
        user_persona: str = '',
        is_kobold: bool = False,
        template_format: Optional[Dict[str, str]] = None,
    ) -> AssemblyResult:
        """
        Assemble prompt for impersonation generation.

        Args:
            character_data: Full character card dict
            messages: Chat history messages
            generation_instruction: The resolved impersonate instruction
            partial_message: Optional partial text to continue from
            user_name: User display name
            user_persona: User persona/description text
            is_kobold: Whether the provider is KoboldCPP
            template_format: Active template fields (if any)
        """
        data = character_data.get('data', {})
        char_name = data.get('name', 'Character')

        # Build memory from character card fields
        memory = self._build_character_memory(character_data)

        if is_kobold and not template_format:
            # Story-mode fallback (no template selected)
            from backend.kobold_prompt_builder import (
                build_story_memory, build_impersonate_prompt,
            )
            memory = build_story_memory(
                character_data, system_instruction=generation_instruction,
            )
            prompt = build_impersonate_prompt(
                messages, char_name, user_name, partial_message,
            )
            stop_sequences = [f"{char_name}:", f"\n{char_name}: "]

            if memory and not memory.rstrip().endswith('***'):
                memory = memory.rstrip() + '\n***'

            return AssemblyResult(
                prompt=prompt, memory=memory, stop_sequences=stop_sequences,
            )

        # Template-aware path (both instruct providers and KoboldCPP with template)
        if is_kobold and template_format:
            memory = self._wrap_memory_for_kobold(
                memory, template_format, generation_instruction,
                char_name, user_name,
            )
        else:
            if generation_instruction:
                memory = f"{generation_instruction}\n\n{memory}" if memory else generation_instruction

        # Inject user persona into memory
        if user_persona and user_persona.strip():
            persona_block = f"\n\n[About {user_name}]\n{user_persona.strip()}\n[End About {user_name}]"
            memory = (memory or '') + persona_block

        # Format recent conversation using template if available
        recent = messages[-10:]
        if template_format:
            formatted_history = self._format_chat_history(
                recent, char_name, user_name, template_format,
            )
            prompt = formatted_history
        else:
            chat_history = ""
            for msg in recent:
                role = msg.get('role', 'user')
                content = strip_html_tags(msg.get('content', ''))
                if role == 'assistant':
                    chat_history += f"{char_name}: {content}\n\n"
                elif role == 'user':
                    chat_history += f"{user_name}: {content}\n\n"
            prompt = f"## Recent Conversation:\n{chat_history}"

        # Impersonation: the model writes as the USER
        if template_format:
            # Wrap the instruction in the template's user format for consistency
            user_fmt = template_format.get('userFormat', '{{content}}')
            if partial_message and partial_message.strip():
                instruction = (
                    f"Continue this message from {user_name} "
                    f"(write ONLY the continuation, do not repeat what's already written):"
                    f"\n{user_name}: {partial_message}"
                )
            else:
                instruction = f"Write a response as {user_name}:\n{user_name}:"
            wrapped = replace_variables(user_fmt, {
                'content': instruction,
                'char': char_name,
                'user': user_name,
            })
            prompt += f"\n{wrapped}"
        else:
            if partial_message and partial_message.strip():
                prompt += (
                    f"\n## Continue this message from {user_name} "
                    f"(write ONLY the continuation, do not repeat what's already written):"
                    f"\n{user_name}: {partial_message}"
                )
            else:
                prompt += f"\n## Write a response as {user_name}:\n{user_name}:"

        # Stop sequences
        if template_format:
            stop_sequences = self._get_stop_sequences(template_format, char_name, user_name)
            # Also stop on char name to prevent the model continuing as the character
            if f"{char_name}:" not in stop_sequences:
                stop_sequences.append(f"{char_name}:")
            if not is_kobold and "</s>" not in stop_sequences:
                stop_sequences.append("</s>")
        else:
            stop_sequences = [f"{char_name}:", "</s>", "\n\n"]

        return AssemblyResult(
            prompt=prompt, memory=memory, stop_sequences=stop_sequences,
        )

    def assemble_room_content(
        self,
        *,
        world_context: Dict,
        room_context: Dict,
        field_type: str,
        existing_text: str = '',
        user_prompt: str = '',
        is_kobold: bool = False,
        template_format: Optional[Dict[str, str]] = None,
    ) -> AssemblyResult:
        """
        Assemble prompt for room content generation (description or introduction).

        Centralizes the prompt-building logic from /api/generate-room-content,
        including the KoboldCPP override path.

        Args:
            world_context: Dict with world name, description, etc.
            room_context: Dict with room name, description, npcs list
            field_type: 'description' or 'introduction'
            existing_text: Current text to continue from
            user_prompt: Optional user guidance text
            is_kobold: Whether the provider is KoboldCPP
        """
        # Build memory from world/room context
        world_name = world_context.get('name', 'Unknown World')
        world_description = world_context.get('description', '')
        room_name = room_context.get('name', 'Unknown Room')
        room_description = room_context.get('description', '')
        room_npcs = room_context.get('npcs', [])

        memory_parts: List[str] = []
        memory_parts.append(f"## World: {world_name}")
        if world_description:
            memory_parts.append(f"World Description: {world_description}")
        memory_parts.append(f"\n## Room: {room_name}")
        if room_description and field_type == 'introduction':
            memory_parts.append(f"Room Description: {room_description}")
        if room_npcs:
            npc_names = [npc.get('name', 'Unknown NPC') for npc in room_npcs]
            memory_parts.append(f"NPCs present: {', '.join(npc_names)}")

        memory = "\n".join(memory_parts)

        # Build generation instruction
        if field_type == 'introduction':
            base_instruction = (
                f'You are a creative writer helping to craft an introduction scene '
                f'for a room in a story/roleplay world.\n\n'
                f'The room is "{room_name}" in the world "{world_name}".\n\n'
                f'Write an evocative introduction that:\n'
                f'- Sets the scene and atmosphere\n'
                f'- Describes what the player sees, hears, and feels upon entering\n'
                f'- Hints at the room\'s purpose or history\n'
                f'- Creates immersion without being overly verbose\n\n'
                f'Write in second person perspective (e.g., "You enter...", "You see...").\n'
                f'Keep it to 2-4 paragraphs unless the user requests otherwise.'
            )
        else:  # description
            base_instruction = (
                f'You are a creative writer helping to craft a room description '
                f'for a story/roleplay world.\n\n'
                f'The room is "{room_name}" in the world "{world_name}".\n\n'
                f'Write a detailed description that:\n'
                f'- Captures the physical layout and key features\n'
                f'- Establishes the atmosphere and mood\n'
                f'- Notes important objects or points of interest\n'
                f'- Can be referenced by AI for roleplay context\n\n'
                f'Write in a neutral, informative tone that provides context '
                f'without being a narrative.\n'
                f'Keep it to 2-4 paragraphs unless the user requests otherwise.'
            )

        generation_instruction = base_instruction
        if user_prompt:
            generation_instruction += f"\n\nUser guidance: {user_prompt}"

        if is_kobold and not template_format:
            # Story-mode fallback (no template selected)
            from backend.kobold_prompt_builder import build_room_content_prompt

            kobold_memory = (
                generation_instruction + '\n\n' + memory
                if generation_instruction else memory
            )
            prompt = build_room_content_prompt(field_type, existing_text)
            stop_sequences = ["[END]", "---"]

            if kobold_memory and not kobold_memory.rstrip().endswith('***'):
                kobold_memory = kobold_memory.rstrip() + '\n***'

            return AssemblyResult(
                prompt=prompt, memory=kobold_memory, stop_sequences=stop_sequences,
            )

        # Template-aware path (both instruct providers and KoboldCPP with template)
        if is_kobold and template_format:
            memory = self._wrap_memory_for_kobold(
                memory, template_format, generation_instruction,
                'Assistant', 'User',
            )
        elif generation_instruction:
            memory = f"{generation_instruction}\n\n{memory}"

        # Build the prompt
        if existing_text and existing_text.strip():
            prompt = (
                f"## Continue this {field_type} "
                f"(write ONLY the continuation, do not repeat what's already written):"
                f"\n\n{existing_text}"
            )
        else:
            prompt = f"## Write the {field_type}:\n\n"

        stop_sequences = ["[END]", "---"]
        if not is_kobold:
            stop_sequences.append("</s>")

        return AssemblyResult(
            prompt=prompt, memory=memory, stop_sequences=stop_sequences,
        )

    def assemble_thin_frame(
        self,
        *,
        character_data: Dict,
        is_kobold: bool = False,
        template_format: Optional[Dict[str, str]] = None,
    ) -> AssemblyResult:
        """
        Assemble prompt for NPC thin frame generation.

        Args:
            character_data: Character card data (name, description, personality)
            is_kobold: Whether the provider is KoboldCPP
            template_format: Active template fields (if any)
        """
        data = character_data.get('data', character_data)
        name = data.get('name', 'Unknown')
        description = data.get('description', '')
        personality = data.get('personality', '')

        generation_instruction = (
            'You are analyzing a character to extract their core identity traits.\n'
            'Output ONLY a JSON object with these exact fields:\n'
            '{\n'
            '  "archetype": "2-3 word character type (e.g., \'gruff blacksmith\', \'mysterious sage\')",\n'
            '  "key_traits": ["trait1", "trait2", "trait3"],\n'
            '  "speaking_style": "how they talk (e.g., \'formal, archaic\', \'casual, uses slang\')",\n'
            '  "motivation": "what drives them in one sentence",\n'
            '  "appearance_hook": "their most memorable visual detail"\n'
            '}\n\n'
            'Rules:\n'
            '- archetype: Maximum 3 words, captures their role/demeanor\n'
            '- key_traits: Exactly 3 personality traits, one word each\n'
            '- speaking_style: How they speak, not what they say\n'
            '- motivation: Their primary goal or drive\n'
            '- appearance_hook: One distinctive physical feature or look\n\n'
            'Output ONLY the JSON object, no other text.'
        )

        character_context = (
            f"Character: {name}\n\n"
            f"Description:\n"
            f"{description[:1500] if description else 'No description provided.'}\n\n"
            f"Personality:\n"
            f"{personality[:1500] if personality else 'No personality provided.'}"
        )

        prompt = f"{character_context}\n\nJSON:"

        if is_kobold and template_format:
            memory = self._wrap_memory_for_kobold(
                '', template_format, generation_instruction, name, 'User',
            )
        elif is_kobold:
            memory = generation_instruction
            if memory and not memory.rstrip().endswith('***'):
                memory = memory.rstrip() + '\n***'
        else:
            memory = generation_instruction

        stop_sequences = ["\n\n\n", "```\n\n"]
        if not is_kobold:
            stop_sequences.append("</s>")

        return AssemblyResult(
            prompt=prompt, memory=memory, stop_sequences=stop_sequences,
        )
