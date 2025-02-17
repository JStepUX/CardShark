import os
import sys
import json
import time
import hashlib
from datetime import datetime
from pathlib import Path
import traceback
from typing import Dict, List, Optional

class ChatHandler:
    def __init__(self, logger):
        self.logger = logger
        self._current_chat_file = None
        self._character_ids = {}  # Cache of character IDs

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
        return "".join(c for c in name if c.isalnum() or c in ('-', '_', ' '))

    def _get_chat_path(self, character_data: Dict) -> Path:
        """Get the chat directory path for a character using unique ID and versioning."""
        # Get base name and sanitize
        char_name = self._sanitize_filename(character_data.get('data', {}).get('name', 'unknown'))
        
        # Get or generate character ID
        char_id = self._character_ids.get(character_data.get('data', {}).get('name'))
        if not char_id:
            char_id = self._generate_character_id(character_data)
            self._character_ids[character_data.get('data', {}).get('name')] = char_id

        # Create base directory path
        base_dir = Path(sys._MEIPASS) if getattr(sys, 'frozen', False) else Path.cwd()
        chats_dir = base_dir / 'chats'
        
        # Find all existing directories for this character
        existing_dirs = [
            d for d in chats_dir.glob(f"{char_name}*")
            if d.is_dir() and (d.name == char_name or d.name.startswith(f"{char_name} ("))
        ]
        
        # If no directories exist, use base name
        if not existing_dirs:
            chat_dir = chats_dir / char_name
            self.logger.log_step(f"Creating first directory for {char_name}")
        else:
            # Check if we have a matching directory by character ID
            matching_dir = None
            for d in existing_dirs:
                meta_file = d / "character_meta.json"
                if meta_file.exists():
                    try:
                        with open(meta_file, 'r') as f:
                            meta = json.load(f)
                            if meta.get('character_id') == char_id:
                                matching_dir = d
                                break
                    except:
                        continue
            
            if matching_dir:
                chat_dir = matching_dir
                self.logger.log_step(f"Using existing directory: {chat_dir}")
            else:
                # Create new versioned directory
                version = len(existing_dirs) + 1
                chat_dir = chats_dir / f"{char_name} ({version})"
                self.logger.log_step(f"Creating new versioned directory: {chat_dir}")
        
        # Create directory and metadata
        chat_dir.mkdir(parents=True, exist_ok=True)
        
        # Save character metadata
        meta_file = chat_dir / "character_meta.json"
        if not meta_file.exists():
            meta = {
                "character_id": char_id,
                "character_data": char_name,
                "created_at": datetime.now().isoformat(),
                "description_hash": hashlib.md5(
                    character_data.get('data', {}).get('description', '').encode()
                ).hexdigest()
            }
            with open(meta_file, 'w') as f:
                json.dump(meta, f, indent=2)
        
        self.logger.log_step(f"Using chat directory: {chat_dir}")
        return chat_dir

    def _get_or_create_chat_file(self, character_data: Dict, force_new: bool = False) -> Path:
        """Get current chat file or create new one."""
        if self._current_chat_file and self._current_chat_file.exists() and not force_new:
            return self._current_chat_file
            
        # Create new file
        chat_dir = self._get_chat_path(character_data)
        timestamp = datetime.now().strftime("%Y%m%d@%Hh%Mm")
        char_name = self._sanitize_filename(character_data.get('data', {}).get('name', 'unknown'))
        
        self._current_chat_file = chat_dir / f"{char_name}-{timestamp}.jsonl"
        
        # Write metadata if new file
        if not self._current_chat_file.exists():
            with open(self._current_chat_file, 'w', encoding='utf-8') as f:
                json.dump(self._create_chat_metadata(character_data), f)
                f.write('\n')
                    
        self.logger.log_step(f"Created new chat file: {self._current_chat_file}")
        return self._current_chat_file

    def _create_chat_metadata(self, character_data: Dict) -> Dict:
        """Create initial chat metadata with character ID."""
        char_id = self._character_ids.get(character_data.get('data', {}).get('name')) or \
                 self._generate_character_id(character_data)
                 
        return {
            "user_name": "User",
            "character_data": character_data.get('data', {}).get('name', ''),
            "character_id": char_id,
            "create_date": datetime.now().strftime("%Y-%m-%d@%Hh%Mm%Ss"),
            "chat_metadata": {
                "chat_id_hash": hash(str(time.time())),
                "tainted": False,
                "timedWorldInfo": {
                    "sticky": {},
                    "cooldown": {}
                }
            }
        }

    def _format_message(self, msg: Dict, character_data: str) -> Dict:
        """Format a message to match Silly Tavern format."""
        is_user = msg['role'] == 'user'
        formatted = {
            "name": "User" if is_user else character_data,
            "is_user": is_user,
            "is_system": False,
            "send_date": datetime.fromtimestamp(msg['timestamp']/1000).strftime("%B %d, %Y %I:%M%p"),
            "mes": msg['content'],
            "extra": {}
        }

        # Add variations if present
        if msg.get('variations'):
            formatted['swipe_id'] = msg.get('currentVariation', 0)
            formatted['swipes'] = msg['variations']
            
            # Add generation metadata if it's an AI response
            if not is_user:
                formatted['gen_started'] = datetime.fromtimestamp(msg['timestamp']/1000).isoformat() + "Z"
                formatted['gen_finished'] = datetime.fromtimestamp((msg['timestamp'] + 100)/1000).isoformat() + "Z"
                formatted['extra'] = {
                    "api": "koboldcpp",
                    "model": "unknown"
                }

        return formatted

    def _convert_silly_tavern_message(self, message: Dict) -> Optional[Dict]:
        """Convert a Silly Tavern message to our internal format."""
        # Skip metadata object
        if "chat_metadata" in message:
            return None
            
        try:
            timestamp = int(datetime.strptime(message["send_date"], 
                                            "%B %d, %Y %I:%M%p").timestamp() * 1000)
                                            
            converted = {
                "id": str(timestamp),
                "role": "user" if message["is_user"] else "assistant",
                "content": message["mes"],
                "timestamp": timestamp
            }
            
            # Handle variations if present
            if "swipes" in message:
                converted["variations"] = message["swipes"]
                converted["currentVariation"] = message.get("swipe_id", 0)
                
            return converted
        except Exception as e:
            self.logger.log_error(f"Error converting message: {str(e)}")
            return None

    def append_message(self, character_data: str, message: Dict) -> bool:
        """Append a single message to the current chat file."""
        try:
            chat_file = self._get_or_create_chat_file(character_data, force_new=False)
            
            with open(chat_file, 'a', encoding='utf-8') as f:
                json.dump(self._format_message(message, character_data), f)
                f.write('\n')
                
            self.logger.log_step(f"Appended message to {chat_file}")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Failed to append message: {str(e)}")
            return False

    def save_chat_state(self, character_data: str, messages: List[Dict]) -> bool:
        """Save the complete chat state to a JSONL file."""
        try:
            chat_file = self._get_or_create_chat_file(character_data, force_new=False)
            
            with open(chat_file, 'w', encoding='utf-8') as f:
                # Write metadata first
                json.dump(self._create_chat_metadata(character_data), f)
                f.write('\n')
                
                # Write all messages
                for msg in messages:
                    json.dump(self._format_message(msg, character_data), f)
                    f.write('\n')
                    
            self.logger.log_step(f"Saved full chat state to {chat_file}")
            return True
            return True
            
        except Exception as e:
            self.logger.log_error(f"Failed to save chat: {str(e)}")
            return False

    def load_latest_chat(self, character_data: Dict) -> Optional[List[Dict]]:
        """Load the most recent chat for a character."""
        try:
            self.logger.log_step(f"Loading latest chat for character: {character_data.get('data', {}).get('name')}")
            
            # Reset current chat file
            self._current_chat_file = None
            
            # Get chat directory and all potential chat files
            chat_dir = self._get_chat_path(character_data)
            self.logger.log_step(f"Scanning directory: {chat_dir}")
            
            # Get character name for file matching
            char_name = self._sanitize_filename(character_data.get('data', {}).get('name', 'unknown'))
            
            # Find all chat files for this character
            chat_files = list(chat_dir.glob(f"{char_name}*.jsonl"))
            self.logger.log_step(f"Found {len(chat_files)} chat files")
            
            if not chat_files:
                self.logger.log_step("No existing chats found")
                return None
                
            # Get the most recent chat file by creation time
            latest_chat = max(chat_files, key=lambda f: f.stat().st_mtime)
            self._current_chat_file = latest_chat
            
            self.logger.log_step(f"Loading chat from {latest_chat}")
            self.logger.log_step(f"File modification time: {latest_chat.stat().st_mtime}")
            
            # Load and convert messages
            messages = []
            with open(latest_chat, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.strip():
                        try:
                            st_message = json.loads(line)
                            converted = self._convert_silly_tavern_message(st_message)
                            if converted:  # Skip metadata object
                                messages.append(converted)
                        except json.JSONDecodeError as e:
                            self.logger.log_error(f"Error parsing message: {e}")
                            continue
                            
            self.logger.log_step(f"Loaded {len(messages)} messages")
            
            # Validate messages are in correct order
            messages.sort(key=lambda x: x['timestamp'])
            
            return messages
            
        except Exception as e:
            self.logger.log_error(f"Failed to load chat: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return None