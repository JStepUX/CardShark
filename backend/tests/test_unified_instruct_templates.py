"""Tests for unified instruct template system.

Covers the new template-aware KoboldCPP paths introduced by the
unified-instruct-templates spec:
- _get_output_sequence() derivation and fallback
- _wrap_memory_for_kobold() with various template families
- _format_chat_history() with systemSameAsUser
- _assemble_kobold() template-aware vs story-mode fallback
- _assemble_instruct() outputSequence usage
- Legacy endpoint template threading (greeting, impersonate, room_content, thin_frame)
- ThinkingTagFilter Gemma 4 channel format
"""

import pytest

from backend.services.prompt_assembly_service import (
    PromptAssemblyService,
    AssemblyResult,
    replace_variables,
)
from backend.api_handler import ThinkingTagFilter


# ── Fixtures ─────────────────────────────────────────────────────────────────

class FakeLogger:
    def log_step(self, msg): pass
    def log_error(self, msg): pass
    def log_warning(self, msg): pass
    def log_info(self, msg): pass


@pytest.fixture
def asm():
    return PromptAssemblyService(FakeLogger())


# ── Template fixtures ────────────────────────────────────────────────────────

CHATML_TEMPLATE = {
    'userFormat': '<|im_start|>user\n{{content}}<|im_end|>\n',
    'assistantFormat': '<|im_start|>assistant\n{{char}}: {{content}}<|im_end|>\n',
    'systemFormat': '<|im_start|>system\n{{content}}<|im_end|>\n',
    'outputSequence': '<|im_start|>assistant\n',
    'stopSequences': ['<|im_end|>'],
}

GEMMA4_TEMPLATE = {
    'userFormat': '<|turn>user\n{{content}}<turn|>\n',
    'assistantFormat': '<|turn>model\n{{char}}: {{content}}<turn|>\n',
    'systemFormat': '<|turn>system\n{{content}}<turn|>\n',
    'outputSequence': '<|turn>model\n',
    'stopSequences': ['<|turn>', '<turn|>', '{{user}}:'],
}

GEMMA2_TEMPLATE = {
    'userFormat': '<start_of_turn>user\n{{content}}<end_of_turn>\n',
    'assistantFormat': '<start_of_turn>model\n{{char}}: {{content}}<end_of_turn>\n',
    'systemFormat': None,
    'systemSameAsUser': True,
    'outputSequence': '<start_of_turn>model\n',
    'stopSequences': ['<start_of_turn>', '<end_of_turn>'],
}

MISTRAL_TEMPLATE = {
    'userFormat': '[INST]{{content}}[/INST]\n',
    'assistantFormat': '{{char}}: {{content}}</s>',
    'systemFormat': '[INST]{{content}}[/INST]\n',
    'outputSequence': '',  # empty — should derive from assistantFormat
    'stopSequences': ['[INST]', '{{user}}:'],
}

SAMPLE_CHARACTER_DATA = {
    'data': {
        'name': 'Aria',
        'description': 'A mysterious elven ranger.',
        'personality': 'Brave and curious.',
        'scenario': 'The forest is burning.',
        'system_prompt': 'You are Aria.',
        'first_mes': 'Hello, traveler.',
    }
}

SAMPLE_MESSAGES = [
    {'role': 'user', 'content': 'Hello there.'},
    {'role': 'assistant', 'content': 'Greetings, traveler.'},
    {'role': 'user', 'content': 'How are you?'},
]


# ══════════════════════════════════════════════════════════════════════════════
# _get_output_sequence
# ══════════════════════════════════════════════════════════════════════════════

