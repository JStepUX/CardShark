"""
Reliable Chat Manager - Main orchestrator for the modular chat system.

This module coordinates between the file manager, database manager, and
provides the main API for reliable chat operations.
"""

import time
import uuid
import shutil
import traceback
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session

from backend.log_manager import LogManager
from .chat_models import (
    ChatMetadata, ChatMessage, ChatOperationResult,
    ChatCreateResult, ChatLoadResult, ChatSaveResult, 
    ChatListResult, ChatDeleteResult
)
from .chat_file_manager import ChatFileManager
from .chat_db_manager import ChatDatabaseManager


class ReliableChatManager:
    """
    Main orchestrator for reliable chat operations.
    
    Coordinates between file operations and database operations to ensure
    atomic, consistent chat persistence.
    """
    
    def __init__(self, db_session: Session, logger: LogManager, base_dir: Optional[Path] = None):
        self.db_session = db_session
        self.logger = logger
        
        # Initialize sub-managers
        self.file_manager = ChatFileManager(logger, base_dir)
        self.db_manager = ChatDatabaseManager(logger)
        
        self.logger.log_info("ReliableChatManager v2 initialized")
    
    # === CORE CHAT OPERATIONS ===
    
    def create_new_chat(self, character_uuid: str, character_name: str, 
                       user_uuid: Optional[str] = None, title: Optional[str] = None, 
                       initial_message: Optional[str] = None) -> Tuple[ChatOperationResult, Optional[str], Optional[str]]:
        """
        Create a new chat session.
        
        Returns:
            (result_code, chat_session_uuid, error_message)
        """
        chat_session_uuid = str(uuid.uuid4())
        
        try:
            self.logger.log_info(f"Creating new chat for character {character_uuid}")
            
            # Generate file path
            file_path = self.file_manager.get_chat_file_path(chat_session_uuid, character_uuid)
            
            # Create metadata
            metadata = ChatMetadata(
                chat_session_uuid=chat_session_uuid,
                character_uuid=character_uuid,
                user_uuid=user_uuid,
                title=title or f"Chat with {character_name}",
                created_timestamp=int(time.time() * 1000),
                last_message_time=None,
                message_count=1 if initial_message else 0,
                chat_log_path=str(file_path)
            )
            
            # Create JSONL file atomically first to avoid orphan database records
            try:
                with self.file_manager.atomic_file_write(file_path) as f:
                    # Write metadata line
                    self.file_manager.write_chat_metadata_line(f, metadata, character_name)
                    
                    # Write initial message if provided
                    if initial_message:
                        init_msg = ChatMessage(
                            id=str(uuid.uuid4()),
                            role='assistant',
                            content=initial_message,
                            timestamp=int(time.time() * 1000),
                            status='complete'
                        )
                        self.file_manager.write_message_line(f, init_msg, character_name)
                        
                        # Update metadata for database
                        metadata.last_message_time = datetime.now()
                
                self.logger.debug(f"Successfully created chat file: {file_path}")
                
            except Exception as e:
                self.logger.log_error(f"Failed to create chat file: {e}")
                return ChatOperationResult.FILE_ERROR, None, str(e)
            
            # Create database record only after successful file creation
            try:
                db_session = self.db_manager.create_chat_session(self.db_session, metadata)
                self.logger.debug(f"Created DB session: {chat_session_uuid}")
                
                # Update message count if we wrote an initial message
                if initial_message and metadata.last_message_time:
                    self.db_manager.update_chat_session(
                        self.db_session, chat_session_uuid, 1, metadata.last_message_time
                    )
                
                return ChatOperationResult.SUCCESS, chat_session_uuid, None
                
            except Exception as e:
                # Rollback file creation on database error
                try:
                    if file_path.exists():
                        file_path.unlink()
                        self.logger.debug(f"Cleaned up chat file after DB error: {file_path}")
                except:
                    pass
                
                self.logger.log_error(f"Failed to create DB session: {e}")
                return ChatOperationResult.DB_ERROR, None, str(e)
        
        except Exception as e:
            self.logger.log_error(f"Unexpected error creating chat: {e}")
            self.logger.log_error(traceback.format_exc())
            return ChatOperationResult.RECOVERABLE_ERROR, None, str(e)
    
    def load_chat(self, chat_session_uuid: str) -> Tuple[ChatOperationResult, Optional[Dict], Optional[str]]:
        """
        Load a chat session.
        
        Returns:
            (result_code, chat_data, error_message)
        """
        try:
            self.logger.debug(f"Loading chat {chat_session_uuid}")
            
            # Get session from database first
            db_session = self.db_manager.get_chat_session(self.db_session, chat_session_uuid)
            if not db_session:
                self.logger.log_warning(f"Chat session not found in DB: {chat_session_uuid}")
                return ChatOperationResult.NOT_FOUND, None, "Chat session not found"
            
            # Check if file exists and is readable
            file_path = Path(db_session.chat_log_path)
            if not file_path.exists():
                self.logger.log_error(f"Chat file not found: {file_path}")
                return ChatOperationResult.FILE_ERROR, None, f"Chat file not found: {file_path}"
            
            # Validate and read file
            is_valid, error = self.file_manager.validate_jsonl_file(file_path)
            if not is_valid:
                self.logger.log_error(f"Invalid chat file: {error}")
                
                # Try to restore from backup
                backup_path = self.file_manager.find_latest_backup(file_path)
                if backup_path:
                    try:
                        shutil.copy2(backup_path, file_path)
                        self.logger.log_info(f"Restored chat from backup: {backup_path}")
                    except Exception as e:
                        self.logger.log_error(f"Failed to restore from backup: {e}")
                        return ChatOperationResult.CORRUPTION_ERROR, None, f"File corrupted and backup restore failed: {e}"
                else:
                    return ChatOperationResult.CORRUPTION_ERROR, None, f"File corrupted and no backup available: {error}"
            
            # Read file contents
            try:
                metadata, messages = self.file_manager.read_chat_file(file_path)
                
                chat_data = {
                    "success": True,
                    "chat_session_uuid": chat_session_uuid,
                    "metadata": metadata.to_dict(),
                    "messages": [msg.to_dict() for msg in messages],
                    "title": db_session.title,
                    "character_uuid": db_session.character_uuid,
                    "user_uuid": db_session.user_uuid
                }
                
                self.logger.debug(f"Successfully loaded chat with {len(messages)} messages")
                return ChatOperationResult.SUCCESS, chat_data, None
                
            except Exception as e:
                self.logger.log_error(f"Error reading chat file: {e}")
                return ChatOperationResult.FILE_ERROR, None, str(e)
        
        except Exception as e:
            self.logger.log_error(f"Unexpected error loading chat: {e}")
            self.logger.log_error(traceback.format_exc())
            return ChatOperationResult.RECOVERABLE_ERROR, None, str(e)
    
    def append_message(self, chat_session_uuid: str, message: ChatMessage, 
                      character_name: str) -> Tuple[ChatOperationResult, Optional[str]]:
        """
        Append a message to an existing chat.
        
        Returns:
            (result_code, error_message)
        """
        try:
            self.logger.debug(f"Appending message to chat {chat_session_uuid}")
            
            # Get session from database
            db_session = self.db_manager.get_chat_session(self.db_session, chat_session_uuid)
            if not db_session:
                return ChatOperationResult.NOT_FOUND, "Chat session not found"
            
            file_path = Path(db_session.chat_log_path)
            
            # Create backup before modifying
            backup_path = self.file_manager.create_backup(file_path)
            
            try:
                # Read existing file
                if file_path.exists():
                    is_valid, error = self.file_manager.validate_jsonl_file(file_path)
                    if not is_valid:
                        return ChatOperationResult.CORRUPTION_ERROR, f"Chat file corrupted: {error}"
                    
                    # Read all existing content
                    with open(file_path, 'r', encoding='utf-8') as f:
                        existing_lines = f.readlines()
                else:
                    existing_lines = []
                
                # Write to temporary file atomically
                with self.file_manager.atomic_file_write(file_path) as f:
                    # Write existing content
                    for line in existing_lines:
                        f.write(line)
                    
                    # Append new message
                    self.file_manager.write_message_line(f, message, character_name)
                
                # Update database
                new_count = db_session.message_count + 1
                last_time = datetime.fromtimestamp(message.timestamp / 1000)
                
                success = self.db_manager.update_chat_session(
                    self.db_session, chat_session_uuid, new_count, last_time
                )
                if not success:
                    # Restore backup on DB error
                    if backup_path:
                        shutil.copy2(backup_path, file_path)
                    return ChatOperationResult.DB_ERROR, "Failed to update database"
                
                self.logger.debug(f"Successfully appended message to chat {chat_session_uuid}")
                return ChatOperationResult.SUCCESS, None
                
            except Exception as e:
                # Restore backup on any error
                if backup_path and backup_path.exists():
                    try:
                        shutil.copy2(backup_path, file_path)
                        self.logger.log_info(f"Restored backup after append error")
                    except Exception as restore_error:
                        self.logger.log_error(f"Failed to restore backup: {restore_error}")
                
                self.logger.log_error(f"Error appending message: {e}")
                return ChatOperationResult.FILE_ERROR, str(e)
        
        except Exception as e:
            self.logger.log_error(f"Unexpected error appending message: {e}")
            self.logger.log_error(traceback.format_exc())
            return ChatOperationResult.RECOVERABLE_ERROR, str(e)
    
    def list_character_chats(self, character_uuid: str) -> Tuple[ChatOperationResult, Optional[List[Dict]], Optional[str]]:
        """
        List all chats for a character.
        
        Returns:
            (result_code, chat_list, error_message)
        """
        try:
            chat_list = self.db_manager.list_character_chats(self.db_session, character_uuid)
            return ChatOperationResult.SUCCESS, chat_list, None
            
        except Exception as e:
            self.logger.log_error(f"Error listing character chats: {e}")
            return ChatOperationResult.DB_ERROR, None, str(e)
    
    def delete_chat(self, chat_session_uuid: str) -> Tuple[ChatOperationResult, Optional[str]]:
        """
        Delete a chat session and its associated files.
        
        Returns:
            (result_code, error_message)
        """
        try:
            self.logger.log_info(f"Deleting chat {chat_session_uuid}")
            
            # Get session info
            db_session = self.db_manager.get_chat_session(self.db_session, chat_session_uuid)
            if not db_session:
                return ChatOperationResult.NOT_FOUND, "Chat session not found"
            
            file_path = Path(db_session.chat_log_path)
            
            # Create backup before deletion
            backup_path = None
            if file_path.exists():
                backup_path = self.file_manager.create_backup(file_path)
            
            try:
                # Delete file first
                if file_path.exists():
                    file_path.unlink()
                    self.logger.debug(f"Deleted chat file: {file_path}")
                
                # Delete database record
                deleted = self.db_manager.delete_chat_session(self.db_session, chat_session_uuid)
                if not deleted:
                    # Restore file if DB deletion failed
                    if backup_path and backup_path.exists():
                        shutil.copy2(backup_path, file_path)
                    return ChatOperationResult.DB_ERROR, "Failed to delete from database"
                
                return ChatOperationResult.SUCCESS, None
                
            except Exception as e:
                # Restore file on error
                if backup_path and backup_path.exists():
                    try:
                        shutil.copy2(backup_path, file_path)
                    except Exception:
                        pass
                
                self.logger.log_error(f"Error deleting chat: {e}")
                return ChatOperationResult.FILE_ERROR, str(e)
        
        except Exception as e:
            self.logger.log_error(f"Unexpected error deleting chat: {e}")
            return ChatOperationResult.RECOVERABLE_ERROR, str(e)
    
    def save_chat_session(self, chat_session_uuid: str, messages: List[ChatMessage], 
                         title: Optional[str] = None) -> Tuple[ChatOperationResult, Optional[ChatMetadata], Optional[str]]:
        """
        Save complete chat session with all messages.
        
        Returns:
            (result_code, updated_metadata, error_message)
        """
        try:
            self.logger.log_info(f"Saving reliable chat session: {chat_session_uuid}")
            
            # Get session from database to ensure it exists
            db_session = self.db_manager.get_chat_session(self.db_session, chat_session_uuid)
            if not db_session:
                return ChatOperationResult.NOT_FOUND, None, "Chat session not found"
            
            # Get character name for proper message formatting
            character_name = self.db_manager.get_character_name(
                self.db_session, db_session.character_uuid
            )
            
            file_path = Path(db_session.chat_log_path)
            
            # Create backup before saving
            backup_path = None
            if file_path.exists():
                backup_path = self.file_manager.create_backup(file_path)
            
            try:
                # Create new metadata
                updated_metadata = ChatMetadata(
                    chat_session_uuid=chat_session_uuid,
                    character_uuid=db_session.character_uuid,
                    user_uuid=db_session.user_uuid,
                    title=title or db_session.title,
                    created_timestamp=int(db_session.start_time.timestamp() * 1000) if db_session.start_time else int(time.time() * 1000),
                    last_message_time=datetime.now() if messages else None,
                    message_count=len(messages),
                    chat_log_path=str(file_path)
                )
                
                # Write complete chat file atomically
                with self.file_manager.atomic_file_write(file_path) as f:
                    # Write metadata line
                    self.file_manager.write_chat_metadata_line(f, updated_metadata, character_name)
                    
                    # Write all messages
                    for message in messages:
                        self.file_manager.write_message_line(f, message, character_name)
                
                self.logger.debug(f"Successfully saved chat file: {file_path}")
                
                # Update database
                self.db_manager.update_chat_session(
                    self.db_session, chat_session_uuid, 
                    len(messages), updated_metadata.last_message_time
                )
                
                # Update title if provided
                if title and title != db_session.title:
                    self.db_manager.update_chat_title(self.db_session, chat_session_uuid, title)
                
                return ChatOperationResult.SUCCESS, updated_metadata, None
                
            except Exception as e:
                # Restore backup on error
                if backup_path and backup_path.exists():
                    try:
                        shutil.copy2(backup_path, file_path)
                        self.logger.debug(f"Restored backup after save error: {file_path}")
                    except Exception:
                        pass
                
                self.logger.log_error(f"Error saving chat session: {e}")
                return ChatOperationResult.FILE_ERROR, None, str(e)
        
        except Exception as e:
            self.logger.log_error(f"Unexpected error saving chat session: {e}")
            self.logger.log_error(traceback.format_exc())
            return ChatOperationResult.RECOVERABLE_ERROR, None, str(e)

    # === EXISTING METHODS CONTINUE ===
