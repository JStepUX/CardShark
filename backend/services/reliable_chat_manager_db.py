"""Database-only Reliable Chat Manager - Clean implementation without file dependencies.

This module provides a database-centric chat management system that eliminates
file-based storage and uses only the database for chat persistence.
"""

import time
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session

from backend.log_manager import LogManager
from backend.services import chat_service
from backend import sql_models
from .chat_models import (
    ChatMetadata, ChatMessage, ChatOperationResult,
    ChatCreateResult, ChatLoadResult, ChatSaveResult, 
    ChatListResult, ChatDeleteResult
)


class DatabaseReliableChatManager:
    """
    Database-only reliable chat manager.
    
    This implementation eliminates all file-based operations and uses
    only the database for chat persistence.
    """
    
    def __init__(self, db_session: Session, logger: LogManager):
        self.db_session = db_session
        self.logger = logger
        
        self.logger.log_info("DatabaseReliableChatManager initialized")
    
    # === CORE CHAT OPERATIONS ===
    
    def create_new_chat(self, character_uuid: str, character_name: str, 
                       user_uuid: Optional[str] = None, title: Optional[str] = None, 
                       initial_message: Optional[str] = None) -> Tuple[ChatOperationResult, Optional[str], Optional[str]]:
        """
        Create a new chat session in the database.
        
        Returns:
            (result_code, chat_session_uuid, error_message)
        """
        chat_session_uuid = str(uuid.uuid4())
        
        try:
            self.logger.log_info(f"Creating new chat for character {character_uuid}")
            
            # Create chat session in database
            session = sql_models.ChatSession(
                chat_session_uuid=chat_session_uuid,
                character_uuid=character_uuid,
                user_uuid=user_uuid,
                title=title or f"Chat with {character_name}",
                start_time=datetime.now(),
                message_count=1 if initial_message else 0,
                last_message_time=datetime.now() if initial_message else None
            )
            
            self.db_session.add(session)
            self.db_session.flush()  # Get the ID without committing
            
            # Add initial message if provided
            if initial_message:
                message_id = str(uuid.uuid4())
                db_message = sql_models.ChatMessage(
                    message_id=message_id,
                    chat_session_uuid=chat_session_uuid,
                    role='assistant',
                    content=initial_message,
                    timestamp=datetime.now(),
                    status='complete'
                )
                self.db_session.add(db_message)
            
            self.db_session.commit()
            
            self.logger.debug(f"Successfully created chat session: {chat_session_uuid}")
            return ChatOperationResult.SUCCESS, chat_session_uuid, None
            
        except Exception as e:
            self.db_session.rollback()
            self.logger.log_error(f"Failed to create chat session: {e}")
            return ChatOperationResult.DB_ERROR, None, str(e)
    
    def load_chat(self, chat_session_uuid: str) -> Tuple[ChatOperationResult, Optional[Dict], Optional[str]]:
        """
        Load a chat session from the database.
        
        Returns:
            (result_code, chat_data, error_message)
        """
        try:
            self.logger.debug(f"Loading chat {chat_session_uuid}")
            
            # Get session from database
            db_session = chat_service.get_chat_session(self.db_session, chat_session_uuid)
            if not db_session:
                self.logger.log_warning(f"Chat session not found: {chat_session_uuid}")
                return ChatOperationResult.NOT_FOUND, None, "Chat session not found"
            
            # Get messages from database
            db_messages = chat_service.get_chat_messages(self.db_session, chat_session_uuid)
            
            # Format messages for frontend
            messages = []
            for db_msg in db_messages:
                message = {
                    "id": db_msg.message_id,
                    "role": db_msg.role,
                    "content": db_msg.content,
                    "timestamp": db_msg.created_at.timestamp() * 1000 if db_msg.created_at else None,
                    "status": db_msg.status,
                    "variations": db_msg.metadata_json.get('variations', []) if db_msg.metadata_json else [],
                    "current_variation": db_msg.metadata_json.get('current_variation', 0) if db_msg.metadata_json else 0,
                    "metadata": db_msg.metadata_json or {}
                }
                messages.append(message)
            
            # Format response to match frontend expectations
            chat_data = {
                "success": True,
                "chat_id": chat_session_uuid,
                "title": db_session.title,
                "messages": messages,
                "metadata": {
                    'chat_session_uuid': chat_session_uuid,
                    'character_uuid': db_session.character_uuid,
                    'user_uuid': db_session.user_uuid,
                    'title': db_session.title,
                    'created_timestamp': int(db_session.start_time.timestamp() * 1000) if db_session.start_time else int(time.time() * 1000),
                    'last_message_time': db_session.last_message_time.isoformat() if db_session.last_message_time else None,
                    'message_count': db_session.message_count,
                    'chat_log_path': ''  # No longer used in database-only system
                }
            }
            
            self.logger.debug(f"Successfully loaded chat with {len(messages)} messages")
            return ChatOperationResult.SUCCESS, chat_data, None
            
        except Exception as e:
            self.logger.log_error(f"Error loading chat: {e}")
            return ChatOperationResult.DB_ERROR, None, str(e)
    
    def append_message(self, chat_session_uuid: str, message: ChatMessage, 
                      character_name: str) -> Tuple[ChatOperationResult, Optional[str]]:
        """
        Append a message to an existing chat in the database.
        
        Returns:
            (result_code, error_message)
        """
        try:
            self.logger.debug(f"Appending message to chat {chat_session_uuid}")
            
            # Get session from database
            db_session = chat_service.get_chat_session(self.db_session, chat_session_uuid)
            if not db_session:
                return ChatOperationResult.NOT_FOUND, "Chat session not found"
            
            # Create message using chat service with correct parameters
            # Note: create_chat_message automatically updates session metadata
            chat_service.create_chat_message(
                self.db_session,
                chat_session_uuid=chat_session_uuid,
                role=message.role,
                content=message.content,
                status=message.status,
                reasoning_content=getattr(message, 'reasoning_content', None),
                metadata_json=getattr(message, 'metadata', {})
            )
            
            self.logger.debug(f"Successfully appended message to chat {chat_session_uuid}")
            return ChatOperationResult.SUCCESS, None
            
        except Exception as e:
            self.logger.log_error(f"Error appending message: {e}")
            return ChatOperationResult.DB_ERROR, str(e)
    
    def list_character_chats(self, character_uuid: str) -> Tuple[ChatOperationResult, Optional[List[Dict]], Optional[str]]:
        """
        List all chat sessions for a character from the database.
        
        Returns:
            (result_code, chat_list, error_message)
        """
        try:
            self.logger.debug(f"Listing chats for character: {character_uuid}")
            
            # Get all chat sessions for this character
            chat_sessions = chat_service.get_chat_sessions_by_character(self.db_session, character_uuid)
            
            # Convert to frontend format
            chat_list = []
            for session in chat_sessions:
                chat_info = {
                    "id": session.chat_session_uuid,
                    "title": session.title or f"Chat {session.chat_session_uuid[:8]}",
                    "last_message_time": session.last_message_time.isoformat() if session.last_message_time else session.start_time.isoformat(),
                    "message_count": session.message_count,
                    "start_time": session.start_time.isoformat()
                }
                chat_list.append(chat_info)
            
            # Sort by last message time (most recent first)
            chat_list.sort(key=lambda x: x["last_message_time"], reverse=True)
            
            self.logger.debug(f"Found {len(chat_list)} chats for character")
            return ChatOperationResult.SUCCESS, chat_list, None
            
        except Exception as e:
            self.logger.log_error(f"Error listing character chats: {e}")
            return ChatOperationResult.DB_ERROR, None, str(e)
    
    def delete_chat(self, chat_session_uuid: str) -> Tuple[ChatOperationResult, Optional[str]]:
        """
        Delete a chat session and its messages from the database.
        
        Returns:
            (result_code, error_message)
        """
        try:
            self.logger.log_info(f"Deleting chat {chat_session_uuid}")
            
            # Delete session (messages will be cascade deleted)
            deleted_session = chat_service.delete_chat_session(self.db_session, chat_session_uuid)
            if not deleted_session:
                return ChatOperationResult.NOT_FOUND, "Chat session not found"
            
            return ChatOperationResult.SUCCESS, None
            
        except Exception as e:
            self.logger.log_error(f"Error deleting chat: {e}")
            return ChatOperationResult.DB_ERROR, str(e)
    
    def load_latest_chat_session(self, character_uuid: str) -> Tuple[ChatOperationResult, Optional[Dict], Optional[str]]:
        """
        Load the latest chat session for a character.
        
        Returns:
            (result_code, chat_data, error_message)
        """
        try:
            self.logger.log_info(f"Loading latest reliable chat for character: {character_uuid}")
            
            # Get all chat sessions for this character
            list_result_code, chat_list, list_error = self.list_character_chats(character_uuid)
            
            if list_result_code != ChatOperationResult.SUCCESS:
                return list_result_code, None, list_error
            
            if not chat_list or len(chat_list) == 0:
                return ChatOperationResult.NOT_FOUND, None, "No chat sessions found for this character"
            
            # Get the most recent chat (first in the sorted list)
            latest_chat = chat_list[0]
            chat_session_uuid = latest_chat['id']
            
            # Load the full chat data
            load_result_code, chat_data, load_error = self.load_chat(chat_session_uuid)
            
            if load_result_code == ChatOperationResult.SUCCESS and chat_data:
                # Add metadata to match expected format
                chat_data['metadata'] = {
                    'chat_session_uuid': chat_session_uuid,
                    'character_uuid': character_uuid,
                    'user_uuid': None,  # Will be filled from session data if available
                    'title': chat_data['title'],
                    'created_timestamp': int(time.time() * 1000),  # Current timestamp as fallback
                    'last_message_time': latest_chat['last_message_time'],
                    'message_count': latest_chat['message_count'],
                    'chat_log_path': ''  # No longer used
                }
                
                return ChatOperationResult.SUCCESS, chat_data, None
            
            return load_result_code, None, load_error
            
        except Exception as e:
            self.logger.log_error(f"Error loading latest chat session: {e}")
            return ChatOperationResult.DB_ERROR, None, str(e)
    
    def save_chat_session(self, chat_session_uuid: str, messages: List[ChatMessage], 
                         title: Optional[str] = None) -> Tuple[ChatOperationResult, Optional[ChatMetadata], Optional[str]]:
        """
        Save complete chat session with all messages to the database.
        
        Returns:
            (result_code, updated_metadata, error_message)
        """
        try:
            self.logger.log_info(f"Saving chat session: {chat_session_uuid}")
            
            # Get session from database
            db_session = chat_service.get_chat_session(self.db_session, chat_session_uuid)
            if not db_session:
                return ChatOperationResult.NOT_FOUND, None, "Chat session not found"
            
            # Delete existing messages
            self.db_session.query(sql_models.ChatMessage).filter(
                sql_models.ChatMessage.chat_session_uuid == chat_session_uuid
            ).delete()
            
            # Add all new messages
            for message in messages:
                db_message = sql_models.ChatMessage(
                    message_id=message.id,
                    chat_session_uuid=chat_session_uuid,
                    role=message.role,
                    content=message.content,
                    timestamp=datetime.fromtimestamp(message.timestamp / 1000),
                    status=message.status,
                    reasoning_content=message.reasoning_content
                )
                self.db_session.add(db_message)
            
            # Update session metadata
            db_session.message_count = len(messages)
            db_session.last_message_time = datetime.now() if messages else None
            if title:
                db_session.title = title
            
            self.db_session.commit()
            
            # Create updated metadata
            updated_metadata = ChatMetadata(
                chat_session_uuid=chat_session_uuid,
                character_uuid=db_session.character_uuid,
                user_uuid=db_session.user_uuid,
                title=db_session.title,
                created_timestamp=int(db_session.start_time.timestamp() * 1000),
                last_message_time=db_session.last_message_time,
                message_count=len(messages),
                chat_log_path=""  # No longer used
            )
            
            return ChatOperationResult.SUCCESS, updated_metadata, None
            
        except Exception as e:
            self.db_session.rollback()
            self.logger.log_error(f"Error saving chat session: {e}")
            return ChatOperationResult.DB_ERROR, None, str(e)