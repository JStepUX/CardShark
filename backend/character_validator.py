from typing import Dict, List, Any, Union
from enum import IntEnum

class LorePosition(IntEnum):
    """Valid positions for lore entries."""
    BEFORE_CHAR = 0
    AFTER_CHAR = 1
    AUTHORS_NOTE_TOP = 2
    AUTHORS_NOTE_BOTTOM = 3
    AT_DEPTH = 4
    BEFORE_EXAMPLE = 5
    AFTER_EXAMPLE = 6

class CharacterValidator:
    def __init__(self, logger):
        self.logger = logger

    def normalize(self, data: Any) -> Dict:
        """Main entry point - normalizes character data to V2 spec."""
        try:
            # Log incoming data type
            self.logger.log_step(f"Normalizing character data of type: {type(data)}")
            
            # Handle None/null data
            if data is None:
                self.logger.log_warning("Received None data, creating empty character")
                return self._create_empty_character()

            # Verify data is a dict
            if not isinstance(data, dict):
                self.logger.log_warning(f"Invalid data format: {type(data)}, creating empty character")
                return self._create_empty_character()

            # Get the data field with proper fallback
            char_data = data.get('data', {})
            if not isinstance(char_data, dict):
                self.logger.log_warning(f"Invalid data.data format: {type(char_data)}, using empty dict")
                char_data = {}

            # Create normalized character structure with safe gets
            character = {
                'spec': 'chara_card_v2',
                'spec_version': '2.0',
                'data': {
                    'name': str(char_data.get('name', '')),
                    'description': str(char_data.get('description', '')),
                    'personality': str(char_data.get('personality', '')),
                    'scenario': str(char_data.get('scenario', '')),
                    'first_mes': str(char_data.get('first_mes', '')),
                    'mes_example': str(char_data.get('mes_example', '')),
                    'creator_notes': str(char_data.get('creator_notes', '')),
                    'system_prompt': str(char_data.get('system_prompt', '')),
                    'post_history_instructions': str(char_data.get('post_history_instructions', '')),
                    'alternate_greetings': char_data.get('alternate_greetings', []),
                    'tags': char_data.get('tags', []),
                    'creator': str(char_data.get('creator', '')),
                    'character_version': str(char_data.get('character_version', '1.0')),
                    'character_book': {
                        'entries': self._normalize_entries(
                            char_data.get('character_book', {}).get('entries', [])
                        ),
                        'name': '',
                        'description': '',
                        'scan_depth': 100,
                        'token_budget': 2048,
                        'recursive_scanning': False,
                        'extensions': {}
                    }
                }
            }
            
            self.logger.log_step("Character data normalized successfully")
            return character

        except Exception as e:
            self.logger.log_error(f"Error normalizing character: {str(e)}")
            self.logger.log_step("Full error context:", data)  # Log the problematic data
            # Re-raise with more context if needed
            # raise ValueError(f"Failed to normalize character: {str(e)}") 
            return self._create_empty_character()

    def _normalize_entries(self, entries: Any) -> List[Dict]:
        """Normalize lore entries with proper field preservation."""
        try:
            # Handle non-list entries
            if not isinstance(entries, list):
                self.logger.log_warning(f"Invalid entries format: {type(entries)}, using empty list")
                return []
                
            normalized = []
            for idx, entry in enumerate(entries):
                try:
                    if not isinstance(entry, dict):
                        self.logger.log_warning(f"Skipping invalid entry format at index {idx}: {type(entry)}")
                        continue

                    # Position validation with detailed logging
                    position = entry.get('position')
                    try:
                        position = int(position)
                        if position not in range(7):
                            self.logger.log_warning(f"Invalid position value {position}, defaulting to 1")
                            position = 1
                    except (ValueError, TypeError):
                        self.logger.log_warning(f"Non-numeric position value {position}, defaulting to 1")
                        position = 1

                    # Handle numeric fields that should allow null
                    depth = self._safe_cast_or_null(entry.get('depth'), int)
                    cooldown = self._safe_cast_or_null(entry.get('cooldown'), int)
                    sticky = self._safe_cast_or_null(entry.get('sticky'), int)
                    delay = self._safe_cast_or_null(entry.get('delay'), int)

                    normalized_entry = {
                        'keys': self._ensure_list(entry.get('keys', entry.get('key', []))),
                        'content': str(entry.get('content', '')),
                        'enabled': not bool(entry.get('disable', False)),
                        'insertion_order': int(entry.get('order', 0)),
                        'case_sensitive': bool(entry.get('case_sensitive', False)),
                        'priority': int(entry.get('priority', 0)),
                        'id': int(entry.get('id', entry.get('uid', 0))),
                        'comment': str(entry.get('comment', '')),
                        'selective': bool(entry.get('selective', False)),
                        'constant': bool(entry.get('constant', False)),
                        'position': position,
                        'depth': depth,
                        'cooldown': cooldown,
                        'role': entry.get('role'),
                        'keysecondary': self._ensure_list(entry.get('keysecondary', [])),
                        'useProbability': bool(entry.get('useProbability', True)),
                        'probability': int(entry.get('probability', 100)),
                        'displayIndex': int(entry.get('displayIndex', 0)),
                        'excludeRecursion': bool(entry.get('excludeRecursion', False)),
                        'preventRecursion': bool(entry.get('preventRecursion', False)),
                        'delayUntilRecursion': bool(entry.get('delayUntilRecursion', False)),
                        'group': str(entry.get('group', '')),
                        'groupOverride': bool(entry.get('groupOverride', False)),
                        'groupWeight': int(entry.get('groupWeight', 100)),
                        'scanDepth': entry.get('scanDepth'),
                        'matchWholeWords': entry.get('matchWholeWords'),
                        'useGroupScoring': entry.get('useGroupScoring'),
                        'automationId': str(entry.get('automationId', '')),
                        'sticky': sticky,
                        'delay': delay,
                        'extensions': entry.get('extensions', {})
                    }
                    
                    normalized.append(normalized_entry)
                    
                except Exception as entry_error:
                    self.logger.log_error(f"Error normalizing entry {idx}: {str(entry_error)}")
                    continue
                
            return normalized
            
        except Exception as e:
            self.logger.log_error(f"Failed to normalize entries: {str(e)}")
            return []

    def _safe_cast_or_null(self, value: Any, cast_type: type) -> Any:
        """Safely cast a value to a type or return None if invalid."""
        if value is None:
            return None
        try:
            return cast_type(value)
        except (ValueError, TypeError):
            return None

    def _ensure_list(self, value: Any) -> List[str]:
        """Convert any value to list of strings with proper error handling."""
        try:
            if isinstance(value, list):
                return [str(x) for x in value if x is not None]
            if isinstance(value, str):
                return [x.strip() for x in value.split(',') if x.strip()]
            return []
        except Exception as e:
            self.logger.log_error(f"Error in _ensure_list: {str(e)}")
            return []

    def _create_empty_character(self) -> Dict:
        """Return empty character structure."""
        return {
            'spec': 'chara_card_v2',
            'spec_version': '2.0',
            'data': {
                'name': '',
                'description': '',
                'personality': '',
                'scenario': '',
                'first_mes': '',
                'mes_example': '',
                'creator_notes': '',
                'system_prompt': '',
                'post_history_instructions': '',
                'alternate_greetings': [],
                'tags': [],
                'creator': '',
                'character_version': '1.0',
                'character_book': {
                    'entries': [],
                    'name': '',
                    'description': '',
                    'scan_depth': 100,
                    'token_budget': 2048,
                    'recursive_scanning': False,
                    'extensions': {}
                }
            }
        }