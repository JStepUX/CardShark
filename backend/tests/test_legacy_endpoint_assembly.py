"""Tests for Phase 4 legacy endpoint assembly methods in PromptAssemblyService.

Tests the four new assembly methods:
- assemble_greeting()
- assemble_impersonate()
- assemble_room_content()
- assemble_thin_frame()

Each method is tested for both instruct mode (non-KoboldCPP) and KoboldCPP story mode,
verifying prompt structure, memory construction, and stop sequences.
"""

import pytest

from backend.services.prompt_assembly_service import (
    PromptAssemblyService,
    AssemblyResult,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────

class FakeLogger:
    """Minimal logger for tests."""
    def log_step(self, msg): pass
    def log_error(self, msg): pass
    def log_warning(self, msg): pass
    def log_info(self, msg): pass


@pytest.fixture
def logger():
    return FakeLogger()


@pytest.fixture
def assembler(logger):
    return PromptAssemblyService(logger)


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

SAMPLE_CHARACTER_DATA_MINIMAL = {
    'data': {
        'name': 'NPC',
    }
}


# ══════════════════════════════════════════════════════════════════════════════
# assemble_greeting
# ══════════════════════════════════════════════════════════════════════════════

class TestAssembleGreeting:
    """Tests for greeting assembly."""

    def test_instruct_basic_prompt(self, assembler):
        """Instruct mode: bare turn marker when no partial message."""
        result = assembler.assemble_greeting(
            character_data=SAMPLE_CHARACTER_DATA,
            generation_instruction='Generate a greeting for Aria.',
            is_kobold=False,
        )
        assert isinstance(result, AssemblyResult)
        assert result.prompt == '\nAria:'
        assert 'Generate a greeting for Aria.' in result.memory
        assert 'You are Aria.' in result.memory
        assert 'Description: A mysterious elven ranger.' in result.memory

    def test_instruct_partial_message(self, assembler):
        """Instruct mode: continue from partial message."""
        result = assembler.assemble_greeting(
            character_data=SAMPLE_CHARACTER_DATA,
            generation_instruction='Generate a greeting.',
            partial_message='The wind howls',
            is_kobold=False,
        )
        assert 'Aria: The wind howls' in result.prompt

    def test_instruct_stop_sequences(self, assembler):
        """Instruct mode: standard greeting stop sequences."""
        result = assembler.assemble_greeting(
            character_data=SAMPLE_CHARACTER_DATA,
            generation_instruction='test',
            is_kobold=False,
        )
        assert 'User:' in result.stop_sequences
        assert 'Human:' in result.stop_sequences
        assert '</s>' in result.stop_sequences

    def test_instruct_memory_includes_system_prompt(self, assembler):
        """Instruct mode: system_prompt from card and instruction both in memory."""
        result = assembler.assemble_greeting(
            character_data=SAMPLE_CHARACTER_DATA,
            generation_instruction='My instruction.',
            is_kobold=False,
        )
        assert 'My instruction.' in result.memory
        assert 'You are Aria.' in result.memory

    def test_kobold_uses_story_memory(self, assembler):
        """KoboldCPP: uses build_story_memory with system_instruction folded."""
        result = assembler.assemble_greeting(
            character_data=SAMPLE_CHARACTER_DATA,
            generation_instruction='Generate greeting.',
            is_kobold=True,
        )
        assert isinstance(result, AssemblyResult)
        # KoboldCPP memory should contain the instruction folded in
        assert 'Generate greeting.' in result.memory
        # Should have *** separator
        assert '***' in result.memory

    def test_kobold_greeting_prompt(self, assembler):
        """KoboldCPP: greeting prompt is clean turn marker."""
        result = assembler.assemble_greeting(
            character_data=SAMPLE_CHARACTER_DATA,
            generation_instruction='test',
            is_kobold=True,
        )
        assert 'Aria:' in result.prompt

    def test_kobold_partial_message_prompt(self, assembler):
        """KoboldCPP: partial message appears in prompt."""
        result = assembler.assemble_greeting(
            character_data=SAMPLE_CHARACTER_DATA,
            generation_instruction='test',
            partial_message='Once upon',
            is_kobold=True,
        )
        assert 'Once upon' in result.prompt

    def test_kobold_stop_sequences_clean(self, assembler):
        """KoboldCPP: no ChatML tokens or </s> in stop sequences."""
        result = assembler.assemble_greeting(
            character_data=SAMPLE_CHARACTER_DATA,
            generation_instruction='test',
            is_kobold=True,
        )
        assert '</s>' not in result.stop_sequences
        assert '<|im_end|>' not in ''.join(result.stop_sequences)

    def test_minimal_character(self, assembler):
        """Works with minimal character data (name only)."""
        result = assembler.assemble_greeting(
            character_data=SAMPLE_CHARACTER_DATA_MINIMAL,
            generation_instruction='test',
            is_kobold=False,
        )
        assert 'NPC:' in result.prompt


# ══════════════════════════════════════════════════════════════════════════════
# assemble_impersonate
# ══════════════════════════════════════════════════════════════════════════════

class TestAssembleImpersonate:
    """Tests for impersonation assembly."""

    SAMPLE_MESSAGES = [
        {'role': 'user', 'content': 'Hello Aria'},
        {'role': 'assistant', 'content': 'Greetings, traveler.'},
        {'role': 'user', 'content': 'How are you?'},
        {'role': 'assistant', 'content': 'I am well.'},
    ]

    def test_instruct_basic(self, assembler):
        """Instruct mode: prompt includes recent conversation and turn marker."""
        result = assembler.assemble_impersonate(
            character_data=SAMPLE_CHARACTER_DATA,
            messages=self.SAMPLE_MESSAGES,
            generation_instruction='Write as User.',
            user_name='User',
            is_kobold=False,
        )
        assert '## Recent Conversation:' in result.prompt
        assert 'User: Hello Aria' in result.prompt
        assert 'Aria: Greetings, traveler.' in result.prompt
        assert '## Write a response as User:' in result.prompt
        assert result.prompt.rstrip().endswith('User:')

    def test_instruct_partial_message(self, assembler):
        """Instruct mode: continue from partial message."""
        result = assembler.assemble_impersonate(
            character_data=SAMPLE_CHARACTER_DATA,
            messages=self.SAMPLE_MESSAGES,
            generation_instruction='Write as User.',
            partial_message='I think',
            user_name='User',
            is_kobold=False,
        )
        assert 'User: I think' in result.prompt
        assert 'write ONLY the continuation' in result.prompt

    def test_instruct_stop_sequences(self, assembler):
        """Instruct mode: stops on character name."""
        result = assembler.assemble_impersonate(
            character_data=SAMPLE_CHARACTER_DATA,
            messages=self.SAMPLE_MESSAGES,
            generation_instruction='test',
            user_name='User',
            is_kobold=False,
        )
        assert 'Aria:' in result.stop_sequences
        assert '</s>' in result.stop_sequences

    def test_instruct_memory(self, assembler):
        """Instruct mode: memory includes instruction and character context."""
        result = assembler.assemble_impersonate(
            character_data=SAMPLE_CHARACTER_DATA,
            messages=self.SAMPLE_MESSAGES,
            generation_instruction='Be natural.',
            user_name='User',
            is_kobold=False,
        )
        assert 'Be natural.' in result.memory
        assert 'You are Aria.' in result.memory

    def test_kobold_uses_story_format(self, assembler):
        """KoboldCPP: prompt is plain transcript without markdown headers."""
        result = assembler.assemble_impersonate(
            character_data=SAMPLE_CHARACTER_DATA,
            messages=self.SAMPLE_MESSAGES,
            generation_instruction='Write as User.',
            user_name='User',
            is_kobold=True,
        )
        # KoboldCPP impersonate prompt should NOT have ## headers
        assert '##' not in result.prompt
        # Should end with User: turn marker
        assert 'User:' in result.prompt

    def test_kobold_stop_sequences(self, assembler):
        """KoboldCPP: stops only on character name patterns."""
        result = assembler.assemble_impersonate(
            character_data=SAMPLE_CHARACTER_DATA,
            messages=self.SAMPLE_MESSAGES,
            generation_instruction='test',
            user_name='User',
            is_kobold=True,
        )
        assert 'Aria:' in result.stop_sequences
        assert '</s>' not in result.stop_sequences

    def test_kobold_memory_separator(self, assembler):
        """KoboldCPP: memory ends with *** separator."""
        result = assembler.assemble_impersonate(
            character_data=SAMPLE_CHARACTER_DATA,
            messages=self.SAMPLE_MESSAGES,
            generation_instruction='test',
            user_name='User',
            is_kobold=True,
        )
        assert '***' in result.memory

    def test_empty_messages(self, assembler):
        """Works with empty message list."""
        result = assembler.assemble_impersonate(
            character_data=SAMPLE_CHARACTER_DATA,
            messages=[],
            generation_instruction='test',
            user_name='User',
            is_kobold=False,
        )
        assert 'User:' in result.prompt

    def test_custom_user_name(self, assembler):
        """Uses provided user_name in prompt construction."""
        result = assembler.assemble_impersonate(
            character_data=SAMPLE_CHARACTER_DATA,
            messages=self.SAMPLE_MESSAGES,
            generation_instruction='test',
            user_name='Alice',
            is_kobold=False,
        )
        assert 'Alice:' in result.prompt


# ══════════════════════════════════════════════════════════════════════════════
# assemble_room_content
# ══════════════════════════════════════════════════════════════════════════════

class TestAssembleRoomContent:
    """Tests for room content assembly."""

    WORLD_CONTEXT = {
        'name': 'Eldergrove',
        'description': 'An ancient forest realm.',
    }

    ROOM_CONTEXT = {
        'name': 'Tavern',
        'description': 'A cozy tavern with a roaring fireplace.',
        'npcs': [
            {'name': 'Bartender'},
            {'name': 'Mysterious Stranger'},
        ],
    }

    def test_instruct_description(self, assembler):
        """Instruct mode: description field type produces correct instruction."""
        result = assembler.assemble_room_content(
            world_context=self.WORLD_CONTEXT,
            room_context=self.ROOM_CONTEXT,
            field_type='description',
            is_kobold=False,
        )
        assert 'room description' in result.memory.lower()
        assert 'Eldergrove' in result.memory
        assert 'Tavern' in result.memory
        assert '## Write the description:' in result.prompt

    def test_instruct_introduction(self, assembler):
        """Instruct mode: introduction field type includes room description in memory."""
        result = assembler.assemble_room_content(
            world_context=self.WORLD_CONTEXT,
            room_context=self.ROOM_CONTEXT,
            field_type='introduction',
            is_kobold=False,
        )
        assert 'introduction scene' in result.memory.lower()
        assert 'Room Description: A cozy tavern' in result.memory
        assert '## Write the introduction:' in result.prompt

    def test_instruct_existing_text_continuation(self, assembler):
        """Instruct mode: existing text triggers continuation prompt."""
        result = assembler.assemble_room_content(
            world_context=self.WORLD_CONTEXT,
            room_context=self.ROOM_CONTEXT,
            field_type='description',
            existing_text='The tavern is warm',
            is_kobold=False,
        )
        assert 'The tavern is warm' in result.prompt
        assert 'write ONLY the continuation' in result.prompt

    def test_instruct_user_prompt(self, assembler):
        """Instruct mode: user guidance appended to instruction."""
        result = assembler.assemble_room_content(
            world_context=self.WORLD_CONTEXT,
            room_context=self.ROOM_CONTEXT,
            field_type='description',
            user_prompt='Make it spooky',
            is_kobold=False,
        )
        assert 'User guidance: Make it spooky' in result.memory

    def test_instruct_npcs_in_memory(self, assembler):
        """Instruct mode: NPC names appear in memory."""
        result = assembler.assemble_room_content(
            world_context=self.WORLD_CONTEXT,
            room_context=self.ROOM_CONTEXT,
            field_type='description',
            is_kobold=False,
        )
        assert 'Bartender' in result.memory
        assert 'Mysterious Stranger' in result.memory

    def test_instruct_stop_sequences(self, assembler):
        """Instruct mode: includes </s>, [END], ---."""
        result = assembler.assemble_room_content(
            world_context=self.WORLD_CONTEXT,
            room_context=self.ROOM_CONTEXT,
            field_type='description',
            is_kobold=False,
        )
        assert '</s>' in result.stop_sequences
        assert '[END]' in result.stop_sequences
        assert '---' in result.stop_sequences

    def test_kobold_clean_stops(self, assembler):
        """KoboldCPP: no </s> in stop sequences."""
        result = assembler.assemble_room_content(
            world_context=self.WORLD_CONTEXT,
            room_context=self.ROOM_CONTEXT,
            field_type='description',
            is_kobold=True,
        )
        assert '</s>' not in result.stop_sequences
        assert '[END]' in result.stop_sequences

    def test_kobold_instruction_in_memory(self, assembler):
        """KoboldCPP: generation instruction folded into memory."""
        result = assembler.assemble_room_content(
            world_context=self.WORLD_CONTEXT,
            room_context=self.ROOM_CONTEXT,
            field_type='description',
            is_kobold=True,
        )
        assert 'room description' in result.memory.lower()
        assert '***' in result.memory

    def test_kobold_prompt_format(self, assembler):
        """KoboldCPP: prompt uses clean format without markdown headers."""
        result = assembler.assemble_room_content(
            world_context=self.WORLD_CONTEXT,
            room_context=self.ROOM_CONTEXT,
            field_type='description',
            is_kobold=True,
        )
        # build_room_content_prompt returns "Write the description:\n\n" without ##
        assert '##' not in result.prompt

    def test_empty_contexts(self, assembler):
        """Works with empty world and room context."""
        result = assembler.assemble_room_content(
            world_context={},
            room_context={},
            field_type='description',
            is_kobold=False,
        )
        assert 'Unknown World' in result.memory
        assert 'Unknown Room' in result.memory


# ══════════════════════════════════════════════════════════════════════════════
# assemble_thin_frame
# ══════════════════════════════════════════════════════════════════════════════

class TestAssembleThinFrame:
    """Tests for thin frame assembly."""

    def test_instruct_prompt_includes_character_info(self, assembler):
        """Instruct mode: prompt includes character name, description, personality."""
        result = assembler.assemble_thin_frame(
            character_data=SAMPLE_CHARACTER_DATA,
            is_kobold=False,
        )
        assert 'Aria' in result.prompt
        assert 'mysterious elven ranger' in result.prompt
        assert 'Brave and curious' in result.prompt
        assert result.prompt.endswith('JSON:')

    def test_instruct_memory_has_instruction(self, assembler):
        """Instruct mode: memory contains the JSON extraction instruction."""
        result = assembler.assemble_thin_frame(
            character_data=SAMPLE_CHARACTER_DATA,
            is_kobold=False,
        )
        assert 'archetype' in result.memory
        assert 'key_traits' in result.memory
        assert 'Output ONLY the JSON object' in result.memory

    def test_instruct_stop_sequences(self, assembler):
        """Instruct mode: includes </s> for stopping."""
        result = assembler.assemble_thin_frame(
            character_data=SAMPLE_CHARACTER_DATA,
            is_kobold=False,
        )
        assert '</s>' in result.stop_sequences

    def test_kobold_no_end_of_sequence(self, assembler):
        """KoboldCPP: no </s> in stop sequences."""
        result = assembler.assemble_thin_frame(
            character_data=SAMPLE_CHARACTER_DATA,
            is_kobold=True,
        )
        assert '</s>' not in result.stop_sequences

    def test_kobold_memory_separator(self, assembler):
        """KoboldCPP: memory ends with *** separator."""
        result = assembler.assemble_thin_frame(
            character_data=SAMPLE_CHARACTER_DATA,
            is_kobold=True,
        )
        assert '***' in result.memory

    def test_kobold_instruction_in_memory(self, assembler):
        """KoboldCPP: generation instruction is in memory (no system_instruction field)."""
        result = assembler.assemble_thin_frame(
            character_data=SAMPLE_CHARACTER_DATA,
            is_kobold=True,
        )
        assert 'archetype' in result.memory
        assert 'key_traits' in result.memory

    def test_handles_nested_data(self, assembler):
        """Handles both nested {data: {...}} and flat structure."""
        result = assembler.assemble_thin_frame(
            character_data=SAMPLE_CHARACTER_DATA,
            is_kobold=False,
        )
        assert 'Aria' in result.prompt

    def test_handles_flat_data(self, assembler):
        """Handles flat character data without 'data' wrapper."""
        flat_data = {
            'name': 'Bob',
            'description': 'A baker.',
            'personality': 'Friendly.',
        }
        result = assembler.assemble_thin_frame(
            character_data=flat_data,
            is_kobold=False,
        )
        assert 'Bob' in result.prompt
        assert 'A baker.' in result.prompt

    def test_truncates_long_description(self, assembler):
        """Truncates description to 1500 chars."""
        long_desc = 'x' * 3000
        char_data = {
            'data': {
                'name': 'Test',
                'description': long_desc,
                'personality': '',
            }
        }
        result = assembler.assemble_thin_frame(
            character_data=char_data,
            is_kobold=False,
        )
        # The truncated description in the prompt should be <= 1500 chars
        # (plus surrounding text)
        assert long_desc[:1500] in result.prompt
        assert long_desc[:1501] not in result.prompt


# ══════════════════════════════════════════════════════════════════════════════
# _build_character_memory (shared helper)
# ══════════════════════════════════════════════════════════════════════════════

class TestBuildCharacterMemory:
    """Tests for the lightweight character memory builder."""

    def test_includes_all_fields(self, assembler):
        """Memory includes system_prompt, description, personality, scenario."""
        memory = assembler._build_character_memory(SAMPLE_CHARACTER_DATA)
        assert 'You are Aria.' in memory
        assert 'Description: A mysterious elven ranger.' in memory
        assert 'Personality: Brave and curious.' in memory
        assert 'Scenario: The forest is burning.' in memory

    def test_empty_character_data(self, assembler):
        """Returns empty string for None or empty character data."""
        assert assembler._build_character_memory(None) == ''
        assert assembler._build_character_memory({}) == ''

    def test_minimal_character(self, assembler):
        """Works with minimal character data."""
        memory = assembler._build_character_memory(SAMPLE_CHARACTER_DATA_MINIMAL)
        # No description, personality, or scenario — should be empty or minimal
        assert 'NPC' not in memory or memory == ''  # Name not added to memory context

    def test_no_system_prompt(self, assembler):
        """Works without system_prompt."""
        data = {
            'data': {
                'name': 'Test',
                'description': 'A test character.',
                'personality': '',
                'scenario': '',
            }
        }
        memory = assembler._build_character_memory(data)
        assert 'Description: A test character.' in memory
