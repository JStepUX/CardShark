"""
Core data models for the reliable chat system.

This module defines all the data structures, enums, and result types
used throughout the reliable chat management system.
"""

from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any


class ChatOperationResult(Enum):
    """Result codes for chat operations"""
    SUCCESS = "success"
    FILE_ERROR = "file_error"
    DB_ERROR = "db_error"
    NOT_FOUND = "not_found"
    PERMISSION_ERROR = "permission_error"
    CORRUPTION_ERROR = "corruption_error"
    RECOVERABLE_ERROR = "recoverable_error"


@dataclass
class ChatMetadata:
    """Standardized chat metadata structure"""
    chat_session_uuid: str
    character_uuid: str
    user_uuid: Optional[str]
    title: str
    created_timestamp: int
    last_message_time: Optional[datetime]
    message_count: int
    chat_log_path: str
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary with proper serialization"""
        data = asdict(self)
        if self.last_message_time:
            data['last_message_time'] = self.last_message_time.isoformat()
        return data


@dataclass
class ChatMessage:
    """Standardized message structure"""
    id: str
    role: str  # 'user', 'assistant', 'system'
    content: str
    timestamp: int
    status: str = 'complete'  # 'streaming', 'complete', 'error', 'aborted'
    reasoning_content: Optional[str] = None
    variations: Optional[List[str]] = None
    current_variation: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ChatMessage':
        """Create from dictionary"""
        return cls(**data)


# Result wrapper classes for endpoint compatibility
@dataclass
class ChatCreateResult:
    """Result wrapper for chat creation operations"""
    result: ChatOperationResult
    chat_metadata: Optional[ChatMetadata] = None
    error_message: Optional[str] = None


@dataclass
class ChatLoadResult:
    """Result wrapper for chat loading operations"""
    result: ChatOperationResult
    chat_metadata: Optional[ChatMetadata] = None
    messages: Optional[List[Dict[str, Any]]] = None
    error_message: Optional[str] = None


@dataclass
class ChatSaveResult:
    """Result wrapper for chat save operations"""
    result: ChatOperationResult
    chat_metadata: Optional[ChatMetadata] = None
    error_message: Optional[str] = None


@dataclass
class ChatListResult:
    """Result wrapper for chat list operations"""
    result: ChatOperationResult
    chat_sessions: Optional[List[ChatMetadata]] = None
    error_message: Optional[str] = None


@dataclass
class ChatDeleteResult:
    """Result wrapper for chat delete operations"""
    result: ChatOperationResult
    error_message: Optional[str] = None