class TestGetOutputSequence:

    def test_no_template_returns_name_colon(self, asm):
        assert asm._get_output_sequence(None, 'Aria') == 'Aria:'

    def test_explicit_output_sequence(self, asm):
        result = asm._get_output_sequence(CHATML_TEMPLATE, 'Aria')
        assert result == '<|im_start|>assistant\n'

    def test_gemma4_output_sequence(self, asm):
        result = asm._get_output_sequence(GEMMA4_TEMPLATE, 'Aria')
        assert result == '<|turn>model\n'

    def test_empty_output_sequence_derives_from_assistant_format(self, asm):
        """P1 regression: empty string should not suppress the prefix."""
        result = asm._get_output_sequence(MISTRAL_TEMPLATE, 'Aria')
        assert result == 'Aria: '  # derived from '{{char}}: {{content}}</s>'

    def test_resolves_char_variable(self, asm):
        template = {
            'userFormat': '{{content}}',
            'assistantFormat': '{{char}} says: {{content}}',
            'outputSequence': '{{char}} says: ',
        }
        assert asm._get_output_sequence(template, 'Bob') == 'Bob says: '

    def test_derives_from_assistant_format_when_no_output_sequence(self, asm):
        template = {
            'userFormat': '{{content}}',
            'assistantFormat': '[ASSISTANT]{{char}}: {{content}}[/ASSISTANT]',
        }
        result = asm._get_output_sequence(template, 'Aria')
        assert result == '[ASSISTANT]Aria: '


# ══════════════════════════════════════════════════════════════════════════════
# _wrap_memory_for_kobold
# ══════════════════════════════════════════════════════════════════════════════

class TestWrapMemoryForKobold:

    def test_chatml_system_format(self, asm):
        result = asm._wrap_memory_for_kobold(
            'card content', CHATML_TEMPLATE, '', 'Aria', 'User',
        )
        assert result.startswith('<|im_start|>system\n')
        assert 'card content' in result
        assert result.endswith('<|im_end|>\n')

    def test_gemma2_system_same_as_user(self, asm):
        result = asm._wrap_memory_for_kobold(
            'card content', GEMMA2_TEMPLATE, '', 'Aria', 'User',
        )
        assert result.startswith('<start_of_turn>user\n')
        assert 'card content' in result
        assert '<end_of_turn>' in result

    def test_system_instruction_prepended_inside_wrapper(self, asm):
        result = asm._wrap_memory_for_kobold(
            'card content', CHATML_TEMPLATE, 'Be helpful.', 'Aria', 'User',
        )
        assert '<|im_start|>system\n' in result
        assert 'Be helpful.' in result
        assert 'card content' in result
        # Instruction should come before card content inside the wrapper
        assert result.index('Be helpful.') < result.index('card content')

    def test_gemma4_system_format(self, asm):
        result = asm._wrap_memory_for_kobold(
            'card content', GEMMA4_TEMPLATE, '', 'Aria', 'User',
        )
        assert result.startswith('<|turn>system\n')
        assert result.endswith('<turn|>\n')


# ══════════════════════════════════════════════════════════════════════════════
# _format_chat_history with systemSameAsUser
# ══════════════════════════════════════════════════════════════════════════════

class TestFormatChatHistorySystemSameAsUser:

    def test_system_message_uses_system_format_when_available(self, asm):
        messages = [{'role': 'system', 'content': 'system msg'}]
        result = asm._format_chat_history(messages, 'Aria', 'User', CHATML_TEMPLATE)
        assert '<|im_start|>system\n' in result

    def test_system_message_uses_user_format_when_system_same_as_user(self, asm):
        messages = [{'role': 'system', 'content': 'system msg'}]
        result = asm._format_chat_history(messages, 'Aria', 'User', GEMMA2_TEMPLATE)
        assert '<start_of_turn>user\n' in result
        assert 'system msg' in result

    def test_system_message_falls_back_to_user_when_no_system_format(self, asm):
        template = {
            'userFormat': '[U]{{content}}[/U]',
            'assistantFormat': '[A]{{content}}[/A]',
            'systemFormat': '',  # empty = falsy
        }
        messages = [{'role': 'system', 'content': 'hello'}]
        result = asm._format_chat_history(messages, 'Aria', 'User', template)
        assert '[U]hello[/U]' in result


# ══════════════════════════════════════════════════════════════════════════════
# _assemble_kobold: template-aware vs story-mode
# ══════════════════════════════════════════════════════════════════════════════

