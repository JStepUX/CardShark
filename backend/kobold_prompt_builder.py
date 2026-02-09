"""
@file kobold_prompt_builder.py
@description Builds story-mode prompts for KoboldCPP's raw completion endpoint.
             KoboldCPP expects plain text (no instruct tokens, no ChatML, no markdown headers).
             This module converts structured character/chat data into clean story-mode payloads.
@consumers api_handler.py, generation_endpoints.py
"""
import re
from typing import Dict, List, Optional


def is_kobold_provider(api_config: dict) -> bool:
    """Returns True if the configured provider is KoboldCPP."""
    return api_config.get('provider', '') == 'KoboldCPP'


def build_story_memory(character_data: dict, system_instruction: Optional[str] = None) -> str:
    """Build KoboldCPP memory block from character card fields.

    Assembles description, personality, scenario, system_prompt, and mes_example
    into a plain-text memory block. Only includes non-empty fields.
    Folds system_instruction as narrative framing (not literal instructions).
    Does NOT append the *** separator — that happens after lore integration.

    Args:
        character_data: Character card dict with 'data' sub-dict
        system_instruction: Optional generation instruction to fold in as narrative context
    """
    data = character_data.get('data', {}) if character_data else {}

    parts: List[str] = []

    system_prompt = data.get('system_prompt', '')
    if system_prompt and system_prompt.strip():
        parts.append(system_prompt.strip())

    description = data.get('description', '')
    if description and description.strip():
        parts.append(f"Persona: {description.strip()}")

    personality = data.get('personality', '')
    if personality and personality.strip():
        parts.append(f"Personality: {personality.strip()}")

    scenario = data.get('scenario', '')
    if scenario and scenario.strip():
        parts.append(f"Scenario: {scenario.strip()}")

    mes_example = data.get('mes_example', '')
    if mes_example and mes_example.strip():
        parts.append(mes_example.strip())

    # Fold system_instruction as narrative framing
    if system_instruction and system_instruction.strip():
        parts.insert(0, system_instruction.strip())

    return '\n\n'.join(parts)


def _strip_html(text: str) -> str:
    """Strip HTML tags from text, converting common elements to plain text."""
    if not text:
        return ''
    # Replace <br> / <br/> with newlines
    text = re.sub(r'<br\s*/?\s*>', '\n', text, flags=re.IGNORECASE)
    # Replace </p> with newlines
    text = re.sub(r'</p>', '\n', text, flags=re.IGNORECASE)
    # Strip all remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Decode common HTML entities
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    text = text.replace('&quot;', '"').replace('&#39;', "'").replace('&nbsp;', ' ')
    # Collapse excessive blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def build_story_prompt(chat_history: List[dict], char_name: str, user_name: str = 'User') -> str:
    """Format raw chat messages as a plain-text transcript for KoboldCPP.

    Output format:
        User: message content
        CharName: message content
        CharName:

    Strips HTML from message content (rich text editor may include HTML).

    Args:
        chat_history: List of message dicts with 'role' and 'content' keys
        char_name: Character name for assistant messages
        user_name: User name for user messages
    """
    lines: List[str] = []

    for msg in chat_history:
        role = msg.get('role', 'user')
        content = _strip_html(msg.get('content', ''))
        if not content:
            continue

        if role == 'assistant':
            lines.append(f"{char_name}: {content}")
        elif role == 'user':
            lines.append(f"{user_name}: {content}")
        elif role == 'system':
            # System messages become unmarked context lines
            lines.append(content)

    # End with the character's turn marker so the model continues as the character
    lines.append(f"{char_name}:")

    return '\n'.join(lines)


def build_story_stop_sequences(char_name: str, user_name: str = 'User') -> list:
    """Return clean stop sequences for KoboldCPP story mode.

    No </s>, no {{user}}:, no ChatML tokens.
    """
    return [
        f"{user_name}:",
        f"\n{user_name} ",
        f"\n{char_name}: ",
    ]


def build_greeting_prompt(char_name: str, partial_message: str = '') -> str:
    """Build a greeting generation prompt for KoboldCPP.

    Args:
        char_name: Character name
        partial_message: Optional partial text to continue from
    """
    if partial_message and partial_message.strip():
        return f"\n{char_name}: {partial_message}"
    return f"\n{char_name}:"


def build_impersonate_prompt(
    messages: List[dict],
    char_name: str,
    user_name: str = 'User',
    partial_message: str = ''
) -> str:
    """Build an impersonation prompt as plain transcript for KoboldCPP.

    Formats last N messages as plain transcript ending with the user's turn marker.
    No ## headers, no markdown.

    Args:
        messages: Chat history messages
        char_name: Character name
        user_name: User name
        partial_message: Optional partial text to continue from
    """
    lines: List[str] = []

    # Use last 10 messages for context
    for msg in messages[-10:]:
        role = msg.get('role', 'user')
        content = _strip_html(msg.get('content', ''))
        if not content:
            continue

        if role == 'assistant':
            lines.append(f"{char_name}: {content}")
        elif role == 'user':
            lines.append(f"{user_name}: {content}")

    # End with user's turn marker
    if partial_message and partial_message.strip():
        lines.append(f"{user_name}: {partial_message}")
    else:
        lines.append(f"{user_name}:")

    return '\n'.join(lines)


