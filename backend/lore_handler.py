# backend/lore_handler.py
# Simple lore entry matching for chat generation
import re
from typing import Dict, List, Any

class LoreHandler:
    """Handles lore entry matching and integration into prompts"""
    
    # Position constants for clarity
    POSITION_BEFORE_CHAR = 0
    POSITION_AFTER_CHAR = 1
    POSITION_AN_TOP = 2
    POSITION_AN_BOTTOM = 3
    POSITION_AT_DEPTH = 4
    POSITION_BEFORE_EXAMPLE = 5
    POSITION_AFTER_EXAMPLE = 6
    
    def __init__(self, logger, default_position=0):  # Default to before_char (0)
        self.logger = logger
        self.default_position = default_position

    def extract_lore_from_metadata(self, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extract lore entries from character card metadata
        
        Args:
            metadata: Character card metadata dictionary
            
        Returns:
            List of lore entry dictionaries
        """
        lore_entries = []
        
        self.logger.log_step("Extracting lore entries from character card metadata")
        
        # Validate metadata structure
        if not isinstance(metadata, dict):
            self.logger.log_warning(f"Invalid metadata type: {type(metadata)}")
            return []
            
        # Check if metadata has the expected structure
        if 'data' not in metadata:
            self.logger.log_warning("No 'data' field found in metadata")
            return []
            
        data = metadata['data']
        
        # Look for character_book which contains lore entries
        if 'character_book' not in data or not data['character_book']:
            self.logger.log_step("No character_book found in metadata")
            return []
            
        character_book = data['character_book']
        
        # Extract entries from character_book
        # Character book structure may vary based on format
        if isinstance(character_book, dict):
            # Process modern character book format
            entries = character_book.get('entries', [])
            if entries and isinstance(entries, list):
                for entry in entries:
                    # Validate and standardize the entry
                    if not isinstance(entry, dict):
                        continue
                        
                    normalized_entry = {
                        'content': entry.get('content', ''),
                        'keys': entry.get('keys', []),
                        'enabled': entry.get('enabled', True),
                        'position': self._convert_position(entry.get('position', self.default_position)),
                        'insertion_order': entry.get('insertion_order', 0),
                        'case_sensitive': entry.get('case_sensitive', False),
                        'name': entry.get('name', '')
                    }
                    
                    # Only add entries with content and at least one key
                    if normalized_entry['content'] and normalized_entry['keys']:
                        lore_entries.append(normalized_entry)
                        
            self.logger.log_step(f"Extracted {len(lore_entries)} lore entries from character_book")
        else:
            self.logger.log_warning(f"Unexpected character_book type: {type(character_book)}")
            
        return lore_entries
        
    def _convert_position(self, position) -> int:
        """
        Convert position from string or other formats to standard integer
        
        Args:
            position: Position value to convert
            
        Returns:
            Standardized integer position
        """
        # Position mapping from strings (for compatibility with different formats)
        position_mapping = {
            # String positions
            'before_char': self.POSITION_BEFORE_CHAR,
            'after_char': self.POSITION_AFTER_CHAR, 
            'an_top': self.POSITION_AN_TOP,
            'an_bottom': self.POSITION_AN_BOTTOM,
            'at_depth': self.POSITION_AT_DEPTH,
            'before_example': self.POSITION_BEFORE_EXAMPLE,
            'after_example': self.POSITION_AFTER_EXAMPLE
        }
        
        if isinstance(position, str) and position in position_mapping:
            return position_mapping[position]
        elif isinstance(position, int) and 0 <= position <= 6:
            return position
        else:
            return self.default_position
    
    def match_lore_entries(self, 
                           lore_entries: List[Dict], 
                           text: str) -> List[Dict]:
        """
        Match lore entries against the given text
        
        Args:
            lore_entries: List of lore entry dictionaries
            text: Text to match against
            
        Returns:
            List of matched lore entries
        """
        if not lore_entries or not text:
            return []
            
        self.logger.log_step(f"Matching {len(lore_entries)} lore entries against text")
        
        # Sort entries by insertion order to maintain priority
        sorted_entries = sorted(lore_entries, key=lambda e: e.get('insertion_order', 0))
        matched_entries = []
        
        for entry in sorted_entries:
            # Skip disabled entries
            if entry.get('enabled') is False:
                continue
                
            # Skip entries with no keys
            keys = entry.get('keys', [])
            if not keys:
                continue
                
            # Basic search text (case-insensitive)
            search_text = text.lower()
            
            # Try to find a match for any key
            matched = False
            for key in keys:
                if not key or not isinstance(key, str):
                    continue
                    
                search_key = key.strip().lower()
                if search_key and search_key in search_text:
                    matched = True
                    self.logger.log_step(f"Matched key: {key}")
                    break
                    
            if matched:
                matched_entries.append(entry)
            
        self.logger.log_step(f"Matched {len(matched_entries)} lore entries")
        return matched_entries
        
    def integrate_lore_into_prompt(self, 
                                  character_data: Dict, 
                                  matched_entries: List[Dict]) -> str:
        """
        Integrate lore entries into the prompt
        
        Args:
            character_data: Character card data
            matched_entries: List of matched lore entries
            
        Returns:
            Formatted prompt with lore entries
        """
        if not matched_entries:
            return self._create_basic_prompt(character_data)
            
        # Group entries by position
        before_char = []  # Position 0 = before_char
        after_char = []   # Position 1 = after_char
        author_note_top = []  # Position 2 = an_top
        author_note_bottom = []  # Position 3 = an_bottom
        before_example = []  # Position 5 = before_example
        after_example = []   # Position 6 = after_example
        
        # Position mapping from integers or strings
        position_mapping = {
            # Integer positions
            0: before_char,
            1: after_char,
            2: author_note_top,
            3: author_note_bottom,
            4: None,  # at_depth (not implemented in MVP)
            5: before_example,
            6: after_example,
            # String positions (for compatibility)
            'before_char': before_char,
            'after_char': after_char,
            'an_top': author_note_top,
            'an_bottom': author_note_bottom,
            'at_depth': None,  # Not implemented in MVP
            'before_example': before_example,
            'after_example': after_example
        }
        
        for entry in matched_entries:
            content = entry.get('content', '')
            if not content:
                continue
                
            # Get position (could be integer or string)
            position = entry.get('position', self.default_position)
            
            # Add to appropriate list based on position
            target_list = position_mapping.get(position, position_mapping[self.default_position])
            
            if target_list is not None:
                target_list.append(content)
            else:
                # Fallback to default position if the mapping returns None (e.g., at_depth)
                default_list = position_mapping.get(self.default_position, before_char)
                if default_list is not None:
                    default_list.append(content)
        
        # Create prompt with lore
        # Extract the data we need
        if character_data and 'data' in character_data:
            data = character_data['data']
            system_prompt = data.get('system_prompt', '')
            description = data.get('description', '')
            personality = data.get('personality', '')
            scenario = data.get('scenario', '')
            examples = data.get('mes_example', '')
        else:
            # Fallback if data structure is different
            system_prompt = character_data.get('system_prompt', '')
            description = character_data.get('description', '')
            personality = character_data.get('personality', '')
            scenario = character_data.get('scenario', '')
            examples = character_data.get('mes_example', '')
        
        # Start with system prompt
        memory = system_prompt if system_prompt else ""
        
        # Author's note top (if any)
        if author_note_top:
            if memory:
                memory += "\n\n"
            memory += "[Author's Note: " + "\n".join(author_note_top) + "]"
            
        # Add a separator if needed
        if memory:
            memory += "\n\n"
            
        # Add lore before character description
        if before_char:
            memory += "\n".join(before_char)
            memory += "\n\n"
            
        # Add character description
        memory += f"Persona: {description}"
        
        # Add lore after character description
        if after_char:
            memory += "\n\n" + "\n".join(after_char)
            
        # Add personality and scenario
        memory += f"\nPersonality: {personality}"
        memory += f"\nScenario: {scenario}"
        
        # Add lore before examples
        if before_example:
            memory += "\n\n" + "\n".join(before_example)
            
        # Add examples
        if examples:
            memory += f"\n\n{examples}"
            
        # Add lore after examples
        if after_example:
            memory += "\n\n" + "\n".join(after_example)
            
        # Author's note bottom (if any)
        if author_note_bottom:
            memory += "\n\n[Author's Note: " + "\n".join(author_note_bottom) + "]"
            
        return memory
        
    def _create_basic_prompt(self, character_data: Dict) -> str:
        """Create a basic prompt without lore"""
        # Extract the data we need based on possible data structures
        if character_data and 'data' in character_data:
            data = character_data['data']
            system_prompt = data.get('system_prompt', '')
            description = data.get('description', '')
            personality = data.get('personality', '')
            scenario = data.get('scenario', '')
            examples = data.get('mes_example', '')
        else:
            # Fallback if data structure is different
            system_prompt = character_data.get('system_prompt', '')
            description = character_data.get('description', '')
            personality = character_data.get('personality', '')
            scenario = character_data.get('scenario', '')
            examples = character_data.get('mes_example', '')
        
        # Simple concatenation - return whatever is already in memory format
        memory = system_prompt if system_prompt else ""
        
        if memory:
            memory += "\n\n"
            
        memory += f"Persona: {description}"
        memory += f"\nPersonality: {personality}"
        memory += f"\nScenario: {scenario}"
        
        if examples:
            memory += f"\n\n{examples}"
            
        return memory