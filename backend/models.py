from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import datetime

class Character(Base):
    __tablename__ = "characters"

    character_uuid = Column(String, primary_key=True, index=True)
    original_character_id = Column(String, unique=True, index=True, nullable=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    personality = Column(Text, nullable=True)
    scenario = Column(Text, nullable=True)
    first_mes = Column(Text, nullable=True)
    mes_example = Column(Text, nullable=True)
    creator_comment = Column(Text, nullable=True)
    png_file_path = Column(String, nullable=False, unique=True) # Relative path to PNG
    tags = Column(JSON, nullable=True)
    spec_version = Column(String, nullable=True)
    
    # Timestamps
    # For created_at, using client-side default for now, can switch to server_default=func.now() if DB supports it well
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    db_metadata_last_synced_at = Column(DateTime(timezone=True), server_default=func.now())
    
    extensions_json = Column(JSON, nullable=True) # Store as JSON for other CharacterCard.data fields

    # Relationships
    lore_books = relationship("LoreBook", back_populates="character", cascade="all, delete-orphan")
    uploaded_lore_images = relationship("LoreImage", back_populates="uploader_character", foreign_keys="[LoreImage.uploader_character_uuid]")

class LoreBook(Base):
    __tablename__ = "lore_books"

    id = Column(Integer, primary_key=True, index=True)
    character_uuid = Column(String, ForeignKey("characters.character_uuid"), nullable=False)
    name = Column(String, default="")

    # Relationships
    character = relationship("Character", back_populates="lore_books")
    entries = relationship("LoreEntry", back_populates="lore_book", cascade="all, delete-orphan")

class LoreEntry(Base):
    __tablename__ = "lore_entries"

    id = Column(Integer, primary_key=True, index=True) # Corresponds to LoreEntry.id from original spec
    lore_book_id = Column(Integer, ForeignKey("lore_books.id"), nullable=False)
    
    keys_json = Column(JSON, nullable=True) # JSON array of primary keys
    secondary_keys_json = Column(JSON, nullable=True) # JSON array of secondary keys
    content = Column(Text, nullable=False)
    comment = Column(Text, nullable=True)
    enabled = Column(Boolean, nullable=False, default=True)
    position = Column(String, nullable=True) # e.g., "before_char", "an_top"
    selective = Column(Boolean, nullable=False, default=False)
    insertion_order = Column(Integer, default=0)
    
    image_uuid = Column(String, ForeignKey("lore_images.image_uuid"), nullable=True)
    extensions_json = Column(JSON, nullable=True) # JSON object for LoreEntry.extensions

    # Relationships
    lore_book = relationship("LoreBook", back_populates="entries")
    image = relationship("LoreImage", back_populates="lore_entries")


class LoreImage(Base):
    __tablename__ = "lore_images"

    image_uuid = Column(String, primary_key=True, index=True) # UUID of the image file itself
    uploader_character_uuid = Column(String, ForeignKey("characters.character_uuid"), nullable=False)
    original_filename = Column(String, nullable=True)
    stored_filename = Column(String, nullable=False) # e.g., {image_uuid}.{extension}
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    uploader_character = relationship("Character", back_populates="uploaded_lore_images", foreign_keys=[uploader_character_uuid])
    lore_entries = relationship("LoreEntry", back_populates="image")
from pydantic import BaseModel
from typing import Optional, List
import datetime as dt # Renamed to avoid conflict with sqlalchemy.DateTime

# Pydantic models for World
class WorldBase(BaseModel):
    name: str
    description: Optional[str] = None
    source_character_uuid: Optional[str] = None

class WorldCreate(WorldBase):
    pass

class WorldUpdate(WorldBase):
    name: Optional[str] = None # Allow partial updates

class WorldRead(WorldBase):
    world_uuid: str
    created_at: dt.datetime
    updated_at: dt.datetime

    class Config:
        orm_mode = True # Compatibility with SQLAlchemy models

# Pydantic models for Room
class RoomBase(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    introduction_text: Optional[str] = None
    grid_coordinates: Optional[str] = None
    world_uuid: str # A room must belong to a world

class RoomCreate(RoomBase):
    pass

class RoomUpdate(BaseModel): # Using BaseModel directly for more control over optional fields
    name: Optional[str] = None
    description: Optional[str] = None
    introduction_text: Optional[str] = None
    grid_coordinates: Optional[str] = None
    # world_uuid is typically not updated, or handled separately

class RoomRead(RoomBase):
    room_id: int
    # world_uuid is already in RoomBase

    class Config:
        orm_mode = True
# Pydantic models for Character (minimal for now, expand as needed)
class CharacterBase(BaseModel):
    name: str
    description: Optional[str] = None
    # Add other essential fields if needed for responses

class CharacterRead(CharacterBase):
    character_uuid: str
    png_file_path: str 
    created_at: dt.datetime
    updated_at: dt.datetime

    class Config:
        orm_mode = True

# Pydantic models for NPCInRoom (Character-Room Assignment)
class NPCInRoomBase(BaseModel):
    npc_character_uuid: str # This will likely be a path parameter in POST/DELETE
    room_id: int            # This will also likely be a path parameter
    npc_role_in_room: Optional[str] = None

class NPCInRoomCreate(BaseModel): # Request body for adding/updating NPC role in a room
    npc_role_in_room: Optional[str] = None

class NPCInRoomRead(NPCInRoomBase): # Response for a specific assignment
    id: int # The ID of the NPCsInRooms record

    class Config:
        orm_mode = True

# Response model for listing characters in a room, including their role
class CharacterInRoomResponse(CharacterRead):
    npc_role_in_room: Optional[str] = None

# Response model for listing rooms an NPC is in (RoomRead can be used directly or a more specific one if needed)
# For now, we assume existing RoomRead is sufficient.
# Pydantic models for ChatSession
class ChatSessionBase(BaseModel):
    character_uuid: str
    user_uuid: Optional[str] = None
    chat_log_path: str # Initially, this might be set by the service
    title: Optional[str] = None
    # message_count is managed by the system
    # last_message_time is managed by the system

class ChatSessionCreate(ChatSessionBase):
    # All fields from ChatSessionBase are needed for creation,
    # chat_log_path might be generated by the service upon creation.
    # start_time is server-generated.
    pass

class ChatSessionUpdate(BaseModel):
    title: Optional[str] = None
    # Potentially other updatable fields like status, if added to the model
    # last_message_time would be updated internally when a message is added
    # message_count would be updated internally

class ChatSessionRead(ChatSessionBase):
    chat_session_uuid: str
    start_time: dt.datetime
    last_message_time: Optional[dt.datetime] = None
    message_count: int

    class Config:
        orm_mode = True