def build_room_content_prompt(field_type: str, existing_text: str = '') -> str:
    """Build a room content generation prompt without markdown headers.

    Args:
        field_type: 'description' or 'introduction'
        existing_text: Existing text to continue from
    """
    if existing_text and existing_text.strip():
        return f"Continue this {field_type}:\n\n{existing_text}"
    return f"Write the {field_type}:\n\n"


def clean_memory(memory: str) -> str:
    """Strip instruct tokens and empty labeled lines from memory text.

    The frontend template system applies memoryFormat from templates.json before
    sending to the backend. For non-KoboldCPP providers this is correct — they
    need instruct framing. But KoboldCPP's raw completion endpoint expects plain
    story text. This function strips all instruct tokens so the model sees clean
    context instead of mixed signals.

    Why each token family is stripped (source: frontend/src/config/templates.json):

        Format          Tokens stripped                          Templates using it
        ──────────────  ──────────────────────────────────────  ──────────────────────
        Mistral         [INST] [/INST] [SYSTEM_PROMPT]          Mistral V1, V2, Tekken
        Llama 2         <<SYS>> <</SYS>>                        Llama 2 Chat
        ChatML          <|im_start|> <|im_end|> <|im_sep|>      ChatML, Gemma2, Hermes
        Llama 3         <|start_header_id|> <|end_header_id|>   Llama 3 Instruct
                        <|eot_id|> <|begin_of_text|>
        Alpaca          ### Instruction: ### Response:           Alpaca

    Also removes empty labeled lines (e.g., 'Personality: ' when field is empty)
    left over after lore integration fills some fields but not others.
    """
    if not memory:
        return ''

    # Strip instruct format tokens that the frontend template may have injected
    # Mistral/Llama instruct
    memory = memory.replace('[INST]', '').replace('[/INST]', '')
    memory = memory.replace('[SYSTEM_PROMPT]', '').replace('[/SYSTEM_PROMPT]', '')
    # Llama 2
    memory = memory.replace('<<SYS>>', '').replace('<</SYS>>', '')
    # ChatML / Gemma2
    memory = re.sub(r'<\|im_start\|>\s*(?:system|user|assistant)\s*\n?', '', memory)
    memory = memory.replace('<|im_end|>', '')
    memory = memory.replace('<|im_sep|>', '')
    # Alpaca/generic instruct
    memory = re.sub(r'^### (?:Instruction|Response|Input):\s*$', '', memory, flags=re.MULTILINE)
    # Llama 3
    memory = re.sub(r'<\|(?:begin|end)_of_text\|>', '', memory)
    memory = re.sub(r'<\|start_header_id\|>.*?<\|end_header_id\|>\s*\n?', '', memory)
    memory = memory.replace('<|eot_id|>', '')

    lines = memory.split('\n')
    cleaned: List[str] = []

    for line in lines:
        # Match patterns like "Label: " with nothing after the colon+space
        if re.match(r'^(Persona|Personality|Scenario|Description):\s*$', line, re.IGNORECASE):
            continue
        cleaned.append(line)

    result = '\n'.join(cleaned)
    # Collapse excessive blank lines left by removal
    result = re.sub(r'\n{3,}', '\n\n', result)
    return result.strip()


def fold_system_instruction(system_instruction: str, memory: str) -> str:
    """Fold a system instruction into memory as narrative framing.

    Places the instruction at the top of memory so KoboldCPP treats it as
    context rather than a literal instruction to echo.

    Args:
        system_instruction: The generation instruction text
        memory: Existing memory text
    """
    if not system_instruction or not system_instruction.strip():
        return memory

    instruction = system_instruction.strip()
    if memory and memory.strip():
        return f"{instruction}\n\n{memory}"
    return instruction


def extract_block(text: str, start_marker: str, end_marker: str) -> str:
    """Extract a text block between markers from a prompt string.

    Used to preserve session notes and compressed context when rebuilding prompts.

    Args:
        text: The full prompt text to search
        start_marker: Start of the block (e.g., '[Session Notes]')
        end_marker: End of the block (e.g., '[End Session Notes]')

    Returns:
        The content between markers, or empty string if not found
    """
    if not text:
        return ''

    start_idx = text.find(start_marker)
    if start_idx == -1:
        return ''

    # Find content after the start marker
    content_start = start_idx + len(start_marker)
    end_idx = text.find(end_marker, content_start)

    if end_idx == -1:
        return ''

    return text[content_start:end_idx].strip()
