"""
@file folder_models.py
@description Pydantic models for gallery folder management endpoints.
"""
from pydantic import BaseModel, Field
from typing import List, Optional


class UpdateFolderRequest(BaseModel):
    folder_name: Optional[str] = Field(None, description="Folder name to assign, or null to unfile")


class BulkUpdateFolderRequest(BaseModel):
    uuids: List[str] = Field(..., description="List of character UUIDs to move")
    folder_name: Optional[str] = Field(None, description="Folder name to assign, or null to unfile")
