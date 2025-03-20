from enum import IntEnum
from typing import Dict, List, Any, Union, Optional
import time
import json
import traceback
import logging
from pydantic import BaseModel, Field, validator
from enum import Enum

class WorldInfoPosition(str, Enum):
    BEFORE_CHAR = "BEFORE_CHAR"
    AFTER_CHAR = "AFTER_CHAR"
    AN_TOP = "AN_TOP"
    AN_BOTTOM = "AN_BOTTOM" 
    AT_DEPTH = "AT_DEPTH"
    BEFORE_EXAMPLE = "BEFORE_EXAMPLE"
    AFTER_EXAMPLE = "AFTER_EXAMPLE"

class WorldInfoLogic(IntEnum):
    """Matches TypeScript WorldInfoLogic enum"""
    AND_ANY = 0
    NOT_ALL = 1
    NOT_ANY = 2
    AND_ALL = 3

class InsertionStrategy(IntEnum):
    """Matches TypeScript InsertionStrategy enum"""
    EVENLY = 0
    CHARACTER_FIRST = 1
    GLOBAL_FIRST = 2

# Default structure for a lore entry
DEFAULT_LORE_ENTRY = {
    "id": None,  # Unique identifier (can be 1+index)
    "keys": [],  # Primary trigger keywords
    "secondary_keys": [],  # Secondary/optional filter keywords
    "comment": "",  # User notes
    "content": "",  # The actual lore content
    "constant": False,  # Always included
    "selective": False,  # Use secondary key logic
    "insertion_order": 100,  # Insertion priority
    "enabled": True,  # Entry is enabled
    "position": 1,  # Insertion position
    "use_regex": True,  # Use regular expressions
    "extensions": {  # Additional settings
        "position": 1,
        "exclude_recursion": False,
        "display_index": 0,
        "probability": 100,
        "useProbability": True,
        "depth": 4,
        "selectiveLogic": 0,
        "group": "",
        "group_override": False,
        "group_weight": 100,
        "prevent_recursion": False,
        "delay_until_recursion": False,
        "scan_depth": None,
        "match_whole_words": None,
        "use_group_scoring": False,
        "case_sensitive": None,
        "automation_id": "",
        "role": 0,
        "vectorized": False,
        "sticky": 0,
        "cooldown": 0,
        "delay": 0
    }
}

