"""
File operations manager for the reliable chat system.

This module handles all file-related operations including atomic writes,
backup creation, JSONL validation, and file I/O for chat data.
"""

import os
import sys
import json
import time
import uuid
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from contextlib import contextmanager

from .chat_models import ChatMetadata, ChatMessage, ChatOperationResult
from backend.log_manager import LogManager


class ChatFileManager:
    """Handles all file operations for chat persistence"""
    
    def __init__(self, logger: LogManager, base_dir: Optional[Path] = None):
        self.logger = logger
        self.base_dir = base_dir or self._get_base_directory()
        self.chats_dir = self.base_dir / 'chats'
        self.backup_dir = self.base_dir / 'chats' / 'backups'
        self.file_permissions = 0o644
        
        # Ensure directories exist
        self.chats_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        self.logger.debug("ChatFileManager initialized")
    
    def _get_base_directory(self) -> Path:
        """Get the base directory for the application"""
        if getattr(sys, 'frozen', False):
            return Path(sys.executable).parent
        else:
            return Path.cwd()
    
    @contextmanager
    def atomic_file_write(self, target_path: Path, mode: str = 'w', encoding: str = 'utf-8'):
        """
        Context manager for atomic file writes using temp file + rename.
        """
        target_path.parent.mkdir(parents=True, exist_ok=True)
        temp_file = None
        temp_path = None
        
        try:
            # Create temporary file in same directory as target
            temp_file = tempfile.NamedTemporaryFile(
                mode=mode,
                encoding=encoding,
                dir=target_path.parent,
                prefix=f".{target_path.name}_",
                suffix=".tmp",
                delete=False
            )
            temp_path = Path(temp_file.name)
            
            yield temp_file
            
            # Ensure all data is written
            temp_file.flush()
            os.fsync(temp_file.fileno())
            temp_file.close()
            
            # Atomic rename operation
            if os.name == 'nt':  # Windows
                if target_path.exists():
                    target_path.unlink()
            
            os.rename(str(temp_path), str(target_path))
            
            # Set proper file permissions
            try:
                target_path.chmod(self.file_permissions)
            except (OSError, PermissionError):
                pass  # Permissions might not be changeable on some systems
                
            self.logger.debug(f"Atomic write successful: {target_path}")
            
        except Exception as e:
            # Clean up temp file on error
            if temp_file and not temp_file.closed:
                temp_file.close()
            if temp_path and temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    pass
            raise e
    
    def validate_jsonl_file(self, file_path: Path) -> Tuple[bool, Optional[str]]:
        """
        Validate JSONL file integrity.
        Returns (is_valid, error_message)
        """
        if not file_path.exists():
            return False, "File does not exist"
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            if not lines:
                return False, "File is empty"
            
            # Validate first line (metadata)
            try:
                metadata = json.loads(lines[0].strip())
                if 'chat_metadata' not in metadata:
                    return False, "Missing chat_metadata in first line"
            except json.JSONDecodeError as e:
                return False, f"Invalid JSON in metadata line: {e}"
            
            # Validate message lines
            for i, line in enumerate(lines[1:], 2):
                if line.strip():  # Skip empty lines
                    try:
                        json.loads(line.strip())
                    except json.JSONDecodeError as e:
                        return False, f"Invalid JSON in line {i}: {e}"
            
            return True, None
            
        except Exception as e:
            return False, f"Error reading file: {e}"
    
    def create_backup(self, file_path: Path) -> Optional[Path]:
        """Create a timestamped backup of a file"""
        if not file_path.exists():
            return None
        
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_name = f"{file_path.stem}_{timestamp}.bak"
            backup_path = self.backup_dir / backup_name
            
            shutil.copy2(file_path, backup_path)
            self.logger.debug(f"Backup created: {backup_path}")
            return backup_path
            
        except Exception as e:
            self.logger.log_error(f"Failed to create backup: {e}")
            return None
    
    def find_latest_backup(self, file_path: Path) -> Optional[Path]:
        """Find the latest backup for a given file"""
        try:
            stem = file_path.stem
            backups = list(self.backup_dir.glob(f"{stem}_*.bak"))
            if backups:
                return max(backups, key=lambda p: p.stat().st_mtime)
        except Exception:
            pass
        return None
    
    def get_chat_file_path(self, chat_session_uuid: str, character_uuid: str) -> Path:
        """Get the file path for a chat session"""
        # Create character subdirectory
        char_dir = self.chats_dir / character_uuid[:8]
        char_dir.mkdir(exist_ok=True)
        
        filename = self._generate_chat_filename(character_uuid, chat_session_uuid)
        return char_dir / filename
    
    def _generate_chat_filename(self, character_uuid: str, chat_session_uuid: str) -> str:
        """Generate a consistent filename for chat files"""
        # Use first 8 chars of each UUID for readability
        char_short = character_uuid[:8]
        chat_short = chat_session_uuid[:8]
        timestamp = int(time.time())
        return f"chat_{char_short}_{chat_short}_{timestamp}.jsonl"
    
    def write_chat_metadata_line(self, file_handle, metadata: ChatMetadata, 
                                character_name: str, api_info: Optional[Dict] = None):
        """Write the metadata line (first line) of a JSONL chat file"""
        metadata_obj = {
            "user_name": "User",
            "character_name": character_name,
            "character_id": metadata.character_uuid,
            "create_date": datetime.fromtimestamp(metadata.created_timestamp / 1000).isoformat(),
            "timestamp": metadata.created_timestamp,
            "version": "2.0",
            "chat_metadata": {
                "chat_id": metadata.chat_session_uuid,
                "tainted": False,
                "created_timestamp": metadata.created_timestamp,
                "title": metadata.title,
                "timedWorldInfo": {"sticky": {}, "cooldown": {}},
                "lastUser": None,
                "api_info": api_info
            }
        }
        
        json.dump(metadata_obj, file_handle)
        file_handle.write('\n')
    
    def write_message_line(self, file_handle, message: ChatMessage, character_name: str):
        """Write a message line to the JSONL file"""
        # Convert to SillyTavern-compatible format
        is_user = message.role == 'user'
        
        formatted_message = {
            "name": "User" if is_user else character_name,
            "is_user": is_user,
            "is_name": True,
            "send_date": datetime.fromtimestamp(message.timestamp / 1000).strftime("%B %d, %Y %I:%M%p"),
            "mes": message.content,
            "extra": {
                "id": message.id,
                "api": "cardshark",
                "model": "unknown",
                "status": message.status
            }
        }
        
        # Add variations if present
        if message.variations and len(message.variations) > 1:
            formatted_message['swipe_id'] = message.current_variation or 0
            formatted_message['swipes'] = message.variations
        
        # Add generation timestamps for assistant messages
        if not is_user:
            formatted_message['gen_started'] = datetime.fromtimestamp(message.timestamp / 1000).isoformat() + "Z"
            formatted_message['gen_finished'] = datetime.fromtimestamp((message.timestamp + 100) / 1000).isoformat() + "Z"
        
        json.dump(formatted_message, file_handle)
        file_handle.write('\n')
    
    def read_chat_file(self, file_path: Path) -> Tuple[ChatMetadata, List[ChatMessage]]:
        """Read and parse a JSONL chat file"""
        if not file_path.exists():
            raise FileNotFoundError(f"Chat file not found: {file_path}")
        
        # Validate file first
        is_valid, error = self.validate_jsonl_file(file_path)
        if not is_valid:
            raise ValueError(f"Invalid JSONL file: {error}")
        
        messages = []
        metadata = None
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            # Parse metadata (first line)
            if lines:
                metadata_obj = json.loads(lines[0].strip())
                chat_meta = metadata_obj.get('chat_metadata', {})
                
                metadata = ChatMetadata(
                    chat_session_uuid=chat_meta.get('chat_id', ''),
                    character_uuid=metadata_obj.get('character_id', ''),
                    user_uuid=None,  # Not stored in old format
                    title=chat_meta.get('title', 'Untitled Chat'),
                    created_timestamp=chat_meta.get('created_timestamp', int(time.time() * 1000)),
                    last_message_time=None,  # Will be calculated
                    message_count=len(lines) - 1,
                    chat_log_path=str(file_path)
                )
            
            # Parse messages (remaining lines)
            for line in lines[1:]:
                if line.strip():
                    msg_data = json.loads(line.strip())
                    
                    # Convert from SillyTavern format
                    message = ChatMessage(
                        id=msg_data.get('extra', {}).get('id', str(uuid.uuid4())),
                        role='user' if msg_data.get('is_user', False) else 'assistant',
                        content=msg_data.get('mes', ''),
                        timestamp=self._parse_timestamp(msg_data.get('send_date', '')),
                        status=msg_data.get('extra', {}).get('status', 'complete'),
                        variations=msg_data.get('swipes', [msg_data.get('mes', '')]) if 'swipes' in msg_data else None,
                        current_variation=msg_data.get('swipe_id', 0) if 'swipes' in msg_data else None
                    )
                    
                    messages.append(message)
            
            # Update last message time
            if messages and metadata:
                metadata.last_message_time = datetime.fromtimestamp(messages[-1].timestamp / 1000)
            
            return metadata, messages
            
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            raise ValueError(f"Error parsing chat file: {e}")
    
    def _parse_timestamp(self, date_str: str) -> int:
        """Parse timestamp from SillyTavern date format"""
        try:
            dt = datetime.strptime(date_str, "%B %d, %Y %I:%M%p")
            return int(dt.timestamp() * 1000)
        except (ValueError, TypeError):
            return int(time.time() * 1000)
