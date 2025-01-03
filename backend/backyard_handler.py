import re
import json
import requests
from typing import Tuple, Dict, Optional

class BackyardHandler:
    """Handles importing characters from Backyard.ai URLs."""
    
    def __init__(self, logger):
        self.logger = logger

    def import_character(self, url: str) -> Tuple[Dict, Optional[str]]:
        """Import character data from a Backyard.ai URL."""
        try:
            # Validate URL format
            if not url.startswith('https://backyard.ai/hub/character/'):
                raise ValueError("Invalid Backyard.ai URL")

            # Get the page content
            response = requests.get(url)
            response.raise_for_status()
            html = response.text
            self.logger.log_step("Successfully fetched page HTML")

            # First, try to find the trpcState section
            trpc_start = html.find('"trpcState":')
            if trpc_start == -1:
                self.logger.log_error("Could not find trpcState in HTML")
                raise ValueError("Could not find trpcState")

            # Find the actual start of the JSON object
            json_start = html.find('{', trpc_start)
            if json_start == -1:
                self.logger.log_error("Could not find start of JSON data")
                raise ValueError("Invalid data format")

            # Now find the matching end brace
            bracket_count = 0
            json_end = -1
            for i in range(json_start, len(html)):
                if html[i] == '{':
                    bracket_count += 1
                elif html[i] == '}':
                    bracket_count -= 1
                    if bracket_count == 0:
                        json_end = i + 1
                        break

            if json_end == -1:
                self.logger.log_error("Could not find end of JSON data")
                raise ValueError("Incomplete JSON data")

            # Extract the JSON string
            json_str = html[json_start:json_end]
            self.logger.log_step(f"Found JSON data of length: {len(json_str)}")

            # Try to parse it
            try:
                data = json.loads(json_str)
                self.logger.log_step("Successfully parsed JSON")
            except json.JSONDecodeError as e:
                self.logger.log_error(f"JSON parse error: {str(e)}")
                self.logger.log_step("JSON snippet: " + json_str[:100] + "...")
                raise ValueError("Invalid JSON format")

            # Navigate to character data
            queries = data.get('json', {}).get('queries', [])
            if not queries:
                self.logger.log_error("No queries found in data")
                raise ValueError("No queries found")

            char_data = queries[0].get('state', {}).get('data', {}).get('character', {})
            if not char_data:
                self.logger.log_error("No character data found in query")
                raise ValueError("No character data found")

            # Convert to V2 format
            v2_data = self._convert_to_v2(char_data)

            # Get preview image URL
            preview_url = None
            if 'Images' in char_data and char_data['Images']:
                preview_url = next(
                    (img.get('imageUrl') 
                     for img in char_data['Images'] 
                     if img.get('imageUrl')),
                    None
                )

            return v2_data, preview_url

        except Exception as e:
            self.logger.log_error(f"Import failed: {str(e)}")
            raise

    def _convert_to_v2(self, char_data: Dict) -> Dict:
        """Convert Backyard.ai format to V2 character card."""
        v2_data = {
            "spec": "chara_card_v2",
            "spec_version": "2.0",
            "data": {
                "name": char_data.get('aiName', ''),
                "description": char_data.get('basePrompt', ''),
                "personality": char_data.get('aiPersona', ''),
                "first_mes": char_data.get('firstMessage', ''),
                "mes_example": char_data.get('customDialogue', ''),
                "scenario": char_data.get('scenario', ''),
                "creator_notes": char_data.get('authorNotes', ''),
                "tags": [tag.get('name') for tag in char_data.get('Tags', []) if 'name' in tag],
                "creator": char_data.get('Author', {}).get('username', ''),
                "character_version": "1.0",
                "character_book": {
                    "entries": [],
                    "name": "",
                    "description": "",
                    "scan_depth": 100,
                    "token_budget": 2048,
                    "recursive_scanning": False,
                    "extensions": {}
                }
            }
        }

        # Convert lorebook items if present
        if char_data.get('Lorebook') and char_data['Lorebook'].get('LorebookItems'):
            entries = []
            for idx, item in enumerate(char_data['Lorebook']['LorebookItems']):
                entry = {
                    'keys': [k.strip() for k in item.get('key', '').split(',')],
                    'content': item.get('value', ''),
                    'enabled': True,
                    'insertion_order': idx,
                    'case_sensitive': False,
                    'priority': 10,
                    'id': idx,
                    'comment': '',
                    'selective': False,
                    'constant': False,
                    'position': 'after_char'
                }
                entries.append(entry)
            v2_data['data']['character_book']['entries'] = entries

        return v2_data