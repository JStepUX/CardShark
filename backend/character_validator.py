from typing import Dict, List, Any, Union
from enum import IntEnum
import time

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
    """Validates and normalizes character card data structure."""
    
    def __init__(self, logger):
        self.logger = logger

    def normalize(self, data: Dict) -> Dict:
        """Main entry point - normalizes character data to V2 spec."""
        try:
            # Ensure we have a valid dictionary
            if not isinstance(data, dict):
                self.logger.log_error("Invalid data format")
                return self._create_empty_character()

            # Normalize to V2 structure
            character = {
                'spec': 'chara_card_v2',
                'spec_version': '2.0',
                'data': {
                    # Get core fields with defaults
                    'name': str(data.get('data', {}).get('name', '')),
                    'description': str(data.get('data', {}).get('description', '')),
                    'personality': str(data.get('data', {}).get('personality', '')),
                    'scenario': str(data.get('data', {}).get('scenario', '')),
                    'first_mes': str(data.get('data', {}).get('first_mes', '')),
                    'mes_example': str(data.get('data', {}).get('mes_example', '')),
                    'creator_notes': str(data.get('data', {}).get('creator_notes', '')),
                    'system_prompt': str(data.get('data', {}).get('system_prompt', '')),
                    'post_history_instructions': str(data.get('data', {}).get('post_history_instructions', '')),
                    'alternate_greetings': data.get('data', {}).get('alternate_greetings', []),
                    'tags': data.get('data', {}).get('tags', []),
                    'creator': str(data.get('data', {}).get('creator', '')),
                    'character_version': str(data.get('data', {}).get('character_version', '1.0')),
                    
                    # Handle character book
                    'character_book': {
                        'entries': self._normalize_entries(
                            data.get('data', {}).get('character_book', {}).get('entries', [])
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
            return self._create_empty_character()

    def _normalize_entries(self, entries: List[Dict]) -> List[Dict]:
        """Normalize lore entries."""
        if not isinstance(entries, list):
            return []
            
        normalized = []
        for entry in entries:
            if isinstance(entry, dict):
                normalized.append({
                    'keys': self._ensure_list(entry.get('keys', entry.get('key', []))),
                    'content': str(entry.get('content', '')),
                    'enabled': not bool(entry.get('disable', False)),
                    'insertion_order': int(entry.get('order', 0)),
                    'case_sensitive': bool(entry.get('case_sensitive', False)),
                    'priority': int(entry.get('priority', 0)),
                    'id': int(entry.get('id', entry.get('uid', time.time() * 1000))),
                    'comment': str(entry.get('comment', '')),
                    'selective': bool(entry.get('selective', False)),
                    'constant': bool(entry.get('constant', False)),
                    'position': self._normalize_position(entry.get('position', 1))
                })
                
        return normalized

    def _normalize_position(self, position: Any) -> int:
        """Normalize position to valid integer (0-6) or default to 1."""
        try:
            pos_int = int(position)
            if 0 <= pos_int <= 6:
                return pos_int
        except (ValueError, TypeError):
            pass
        return 1  # Default to AFTER_CHAR for any invalid value

    def _ensure_list(self, value: Any) -> List[str]:
        """Convert any value to list of strings."""
        if isinstance(value, list):
            return [str(x) for x in value]
        if isinstance(value, str):
            return [x.strip() for x in value.split(',') if x.strip()]
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