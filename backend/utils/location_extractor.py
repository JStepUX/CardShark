# backend/utils/location_extractor.py
# Description: Utility for extracting potential locations from character lore entries.

from typing import List, Dict, Tuple, Set
import re
from ..models.world_state import UnconnectedLocation

class LocationExtractor:
    def __init__(self, logger):
        self.logger = logger
        # Common location indicators (landmarks, buildings, geographical features)
        self.location_indicators = [
            "castle", "tower", "temple", "shrine", "village", "city", "town", "forest",
            "mountain", "lake", "river", "cave", "mansion", "house", "tavern", "inn",
            "academy", "school", "library", "dungeon", "palace", "fort", "fortress",
            "island", "valley", "bridge", "gate", "port", "harbor", "market", "shop",
            "arena", "garden", "park", "tomb", "crypt", "cemetery", "laboratory"
        ]
        
    def extract_from_lore(self, character_data: Dict) -> List[UnconnectedLocation]:
        """
        Extract potential locations from character lore entries.
        Uses the lore entry's trigger words ('name' field) first to find locations.
        Falls back to content text analysis if no location indicators found in trigger words.
        """
        try:
            # Get character book entries
            lore_entries = character_data.get("data", {}).get("character_book", {}).get("entries", [])
            self.logger.log_step(f"Found {len(lore_entries)} lore entries to analyze")
            
            # Track processed names to avoid duplicates
            processed_names = set()
            locations = []
            
            # Process each lore entry
            for i, entry in enumerate(lore_entries):
                # Skip entries with insufficient content
                content = entry.get("content", "")
                if len(content) < 20:
                    continue
                
                # Get trigger words (keys)
                keys = entry.get("keys", [])
                location_id = f"lore_{len(locations)}"
                key_str = ", ".join(keys)
                
                # First strategy: Use first trigger word containing location indicator
                location_created = self._create_location_from_keys(
                    keys, content, key_str, location_id, processed_names, locations
                )
                
                # Second strategy: Extract from content if no location found from keys
                if not location_created:
                    self._create_locations_from_content(
                        content, key_str, location_id, processed_names, locations
                    )
            
            self.logger.log_step(f"Extracted {len(locations)} potential locations from lore")
            return locations
            
        except Exception as e:
            self.logger.log_error(f"Error extracting locations from lore: {str(e)}")
            return []
    
    def _create_location_from_keys(self, keys: List[str], content: str, key_str: str, 
                                  location_id: str, processed_names: Set[str], 
                                  locations: List[UnconnectedLocation]) -> bool:
        """Create a location using the first trigger word that contains a location indicator."""
        if not keys:
            return False
            
        # Check each key for location indicators
        for key in keys:
            key = key.strip()
            key_lower = key.lower()
            
            # Skip if this key has already been processed
            if key_lower in processed_names:
                continue
                
            # Check if key contains any location indicator
            for indicator in self.location_indicators:
                if indicator in key_lower:
                    # Create a location using this key as the name
                    room_name = key.title()  # Capitalize for consistency
                    locations.append(UnconnectedLocation(
                        location_id=location_id,
                        name=room_name,
                        description=content,
                        lore_source=key_str
                    ))
                    processed_names.add(key_lower)
                    return True
        
        return False
    
    def _create_locations_from_content(self, content: str, key_str: str, 
                                      location_id: str, processed_names: Set[str], 
                                      locations: List[UnconnectedLocation]) -> None:
        """Extract locations from content text and create UnconnectedLocation objects."""
        # Patterns for location extraction
        for indicator in self.location_indicators:
            patterns = [
                fr"(The\s+\w+(?:\s+\w+)?\s+{indicator})",  # The Grand Castle
                fr"(\w+(?:'s)?\s+{indicator})",             # Dragon's Cave
                fr"({indicator}\s+of\s+\w+(?:\s+\w+)?)"     # Temple of Light
            ]
            
            for pattern in patterns:
                matches = re.finditer(pattern, content, re.IGNORECASE)
                for match in matches:
                    loc_name = match.group(1)
                    loc_lower = loc_name.lower()
                    
                    # Skip if this name has already been processed
                    if loc_lower in processed_names:
                        continue
                    
                    # Find the sentence containing this location
                    description = self._extract_sentence_with_location(content, loc_name) or ""
                    
                    # Create the location
                    locations.append(UnconnectedLocation(
                        location_id=f"{location_id}_{len(locations)}",
                        name=loc_name,
                        description=description or f"A location mentioned in relation to {key_str}.",
                        lore_source=key_str
                    ))
                    processed_names.add(loc_lower)
    
    def _extract_sentence_with_location(self, text: str, location_name: str) -> str:
        """Extract the sentence containing the given location name."""
        sentences = re.split(r'(?<=[.!?])\s+', text)
        location_lower = location_name.lower()
        
        for sentence in sentences:
            if location_lower in sentence.lower():
                return sentence
        
        return ""