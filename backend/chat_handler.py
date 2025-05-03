import os
import sys
import json
import time
import hashlib
import uuid
from datetime import datetime
from pathlib import Path
import traceback
from typing import Dict, List, Optional, Union
import tempfile
import shutil
import io

class ChatHandler:
    def __init__(self, logger):
        self.logger = logger
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
        """
        Atomically write to a file using a temporary file and rename operation.
        
        Args:
            target_path: Path to the target file to write
            content_writer: Function that takes a file object and writes content to it
            create_backup: Whether to create a backup of the existing file
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Get the directory containing the target file
            target_dir = target_path.parent
            
            # Create a backup if requested and the file exists
            if create_backup and target_path.exists():
                backup_path = target_path.with_suffix(f"{target_path.suffix}.bak")
                self.logger.log_step(f"Creating backup at {backup_path}")
                shutil.copy2(target_path, backup_path)
            
            # Create a temporary file in the same directory
            with tempfile.NamedTemporaryFile(
                mode='w', 
                encoding='utf-8',
                delete=False, 
                dir=target_dir, 
                suffix='.tmp'
            ) as tmp_file:
                tmp_path = Path(tmp_file.name)
                self.logger.log_step(f"Writing to temporary file: {tmp_path}")
                
                # Call the content writer function to write to the temporary file
                content_writer(tmp_file)
                
            # Verify the temporary file is valid
            if not self._verify_file_integrity(tmp_path):
                self.logger.log_error(f"Integrity check failed for {tmp_path}")
                if tmp_path.exists():
                    tmp_path.unlink()
                return False
                
            # Atomically replace the target file with the temporary file
            # On Windows, we need special handling for atomic replace
            if os.name == 'nt':  # Windows
                if target_path.exists():
                    # Windows needs the target file to be removed first
                    target_path_old = target_path.with_suffix(f"{target_path.suffix}.old")
                    if target_path_old.exists():
                        target_path_old.unlink()
                    os.replace(str(target_path), str(target_path_old))
                os.replace(str(tmp_path), str(target_path))
                # Clean up the old file if it exists
                if target_path_old.exists():
                    target_path_old.unlink()
            else:  # Unix/Linux/macOS - simple atomic rename
                os.replace(str(tmp_path), str(target_path))
                
            self.logger.log_step(f"Successfully wrote file: {target_path}")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error in atomic file write: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            # Clean up temporary file if it exists and wasn't moved
            try:
                if 'tmp_path' in locals() and Path(tmp_path).exists():
                    Path(tmp_path).unlink()
            except:
                pass
            return False

    def _verify_file_integrity(self, file_path: Path) -> bool:
        """
        Verify the integrity of a JSON file by attempting to read it.
        
        Args:
            file_path: Path to the file to verify
            
        Returns:
            bool: True if file is valid, False otherwise
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = [line.strip() for line in f if line.strip()]
                
            if not lines:
                self.logger.log_warning(f"File is empty: {file_path}")
                return False
                
            # Try to parse the first line (metadata)
            metadata = json.loads(lines[0])
            if not isinstance(metadata, dict):
                self.logger.log_warning(f"Metadata is not a dictionary in {file_path}")
                return False
                
            # Basic validation of metadata structure
            if 'chat_metadata' not in metadata:
                self.logger.log_warning(f"Missing chat_metadata in {file_path}")
                return False
                
            # Try to parse each line to ensure all are valid JSON
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
        # First try to get UUID from character extensions
        uuid_value = character_data.get('data', {}).get('extensions', {}).get('uuid')
        if uuid_value:
            self.logger.log_step(f"Using existing character UUID: {uuid_value}")
            return uuid_value
            
        # Then try to get it from our cache
        name = character_data.get('data', {}).get('name', '')
        if name in self._character_ids:
            return self._character_ids[name]
            
        # If not found, generate a new one based on character data (for backward compatibility)
        char_id = self._generate_character_id(character_data)
        self._character_ids[name] = char_id
        return char_id

    def _generate_character_id(self, character_data: Dict) -> str:
        """Generate a unique, persistent ID for a character."""
        try:
            # Get core character data
            data = character_data.get('data', {})
            name = data.get('name', '')
            desc = data.get('description', '')
            personality = data.get('personality', '')
            
            # Create a unique string combining key character attributes
            unique_string = f"{name}|{desc[:100]}|{personality[:100]}"
            
            # Generate a short hash
            hash_obj = hashlib.md5(unique_string.encode('utf-8'))
            short_hash = hash_obj.hexdigest()[:8]
            
            # Create a human-readable ID
            safe_name = self._sanitize_filename(name)
            char_id = f"{safe_name}-{short_hash}"
            
            self.logger.log_step(f"Generated character ID: {char_id}")
            return char_id
            
        except Exception as e:
            self.logger.log_error(f"Error generating character ID: {str(e)}")
            # Fallback to timestamp-based ID
            return f"character-{int(time.time())}"

    def _sanitize_filename(self, name: str) -> str:
        """Remove invalid characters from filename."""
        if not name:
            return "unnamed"
        return "".join(c for c in name if c.isalnum() or c in ('-', '_', ' '))

    def _get_chat_path(self, character_data: Dict) -> Path:
        """Get the chat directory path for a character."""
        # Get character ID or UUID
        char_id = self._get_character_uuid(character_data)
        
        # Create base directory path that's consistent at project root
        if getattr(sys, 'frozen', False):
            # Running as PyInstaller bundle
            base_dir = Path(sys.executable).parent
        else:
            # Running from source
            base_dir = Path.cwd()
        
        # Always use a consistent "chats" directory at the project root level
        # (Similar to how templates, backgrounds, users, etc. are organized)
        chats_dir = base_dir / 'chats'
        chats_dir.mkdir(parents=True, exist_ok=True)
        
        # Load or create the folders mapping file
        folders_map_path = chats_dir / 'folders.json'
        folders_map = {}
        if folders_map_path.exists():
            try:
                with open(folders_map_path, 'r', encoding='utf-8') as f:
                    folders_map = json.load(f)
            except Exception as e:
                self.logger.log_error(f"Error loading folders.json: {str(e)}")
        
        # Check if this character ID already exists in the map
        if char_id in folders_map:
            clean_name = folders_map[char_id]
            chat_dir = chats_dir / clean_name
            
            # Ensure directory exists (in case it was deleted or renamed)
            if not chat_dir.exists():
                chat_dir.mkdir(parents=True, exist_ok=True)
                
            self.logger.log_step(f"Using existing mapped chat directory: {chat_dir}")
            return chat_dir
        
        # Character not in map, create a new clean folder name
        char_name = self._sanitize_filename(character_data.get('data', {}).get('name', 'unknown'))
        
        # Check if the base name already exists in any form
        existing_folders = [d.name for d in chats_dir.iterdir() if d.is_dir()]
        existing_clean_names = list(folders_map.values())
        
        # Find the next available name
        base_name = char_name
        final_name = base_name
        counter = 2
        
        while final_name in existing_folders or final_name in existing_clean_names:
            final_name = f"{base_name} {counter}"
            counter += 1
        
        # Create the directory
        chat_dir = chats_dir / final_name
        chat_dir.mkdir(parents=True, exist_ok=True)
        
        # Update the folders map
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
            
        # Get the chat directory
        chat_dir = self._get_chat_path(character_data)
        
        # If no chat_id is provided, create a new chat or get the most recent one
        if not chat_id:
            if force_new:
                # Create a new chat with timestamp
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                char_name = self._sanitize_filename(character_data.get('data', {}).get('name', 'unknown'))
                self._current_chat_file = chat_dir / f"chat_{char_name}_{timestamp}.jsonl"
                
                # Initialize the file
                self._initialize_chat_file(self._current_chat_file, character_data)
                self.logger.log_step(f"Created new chat file: {self._current_chat_file}")
            else:
                # Find existing chat files
                char_name = self._sanitize_filename(character_data.get('data', {}).get('name', 'unknown'))
                chat_files = list(chat_dir.glob(f"chat_{char_name}_*.jsonl"))
                
                if chat_files:
                    # Get the most recent chat file
                    self._current_chat_file = max(chat_files, key=lambda f: f.stat().st_mtime)
                    self.logger.log_step(f"Using existing chat file: {self._current_chat_file}")
                else:
                    # No existing files, create a new one
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    self._current_chat_file = chat_dir / f"chat_{char_name}_{timestamp}.jsonl"
                    self._initialize_chat_file(self._current_chat_file, character_data)
                    self.logger.log_step(f"Created new chat file (no existing): {self._current_chat_file}")
        else:
            # Try to find the chat file with matching chat_id
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
                # If no matching chat found, create a new one with the provided ID
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                char_name = self._sanitize_filename(character_data.get('data', {}).get('name', 'unknown'))
                self._current_chat_file = chat_dir / f"chat_{char_name}_{timestamp}.jsonl"
                
                # Initialize with the provided chat_id
                self._initialize_chat_file(self._current_chat_file, character_data, chat_id)
                self.logger.log_step(f"Created new chat file with ID {chat_id}: {self._current_chat_file}")
        
        return self._current_chat_file

    def _initialize_chat_file(self, file_path: Path, character_data: Dict, chat_id: Optional[str] = None) -> None:
        """Initialize a new chat file with metadata."""
        try:
            # Get character ID for metadata
            char_id = self._get_character_uuid(character_data)
            char_name = character_data.get('data', {}).get('name', 'unknown')
            
            # Use provided chat_id or generate a new one with our improved method
            if not chat_id:
                chat_id = self.generate_chat_id(character_data)
                self.logger.log_step(f"Generated new chat ID: {chat_id}")
            
            # Current timestamp for various metadata fields
            current_time = datetime.now()
            timestamp_millis = int(current_time.timestamp() * 1000)
            
            # Create metadata with version information for easier migration
            metadata = {
                "user_name": "User",
                "character_name": char_name,
                "character_id": char_id,
                "create_date": current_time.isoformat(),
                "timestamp": timestamp_millis,  # Add consistent timestamp format
                "version": self._file_version,
                "chat_metadata": {
                    "chat_id": chat_id,
                    "tainted": False,
                    "created_timestamp": timestamp_millis,
                    "title": f"Chat with {char_name} - {current_time.strftime('%b %d, %Y')}",
                    "timedWorldInfo": {
                        "sticky": {},
                        "cooldown": {}
                    },
                    "lastUser": None
                }
            }
            
            # Use atomic file write to initialize the file
            def content_writer(f):
                json.dump(metadata, f)
                f.write('\n')
            
            success = self._atomic_write_file(file_path, content_writer, create_backup=False)
            if success:
                self.logger.log_step(f"Successfully initialized chat file: {file_path}")
                
                # Add to session index if available
                try:
                    char_id = self._get_character_uuid(character_data)
                    if char_id in self._session_index:
                        self._session_index[char_id][chat_id] = {
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
        
        # Handle timestamp conversion
        timestamp = msg.get('timestamp', int(time.time() * 1000))
        if isinstance(timestamp, str):
            try:
                timestamp = int(timestamp)
            except:
                timestamp = int(time.time() * 1000)
                
        # Create the formatted message
        formatted = {
            "name": "User" if is_user else character_name,
            "is_user": is_user,
            "is_system": False,
            "send_date": datetime.fromtimestamp(timestamp/1000).strftime("%B %d, %Y %I:%M%p"),
            "mes": msg.get('content', ''),
            "extra": {
                # Store the unique message ID in the extra field
                "id": msg.get('id', str(timestamp)),
                "edited": 'variations' in msg and len(msg.get('variations', [])) > 1
            }
        }

        # Add variations if present
        if msg.get('variations'):
            formatted['swipe_id'] = msg.get('currentVariation', 0)
            formatted['swipes'] = msg['variations']
            
            # Add generation metadata if it's an AI response
            if not is_user:
                formatted['gen_started'] = datetime.fromtimestamp(timestamp/1000).isoformat() + "Z"
                formatted['gen_finished'] = datetime.fromtimestamp((timestamp + 100)/1000).isoformat() + "Z"
                formatted['extra']['api'] = "koboldcpp"
                formatted['extra']['model'] = msg.get('model', "unknown")

        return formatted

    def _convert_to_internal_format(self, message: Dict) -> Optional[Dict]:
        """
        Convert a saved message format to our internal format, preserving edits and variations.
        """
        # Skip metadata object
        if "chat_metadata" in message:
            return None
            
        try:
            # Parse timestamp from send_date
            timestamp = int(time.time() * 1000)  # Default to current time
            if "send_date" in message:
                try:
                    dt = datetime.strptime(message["send_date"], "%B %d, %Y %I:%M%p")
                    timestamp = int(dt.timestamp() * 1000)
                except:
                    pass
                    
            # Get unique message ID, preferring the one in extra.id
            message_id = None
            if "extra" in message and isinstance(message["extra"], dict):
                message_id = message["extra"].get("id")
                
            if not message_id:
                # Generate a new UUID if no ID found
                from uuid import uuid4
                message_id = str(uuid4())
                                        
            converted = {
                "id": message_id,
                "role": "user" if message.get("is_user", False) else "assistant",
                "content": message.get("mes", ""),
                "timestamp": timestamp
            }
            
            # Handle variations if present
            if "swipes" in message:
                converted["variations"] = message["swipes"]
                # Use swipe_id as currentVariation index if available
                if "swipe_id" in message:
                    converted["currentVariation"] = message.get("swipe_id", 0)
                else:
                    # Default to the last variation (most recent edit)
                    converted["currentVariation"] = len(message["swipes"]) - 1
                    
            # Preserve any additional metadata from extra field
            if "extra" in message and isinstance(message["extra"], dict):
                # Don't duplicate 'id' which we already handled
                extra = {k: v for k, v in message["extra"].items() if k != 'id'}
                if extra:
                    converted["extra"] = extra
                    
            return converted
        except Exception as e:
            self.logger.log_error(f"Error converting message: {str(e)}")
            return None

    def _get_message_id(self, formatted_message: Dict) -> Optional[str]:
        """
        Extract unique message ID from formatted message.
        
        Since the actual message ID might be stored in different places depending on the format,
        this helper ensures we can find and compare IDs consistently.
        """
        # Check for ID in extra field (this is where we'll store it)
        if 'extra' in formatted_message and isinstance(formatted_message['extra'], dict):
            message_id = formatted_message['extra'].get('id')
            if message_id:
                return message_id
                
        # If no ID in extra, check for 'id' at the root level
        return formatted_message.get('id')
    
    def append_message(self, character_data: Dict, message: Dict) -> bool:
        """
        Append or update a single message in the current chat file.
        If a message with the same ID already exists, it will be updated.
        This enables proper saving of edited messages.
        """
        try:
            char_name = character_data.get('data', {}).get('name', 'unknown')
            chat_file = self._get_or_create_chat_file(character_data, force_new=False)
            
            # Check if the message has an ID (should always have one)
            message_id = message.get('id')
            if not message_id:
                self.logger.log_warning("Attempted to append message without ID")
                return False
                
            # Read existing content first
            metadata = {}
            existing_messages = []
            updated_existing = False
            
            try:
                with open(chat_file, 'r', encoding='utf-8') as f:
                    # Read the first line (metadata)
                    first_line = f.readline().strip()
                    if first_line:
                        metadata = json.loads(first_line)
                    
                    # Read all other messages
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                            
                        try:
                            msg_data = json.loads(line)
                            
                            # Check if this is the message we're updating
                            existing_id = self._get_message_id(msg_data)
                            if existing_id and existing_id == message_id:
                                # Found the message to update
                                updated_existing = True
                                formatted_message = self._format_message(message, char_name)
                                existing_messages.append(formatted_message)
                                self.logger.log_step(f"Updating existing message with ID {message_id}")
                            else:
                                # Keep the existing message
                                existing_messages.append(msg_data)
                        except json.JSONDecodeError:
                            # Skip invalid lines
                            self.logger.log_warning(f"Skipping invalid JSON line in chat file")
                            continue
            except FileNotFoundError:
                # File doesn't exist yet, initialize it
                self.logger.log_step(f"Chat file {chat_file} doesn't exist, initializing it")
                self._initialize_chat_file(chat_file, character_data)
                
                # Read the metadata after initialization
                with open(chat_file, 'r', encoding='utf-8') as f:
                    first_line = f.readline().strip()
                    if first_line:
                        metadata = json.loads(first_line)
            
            # Prepare the content writer function for atomic write
            def content_writer(f):
                # Write the metadata first
                json.dump(metadata, f)
                f.write('\n')
                
                # Write all existing messages
                for msg in existing_messages:
                    json.dump(msg, f)
                    f.write('\n')
                
                # If we're not updating an existing message, append the new one
                if not updated_existing:
                    formatted_message = self._format_message(message, char_name)
                    json.dump(formatted_message, f)
                    f.write('\n')
            
            # Use atomic file write operation
            success = self._atomic_write_file(chat_file, content_writer)
            
            if success:
                if updated_existing:
                    self.logger.log_step(f"Successfully updated message with ID {message_id}")
                else:
                    self.logger.log_step(f"Successfully appended new message with ID {message_id}")
                return True
            else:
                self.logger.log_error(f"Failed to write chat file {chat_file}")
                return False
                
        except Exception as e:
            self.logger.log_error(f"Failed to append/update message: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False

    def save_chat_state(self, character_data: Dict, messages: List[Dict], lastUser: Optional[Dict] = None, api_info: Optional[Dict] = None, metadata: Optional[Dict] = None) -> bool:
        """Save complete chat state to a file with API information and additional metadata."""
        self.logger.log_step(f"Saving chat state for character: {character_data.get('data', {}).get('name')}")
        
        try:
            # Get or create chat file with current chat_id
            chat_file = self._get_or_create_chat_file(character_data, force_new=False)
            char_name = character_data.get('data', {}).get('name', 'unknown')
            
            # Try to preserve the current chat_id if possible
            current_chat_id = None
            current_metadata = {}
            if chat_file.exists():
                try:
                    with open(chat_file, 'r', encoding='utf-8') as f:
                        first_line = f.readline().strip()
                        if first_line:
                            current_metadata = json.loads(first_line)
                            current_chat_id = current_metadata.get('chat_metadata', {}).get('chat_id')
                            # Preserve existing metadata entries we don't want to overwrite
                            current_background_settings = current_metadata.get('chat_metadata', {}).get('backgroundSettings')
                except Exception as e:
                    self.logger.log_warning(f"Error reading existing metadata: {str(e)}")
            
            # Create metadata with lastUser and preserve chat_id if available
            char_id = self._get_character_uuid(character_data)
            
            # Use existing chat_id or generate a new one
            chat_id = current_chat_id if current_chat_id else f"chat_{uuid.uuid4().hex}"
            
            # Merge existing and new metadata
            chat_metadata = {
                "chat_id": chat_id,
                "tainted": False,
                "timedWorldInfo": {
                    "sticky": {},
                    "cooldown": {}
                },
                "lastUser": lastUser,
                "api_info": api_info or {}  # Add API information
            }
            
            # Add background settings from the input metadata if provided
            if metadata and 'backgroundSettings' in metadata:
                chat_metadata['backgroundSettings'] = metadata.get('backgroundSettings')
                self.logger.log_step(f"Including background settings in chat metadata")
            # Preserve background settings from current metadata if available
            elif current_background_settings:
                chat_metadata['backgroundSettings'] = current_background_settings
                self.logger.log_step(f"Preserving existing background settings")
            
            # Prepare full metadata with version information
            metadata_obj = {
                "user_name": "User",
                "character_name": char_name,
                "character_id": char_id,
                "create_date": current_metadata.get('create_date', datetime.now().isoformat()),
                "version": self._file_version,
                "chat_metadata": chat_metadata
            }
            
            # Define content writer function for atomic write
            def content_writer(f):
                # Write metadata first
                json.dump(metadata_obj, f)
                f.write('\n')
                
                # Write all messages
                for msg in messages:
                    formatted_msg = self._format_message(msg, char_name)
                    json.dump(formatted_msg, f)
                    f.write('\n')
            
            # Use atomic file write operation
            success = self._atomic_write_file(chat_file, content_writer)
            
            if success:
                # Update the active chat tracking
                self._update_active_chat(character_data, chat_id)
                self.logger.log_step(f"Successfully saved chat with {len(messages)} messages to {chat_file}")
                return True
            else:
                self.logger.log_error(f"Failed to write chat file {chat_file}")
                return False
            
        except Exception as e:
            self.logger.log_error(f"Failed to save chat state: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False

    def load_latest_chat(self, character_data: Dict) -> Optional[Dict]:
        """Load the most recent chat for a character."""
        try:
            character_name = character_data.get('data', {}).get('name', 'unknown')
            self.logger.log_step(f"Loading latest chat for character: {character_name}")
            
            # Check if there's an active chat ID for this character
            active_chat_id = self._get_active_chat_id(character_data)
            
            if (active_chat_id):
                self.logger.log_step(f"Found active chat ID {active_chat_id} for {character_name}")
                # Try to load the active chat
                result = self.load_chat(character_data, active_chat_id)
                if result:
                    self.logger.log_step(f"Successfully loaded active chat for {character_name}")
                    return result
                else:
                    self.logger.log_warning(f"Active chat {active_chat_id} for {character_name} not found, falling back to most recent")
            
            # Reset current chat file
            self._current_chat_file = None
            
            # Get chat directory and use it to get/create a chat file (will pick most recent)
            chat_file = self._get_or_create_chat_file(character_data, force_new=False)
            self.logger.log_step(f"Loading most recent chat from {chat_file}")
            
            # If we found a chat file, update the active chat tracking with its ID
            if chat_file and chat_file.exists():
                try:
                    with open(chat_file, 'r', encoding='utf-8') as f:
                        first_line = f.readline().strip()
                        if first_line:
                            metadata = json.loads(first_line)
                            chat_id = metadata.get('chat_metadata', {}).get('chat_id')
                            if chat_id:
                                self._update_active_chat(character_data, chat_id)
                except Exception as e:
                    self.logger.log_error(f"Error reading chat ID from file: {str(e)}")
            
            # Load the chat content
            result = self._load_chat_file(chat_file)
            return result
            
        except Exception as e:
            self.logger.log_error(f"Failed to load chat: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return None

    def _load_chat_file(self, file_path: Path) -> Dict:
        """Load messages and metadata from a chat file."""
        messages = []
        metadata = None
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                # Read all lines first for more robust parsing
                lines = [line.strip() for line in f if line.strip()]
                
                # First line should always be metadata, but be flexible
                if lines:
                    try:
                        first_line = json.loads(lines[0])
                        if 'chat_metadata' in first_line or 'character_name' in first_line:
                            metadata = first_line
                            self.logger.log_step("Found chat metadata in first line")
                            # Start processing from the second line
                            start_line = 1
                        else:
                            # No metadata at first line, we'll need to create one
                            self.logger.log_warning(f"No metadata found in first line, will synthesize metadata")
                            # Extract character name from the file path
                            file_name = file_path.name
                            # Expected format: chat_CharacterName_Timestamp.jsonl
                            parts = file_name.replace('.jsonl', '').split('_')
                            char_name = parts[1] if len(parts) > 1 else "Unknown"
                            
                            # Create a synthetic chat_id based on the filename
                            chat_id = file_path.stem  # Use the whole filename without extension as chat_id
                            
                            # Create minimal metadata
                            metadata = {
                                "user_name": "User",
                                "character_name": char_name,
                                "create_date": datetime.now().isoformat(),
                                "chat_metadata": {
                                    "chat_id": chat_id,
                                    "tainted": False,
                                    "timedWorldInfo": {
                                        "sticky": {},
                                        "cooldown": {}
                                    },
                                    "lastUser": None
                                }
                            }
                            
                            # Process all lines as messages
                            start_line = 0
                    except json.JSONDecodeError as e:
                        self.logger.log_error(f"Error parsing first line as metadata: {e}")
                        # Create minimal metadata as above
                        chat_id = file_path.stem
                        char_name = file_path.name.split('_')[1] if len(file_path.name.split('_')) > 1 else "Unknown"
                        
                        metadata = {
                            "user_name": "User",
                            "character_name": char_name,
                            "create_date": datetime.now().isoformat(),
                            "chat_metadata": {
                                "chat_id": chat_id,
                                "tainted": False,
                                "timedWorldInfo": {
                                    "sticky": {},
                                    "cooldown": {}
                                },
                                "lastUser": None
                            }
                        }
                        start_line = 0
                    
                    # Process message lines
                    for i in range(start_line, len(lines)):
                        try:
                            data = json.loads(lines[i])
                            # Skip any additional metadata-like lines
                            if 'chat_metadata' in data and i > 0:
                                self.logger.log_warning(f"Found additional metadata at line {i+1}, skipping")
                                continue
                                
                            converted = self._convert_to_internal_format(data)
                            if converted:
                                messages.append(converted)
                        except json.JSONDecodeError as e:
                            self.logger.log_error(f"Error parsing message at line {i+1}: {e}")
                            continue
                
                # Make sure chat_id exists in metadata
                if metadata and 'chat_metadata' in metadata and not metadata['chat_metadata'].get('chat_id'):
                    metadata['chat_metadata']['chat_id'] = file_path.stem
                
                # After loading, update the active chat tracking for this character
                if metadata and metadata.get('character_name') and metadata.get('chat_metadata', {}).get('chat_id'):
                    char_name = metadata.get('character_name')
                    chat_id = metadata.get('chat_metadata', {}).get('chat_id')
                    # Try to update active chat for this character
                    try:
                        char_data = {'data': {'name': char_name}}
                        self._update_active_chat(char_data, chat_id)
                    except Exception as e:
                        self.logger.log_error(f"Failed to update active chat: {e}")
            
            self.logger.log_step(f"Loaded {len(messages)} messages")
            
            # Ensure messages are in chronological order
            messages.sort(key=lambda x: x.get('timestamp', 0))
            
            return {
                'success': True,
                'messages': messages,
                'metadata': metadata
            }
        except Exception as e:
            self.logger.log_error(f"Error loading chat file {file_path}: {str(e)}")
            return {
                'success': False,
                'messages': [],
                'metadata': None,
                'error': str(e)
            }

    def load_chat(self, character_data: Dict, chat_id: str) -> Optional[Dict]:
        """Load a specific chat by ID."""
        try:
            self.logger.log_step(f"Loading chat with ID {chat_id} for character: {character_data.get('data', {}).get('name')}")
            
            # Get the chat path
            chat_dir = self._get_chat_path(character_data)
            
            # Find the file with the matching chat_id
            chat_files = list(chat_dir.glob("*.jsonl"))
            matching_file = None
            
            for file_path in chat_files:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        first_line = f.readline().strip()
                        if first_line:
                            metadata = json.loads(first_line)
                            file_chat_id = metadata.get('chat_metadata', {}).get('chat_id')
                            
                            if file_chat_id == chat_id:
                                matching_file = file_path
                                self.logger.log_step(f"Found chat file with ID {chat_id}: {file_path}")
                                break
                except Exception as e:
                    self.logger.log_error(f"Error checking chat file {file_path}: {str(e)}")
                    continue
            
            if not matching_file:
                self.logger.log_warning(f"No chat file found with ID {chat_id}")
                return None
            
            # Set as current chat file
            self._current_chat_file = matching_file
            
            # Update active chat tracking - when a user explicitly loads a chat, make it the active one
            self._update_active_chat(character_data, chat_id)
            
            # Load the chat content
            result = self._load_chat_file(matching_file)
            
            # If loaded successfully, confirm this is now the active chat
            if result and result.get('success'):
                self.logger.log_step(f"Set chat {chat_id} as active for character {character_data.get('data', {}).get('name')}")
            
            return result
            
        except Exception as e:
            self.logger.log_error(f"Failed to load chat by ID: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return None

    def create_new_chat(self, character_data: Dict) -> Optional[Dict]:
        """Create a new empty chat for a character."""
        try:
            self.logger.log_step(f"Creating new chat for character: {character_data.get('data', {}).get('name')}")
            
            # Force creation of a new chat file
            chat_file = self._get_or_create_chat_file(character_data, force_new=True)
            
            # Get the chat ID from the newly created file
            chat_id = None
            try:
                with open(chat_file, 'r', encoding='utf-8') as f:
                    first_line = f.readline().strip()
                    if first_line:
                        metadata = json.loads(first_line)
                        chat_id = metadata.get('chat_metadata', {}).get('chat_id')
                        
                # Update the active chat tracking with this new chat ID
                if chat_id:
                    self._update_active_chat(character_data, chat_id)
                    
            except Exception as e:
                self.logger.log_error(f"Error reading new chat ID: {str(e)}")
            
            # Return empty chat info with the chat_id
            return {
                'success': True,
                'messages': [],
                'metadata': None,
                'chat_id': chat_id
            }
            
        except Exception as e:
            self.logger.log_error(f"Failed to create new chat: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return None

    def list_character_chats(self, character_data: Dict, scan_all_files: bool = False) -> List[Dict]:
        """
        List all available chat files for a character.
        
        Args:
            character_data: Character data dictionary
            scan_all_files: If True, scan for all JSONL files regardless of naming convention
        """
        try:
            chat_dir = self._get_chat_path(character_data)
            character_name = character_data.get('data', {}).get('name', 'unknown')
            char_name = self._sanitize_filename(character_name)
            
            # Find all chat files for this character
            if scan_all_files:
                # Scan for all JSONL files regardless of naming convention
                self.logger.log_step(f"Scanning all JSONL files in directory: {chat_dir}")
                chat_files = list(chat_dir.glob("*.jsonl"))
            else:
                # Only scan for files with the standard naming convention
                self.logger.log_step(f"Scanning standard named chat files for character: {char_name}")
                chat_files = list(chat_dir.glob(f"chat_{char_name}_*.jsonl"))
            
            # Sort by modification time (newest first)
            chat_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
            
            chat_list = []
            for file_path in chat_files:
                try:
                    # Extract the timestamp from the filename
                    filename = file_path.name
                    if filename.startswith(f"chat_{char_name}_"):
                        timestamp_str = filename.replace(f"chat_{char_name}_", "").replace(".jsonl", "")
                    else:
                        # For files with non-standard naming
                        parts = filename.split('_')
                        if len(parts) >= 3 and parts[0] == "chat":
                            timestamp_str = parts[-1].replace(".jsonl", "")
                        else:
                            # Use the file modification time as a fallback
                            timestamp_str = datetime.fromtimestamp(file_path.stat().st_mtime).strftime("%Y%m%d_%H%M%S")
                    
                    # Parse the file to get metadata
                    chat_id = None
                    chat_preview = ""
                    message_count = 0
                    create_date = ""
                    
                    with open(file_path, 'r', encoding='utf-8') as f:
                        # Read the first line for metadata
                        first_line = f.readline().strip()
                        if first_line:
                            try:
                                metadata = json.loads(first_line)
                                chat_id = metadata.get('chat_metadata', {}).get('chat_id')
                                create_date = metadata.get('create_date', '')
                            except json.JSONDecodeError:
                                self.logger.log_warning(f"Invalid JSON in first line of {filename}, falling back to filename")
                                chat_id = file_path.stem  # Use filename without extension as ID
                        else:
                            chat_id = file_path.stem  # Use filename without extension as ID
                        
                        # Reset file pointer to start and count total lines
                        f.seek(0)
                        total_lines = sum(1 for line in f if line.strip())
                        # Subtract metadata line to get message count
                        message_count = max(0, total_lines - 1)
                        
                        # Reset file pointer and look for preview content
                        f.seek(0)
                        # Skip first line (metadata)
                        f.readline()
                        # Look at first few messages for preview
                        preview_attempts = 0
                        while preview_attempts < 5 and not chat_preview:
                            line = f.readline().strip()
                            if not line:
                                break
                                
                            try:
                                msg = json.loads(line)
                                if not msg.get('is_system', False):
                                    # Try to get message content from different possible formats
                                    message_content = msg.get('mes', msg.get('content', ''))
                                    if message_content:
                                        # Truncate message for preview
                                        preview_text = message_content[:50].replace('\n', ' ')
                                        if preview_text:
                                            chat_preview = preview_text + "..."
                            except json.JSONDecodeError:
                                pass
                                
                            preview_attempts += 1
                    
                    # Format the time for display
                    try:
                        if timestamp_str:
                            display_date = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S").strftime("%b %d, %Y %I:%M %p")
                        elif create_date:
                            # Try to parse create_date instead
                            date_obj = datetime.fromisoformat(create_date)
                            display_date = date_obj.strftime("%b %d, %Y %I:%M %p")
                        else:
                            # Fall back to file modification time
                            display_date = datetime.fromtimestamp(file_path.stat().st_mtime).strftime("%b %d, %Y %I:%M %p")
                    except:
                        display_date = timestamp_str or "Unknown date"
                    
                    chat_list.append({
                        'id': chat_id or f"{char_name}_{timestamp_str}",
                        'filename': filename,
                        'path': str(file_path),
                        'timestamp': timestamp_str,
                        'display_date': display_date,
                        'message_count': message_count,
                        'preview': chat_preview,
                        'create_date': create_date or display_date
                    })
                except Exception as e:
                    self.logger.log_error(f"Error processing chat file {file_path}: {str(e)}")
                    continue
            
            return chat_list
            
        except Exception as e:
            self.logger.log_error(f"Failed to list chats: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return []

    def get_all_chats(self, character_data: Dict) -> List[Dict]:
        """Get a list of all chat sessions for a character."""
        try:
            # Get chat directory for this character
            chat_dir = self._get_chat_path(character_data)
            self.logger.log_step(f"Listing chats in directory: {chat_dir}")
            
            # Find all chat files
            chat_files = list(chat_dir.glob("*.jsonl"))
            chat_list = []
            
            for chat_file in chat_files:
                try:
                    # Read just the first line for metadata
                    with open(chat_file, 'r', encoding='utf-8') as f:
                        first_line = f.readline().strip()
                        if first_line:
                            metadata = json.loads(first_line)
                            
                            # Count messages in file
                            f.seek(0)
                            message_count = sum(1 for line in f if line.strip()) - 1  # Subtract metadata line
                            
                            # Extract chat metadata
                            chat_metadata = metadata.get('chat_metadata', {})
                            chat_id = chat_metadata.get('chat_id', str(chat_file.name))
                            
                            # Get user information
                            last_user = chat_metadata.get('lastUser', {})
                            user_name = last_user.get('name') if last_user else None
                            
                            # Get API information
                            api_info = chat_metadata.get('api_info', {})
                            api_provider = api_info.get('provider')
                            api_model = api_info.get('model')
                            
                            # Add to chat list
                            chat_list.append({
                                'id': chat_id,
                                'filename': chat_file.name,
                                'created': metadata.get('create_date'),
                                'last_modified': datetime.fromtimestamp(chat_file.stat().st_mtime).isoformat(),
                                'message_count': message_count,
                                'character': metadata.get('character_name', character_data.get('data', {}).get('name', 'unknown')),
                                'user_name': user_name,
                                'api_provider': api_provider,
                                'api_model': api_model
                            })
                except Exception as e:
                    self.logger.log_error(f"Error reading chat file {chat_file}: {str(e)}")
                    continue
            
            # Sort by modification time (newest first)
            chat_list.sort(key=lambda x: x.get('last_modified', ''), reverse=True)
            
            self.logger.log_step(f"Found {len(chat_list)} chat files")
            return chat_list
            
        except Exception as e:
            self.logger.log_error(f"Failed to list chats: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return []

    def delete_chat(self, character_data: Dict, chat_id: str) -> bool:
        """Delete a specific chat file by chat ID."""
        try:
            self.logger.log_step(f"Deleting chat with ID {chat_id}")
            
            # Get chat directory
            chat_dir = self._get_chat_path(character_data)
            
            # Find the file with the matching chat_id
            found = False
            target_file = None
            
            # First pass - find the file with matching ID but don't delete yet
            chat_files = list(chat_dir.glob("*.jsonl"))
            for file_path in chat_files:
                try:
                    # Use a context manager to ensure the file is properly closed
                    with open(file_path, 'r', encoding='utf-8') as f:
                        first_line = f.readline().strip()
                        if first_line:
                            metadata = json.loads(first_line)
                            file_chat_id = metadata.get('chat_metadata', {}).get('chat_id')
                            
                            if file_chat_id == chat_id:
                                # Found the file, but don't delete within the file open block
                                self.logger.log_step(f"Found chat file with ID {chat_id}: {file_path}")
                                target_file = file_path
                                found = True
                                break
                except Exception as e:
                    self.logger.log_error(f"Error checking chat file {file_path}: {str(e)}")
                    continue
            
            # Second pass - delete the file if found
            if found and target_file:
                try:
                    # Make sure this file is not being used as current chat file
                    if self._current_chat_file == target_file:
                        self._current_chat_file = None
                        
                    # Sleep briefly to ensure all file handles are released
                    time.sleep(0.1)
                    
                    # Now delete the file
                    target_file.unlink()
                    self.logger.log_step(f"Successfully deleted chat file: {target_file}")
                except Exception as e:
                    self.logger.log_error(f"Error deleting chat file {target_file}: {str(e)}")
                    return False
            
            if not found:
                self.logger.log_warning(f"Chat file with ID {chat_id} not found for deletion")
                return False
            
            return True
        except Exception as e:
            self.logger.log_error(f"Failed to delete chat: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False

    def _load_active_chats(self) -> Dict[str, str]:
        """Load the mapping of character IDs to their current active chat IDs."""
        try:
            # Get base directory path
            if getattr(sys, 'frozen', False):
                base_dir = Path(sys.executable).parent
            else:
                base_dir = Path.cwd()
            
            chats_dir = base_dir / 'chats'
            chats_dir.mkdir(parents=True, exist_ok=True)
            
            # Load the active chats mapping file if it exists
            active_chats_path = chats_dir / 'character_chats.json'
            
            if active_chats_path.exists():
                with open(active_chats_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            
            # Return empty dict if file doesn't exist yet
            return {}
        except Exception as e:
            self.logger.log_error(f"Error loading active chats mapping: {str(e)}")
            return {}
    
    def _save_active_chats(self) -> None:
        """Save the mapping of character IDs to their current active chat IDs."""
        try:
            # Get base directory path
            if getattr(sys, 'frozen', False):
                base_dir = Path(sys.executable).parent
            else:
                base_dir = Path.cwd()
            
            chats_dir = base_dir / 'chats'
            chats_dir.mkdir(parents=True, exist_ok=True)
            
            # Save the active chats mapping file
            active_chats_path = chats_dir / 'character_chats.json'
            
            with open(active_chats_path, 'w', encoding='utf-8') as f:
                json.dump(self._active_chats, f, indent=2)
                
            self.logger.log_step("Saved active chats mapping")
        except Exception as e:
            self.logger.log_error(f"Error saving active chats mapping: {str(e)}")
    
    def _update_active_chat(self, character_data: Dict, chat_id: str) -> None:
        """Update the active chat ID for a character."""
        try:
            char_id = self._get_character_uuid(character_data)
            self._active_chats[char_id] = chat_id
            self._save_active_chats()
            self.logger.log_step(f"Updated active chat for character {char_id} to {chat_id}")
        except Exception as e:
            self.logger.log_error(f"Error updating active chat: {str(e)}")
    
    def _get_active_chat_id(self, character_data: Dict) -> Optional[str]:
        """Get the active chat ID for a character."""
        try:
            char_id = self._get_character_uuid(character_data)
            return self._active_chats.get(char_id)
        except Exception as e:
            self.logger.log_error(f"Error getting active chat ID: {str(e)}")
            return None
        
    def _get_character_folder(self, character_id: str) -> Optional[Path]:
        """Get the chat directory for a character based on its ID.
        
        Args:
            character_id: The unique identifier for the character.
            
        Returns:
            Path object to the character's chat folder, or None if not found.
        """
        try:
            self.logger.log_step(f"Getting folder for character ID: {character_id}")
            
            # Get base directory path
            if getattr(sys, 'frozen', False):
                base_dir = Path(sys.executable).parent
            else:
                base_dir = Path.cwd()
            
            chats_dir = base_dir / 'chats'
            if not chats_dir.exists():
                self.logger.log_warning(f"Chats directory doesn't exist: {chats_dir}")
                return None
            
            # Load the folders mapping file to look up the character folder
            folders_map_path = chats_dir / 'folders.json'
            
            if not folders_map_path.exists():
                self.logger.log_warning(f"Folders mapping file not found at {folders_map_path}")
                return None
            
            folders_map = {}
            try:
                with open(folders_map_path, 'r', encoding='utf-8') as f:
                    folders_map = json.load(f)
            except Exception as e:
                self.logger.log_error(f"Error loading folders.json: {str(e)}")
                return None
            
            # Look for the character ID in the mapping
            if character_id in folders_map:
                folder_name = folders_map[character_id]
                chat_folder = chats_dir / folder_name
                
                # Verify the folder exists
                if chat_folder.exists():
                    self.logger.log_step(f"Found character folder: {chat_folder}")
                    return chat_folder
                else:
                    self.logger.log_warning(f"Character folder not found at expected location: {chat_folder}")
                    return None
            else:
                self.logger.log_warning(f"No folder mapping found for character ID: {character_id}")
                return None
            
        except Exception as e:
            self.logger.log_error(f"Error getting character folder: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return None

    # --- Phase 2: Enhanced Error Recovery Methods ---
    
    def validate_chat_file(self, file_path: Path, attempt_repair: bool = False) -> Dict[str, any]:
        """
        Validate a chat file's structure and content integrity.
        
        Args:
            file_path: Path to the chat file to validate
            attempt_repair: Whether to attempt to fix any issues found
            
        Returns:
            Dict with validation results, including success status and any issues found
        """
        self.logger.log_step(f"Validating chat file: {file_path}")
        issues = []
        repair_actions = []
        
        if not file_path.exists():
            return {
                'success': False,
                'issues': ['File does not exist'],
                'repair_actions': [],
                'repairable': False,
                'message': 'Chat file does not exist'
            }
            
        # Basic file validation
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = [line.strip() for line in f if line.strip()]
                
            if not lines:
                return {
                    'success': False,
                    'issues': ['File is empty'],
                    'repair_actions': [],
                    'repairable': False,
                    'message': 'Chat file is empty'
                }
                
            # Check for valid JSON structure
            line_validation = []
            for i, line in enumerate(lines):
                try:
                    json_data = json.loads(line)
                    
                    # First line should be metadata
                    if i == 0:
                        if 'chat_metadata' not in json_data:
                            issues.append(f"Missing chat_metadata in first line")
                    else:
                        # For message lines, check for basic required fields
                        if not isinstance(json_data, dict):
                            issues.append(f"Line {i+1} is not a valid JSON object")
                            
                        if 'name' not in json_data:
                            issues.append(f"Line {i+1} is missing 'name' field")
                            
                        if 'mes' not in json_data:
                            issues.append(f"Line {i+1} is missing 'mes' field")
                    
                    line_validation.append({'valid': True, 'data': json_data})
                except json.JSONDecodeError as e:
                    issues.append(f"Invalid JSON at line {i+1}: {str(e)}")
                    line_validation.append({'valid': False, 'error': str(e), 'line': line})
            
            # Check for metadata consistency
            metadata = line_validation[0]['data'] if line_validation and line_validation[0]['valid'] else None
            if metadata:
                # Version compatibility check
                if 'version' not in metadata:
                    issues.append("Missing version field in metadata")
                    repair_actions.append("Add version field to metadata")
                    
                if 'chat_metadata' in metadata and 'chat_id' not in metadata['chat_metadata']:
                    issues.append("Missing chat_id in metadata")
                    repair_actions.append("Generate new chat_id in metadata")
            else:
                issues.append("Invalid or missing metadata")
                repair_actions.append("Recreate metadata from filename and content")
            
            # Check for message consistency
            message_count = len([l for l in line_validation[1:] if l['valid']])
            invalid_message_count = len([l for l in line_validation[1:] if not l['valid']])
            
            # Attempt repair if requested and possible
            if attempt_repair and issues and repair_actions:
                self.logger.log_step(f"Attempting repair of {file_path}")
                repaired = self._repair_chat_file(file_path, line_validation, issues)
                if repaired:
                    self.logger.log_step(f"Successfully repaired {file_path}")
                    return {
                        'success': True,
                        'issues': issues,
                        'repair_actions': repair_actions,
                        'repairable': True,
                        'message': 'Chat file repaired successfully',
                        'message_count': message_count,
                        'invalid_message_count': invalid_message_count
                    }
                else:
                    self.logger.log_error(f"Failed to repair {file_path}")
                    return {
                        'success': False,
                        'issues': issues,
                        'repair_actions': repair_actions,
                        'repairable': True,
                        'message': 'Chat file repair failed',
                        'message_count': message_count,
                        'invalid_message_count': invalid_message_count
                    }
            
            # Return validation results
            return {
                'success': not issues,
                'issues': issues,
                'repair_actions': repair_actions,
                'repairable': bool(repair_actions),
                'message': 'Chat file valid' if not issues else f'Chat file has {len(issues)} issues',
                'message_count': message_count,
                'invalid_message_count': invalid_message_count
            }
            
        except Exception as e:
            self.logger.log_error(f"Error validating file {file_path}: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return {
                'success': False,
                'issues': [f"Validation error: {str(e)}"],
                'repair_actions': [],
                'repairable': False,
                'message': f'Error during validation: {str(e)}'
            }
            
    def _repair_chat_file(self, file_path: Path, line_validation: List[Dict], issues: List[str]) -> bool:
        """
        Attempt to repair a corrupted chat file.
        
        Args:
            file_path: Path to the file to repair
            line_validation: Result of validating each line
            issues: List of issues found during validation
            
        Returns:
            bool: True if repair was successful, False otherwise
        """
        try:
            self.logger.log_step(f"Repairing chat file: {file_path}")
            
            # First make a backup of the original file
            backup_path = self._create_backup(file_path)
            self.logger.log_step(f"Created backup at: {backup_path}")
            
            # Extract valid data and prepare for repair
            valid_metadata = None
            valid_messages = []
            
            # Get or repair metadata
            if line_validation and line_validation[0]['valid']:
                valid_metadata = line_validation[0]['data']
                # Ensure required metadata fields
                if 'version' not in valid_metadata:
                    valid_metadata['version'] = self._file_version
                
                if 'chat_metadata' not in valid_metadata:
                    valid_metadata['chat_metadata'] = {}
                
                if 'chat_id' not in valid_metadata['chat_metadata']:
                    valid_metadata['chat_metadata']['chat_id'] = f"chat_{uuid.uuid4().hex}"
            else:
                # Create new metadata if first line is invalid
                character_name = self._extract_character_name_from_path(file_path)
                valid_metadata = {
                    "user_name": "User",
                    "character_name": character_name,
                    "create_date": datetime.now().isoformat(),
                    "version": self._file_version,
                    "chat_metadata": {
                        "chat_id": f"chat_{uuid.uuid4().hex}",
                        "tainted": False,
                        "timedWorldInfo": {
                            "sticky": {},
                            "cooldown": {}
                        },
                        "lastUser": None
                    }
                }
            
            # Collect valid messages
            for i, validation in enumerate(line_validation[1:], 1):
                if validation['valid']:
                    valid_messages.append(validation['data'])
                else:
                    self.logger.log_warning(f"Skipping invalid message at line {i+1}")
            
            # Write the repaired file atomically
            def content_writer(f):
                # Write the valid metadata
                json.dump(valid_metadata, f)
                f.write('\n')
                
                # Write all valid messages
                for msg in valid_messages:
                    json.dump(msg, f)
                    f.write('\n')
            
            # Use atomic file write operation
            success = self._atomic_write_file(file_path, content_writer)
            
            if success:
                self.logger.log_step(f"Successfully repaired chat file with {len(valid_messages)} valid messages")
            else:
                self.logger.log_error(f"Failed to write repaired chat file")
                # Restore from backup if repair failed
                if backup_path.exists():
                    shutil.copy2(backup_path, file_path)
                    self.logger.log_step(f"Restored from backup after failed repair")
                    
            return success
            
        except Exception as e:
            self.logger.log_error(f"Error repairing chat file {file_path}: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False
            
    def _create_backup(self, file_path: Path) -> Path:
        """
        Create a backup of a file with timestamped name.
        
        Args:
            file_path: Path to the file to backup
            
        Returns:
            Path: Path to the created backup file
        """
        # Generate a timestamped backup filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = file_path.parent / "backups"
        backup_dir.mkdir(exist_ok=True)
        
        backup_path = backup_dir / f"{file_path.stem}_{timestamp}{file_path.suffix}"
        
        try:
            shutil.copy2(file_path, backup_path)
            self.logger.log_step(f"Created backup: {backup_path}")
            return backup_path
        except Exception as e:
            self.logger.log_error(f"Failed to create backup: {str(e)}")
            raise

    def restore_from_backup(self, file_path: Path, backup_path: Optional[Path] = None) -> bool:
        """
        Restore a chat file from a backup.
        
        Args:
            file_path: Target path to restore to
            backup_path: Optional specific backup to restore from. If not provided,
                         the most recent backup will be used
                         
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            backup_dir = file_path.parent / "backups"
            
            if not backup_dir.exists():
                self.logger.log_warning(f"No backup directory found at: {backup_dir}")
                return False
                
            if backup_path:
                # Use the specified backup
                if not backup_path.exists():
                    self.logger.log_warning(f"Specified backup not found: {backup_path}")
                    return False
            else:
                # Find the most recent backup
                backups = list(backup_dir.glob(f"{file_path.stem}_*{file_path.suffix}"))
                
                if not backups:
                    self.logger.log_warning(f"No backups found for {file_path.name}")
                    return False
                    
                # Get the most recent backup by modification time
                backup_path = max(backups, key=lambda p: p.stat().st_mtime)
                
            # Copy the backup to the original location
            shutil.copy2(backup_path, file_path)
            self.logger.log_step(f"Restored {file_path} from backup: {backup_path}")
            
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error restoring from backup: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False
            
    def list_available_backups(self, file_path: Path) -> List[Dict]:
        """
        List all available backups for a given chat file.
        
        Args:
            file_path: Path to the original file
            
        Returns:
            List[Dict]: List of backup information including path and timestamp
        """
        try:
            backup_dir = file_path.parent / "backups"
            
            if not backup_dir.exists():
                return []
                
            backups = list(backup_dir.glob(f"{file_path.stem}_*{file_path.suffix}"))
            
            result = []
            for backup_path in backups:
                # Parse timestamp from filename
                try:
                    # Extract YYYYMMDD_HHMMSS format timestamp 
                    name_parts = backup_path.stem.split('_')
                    if len(name_parts) >= 2:
                        # Get the last two parts as they should be the timestamp
                        date_part = name_parts[-2]
                        time_part = name_parts[-1]
                        timestamp_str = f"{date_part}_{time_part}"
                        
                        try:
                            # Parse the timestamp
                            timestamp = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
                            display_date = timestamp.strftime("%b %d, %Y %I:%M %p")
                        except ValueError:
                            # Fallback to file modification time
                            display_date = datetime.fromtimestamp(backup_path.stat().st_mtime).strftime("%b %d, %Y %I:%M %p")
                    else:
                        display_date = datetime.fromtimestamp(backup_path.stat().st_mtime).strftime("%b %d, %Y %I:%M %p")
                        
                except Exception:
                    # Fallback to file modification time if timestamp extraction fails
                    display_date = datetime.fromtimestamp(backup_path.stat().st_mtime).strftime("%b %d, %Y %I:%M %p")
                
                # Get basic file stats
                stats = backup_path.stat()
                
                result.append({
                    'path': str(backup_path),
                    'filename': backup_path.name,
                    'created': display_date,
                    'size': stats.st_size,
                    'modified': datetime.fromtimestamp(stats.st_mtime).isoformat()
                })
            
            # Sort by modified time, newest first
            result.sort(key=lambda x: x.get('modified', ''), reverse=True)
            return result
            
        except Exception as e:
            self.logger.log_error(f"Error listing backups: {str(e)}")
            return []
            
    def _extract_character_name_from_path(self, file_path: Path) -> str:
        """
        Extract character name from a chat file path.
        
        Args:
            file_path: Path to the chat file
            
        Returns:
            str: Character name or "Unknown" if not found
        """
        try:
            # Expected format: chat_CharName_timestamp.jsonl
            # or located in /chats/CharName/file.jsonl
            
            # First try from the parent directory name
            char_dir = file_path.parent.name
            if char_dir and char_dir != "chats" and char_dir != "backups":
                return char_dir
            
            # Then try from the filename
            filename = file_path.stem
            parts = filename.split('_')
            
            if len(parts) >= 2 and parts[0] == 'chat':
                return parts[1]
                
            return "Unknown"
            
        except Exception:
            return "Unknown"

    # --- Phase 3: Optimized Save Strategy ---
    
    def set_autosave_interval(self, seconds: int) -> None:
        """
        Set the autosave interval in seconds.
        
        Args:
            seconds: Number of seconds between autosaves (minimum 1)
        """
        self._save_interval = max(1, seconds)
        self.logger.log_step(f"Set autosave interval to {self._save_interval} seconds")
    
    def append_message_debounced(self, character_data: Dict, message: Dict) -> bool:
        """
        Append a message with debounced saving to reduce disk writes.
        For single messages, buffers writes and only persists after a delay
        or when a threshold of messages is reached.
        
        Args:
            character_data: Character data dict
            message: Message to append
            
        Returns:
            bool: True if message was queued successfully
        """
        try:
            char_id = self._get_character_uuid(character_data)
            
            # Initialize tracking for this character if not exists
            if char_id not in self._pending_saves:
                self._pending_saves[char_id] = {
                    'character_data': character_data,
                    'messages': [],
                    'needs_save': False,
                    'last_save': time.time()
                }
            
            # Add message to pending saves
            self._pending_saves[char_id]['messages'].append(message)
            self._pending_saves[char_id]['needs_save'] = True
            
            # Track changes since last save
            if char_id not in self._changes_since_save:
                self._changes_since_save[char_id] = 0
            self._changes_since_save[char_id] += 1
            
            # If too many changes accumulated, save immediately
            if self._changes_since_save[char_id] >= 10:
                self.logger.log_step(f"Save threshold reached ({self._changes_since_save[char_id]} changes), saving immediately")
                self._flush_pending_save(char_id)
                return True
                
            # Otherwise schedule a delayed save
            self._schedule_delayed_save(char_id)
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error in debounced append: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            # Fall back to immediate save on error
            return self.append_message(character_data, message)
    
    def _schedule_delayed_save(self, char_id: str) -> None:
        """
        Schedule a delayed save for a character.
        Cancels any existing timer and creates a new one.
        
        Args:
            char_id: Character ID to schedule save for
        """
        # Cancel existing timer if any
        if char_id in self._save_timers:
            old_timer = self._save_timers[char_id]
            # Check if timer has a cancel method (threading.Timer does)
            if hasattr(old_timer, 'cancel'):
                old_timer.cancel()
        
        # Schedule new delayed save
        try:
            import threading
            timer = threading.Timer(self._save_interval, self._delayed_save_callback, args=[char_id])
            timer.daemon = True  # Don't let this prevent app exit
            timer.start()
            self._save_timers[char_id] = timer
            self.logger.log_step(f"Scheduled save for character {char_id} in {self._save_interval} seconds")
        except Exception as e:
            self.logger.log_error(f"Error scheduling delayed save: {str(e)}")
            # If we can't schedule, do an immediate save instead
            self._flush_pending_save(char_id)
    
    def _delayed_save_callback(self, char_id: str) -> None:
        """
        Callback for delayed save timer.
        Flushes pending saves for a character.
        
        Args:
            char_id: Character ID to save
        """
        try:
            self.logger.log_step(f"Executing delayed save for character {char_id}")
            self._flush_pending_save(char_id)
        except Exception as e:
            self.logger.log_error(f"Error in delayed save callback: {str(e)}")
    
    def _flush_pending_save(self, char_id: str) -> bool:
        """
        Flush pending saves for a character to disk.
        
        Args:
            char_id: Character ID to flush saves for
            
        Returns:
            bool: True if successful
        """
        try:
            if char_id not in self._pending_saves or not self._pending_saves[char_id].get('needs_save'):
                return True  # Nothing to save
                
            pending_data = self._pending_saves[char_id]
            character_data = pending_data['character_data']
            messages = pending_data['messages']
            
            # Get or create the chat file
            chat_file = self._get_or_create_chat_file(character_data, force_new=False)
            
            # Read existing content
            existing_metadata = {}
            existing_messages = []
            message_ids_to_update = {msg.get('id'): msg for msg in messages if msg.get('id')}
            
            try:
                with open(chat_file, 'r', encoding='utf-8') as f:
                    # Read the first line (metadata)
                    first_line = f.readline().strip()
                    if first_line:
                        existing_metadata = json.loads(first_line)
                    
                    # Read existing messages
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                            
                        try:
                            msg_data = json.loads(line)
                            existing_id = self._get_message_id(msg_data)
                            
                            # If this message is in our update list, use the updated version
                            if existing_id and existing_id in message_ids_to_update:
                                # Format the updated message
                                char_name = character_data.get('data', {}).get('name', 'unknown')
                                updated_message = self._format_message(
                                    message_ids_to_update[existing_id], 
                                    char_name
                                )
                                existing_messages.append(updated_message)
                                
                                # Remove from update list since we've handled it
                                del message_ids_to_update[existing_id]
                            else:
                                # Keep the existing message unchanged
                                existing_messages.append(msg_data)
                        except json.JSONDecodeError:
                            # Skip invalid lines
                            self.logger.log_warning(f"Skipping invalid JSON line in chat file")
                            continue
            except FileNotFoundError:
                # File doesn't exist yet, initialize it
                self.logger.log_step(f"Chat file {chat_file} doesn't exist, initializing it")
                self._initialize_chat_file(chat_file, character_data)
                
                # Read the metadata after initialization
                with open(chat_file, 'r', encoding='utf-8') as f:
                    first_line = f.readline().strip()
                    if first_line:
                        existing_metadata = json.loads(first_line)
            
            # Add any remaining new messages (ones that weren't updates to existing messages)
            char_name = character_data.get('data', {}).get('name', 'unknown')
            for msg_id, msg in message_ids_to_update.items():
                formatted_message = self._format_message(msg, char_name)
                existing_messages.append(formatted_message)
            
            # Write the file atomically with all messages
            def content_writer(f):
                # Write the metadata
                json.dump(existing_metadata, f)
                f.write('\n')
                
                # Write all messages
                for msg in existing_messages:
                    json.dump(msg, f)
                    f.write('\n')
            
            # Use atomic file write
            success = self._atomic_write_file(chat_file, content_writer)
            
            if success:
                self.logger.log_step(f"Successfully flushed {len(messages)} pending messages for {char_id}")
                
                # Reset tracking
                self._pending_saves[char_id]['messages'] = []
                self._pending_saves[char_id]['needs_save'] = False
                self._pending_saves[char_id]['last_save'] = time.time()
                self._changes_since_save[char_id] = 0
                
                # Update the active chat tracking
                chat_id = existing_metadata.get('chat_metadata', {}).get('chat_id')
                if chat_id:
                    self._update_active_chat(character_data, chat_id)
                
                return True
            else:
                self.logger.log_error(f"Failed to flush pending messages for {char_id}")
                return False
                
        except Exception as e:
            self.logger.log_error(f"Error flushing pending saves: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False
            
    def flush_all_pending_saves(self) -> bool:
        """
        Flush all pending saves for all characters.
        Call this on application shutdown to ensure all data is persisted.
        
        Returns:
            bool: True if all saves were successful
        """
        success = True
        for char_id in list(self._pending_saves.keys()):
            if self._pending_saves[char_id].get('needs_save'):
                char_success = self._flush_pending_save(char_id)
                if not char_success:
                    success = False
                    
        return success
        
    def save_chat_state_optimized(self, character_data: Dict, messages: List[Dict], 
                                lastUser: Optional[Dict] = None, 
                                api_info: Optional[Dict] = None, 
                                metadata: Optional[Dict] = None,
                                force_save: bool = False) -> bool:
        """
        Optimized version of save_chat_state that implements batch saving and change detection.
        Only saves when there are actual changes or when force_save is True.
        
        Args:
            character_data: Character data dictionary
            messages: List of messages to save
            lastUser: Last user information
            api_info: API information
            metadata: Additional metadata
            force_save: Whether to force save regardless of changes
            
        Returns:
            bool: True if successful (or no changes to save), False on error
        """
        try:
            char_id = self._get_character_uuid(character_data)
            
            # Skip saving if nothing has changed and not forcing
            if not force_save and self._is_chat_unchanged(char_id, messages, lastUser, api_info, metadata):
                self.logger.log_step(f"Skipping save - no changes detected for {char_id}")
                return True
                
            # Force flush any pending saves first
            if char_id in self._pending_saves and self._pending_saves[char_id].get('needs_save'):
                self._flush_pending_save(char_id)
                
            # Proceed with normal save
            success = self.save_chat_state(character_data, messages, lastUser, api_info, metadata)
            
            if success:
                # Update our tracking of the last saved state
                self._update_last_saved_state(char_id, messages, lastUser, api_info, metadata)
                self._changes_since_save[char_id] = 0
            
            return success
                
        except Exception as e:
            self.logger.log_error(f"Error in optimized save: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            
            # Fallback to regular save
            return self.save_chat_state(character_data, messages, lastUser, api_info, metadata)
            
    def _is_chat_unchanged(self, char_id: str, messages: List[Dict], 
                         lastUser: Optional[Dict], api_info: Optional[Dict], 
                         metadata: Optional[Dict]) -> bool:
        """
        Check if the chat state has changed since the last save.
        
        Args:
            char_id: Character ID
            messages: Current messages
            lastUser: Current last user info
            api_info: Current API info
            metadata: Current metadata
            
        Returns:
            bool: True if unchanged, False if changes detected
        """
        # If we have pending changes, there are changes
        if char_id in self._pending_saves and self._pending_saves[char_id].get('needs_save'):
            return False
            
        # If we've never saved before, there are changes
        if char_id not in self._pending_saves or 'last_saved_state' not in self._pending_saves[char_id]:
            return False
            
        last_state = self._pending_saves[char_id].get('last_saved_state', {})
        
        # Check if message count has changed
        if len(messages) != len(last_state.get('messages', [])):
            return False
            
        # Compare message IDs and content for changes
        last_messages = {msg.get('id'): msg.get('content') for msg in last_state.get('messages', []) if msg.get('id')}
        for msg in messages:
            msg_id = msg.get('id')
            if not msg_id:
                continue
                
            if msg_id not in last_messages or last_messages[msg_id] != msg.get('content'):
                return False
                
        # No changes detected
        return True
        
    def _update_last_saved_state(self, char_id: str, messages: List[Dict],
                               lastUser: Optional[Dict], api_info: Optional[Dict],
                               metadata: Optional[Dict]) -> None:
        """
        Update our tracking of the last saved state.
        
        Args:
            char_id: Character ID
            messages: Current messages
            lastUser: Current last user info
            api_info: Current API info
            metadata: Current metadata
        """
        if char_id not in self._pending_saves:
            self._pending_saves[char_id] = {}
            
        # Store a simplified version for change detection
        simple_messages = []
        for msg in messages:
            if msg.get('id'):
                simple_messages.append({
                    'id': msg.get('id'),
                    'content': msg.get('content'),
                    'role': msg.get('role')
                })
                
        self._pending_saves[char_id]['last_saved_state'] = {
            'messages': simple_messages,
            'lastUser': lastUser,
            'timestamp': time.time()
        }
        
    # --- Phase 4: Enhanced Chat Session Management ---
    
    def _build_session_index(self, character_data: Dict) -> List[Dict]:
        """
        Builds or refreshes the index of chat sessions for a character.
        This optimizes chat session listing and switching.
        
        Args:
            character_data: Character data dictionary
            
        Returns:
            List of chat session metadata
        """
        char_id = self._get_character_uuid(character_data)
        
        # List all chats for this character
        chat_list = self.list_character_chats(character_data, scan_all_files=True)
        
        # Index by chat_id for fast lookup
        indexed_chats = {chat['id']: chat for chat in chat_list if chat.get('id')}
        
        # Cache the session index
        self._session_index[char_id] = indexed_chats
        
        # Return the list form
        return list(indexed_chats.values())
    
    def get_chat_session_info(self, character_data: Dict, chat_id: str) -> Optional[Dict]:
        """
        Get detailed information about a specific chat session.
        Uses cached data when available for better performance.
        
        Args:
            character_data: Character data dictionary
            chat_id: Chat ID to get information about
            
        Returns:
            Dict with chat session details or None if not found
        """
        char_id = self._get_character_uuid(character_data)
        
        # Check if we have this session in cache
        if chat_id in self._session_metadata:
            return self._session_metadata[chat_id]
            
        # Check if we have a session index for this character
        if char_id not in self._session_index:
            self._build_session_index(character_data)
            
        # Look up in the session index
        if char_id in self._session_index and chat_id in self._session_index[char_id]:
            # Get basic info from index
            session_info = self._session_index[char_id][chat_id]
            
            # Try to load more detailed metadata from the file
            try:
                chat_dir = self._get_chat_path(character_data)
                file_path = Path(session_info['path'])
                
                with open(file_path, 'r', encoding='utf-8') as f:
                    first_line = f.readline().strip()
                    if first_line:
                        metadata = json.loads(first_line)
                        
                        # Count messages
                        f.seek(0)
                        message_count = sum(1 for line in f if line.strip()) - 1
                        
                        # Create detailed session info
                        detailed_info = {
                            'id': chat_id,
                            'path': str(file_path),
                            'character_id': char_id,
                            'character_name': character_data.get('data', {}).get('name', 'unknown'),
                            'filename': file_path.name,
                            'created': metadata.get('create_date'),
                            'message_count': message_count,
                            'preview': session_info.get('preview', ''),
                            'lastUser': metadata.get('chat_metadata', {}).get('lastUser'),
                            'api_info': metadata.get('chat_metadata', {}).get('api_info', {}),
                            'display_date': session_info.get('display_date', '')
                        }
                        
                        # Cache this metadata
                        self._session_metadata[chat_id] = detailed_info
                        return detailed_info
            except Exception as e:
                self.logger.log_error(f"Error loading detailed chat info: {str(e)}")
                # Return the basic info if we can't get details
                return session_info
            
        return None
    
    def list_chat_sessions(self, character_data: Dict, refresh: bool = False) -> List[Dict]:
        """
        List all chat sessions for a character with optimized caching.
        
        Args:
            character_data: Character data dictionary
            refresh: Force refresh the session index
            
        Returns:
            List of chat session information
        """
        char_id = self._get_character_uuid(character_data)
        
        # Check if we need to build/refresh the index
        if refresh or char_id not in self._session_index:
            return self._build_session_index(character_data)
        
        # Return the cached list
        return list(self._session_index[char_id].values())
    
    def switch_chat_session(self, character_data: Dict, chat_id: str) -> Dict:
        """
        Switch to a different chat session for a character.
        Handles all the necessary state updates and file operations.
        
        Args:
            character_data: Character data dictionary
            chat_id: Chat ID to switch to
            
        Returns:
            Dict with the loaded chat data or error information
        """
        try:
            char_id = self._get_character_uuid(character_data)
            
            # Flush any pending saves for the current session
            if char_id in self._pending_saves and self._pending_saves[char_id].get('needs_save'):
                self._flush_pending_save(char_id)
            
            # Load the new chat session
            result = self.load_chat(character_data, chat_id)
            
            if result and result.get('success'):
                # Update the active chat tracking
                self._update_active_chat(character_data, chat_id)
                self.logger.log_step(f"Switched to chat session {chat_id} for character {char_id}")
                
                # Return the chat data
                return result
            else:
                self.logger.log_error(f"Failed to switch to chat session {chat_id}: {result.get('error', 'Unknown error')}")
                return {
                    'success': False,
                    'error': f"Failed to load chat session: {result.get('error', 'Unknown error')}"
                }
                
        except Exception as e:
            self.logger.log_error(f"Error switching chat session: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return {
                'success': False,
                'error': f"Error switching chat session: {str(e)}"
            }
    
    def generate_chat_id(self, character_data: Dict) -> str:
        """
        Generate a consistent and reliable chat ID for a new chat session.
        
        Args:
            character_data: Character data dictionary
            
        Returns:
            str: New unique chat ID
        """
        # Generate a UUID v4 for uniqueness
        unique_id = uuid.uuid4().hex
        
        # Add a character-specific prefix for better organization
        char_id = self._get_character_uuid(character_data)
        short_char_id = char_id.split('-')[0] if '-' in char_id else char_id[:8]
        
        # Add a timestamp for chronological sorting
        timestamp = int(time.time())
        
        # Create the chat ID with all components
        chat_id = f"chat_{short_char_id}_{timestamp}_{unique_id[:8]}"
        
        return chat_id
        
    def clean_chat_sessions(self, character_data: Dict) -> Dict:
        """
        Clean up invalid or orphaned chat sessions for a character.
        
        Args:
            character_data: Character data dictionary
            
        Returns:
            Dict with cleaning results
        """
        try:
            # Force refresh of the session index
            sessions = self._build_session_index(character_data)
            
            # Validation results
            results = {
                'total': len(sessions),
                'valid': 0,
                'repaired': 0,
                'failed': 0,
                'details': []
            }
            
            # Process each session
            for session in sessions:
                chat_id = session.get('id')
                if not chat_id:
                    continue
                    
                file_path = Path(session.get('path', ''))
                if not file_path.exists():
                    results['failed'] += 1
                    results['details'].append({
                        'id': chat_id,
                        'status': 'failed',
                        'reason': 'File not found'
                    })
                    continue
                
                # Validate the file
                validation = self.validate_chat_file(file_path, attempt_repair=True)
                
                if validation.get('success'):
                    if validation.get('repair_actions'):
                        # File was repaired
                        results['repaired'] += 1
                        results['details'].append({
                            'id': chat_id,
                            'status': 'repaired',
                            'issues': validation.get('issues', [])
                        })
                    else:
                        # File is valid
                        results['valid'] += 1
                        results['details'].append({
                            'id': chat_id,
                            'status': 'valid'
                        })
                else:
                    # File is invalid and couldn't be repaired
                    results['failed'] += 1
                    results['details'].append({
                        'id': chat_id,
                        'status': 'failed',
                        'issues': validation.get('issues', [])
                    })
            
            # Refresh session index after cleaning
            self._build_session_index(character_data)
            
            self.logger.log_step(f"Cleaned chat sessions: {results['valid']} valid, {results['repaired']} repaired, {results['failed']} failed")
            return {
                'success': True,
                'results': results
            }
            
        except Exception as e:
            self.logger.log_error(f"Error cleaning chat sessions: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return {
                'success': False,
                'error': f"Error cleaning chat sessions: {str(e)}"
            }
            
    def get_active_chat_session(self, character_data: Dict) -> Optional[Dict]:
        """
        Get information about the currently active chat session for a character.
        
        Args:
            character_data: Character data dictionary
            
        Returns:
            Dict with session information or None if no active session
        """
        try:
            # Get the character ID
            char_id = self._get_character_uuid(character_data)
            
            # Get the active chat ID
            active_chat_id = self._get_active_chat_id(character_data)
            if not active_chat_id:
                return None
                
            # Get detailed session info
            return self.get_chat_session_info(character_data, active_chat_id)
            
        except Exception as e:
            self.logger.log_error(f"Error getting active chat session: {str(e)}")
            return None
            
    def rename_chat_session(self, character_data: Dict, chat_id: str, new_title: str) -> bool:
        """
        Rename a chat session by updating its title in metadata.
        
        Args:
            character_data: Character data dictionary
            chat_id: ID of the chat to rename
            new_title: New title for the chat
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Get the session info to find the file
            session_info = self.get_chat_session_info(character_data, chat_id)
            if not session_info:
                self.logger.log_warning(f"Chat session not found: {chat_id}")
                return False
                
            file_path = Path(session_info['path'])
            if not file_path.exists():
                self.logger.log_warning(f"Chat file not found: {file_path}")
                return False
                
            # Read the current content
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = [line.strip() for line in f if line.strip()]
                
            if not lines:
                self.logger.log_warning(f"Chat file is empty: {file_path}")
                return False
                
            # Parse and update the metadata
            try:
                metadata = json.loads(lines[0])
                if 'chat_metadata' not in metadata:
                    metadata['chat_metadata'] = {}
                    
                # Update the title
                metadata['chat_metadata']['title'] = new_title
                
                # Write back the file with updated metadata
                def content_writer(f):
                    # Write updated metadata
                    json.dump(metadata, f)
                    f.write('\n')
                    
                    # Write remaining lines (messages)
                    for line in lines[1:]:
                        f.write(line)
                        f.write('\n')
                
                success = self._atomic_write_file(file_path, content_writer)
                
                if success:
                    # Update session cache if available
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