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

class ChatHandler:
    def __init__(self, logger):
        self.logger = logger
        self._current_chat_file = None
        self._character_ids = {}  # Cache of character IDs

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
        
        # Create base directory path that's consistent
        if getattr(sys, 'frozen', False):
            # Running as PyInstaller bundle
            base_dir = Path(sys.executable).parent
        else:
            # Running from source
            base_dir = Path.cwd()
        
        # Check if base_dir already contains a 'frontend' directory
        if base_dir.name == 'frontend':
            # Already in a frontend directory, just add 'chats'
            chats_dir = base_dir / 'chats'
        else:
            # Not in a frontend directory, use the standard path
            chats_dir = base_dir / 'chats'  # Removed the 'frontend' part
        
        chats_dir.mkdir(parents=True, exist_ok=True)
        
        # Create character-specific directory
        char_name = self._sanitize_filename(character_data.get('data', {}).get('name', 'unknown'))
        chat_dir = chats_dir / f"{char_name}-{char_id}"
        chat_dir.mkdir(parents=True, exist_ok=True)
        
        self.logger.log_step(f"Using chat directory: {chat_dir}")
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
            
            # Use provided chat_id or generate a new one
            if not chat_id:
                chat_id = f"{char_id}_{int(time.time())}"
            
            metadata = {
                "user_name": "User",
                "character_name": char_name,
                "character_id": char_id,
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
            
            # Write metadata to file
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f)
                f.write('\n')
                
        except Exception as e:
            self.logger.log_error(f"Error initializing chat file: {str(e)}")

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
                
            # Read existing messages to check if this is an update
            existing_messages = []
            updated_existing = False
            
            with open(chat_file, 'r', encoding='utf-8') as f:
                # Skip the first line (metadata)
                first_line = f.readline()
                metadata = json.loads(first_line) if first_line.strip() else {}
                
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
            
            if updated_existing:
                # Rewrite the entire file with the updated message
                with open(chat_file, 'w', encoding='utf-8') as f:
                    # Write the metadata first
                    json.dump(metadata, f)
                    f.write('\n')
                    
                    # Write all messages
                    for msg in existing_messages:
                        json.dump(msg, f)
                        f.write('\n')
                        
                self.logger.log_step(f"Updated message with ID {message_id}")
                return True
            else:
                # It's a new message, append it normally
                with open(chat_file, 'a', encoding='utf-8') as f:
                    formatted_message = self._format_message(message, char_name)
                    json.dump(formatted_message, f)
                    f.write('\n')
                    
                self.logger.log_step(f"Appended new message with ID {message_id}")
                return True
                
        except Exception as e:
            self.logger.log_error(f"Failed to append/update message: {str(e)}")
            return False

    def save_chat_state(self, character_data: Dict, messages: List[Dict], lastUser: Optional[Dict] = None, api_info: Optional[Dict] = None) -> bool:
        """Save complete chat state to a file with API information."""
        self.logger.log_step(f"Saving chat state for character: {character_data.get('data', {}).get('name')}")
        
        try:
            # Get or create chat file with current chat_id
            chat_file = self._get_or_create_chat_file(character_data, force_new=False)
            char_name = character_data.get('data', {}).get('name', 'unknown')
            
            # Try to preserve the current chat_id if possible
            current_chat_id = None
            if chat_file.exists():
                try:
                    with open(chat_file, 'r', encoding='utf-8') as f:
                        first_line = f.readline().strip()
                        if first_line:
                            metadata = json.loads(first_line)
                            current_chat_id = metadata.get('chat_metadata', {}).get('chat_id')
                except:
                    pass
            
            with open(chat_file, 'w', encoding='utf-8') as f:
                # Create metadata with lastUser and preserve chat_id if available
                char_id = self._get_character_uuid(character_data)
                
                # Use existing chat_id or generate a new one
                chat_id = current_chat_id if current_chat_id else f"{char_id}_{int(time.time())}"
                
                # Prepare metadata including API information
                metadata = {
                    "user_name": "User",
                    "character_name": char_name,
                    "character_id": char_id,
                    "create_date": datetime.now().isoformat(),
                    "chat_metadata": {
                        "chat_id": chat_id,
                        "tainted": False,
                        "timedWorldInfo": {
                            "sticky": {},
                            "cooldown": {}
                        },
                        "lastUser": lastUser,
                        "api_info": api_info or {}  # Add API information
                    }
                }
                
                # Write metadata
                json.dump(metadata, f)
                f.write('\n')
                
                # Write all messages
                for msg in messages:
                    formatted_msg = self._format_message(msg, char_name)
                    json.dump(formatted_msg, f)
                    f.write('\n')
                    
            self.logger.log_step(f"Saved chat with {len(messages)} messages to {chat_file}")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Failed to save chat: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False

    def load_latest_chat(self, character_data: Dict) -> Optional[Dict]:
        """Load the most recent chat for a character."""
        try:
            self.logger.log_step(f"Loading latest chat for character: {character_data.get('data', {}).get('name')}")
            
            # Reset current chat file
            self._current_chat_file = None
            
            # Get chat directory and use it to get/create a chat file (will pick most recent)
            chat_file = self._get_or_create_chat_file(character_data, force_new=False)
            self.logger.log_step(f"Loading chat from {chat_file}")
            
            # Load the chat content
            return self._load_chat_file(chat_file)
            
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
                for line_num, line in enumerate(f):
                    if line.strip():
                        try:
                            data = json.loads(line)
                            if line_num == 0 or 'chat_metadata' in data:
                                metadata = data
                                self.logger.log_step("Found chat metadata")
                            else:
                                converted = self._convert_to_internal_format(data)
                                if converted:
                                    messages.append(converted)
                        except json.JSONDecodeError as e:
                            self.logger.log_error(f"Error parsing line {line_num}: {e}")
                            continue
                            
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
            
            # Load the chat content
            return self._load_chat_file(matching_file)
            
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
            
            # Return empty chat info
            return {
                'success': True,
                'messages': [],
                'metadata': None
            }
            
        except Exception as e:
            self.logger.log_error(f"Failed to create new chat: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return None

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