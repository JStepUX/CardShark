# backend/utils/location_extractor.py
# Description: Utility for extracting potential locations from character lore entries.
# Simplified approach: If a lore entry's keyword looks like a place name (proper noun),
# create one room using that entry's content as the description.

from typing import List, Dict, Set
from dataclasses import dataclass

@dataclass
class ExtractedLocation:
    """Simple data structure for locations extracted from lore"""
    location_id: str
    name: str
    description: str
    lore_source: str

class LocationExtractor:
    def __init__(self, logger):
        self.logger = logger

    def extract_from_lore(self, character_data: Dict) -> List[ExtractedLocation]:
        """
        Extract potential locations from character lore entries.

        Simple approach: Check if each lore entry's first keyword looks like a place name
        (multi-word proper noun like "Stratford Lake" or "Hillshire College").
        If so, create ONE room per matching lore entry using the content as description.
        """
        try:
            lore_entries = character_data.get("data", {}).get("character_book", {}).get("entries", [])
            self.logger.log_step(f"Found {len(lore_entries)} lore entries to analyze")

            processed_names: Set[str] = set()
            locations: List[ExtractedLocation] = []

            for entry in lore_entries:
                content = entry.get("content", "")
                if len(content) < 20:
                    continue

                keys = entry.get("keys", [])
                if not keys:
                    continue

                # Use the first key as the potential place name
                place_name = keys[0].strip()
                place_name_lower = place_name.lower()

                # Skip if already processed
                if place_name_lower in processed_names:
                    continue

                # Check if this keyword looks like a place name
                if self._looks_like_place_name(place_name):
                    locations.append(ExtractedLocation(
                        location_id=f"lore_{len(locations)}",
                        name=place_name,
                        description=content,
                        lore_source=", ".join(keys)
                    ))
                    processed_names.add(place_name_lower)

            self.logger.log_step(f"Extracted {len(locations)} potential locations from lore")
            return locations

        except Exception as e:
            self.logger.log_error(f"Error extracting locations from lore: {str(e)}")
            return []

    def _looks_like_place_name(self, name: str) -> bool:
        """
        Check if a string looks like a place name (proper noun).

        Heuristic: Multi-word string where most words are capitalized.
        Examples that match: "Stratford Lake", "Hillshire College", "The Dark Forest"
        Examples that don't match: "personality", "likes and dislikes", "background"
        """
        if not name:
            return False

        words = name.split()

        # Single words are unlikely to be distinctive place names
        if len(words) < 2:
            return False

        # Count capitalized words (excluding common articles/prepositions)
        skip_words = {"the", "of", "and", "in", "at", "to", "a", "an"}
        significant_words = [w for w in words if w.lower() not in skip_words]

        if not significant_words:
            return False

        # Check if significant words are capitalized (proper noun pattern)
        capitalized = sum(1 for w in significant_words if w[0].isupper())

        # At least half of significant words should be capitalized
        return capitalized >= len(significant_words) * 0.5