import os
import sys
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

class ChatHandler:
    def __init__(self, logger):
        self.logger = logger
        self._current_chat_file = None  # Track current chat file

    def _sanitize_filename(self, name: str) -> str:
        """Remove invalid characters from filename."""
        return "".join(c for c in name if c.isalnum() or c in ('-', '_', ' '))

    def _get_chat_path(self, character_name: str) -> Path:
        """Get the chat directory path for a character."""
        base_dir = Path(sys._MEIPASS) if getattr(sys, 'frozen', False) else Path.cwd()
        char_dir = base_dir / 'chats' / self._sanitize_filename(character_name)
        char_dir.mkdir(parents=True, exist_ok=True)
        return char_dir

    def _get_or_create_chat_file(self, character_name: str, force_new: bool = False) -> Path:
        """Get current chat file or create new one.
        
        Args:
            character_name: Name of the character
            force_new: If True, always create a new file
            
        Returns:
            Path to the chat file
        """
        if self._current_chat_file and self._current_chat_file.exists():
            return self._current_chat_file
            
        # Create new file if needed
        if force_new or not self._current_chat_file or not self._current_chat_file.exists():
            chat_dir = self._get_chat_path(character_name)
            timestamp = datetime.now().strftime("%Y%m%d@%Hh%Mm")
            self._current_chat_file = chat_dir / f"{self._sanitize_filename(character_name)}-{timestamp}.jsonl"
            
            # Write metadata if new file
            if not self._current_chat_file.exists():
                with open(self._current_chat_file, 'w', encoding='utf-8') as f:
                    json.dump(self._create_chat_metadata(character_name), f)
                    f.write('\n')
                    
            self.logger.log_step(f"Created new chat file: {self._current_chat_file}")
                    
        return self._current_chat_file

    def _create_chat_metadata(self, character_name: str) -> Dict:
        """Create initial chat metadata matching Silly Tavern format."""
        return {
            "user_name": "User",
            "character_name": character_name,
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

    def _format_message(self, msg: Dict, character_name: str) -> Dict:
        """Format a message to match Silly Tavern format."""
        is_user = msg['role'] == 'user'
        formatted = {
            "name": "User" if is_user else character_name,
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

    def append_message(self, character_name: str, message: Dict) -> bool:
        """Append a single message to the current chat file."""
        try:
            chat_file = self._get_or_create_chat_file(character_name, force_new=False)
            
            with open(chat_file, 'a', encoding='utf-8') as f:
                json.dump(self._format_message(message, character_name), f)
                f.write('\n')
                
            self.logger.log_step(f"Appended message to {chat_file}")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Failed to append message: {str(e)}")
            return False

    def save_chat_state(self, character_name: str, messages: List[Dict]) -> bool:
        """Save the complete chat state to a JSONL file."""
        try:
            chat_file = self._get_or_create_chat_file(character_name, force_new=False)
            
            with open(chat_file, 'w', encoding='utf-8') as f:
                # Write metadata first
                json.dump(self._create_chat_metadata(character_name), f)
                f.write('\n')
                
                # Write all messages
                for msg in messages:
                    json.dump(self._format_message(msg, character_name), f)
                    f.write('\n')
                    
            self.logger.log_step(f"Saved full chat state to {chat_file}")
            return True
            return True
            
        except Exception as e:
            self.logger.log_error(f"Failed to save chat: {str(e)}")
            return False

    def load_latest_chat(self, character_name: str) -> Optional[List[Dict]]:
        """Load the most recent chat for a character."""
        try:
            self.logger.log_step(f"Loading latest chat for character: {character_name}")
            
            # Update current character
            self._current_character = character_name
            self._current_chat_file = None  # Reset current file
            
            chat_dir = self._get_chat_path(character_name)
            self.logger.log_step(f"Scanning directory: {chat_dir}")
            
            chat_files = list(chat_dir.glob(f"{self._sanitize_filename(character_name)}*.jsonl"))
            self.logger.log_step(f"Found {len(chat_files)} chat files")
            
            if not chat_files:
                self.logger.log_step(f"No existing chats found for {character_name}")
                return None
                
            # Get most recent chat file
            latest_chat = max(chat_files, key=os.path.getctime)
            self._current_chat_file = latest_chat  # Track current file
            self.logger.log_step(f"Loading chat from {latest_chat}")
            
            messages = []
            with open(latest_chat, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.strip():
                        st_message = json.loads(line)
                        converted = self._convert_silly_tavern_message(st_message)
                        if converted:  # Skip metadata object
                            messages.append(converted)
                            
            self.logger.log_step(f"Loaded {len(messages)} messages")
            return messages
            
        except Exception as e:
            self.logger.log_error(f"Failed to load chat: {str(e)}")
            return None