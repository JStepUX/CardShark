"""
@file session_settings.py
@description Pydantic models for session settings (Context Lens feature)
@dependencies pydantic
@consumers chat_endpoints.py, chat_service.py
"""
from pydantic import BaseModel
from typing import Optional


class SessionSettings(BaseModel):
    """Session settings for a chat session (notes and compression)."""
    session_notes: Optional[str] = None
    compression_enabled: bool = False


class SessionSettingsUpdate(BaseModel):
    """Payload for updating session settings."""
    chat_session_uuid: str
    session_notes: Optional[str] = None
    compression_enabled: Optional[bool] = None


class SessionSettingsResponse(BaseModel):
    """Response model for session settings operations."""
    success: bool
