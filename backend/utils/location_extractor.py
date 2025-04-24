# backend/utils/location_extractor.py
# Description: Utility for extracting potential locations from character lore entries.

from typing import List, Dict, Tuple
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
        """Extract potential locations from character lore entries."""
        locations = []
        try:
            # Get character book entries
            lore_entries = character_data.get("data", {}).get("character_book", {}).get("entries", [])
            self.logger.log_step(f"Found {len(lore_entries)} lore entries to analyze")
            
            for entry in lore_entries:
                content = entry.get("content", "")
                keys = entry.get("keys", [])
                key_str = ", ".join(keys)
                
                # Skip if content is too short
                if len(content) < 20:
                    continue
                    
                # Extract potential locations from content
                found_locations = self._extract_locations_from_text(content)
                
                # Create UnconnectedLocation objects
                for loc_name, loc_desc in found_locations:
                    location_id = f"lore_{len(locations)}"
                    locations.append(UnconnectedLocation(
                        location_id=location_id,
                        name=loc_name,
                        description=loc_desc if loc_desc else f"A location mentioned in relation to {key_str}.",
                        lore_source=key_str
                    ))
            
            self.logger.log_step(f"Extracted {len(locations)} potential locations from lore")
            return locations
            
        except Exception as e:
            self.logger.log_error(f"Error extracting locations from lore: {str(e)}")
            return []
            
    def _extract_locations_from_text(self, text: str) -> List[Tuple[str, str]]:
        """Extract location names and descriptions from text content."""
        locations = []
        
        # Regex patterns to find capitalized phrases followed by location indicators
        for indicator in self.location_indicators:
            # Look for "The X", "X of Y", etc. patterns with our indicator
            patterns = [
                fr"(The\s+\w+(?:\s+\w+)?\s+{indicator})",  # The Grand Castle, The Dark Forest
                fr"(\w+(?:'s)?\s+{indicator})",  # Dragon's Cave, Ancient Temple
                fr"({indicator}\s+of\s+\w+(?:\s+\w+)?)"  # Temple of Light, City of Gold
            ]
            
            for pattern in patterns:
                matches = re.finditer(pattern, text, re.IGNORECASE)
                for match in matches:
                    loc_name = match.group(1)
                    # Try to extract a description (sentence containing the location)
                    sentences = re.split(r'(?<=[.!?])\s+', text)
                    for sentence in sentences:
                        if loc_name.lower() in sentence.lower():
                            locations.append((loc_name, sentence))
                            break
                    else:
                        # If no description found, add without one
                        locations.append((loc_name, ""))
        
        return locations