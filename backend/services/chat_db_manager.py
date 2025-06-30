"""
Database operations manager for the reliable chat system.

This module handles all database-related operations including session
management, retries, and database consistency operations.
"""

import time
from datetime import datetime
from typing import List, Dict, Optional, Any

from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from backend import sql_models, schemas as pydantic_models
from backend.services import chat_service
from backend.log_manager import LogManager
from .chat_models import ChatMetadata, ChatOperationResult


class ChatDatabaseManager:
    """Handles all database operations for chat persistence"""
    
    def __init__(self, logger: LogManager, max_retries: int = 3, retry_delay: float = 0.5):
        self.logger = logger
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        
        self.logger.debug("ChatDatabaseManager initialized")
    
    def retry_db_operation(self, operation, *args, **kwargs):
        """Retry database operations with exponential backoff"""
        last_error = None
        
        for attempt in range(self.max_retries):
            try:
                return operation(*args, **kwargs)
            except SQLAlchemyError as e:
                last_error = e
                self.logger.log_warning(f"DB operation failed (attempt {attempt + 1}/{self.max_retries}): {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (2 ** attempt))
        
        raise last_error
    
    def get_chat_session(self, db: Session, chat_session_uuid: str) -> Optional[sql_models.ChatSession]:
        """Get chat session from database with retries"""
        def operation():
            return chat_service.get_chat_session(db, chat_session_uuid)
        
        return self.retry_db_operation(operation)
    
    def create_chat_session(self, db: Session, metadata: ChatMetadata) -> sql_models.ChatSession:
        """Create chat session in database with retries"""
        def operation():
            # Create the session record
            session = sql_models.ChatSession(
                chat_session_uuid=metadata.chat_session_uuid,
                character_uuid=metadata.character_uuid,
                user_uuid=metadata.user_uuid,
                title=metadata.title,
                # chat_log_path removed as per database schema update
                start_time=datetime.fromtimestamp(metadata.created_timestamp / 1000),
                message_count=metadata.message_count,
                last_message_time=metadata.last_message_time
            )
            
            db.add(session)
            db.commit()
            db.refresh(session)
            return session
        
        return self.retry_db_operation(operation)
    
    def update_chat_session(self, db: Session, chat_session_uuid: str, 
                           message_count: int, last_message_time: datetime) -> bool:
        """Update chat session metadata in database"""
        def operation():
            session = chat_service.get_chat_session(db, chat_session_uuid)
            if not session:
                return False
            
            session.message_count = message_count
            session.last_message_time = last_message_time
            db.commit()
            return True
        
        return self.retry_db_operation(operation)
    
    def update_chat_title(self, db: Session, chat_session_uuid: str, title: str) -> bool:
        """Update the title of a chat session"""
        def operation():
            session = db.query(sql_models.ChatSession).filter(
                sql_models.ChatSession.chat_session_uuid == chat_session_uuid
            ).first()
            if session:
                session.title = title
                db.commit()
                return True
            return False
        
        return self.retry_db_operation(operation)
    
    def list_character_chats(self, db: Session, character_uuid: str) -> List[Dict[str, Any]]:
        """List all chats for a character from the database"""
        try:
            # Query database for all sessions for this character
            sessions = chat_service.get_chat_sessions(
                db, character_uuid=character_uuid, skip=0, limit=1000
            )
            
            chat_list = []
            for session in sessions:
                chat_data = {
                    "chat_session_uuid": session.chat_session_uuid,
                    "title": session.title,
                    "start_time": session.start_time.isoformat() if session.start_time else None,
                    "last_message_time": session.last_message_time.isoformat() if session.last_message_time else None,
                    "message_count": session.message_count,
                    "file_exists": True  # We'll check this in the file manager
                }
                chat_list.append(chat_data)
            
            # Sort by last message time, most recent first
            chat_list.sort(key=lambda x: x["last_message_time"] or x["start_time"] or "", reverse=True)
            
            return chat_list
            
        except Exception as e:
            self.logger.log_error(f"Error listing character chats: {e}")
            raise
    
    def delete_chat_session(self, db: Session, chat_session_uuid: str) -> bool:
        """Delete a chat session from the database"""
        try:
            deleted_session = chat_service.delete_chat_session(db, chat_session_uuid)
            return bool(deleted_session)
        except Exception as e:
            self.logger.log_error(f"Error deleting chat session from database: {e}")
            raise
    
    def get_character_name(self, db: Session, character_uuid: str) -> str:
        """Get character name from database"""
        try:
            character = db.query(sql_models.Character).filter(
                sql_models.Character.character_uuid == character_uuid
            ).first()
            return character.name if character else "Unknown Character"
        except Exception as e:
            self.logger.log_warning(f"Could not get character name: {e}")
            return "Unknown Character"
