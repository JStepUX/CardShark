"""
@file character_lore_service.py
@description Service for managing character lore books and entries.
Handles synchronization of lore data between character cards and the database.
@dependencies sql_models, database
@consumers character_service.py
"""
import json
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from backend.sql_models import (
    Character as CharacterModel,
    LoreBook as LoreBookModel,
    LoreEntry as LoreEntryModel
)


class CharacterLoreService:
    """
    Service for managing character lore books and entries.

    Provides methods for:
    - Synchronizing lore from character card metadata to database
    - Adding lore entries to existing characters
    """

    def __init__(self, logger):
        """
        Initialize the lore service.

        Args:
            logger: Logger instance for logging operations
        """
        self.logger = logger

    def sync_character_lore(
        self,
        character_uuid: str,
        character_book_data: Optional[Dict],
        db: Session
    ) -> None:
        """
        Synchronizes lore for a given character.
        Creates, updates, or deletes lore book and entries in the DB
        to match the provided character_book_data from a character card.

        Args:
            character_uuid: UUID of the character to sync lore for
            character_book_data: Dictionary containing lore book data from character card
            db: Database session to use for operations
        """
        self.logger.log_info(f"Syncing lore for character_uuid: {character_uuid}")

        # Ensure the character exists in DB before trying to associate lore
        character_in_db = db.query(CharacterModel).filter(
            CharacterModel.character_uuid == character_uuid
        ).first()
        if not character_in_db:
            self.logger.log_error(f"Cannot sync lore. Character {character_uuid} not found in DB.")
            return

        # Case 1: No character_book_data provided, or it's not a dictionary (e.g., None or empty)
        if not character_book_data or not isinstance(character_book_data, dict):
            self.logger.log_info(f"No valid character_book data for {character_uuid}. Ensuring no lore exists in DB.")
            existing_lore_book = db.query(LoreBookModel).filter(
                LoreBookModel.character_uuid == character_uuid
            ).first()
            if existing_lore_book:
                self.logger.log_info(
                    f"Deleting existing lore book (ID: {existing_lore_book.id}) "
                    f"and its entries for {character_uuid}."
                )
                # Cascade delete should handle LoreEntry items due to relationship in models.py
                db.delete(existing_lore_book)
            return  # Nothing more to do

        # Case 2: Valid character_book_data provided
        lore_book_name = character_book_data.get("name", "")  # Default to empty string if name not present
        entries_data = character_book_data.get("entries", [])
        if not isinstance(entries_data, list):  # Ensure entries is a list
            self.logger.log_warning(f"Lore entries for {character_uuid} is not a list. Treating as empty.")
            entries_data = []

        # Find or create the LoreBook for this character
        lore_book = db.query(LoreBookModel).filter(
            LoreBookModel.character_uuid == character_uuid
        ).first()
        if not lore_book:
            self.logger.log_info(f"Creating new lore book for {character_uuid} with name '{lore_book_name}'.")
            lore_book = LoreBookModel(character_uuid=character_uuid, name=lore_book_name)
            db.add(lore_book)
            db.flush()  # Necessary to get lore_book.id for new entries
        elif lore_book.name != lore_book_name:
            self.logger.log_info(
                f"Updating lore book name for {character_uuid} from '{lore_book.name}' to '{lore_book_name}'."
            )
            lore_book.name = lore_book_name
            db.add(lore_book)  # Mark as dirty

        # Sync LoreEntries: Clear existing entries and recreate them
        # Since JSON IDs are not unique across characters, we need to clear and recreate
        # Delete all existing entries for this lore book
        if lore_book.entries:
            self.logger.log_info(
                f"Clearing {len(lore_book.entries)} existing lore entries "
                f"for book {lore_book.id} (Char: {character_uuid})"
            )
            for entry in lore_book.entries:
                db.delete(entry)
            db.flush()  # Ensure deletions are processed before creating new entries

        # Create new entries from the character book data
        for entry_data in entries_data:
            if not isinstance(entry_data, dict):
                self.logger.log_warning(
                    f"Skipping non-dict lore entry item for {character_uuid}: {entry_data}"
                )
                continue

            # Store the original JSON ID for reference but don't use it as DB primary key
            original_json_id = entry_data.get("id", "unknown")

            # Data for the LoreEntry model instance
            lore_entry_model_data = {
                "lore_book_id": lore_book.id,
                "keys_json": json.dumps(entry_data.get("keys", [])),
                "secondary_keys_json": json.dumps(entry_data.get("secondary_keys", [])),
                "content": entry_data.get("content", ""),  # Ensure content is not None
                "comment": entry_data.get("comment", ""),
                "enabled": entry_data.get("enabled", True),
                "position": entry_data.get("position", "before_char"),  # Default if not present
                "selective": entry_data.get("selective", False),
                "insertion_order": entry_data.get("insertion_order", 100),  # Default if not present
                "image_uuid": entry_data.get("image_uuid"),
                "extensions_json": json.dumps(entry_data.get("extensions", {}))
            }

            # Create new entry (let DB auto-generate the primary key)
            self.logger.log_info(f"Creating new lore entry (JSON ID: {original_json_id}) for book {lore_book.id}")
            new_db_entry = LoreEntryModel(**lore_entry_model_data)
            db.add(new_db_entry)

        # Note: db.commit() will be called by the calling function

    def add_lore_entries(
        self,
        character_uuid: str,
        entries_data: List[Dict],
        db: Session
    ) -> bool:
        """
        Adds multiple lore entries to a character's lore book.
        Appends to existing entries instead of replacing them.

        Note: This method does NOT write to PNG. If PNG update is needed,
        the caller should trigger that separately via CharacterService.update_character().

        Args:
            character_uuid: UUID of the character to add lore to
            entries_data: List of lore entry dictionaries
            db: Database session to use for operations

        Returns:
            True if entries were added successfully, False otherwise
        """
        self.logger.log_info(f"Adding {len(entries_data)} lore entries to character: {character_uuid}")

        # Ensure the character exists
        character = db.query(CharacterModel).filter(
            CharacterModel.character_uuid == character_uuid
        ).first()
        if not character:
            self.logger.log_error(f"Cannot add lore entries. Character {character_uuid} not found.")
            return False

        # Find or create LoreBook
        lore_book = db.query(LoreBookModel).filter(
            LoreBookModel.character_uuid == character_uuid
        ).first()
        if not lore_book:
            self.logger.log_info(f"Creating new lore book for {character_uuid}")
            lore_book = LoreBookModel(
                character_uuid=character_uuid,
                name=f"{character.name}'s Lorebook"
            )
            db.add(lore_book)
            db.flush()

        # Add entries
        for entry_data in entries_data:
            if not isinstance(entry_data, dict):
                continue

            lore_entry_model_data = {
                "lore_book_id": lore_book.id,
                "keys_json": json.dumps(entry_data.get("keys", [])),
                "secondary_keys_json": json.dumps(entry_data.get("secondary_keys", [])),
                "content": entry_data.get("content", ""),
                "comment": entry_data.get("comment", ""),
                "enabled": entry_data.get("enabled", True),
                "position": entry_data.get("position", "before_char"),
                "selective": entry_data.get("selective", False),
                "insertion_order": entry_data.get("insertion_order", 0),  # Caller should set this ideally
                "image_uuid": entry_data.get("image_uuid"),
                "extensions_json": json.dumps(entry_data.get("extensions", {}))
            }

            new_db_entry = LoreEntryModel(**lore_entry_model_data)
            db.add(new_db_entry)

        db.commit()
        return True