class CharacterValidator:
    """Validates and normalizes character card data to match TypeScript interfaces"""
    
    def __init__(self, logger):
        self.logger = logger
        self.next_uid = int(time.time() * 1000)

    def create_empty_character(self) -> Dict:
        """Creates empty character structure matching the new JSON format"""
        return {
            "name": "",
            "description": "",
            "personality": "",
            "scenario": "",
            "first_mes": "",
            "mes_example": "",
            "creatorcomment": "",
            "avatar": "none",
            "chat": "",
            "talkativeness": "0.5",
            "fav": False,
            "tags": [],
            "spec": "chara_card_v2",
            "spec_version": "2.0",
            "data": {
                "name": "",
                "description": "",
                "personality": "",
                "scenario": "",
                "first_mes": "",
                "mes_example": "",
                "creator_notes": "",
                "system_prompt": "",
                "post_history_instructions": "",
                "tags": [],
                "creator": "",
                "character_version": "",
                "alternate_greetings": [],
                "extensions": {
                    "talkativeness": "0.5",
                    "fav": False,
                    "world": "",
                    "depth_prompt": {
                        "prompt": "",
                        "depth": 4,
                        "role": "system"
                    }
                },
                "group_only_greetings": [],
                "character_book": {
                    "entries": [],
                    "name": ""
                }
            },
            "create_date": ""
        }
    
    def _generate_uid(self) -> int:
        """Generates unique numeric ID"""
        self.next_uid += 1
        return self.next_uid

    def _ensure_list(self, value: Any) -> List:
        """Ensures value is a list"""
        if isinstance(value, list):
            return value
        elif value is None:
            return []
        else:
            return [value]

    def _normalize_lore_entry(self, entry: Dict) -> Dict:
        """Normalizes a single lore entry to match the new structure"""
        if not isinstance(entry, dict):
            self.logger.log_step(f"Invalid entry format: {type(entry)}")
            return DEFAULT_LORE_ENTRY.copy()

        normalized = DEFAULT_LORE_ENTRY.copy()

        try:
            # Update with provided values
            for key, default_value in DEFAULT_LORE_ENTRY.items():
                if key == "extensions":
                    # Handle extensions separately
                    extensions = entry.get("extensions", {})
                    for ext_key, ext_default in DEFAULT_LORE_ENTRY["extensions"].items():
                        normalized["extensions"][ext_key] = extensions.get(ext_key, ext_default)
                else:
                    normalized[key] = entry.get(key, default_value)

            # Ensure ID exists
            if normalized["id"] is None:
                normalized["id"] = self._generate_uid()

            return normalized

        except Exception as e:
            self.logger.log_step(f"Error normalizing entry: {str(e)}")
            return DEFAULT_LORE_ENTRY.copy()

    def _normalize_character_book(self, book: Dict) -> Dict:
        """Normalizes character book to match TypeScript CharacterBook interface with array-based entries"""
        if not isinstance(book, dict):
            self.logger.log_step("Invalid character book format")
            book = {}

        # Initialize normalized entries list
        normalized_entries = []
        
        # Handle entries from either format
        raw_entries = book.get('entries', [])
        
        # Convert dict to list if necessary
        if isinstance(raw_entries, dict):
            self.logger.log_step("Converting dict entries to list")
            # Sort by order if available, otherwise by key
            sorted_entries = sorted(
                raw_entries.items(),
                key=lambda x: x[1].get('order', int(x[0])) if isinstance(x[1], dict) else int(x[0])
            )
            raw_entries = [entry for _, entry in sorted_entries]
        elif not isinstance(raw_entries, list):
            self.logger.log_step(f"Unexpected entries format: {type(raw_entries)}")
            raw_entries = []

        # Normalize each entry and add to list
        for idx, entry in enumerate(raw_entries):
            if isinstance(entry, dict):
                normalized_entry = self._normalize_lore_entry(entry)
                normalized_entry['order'] = normalized_entry.get('order', idx)
                normalized_entries.append(normalized_entry)

        return {
            "entries": normalized_entries,  # Now using list instead of dict
            "name": str(book.get('name', '')),
            "description": str(book.get('description', '')),
            "scan_depth": int(book.get('scan_depth', 100)),
            "token_budget": int(book.get('token_budget', 2048)),
            "recursive_scanning": bool(book.get('recursive_scanning', False)),
            "extensions": book.get('extensions', {})
        }

    def normalize(self, data: Any) -> Dict:
        """Normalizes character data to match the new JSON format"""
        try:
            if not isinstance(data, dict):
                self.logger.log_step("Invalid data format, creating empty character")
                return self.create_empty_character()

            # Create a copy of the empty character and update it with the provided data
            normalized = self.create_empty_character()

            # Update top-level fields
            normalized.update({
                "name": str(data.get("name", "")),
                "description": str(data.get("description", "")),
                "personality": str(data.get("personality", "")),
                "scenario": str(data.get("scenario", "")),
                "first_mes": str(data.get("first_mes", "")),
                "mes_example": str(data.get("mes_example", "")),
                "creatorcomment": str(data.get("creatorcomment", "")),
                "avatar": str(data.get("avatar", "none")),
                "chat": str(data.get("chat", "")),
                "talkativeness": str(data.get("talkativeness", "0.5")),
                "fav": bool(data.get("fav", False)),
                "tags": data.get("tags", []),
                "spec": str(data.get("spec", "chara_card_v2")),
                "spec_version": str(data.get("spec_version", "2.0")),
                "create_date": str(data.get("create_date", ""))
            })

            # Normalize data section
            data_section = data.get("data", {})
            normalized["data"].update({
                "name": str(data_section.get("name", "")),
                "description": str(data_section.get("description", "")),
                "personality": str(data_section.get("personality", "")),
                "scenario": str(data_section.get("scenario", "")),
                "first_mes": str(data_section.get("first_mes", "")),
                "mes_example": str(data_section.get("mes_example", "")),
                "creator_notes": str(data_section.get("creator_notes", "")),
                "system_prompt": str(data_section.get("system_prompt", "")),
                "post_history_instructions": str(data_section.get("post_history_instructions", "")),
                "tags": data_section.get("tags", []),
                "creator": str(data_section.get("creator", "")),
                "character_version": str(data_section.get("character_version", "")),
                "alternate_greetings": data_section.get("alternate_greetings", []),
            })

            # Normalize data extensions
            extensions = data_section.get("extensions", {})
            normalized["data"]["extensions"].update({
                "talkativeness": str(extensions.get("talkativeness", "0.5")),
                "fav": bool(extensions.get("fav", False)),
                "world": str(extensions.get("world", "")),
            })

            depth_prompt = extensions.get("depth_prompt", {})
            normalized["data"]["extensions"]["depth_prompt"] = {
                "prompt": str(depth_prompt.get("prompt", "")),
                "depth": int(depth_prompt.get("depth", 4)),
                "role": str(depth_prompt.get("role", "system"))
            }

            # Normalize character book
            character_book = data_section.get("character_book", {})
            if character_book is None:
                character_book = {}
                
            normalized["data"]["character_book"]["name"] = str(character_book.get("name", ""))

            # Normalize lore entries
            entries = character_book.get("entries", [])
            normalized_entries = []
            for index, entry in enumerate(entries):
                normalized_entry = self._normalize_lore_entry(entry)
                normalized_entries.append(normalized_entry)
            normalized["data"]["character_book"]["entries"] = normalized_entries

            return normalized

        except Exception as e:
            self.logger.log_step(f"Error normalizing character data: {str(e)}")
            self.logger.log_step(traceback.format_exc())
            return self.create_empty_character()

    def _create_empty_character(self) -> Dict:
        """Creates empty character structure matching the new JSON format"""
        return {
            "name": "",
            "description": "",
            "personality": "",
            "scenario": "",
            "first_mes": "",
            "mes_example": "",
            "creatorcomment": "",
            "avatar": "none",
            "chat": "",
            "talkativeness": "0.5",
            "fav": False,
            "tags": [],
            "spec": "chara_card_v2",
            "spec_version": "2.0",
            "data": {
                "name": "",
                "description": "",
                "personality": "",
                "scenario": "",
                "first_mes": "",
                "mes_example": "",
                "creator_notes": "",
                "system_prompt": "",
                "post_history_instructions": "",
                "tags": [],
                "creator": "",
                "character_version": "",
                "alternate_greetings": [],
                "extensions": {
                    "talkativeness": "0.5",
                    "fav": False,
                    "world": "",
                    "depth_prompt": {
                        "prompt": "",
                        "depth": 4,
                        "role": "system"
                    }
                },
                "group_only_greetings": [],
                "character_book": {
                    "entries": [],
                    "name": ""
                }
            },
            "create_date": ""
        }

class GenerationRequest(BaseModel):
    prompt: str
    model: Optional[str] = None
    max_tokens: int = Field(default=100, ge=1, le=4096)
    temperature: float = Field(default=0.7, ge=0, le=2)
    top_p: float = Field(default=0.9, ge=0, le=1)
    stop_sequences: List[str] = []
    
    @validator('prompt')
    def prompt_not_empty(cls, v):
        if not v.strip():
            raise ValueError('prompt cannot be empty')
        return v