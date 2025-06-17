"""
Endpoint adapters for the reliable chat system.

This module provides compatibility wrappers that convert between the
core chat operations and the endpoint-specific result formats.
"""

import time
from datetime import datetime
from typing import Optional, List

from .chat_models import (
    ChatMetadata, ChatMessage, ChatOperationResult,
    ChatCreateResult, ChatLoadResult, ChatSaveResult, 
    ChatListResult, ChatDeleteResult
)
from .reliable_chat_manager_v2 import ReliableChatManager


class ChatEndpointAdapters:
    """Provides endpoint-compatible methods for the reliable chat system"""
    
    def __init__(self, chat_manager: ReliableChatManager):
        self.chat_manager = chat_manager
        self.logger = chat_manager.logger
    
    def create_chat_session(self, character_uuid: str, user_uuid: Optional[str] = None, 
                           title: Optional[str] = None) -> ChatCreateResult:
        """
        Create a new chat session - endpoint compatibility wrapper.
        
        Returns:
            ChatCreateResult with result code, metadata, and error message
        """
        try:
            # Get character name for proper file creation
            character_name = self.chat_manager.db_manager.get_character_name(
                self.chat_manager.db_session, character_uuid
            )
            
            result_code, chat_session_uuid, error_message = self.chat_manager.create_new_chat(
                character_uuid, character_name, user_uuid, title
            )
            
            if result_code == ChatOperationResult.SUCCESS and chat_session_uuid:
                # Load the created chat to get metadata
                load_result_code, chat_data, load_error = self.chat_manager.load_chat(chat_session_uuid)
                
                if load_result_code == ChatOperationResult.SUCCESS and chat_data:
                    metadata = self._dict_to_metadata(chat_data['metadata'])
                    
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
    
    def load_latest_chat_session(self, character_uuid: str) -> ChatLoadResult:
        """
        Load the latest chat session for a character - endpoint compatibility wrapper.
        
        Returns:
            ChatLoadResult with result code, metadata, messages, and error message
        """
        try:
            # Get all chat sessions for this character
            list_result_code, chat_list, list_error = self.chat_manager.list_character_chats(character_uuid)
            
            if list_result_code != ChatOperationResult.SUCCESS:
                return ChatLoadResult(
                    result=list_result_code,
                    chat_metadata=None,
                    messages=None,
                    error_message=list_error
                )
            
            if not chat_list or len(chat_list) == 0:
                return ChatLoadResult(
                    result=ChatOperationResult.NOT_FOUND,
                    chat_metadata=None,
                    messages=None,
                    error_message="No chat sessions found for this character"
                )
            
            # Get the most recent chat (first in the sorted list)
            latest_chat = chat_list[0]
            chat_session_uuid = latest_chat['chat_session_uuid']
            
            # Load the full chat data
            load_result_code, chat_data, load_error = self.chat_manager.load_chat(chat_session_uuid)
            
            if load_result_code == ChatOperationResult.SUCCESS and chat_data:
                metadata = self._dict_to_metadata(chat_data['metadata'])
                
                return ChatLoadResult(
                    result=ChatOperationResult.SUCCESS,
                    chat_metadata=metadata,
                    messages=chat_data['messages'],
                    error_message=None
                )
            
            return ChatLoadResult(
                result=load_result_code,
                chat_metadata=None,
                messages=None,
                error_message=load_error
            )
            
        except Exception as e:
            self.logger.log_error(f"Error in load_latest_chat_session: {e}")
            return ChatLoadResult(
                result=ChatOperationResult.RECOVERABLE_ERROR,
                chat_metadata=None,
                messages=None,
                error_message=str(e)
            )
    
    def append_message_endpoint(self, chat_session_uuid: str, message: ChatMessage) -> ChatSaveResult:
        """
        Append a message to a chat session - endpoint compatibility wrapper.
        
        Returns:
            ChatSaveResult with result code, updated metadata, and error message
        """
        try:
            # Get character name for proper message formatting
            character_name = "Unknown Character"
            try:
                # Get chat metadata to find character
                db_session = self.chat_manager.db_manager.get_chat_session(
                    self.chat_manager.db_session, chat_session_uuid
                )
                if db_session:
                    character_name = self.chat_manager.db_manager.get_character_name(
                        self.chat_manager.db_session, db_session.character_uuid
                    )
            except Exception:
                pass
            
            # Use the existing append_message method
            result_code, error_message = self.chat_manager.append_message(
                chat_session_uuid, message, character_name
            )
            
            if result_code == ChatOperationResult.SUCCESS:
                # Load updated chat metadata
                load_result_code, chat_data, load_error = self.chat_manager.load_chat(chat_session_uuid)
                
                if load_result_code == ChatOperationResult.SUCCESS and chat_data:
                    metadata = self._dict_to_metadata(chat_data['metadata'])                    
                    return ChatSaveResult(
                        result=ChatOperationResult.SUCCESS,
                        chat_metadata=metadata,
                        error_message=None
                    )
            
            return ChatSaveResult(
                result=result_code,
                chat_metadata=None,
                error_message=error_message
            )
            
        except Exception as e:
            self.logger.log_error(f"Error in append_message_endpoint: {e}")
            return ChatSaveResult(                result=ChatOperationResult.RECOVERABLE_ERROR,
                chat_metadata=None,
                error_message=str(e)
            )
    
    def save_chat_session(self, chat_session_uuid: str, messages: List[ChatMessage], 
                         title: Optional[str] = None) -> ChatSaveResult:
        """
        Save complete chat session - endpoint compatibility wrapper.
        
        Returns:
            ChatSaveResult with result code, updated metadata, and error message
        """
        try:
            # Delegate to the ReliableChatManager's save_chat_session method
            result_code, updated_metadata, error_message = self.chat_manager.save_chat_session(
                chat_session_uuid, messages, title
            )
            
            return ChatSaveResult(
                result=result_code,
                chat_metadata=updated_metadata,
                error_message=error_message
            )
            
        except Exception as e:
            self.logger.log_error(f"Error in save_chat_session: {e}")
            return ChatSaveResult(
                result=ChatOperationResult.RECOVERABLE_ERROR,
                chat_metadata=None,
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
            
            if result_code == ChatOperationResult.SUCCESS and chat_list:
                # Convert to ChatMetadata objects
                metadata_list = []
                for chat_data in chat_list:
                    metadata = ChatMetadata(
                        chat_session_uuid=chat_data['chat_session_uuid'],
                        character_uuid=character_uuid,
                        user_uuid=None,  # Not available in list view
                        title=chat_data['title'],
                        created_timestamp=int(datetime.fromisoformat(chat_data['start_time']).timestamp() * 1000) if chat_data['start_time'] else int(time.time() * 1000),
                        last_message_time=datetime.fromisoformat(chat_data['last_message_time']) if chat_data['last_message_time'] else None,
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
                chat_sessions=None,
                error_message=error_message
            )
            
        except Exception as e:
            self.logger.log_error(f"Error in list_chat_sessions: {e}")
            return ChatListResult(
                result=ChatOperationResult.RECOVERABLE_ERROR,
                chat_sessions=None,
                error_message=str(e)
            )
    
    def delete_chat_session(self, chat_session_uuid: str) -> ChatDeleteResult:
        """
        Delete a chat session - endpoint compatibility wrapper.
        
        Returns:
            ChatDeleteResult with result code and error message
        """
        try:
            result_code, error_message = self.chat_manager.delete_chat(chat_session_uuid)
            
            return ChatDeleteResult(
                result=result_code,
                error_message=error_message
            )
            
        except Exception as e:
            self.logger.log_error(f"Error in delete_chat_session: {e}")
            return ChatDeleteResult(
                result=ChatOperationResult.RECOVERABLE_ERROR,
                error_message=str(e)
            )
    
    def _dict_to_metadata(self, metadata_dict: dict) -> ChatMetadata:
        """Convert a metadata dictionary to ChatMetadata object"""
        return ChatMetadata(
            chat_session_uuid=metadata_dict['chat_session_uuid'],
            character_uuid=metadata_dict['character_uuid'],
            user_uuid=metadata_dict.get('user_uuid'),
            title=metadata_dict['title'],
            created_timestamp=metadata_dict['created_timestamp'],
            last_message_time=datetime.fromisoformat(metadata_dict['last_message_time']) if metadata_dict.get('last_message_time') else None,
            message_count=metadata_dict['message_count'],
            chat_log_path=metadata_dict['chat_log_path']
        )
