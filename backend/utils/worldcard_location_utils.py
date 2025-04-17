# backend/utils/worldcard_location_utils.py
# Utilities for extracting potential world locations from character card lore entries
import re
from typing import List

def extract_locations_from_lore(lore: str) -> List[str]:
    """
    Extract potential location names from a character's lore entry.
    Returns a list of detected location names.
    """
    # Simple pattern: look for capitalized words/phrases that might be locations
    # This can be improved later with NLP if needed
    pattern = r'([A-Z][a-zA-Z0-9\'\- ]{2,})'
    matches = re.findall(pattern, lore)
    # Filter out common words, duplicates, and too-short matches
    ignore = set(['The', 'And', 'But', 'With', 'From', 'Into', 'Upon', 'Over', 'For', 'Not', 'Was', 'Are', 'Has', 'Had', 'His', 'Her', 'She', 'He', 'They', 'Them', 'Their'])
    locations = [m.strip() for m in matches if m.strip() not in ignore and len(m.strip()) > 2]
    return list(dict.fromkeys(locations))  # Deduplicate, preserve order
