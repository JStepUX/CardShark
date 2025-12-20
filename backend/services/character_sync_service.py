import contextlib
import os
import time
import datetime
import uuid
from pathlib import Path
from typing import List, Optional
from sqlalchemy.orm import Session
from backend import sql_models
from backend.log_manager import LogManager
from backend.png_metadata_handler import PngMetadataHandler
from backend.settings_manager import SettingsManager

class CharacterSyncService:
    """
    Service to synchronize character files (PNGs) with the database.
    Implements a "File-First, DB-Cached" strategy.
    """

    def __init__(self, db_session_generator, png_handler: PngMetadataHandler, settings_manager: SettingsManager, logger: LogManager):
        self.db_session_generator = db_session_generator
        self.png_handler = png_handler
        self.settings_manager = settings_manager
        self.logger = logger
        self.characters_dir = self._get_characters_dir()

    def _get_characters_dir(self) -> Path:
        """Get the characters directory from settings or default."""
        # This logic mimics what's in CharacterService, ideally should be centralized
        # For now, we'll use the same logic to ensure consistency
        # Assuming standard structure for now as per project conventions
        return Path("characters")

    def sync_characters(self):
        """
        Main synchronization method.
        Scans the characters directory and updates the database.
        """
        self.logger.log_step("Starting character synchronization...")
        
    @contextlib.contextmanager
    def _get_session_context(self):
        """
        Robustly handle both factory (SessionLocal) and generator (get_db) patterns.
        """
        session = self.db_session_generator()
        
        # Check if it's a generator (has __next__)
        if hasattr(session, '__next__') or hasattr(session, 'send'):
            try:
                # Yield the session from the generator
                yield next(session)
            finally:
                # Close/cleanup generator
                try:
                    next(session) # Should raise StopIteration
                except StopIteration:
                    pass
                except Exception as e:
                    self.logger.log_error(f"Error closing session generator: {e}")
        else:
            # It's a direct session object (or context manager)
            # If it's a context manager (SessionLocal often isn't, but the result of SessionLocal() is a Session which IS)
            # SessionLocal() returns a Session, which is a context manager.
            # But here 'session' IS the Session object.
            try:
                yield session
            finally:
                 session.close()

    def sync_characters(self):
        """
        Main synchronization method.
        Scans the characters directory and updates the database.
        """
        self.logger.log_step("Starting character synchronization...")
        
        try:
            with self._get_session_context() as db:
                self._sync_files_to_db(db)
                self._sync_db_to_files(db)
                
            self.logger.log_step("Character synchronization complete.")
        except Exception as e:
            self.logger.log_error(f"Error during character synchronization: {e}")
            # We don't raise here to prevent app startup failure, but we log it.

    def _sync_files_to_db(self, db: Session):
        """
        Scan files and update/insert into DB.
        """
        if not self.characters_dir.exists():
            self.logger.log_warning(f"Characters directory not found: {self.characters_dir}")
            return

        # Get all PNG files
        png_files = list(self.characters_dir.glob("*.png"))
        self.logger.debug(f"Found {len(png_files)} character files.")

        for file_path in png_files:
            try:
                self._process_character_file(db, file_path)
            except Exception as e:
                self.logger.log_error(f"Failed to process file {file_path}: {e}")

    def _process_character_file(self, db: Session, file_path: Path):
        """
        Process a single character file: Insert or Update.
        """
        # Get absolute path for DB storage to ensure compatibility with API endpoints
        relative_path = str(file_path.resolve()) # Temporarily reuse variable name to minimize diff, but it holds absolute path now
        
        # Get file modification time
        file_mtime = int(file_path.stat().st_mtime)

        # Check if exists in DB
        db_char = db.query(sql_models.Character).filter(
            sql_models.Character.png_file_path == relative_path
        ).first()

        if not db_char:
            self.logger.log_info(f"New character detected: {relative_path}")
            self._import_character_from_png(db, file_path, relative_path, file_mtime)
        elif db_char.file_last_modified is None or file_mtime > db_char.file_last_modified:
            self.logger.log_info(f"Character modified: {relative_path}")
            self._update_character_from_png(db, db_char, file_path, file_mtime)
        else:
            # File is unchanged, do nothing
            pass

    def _import_character_from_png(self, db: Session, file_path: Path, relative_path: str, mtime: int):
        """Read PNG metadata and insert into DB."""
        metadata = self.png_handler.read_character_data(file_path)
        if not metadata:
            self.logger.log_warning(f"Could not read metadata from {file_path}")
            return

        # Extract data from metadata, handling both V1 and V2 SillyTavern formats
        # V2 has a nested 'data' object, V1 has properties at the top level
        data_section = metadata.get("data", metadata)
        
        # Helper to convert a value to a JSON string if it's not already a string.
        def as_json_str(value):
            import json
            if value is None:
                return None
            return value if isinstance(value, str) else json.dumps(value)

        # Create new Character record
        char_data = {
            "character_uuid": data_section.get("character_uuid") or str(uuid.uuid4()),
            "name": data_section.get("name", file_path.stem),
            "description": data_section.get("description"),
            "personality": data_section.get("personality"),
            "scenario": data_section.get("scenario"),
            "first_mes": data_section.get("first_mes"),
            "mes_example": data_section.get("mes_example"),
            "creator_comment": metadata.get("creatorcomment") or data_section.get("creator_comment"),
            "png_file_path": relative_path,
            "tags": as_json_str(data_section.get("tags", [])),
            "spec_version": metadata.get("spec_version", "2.0"),
            "extensions_json": as_json_str(data_section.get("extensions", {})),
            "alternate_greetings_json": as_json_str(data_section.get("alternate_greetings", [])),
            "creator_notes": data_section.get("creator_notes"),
            "system_prompt": data_section.get("system_prompt"),
            "post_history_instructions": data_section.get("post_history_instructions"),
            "creator": data_section.get("creator"),
            "character_version": data_section.get("character_version"),
            "combat_stats_json": as_json_str(data_section.get("combat_stats")),
            "file_last_modified": mtime
        }

        # Handle potential UUID conflict (rare but possible if file copied)
        existing_uuid = db.query(sql_models.Character).filter(
            sql_models.Character.character_uuid == char_data["character_uuid"]
        ).first()
        
        if existing_uuid:
             # If UUID exists but path is different, generate new UUID
             char_data["character_uuid"] = str(uuid.uuid4())
             self.logger.log_warning(f"Duplicate UUID found for {relative_path}, generated new one.")

        new_char = sql_models.Character(**char_data)
        db.add(new_char)
        db.commit()

    def _update_character_from_png(self, db: Session, db_char: sql_models.Character, file_path: Path, mtime: int):
        """Read PNG metadata and update DB record."""
        metadata = self.png_handler.read_character_data(file_path)
        if not metadata:
            return

        data_section = metadata.get("data", metadata)
        
        def as_json_str(value):
            import json
            if value is None:
                return None
            return value if isinstance(value, str) else json.dumps(value)

        # Update fields
        db_char.name = data_section.get("name", db_char.name)
        db_char.description = data_section.get("description")
        db_char.personality = data_section.get("personality")
        db_char.scenario = data_section.get("scenario")
        db_char.first_mes = data_section.get("first_mes")
        db_char.mes_example = data_section.get("mes_example")
        db_char.creator_comment = metadata.get("creatorcomment") or data_section.get("creator_comment")
        db_char.tags = as_json_str(data_section.get("tags", []))
        db_char.spec_version = metadata.get("spec_version", db_char.spec_version)
        db_char.extensions_json = as_json_str(data_section.get("extensions", {}))
        db_char.alternate_greetings_json = as_json_str(data_section.get("alternate_greetings", []))
        db_char.creator_notes = data_section.get("creator_notes")
        db_char.system_prompt = data_section.get("system_prompt")
        db_char.post_history_instructions = data_section.get("post_history_instructions")
        db_char.creator = data_section.get("creator")
        db_char.character_version = data_section.get("character_version")
        db_char.combat_stats_json = as_json_str(data_section.get("combat_stats"))
        db_char.file_last_modified = mtime
        
        db.commit()

    def _sync_db_to_files(self, db: Session):
        """
        Check for deleted files and update DB accordingly.
        """
        # Get all characters with a file path
        all_chars = db.query(sql_models.Character).all()
        
        for char in all_chars:
            if not char.png_file_path:
                continue
                
            full_path = self.characters_dir / char.png_file_path
            if not full_path.exists():
                self.logger.log_warning(f"Character file missing: {char.png_file_path}. Marking as archived/missing.")
                # For now, we might just log it, or we could add an 'is_missing' flag to the model.
                # Per plan: "Mark as archived/missing (or delete if no chat history)."
                # Let's check for chat history
                
                # chat_count = db.query(sql_models.ChatSession).filter(sql_models.ChatSession.character_uuid == char.character_uuid).count()
                # if chat_count == 0:
                #     db.delete(char)
                #     db.commit()
                # else:
                #     # Keep it but maybe rename? Or just leave it.
                #     pass
                pass # Implementing "Do nothing" for safety right now, just log.
