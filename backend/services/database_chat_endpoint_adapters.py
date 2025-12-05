"""Database Chat Endpoint Adapters - Clean database-only implementation.

This module provides endpoint-compatible methods for the database-only
reliable chat system, eliminating file dependencies.
"""

from typing import List, Optional
from backend.log_manager import LogManager
from .reliable_chat_manager_db import DatabaseReliableChatManager
from .chat_models import (
    ChatMetadata, ChatMessage, ChatOperationResult,
    ChatCreateResult, ChatLoadResult, ChatSaveResult, 
    ChatListResult, ChatDeleteResult
)


class DatabaseChatEndpointAdapters:
    """
    Endpoint adapters for the database-only reliable chat manager.
    
    Provides endpoint-compatible methods that wrap the DatabaseReliableChatManager
    and return standardized result objects.
    """
    
    def __init__(self, chat_manager: DatabaseReliableChatManager):
        self.chat_manager = chat_manager
        self.logger = chat_manager.logger
    
    def create_new_chat_endpoint(self, character_uuid: str, character_name: str, 
                                user_uuid: Optional[str] = None, title: Optional[str] = None, 
                                initial_message: Optional[str] = None) -> ChatCreateResult:
        """
        Create a new chat session endpoint adapter.
        
        Returns:
            ChatCreateResult with success status and chat_session_uuid
        """
        result_code, chat_session_uuid, error_message = self.chat_manager.create_new_chat(
            character_uuid, character_name, user_uuid, title, initial_message
        )
        
        if result_code == ChatOperationResult.SUCCESS:
            return ChatCreateResult(
                success=True,
                chat_session_uuid=chat_session_uuid,
                message="Chat created successfully"
            )
        else:
            return ChatCreateResult(
                success=False,
                chat_session_uuid=None,
                message=error_message or "Failed to create chat"
            )
    
    def load_chat_endpoint(self, chat_session_uuid: str) -> ChatLoadResult:
        """
        Load a chat session endpoint adapter.
        
        Returns:
            ChatLoadResult with chat data
        """
        result_code, chat_data, error_message = self.chat_manager.load_chat(chat_session_uuid)
        
        if result_code == ChatOperationResult.SUCCESS:
            # Convert chat_data to proper format if needed
            if chat_data and 'metadata' in chat_data:
                metadata = ChatMetadata(
                    chat_session_uuid=chat_data['metadata']['chat_session_uuid'],
                    character_uuid=chat_data['metadata']['character_uuid'],
                    user_uuid=chat_data['metadata'].get('user_uuid'),
                    title=chat_data['metadata']['title'],
                    created_timestamp=chat_data['metadata']['created_timestamp'],
                    last_message_time=chat_data['metadata'].get('last_message_time'),
                    message_count=chat_data['metadata']['message_count'],
                    chat_log_path=chat_data['metadata'].get('chat_log_path', '')
                )
            else:
                metadata = None
                
            return ChatLoadResult(
                result=ChatOperationResult.SUCCESS,
                chat_metadata=metadata,
                messages=chat_data.get('messages') if chat_data else None,
                error_message=None
            )
        else:
            return ChatLoadResult(
                result=result_code,
                chat_metadata=None,
                messages=None,
                error_message=error_message or "Failed to load chat"
            )
    
    def append_message_endpoint(self, chat_session_uuid: str, message: ChatMessage) -> ChatSaveResult:
        """
        Append a message to a chat session endpoint adapter.
        
        Returns:
            ChatSaveResult with success status
        """
        result_code, error_message = self.chat_manager.append_message(
            chat_session_uuid, message, ""  # character_name not needed for database storage
        )
        
        if result_code == ChatOperationResult.SUCCESS:
            return ChatSaveResult(
                result=ChatOperationResult.SUCCESS,
                chat_metadata=None,  # append_message doesn't return metadata
                error_message=None
            )
        else:
            return ChatSaveResult(
                result=result_code,
                chat_metadata=None,
                error_message=error_message or "Failed to append message"
            )
    
    def list_character_chats_endpoint(self, character_uuid: str) -> ChatListResult:
        """
        List all chats for a character endpoint adapter.
        
        Returns:
            ChatListResult with chat list
        """
        result_code, chat_list, error_message = self.chat_manager.list_character_chats(character_uuid)
        
        if result_code == ChatOperationResult.SUCCESS:
            return ChatListResult(
                result=ChatOperationResult.SUCCESS,
                chat_sessions=chat_list or [],
                error_message=None
            )
        else:
            return ChatListResult(
                result=result_code,
                chat_sessions=[],
                error_message=error_message or "Failed to list chats"
            )
    
    def delete_chat_endpoint(self, chat_session_uuid: str) -> ChatDeleteResult:
        """
        Delete a chat session endpoint adapter.
        
        Returns:
            ChatDeleteResult with success status
        """
        result_code, error_message = self.chat_manager.delete_chat(chat_session_uuid)
        
        if result_code == ChatOperationResult.SUCCESS:
            return ChatDeleteResult(
                result=ChatOperationResult.SUCCESS,
                error_message=None
            )
        else:
            return ChatDeleteResult(
                result=result_code,
                error_message=error_message or "Failed to delete chat"
            )
    
    def create_chat_session(self, character_uuid: str, user_uuid: Optional[str] = None, 
                           title: Optional[str] = None) -> ChatCreateResult:
        """
        Create a new chat session - endpoint compatibility wrapper.
        
        Returns:
            ChatCreateResult with result code, metadata, and error message
        """
        try:
            # Get character name for proper chat creation
            from backend import sql_models
            character = self.chat_manager.db_session.query(sql_models.Character).filter(
                sql_models.Character.character_uuid == character_uuid
            ).first()
            character_name = character.name if character else "Unknown Character"
            
            result_code, chat_session_uuid, error_message = self.chat_manager.create_new_chat(
                character_uuid, character_name, user_uuid, title
            )
            
            if result_code == ChatOperationResult.SUCCESS and chat_session_uuid:
                # Load the created chat to get metadata
                load_result_code, chat_data, load_error = self.chat_manager.load_chat(chat_session_uuid)
                
                if load_result_code == ChatOperationResult.SUCCESS and chat_data:
                    # Create metadata from the chat data
                    from datetime import datetime
                    metadata = ChatMetadata(
                        chat_session_uuid=chat_session_uuid,
                        character_uuid=character_uuid,
                        user_uuid=user_uuid,
                        title=title or 'New Chat',
                        created_timestamp=int(datetime.now().timestamp()),
                        last_message_time=datetime.now(),
                        message_count=0,
                        chat_log_path=""
                    )
                    
                    return ChatCreateResult(
                        result=ChatOperationResult.SUCCESS,
                        chat_metadata=metadata,
                        error_message=None
                    )
            
            return ChatCreateResult(
                result=result_code,
                chat_metadata=None,
                error_message=error_message
            )
            
        except Exception as e:
            self.logger.log_error(f"Error in create_chat_session: {e}")
            return ChatCreateResult(
                result=ChatOperationResult.RECOVERABLE_ERROR,
                chat_metadata=None,
                error_message=str(e)
            )
    
    def save_chat_session(self, chat_session_uuid: str, messages: List[ChatMessage],
                         title: Optional[str] = None) -> ChatSaveResult:
        """
        Save complete chat session endpoint adapter.
        
        Returns:
            ChatSaveResult with success status
        """
        result_code, updated_metadata, error_message = self.chat_manager.save_chat_session(
            chat_session_uuid, messages, title
        )
        
        if result_code == ChatOperationResult.SUCCESS:
            return ChatSaveResult(
                result=ChatOperationResult.SUCCESS,
                chat_metadata=updated_metadata,
                error_message=None
            )
        else:
            return ChatSaveResult(
                result=result_code,
                chat_metadata=None,
                error_message=error_message or "Failed to save chat session"
            )
    
    def load_latest_chat_session(self, character_uuid: str) -> ChatLoadResult:
        """
        Load the latest chat session for a character.
        
        Returns:
            ChatLoadResult with chat data or error information
        """
        try:
            result_code, chat_data, error_message = self.chat_manager.load_latest_chat_session(character_uuid)
            
            if result_code == ChatOperationResult.SUCCESS and chat_data:
                # Convert metadata dict to ChatMetadata object
                metadata = ChatMetadata(
                    chat_session_uuid=chat_data['metadata']['chat_session_uuid'],
                    character_uuid=chat_data['metadata']['character_uuid'],
                    user_uuid=chat_data['metadata'].get('user_uuid'),
                    title=chat_data['metadata']['title'],
                    created_timestamp=chat_data['metadata']['created_timestamp'],
                    last_message_time=chat_data['metadata'].get('last_message_time'),
                    message_count=chat_data['metadata']['message_count'],
                    chat_log_path=chat_data['metadata'].get('chat_log_path', '')
                )
                
                return ChatLoadResult(
                    result=ChatOperationResult.SUCCESS,
                    chat_metadata=metadata,
                    messages=chat_data['messages'],
                    error_message=None
                )
            
            return ChatLoadResult(
                result=result_code,
                chat_metadata=None,
                messages=None,
                error_message=error_message
            )
            
        except Exception as e:
            self.logger.log_error(f"Error in load_latest_chat_session: {e}")
            return ChatLoadResult(
                result=ChatOperationResult.RECOVERABLE_ERROR,
                chat_metadata=None,
                messages=None,
                error_message=str(e)
            )
    
    def list_chat_sessions(self, character_uuid: str) -> ChatListResult:
        """
        List all chat sessions for a character - endpoint compatibility wrapper.
        
        Returns:
            ChatListResult with result code, chat sessions list, and error message
        """
        try:
            result_code, chat_list, error_message = self.chat_manager.list_character_chats(character_uuid)
            
            if result_code == ChatOperationResult.SUCCESS:
                # Convert to ChatMetadata objects (handle empty list case)
                metadata_list = []
                if chat_list:  # Only process if chat_list is not None and not empty
                    for chat_data in chat_list:
                        metadata = ChatMetadata(
                            chat_session_uuid=chat_data['id'],  # Fixed: use 'id' not 'chat_session_uuid'
                            character_uuid=character_uuid,
                            user_uuid=None,  # Not available in list view
                            title=chat_data['title'],
                            created_timestamp=chat_data.get('created_timestamp', 0),
                            last_message_time=chat_data.get('last_message_time'),
                            message_count=chat_data['message_count'],
                            chat_log_path=""  # Not available in list view
                        )
                        metadata_list.append(metadata)
                
                return ChatListResult(
                    result=ChatOperationResult.SUCCESS,
                    chat_sessions=metadata_list,
                    error_message=None
                )
            
            return ChatListResult(
                result=result_code,
                chat_sessions=[],  # Return empty list instead of None
                error_message=error_message
            )
            
        except Exception as e:
            self.logger.log_error(f"Error in list_chat_sessions: {e}")
            return ChatListResult(
                result=ChatOperationResult.RECOVERABLE_ERROR,
                chat_sessions=None,
                error_message=str(e)
            )