class TestAssembleKobold:

    def test_story_mode_fallback_when_no_template(self, asm):
        """With template_format=None, output should be plain story-mode."""
        result = asm._assemble_kobold(
            memory='card memory', chat_history=SAMPLE_MESSAGES,
            char_name='Aria', user_name='User', template_format=None,
            system_instruction='', compressed_context='',
            post_history='', continuation_text='',
        )
        assert '***' in result.memory
        assert 'User:' in result.prompt  # plain transcript format
        assert '<|im_start|>' not in result.prompt  # no instruct tokens

    def test_template_mode_wraps_memory(self, asm):
        result = asm._assemble_kobold(
            memory='card memory', chat_history=SAMPLE_MESSAGES,
            char_name='Aria', user_name='User', template_format=CHATML_TEMPLATE,
            system_instruction='', compressed_context='',
            post_history='', continuation_text='',
        )
        assert '<|im_start|>system\n' in result.memory
        assert '***' not in result.memory  # no story-mode separator

    def test_template_mode_formats_history(self, asm):
        result = asm._assemble_kobold(
            memory='card memory', chat_history=SAMPLE_MESSAGES,
            char_name='Aria', user_name='User', template_format=CHATML_TEMPLATE,
            system_instruction='', compressed_context='',
            post_history='', continuation_text='',
        )
        assert '<|im_start|>user\n' in result.prompt
        assert '<|im_start|>assistant\n' in result.prompt

    def test_template_mode_ends_with_output_sequence(self, asm):
        result = asm._assemble_kobold(
            memory='card memory', chat_history=SAMPLE_MESSAGES,
            char_name='Aria', user_name='User', template_format=CHATML_TEMPLATE,
            system_instruction='', compressed_context='',
            post_history='', continuation_text='',
        )
        assert result.prompt.rstrip().endswith('<|im_start|>assistant')

    def test_template_mode_derives_stop_sequences(self, asm):
        result = asm._assemble_kobold(
            memory='card memory', chat_history=SAMPLE_MESSAGES,
            char_name='Aria', user_name='User', template_format=CHATML_TEMPLATE,
            system_instruction='', compressed_context='',
            post_history='', continuation_text='',
        )
        assert '<|im_end|>' in result.stop_sequences
        assert '</s>' not in result.stop_sequences  # KoboldCPP: no </s>

    def test_gemma4_template(self, asm):
        result = asm._assemble_kobold(
            memory='card memory', chat_history=SAMPLE_MESSAGES,
            char_name='Aria', user_name='User', template_format=GEMMA4_TEMPLATE,
            system_instruction='Be creative.', compressed_context='',
            post_history='', continuation_text='',
        )
        assert '<|turn>system\n' in result.memory
        assert 'Be creative.' in result.memory
        assert '<|turn>user\n' in result.prompt
        assert '<|turn>model\n' in result.prompt

    def test_continuation_text_appended(self, asm):
        result = asm._assemble_kobold(
            memory='card', chat_history=SAMPLE_MESSAGES,
            char_name='Aria', user_name='User', template_format=CHATML_TEMPLATE,
            system_instruction='', compressed_context='',
            post_history='', continuation_text='The wind',
        )
        assert 'The wind' in result.prompt


# ══════════════════════════════════════════════════════════════════════════════
# _assemble_instruct: outputSequence
# ══════════════════════════════════════════════════════════════════════════════

class TestAssembleInstructOutputSequence:

    def test_uses_output_sequence_for_generation_stub(self, asm):
        result = asm._assemble_instruct(
            memory='test', chat_history=SAMPLE_MESSAGES,
            char_name='Aria', user_name='User', template_format=CHATML_TEMPLATE,
            system_instruction='', compressed_context='',
            post_history='', continuation_text='', has_character=True,
        )
        assert '<|im_start|>assistant\n' in result.prompt

    def test_no_template_continuation_has_space(self, asm):
        """P3 regression: continuation must have space after name colon."""
        result = asm._assemble_instruct(
            memory='test', chat_history=[], char_name='Aria', user_name='User',
            template_format=None, system_instruction='', compressed_context='',
            post_history='', continuation_text='continued text', has_character=True,
        )
        assert 'Aria: continued text' in result.prompt

    def test_mistral_empty_output_sequence_derives_prefix(self, asm):
        """P1 regression: empty outputSequence should derive, not suppress."""
        result = asm._assemble_instruct(
            memory='test', chat_history=[], char_name='Aria', user_name='User',
            template_format=MISTRAL_TEMPLATE, system_instruction='',
            compressed_context='', post_history='',
            continuation_text='', has_character=True,
        )
        # Should contain 'Aria:' derived from assistantFormat, not just '\n'
        assert 'Aria:' in result.prompt


