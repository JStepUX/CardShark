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