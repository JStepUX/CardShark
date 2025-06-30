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
            return ChatLoadResult(
                success=True,
                data=chat_data,
                message="Chat loaded successfully"
            )
        else:
            return ChatLoadResult(
                success=False,
                data=None,
                message=error_message or "Failed to load chat"
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
                success=True,
                message="Message appended successfully"
            )
        else:
            return ChatSaveResult(
                success=False,
                message=error_message or "Failed to append message"
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
                success=True,
                chats=chat_list or [],
                message="Chats listed successfully"
            )
        else:
            return ChatListResult(
                success=False,
                chats=[],
                message=error_message or "Failed to list chats"
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
                success=True,
                message="Chat deleted successfully"
            )
        else:
            return ChatDeleteResult(
                success=False,
                message=error_message or "Failed to delete chat"
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
                success=True,
                message="Chat session saved successfully"
            )
        else:
            return ChatSaveResult(
                success=False,
                message=error_message or "Failed to save chat session"
            )