# ══════════════════════════════════════════════════════════════════════════════
# Legacy endpoints: template threading
# ══════════════════════════════════════════════════════════════════════════════

class TestLegacyEndpointTemplateThreading:

    def test_greeting_kobold_with_template(self, asm):
        result = asm.assemble_greeting(
            character_data=SAMPLE_CHARACTER_DATA,
            generation_instruction='Generate a greeting.',
            is_kobold=True,
            template_format=CHATML_TEMPLATE,
        )
        # Memory should be template-wrapped, not story-mode
        assert '<|im_start|>' in result.memory
        assert '***' not in result.memory

    def test_greeting_kobold_without_template(self, asm):
        result = asm.assemble_greeting(
            character_data=SAMPLE_CHARACTER_DATA,
            generation_instruction='Generate a greeting.',
            is_kobold=True,
            template_format=None,
        )
        # Should use story-mode
        assert '***' in result.memory

    def test_impersonate_template_wraps_instruction(self, asm):
        """P2 regression: instruction should be in template format, not raw markdown."""
        result = asm.assemble_impersonate(
            character_data=SAMPLE_CHARACTER_DATA,
            messages=SAMPLE_MESSAGES,
            generation_instruction='Write as User.',
            is_kobold=False,
            template_format=CHATML_TEMPLATE,
        )
        assert '## Write a response' not in result.prompt
        assert '<|im_start|>user\n' in result.prompt
        assert 'Write a response as User:' in result.prompt

    def test_room_content_kobold_with_template(self, asm):
        result = asm.assemble_room_content(
            world_context={'name': 'Testworld', 'description': 'A world.'},
            room_context={'name': 'Tavern', 'description': 'A tavern.', 'npcs': []},
            field_type='description',
            is_kobold=True,
            template_format=CHATML_TEMPLATE,
        )
        assert '<|im_start|>' in result.memory
        assert '***' not in result.memory

    def test_thin_frame_kobold_with_template(self, asm):
        result = asm.assemble_thin_frame(
            character_data=SAMPLE_CHARACTER_DATA,
            is_kobold=True,
            template_format=CHATML_TEMPLATE,
        )
        assert '<|im_start|>' in result.memory
        assert '***' not in result.memory


# ══════════════════════════════════════════════════════════════════════════════
# ThinkingTagFilter: Gemma 4 channel format
# ══════════════════════════════════════════════════════════════════════════════

class TestThinkingTagFilterGemma4:

    def test_xml_tags_still_work(self):
        f = ThinkingTagFilter()
        result = f.process('Hello <think>reasoning</think> world')
        result += f.flush()
        assert result == 'Hello  world'

    def test_gemma4_channel_streaming(self):
        f = ThinkingTagFilter()
        result = f.process('Hello ')
        result += f.process('<|channel>thought')
        result += f.process(' let me think...')
        result += f.process('<channel|>')
        result += f.process(' world')
        result += f.flush()
        assert result == 'Hello  world'

    def test_gemma4_channel_one_shot(self):
        text = 'Hello <|channel>thought reasoning here<channel|> world'
        assert ThinkingTagFilter.strip_thinking_tags(text) == 'Hello  world'

    def test_mixed_tag_families(self):
        text = '<think>xml</think>Hello<|channel>thought gemma<channel|> world'
        assert ThinkingTagFilter.strip_thinking_tags(text) == 'Hello world'

    def test_no_false_positives_on_angle_brackets(self):
        f = ThinkingTagFilter()
        result = f.process('a < b and c > d')
        result += f.flush()
        assert result == 'a < b and c > d'

    def test_partial_gemma4_tag_buffered(self):
        """Partial channel tag should buffer, not emit prematurely."""
        f = ThinkingTagFilter()
        result = f.process('Hello <|chann')
        # Should buffer — the partial tag could become <|channel>thought
        result += f.process('el>thought hidden content<channel|> world')
        result += f.flush()
        assert result == 'Hello  world'
