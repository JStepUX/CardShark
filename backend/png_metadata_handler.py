from PIL import Image, PngImagePlugin
from typing import Dict, Optional, Union, BinaryIO, List
from io import BytesIO
import base64
import json
import re
from character_validator import CharacterValidator  # Add validator import

class PngMetadataHandler:
    """Handles reading and writing character card metadata in PNG files."""
    
    def __init__(self, logger):
        self.logger = logger
        self.validator = CharacterValidator(logger)  # Add validator

    def read_metadata(self, file_data: Union[bytes, BinaryIO]) -> Dict:
        """Read character metadata from a PNG file."""
        try:
            # Convert input to BytesIO
            bio = BytesIO(file_data if isinstance(file_data, bytes) else file_data.read())
            self.logger.log_step("Converted input to BytesIO")
            
            # Reset file pointer and open image
            bio.seek(0)
            image = Image.open(bio)
            image.load()
            
            # Force text chunk loading by accessing text attribute
            # This is required because Pillow lazy-loads text chunks
            if hasattr(image, 'text'):
                _ = image.text  # Trigger lazy loading
                
            self.logger.log_step("Opened PNG file")
            
            # Log image info
            self.logger.log_step(f"Available info keys: {list(image.info.keys())}")
            
            # Check for metadata
            metadata = None
            
            # Try Chara field first (case-insensitive)
            chara_key = next((k for k in image.info.keys() if k.lower() == 'chara'), None)
            if chara_key:
                self.logger.log_step(f"Found {chara_key} field")
                try:
                    raw_metadata = self._decode_metadata(image.info[chara_key])
                    metadata = self.validator.normalize(raw_metadata)
                except Exception as e:
                    self.logger.log_error(f"Failed to decode {chara_key}: {str(e)}")
                    
            # Return metadata or empty card
            if metadata:
                return metadata
                
            self.logger.log_step("No valid metadata found - creating empty card")
            return self._create_empty_card()
                
        except Exception as e:
            self.logger.log_error(f"Failed to read metadata: {str(e)}")
            raise

    def _decode_metadata(self, encoded_data: str) -> Dict:
        try:
            self.logger.log_step(f"Decoding metadata of length: {len(encoded_data)}")
            
            # Handle bytes input
            if isinstance(encoded_data, bytes):
                encoded_data = encoded_data.decode('utf-8')
                self.logger.log_step("Converted bytes to string")
            
            # Clean up ASCII prefix if present
            if encoded_data.startswith('ASCII\x00\x00\x00'):
                encoded_data = encoded_data[8:]
            elif encoded_data.startswith('ASCII'):
                encoded_data = encoded_data[5:]
            
            # Remove null bytes and whitespace
            encoded_data = encoded_data.strip('\x00').strip()
            
            # Base64 decode
            try:
                decoded = base64.b64decode(encoded_data).decode('utf-8')
                self.logger.log_step("Successfully decoded base64 data")
                data = json.loads(decoded)
                
                # Handle SillyTavern format with duplicated data
                if 'spec' in data and data['spec'] == 'chara_card_v2':
                    card_data = {}
                    
                    # Merge fields from both root and data key
                    if 'data' in data:
                        card_data.update(data['data'])
                    
                    # Root level fields override data fields
                    root_fields = ['name', 'description', 'personality', 'scenario', 
                                'first_mes', 'mes_example', 'tags']
                    for field in root_fields:
                        if field in data:
                            card_data[field] = data[field]
                    
                    return {
                        "spec": "chara_card_v2",
                        "spec_version": "2.0",
                        "data": card_data
                    }
                
                if 'character' in data:
                    char_data = data['character']
                    self.logger.log_step(f"Processing character data: {len(char_data)}")
                    
                    # Process lore items directly from char_data
                    entries = []
                    if 'loreItems' in char_data:
                        self.logger.log_step(f"Found lore items in char_data: {len(char_data['loreItems'])}")
                        for idx, item in enumerate(char_data['loreItems']):
                            self.logger.log_step(f"Processing lore item: {item['key']}")
                            entries.append({
                                "keys": [item['key']],
                                "content": item['value'],
                                "enabled": True,
                                "insertion_order": idx,
                                "case_sensitive": False,
                                "priority": 0
                            })
                    
                    v2_card = {
                        "spec": "chara_card_v2",
                        "spec_version": "2.0",
                        "data": {
                            "name": char_data.get('aiName', ''),
                            "description": char_data.get('aiPersona', ''),
                            "personality": "",
                            "first_mes": char_data.get('firstMessage', ''),
                            "mes_example": char_data.get('customDialogue', ''),
                            "scenario": char_data.get('scenario', ''),
                            "creator_notes": "",
                            "system_prompt": char_data.get('basePrompt', ''),
                            "post_history_instructions": "",
                            "alternate_greetings": [],
                            "tags": [],
                            "creator": "",
                            "character_version": "1.0",
                            "character_book": {
                                "entries": entries,
                                "name": "Imported Lore", 
                                "description": "Imported from Backyard.ai format",
                                "scan_depth": 100,
                                "token_budget": 2048,
                                "recursive_scanning": False,
                                "extensions": {}
                            }
                        }
                    }
                    return v2_card
                
                return data

            except Exception as inner_e:
                self.logger.log_error(f"Base64 decode failed: {str(inner_e)}")
                raise ValueError("Invalid base64 metadata format")

        except Exception as e:
            self.logger.log_error(f"Failed to decode metadata: {str(e)}")
            raise

    def _is_backyard_format(self, data: Dict) -> bool:
        """Check if data matches Backyard.ai format."""
        # Check for characteristic Backyard.ai fields
        backyard_fields = ['character', 'aiName', 'basePrompt', 'aiPersona', 'customDialogue']
        has_backyard_fields = any(field in data for field in backyard_fields)
        
        if has_backyard_fields:
            self.logger.log_step("Detected Backyard.ai format")
            self.logger.log_step(f"Found fields: {[f for f in backyard_fields if f in data]}")
        
        return has_backyard_fields

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

    def _convert_dict_fields(self, data: Dict) -> Dict:
        """Recursively convert all string fields in a dictionary."""
        if not isinstance(data, dict):
            return data
            
        result = {}
        for key, value in data.items():
            if isinstance(value, str):
                result[key] = self._convert_text_fields(value)
            elif isinstance(value, list):
                result[key] = [
                    self._convert_text_fields(item) if isinstance(item, str)
                    else self._convert_dict_fields(item) if isinstance(item, dict)
                    else item
                    for item in value
                ]
            elif isinstance(value, dict):
                result[key] = self._convert_dict_fields(value)
            else:
                result[key] = value
        return result

    def _convert_backyard_to_v2(self, data: Dict) -> Dict:
        """Convert Backyard.ai format to V2."""
        try:
            self.logger.log_step("Starting format conversion")
            
            v2_data = self._create_empty_card()
            # Get character data from either nested or direct structure
            char_data = data.get('character', data)
            
            # Map Backyard fields to V2 format
            field_mapping = {
                'aiName': 'name',
                'basePrompt': 'system_prompt',
                'aiPersona': 'description',
                'firstMessage': 'first_mes',
                'customDialogue': 'mes_example', 
                'scenario': 'scenario',
                'authorNotes': 'creator_notes'
            }

            # Copy mapped fields with conversion
            for by_field, v2_field in field_mapping.items():
                if by_field in char_data:
                    v2_data['data'][v2_field] = self._convert_text_fields(char_data[by_field])

            # Handle special fields
            if char_data.get('Tags'):
                v2_data['data']['tags'] = [
                    tag.get('name') for tag in char_data['Tags'] 
                    if isinstance(tag, dict) and 'name' in tag
                ]

            if char_data.get('Author'):
                v2_data['data']['creator'] = char_data['Author'].get('username', '')

            # Add default values for missing fields
            v2_data['data'].update({
                'system_prompt': char_data.get('system_prompt', ''),
                'post_history_instructions': char_data.get('post_history_instructions', ''),
                'alternate_greetings': [],
                'character_version': '1.0'
            })

            # Handle lorebook if present
            if char_data.get('Lorebook') and char_data['Lorebook'].get('LorebookItems'):
                entries = []
                for idx, item in enumerate(char_data['Lorebook']['LorebookItems']):
                    if isinstance(item, dict):
                        entry = {
                            'keys': [k.strip() for k in item.get('key', '').split(',') if k.strip()],
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

            self.logger.log_step(f"Converted character data: {json.dumps(v2_data['data'], indent=2)[:200]}...")
            return v2_data

        except Exception as e:
            self.logger.log_error(f"Error during conversion: {str(e)}")
            raise

    def _create_empty_card(self) -> Dict:
        """Create an empty V2 character card structure."""
        empty = {
            "spec": "chara_card_v2",
            "spec_version": "2.0",
            "data": {
                "name": "",
                "description": "",
                "personality": "",
                "first_mes": "",
                "mes_example": "",
                "scenario": "",
                "creator_notes": "",
                "system_prompt": "",
                "post_history_instructions": "",
                "alternate_greetings": [],
                "tags": [],
                "creator": "",
                "character_version": "",
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
        return self.validator.normalize(empty)

    def write_metadata(self, image_data: bytes, metadata: Dict) -> bytes:
        """Write character metadata to a PNG file."""
        try:
            validated_metadata = self.validator.normalize(metadata)
            # Encode metadata to base64
            json_str = json.dumps(validated_metadata)
            base64_str = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')

            # Set up PNG info
            png_info = PngImagePlugin.PngInfo()
            png_info.add_text('chara', base64_str)

            # Create output buffer
            output = BytesIO()
            
            # Open and save image with new metadata
            with Image.open(BytesIO(image_data)) as img:
                img.save(output, format="PNG", pnginfo=png_info)

            return output.getvalue()

        except Exception as e:
            self.logger.log_error(f"Failed to write metadata: {str(e)}")
            raise

    def _decode_backyard_metadata(self, raw_data: Union[str, bytes]) -> Dict:
        """Decode Backyard.ai metadata format."""
        try:
            # Handle ASCII prefix
            if isinstance(raw_data, bytes) and raw_data.startswith(b'ASCII\x00\x00\x00'):
                raw_data = raw_data[8:]
            
            # Convert bytes to string
            if isinstance(raw_data, bytes):
                raw_data = raw_data.decode('utf-8')
            
            # Parse JSON
            data = json.loads(raw_data)
            
            if 'character' in data:
                char_data = data['character']
                if 'basePrompt' in char_data:
                    base_prompt = json.loads(char_data['basePrompt'])
                    # Extract character details
                    for key in base_prompt:
                        if key.endswith('_details'):
                            details = base_prompt[key]['template']
                            return {
                                'name': details.get('name', ''),
                                'description': details.get('appearance', {}).get('body_type', ''),
                                'personality': self._format_personality(details.get('personality', {})),
                                'first_mes': char_data.get('firstMessage', ''),
                                'scenario': base_prompt.get('scenario', ''),
                                'mes_example': '',
                                'creator_notes': '',
                                'system_prompt': json.dumps(base_prompt.get('guidelines', {})),
                                'post_history_instructions': '',
                                'alternate_greetings': [],
                                'tags': [],
                                'creator': '',
                                'character_version': '1.0',
                                'character_book': {
                                    'entries': self._convert_lore_items(data.get('loreItems', [])),
                                    'name': '',
                                    'description': '',
                                    'scan_depth': 100,
                                    'token_budget': 2048,
                                    'recursive_scanning': False,
                                    'extensions': {}
                                }
                            }
            return {}
        except Exception as e:
            self.logger.log_error(f"Failed to decode Backyard metadata: {str(e)}")
            return {}

    def _format_personality(self, personality_data: Dict) -> str:
        """Format personality data into string."""
        traits = []
        for key in ['defining_characteristics', 'flaws', 'quirks']:
            if key in personality_data:
                traits.extend(personality_data[key])
        return '\n'.join(f"- {trait}" for trait in traits)

    def _convert_lore_items(self, lore_items: List[Dict]) -> List[Dict]:
        """Convert Backyard lore items to character book entries."""
        entries = []
        for item in lore_items:
            entries.append({
                'keys': [item.get('key', '')],
                'content': item.get('value', ''),
                'enabled': True,
                'insertion_order': 0,
                'case_sensitive': False,
                'priority': 0
            })
        return entries