import re
import json
import requests # type: ignore
from typing import Tuple, Dict, Optional
from backend.character_validator import CharacterValidator

class BackyardHandler:
    def __init__(self, logger):
        self.logger = logger
        self.validator = CharacterValidator(logger)

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
                queries = next_data.get('props', {}).get('pageProps', {}).get('trpcState', {}).get('json', {}).get('queries', [])
                
                if not queries:
                    raise ValueError("No queries found in data")

                character = queries[0].get('state', {}).get('data', {}).get('character', {})
                if not character:
                    raise ValueError("No character found in query data")

                # Convert to V2 format
                v2_data = self._convert_to_v2(character)
                validated_data = self.validator.normalize(v2_data)

                # Get preview image URL
                preview_url = None
                if character.get('Images'):
                    # Get first available image URL
                    for img in character['Images']:
                        if isinstance(img, dict) and 'imageUrl' in img:
                            preview_url = img['imageUrl']
                            break
                    if preview_url:
                        self.logger.log_step(f"Found preview image: {preview_url}")

                return validated_data, preview_url

            except json.JSONDecodeError as e:
                self.logger.log_error(f"JSON parse error: {str(e)}")
                raise ValueError("Invalid JSON format")

        except Exception as e:
            self.logger.log_error(f"Import failed: {str(e)}")
            raise

    def _convert_text_fields(self, text: str) -> str:
        """Convert only specific character variables, preserving other content."""
        if not text or not isinstance(text, str):
            return text
            
        # Exact string replacements only
        replacements = [
            ("{character}", "{{char}}"),
            ("{CHARACTER}", "{{char}}"),
            ("{Character}", "{{char}}"),
            ("{user}", "{{user}}"),
            ("{USER}", "{{user}}"),
            ("{User}", "{{user}}")
        ]
        
        result = text
        for old, new in replacements:
            if old in result:
                result = result.replace(old, new)
                self.logger.log_step(f"Converting variable: {old} → {new}")
                
        return result

    def _convert_to_v2(self, char_data: Dict) -> Dict:
        """Convert Backyard.ai format to V2 character card."""
        try:
            # Process only specific message/prompt fields
            text_fields = [
                'firstMessage',
                'customDialogue',
                'basePrompt', 
                'aiPersona',
                'scenario'
            ]

            # Convert known text fields
            converted_data = {}
            for field in text_fields:
                if field in char_data:
                    converted_data[field] = self._convert_text_fields(char_data[field])
                    
            # Create V2 structure
            v2_data = {
                "spec": "chara_card_v2",
                "spec_version": "2.0",
                "data": {
                    "name": char_data.get('aiName', ''),
                    "description": converted_data.get('aiPersona', ''),
                    "personality": "",
                    "first_mes": converted_data.get('firstMessage', ''),
                    "mes_example": converted_data.get('customDialogue', ''),
                    "scenario": converted_data.get('scenario', ''),
                    "creator_notes": char_data.get('authorNotes', ''),
                    "system_prompt": converted_data.get('basePrompt', ''),
                    "post_history_instructions": "",
                    "alternate_greetings": [],
                    "tags": [tag.get('name') for tag in char_data.get('Tags', [])],
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

            # Convert lorebook entries
            if 'Lorebook' in char_data and 'LorebookItems' in char_data['Lorebook']:
                entries = []
                for idx, item in enumerate(char_data['Lorebook']['LorebookItems']):
                    if isinstance(item, dict):
                        entry = {
                            'keys': [k.strip() for k in item.get('key', '').split(',')],
                            'content': self._convert_text_fields(item.get('value', '')),
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

            # Get all image URLs
            if char_data.get('Images'):
                image_urls = [
                    img['imageUrl'] 
                    for img in char_data['Images'] 
                    if isinstance(img, dict) and 'imageUrl' in img
                ]
                if image_urls:
                    v2_data['data']['imported_images'] = image_urls
                    self.logger.log_step(f"Added {len(image_urls)} image URLs")

            return v2_data

        except Exception as e:
            self.logger.log_error(f"Conversion failed: {str(e)}")
            raise