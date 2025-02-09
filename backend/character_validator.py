import time
import json
import traceback
from typing import Dict, List, Any
from enum import IntEnum

class LorePosition(IntEnum):
    """Matches TypeScript LorePosition enum exactly"""
    BEFORE_CHAR = 0
    AFTER_CHAR = 1
    AUTHORS_NOTE_TOP = 2  
    AUTHORS_NOTE_BOTTOM = 3
    AT_DEPTH = 4
    BEFORE_EXAMPLE = 5
    AFTER_EXAMPLE = 6

# NOTE: This default item MUST match the TypeScript DEFAULT_LORE_ITEM in loreTypes.ts
# If you update this, you MUST also update the TypeScript version
DEFAULT_LORE_ITEM = {
    "uid": 0,  # This will be overwritten by _generate_uid()
    "key": [],
    "keysecondary": [],
    "comment": "",
    "content": "",
    "constant": False,
    "vectorized": False,
    "selective": True,  # Changed to match example
    "selectiveLogic": 0,
    "addMemo": True,
    "order": 100,
    "position": 1,
    "disable": False,
    "excludeRecursion": False,
    "preventRecursion": False,
    "delayUntilRecursion": False,
    "probability": 100,
    "useProbability": True,
    "depth": 4,  # Changed to match example
    "group": "",
    "groupOverride": True,  # Changed to match example
    "groupWeight": 100,
    "scanDepth": None,
    "caseSensitive": None,
    "matchWholeWords": None,
    "useGroupScoring": None,
    "automationId": "",
    "role": 0,
    "sticky": 0,
    "cooldown": 0,
    "delay": 0,
    "displayIndex": 0,
    "extensions": {}
}

class CharacterValidator:
    def __init__(self, logger):
        self.logger = logger
        self.next_uid = int(time.time() * 1000)  # Initialize UID counter
        
    def _generate_uid(self) -> int:
        """Generate a unique ID for a lore entry"""
        self.next_uid += 1
        return self.next_uid

    def _validate_position(self, position: any) -> int:
        """Validate and normalize a lore entry position."""
        try:
            pos = int(position)
            if 0 <= pos <= 6:  # Valid range from LorePosition enum
                return pos
            self.logger.log_warning(f"Invalid position value {pos}, defaulting to AfterCharacter (1)")
            return 1  # Default to AfterCharacter
        except (ValueError, TypeError):
            self.logger.log_warning(f"Non-integer position value {position}, defaulting to AfterCharacter (1)")
            return 1

    def _normalize_entry(self, entry: Dict) -> Dict:
        """Normalize a single lore entry using defaults"""
        if not isinstance(entry, dict):
            self.logger.log_warning(f"Entry is not a dict: {type(entry)}")
            return dict(DEFAULT_LORE_ITEM)

        # Create new dict with defaults
        normalized = dict(DEFAULT_LORE_ITEM)  # Start with our default format
        
        # Update with any provided values
        for key in DEFAULT_LORE_ITEM.keys():
            if key in entry:
                normalized[key] = entry[key]
        
        # Ensure UID exists
        normalized["uid"] = entry.get("uid") or entry.get("id") or self._generate_uid()
        
        # Convert keys if they're in ST format
        if "keys" in entry and isinstance(entry["keys"], list):
            normalized["key"] = entry["keys"]
        if "secondary_keys" in entry and isinstance(entry["secondary_keys"], list):
            normalized["keysecondary"] = entry["secondary_keys"]
        
        # Convert enabled/disable
        if "enabled" in entry:
            normalized["disable"] = not entry["enabled"]
        
        # Convert insertion_order to order if needed
        if "insertion_order" in entry:
            normalized["order"] = entry["insertion_order"]
        
        # Ensure key arrays
        normalized["key"] = normalized["key"] if isinstance(normalized["key"], list) else []
        normalized["keysecondary"] = normalized["keysecondary"] if isinstance(normalized["keysecondary"], list) else []
        
        return normalized

    def normalize(self, data: Any) -> Dict:
        try:
            if not isinstance(data, dict):
                self.logger.log_warning("Invalid or missing data, creating empty character")
                return self._create_empty_character()

            char_data = data.get('data', {})
            if not isinstance(char_data, dict):
                self.logger.log_warning(f"data.data is not a dict: {type(char_data)}")
                char_data = {}

            # Get and normalize lore entries
            character_book_data = char_data.get('character_book', {})
            raw_entries = character_book_data.get('entries', {})

            # Convert entries to SillyTavern import format
            entries_array = []
            if isinstance(raw_entries, dict):
                # Convert object format to array
                for key, entry in raw_entries.items():
                    st_entry = {
                        "id": entry.get("uid", None),
                        "keys": entry.get("key", []),
                        "secondary_keys": entry.get("keysecondary", []),
                        "comment": entry.get("comment", ""),
                        "content": entry.get("content", ""),
                        "constant": entry.get("constant", False),
                        "selective": entry.get("selective", False),
                        "insertion_order": entry.get("order", 100),
                        "enabled": not entry.get("disable", False),
                        "position": "after_char",  # Default
                        "extensions": {
                            "exclude_recursion": entry.get("excludeRecursion", False),
                            "prevent_recursion": entry.get("preventRecursion", False),
                            "delay_until_recursion": entry.get("delayUntilRecursion", False),
                            "display_index": entry.get("displayIndex", 0),
                            "probability": entry.get("probability", 100),
                            "useProbability": entry.get("useProbability", True),
                            "depth": entry.get("depth", 4),
                            "selectiveLogic": entry.get("selectiveLogic", 0),
                            "group": entry.get("group", ""),
                            "group_override": entry.get("groupOverride", False),
                            "group_weight": entry.get("groupWeight", 100),
                            "scan_depth": entry.get("scanDepth", None),
                            "case_sensitive": entry.get("caseSensitive", None),
                            "match_whole_words": entry.get("matchWholeWords", None),
                            "use_group_scoring": entry.get("useGroupScoring", None),
                            "automation_id": entry.get("automationId", ""),
                            "role": entry.get("role", 0),
                            "vectorized": entry.get("vectorized", False),
                            "sticky": entry.get("sticky", None),
                            "cooldown": entry.get("cooldown", None),
                            "delay": entry.get("delay", None)
                        }
                    }
                    entries_array.append(st_entry)
            elif isinstance(raw_entries, list):
                entries_array = raw_entries

            # Build character structure
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
                        'entries': entries_array,  # Now using array format
                        'name': character_book_data.get('name', ''),
                        'description': character_book_data.get('description', ''),
                        'scan_depth': character_book_data.get('scan_depth', 100),
                        'token_budget': character_book_data.get('token_budget', 2048),
                        'recursive_scanning': character_book_data.get('recursive_scanning', False),
                        'extensions': character_book_data.get('extensions', {})
                    }
                }
            }

            return character

        except Exception as e:
            self.logger.log_error(f"Error normalizing character: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return self._create_empty_character()

    def _create_empty_character(self) -> Dict:
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
                    'entries': {},  # Changed from [] to {}
                    'name': '',
                    'description': '',
                    'scan_depth': 100,
                    'token_budget': 2048,
                    'recursive_scanning': False,
                    'extensions': {}
                }
            }
        }