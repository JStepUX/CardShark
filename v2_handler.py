from PIL.ExifTags import TAGS
import json
import base64
from datetime import datetime, timezone

class V2CardHandler:
    def __init__(self, logger):
        """Initialize V2 card handler with logger."""
        self.logger = logger
        self.placeholder_mappings = {
            '{character}': '{{char}}',
            '{user}': '{{user}}'
        }

    def create_empty_v2_card(self):
        """Create an empty V2 card structure with complete field mapping and correct ordering."""
        return {
            "data": {  
                "name": "",
                "description": "",
                "personality": "",
                "first_mes": "",
                "avatar": "none",
                "mes_example": "",
                "scenario": "",
                "creator_notes": "",
                "system_prompt": "",
                "post_history_instructions": "",
                "alternate_greetings": [],
                "tags": [],
                "creator": "",
                "character_version": "main",
                "extensions": {
                    "fav": None,
                    "chub": {
                        "expressions": None,
                        "alt_expressions": {},
                        "id": None,
                        "full_path": None,
                        "related_lorebooks": [],
                        "background_image": None,
                        "preset": None,
                        "extensions": []
                    },
                    "world": None,
                    "depth_prompt": {
                        "prompt": "",
                        "depth": 0
                    },
                    "talkativeness": None
                }
            },
            "character_book": {
                "name": "",
                "description": "",
                "scan_depth": 2,
                "token_budget": 512,
                "recursive_scanning": False,
                "extensions": {},
                "entries": []
            },
            "spec": "chara_card_v2",  # Moved to end
            "spec_version": "2.0"     # Moved to end
        }

    def create_empty_character_book_entry(self, insertion_order=0):
        """Create an empty character book entry with complete field mapping."""
        return {
            "name": "",
            "keys": [],
            "secondary_keys": [],
            "content": "",
            "enabled": True,
            "insertion_order": insertion_order,
            "case_sensitive": False,
            "priority": 10,
            "id": insertion_order,
            "comment": "",
            "selective": False,
            "constant": False,
            "position": "after_char",
            "extensions": {
                "depth": 4,
                "linked": False,
                "weight": 10,
                "addMemo": True,
                "embedded": True,
                "probability": 100,
                "displayIndex": insertion_order,
                "selectiveLogic": 0,
                "useProbability": True,
                "characterFilter": None,
                "excludeRecursion": True
            },
            "probability": 100,
            "selectiveLogic": 0
        }

    def convert_placeholders(self, text):
        """Convert old style placeholders to V2 format."""
        if not isinstance(text, str):
            return text
        result = text
        for old, new in self.placeholder_mappings.items():
            result = result.replace(old, new)
        return result

    def convert_v1_to_v2(self, v1_data):
        """Convert V1 character card format to V2 format."""
        try:
            self.logger.log_step("Converting V1 data to V2 format")
            self.logger.log_step("V1 data structure:", v1_data)
            
            v2_card = self.create_empty_v2_card()
            char_data = v1_data.get('character', {})
            
            # Log the V1 lore items we're starting with
            lore_items = char_data.get('loreItems', [])
            self.logger.log_step(f"Found {len(lore_items)} V1 lore items:", lore_items)
            
            # Map basic fields and convert placeholders
            v2_card['data'].update({
                'name': char_data.get('aiDisplayName', ''),
                'description': self.convert_placeholders(char_data.get('basePrompt', '')),
                'first_mes': self.convert_placeholders(char_data.get('firstMessage', '')),
                'mes_example': self.convert_placeholders(char_data.get('customDialogue', '')),
                'scenario': self.convert_placeholders(char_data.get('scenario', '')),
                'personality': self.convert_placeholders(char_data.get('aiPersona', '')),
                'creator_notes': self.convert_placeholders(char_data.get('creatorNotes', '')),
                'system_prompt': self.convert_placeholders(char_data.get('systemPrompt', '')),
                'post_history_instructions': self.convert_placeholders(char_data.get('postHistoryInstructions', '')),
                'tags': char_data.get('tags', []),
                'creator': char_data.get('creator', ''),
                'character_version': char_data.get('version', '')
            })
            
            # Convert lore items to character book entries
            v2_entries = []
            for idx, item in enumerate(lore_items):
                self.logger.log_step(f"Converting lore item {idx}:", item)
                
                # Create base entry
                entry = self.create_empty_character_book_entry(idx)
                
                # Update with basic V1 data
                entry.update({
                    'keys': [key.strip() for key in item.get('key', '').split(',')],
                    'content': self.convert_placeholders(item.get('value', '')),
                    'id': idx
                })
                
                # If there was V2 metadata stored in V1 format, restore it
                metadata = item.get('metadata', {})
                if metadata:
                    self.logger.log_step(f"Found metadata for item {idx}:", metadata)
                    entry.update({
                        'case_sensitive': metadata.get('case_sensitive', False),
                        'priority': metadata.get('priority', 10),
                        'constant': metadata.get('constant', False),
                        'position': metadata.get('position', 'after_char'),
                        'name': metadata.get('name', ''),
                        'comment': metadata.get('comment', ''),
                        'selective': metadata.get('selective', False),
                        'probability': metadata.get('probability', 100),
                        'selectiveLogic': metadata.get('selectiveLogic', 0)
                    })
                    
                    # Update extensions if they exist
                    if 'extensions' in metadata:
                        entry['extensions'].update(metadata['extensions'])
                    
                    if metadata.get('selective'):
                        secondary_keys = [key.strip() for key in 
                                    (metadata.get('secondary_keys', []) or [])]
                        if secondary_keys:
                            entry['secondary_keys'] = secondary_keys
                
                self.logger.log_step(f"Created V2 entry {idx}:", entry)
                v2_entries.append(entry)
            
            # Store entries in the character book section
            v2_card['character_book']['entries'] = v2_entries
            
            self.logger.log_step(f"Converted {len(v2_entries)} entries. Final V2 card structure:", v2_card)
            
            return v2_card
            
        except Exception as e:
            self.logger.log_step(f"Error converting V1 to V2 format: {str(e)}")
            return None

    def read_character_data(self, image):
        """Read and decode character data from image metadata."""
        try:
            # Log all available fields
            self.logger.log_step("Available image info fields:", list(image.info.keys()))
            
            # First try V2 format (chara field) as it's simpler
            chara_field = next((k for k in image.info.keys() if k.lower() == 'chara'), None)
            if chara_field:
                self.logger.log_step(f"Found chara field")
                chara_data = image.info[chara_field]
                data = self.read_chara_field(chara_data)
                if data:
                    return data

            # Try UserComment
            if hasattr(image, '_getexif'):
                self.logger.log_step("Looking for UserComment in EXIF")
                exif = image._getexif()
                if exif and 0x9286 in exif:  # 0x9286 is UserComment tag
                    user_comment = exif[0x9286]
                    self.logger.log_step(f"Found UserComment data")
                    
                    # Handle bytes or string
                    if isinstance(user_comment, bytes):
                        try:
                            user_comment = user_comment.decode('utf-8')
                        except UnicodeDecodeError:
                            user_comment = user_comment.decode('latin1')
                    
                    # Clean up ASCII prefix if present
                    if user_comment.startswith('ASCII\x00\x00\x00'):
                        user_comment = user_comment[8:]
                    elif user_comment.startswith('ASCII'):
                        user_comment = user_comment[5:]
                    
                    user_comment = user_comment.strip('\x00')
                    self.logger.log_step(f"Cleaned UserComment starts with: {user_comment[:50]}")
                    
                    # If it starts with eyJ it's likely base64
                    if user_comment.startswith('eyJ'):
                        try:
                            decoded = base64.b64decode(user_comment).decode('utf-8')
                            data = json.loads(decoded)
                            
                            # Check if it's already V2 format
                            if data.get('spec') == 'chara_card_v2':
                                self.logger.log_step("Found V2 format in UserComment")
                                return data
                            # If not V2, check if it's V1 format
                            elif 'character' in data:
                                self.logger.log_step("Found V1 format in UserComment, converting to V2")
                                converted_data = self.convert_v1_to_v2(data)
                                # Only create empty character book if no lore entries exist
                                if not converted_data.get('character_book', {}).get('entries'):
                                    self.logger.log_step("Creating empty character book structure")
                                    converted_data['character_book'] = {
                                        'name': '',
                                        'description': '',
                                        'scan_depth': 2,
                                        'token_budget': 512,
                                        'recursive_scanning': False,
                                        'extensions': {},
                                        'entries': []
                                    }
                                return converted_data
                        except Exception as e:
                            self.logger.log_step(f"Error decoding base64 data: {str(e)}")

            self.logger.log_step("No valid character data found")
            return None
            
        except Exception as e:
            self.logger.log_step(f"Error reading character data: {str(e)}")
            return None
        
    def read_chara_field(self, chara_data):
        """Read and decode character data from the chara field."""
        try:
            self.logger.log_step("Decoding chara field data")
            
            # Handle bytes or string input
            if isinstance(chara_data, bytes):
                try:
                    chara_data = chara_data.decode('utf-8')
                except UnicodeDecodeError:
                    chara_data = chara_data.decode('latin1')
            
            # Clean up any ASCII prefix if present
            if chara_data.startswith('ASCII\x00\x00\x00'):
                chara_data = chara_data[8:]
            elif chara_data.startswith('ASCII'):
                chara_data = chara_data[5:]
                
            chara_data = chara_data.strip('\x00')
            
            # If it looks like base64 (starts with eyJ), try to decode it
            if chara_data.startswith('eyJ'):
                try:
                    decoded = base64.b64decode(chara_data).decode('utf-8')
                    data = json.loads(decoded)
                    
                    # Check if it's V2 format
                    if data.get('spec') == 'chara_card_v2':
                        self.logger.log_step("Found V2 format in chara field")
                        return data
                    # If not V2, check if it's V1 format that needs conversion
                    elif 'character' in data:
                        self.logger.log_step("Found V1 format in chara field, converting to V2")
                        return self.convert_v1_to_v2(data)
                except Exception as e:
                    self.logger.log_step(f"Error decoding base64 data: {str(e)}")
                    return None
            
            return None
            
        except Exception as e:
            self.logger.log_step(f"Error reading chara field: {str(e)}")
            return None