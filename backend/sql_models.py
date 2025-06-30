# This is a copy of models.py but renamed to avoid conflicts with the models package

from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database import Base
import datetime


class UserProfile(Base):
    __tablename__ = "user_profiles"
    # It's good practice to include extend_existing=True if you anticipate re-running table creation
    # or if the table might be defined/extended elsewhere, though it might not be strictly necessary
    # if this is the sole definition and you're creating from scratch.
    # However, given the context of fixing an existing application, it's a safe addition.
    __table_args__ = {'extend_existing': True}

    user_uuid = Column(String, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True) # Assuming email can be optional
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # If UserProfile needs to link back to ChatSession (e.g., a user has many chat sessions),
    # you would add a relationship here. For now, this is commented out as the immediate
    # fix is just to define UserProfile for the foreign key in ChatSession.
    chat_sessions = relationship("ChatSession", back_populates="user_profile")
class Character(Base):
    __tablename__ = "characters"
    __table_args__ = {'extend_existing': True}

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
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    character_uuid = Column(String, ForeignKey("characters.character_uuid"), nullable=False)
    name = Column(String, default="")

    # Relationships
    character = relationship("Character", back_populates="lore_books")
    entries = relationship("LoreEntry", back_populates="lore_book", cascade="all, delete-orphan")

class LoreEntry(Base):
    __tablename__ = "lore_entries"
    __table_args__ = {'extend_existing': True}

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
    __table_args__ = {'extend_existing': True}

    image_uuid = Column(String, primary_key=True, index=True) # UUID of the image file itself
    uploader_character_uuid = Column(String, ForeignKey("characters.character_uuid"), nullable=False)
    original_filename = Column(String, nullable=True)
    stored_filename = Column(String, nullable=False) # e.g., {image_uuid}.{extension}
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    uploader_character = relationship("Character", back_populates="uploaded_lore_images", foreign_keys=[uploader_character_uuid])
    lore_entries = relationship("LoreEntry", back_populates="image")

class World(Base):
    __tablename__ = "worlds"
    __table_args__ = {'extend_existing': True}

    world_uuid = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    source_character_uuid = Column(String, ForeignKey("characters.character_uuid"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    rooms = relationship("Room", back_populates="world", cascade="all, delete-orphan")
    source_character = relationship("Character") # Simple relationship, no back_populates needed if Character doesn't link back to Worlds

class Room(Base):
    __tablename__ = "rooms"
    __table_args__ = {'extend_existing': True}

    room_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    world_uuid = Column(String, ForeignKey("worlds.world_uuid"), nullable=False)
    name = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    introduction_text = Column(Text, nullable=True)
    grid_coordinates = Column(String, nullable=True) # e.g., "x,y" or JSON string

    # Relationships
    world = relationship("World", back_populates="rooms")
    npcs_in_room = relationship("NPCInRoom", back_populates="room", cascade="all, delete-orphan")

class NPCInRoom(Base):
    __tablename__ = "npcs_in_rooms"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    room_id = Column(Integer, ForeignKey("rooms.room_id"), nullable=False)
    npc_character_uuid = Column(String, ForeignKey("characters.character_uuid"), nullable=False)
    npc_role_in_room = Column(Text, nullable=True)

    # __table_args__ = (UniqueConstraint('room_id', 'npc_character_uuid', name='_room_npc_uc'),) # As per plan

    # Relationships
    room = relationship("Room", back_populates="npcs_in_room")
    npc_character = relationship("Character") # Simple relationship

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = {'extend_existing': True}

    message_id = Column(String, primary_key=True, index=True)  # UUID
    chat_session_uuid = Column(String, ForeignKey("chat_sessions.chat_session_uuid"), nullable=False, index=True)
    role = Column(String, nullable=False, index=True)  # user/assistant/system
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status = Column(String, nullable=False, default="complete")  # complete/generating/error
    reasoning_content = Column(Text, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    chat_session = relationship("ChatSession", back_populates="messages")

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    __table_args__ = {'extend_existing': True}

    chat_session_uuid = Column(String, primary_key=True, index=True)
    character_uuid = Column(String, ForeignKey("characters.character_uuid"), nullable=False)
    # Assuming UserProfile model will exist or be added later as per the plan
    # If UserProfile model is not guaranteed, this FK might cause issues if that table isn't created.
    # For now, following the plan.
    user_uuid = Column(String, ForeignKey("user_profiles.user_uuid"), nullable=True) 
    
    start_time = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_message_time = Column(DateTime(timezone=True), nullable=True)
    message_count = Column(Integer, default=0)
    # Removed chat_log_path as per transition plan
    # chat_log_path = Column(String, nullable=False) # Path to the JSONL file
    title = Column(String, nullable=True)
    export_format_version = Column(String, nullable=True)  # for future compatibility
    is_archived = Column(Boolean, default=False, nullable=False)

    # Relationships
    character = relationship("Character") # Add back_populates if Character links to ChatSessions
    user_profile = relationship("UserProfile", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="chat_session", cascade="all, delete-orphan")
