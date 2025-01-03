from PIL import Image, PngImagePlugin
from typing import Dict, Optional, Union, BinaryIO
from io import BytesIO
import base64
import json

class PngMetadataHandler:
    """Handles reading and writing character card metadata in PNG files."""
    
    def __init__(self, logger):
        self.logger = logger

    def read_metadata(self, file_data: Union[bytes, BinaryIO]) -> Dict:
        """Read character metadata from a PNG file."""
        try:
            # Open image from bytes or file-like object
            image = Image.open(BytesIO(file_data) if isinstance(file_data, bytes) else file_data)
            
            # Check for character data
            metadata = None
            raw_data = None
            
            # Try chara field first
            if 'chara' in image.info:
                raw_data = image.info['chara']
                self.logger.log_step("Found metadata in 'chara' field")
                
            # Try UserComment in EXIF
            if not raw_data and 'exif' in image.info:
                exif = image._getexif()
                if exif and 0x9286 in exif:  # 0x9286 is UserComment tag
                    raw_data = exif[0x9286]
                    self.logger.log_step("Found metadata in EXIF UserComment")
            
            if raw_data:
                self.logger.log_step(f"Raw data starts with: {str(raw_data)[:30]}")
                metadata = self._decode_metadata(raw_data)
                
            if not metadata:
                self.logger.log_step("No character data found")
                return self._create_empty_card()
                
            # Handle different formats
            if metadata.get('spec') == 'chara_card_v2':
                return metadata
            elif self._is_backyard_format(metadata):
                self.logger.log_step("Found Backyard format")
                converted = self._convert_backyard_to_v2(metadata)
                self.logger.log_step("Conversion result structure:")
                self.logger.log_step(json.dumps(converted, indent=2)[:200] + "...")
                return converted
            else:
                self.logger.log_step("Unknown format")
                return self._create_empty_card()
                
        except Exception as e:
            self.logger.log_error(f"Failed to read metadata: {str(e)}")
            raise

    def _decode_metadata(self, encoded_data: str) -> Dict:
        """Decode base64 metadata from PNG."""
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
                return json.loads(decoded)
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

    def _convert_backyard_to_v2(self, data: Dict) -> Dict:
        """Convert Backyard.ai format to V2."""
        try:
            self.logger.log_step("Starting Backyard format conversion")
            self.logger.log_step(f"Input data keys: {list(data.keys())}")
            
            v2_data = self._create_empty_card()
            
            # Extract character data if nested
            char_data = data.get('character', data)
            
            # Log the character data structure
            self.logger.log_step("Character data structure:")
            self.logger.log_step(json.dumps({
                "top_level_keys": list(data.keys()),
                "character_keys": list(char_data.keys()) if isinstance(char_data, dict) else "not a dict",
                "lorebook_test": char_data.get('Lorebook') if isinstance(char_data, dict) else None,
                "alternate_lorebook_test": char_data.get('lorebook') if isinstance(char_data, dict) else None
            }, indent=2))
            
            # Map basic fields
            v2_data['data'].update({
                "name": char_data.get('aiName', ''),
                "description": char_data.get('basePrompt', ''),
                "personality": char_data.get('aiPersona', ''),
                "first_mes": char_data.get('firstMessage', ''),
                "mes_example": char_data.get('customDialogue', ''),
                "scenario": char_data.get('scenario', ''),
                "creator_notes": char_data.get('authorNotes', ''),
                "tags": [tag.get('name') for tag in char_data.get('Tags', []) if 'name' in tag],
                "creator": char_data.get('Author', {}).get('username', '') or char_data.get('creator', ''),
                "character_version": "1.0",
                "system_prompt": "",
                "post_history_instructions": "",
                "alternate_greetings": []
            })

            # Check for lore items
            self.logger.log_step("Checking for lore items...")
            
            # First check for direct loreItems array
            lore_items = char_data.get('loreItems', [])
            if lore_items:
                self.logger.log_step(f"Found {len(lore_items)} lore items")
                self.logger.log_step(f"Sample lore item: {json.dumps(lore_items[0] if lore_items else {})}")
                
                entries = []
                for idx, item in enumerate(lore_items):
                    entry = {
                        'keys': [k.strip() for k in item.get('key', '').split(',') if k.strip()],
                        'content': item.get('content', ''),  # Note: might be 'content' instead of 'value'
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
                self.logger.log_step(f"Processed {len(entries)} lore entries")
            lorebook = char_data.get('Lorebook', {})
            self.logger.log_step(f"Lorebook data: {lorebook}")
            
            if lorebook and isinstance(lorebook, dict):
                lore_items = lorebook.get('LorebookItems', [])
                self.logger.log_step(f"Found {len(lore_items)} lore items")
                
                entries = []
                for idx, item in enumerate(lore_items):
                    self.logger.log_step(f"Processing lore item {idx}: {item}")
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
                    self.logger.log_step(f"Converted to entry: {entry}")
                
                v2_data['data']['character_book']['entries'] = entries
                self.logger.log_step(f"Added {len(entries)} entries to character book")

            self.logger.log_step("Completed conversion to V2 format")
            
            # Log the final character book structure
            if v2_data['data']['character_book']['entries']:
                self.logger.log_step("Final character book structure:")
                self.logger.log_step(json.dumps(v2_data['data']['character_book'], indent=2))
            else:
                self.logger.log_step("No lore entries found in final conversion")
                
            return v2_data

        except Exception as e:
            self.logger.log_error(f"Error during conversion: {str(e)}")
            raise

    def _create_empty_card(self) -> Dict:
        """Create an empty V2 character card structure."""
        return {
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

    def write_metadata(self, image_data: bytes, metadata: Dict) -> bytes:
        """Write character metadata to a PNG file."""
        try:
            # Encode metadata to base64
            json_str = json.dumps(metadata)
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