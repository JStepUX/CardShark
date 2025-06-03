import os
import sys
import json
import time
import hashlib
import uuid
from datetime import datetime
from pathlib import Path
import traceback
from typing import Dict, List, Optional, Union, Generator
import tempfile
import shutil
import io
from backend.api_handler import ApiHandler # Import ApiHandler

class ChatHandler:
    def __init__(self, logger, api_handler: ApiHandler): # Add api_handler parameter
        """Initialize the ChatHandler."""
        self.logger = logger
        self.api_handler = api_handler # Store api_handler instance
        self._current_chat_file = None
        self._character_ids = {}  # Cache of character IDs
        self._active_chats = self._load_active_chats()  # Track active chats per character
        self._file_version = "1.0"  # Track file format version for migrations
        
        # Save optimization variables
        self._pending_saves = {}  # Track pending saves by character ID
        self._save_timers = {}    # Track save timers by character ID
        self._save_interval = 5   # Default autosave interval in seconds
        self._changes_since_save = {}  # Track number of changes since last save
        
        # Chat session management
        self._session_index = {}  # Index of available chat sessions by character
        self._session_metadata = {}  # Cache of chat session metadata

    # --- New Atomic File Operation Helpers ---
    
    def _atomic_write_file(self, target_path: Path, content_writer, create_backup: bool = True) -> bool:
        """Atomically write to a file using a temporary file and rename operation."""
        tmp_path = None
        try:
            target_dir = target_path.parent
            
            # Create backup if requested and file exists
            if create_backup and target_path.exists():
                backup_path = target_path.with_suffix(f"{target_path.suffix}.bak")
                self.logger.log_step(f"Creating backup at {backup_path}")
                try:
                    shutil.copy2(target_path, backup_path)
                except Exception as backup_error:
                    self.logger.log_error(f"Failed to create backup: {backup_error}")
                    # Continue without backup rather than failing
            
            # Write to temporary file
            with tempfile.NamedTemporaryFile(
                mode='w', 
                encoding='utf-8',
                delete=False, 
                dir=target_dir, 
                suffix='.tmp'
            ) as tmp_file:
                tmp_path = Path(tmp_file.name)
                self.logger.log_step(f"Writing to temporary file: {tmp_path}")
                content_writer(tmp_file)
                
            # Verify file integrity
            if not self._verify_file_integrity(tmp_path):
                self.logger.log_error(f"Integrity check failed for {tmp_path}")
                if tmp_path and tmp_path.exists():
                    tmp_path.unlink()
                return False
                
            # Atomic replacement - simplified for Windows compatibility
            try:
                # On Windows, we need to handle the case where target file exists
                if os.name == 'nt' and target_path.exists():
                    # Remove target file first on Windows (it will be recreated by replace)
                    target_path.unlink()
                
                # Atomic move operation (works on both Windows and Unix)
                os.replace(str(tmp_path), str(target_path))
                tmp_path = None  # Successfully moved, don't try to clean up
                
            except Exception as replace_error:
                self.logger.log_error(f"Failed to replace target file: {replace_error}")
                raise
                
            self.logger.log_step(f"Successfully wrote file: {target_path}")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error in atomic file write: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            
            # Clean up temporary file if it still exists
            if tmp_path and tmp_path.exists():
                try:
                    tmp_path.unlink()
                except Exception as cleanup_error:
                    self.logger.log_error(f"Error cleaning up temp file: {str(cleanup_error)}")
            
            return False

    def _verify_file_integrity(self, file_path: Path) -> bool:
        """Verify the integrity of a JSON file by attempting to read it."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = [line.strip() for line in f if line.strip()]
                
            if not lines:
                self.logger.log_warning(f"File is empty: {file_path}")
                return False
                
            metadata = json.loads(lines[0])
            if not isinstance(metadata, dict):
                self.logger.log_warning(f"Metadata is not a dictionary in {file_path}")
                return False
                
            if 'chat_metadata' not in metadata:
                self.logger.log_warning(f"Missing chat_metadata in {file_path}")
                return False
                
            for i, line in enumerate(lines[1:], 1):
                try:
                    message = json.loads(line)
                    if not isinstance(message, dict):
                        self.logger.log_warning(f"Line {i+1} is not a valid message object in {file_path}")
                        return False
                except json.JSONDecodeError:
                    self.logger.log_warning(f"Invalid JSON at line {i+1} in {file_path}")
                    return False
                    
            return True
            
        except json.JSONDecodeError as e:
            self.logger.log_error(f"JSON decode error in {file_path}: {str(e)}")
            return False
        except Exception as e:
            self.logger.log_error(f"Error verifying file {file_path}: {str(e)}")
            return False
            
    def _get_character_uuid(self, character_data: Dict) -> str:
        """Get or generate a UUID for a character."""
        self.logger.log_info(f"_get_character_uuid received character_data: {json.dumps(character_data)}")
        
        # Basic validation - ensure we have a proper character data structure
        if not isinstance(character_data, dict):
            self.logger.log_error(f"Invalid character_data type: {type(character_data)}, expected dict")
            return f"unknown-{int(time.time())}"
        
        if not character_data.get('data', {}).get('name'):
            self.logger.log_warning(f"Character data missing name field: {json.dumps(character_data)[:200]}...")
        
        # Check for character_uuid in the standard location first (new canonical location)
        character_uuid = character_data.get('character_uuid')
        if character_uuid:
            self.logger.log_step(f"Using canonical character UUID (from 'character_uuid' field): {character_uuid}")
            return character_uuid
            
        # Check top-level 'uuid' 
        top_level_uuid = character_data.get('uuid')
        if top_level_uuid:
            self.logger.log_step(f"Using existing character UUID (from top-level 'uuid' field): {top_level_uuid}")
            return top_level_uuid
            
        # Then check top-level 'char_id'
        top_level_char_id = character_data.get('char_id')
        if top_level_char_id:
            self.logger.log_step(f"Using existing character UUID (from top-level 'char_id' field): {top_level_char_id}")
            return top_level_char_id

        # Then check nested 'uuid' inside 'data.extensions'
        nested_uuid = character_data.get('data', {}).get('extensions', {}).get('uuid')
        if nested_uuid:
            self.logger.log_step(f"Using existing character UUID (from 'data.extensions.uuid' field): {nested_uuid}")
            return nested_uuid
            
        name = character_data.get('data', {}).get('name', '')
        self.logger.log_step(f"_get_character_uuid: No 'uuid' or 'char_id' found at top level or in extensions. Trying name from data: '{name}'")
        if name in self._character_ids:
            cached_id = self._character_ids[name]
            self.logger.log_step(f"_get_character_uuid: Found cached ID for name '{name}': {cached_id}")
            return cached_id
            
        generated_char_id = self._generate_character_id(character_data)
        if name:  # Only cache if we have a valid name
            self._character_ids[name] = generated_char_id  # Cache the generated ID            self.logger.log_step(f"Caching generated ID '{generated_char_id}' for character '{name}'")
            self.logger.log_step(f"_get_character_uuid: Generated new ID for name '{name}': {generated_char_id}")
        return generated_char_id
        
    def _verify_character_consistency(self, character_data: Dict) -> Dict:
        """
        Verify the character data consistency and attempt to fix issues.
        This helps prevent UUID inconsistencies when character data doesn't match identity.
        """
        if not isinstance(character_data, dict):
            self.logger.log_error(f"Invalid character data type: {type(character_data)}")
            return character_data
            
        # Check if character has a name
        if not character_data.get('data', {}).get('name'):
            self.logger.log_warning("Character data missing name - this may cause identification issues")
            
        # Ensure character has consistent IDs
        chat_id = character_data.get('chat_id')
        uuid_val = character_data.get('uuid')
        char_id = character_data.get('char_id')
        character_uuid = character_data.get('character_uuid')
        nested_uuid = character_data.get('data', {}).get('extensions', {}).get('uuid')
        
        # If we have multiple ID types, check for consistency
        id_values = [id_val for id_val in [chat_id, uuid_val, char_id, character_uuid, nested_uuid] if id_val]
        
        if len(id_values) > 1 and len(set(id_values)) > 1:
            self.logger.log_warning(f"Character has inconsistent ID values: {id_values}")
            # Use the first valid ID as canonical and propagate it
            canonical_id = id_values[0]
            self.logger.log_step(f"Using '{canonical_id}' as the canonical character ID")
            
            # Propagate canonical ID to all standard locations
            character_data['character_uuid'] = canonical_id
            if 'data' not in character_data:
                character_data['data'] = {}
            if 'extensions' not in character_data['data']:
                character_data['data']['extensions'] = {}
            character_data['data']['extensions']['uuid'] = canonical_id
            
        return character_data
            
    def _generate_character_id(self, character_data: Dict) -> str:
        """Generate a unique, persistent ID for a character."""
        # Ensure json is imported if not already
        import json # Add this if not present at the top of the file
        import hashlib # Add this if not present
        import time # Add this if not present
        self.logger.log_info(f"_generate_character_id received character_data: {json.dumps(character_data)}")
        try:
            # Verify consistency before generating ID
            character_data = self._verify_character_consistency(character_data)
            
            data = character_data.get('data', {})
            name = data.get('name', '')
            desc = data.get('description', '')
            personality = data.get('personality', '')
            unique_string = f"{name}|{desc[:100]}|{personality[:100]}"
            hash_obj = hashlib.md5(unique_string.encode('utf-8'))
            short_hash = hash_obj.hexdigest()[:8]
            safe_name = self._sanitize_filename(name)
            char_id = f"{safe_name}-{short_hash}"
            self.logger.log_step(f"Generated character ID: {char_id}")
            return char_id
        except Exception as e:
            self.logger.log_error(f"Error generating character ID: {str(e)}")
            return f"character-{int(time.time())}"

    def _sanitize_filename(self, name: str) -> str:
        """Remove invalid characters from filename."""
        if not name:
            return "unnamed"
        return "".join(c for c in name if c.isalnum() or c in ('-', '_', ' '))

    def _get_chat_path(self, character_data: Dict) -> Path:
        """Get the chat directory path for a character."""
        char_id = self._get_character_uuid(character_data)
        if getattr(sys, 'frozen', False):
            base_dir = Path(sys.executable).parent
        else:
            base_dir = Path.cwd()
        
        chats_dir = base_dir / 'chats'
        chats_dir.mkdir(parents=True, exist_ok=True)
        
        folders_map_path = chats_dir / 'folders.json'
        folders_map = {}
        if folders_map_path.exists():
            try:
                with open(folders_map_path, 'r', encoding='utf-8') as f:
                    folders_map = json.load(f)
            except Exception as e:
                self.logger.log_error(f"Error loading folders.json: {str(e)}")
        
        if char_id in folders_map:
            clean_name = folders_map[char_id]
            chat_dir = chats_dir / clean_name
            if not chat_dir.exists():
                chat_dir.mkdir(parents=True, exist_ok=True)
            self.logger.log_step(f"Using existing mapped chat directory: {chat_dir}")
            return chat_dir
        
        char_name = self._sanitize_filename(character_data.get('data', {}).get('name', 'unknown'))
        existing_folders = [d.name for d in chats_dir.iterdir() if d.is_dir()]
        existing_clean_names = list(folders_map.values())
        base_name = char_name
        final_name = base_name
        counter = 2
        while final_name in existing_folders or final_name in existing_clean_names:
            final_name = f"{base_name} {counter}"
            counter += 1
        
        chat_dir = chats_dir / final_name
        chat_dir.mkdir(parents=True, exist_ok=True)
        
        folders_map[char_id] = final_name
        try:
            with open(folders_map_path, 'w', encoding='utf-8') as f:
                json.dump(folders_map, f, indent=2)
        except Exception as e:
            self.logger.log_error(f"Error saving folders.json: {str(e)}")
        
        self.logger.log_step(f"Created new chat directory with clean name: {chat_dir}")
        return chat_dir

    def _get_or_create_chat_file(self, character_data: Dict, force_new: bool = False, chat_id: Optional[str] = None) -> Path:
        """Get current chat file or create new one."""
        if self._current_chat_file and self._current_chat_file.exists() and not force_new:
            return self._current_chat_file
            
        chat_dir = self._get_chat_path(character_data)
        
        if not chat_id:
            if force_new:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                char_name = self._sanitize_filename(character_data.get('data', {}).get('name', 'unknown'))
                self._current_chat_file = chat_dir / f"chat_{char_name}_{timestamp}.jsonl"
                self._initialize_chat_file(self._current_chat_file, character_data)
                self.logger.log_step(f"Created new chat file: {self._current_chat_file}")
            else:
                char_name = self._sanitize_filename(character_data.get('data', {}).get('name', 'unknown'))
                chat_files = list(chat_dir.glob(f"chat_{char_name}_*.jsonl"))
                if chat_files:
                    self._current_chat_file = max(chat_files, key=lambda f: f.stat().st_mtime)
                    self.logger.log_step(f"Using existing chat file: {self._current_chat_file}")
                else:
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    self._current_chat_file = chat_dir / f"chat_{char_name}_{timestamp}.jsonl"
                    self._initialize_chat_file(self._current_chat_file, character_data)
                    self.logger.log_step(f"Created new chat file (no existing): {self._current_chat_file}")
        else:
            found = False
            chat_files = list(chat_dir.glob("*.jsonl"))
            for file_path in chat_files:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        first_line = f.readline().strip()
                        if first_line:
                            metadata = json.loads(first_line)
                            file_chat_id = metadata.get('chat_metadata', {}).get('chat_id')
                            if file_chat_id == chat_id:
                                self._current_chat_file = file_path
                                found = True
                                self.logger.log_step(f"Found chat file by ID: {file_path}")
                                break
                except Exception as e:
                    self.logger.log_error(f"Error checking chat file {file_path}: {str(e)}")
                    continue
            
            if not found:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                char_name = self._sanitize_filename(character_data.get('data', {}).get('name', 'unknown'))
                self._current_chat_file = chat_dir / f"chat_{char_name}_{timestamp}.jsonl"
                self._initialize_chat_file(self._current_chat_file, character_data, chat_id)
                self.logger.log_step(f"Created new chat file with ID {chat_id}: {self._current_chat_file}")
        
        return self._current_chat_file

    def _initialize_chat_file(self, file_path: Path, character_data: Dict, chat_id: Optional[str] = None) -> None:
        """Initialize a new chat file with metadata."""
        try:
            char_id_val = self._get_character_uuid(character_data) # Renamed to avoid conflict
            char_name = character_data.get('data', {}).get('name', 'unknown')
            
            if not chat_id:
                chat_id = self.generate_chat_id(character_data)
                self.logger.log_step(f"Generated new chat ID: {chat_id}")
            
            current_time = datetime.now()
            timestamp_millis = int(current_time.timestamp() * 1000)
            
            metadata = {
                "user_name": "User",
                "character_name": char_name,
                "character_id": char_id_val,
                "create_date": current_time.isoformat(),
                "timestamp": timestamp_millis,
                "version": self._file_version,
                "chat_metadata": {
                    "chat_id": chat_id,
                    "tainted": False,
                    "created_timestamp": timestamp_millis,
                    "title": f"Chat with {char_name} - {current_time.strftime('%b %d, %Y')}",
                    "timedWorldInfo": {"sticky": {}, "cooldown": {}},
                    "lastUser": None
                }
            }
            
            def content_writer(f):
                json.dump(metadata, f)
                f.write('\n')
            
            success = self._atomic_write_file(file_path, content_writer, create_backup=False)
            if success:
                self.logger.log_step(f"Successfully initialized chat file: {file_path}")
                try:
                    # char_id_val already defined
                    if char_id_val in self._session_index:
                        self._session_index[char_id_val][chat_id] = {
                            'id': chat_id,
                            'filename': file_path.name,
                            'path': str(file_path),
                            'created': metadata['create_date'],
                            'display_date': current_time.strftime("%b %d, %Y %I:%M %p"),
                            'message_count': 0,
                            'preview': '',
                            'timestamp': current_time.strftime("%Y%m%d_%H%M%S")
                        }
                except Exception as e:
                    self.logger.log_error(f"Error updating session index: {str(e)}")
            else:
                self.logger.log_error(f"Failed to initialize chat file: {file_path}")
                
        except Exception as e:
            self.logger.log_error(f"Error initializing chat file: {str(e)}")
            self.logger.log_error(traceback.format_exc())

    def _format_message(self, msg: Dict, character_name: str) -> Dict:
        """Enhanced format to store message ID and variations for proper syncing."""
        is_user = msg.get('role') == 'user'
        timestamp = msg.get('timestamp', int(time.time() * 1000))
        if isinstance(timestamp, str):
            try:
                timestamp = int(timestamp)
            except:
                timestamp = int(time.time() * 1000)
                
        formatted = {
            "name": "User" if is_user else character_name,
            "is_user": is_user,
            "is_system": False,
            "send_date": datetime.fromtimestamp(timestamp/1000).strftime("%B %d, %Y %I:%M%p"),
            "mes": msg.get('content', ''),
            "extra": {
                "id": msg.get('id', str(timestamp)),
                "edited": 'variations' in msg and len(msg.get('variations', [])) > 1
            }
        }

        if msg.get('variations'):
            formatted['swipe_id'] = msg.get('currentVariation', 0)
            formatted['swipes'] = msg['variations']
            if not is_user:
                formatted['gen_started'] = datetime.fromtimestamp(timestamp/1000).isoformat() + "Z"
                formatted['gen_finished'] = datetime.fromtimestamp((timestamp + 100)/1000).isoformat() + "Z"
                formatted['extra']['api'] = "koboldcpp" # This might need to be dynamic
                formatted['extra']['model'] = msg.get('model', "unknown")
        return formatted

    def _convert_to_internal_format(self, message: Dict) -> Optional[Dict]:
        """Convert a saved message format to our internal format, preserving edits and variations."""
        if "chat_metadata" in message:
            return None
        try:
            timestamp = int(time.time() * 1000)
            if "send_date" in message:
                try:
                    dt = datetime.strptime(message["send_date"], "%B %d, %Y %I:%M%p")
                    timestamp = int(dt.timestamp() * 1000)
                except:
                    pass # Keep default timestamp
                    
            message_id = None
            if "extra" in message and isinstance(message["extra"], dict):
                message_id = message["extra"].get("id")
            if not message_id:
                message_id = str(uuid.uuid4()) # Use uuid.uuid4()
                                        
            converted = {
                "id": message_id,
                "role": "user" if message.get("is_user", False) else "assistant",
                "content": message.get("mes", ""),
                "timestamp": timestamp
            }
            
            if "swipes" in message:
                converted["variations"] = message["swipes"]
                if "swipe_id" in message:
                    converted["currentVariation"] = message.get("swipe_id", 0)
                else:
                    converted["currentVariation"] = len(message["swipes"]) - 1
            return converted
        except Exception as e:
            self.logger.log_error(f"Error converting message to internal format: {str(e)}")
            return None

    def _get_message_id(self, formatted_message: Dict) -> Optional[str]:
        """Extract message ID from formatted message."""
        try:
            return formatted_message.get("extra", {}).get("id")
        except:
            return None

    def append_message(self, character_data: Dict, message: Dict) -> bool:
        """Append a single message to the current chat file."""
        try:
            char_name = character_data.get('data', {}).get('name', 'unknown')
            chat_file = self._get_or_create_chat_file(character_data)
            
            formatted_message = self._format_message(message, char_name)
            
            metadata_line = None
            if chat_file.exists():
                try:
                    with open(chat_file, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                    if lines:
                        metadata_line = lines[0]
                except Exception as e:
                    self.logger.log_error(f"Error reading existing chat file for append: {str(e)}")

            if not metadata_line: 
                self._initialize_chat_file(chat_file, character_data)
                with open(chat_file, 'r', encoding='utf-8') as f: 
                    metadata_line = f.readline()

            if message.get('role') == 'user' and metadata_line:
                try:
                    current_metadata = json.loads(metadata_line)
                    current_metadata['chat_metadata']['lastUser'] = {
                        "name": "User", 
                        "timestamp": message.get('timestamp', int(time.time()*1000))
                    }
                    metadata_line = json.dumps(current_metadata) + '\n'
                except Exception as e:
                    self.logger.log_error(f"Error updating lastUser in metadata: {str(e)}")

            with open(chat_file, 'a', encoding='utf-8') as f:
                json.dump(formatted_message, f)
                f.write('\n')

            self.logger.log_step(f"Appended message to {chat_file}")
            
            char_id_val = self._get_character_uuid(character_data)
            chat_id = None
            if metadata_line:
                try:
                    chat_id = json.loads(metadata_line).get('chat_metadata',{}).get('chat_id')
                except: pass

            if chat_id and char_id_val in self._session_index and chat_id in self._session_index[char_id_val]:
                self._session_index[char_id_val][chat_id]['message_count'] +=1
                self._session_index[char_id_val][chat_id]['preview'] = message.get('content', '')[:50] 

            return True
        except Exception as e:
            self.logger.log_error(f"Error appending message: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False
            
    def save_chat_state(self, character_data: Dict, messages: List[Dict], lastUser: Optional[Dict] = None, api_info: Optional[Dict] = None, metadata: Optional[Dict] = None) -> bool:
        """Save complete chat state to a file with API information and additional metadata."""
        try:
            # Perform consistency check on character data before proceeding
            char_name = character_data.get('data', {}).get('name', 'unknown')
            
            # Check for character name/data mismatch
            expected_name = None
            if metadata and metadata.get('chat_metadata') and metadata['chat_metadata'].get('character_name'):
                expected_name = metadata['chat_metadata'].get('character_name')
            elif messages and len(messages) > 0 and messages[0].get('name'):
                expected_name = messages[0].get('name')
                
            if expected_name and char_name != expected_name:
                self.logger.log_warning(f"MISMATCH DETECTED: Character name in data '{char_name}' doesn't match expected name '{expected_name}'")
                self.logger.log_warning(f"This could indicate character data inconsistency - using expected name '{expected_name}'")
                # Force the name in character_data to match
                if 'data' not in character_data:
                    character_data['data'] = {}
                character_data['data']['name'] = expected_name
                char_name = expected_name
                                
            char_id_val = self._get_character_uuid(character_data)
            
            chat_id = None
            current_chat_metadata = None
            messages_to_save = messages # Default

            if metadata and metadata.get('chat_metadata') and metadata['chat_metadata'].get('chat_id'):
                chat_id = metadata['chat_metadata']['chat_id']
                current_chat_metadata = metadata['chat_metadata']
            elif messages and len(messages) > 0 and "chat_metadata" in messages[0]: 
                 current_chat_metadata = messages[0].get("chat_metadata", {})
                 chat_id = current_chat_metadata.get("chat_id")
                 messages_to_save = messages[1:] 

            chat_file = self._get_or_create_chat_file(character_data, chat_id=chat_id) 
            
            if not chat_id:
                try:
                    with open(chat_file, 'r', encoding='utf-8') as f_read:
                        first_line = f_read.readline().strip()
                        if first_line:
                            file_meta = json.loads(first_line)
                            chat_id = file_meta.get('chat_metadata',{}).get('chat_id')
                            current_chat_metadata = file_meta.get('chat_metadata',{})
                except Exception as e:
                    self.logger.log_error(f"Error reading chat_id from newly created file: {e}")
                    self._initialize_chat_file(chat_file, character_data) 
                    with open(chat_file, 'r', encoding='utf-8') as f_read_retry:
                        first_line_retry = f_read_retry.readline().strip()
                        if first_line_retry:
                             file_meta_retry = json.loads(first_line_retry)
                             chat_id = file_meta_retry.get('chat_metadata',{}).get('chat_id')
                             current_chat_metadata = file_meta_retry.get('chat_metadata',{})

            file_metadata_obj = {
                "user_name": "User", 
                "character_name": char_name,
                "character_id": char_id_val,
                "create_date": current_chat_metadata.get("created_timestamp") if current_chat_metadata else datetime.now().isoformat(), 
                "timestamp": int(time.time() * 1000),
                "version": self._file_version,
                "chat_metadata": {
                    "chat_id": chat_id,
                    "tainted": False, 
                    "created_timestamp": current_chat_metadata.get("created_timestamp", int(time.time() * 1000)) if current_chat_metadata else int(time.time() * 1000),
                    "title": current_chat_metadata.get("title", f"Chat with {char_name} - {datetime.now().strftime('%b %d, %Y')}") if current_chat_metadata else f"Chat with {char_name} - {datetime.now().strftime('%b %d, %Y')}",
                    "timedWorldInfo": current_chat_metadata.get("timedWorldInfo", {"sticky": {}, "cooldown": {}}) if current_chat_metadata else {"sticky": {}, "cooldown": {}},
                    "lastUser": lastUser,
                    "api_info": api_info 
                }
            }
            if metadata: 
                file_metadata_obj["chat_metadata"].update(metadata)

            def content_writer(f):
                json.dump(file_metadata_obj, f)
                f.write('\n')
                for msg_data in messages_to_save: 
                    formatted_msg = self._format_message(msg_data, char_name)
                    json.dump(formatted_msg, f)
                    f.write('\n')
            
            success = self._atomic_write_file(chat_file, content_writer, create_backup=False)

            if success:
                self.logger.log_step(f"Saved chat to {chat_file} with {len(messages_to_save)} messages.")
                if chat_id and char_id_val in self._session_index and chat_id in self._session_index[char_id_val]:
                    self._session_index[char_id_val][chat_id]['message_count'] = len(messages_to_save)
                    if messages_to_save:
                       self._session_index[char_id_val][chat_id]['preview'] = messages_to_save[-1].get('content', '')[:50]
            return success
            
        except Exception as e:
            self.logger.log_error(f"Error saving chat state: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False

    def load_latest_chat(self, character_data: Dict, scan_all_files: bool = True) -> Optional[Dict]: 
        """Load the most recent chat for a character."""
        try:
            chat_dir = self._get_chat_path(character_data)
            char_name_sanitized = self._sanitize_filename(character_data.get('data', {}).get('name', 'unknown'))
            
            active_chat_id = self._get_active_chat_id(character_data)
            if active_chat_id:
                self.logger.log_step(f"Active chat ID found: {active_chat_id}, attempting to load.")
                loaded_chat = self.load_chat(character_data, active_chat_id)
                if loaded_chat and loaded_chat.get("success"):
                    return loaded_chat
                else:
                    self.logger.log_warning(f"Failed to load active chat {active_chat_id}, falling back to latest file.")

            chat_files = list(chat_dir.glob(f"chat_{char_name_sanitized}_*.jsonl"))
            if not chat_files and scan_all_files: 
                 self.logger.log_warning(f"No chat files found for {char_name_sanitized}, scanning all .jsonl files in {chat_dir}")
                 chat_files = list(chat_dir.glob("*.jsonl"))

            if chat_files:
                latest_file = max(chat_files, key=lambda f: f.stat().st_mtime)
                self.logger.log_step(f"Loading latest chat file: {latest_file}")
                try:
                    with open(latest_file, 'r', encoding='utf-8') as f:
                        metadata_line = f.readline()
                        metadata = json.loads(metadata_line)
                        chat_id_from_file = metadata.get('chat_metadata', {}).get('chat_id')
                        if chat_id_from_file:
                            self._update_active_chat(character_data, chat_id_from_file) 
                            return self._load_chat_file(latest_file) 
                        else:
                            self.logger.log_warning(f"Chat ID missing in metadata of {latest_file}")
                            return {"success": False, "message": "Chat ID missing in latest file metadata", "messages": []}
                except Exception as e:
                    self.logger.log_error(f"Error reading chat_id from {latest_file}: {e}")
                    return {"success": False, "message": f"Error reading latest chat file: {e}", "messages": []}

            self.logger.log_warning(f"No chat files found for character {char_name_sanitized}")
            return {"success": False, "message": "No chat files found", "messages": []}
        except Exception as e:
            self.logger.log_error(f"Error loading latest chat: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return {"success": False, "message": str(e), "messages": []}

    def _load_chat_file(self, file_path: Path) -> Dict:
        """Load messages and metadata from a chat file."""
        messages = []
        chat_metadata = {}
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                first_line = f.readline().strip()
                if first_line:
                    try:
                        metadata_obj = json.loads(first_line)
                        if not isinstance(metadata_obj, dict) or "chat_metadata" not in metadata_obj:
                            self.logger.log_error(f"Invalid or missing metadata in {file_path}")
                            return {"success": False, "message": "Invalid or missing metadata", "messages": []}
                        chat_metadata = metadata_obj.get("chat_metadata", {})
                        # Don't store the full metadata in chat_metadata to avoid circular references
                        # Instead store only the essential fields separately
                        char_name = metadata_obj.get('character_name', 'Unknown')
                        user_name = metadata_obj.get('user_name', 'User')
                        create_date = metadata_obj.get('create_date', datetime.now().isoformat())
                    except json.JSONDecodeError as e:
                        self.logger.log_error(f"Error decoding metadata in {file_path}: {e}")
                        return {"success": False, "message": f"Error decoding metadata: {e}", "messages": []}

                for line_num, line_content in enumerate(f, 2): 
                    line_content = line_content.strip()
                    if line_content:
                        try:
                            msg_data = json.loads(line_content)
                            internal_msg = self._convert_to_internal_format(msg_data)
                            if internal_msg:
                                messages.append(internal_msg)
                        except json.JSONDecodeError as e:
                            self.logger.log_warning(f"Skipping invalid JSON line {line_num} in {file_path}: {e}")
                        except Exception as e_conv:
                             self.logger.log_warning(f"Skipping message due to conversion error on line {line_num} in {file_path}: {e_conv}")

            if not chat_metadata.get("chat_id"):
                 try:
                    parts = file_path.stem.split('_')
                    if len(parts) >= 3 and parts[0] == 'chat':
                        chat_metadata["chat_id"] = "_".join(parts[1:]) 
                        self.logger.log_warning(f"Chat ID was missing, derived from filename: {chat_metadata['chat_id']}")
                 except:
                    self.logger.log_error(f"Chat ID missing and could not be derived from filename: {file_path.name}")
                    return {"success": False, "message": "Chat ID missing in metadata", "messages": []}
            
            # Use the character_name from the top-level metadata
            char_name = metadata_obj.get('character_name', 'Unknown')

            return {
                "success": True,
                "chat_id": chat_metadata.get("chat_id"),
                "messages": messages,
                "metadata": chat_metadata, 
                "character_name": char_name 
            }
        except Exception as e:
            self.logger.log_error(f"Error loading chat file {file_path}: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return {"success": False, "message": str(e), "messages": []}

    def load_chat(self, character_data: Dict, chat_id: str) -> Optional[Dict]:
        """Load a specific chat by ID."""
        try:
            chat_dir = self._get_chat_path(character_data)
            chat_files = list(chat_dir.glob("*.jsonl"))
            
            for file_path in chat_files:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        first_line = f.readline().strip()
                        if first_line:
                            metadata = json.loads(first_line)
                            if metadata.get("chat_metadata", {}).get("chat_id") == chat_id:
                                self.logger.log_step(f"Found chat {chat_id} in file: {file_path}")
                                self._current_chat_file = file_path 
                                self._update_active_chat(character_data, chat_id) 
                                return self._load_chat_file(file_path) 
                except Exception as e:
                    self.logger.log_error(f"Error processing file {file_path} for chat ID {chat_id}: {e}")
                    continue 
            
            self.logger.log_warning(f"Chat with ID {chat_id} not found for character.")
            return {"success": False, "message": "Chat not found", "messages": []}
        except Exception as e:
            self.logger.log_error(f"Error loading chat by ID {chat_id}: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return {"success": False, "message": str(e), "messages": []}

    def create_new_chat(self, character_data: Dict) -> Optional[Dict]:
        """Create a new empty chat for a character."""
        try:
            char_name_for_log = character_data.get('data', {}).get('name', 'UnknownCharacter')
            self.logger.log_step(f"Attempting to create new chat for: {char_name_for_log}")
            
            chat_file_path = self._get_or_create_chat_file(character_data, force_new=True)
            
            new_chat_id = None
            try:
                with open(chat_file_path, 'r', encoding='utf-8') as f:
                    first_line = f.readline().strip()
                    if first_line:
                        metadata = json.loads(first_line)
                        new_chat_id = metadata.get("chat_metadata", {}).get("chat_id")
            except Exception as e:
                self.logger.log_error(f"Failed to read chat_id from new chat file {chat_file_path}: {e}")
                return {"success": False, "message": "Failed to retrieve new chat ID after creation."}

            if not new_chat_id:
                self.logger.log_error(f"New chat ID is None after creating file {chat_file_path}")
                return {"success": False, "message": "Failed to generate a valid new chat ID."}

            self.logger.log_step(f"New chat created with ID: {new_chat_id} at {chat_file_path}")
            self._update_active_chat(character_data, new_chat_id) 

            return {
                "success": True,
                "chat_id": new_chat_id,
                "messages": [],
                "metadata": {"chat_id": new_chat_id, "title": f"Chat with {char_name_for_log} - {datetime.now().strftime('%b %d, %Y')}"} 
            }
        except Exception as e:
            self.logger.log_error(f"Error creating new chat: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return {"success": False, "message": str(e)}

    def list_character_chats(self, character_data: Dict, scan_all_files: bool = False) -> List[Dict]:
        """List all chat sessions for a character, optionally scanning all files if specific ones aren't found."""
        chats = []
        try:
            chat_dir = self._get_chat_path(character_data)
            char_name_sanitized = self._sanitize_filename(character_data.get('data', {}).get('name', 'unknown'))
            
            chat_files = list(chat_dir.glob(f"chat_{char_name_sanitized}_*.jsonl"))

            if not chat_files and scan_all_files:
                self.logger.log_warning(f"No specific chat files for {char_name_sanitized}, scanning all .jsonl files in {chat_dir}")
                chat_files = list(chat_dir.glob("*.jsonl"))
            
            for file_path in sorted(chat_files, key=lambda f: f.stat().st_mtime, reverse=True):
                try:
                    filename = file_path.name
                    with open(file_path, 'r', encoding='utf-8') as f:
                        line = f.readline().strip()
                        if line:
                            try:
                                metadata = json.loads(line)
                                chat_meta = metadata.get("chat_metadata", {})
                                chat_id = chat_meta.get("chat_id")
                                
                                if not chat_id: 
                                    parts = file_path.stem.split('_')
                                    if len(parts) >=3 and parts[0] == 'chat':
                                        chat_id = "_".join(parts[1:])
                                    else:
                                        chat_id = file_path.stem 

                                message_count = 0
                                preview_content = ""
                                for i, msg_line_content in enumerate(f): 
                                    if msg_line_content.strip():
                                        message_count +=1
                                        if not preview_content: 
                                            try:
                                                msg_obj = json.loads(msg_line_content)
                                                preview_content = msg_obj.get("mes","")[:50] 
                                            except: pass

                                create_date_val = metadata.get("create_date", file_path.stat().st_mtime)
                                create_date = None
                                if isinstance(create_date_val, str):
                                    try:
                                        create_date = datetime.fromisoformat(create_date_val)
                                    except ValueError:
                                        self.logger.log_warning(f"Could not parse create_date string '{create_date_val}' as ISO format for {file_path.name}. Falling back to file mtime.")
                                elif isinstance(create_date_val, (int, float)):
                                    # If int, assume milliseconds if it's a large number (typical for JS timestamps)
                                    # st_mtime is float in seconds
                                    if isinstance(create_date_val, int) and create_date_val > 10**12: # Likely milliseconds
                                        create_date = datetime.fromtimestamp(create_date_val / 1000.0)
                                    else: # Float (seconds) or smaller int (assume seconds)
                                        create_date = datetime.fromtimestamp(create_date_val)
                                
                                if create_date is None: # Fallback if parsing failed or type was unexpected
                                    self.logger.log_warning(f"Unexpected type for create_date_val '{type(create_date_val)}' for {file_path.name}. Falling back to file mtime.")
                                    create_date = datetime.fromtimestamp(file_path.stat().st_mtime)
                                
                                display_date = create_date.strftime("%b %d, %Y %I:%M %p")
                                timestamp_sort = create_date.strftime("%Y%m%d_%H%M%S")

                                chats.append({
                                    "id": chat_id,
                                    "filename": filename,
                                    "path": str(file_path),
                                    "created": create_date.isoformat(),
                                    "display_date": display_date,
                                    "message_count": message_count,
                                    "preview": preview_content,
                                    "timestamp": timestamp_sort, 
                                    "title": chat_meta.get("title", f"Chat from {display_date}")
                                })
                            except json.JSONDecodeError:
                                self.logger.log_warning(f"Skipping file with invalid JSON metadata: {filename}")
                except Exception as e:
                    self.logger.log_error(f"Error processing chat file {file_path.name}: {e}")
            
            chats.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            
            char_id_val = self._get_character_uuid(character_data)
            self._session_index[char_id_val] = {chat['id']: chat for chat in chats}
            
            return chats
        except Exception as e:
            self.logger.log_error(f"Error listing character chats: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return []

    def get_all_chats(self, character_data: Dict) -> List[Dict]:
        """Get a list of all chat sessions for a character."""
        try:
            all_chats_found = self.list_character_chats(character_data, scan_all_files=True)
            expected_char_uuid = self._get_character_uuid(character_data)
            validated_chats = []
            for chat_info in all_chats_found:
                try:
                    file_path = Path(chat_info['path'])
                    with open(file_path, 'r', encoding='utf-8') as f:
                        metadata_line = f.readline().strip()
                        if metadata_line:
                            metadata = json.loads(metadata_line)
                            file_char_id = metadata.get('character_id')
                            if file_char_id == expected_char_uuid:
                                validated_chats.append(chat_info)
                            else:
                                self.logger.log_warning(f"Skipping chat {chat_info['id']} from {file_path.name}: character_id mismatch (expected {expected_char_uuid}, got {file_char_id})")
                except Exception as e:
                    self.logger.log_error(f"Error validating chat file {chat_info.get('path', 'N/A')}: {e}")
            return validated_chats
        except Exception as e:
            self.logger.log_error(f"Error in get_all_chats: {str(e)}")
            return []

    def delete_chat(self, character_data: Dict, chat_id: str) -> bool:
        """Delete a specific chat file by chat ID."""
        try:
            chat_dir = self._get_chat_path(character_data)
            chat_files = list(chat_dir.glob("*.jsonl"))
            
            for file_path in chat_files:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        first_line = f.readline().strip()
                        if first_line:
                            metadata = json.loads(first_line)
                            if metadata.get("chat_metadata", {}).get("chat_id") == chat_id:
                                f.close() 
                                file_path.unlink() 
                                self.logger.log_step(f"Deleted chat file: {file_path}")
                                char_id_val = self._get_character_uuid(character_data)
                                if char_id_val in self._session_index and chat_id in self._session_index[char_id_val]:
                                    del self._session_index[char_id_val][chat_id]
                                if self._get_active_chat_id(character_data) == chat_id:
                                    self._active_chats.pop(char_id_val, None)
                                    self._save_active_chats()
                                return True
                except Exception as e:
                    self.logger.log_error(f"Error processing file {file_path} for deletion: {e}")
                    continue
            
            self.logger.log_warning(f"Chat with ID {chat_id} not found for deletion.")
            return False
        except Exception as e:
            self.logger.log_error(f"Error deleting chat by ID {chat_id}: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False

    def _load_active_chats(self) -> Dict[str, str]:
        """Load the mapping of character IDs to their current active chat IDs."""
        try:
            if getattr(sys, 'frozen', False):
                base_dir = Path(sys.executable).parent
            else:
                base_dir = Path.cwd()
            active_chats_file = base_dir / 'chats' / 'active_chats.json'
            if active_chats_file.exists():
                with open(active_chats_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return {}
        except Exception as e:
            self.logger.log_error(f"Error loading active_chats.json: {e}")
            return {}

    def _save_active_chats(self) -> None:
        """Save the mapping of character IDs to their current active chat IDs."""
        try:
            if getattr(sys, 'frozen', False):
                base_dir = Path(sys.executable).parent
            else:
                base_dir = Path.cwd()
            active_chats_file = base_dir / 'chats' / 'active_chats.json'
            active_chats_file.parent.mkdir(parents=True, exist_ok=True) 
            with open(active_chats_file, 'w', encoding='utf-8') as f:
                json.dump(self._active_chats, f, indent=2)
        except Exception as e:
            self.logger.log_error(f"Error saving active_chats.json: {e}")

    def _update_active_chat(self, character_data: Dict, chat_id: str) -> None:
        """Update the active chat ID for a character."""
        try:
            char_id_val = self._get_character_uuid(character_data)
            self._active_chats[char_id_val] = chat_id
            self._save_active_chats()
        except Exception as e:
            self.logger.log_error(f"Error updating active chat: {e}")

    def _get_active_chat_id(self, character_data: Dict) -> Optional[str]:
        """Get the active chat ID for a character."""
        try:
            char_id_val = self._get_character_uuid(character_data)
            return self._active_chats.get(char_id_val)
        except Exception as e:
            self.logger.log_error(f"Error getting active chat ID: {e}")
            return None

    def _get_character_folder(self, character_id: str) -> Optional[Path]:
        """Get the chat directory for a character based on its ID."""
        try:
            self.logger.log_step(f"Getting folder for character ID: {character_id}")
            if getattr(sys, 'frozen', False):
                base_dir = Path(sys.executable).parent
            else:
                base_dir = Path.cwd()
            chats_dir = base_dir / 'chats'
            
            folders_map_path = chats_dir / 'folders.json'
            if not folders_map_path.exists():
                self.logger.log_warning("folders.json not found, cannot map character_id to folder name.")
                return None
            
            folders_map = {}
            try:
                with open(folders_map_path, 'r', encoding='utf-8') as f:
                    folders_map = json.load(f)
            except Exception as e:
                self.logger.log_error(f"Error loading folders.json: {str(e)}")
                return None
            
            folder_name = folders_map.get(character_id)
            if folder_name:
                char_folder = chats_dir / folder_name
                if char_folder.exists() and char_folder.is_dir():
                    return char_folder
                else:
                    self.logger.log_warning(f"Mapped folder {char_folder} for {character_id} does not exist or is not a directory.")
                    return None 
            else:
                self.logger.log_warning(f"Character ID {character_id} not found in folders.json map.")
                return None
        except Exception as e:
            self.logger.log_error(f"Error in _get_character_folder: {str(e)}")
            return None

    # --- File Validation and Repair ---
    def validate_chat_file(self, file_path: Path, attempt_repair: bool = False) -> Dict[str, any]:
        """Validate a chat file for structural integrity and JSON validity, optionally repair."""
        issues = []
        is_valid = True
        line_validation = [] 

        if not file_path.exists():
            issues.append(f"File does not exist: {file_path}")
            return {"is_valid": False, "issues": issues, "repaired": False}

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()

            if not lines:
                issues.append("File is empty.")
                return {"is_valid": False, "issues": issues, "repaired": False}

            try:
                metadata = json.loads(lines[0])
                if not isinstance(metadata, dict) or "chat_metadata" not in metadata:
                    issues.append("Invalid or missing metadata object on line 1.")
                    is_valid = False
                line_validation.append({"line": 1, "valid": isinstance(metadata, dict) and "chat_metadata" in metadata, "type": "metadata"})
            except json.JSONDecodeError as e:
                issues.append(f"Metadata (line 1) is not valid JSON: {e}")
                is_valid = False
                line_validation.append({"line": 1, "valid": False, "error": str(e), "type": "metadata"})

            for i, line_content in enumerate(lines[1:], 2):
                line_content = line_content.strip()
                if not line_content: 
                    line_validation.append({"line": i, "valid": True, "type": "empty"})
                    continue
                try:
                    message = json.loads(line_content)
                    if not isinstance(message, dict): 
                        issues.append(f"Message on line {i} is not a valid JSON object.")
                        is_valid = False
                        line_validation.append({"line": i, "valid": False, "error": "Not a JSON object", "type": "message"})
                    else:
                        line_validation.append({"line": i, "valid": True, "type": "message"})
                except json.JSONDecodeError as e:
                    issues.append(f"Message on line {i} is not valid JSON: {e}")
                    is_valid = False
                    line_validation.append({"line": i, "valid": False, "error": str(e), "type": "message"})
            
            repaired_status = False
            if not is_valid and attempt_repair:
                self.logger.log_warning(f"Attempting to repair chat file: {file_path} with issues: {issues}")
                repaired_status = self._repair_chat_file(file_path, line_validation, issues)
                if repaired_status:
                    self.logger.log_info(f"Repair attempt for {file_path} finished. Status: {repaired_status}")

            return {"is_valid": is_valid, "issues": issues, "repaired": repaired_status, "line_validation": line_validation}

        except Exception as e:
            self.logger.log_error(f"Error validating chat file {file_path}: {str(e)}")
            issues.append(f"General validation error: {str(e)}")
            return {"is_valid": False, "issues": issues, "repaired": False}

    def _repair_chat_file(self, file_path: Path, line_validation: List[Dict], issues: List[str]) -> bool:
        """Attempt to repair a chat file by removing invalid lines."""
        try:
            self.logger.log_step(f"Repairing chat file: {file_path}")
            backup_path = self._create_backup(file_path)
            if not backup_path:
                self.logger.log_error("Failed to create backup, aborting repair.")
                return False

            valid_lines_content = []
            original_lines = []
            with open(file_path, 'r', encoding='utf-8') as f:
                original_lines = f.readlines()

            metadata_line_info = next((item for item in line_validation if item["type"] == "metadata"), None)
            if metadata_line_info and metadata_line_info["valid"]:
                valid_lines_content.append(original_lines[0].strip())
            else:
                self.logger.log_warning(f"Metadata line is invalid for {file_path}. Repair might be incomplete if metadata cannot be recovered or defaulted.")

            for i, line_info in enumerate(line_validation):
                if line_info["type"] == "message" and line_info["valid"]:
                    if (line_info["line"] -1) < len(original_lines): 
                         valid_lines_content.append(original_lines[line_info["line"]-1].strip())
                elif line_info["type"] == "empty" and (line_info["line"]-1) < len(original_lines): 
                    if not original_lines[line_info["line"]-1].strip(): 
                        valid_lines_content.append("")

            if not valid_lines_content:
                self.logger.log_error(f"No valid lines found after repair attempt for {file_path}. Restoring from backup.")
                self.restore_from_backup(file_path, backup_path)
                return False

            def content_writer(f):
                for line_to_write in valid_lines_content:
                    f.write(line_to_write + '\n')
            
            write_success = self._atomic_write_file(file_path, content_writer, create_backup=False) 

            if write_success:
                self.logger.log_info(f"Successfully repaired and wrote chat file: {file_path}")
                return True
            else:
                self.logger.log_error(f"Failed to write repaired chat file: {file_path}. Restoring from backup.")
                self.restore_from_backup(file_path, backup_path)
                return False
        except Exception as e:
            self.logger.log_error(f"Error during chat file repair process for {file_path}: {str(e)}")
            if 'backup_path' in locals() and backup_path: # type: ignore
                self.restore_from_backup(file_path, backup_path) # type: ignore
            return False

    def _create_backup(self, file_path: Path) -> Path:
        """Create a timestamped backup of a file."""
        try:
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            backup_dir = file_path.parent / ".backups"
            backup_dir.mkdir(parents=True, exist_ok=True)
            backup_file_path = backup_dir / f"{file_path.name}.{timestamp}.bak"
            shutil.copy2(file_path, backup_file_path)
            self.logger.log_step(f"Created backup: {backup_file_path}")
            return backup_file_path
        except Exception as e:
            self.logger.log_error(f"Failed to create backup for {file_path}: {str(e)}")
            raise 

    def restore_from_backup(self, file_path: Path, backup_path: Optional[Path] = None) -> bool:
        """Restore a file from its latest or a specific backup."""
        try:
            if not backup_path: 
                backup_dir = file_path.parent / ".backups"
                if not backup_dir.exists():
                    self.logger.log_warning(f"No backup directory found for {file_path}")
                    return False
                backups = sorted(backup_dir.glob(f"{file_path.name}.*.bak"), key=os.path.getmtime, reverse=True)
                if not backups:
                    self.logger.log_warning(f"No backups found for {file_path}")
                    return False
                backup_path = backups[0]
            
            if not backup_path.exists():
                self.logger.log_error(f"Backup file {backup_path} does not exist.")
                return False

            shutil.copy2(backup_path, file_path)
            self.logger.log_info(f"Restored {file_path} from backup {backup_path}")
            return True
        except Exception as e:
            self.logger.log_error(f"Error restoring {file_path} from backup: {str(e)}")
            return False

    def list_available_backups(self, file_path: Path) -> List[Dict]:
        """List available backups for a given chat file."""
        backups_info = []
        try:
            backup_dir = file_path.parent / ".backups"
            if not backup_dir.exists():
                return []
            
            backup_files = sorted(backup_dir.glob(f"{file_path.name}.*.bak"), key=os.path.getmtime, reverse=True)
            
            for bf_path in backup_files:
                try:
                    name_parts = bf_path.name.split('.')
                    if len(name_parts) >= 3 and name_parts[-1] == 'bak':
                        timestamp_str = name_parts[-2]
                        try:
                            backup_time = datetime.strptime(timestamp_str, "%Y%m%d%H%M%S")
                            backups_info.append({
                                "path": str(bf_path),
                                "filename": bf_path.name,
                                "timestamp": backup_time.isoformat(),
                                "size": bf_path.stat().st_size
                            })
                        except ValueError:
                            self.logger.log_warning(f"Could not parse timestamp from backup filename: {bf_path.name}")
                except Exception as e_inner:
                    self.logger.log_error(f"Error processing backup file {bf_path.name}: {e_inner}")
            return backups_info
        except Exception as e:
            self.logger.log_error(f"Error listing backups for {file_path}: {str(e)}")
            return []

    def _extract_character_name_from_path(self, file_path: Path) -> str:
        """Extract character name from chat file path (best effort)."""
        try:
            stem = file_path.stem 
            if stem.startswith("chat_"):
                parts = stem[5:].split('_') 
                if len(parts) >= 2: 
                    return "_".join(parts[:-1]) 
            return "Unknown Character" 
        except Exception:
            return "Unknown Character"

    # --- Autosave and Optimized Save Logic ---
    def set_autosave_interval(self, seconds: int) -> None:
        """Set the autosave interval."""
        if seconds > 0:
            self._save_interval = seconds
            self.logger.log_info(f"Autosave interval set to {seconds} seconds.")
        else:
            self.logger.log_warning("Autosave interval must be positive.")

    def save_chat(self, character_data: Dict, messages: List[Dict], lastUser: Optional[Dict] = None, api_info: Optional[Dict] = None, metadata: Optional[Dict] = None) -> bool:
        """High-level save operation, potentially using optimized methods."""
        return self.save_chat_state(character_data, messages, lastUser, api_info, metadata)

    def append_message_debounced(self, character_data: Dict, message: Dict) -> bool:
        """Append a message and schedule a debounced save."""
        try:
            char_id = self._get_character_uuid(character_data)
            
            if char_id not in self._pending_saves:
                self._pending_saves[char_id] = {'messages': [], 'lastUser': None, 'api_info': None, 'metadata': None, 'needs_save': False}
            
            self._pending_saves[char_id]['messages'].append(message)
            if message.get('role') == 'user':
                 self._pending_saves[char_id]['lastUser'] = {"name": "User", "timestamp": message.get('timestamp', int(time.time()*1000))}

            self._pending_saves[char_id]['needs_save'] = True
            self._changes_since_save[char_id] = self._changes_since_save.get(char_id, 0) + 1
            
            self.logger.log_step(f"Message appended to pending save for {char_id}. Changes since last save: {self._changes_since_save[char_id]}")
            
            self._schedule_delayed_save(char_id)
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error in append_message_debounced: {str(e)}")
            return False

    def _schedule_delayed_save(self, char_id: str) -> None:
        """Schedule a save operation after a delay, resetting existing timer."""
        try:
            if char_id in self._save_timers:
                pass 
            
            self._save_timers[char_id] = time.time() + self._save_interval
            self.logger.log_step(f"Save scheduled for {char_id} at {datetime.fromtimestamp(self._save_timers[char_id])}")
            
        except Exception as e:
            self.logger.log_error(f"Error scheduling delayed save for {char_id}: {e}")

    def _delayed_save_callback(self, char_id: str) -> None:
        """Callback executed by the timer to perform the save."""
        try:
            self.logger.log_info(f"Delayed save triggered for character ID: {char_id}")
            self._flush_pending_save(char_id)
        except Exception as e:
            self.logger.log_error(f"Error in _delayed_save_callback for {char_id}: {e}")

    def _flush_pending_save(self, char_id: str) -> bool:
        """Perform the actual save operation for a character's pending data."""
        try:
            if char_id not in self._pending_saves or not self._pending_saves[char_id].get('needs_save'):
                self.logger.log_step(f"No pending save needed for {char_id}.")
                return True 

            pending_data = self._pending_saves[char_id]
            
            self.logger.log_error(f"Cannot perform flush for {char_id}: character_data retrieval not fully implemented in this context.")
            # --- TEMPORARY: Simulate save without full character_data retrieval ---
            self.logger.log_info(f"FLUSH WOULD SAVE: {len(pending_data['messages'])} messages for {char_id}")
            success = True # Simulate success for now
            # --- END TEMPORARY ---

            if success:
                self.logger.log_info(f"Successfully flushed pending save for {char_id}.")
                pending_data['needs_save'] = False
                pending_data['messages'] = [] 
                self._changes_since_save[char_id] = 0
                if char_id in self._save_timers:
                    del self._save_timers[char_id]
                return True
            else:
                self.logger.log_error(f"Failed to flush pending save for {char_id}.")
                return False
        except Exception as e:
            self.logger.log_error(f"Error flushing pending save for {char_id}: {str(e)}")
            return False

    def flush_all_pending_saves(self) -> bool:
        """Flush all pending saves for all characters."""
        all_success = True
        for char_id in list(self._pending_saves.keys()): 
            if not self._flush_pending_save(char_id):
                all_success = False
        return all_success

    # --- Optimized Save (Conceptual) ---
    def save_chat_state_optimized(self, character_data: Dict, messages: List[Dict], 
                                 lastUser: Optional[Dict] = None, 
                                 api_info: Optional[Dict] = None, 
                                 metadata: Optional[Dict] = None) -> bool:
        """Optimized save: appends if possible, otherwise full save."""
        try:
            char_id = self._get_character_uuid(character_data)
            
            if self._is_chat_unchanged(char_id, messages, lastUser, api_info, metadata):
                self.logger.log_step(f"Optimized save: No changes for {char_id}, skipping write.")
                return True

            self.logger.log_step(f"Optimized save: Changes detected or append not suitable, performing full save for {char_id}.")
            success = self.save_chat_state(character_data, messages, lastUser, api_info, metadata)
            if success:
                self._update_last_saved_state(char_id, messages, lastUser, api_info, metadata)
            return success
            
        except Exception as e:
            self.logger.log_error(f"Error in save_chat_state_optimized: {str(e)}")
            return False

    def _is_chat_unchanged(self, char_id: str, messages: List[Dict], 
                           lastUser: Optional[Dict], api_info: Optional[Dict], 
                           metadata: Optional[Dict]) -> bool:
        """Check if the chat state is unchanged since the last save (simplified)."""
        return False # Always assume changed for this placeholder

    def _update_last_saved_state(self, char_id: str, messages: List[Dict],
                                 lastUser: Optional[Dict], api_info: Optional[Dict],
                                 metadata: Optional[Dict]) -> None:
        """Update the record of the last saved state (simplified)."""
        pass

    # --- Chat Session Management (Enhanced) ---
    def _build_session_index(self, character_data: Dict) -> List[Dict]:
        """Build or rebuild the session index for a character by scanning files."""
        return self.list_character_chats(character_data, scan_all_files=True)

    def get_chat_session_info(self, character_data: Dict, chat_id: str) -> Optional[Dict]:
        """Get detailed information for a specific chat session, loading from file if not cached."""
        char_id_val = self._get_character_uuid(character_data) # Renamed
        if char_id_val not in self._session_index or chat_id not in self._session_index[char_id_val]:
            self.logger.log_step(f"Session {chat_id} for char {char_id_val} not in cache, rebuilding index.")
            self._build_session_index(character_data) # Rebuild if not found

        if char_id_val in self._session_index and chat_id in self._session_index[char_id_val]:
            session_info = self._session_index[char_id_val][chat_id]
            chat_dir = self._get_chat_path(character_data)
            file_path = chat_dir / session_info['filename']
            
            if not Path(session_info['path']).is_absolute():
                 session_info['path'] = str(file_path)

            try:
                if file_path.exists():
                    with open(file_path, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                    actual_message_count = len(lines) -1 if lines else 0 
                    if actual_message_count != session_info.get('message_count'):
                        self.logger.log_warning(f"Message count mismatch for {chat_id}. Cache: {session_info.get('message_count')}, File: {actual_message_count}. Updating cache.")
                        session_info['message_count'] = actual_message_count
                        if lines and len(lines) > 1:
                            try:
                                last_msg_obj = json.loads(lines[-1])
                                session_info['preview'] = last_msg_obj.get("mes","")[:50]
                            except: pass
            except Exception as e:
                self.logger.log_error(f"Error re-verifying session info for {chat_id} from {file_path}: {e}")

            return session_info
        return None

    def list_chat_sessions(self, character_data: Dict, refresh: bool = False) -> List[Dict]:
        """List all available chat sessions for a character, using cached index if possible."""
        char_id_val = self._get_character_uuid(character_data) # Renamed
        if refresh or char_id_val not in self._session_index:
            self._build_session_index(character_data)
        
        return sorted(self._session_index.get(char_id_val, {}).values(), key=lambda x: x.get("timestamp", ""), reverse=True)

    def switch_chat_session(self, character_data: Dict, chat_id: str) -> Dict:
        """Switch the active chat session for a character."""
        try:
            session_info = self.get_chat_session_info(character_data, chat_id)
            if not session_info:
                raise ValueError(f"Chat session {chat_id} not found.")

            self._current_chat_file = Path(session_info['path'])
            self._update_active_chat(character_data, chat_id)
            
            self.logger.log_info(f"Switched active chat to {chat_id} ({self._current_chat_file})")
            loaded_chat_data = self._load_chat_file(self._current_chat_file)
            if not loaded_chat_data.get("success"):
                raise ValueError(f"Failed to load chat content for session {chat_id}: {loaded_chat_data.get('message')}")
            
            return loaded_chat_data 
            
        except Exception as e:
            self.logger.log_error(f"Error switching chat session to {chat_id}: {str(e)}")
            return self.load_latest_chat(character_data) or {"success": False, "message": str(e), "messages": []}

    def generate_chat_id(self, character_data: Dict) -> str:
        """Generate a new unique chat ID."""
        char_name_part = self._sanitize_filename(character_data.get('data', {}).get('name', 'chat'))
        unique_suffix = str(uuid.uuid4()).split('-')[0] 
        timestamp_part = datetime.now().strftime("%Y%m%d%H%M%S")
        return f"{char_name_part}_{timestamp_part}_{unique_suffix}"

    def clean_chat_sessions(self, character_data: Dict) -> Dict:
        """Validate all chat files for a character and report/repair issues."""
        report = {"character_name": character_data.get('data', {}).get('name', 'Unknown'), "files_processed": 0, "issues_found": 0, "repairs_attempted": 0, "repairs_successful": 0, "details": []}
        try:
            chat_dir = self._get_chat_path(character_data)
            chat_files = list(chat_dir.glob("*.jsonl"))
            report["files_processed"] = len(chat_files)

            for file_path in chat_files:
                validation_result = self.validate_chat_file(file_path, attempt_repair=True) 
                file_report = {
                    "filename": file_path.name,
                    "is_valid_before_repair": validation_result["is_valid"], 
                    "issues_before_repair": validation_result["issues"],
                    "repaired_attempted": True, 
                    "repaired_successful": validation_result["repaired"]
                }
                if validation_result["issues"]:
                    report["issues_found"] += len(validation_result["issues"])
                if validation_result["repaired"]:
                    report["repairs_successful"] += 1
                
                report["details"].append(file_report)
            
            if report["issues_found"] > 0 : report["repairs_attempted"] = report["issues_found"] 

            self._build_session_index(character_data)
            return report
        except Exception as e:
            self.logger.log_error(f"Error during chat session cleaning: {str(e)}")
            report["error"] = str(e)
            return report

    def get_active_chat_session(self, character_data: Dict) -> Optional[Dict]:
        """Get the full data for the currently active chat session."""
        try:
            active_id = self._get_active_chat_id(character_data)
            if active_id:
                return self.get_chat_session_info(character_data, active_id)
            return None
        except Exception as e:
            self.logger.log_error(f"Error getting active chat session details: {e}")
            return None

    def rename_chat_session(self, character_data: Dict, chat_id: str, new_title: str) -> bool:
        """Rename a chat session (updates the title in its metadata)."""
        try:
            session_info = self.get_chat_session_info(character_data, chat_id)
            if not session_info or 'path' not in session_info:
                self.logger.log_error(f"Cannot rename session: Chat ID {chat_id} not found or path missing.")
                return False

            file_path = Path(session_info['path'])
            if not file_path.exists():
                self.logger.log_error(f"Chat file {file_path} does not exist for session {chat_id}.")
                return False

            lines = []
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                if not lines:
                    self.logger.log_error(f"Chat file {file_path} is empty.")
                    return False
                
                metadata = json.loads(lines[0])
                if "chat_metadata" not in metadata:
                    self.logger.log_error(f"Missing 'chat_metadata' in {file_path}.")
                    return False
                
                metadata["chat_metadata"]["title"] = new_title
                lines[0] = json.dumps(metadata) + '\n' 

                def content_writer(f):
                    for line in lines:
                        f.write(line) 
                
                success = self._atomic_write_file(file_path, content_writer, create_backup=False)
                
                if success:
                    if chat_id in self._session_metadata:
                        self._session_metadata[chat_id]['title'] = new_title
                        
                    self.logger.log_step(f"Successfully renamed chat session {chat_id} to '{new_title}'")
                    return True
                else:
                    self.logger.log_error(f"Failed to write updated chat file")
                    return False
                    
            except json.JSONDecodeError:
                self.logger.log_error(f"Error parsing chat metadata")
                return False
                
        except Exception as e:
            self.logger.log_error(f"Error renaming chat session: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False

    def save_chat(self, character_data: Dict, messages: List[Dict], lastUser: Optional[Dict] = None, api_info: Optional[Dict] = None, metadata: Optional[Dict] = None) -> bool:
        """Wrapper method for save_chat_state to maintain backward compatibility with existing code."""
        return self.save_chat_state(character_data, messages, lastUser, api_info, metadata)

    def generate_chat_response_stream(
        self,
        character_data: Dict,
        api_config: Dict,
        generation_params: Dict
    ) -> Generator[bytes, None, None]:
        """Generates chat response stream via ApiHandler."""
        try:
            character_name = "Unknown Character"
            if character_data and isinstance(character_data, dict) and 'data' in character_data and isinstance(character_data['data'], dict) and 'name' in character_data['data']:
                character_name = character_data['data']['name']
            self.logger.log_step(f"ChatHandler: Generating response for '{character_name}'")
            self.logger.log_step(f"ChatHandler: API Config provider: {api_config.get('provider')}")
            
            request_data_for_api_handler = {
                "api_config": api_config,
                "generation_params": generation_params
            }

            self.logger.log_step("ChatHandler: Calling self.api_handler.stream_generate")
            for chunk in self.api_handler.stream_generate(request_data_for_api_handler):
                yield chunk
            self.logger.log_step("ChatHandler: Finished streaming from api_handler")

        except Exception as e:
            self.logger.log_error(f"Error in ChatHandler.generate_chat_response_stream: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            error_message = json.dumps({"error": f"Stream generation failed: {str(e)}"})
            yield f"data: {error_message}\n\n".encode('utf-8')
