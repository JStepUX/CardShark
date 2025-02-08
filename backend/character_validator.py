import time
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
    "key": [],  # Changed to empty array instead of empty string
    "keysecondary": [],
    "comment": "",
    "content": "",
    "constant": False,
    "vectorized": False,
    "selective": False,
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
    "depth": 0,
    "group": "",
    "groupOverride": False,
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

def _normalize_entry(self, entry: Dict) -> Dict:
    """Normalize a single lore entry using defaults"""
    if not isinstance(entry, dict):
        self.logger.log_warning(f"Entry is not a dict: {type(entry)}")
        return dict(DEFAULT_LORE_ITEM)

    # Create new dict with defaults
    normalized = dict(DEFAULT_LORE_ITEM)
    
    # Handle UID
    normalized["uid"] = entry.get("uid") or self._generate_uid()

    # Handle key - ensure it's always an array
    if "key" in entry:
        if isinstance(entry["key"], str):
            # Convert comma-separated string to array
            normalized["key"] = [k.strip() for k in entry["key"].split(',') if k.strip()]
        elif isinstance(entry["key"], list):
            # Keep array as is
            normalized["key"] = entry["key"]
        else:
            normalized["key"] = []
    
    # Copy remaining fields from input
    for key in DEFAULT_LORE_ITEM.keys():
        if key in entry and key not in ["uid", "key"]:  # Skip uid and key as we handled them
            # Special handling for position to ensure it's valid
            if key == "position":
                try:
                    pos = int(entry[key])
                    if 0 <= pos <= 6:
                        normalized[key] = pos
                except (ValueError, TypeError):
                    pass
            else:
                normalized[key] = entry[key]

    return normalized

class CharacterValidator:
    def __init__(self, logger):
        self.logger = logger
        self.next_uid = int(time.time() * 1000)  # Initialize UID counter
        
    def _generate_uid(self) -> int:
        """Generate a unique ID for a lore entry"""
        self.next_uid += 1
        return self.next_uid

    def _normalize_entry(self, entry: Dict) -> Dict:
        """Normalize a single lore entry using defaults"""
        if not isinstance(entry, dict):
            self.logger.log_warning(f"Entry is not a dict: {type(entry)}")
            # Create completely new entry with new UID
            return dict(DEFAULT_LORE_ITEM, uid=self._generate_uid())

        # Create new dict with defaults
        normalized = dict(DEFAULT_LORE_ITEM)
        
        # Handle UID - preserve existing or generate new
        if "uid" in entry and entry["uid"] is not None:
            normalized["uid"] = entry["uid"]
            self.logger.log_step(f"Preserving existing UID: {entry['uid']}")
        else:
            normalized["uid"] = self._generate_uid()
            self.logger.log_step(f"Generated new UID: {normalized['uid']}")

        # Convert keys array to key string if needed
        if "keys" in entry and isinstance(entry["keys"], list):
            normalized["key"] = ", ".join(map(str, entry["keys"]))
            self.logger.log_step(f"Converted keys array to string: {normalized['key']}")
        elif "key" in entry:
            normalized["key"] = str(entry["key"])

        # Copy remaining fields from schema
        for key in DEFAULT_LORE_ITEM.keys():
            if key in entry and key not in ["uid", "key"]:  # Skip uid and key as already handled
                if key == "position":
                    try:
                        pos = int(entry[key])
                        if 0 <= pos <= 6:
                            normalized[key] = pos
                    except (ValueError, TypeError):
                        pass  # Keep default if invalid
                else:
                    normalized[key] = entry[key]

        return normalized

    def normalize(self, data: Any) -> Dict:
        """Normalize character data to V2 spec"""
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
            entries = character_book_data.get('entries', [])

            # Convert entries object to array if needed
            if isinstance(entries, dict):
                self.logger.log_step("Converting entries object to an array")
                entries = list(entries.values())

            # Normalize each entry
            normalized_entries = [self._normalize_entry(entry) for entry in entries]

            # Log UIDs for debugging
            self.logger.log_step(f"Normalized {len(normalized_entries)} entries with UIDs: " + 
                               str([entry['uid'] for entry in normalized_entries]))

            # Build normalized character structure
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
                        'entries': normalized_entries,
                        'name': '',
                        'description': '',
                        'scan_depth': 100,
                        'token_budget': 2048,
                        'recursive_scanning': False,
                        'extensions': {}
                    }
                }
            }

            return character

        except Exception as e:
            self.logger.log_error(f"Error normalizing character: {str(e)}")
            return self._create_empty_character()

    def _create_empty_character(self) -> Dict:
        """Create an empty character structure"""
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