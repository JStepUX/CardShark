import re
import json
import requests # type: ignore
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

            # Use regex to find the trpcState section more precisely
            trpc_match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
            if not trpc_match:
                self.logger.log_error("Could not find __NEXT_DATA__ script")
                raise ValueError("Could not find character data")

            # Extract the JSON string
            try:
                next_data = json.loads(trpc_match.group(1))
                self.logger.log_step("Successfully parsed __NEXT_DATA__")
                
                # Navigate to character data through the props structure
                # Log the structure we're working with
                self.logger.log_step("Data structure:")
                self.logger.log_step(f"Keys at root: {list(next_data.keys())}")
                self.logger.log_step(f"Props keys: {list(next_data.get('props', {}).keys())}")
                self.logger.log_step(f"PageProps keys: {list(next_data.get('props', {}).get('pageProps', {}).keys())}")

                char_data = next_data.get('props', {}).get('pageProps', {})
                
                # Try different known Backyard data paths
                if 'trpcState' in char_data:
                    # TRPC path
                    trpc_state = char_data['trpcState']
                    self.logger.log_step(f"TrpcState keys: {list(trpc_state.keys())}")
                    
                    # Check the json key first
                    if 'json' in trpc_state:
                        json_data = trpc_state['json']
                        self.logger.log_step(f"JSON data keys: {list(json_data.keys())}")
                        
                        # Look for queries in the json data
                        queries = json_data.get('queries', [])
                        if queries and len(queries) > 0:
                            self.logger.log_step(f"Found {len(queries)} queries")
                            # Log the first query structure
                            self.logger.log_step(f"First query keys: {list(queries[0].keys())}")
                            
                            character = queries[0].get('state', {}).get('data', {}).get('character', {})
                            if character:
                                self.logger.log_step("Found character through json.queries path")
                                self.logger.log_step(f"Character keys: {list(character.keys())}")
                            else:
                                raise ValueError("No character data in query")
                        else:
                            raise ValueError("No queries found in json data")
                    else:
                        raise ValueError("No json data found in trpcState")
                else:
                    self.logger.log_step("Available paths in pageProps:")
                    self.logger.log_step(json.dumps(char_data, indent=2)[:500] + "...")
                    raise ValueError("Could not find character data in any known path")

                character = queries[0].get('state', {}).get('data', {}).get('character', {})
                if not character:
                    raise ValueError("No character found in query data")

                # Convert to V2 format
                v2_data = self._convert_to_v2(character)

                # Get preview image URL
                preview_url = None
                if character.get('Images'):
                    preview_url = next(
                        (img.get('imageUrl') 
                         for img in character['Images'] 
                         if img.get('imageUrl')),
                        None
                    )

                return v2_data, preview_url

            except json.JSONDecodeError as e:
                self.logger.log_error(f"JSON parse error: {str(e)}")
                raise ValueError("Invalid JSON format")

        except Exception as e:
            self.logger.log_error(f"Import failed: {str(e)}")
            raise

    def _convert_to_v2(self, char_data: Dict) -> Dict:
        """Convert Backyard.ai format to V2 character card."""
        try:
            self.logger.log_step("Starting format conversion")
            
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
                    "system_prompt": "",
                    "post_history_instructions": "",
                    "alternate_greetings": [],
                    "tags": [tag.get('name') for tag in char_data.get('Tags', []) if isinstance(tag, dict) and 'name' in tag],
                    "creator": char_data.get('Author', {}).get('username', ''),
                    "character_version": "1.0",
                    "imported_images": [
                        img.get('imageUrl') for img in char_data.get('Images', [])
                        if isinstance(img, dict) and img.get('imageUrl')
                    ],
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
            lorebook = char_data.get('Lorebook', {})
            if isinstance(lorebook, dict) and lorebook.get('LorebookItems'):
                entries = []
                for idx, item in enumerate(lorebook['LorebookItems']):
                    if not isinstance(item, dict):
                        continue
                        
                    entry = {
                        'keys': [k.strip() for k in item.get('key', '').split(',') if k.strip()],
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
                self.logger.log_step(f"Converted {len(entries)} lore entries")

            return v2_data

        except Exception as e:
            self.logger.log_error(f"Conversion failed: {str(e)}")
            raise