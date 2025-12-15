"""
@file character_service.py
@description Service for managing character data, persistence, and image handling.
@dependencies database, png_metadata_handler, character_data models
@consumers character_endpoints.py
"""
import asyncio
import contextlib
import json
import os
import re
import sys
from pathlib import Path
import traceback
from typing import Dict, Any, Optional, List
import uuid
import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_

# project_root = Path(__file__).resolve().parent.parent.parent # Removed sys.path modification

# Using absolute imports to avoid relative import issues
import sys
from pathlib import Path

# Add the project root to sys.path temporarily
project_root = str(Path(__file__).resolve().parent.parent.parent)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Now import using absolute paths
from backend.database import SessionLocal # For type hinting, actual session passed in
from backend.sql_models import Character as CharacterModel
from backend.sql_models import LoreBook as LoreBookModel
from backend.sql_models import LoreEntry as LoreEntryModel
from backend.sql_models import LoreImage as LoreImageModel

# Remove project_root from sys.path to avoid affecting other imports
if project_root in sys.path:
    sys.path.remove(project_root)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Now import using absolute paths
from backend.database import SessionLocal # For type hinting, actual session passed in
from backend.sql_models import Character as CharacterModel
from backend.sql_models import LoreBook as LoreBookModel
from backend.sql_models import LoreEntry as LoreEntryModel

# Remove project_root from sys.path to avoid affecting other imports
if project_root in sys.path:
    sys.path.remove(project_root)
# from backend.png_metadata_handler import PngMetadataHandler # Will be used
# from backend.settings_manager import SettingsManager # Will be used
# from backend.log_manager import LogManager # For logging

# Placeholder for actual PngMetadataHandler and SettingsManager if needed directly
# For now, methods will assume these are passed or accessible
# logger = LogManager() # Assuming a global or passed logger

def _as_json_str(value):
    """Helper to convert a value to a JSON string if it's not already a string."""
    return value if isinstance(value, str) else json.dumps(value)

class CharacterService:
    def __init__(self, db_session_generator, png_handler, settings_manager, logger, character_indexing_service=None):
        self.db_session_generator = db_session_generator
        self.png_handler = png_handler
        self.settings_manager = settings_manager
        self.logger = logger

    def _safe_json_load(self, json_str: Optional[str], default_value: Any, field_name: str, character_uuid: str) -> Any:
        """
        Safely loads a JSON string, handling JSONDecodeError.
        Logs an error and returns a default value if decoding fails.
        """
        if not json_str:
            return default_value
        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            self.logger.log_error(
                f"JSONDecodeError for character {character_uuid}, field '{field_name}': {e}. "
                f"Malformed data: '{json_str[:100]}...' (truncated). Returning default value."
            )
            return default_value
        except Exception as e:
            self.logger.log_error(
                f"Unexpected error loading JSON for character {character_uuid}, field '{field_name}': {e}. "
                f"Malformed data: '{json_str[:100]}...' (truncated). Returning default value."
            )
            return default_value

    def _get_character_dirs(self) -> List[str]:
        """Gets character directories from settings or uses a default."""
        from backend.utils.path_utils import normalize_path, resolve_directory_path, get_application_base_path, ensure_directory_exists
        
        # Check for the singular setting first (this is what's actually used in settings.json)
        character_dir_setting = self.settings_manager.get_setting("character_directory")
        # Fallback to plural if singular not found (for backward compatibility)
        if not character_dir_setting:
            character_dirs_setting = self.settings_manager.get_setting("character_directories")
            if isinstance(character_dirs_setting, str):
                character_dirs_setting = [character_dirs_setting]
        else:
            character_dirs_setting = [character_dir_setting] if isinstance(character_dir_setting, str) else character_dir_setting
        
        # Use default 'characters' directory relative to application base if no setting found
        if not character_dirs_setting or not isinstance(character_dirs_setting, list):
            default_character_dir = get_application_base_path() / "characters"
            self.logger.log_warning(
                f"'character_directory' not found in settings or invalid. Using default: {default_character_dir}"
            )
            # Ensure the default directory exists
            ensure_directory_exists(default_character_dir)
            return [normalize_path(str(default_character_dir))]
        
        # Resolve and normalize all character directory paths for consistency
        # This supports both absolute paths (like "C:\sillytavern\characters") 
        # and relative paths (like "characters")
        normalized_dirs = []
        for dir_path in character_dirs_setting:
            if dir_path:  # Skip empty paths
                resolved_path = resolve_directory_path(dir_path)
                if resolved_path:
                    # Ensure the directory exists
                    ensure_directory_exists(resolved_path)
                    normalized_dirs.append(resolved_path)
        
        return normalized_dirs

    def _ensure_lore_image_directory(self, character_uuid: str) -> Path:
        """Ensures the lore image directory for a character exists and returns its path."""
        # project_root is no longer defined here. Assuming 'uploads' is relative to the script's parent's parent.
        # This might need adjustment based on actual deployment structure.
        base_lore_images_dir = Path(__file__).resolve().parent.parent.parent / "uploads" / "lore_images"
        character_lore_dir = base_lore_images_dir / str(character_uuid)
        try:
            character_lore_dir.mkdir(parents=True, exist_ok=True)
            self.logger.log_info(f"Lore image directory ensured: {character_lore_dir}")
        except Exception as e:
            self.logger.log_error(f"Failed to create lore image directory {character_lore_dir}: {e}")
            # Depending on desired behavior, could raise an exception here
            # For now, it will try to proceed, and file operations might fail later.
        return character_lore_dir

    def get_lore_image_paths(self, character_uuid: str, image_filename: str) -> Dict[str, str]:
        """
        Returns a dictionary with base_path (absolute) and relative_path (URL-friendly)
        for a given lore image filename and character.
        Ensures the character's lore image directory exists.
        """
        if not character_uuid:
            self.logger.log_error("get_lore_image_paths called with no character_uuid")
            raise ValueError("character_uuid cannot be empty for get_lore_image_paths")
        if not image_filename: # Ensure filename is not empty to prevent issues
            self.logger.log_warning("get_lore_image_paths called with empty image_filename, using placeholder.")
            image_filename = "placeholder.png"


        # Ensure the character-specific lore image directory exists
        character_lore_dir_abs = self._ensure_lore_image_directory(character_uuid)
        
        # Construct the relative path for URL generation (e.g., /uploads/lore_images/uuid/file.png)
        # This path should be relative to the web server's static files root for "uploads"
        relative_image_path = f"uploads/lore_images/{character_uuid}/{Path(image_filename).name}"

        return {
            "base_path": str(character_lore_dir_abs.resolve()), # Absolute path to the character's lore image directory
            "relative_path": relative_image_path, # Relative path for client access
            "absolute_image_path": str((character_lore_dir_abs / Path(image_filename).name).resolve()) # Full absolute path to the image file
        }

    def sync_character_directories(self):
        """
        Scans configured character directories, syncs PNG metadata with the database.
        This function handles initial import and updates.
        """
        self.logger.log_info("Starting character directory synchronization...")
        character_dirs = self._get_character_dirs()
        
        legacy_uuid_mappings: Dict[str, str] = {}
        legacy_name_mappings: Dict[str, str] = {}
        # project_root is no longer defined here.
        mapping_file_path = Path(__file__).resolve().parent.parent.parent / "data" / "character_uuid_mapping.json"

        if mapping_file_path.exists():
            self.logger.log_info(f"Loading legacy UUID mappings from {mapping_file_path}")
            with open(mapping_file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                legacy_uuid_mappings = data.get("mappings", {})
                legacy_name_mappings = data.get("character_names", {})
            self.logger.log_info(f"Loaded {len(legacy_uuid_mappings)} legacy UUID mappings.")
        else:
            self.logger.log_warning(f"Legacy UUID mapping file not found at {mapping_file_path}.")

        # Ensure all character directories exist
        all_png_files_on_disk = set()
        from backend.utils.path_utils import normalize_path

        for char_dir_path_str in character_dirs:
            char_dir = Path(char_dir_path_str)
            if not char_dir.is_dir():
                self.logger.log_warning(f"Character directory not found or not a directory: {char_dir}")
                continue

            self.logger.log_info(f"Processing PNG files in {char_dir}...")
            for png_file in char_dir.rglob('*.png'):
                abs_png_path = normalize_path(str(png_file.resolve()))
                all_png_files_on_disk.add(abs_png_path)

                try:
                    file_mod_time = datetime.datetime.fromtimestamp(png_file.stat().st_mtime)
                    
                    with self._get_session_context() as db:
                        existing_char = db.query(CharacterModel).filter(CharacterModel.png_file_path == abs_png_path).first()

                    if existing_char and existing_char.db_metadata_last_synced_at and existing_char.db_metadata_last_synced_at >= file_mod_time:
                        self.logger.log_info(f"Skipping {abs_png_path}, DB record is up-to-date.")
                        continue

                    self.logger.log_info(f"Syncing PNG: {abs_png_path}")
                    metadata = self.png_handler.read_metadata(abs_png_path)
                    
                    # Determine if this is an incomplete character (no valid metadata)
                    is_incomplete_char = not metadata or not metadata.get("data")
                    
                    if is_incomplete_char:
                        self.logger.log_warning(f"No valid CardShark metadata found in {abs_png_path}. Creating stub record for editing.")
                        # Create empty data section for incomplete characters
                        data_section = {}
                        metadata = metadata or {}
                    else:
                        data_section = metadata["data"]
                    
                    char_name = data_section.get("name") if data_section else None
                    if not char_name:
                        # Extract name from filename, removing trailing _\d+ if present
                        stem_name = png_file.stem
                        match = re.match(r"^(.*?)(_\d+)?$", stem_name)
                        if match:
                            char_name = match.group(1)
                        else:
                            char_name = stem_name # Fallback if regex fails
                    
                    if not char_name: # Final fallback if name is still empty
                        char_name = "Unknown Character"
                    
                    char_uuid_from_png = data_section.get("character_uuid") if data_section else None
                    final_char_uuid = char_uuid_from_png
                    original_id_for_db = None # Will be set if from legacy mapping

                    # Check legacy mapping if no UUID in PNG
                    if not final_char_uuid and abs_png_path in legacy_uuid_mappings:
                        final_char_uuid = legacy_uuid_mappings[abs_png_path]
                        original_id_for_db = abs_png_path # The path was the key in legacy map
                        self.logger.log_info(f"Using legacy mapped UUID {final_char_uuid} for {abs_png_path}")
                    elif not final_char_uuid:
                        final_char_uuid = str(uuid.uuid4())
                        self.logger.log_info(f"Generated new UUID {final_char_uuid} for {abs_png_path}")
                        # Ensure lore image directory exists for new UUID
                        self._ensure_lore_image_directory(final_char_uuid)                        # TODO: Consider a mechanism to write this new UUID back to the PNG.

                    with self._get_session_context() as db:
                        if existing_char: # Update existing
                            self.logger.log_info(f"Updating character {final_char_uuid} (Path: {abs_png_path}) in DB.")
                            existing_char.character_uuid = final_char_uuid # Ensure UUID is updated if it changed
                            existing_char.name = char_name
                            existing_char.description = data_section.get("description")
                            existing_char.personality = data_section.get("personality")
                            existing_char.scenario = data_section.get("scenario")
                            existing_char.first_mes = data_section.get("first_mes")
                            existing_char.mes_example = data_section.get("mes_example")
                            existing_char.creator_comment = metadata.get("creatorcomment")
                            existing_char.tags = _as_json_str(data_section.get("tags", []))
                            existing_char.spec_version = metadata.get("spec_version")
                            existing_char.extensions_json = _as_json_str(data_section.get("extensions", {}))
                            # New fields from character card spec
                            existing_char.alternate_greetings_json = _as_json_str(data_section.get("alternate_greetings", []))
                            existing_char.creator_notes = data_section.get("creator_notes")
                            existing_char.system_prompt = data_section.get("system_prompt")
                            existing_char.post_history_instructions = data_section.get("post_history_instructions")
                            existing_char.creator = data_section.get("creator")
                            existing_char.character_version = data_section.get("character_version")
                            existing_char.combat_stats_json = _as_json_str(data_section.get("combat_stats")) if data_section.get("combat_stats") else None
                            if original_id_for_db and not existing_char.original_character_id:
                                existing_char.original_character_id = original_id_for_db
                            # Update is_incomplete flag - character is complete if it has valid metadata
                            existing_char.is_incomplete = is_incomplete_char
                            existing_char.db_metadata_last_synced_at = datetime.datetime.utcnow()
                            db.add(existing_char) # Mark as dirty
                        else: # Create new
                            self.logger.log_info(f"Adding new character {final_char_uuid} (Path: {abs_png_path}) to DB{' (incomplete)' if is_incomplete_char else ''}.")
                            new_db_char = CharacterModel(
                                character_uuid=final_char_uuid,
                                original_character_id=original_id_for_db,
                                name=char_name,
                                png_file_path=abs_png_path,
                                description=data_section.get("description"),
                                personality=data_section.get("personality"),
                                scenario=data_section.get("scenario"),
                                first_mes=data_section.get("first_mes"),
                                mes_example=data_section.get("mes_example"),
                                creator_comment=metadata.get("creatorcomment"),
                                tags=_as_json_str(data_section.get("tags", [])),
                                spec_version=metadata.get("spec_version"),
                                extensions_json=_as_json_str(data_section.get("extensions", {})),
                                # New fields from character card spec
                                alternate_greetings_json=_as_json_str(data_section.get("alternate_greetings", [])),
                                creator_notes=data_section.get("creator_notes"),
                                system_prompt=data_section.get("system_prompt"),
                                post_history_instructions=data_section.get("post_history_instructions"),
                                creator=data_section.get("creator"),
                                character_version=data_section.get("character_version"),
                                combat_stats_json=_as_json_str(data_section.get("combat_stats")) if data_section.get("combat_stats") else None,
                                is_incomplete=is_incomplete_char,
                                db_metadata_last_synced_at=datetime.datetime.utcnow()
                            )
                            db.add(new_db_char)
                            db.flush() # Necessary to get ID for new entries
                            self._ensure_lore_image_directory(final_char_uuid)
                        # Sync Lore for this character (only if we have lore data)
                        if not is_incomplete_char:
                            self._sync_character_lore(final_char_uuid, data_section.get("character_book", {}), db)
                        db.commit() # Commit changes for this character

                except Exception as e:
                    self.logger.log_error(f"Failed to process/sync PNG {abs_png_path}: {e} - {traceback.format_exc()}")
                    # Rollback any changes for this character to avoid partial state
                    # Continue processing other characters
        
        # Prune characters from DB that no longer exist on disk
        # This is a destructive operation, ensure it's desired.
        # Could be made optional via a setting.
        with self.db_session_generator() as db:
            for db_char_path_tuple in db.query(CharacterModel.png_file_path, CharacterModel.character_uuid).all():
                db_char_path = db_char_path_tuple[0]
                db_char_uuid = db_char_path_tuple[1]
                if db_char_path not in all_png_files_on_disk:
                    self.logger.log_info(f"Character PNG {db_char_path} (UUID: {db_char_uuid}) no longer exists. Removing from DB.")
                    char_to_delete = db.query(CharacterModel).filter(CharacterModel.character_uuid == db_char_uuid).first()
                    if char_to_delete:
                        db.delete(char_to_delete) # Cascade should handle related lore if set up
            db.commit()

        self.logger.log_info("Character directory synchronization finished.")

    def _sync_character_lore(self, character_uuid: str, character_book_data: Optional[Dict], db: Session):
        """
        Synchronizes lore for a given character.
        Creates, updates, or deletes lore book and entries in the DB
        to match the provided character_book_data from a character card.
        """
        self.logger.log_info(f"Syncing lore for character_uuid: {character_uuid}")

        # Ensure the character exists in DB before trying to associate lore
        character_in_db = db.query(CharacterModel).filter(CharacterModel.character_uuid == character_uuid).first()
        if not character_in_db:
            self.logger.log_error(f"Cannot sync lore. Character {character_uuid} not found in DB.")
            return

        # Case 1: No character_book_data provided, or it's not a dictionary (e.g., None or empty)
        if not character_book_data or not isinstance(character_book_data, dict):
            self.logger.log_info(f"No valid character_book data for {character_uuid}. Ensuring no lore exists in DB.")
            existing_lore_book = db.query(LoreBookModel).filter(LoreBookModel.character_uuid == character_uuid).first()
            if existing_lore_book:
                self.logger.log_info(f"Deleting existing lore book (ID: {existing_lore_book.id}) and its entries for {character_uuid}.")
                # Cascade delete should handle LoreEntry items due to relationship in models.py
                db.delete(existing_lore_book)
            return # Nothing more to do

        # Case 2: Valid character_book_data provided
        lore_book_name = character_book_data.get("name", "") # Default to empty string if name not present
        entries_data = character_book_data.get("entries", [])
        if not isinstance(entries_data, list): # Ensure entries is a list
            self.logger.log_warning(f"Lore entries for {character_uuid} is not a list. Treating as empty.")
            entries_data = []

        # Find or create the LoreBook for this character
        lore_book = db.query(LoreBookModel).filter(LoreBookModel.character_uuid == character_uuid).first()
        if not lore_book:
            self.logger.log_info(f"Creating new lore book for {character_uuid} with name '{lore_book_name}'.")
            lore_book = LoreBookModel(character_uuid=character_uuid, name=lore_book_name)
            db.add(lore_book)
            db.flush() # Necessary to get lore_book.id for new entries
        elif lore_book.name != lore_book_name:
            self.logger.log_info(f"Updating lore book name for {character_uuid} from '{lore_book.name}' to '{lore_book_name}'.")
            lore_book.name = lore_book_name
            db.add(lore_book) # Mark as dirty        # Sync LoreEntries: Clear existing entries and recreate them
        # Since JSON IDs are not unique across characters, we need to clear and recreate
        # Delete all existing entries for this lore book
        if lore_book.entries:
            self.logger.log_info(f"Clearing {len(lore_book.entries)} existing lore entries for book {lore_book.id} (Char: {character_uuid})")
            for entry in lore_book.entries:
                db.delete(entry)
            db.flush()  # Ensure deletions are processed before creating new entries        # Create new entries from the character book data
        for entry_data in entries_data:
            if not isinstance(entry_data, dict):
                self.logger.log_warning(f"Skipping non-dict lore entry item for {character_uuid}: {entry_data}")
                continue

            # Store the original JSON ID for reference but don't use it as DB primary key
            original_json_id = entry_data.get("id", "unknown")
            
            # Data for the LoreEntry model instance
            lore_entry_model_data = {
                "lore_book_id": lore_book.id,
                "keys_json": json.dumps(entry_data.get("keys", [])),
                "secondary_keys_json": json.dumps(entry_data.get("secondary_keys", [])),
                "content": entry_data.get("content", ""), # Ensure content is not None
                "comment": entry_data.get("comment", ""),
                "enabled": entry_data.get("enabled", True),
                "position": entry_data.get("position", "before_char"), # Default if not present
                "selective": entry_data.get("selective", False),
                "insertion_order": entry_data.get("insertion_order", 100), # Default if not present
                "image_uuid": entry_data.get("image_uuid"),
                "extensions_json": json.dumps(entry_data.get("extensions", {}))
            }

            # Create new entry (let DB auto-generate the primary key)
            self.logger.log_info(f"Creating new lore entry (JSON ID: {original_json_id}) for book {lore_book.id}")
            new_db_entry = LoreEntryModel(**lore_entry_model_data)
            db.add(new_db_entry)        # self.db.commit() will be called by the calling function (e.g. sync_character_directories or save_uploaded_character_card)

    def add_lore_entries(self, character_uuid: str, entries_data: List[Dict], write_to_png: bool = True):
        """
        Adds multiple lore entries to a character's lore book.
        Appends to existing entries instead of replacing them.
        """
        self.logger.log_info(f"Adding {len(entries_data)} lore entries to character: {character_uuid}")

        with self._get_session_context() as db:
            # Ensure the character exists
            character = db.query(CharacterModel).filter(CharacterModel.character_uuid == character_uuid).first()
            if not character:
                self.logger.log_error(f"Cannot add lore entries. Character {character_uuid} not found.")
                return False

            # Find or create LoreBook
            lore_book = db.query(LoreBookModel).filter(LoreBookModel.character_uuid == character_uuid).first()
            if not lore_book:
                self.logger.log_info(f"Creating new lore book for {character_uuid}")
                lore_book = LoreBookModel(character_uuid=character_uuid, name=f"{character.name}'s Lorebook")
                db.add(lore_book)
                db.flush()

            # Add entries
            for entry_data in entries_data:
                if not isinstance(entry_data, dict):
                    continue
                
                # Determine insertion order (append to end)
                # This could be optimized by query but for now relying on provided or default
                # Ideally we check max existing order but let's trust the input or default
                
                lore_entry_model_data = {
                    "lore_book_id": lore_book.id,
                    "keys_json": json.dumps(entry_data.get("keys", [])),
                    "secondary_keys_json": json.dumps(entry_data.get("secondary_keys", [])),
                    "content": entry_data.get("content", ""),
                    "comment": entry_data.get("comment", ""),
                    "enabled": entry_data.get("enabled", True),
                    "position": entry_data.get("position", "before_char"),
                    "selective": entry_data.get("selective", False),
                    "insertion_order": entry_data.get("insertion_order", 0), # Caller should set this ideally
                    "image_uuid": entry_data.get("image_uuid"),
                    "extensions_json": json.dumps(entry_data.get("extensions", {}))
                }

                new_db_entry = LoreEntryModel(**lore_entry_model_data)
                db.add(new_db_entry)
            
            db.commit()
            
            # Write back to PNG if requested
            if write_to_png:
                # We need to reload the character to get full state including new lore
                # Actually update_character calls _sync_character_lore if data is passed,
                # but here we just want to serialize existing DB state to PNG.
                # update_character already has logic to write to PNG from DB state.
                # So we can just call it with empty update?
                # Or reuse the logic.
                
                # Let's reuse the logic from update_character but without changing fields
                # We'll just trigger a "dummy" update to force PNG sync
                # Or better, replicate the PNG writing part since update_character takes a dict of updates
                self.update_character(character_uuid, {}, write_to_png=True)
                
            return True

    def get_character_by_uuid(self, character_uuid: str, db: Session) -> Optional[CharacterModel]:
        return db.query(CharacterModel).filter(CharacterModel.character_uuid == character_uuid).first()

    def get_character_by_path(self, png_file_path: str, db: Session) -> Optional[CharacterModel]:
        return db.query(CharacterModel).filter(CharacterModel.png_file_path == str(Path(png_file_path).resolve())).first()

    def delete_character_by_path(self, png_file_path: str, delete_png_file: bool = False) -> bool:
        """Deletes a character by its PNG file path. If not found in DB, optionally deletes the file."""
        resolved_path = str(Path(png_file_path).resolve())

        # First try DB deletion (by UUID) to ensure cascades happen properly
        with self._get_session_context() as db:
            db_char = self.get_character_by_path(resolved_path, db)
            uuid_to_delete = db_char.character_uuid if db_char else None

        if uuid_to_delete:
            return self.delete_character(uuid_to_delete, delete_png_file=delete_png_file)

        # If no DB row exists, optionally delete the file directly
        if delete_png_file:
            try:
                Path(resolved_path).unlink(missing_ok=True)
                self.logger.log_info(f"Deleted PNG file by path (no DB row found): {resolved_path}")
                return True
            except Exception as e:
                self.logger.log_error(f"Failed to delete PNG file by path {resolved_path}: {e}")
                return False

        return False

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

    def get_all_characters(self, skip: int = 0, limit: Optional[int] = None) -> List[CharacterModel]:
        with self._get_session_context() as db:
            query = db.query(CharacterModel).offset(skip)
            if limit is not None:
                query = query.limit(limit)
            return query.all()

    def count_all_characters(self) -> int:
        with self._get_session_context() as db:
            return db.query(CharacterModel).count()

    def update_character(self, character_uuid: str, character_data: Dict[str, Any], write_to_png: bool = True) -> Optional[CharacterModel]:
        """Updates a character in the DB and optionally writes back to PNG."""
        with self._get_session_context() as db:
            db_char = self.get_character_by_uuid(character_uuid, db)
            if not db_char:
                return None

            # Map frontend keys to DB keys if present
            key_mapping = {
                "extensions": "extensions_json",
                "alternate_greetings": "alternate_greetings_json",
                "combat_stats": "combat_stats_json"
            }
            
            for frontend_key, db_key in key_mapping.items():
                if frontend_key in character_data:
                    character_data[db_key] = character_data.pop(frontend_key)

            # Update DB fields
            json_fields = ["tags", "extensions_json", "alternate_greetings_json", "combat_stats_json"]
            for key, value in character_data.items():
                if hasattr(db_char, key):
                    # Special handling for JSON fields
                    if key in json_fields:
                        default = [] if key in ["tags", "alternate_greetings_json"] else {}
                        setattr(db_char, key, _as_json_str(value if value is not None else default))
                    else:
                        setattr(db_char, key, value)
            db_char.updated_at = datetime.datetime.utcnow()
            db_char.db_metadata_last_synced_at = datetime.datetime.utcnow()
            
            # Clear is_incomplete flag when character is saved with valid metadata
            # Character is considered complete when it has at least a name and description
            if db_char.name and (db_char.description or db_char.first_mes):
                db_char.is_incomplete = False

            # Sync lore if provided in character_data
            if "character_book" in character_data and isinstance(character_data["character_book"], dict):
                self._sync_character_lore(character_uuid, character_data["character_book"], db)

            if write_to_png:
                # Reconstruct metadata for PNG with all fields
                png_metadata_to_write = {
                    "spec": "chara_card_v2",
                    "spec_version": db_char.spec_version or "2.0",
                    "data": {
                        "name": db_char.name,
                        "description": db_char.description,
                        "personality": db_char.personality,
                        "scenario": db_char.scenario,
                        "first_mes": db_char.first_mes,
                        "mes_example": db_char.mes_example,
                        "character_uuid": db_char.character_uuid,
                        "tags": self._safe_json_load(db_char.tags, [], "tags", character_uuid),
                        "extensions": self._safe_json_load(db_char.extensions_json, {}, "extensions_json", character_uuid),
                        # Additional character card fields
                        "alternate_greetings": self._safe_json_load(db_char.alternate_greetings_json, [], "alternate_greetings_json", character_uuid),
                        "creator_notes": db_char.creator_notes,
                        "system_prompt": db_char.system_prompt,
                        "post_history_instructions": db_char.post_history_instructions,
                        "creator": db_char.creator,
                        "character_version": db_char.character_version,
                        "combat_stats": self._safe_json_load(db_char.combat_stats_json, None, "combat_stats_json", character_uuid),
                    },
                    "creatorcomment": db_char.creator_comment
                }
                # Add character_book reconstruction here
                lore_book = db.query(LoreBookModel).filter(LoreBookModel.character_uuid == character_uuid).first()
                if lore_book:
                    entries_for_png = []
                    for entry in lore_book.entries:
                        entry_dict = {
                            "id": entry.id,
                            "keys": self._safe_json_load(entry.keys_json, [], "keys_json", character_uuid),
                            "secondary_keys": self._safe_json_load(entry.secondary_keys_json, [], "secondary_keys_json", character_uuid),
                            "content": entry.content,
                            "comment": entry.comment,
                            "enabled": entry.enabled,
                            "position": entry.position,
                            "selective": entry.selective,
                            "insertion_order": entry.insertion_order,
                            "image_uuid": entry.image_uuid,
                            "extensions": self._safe_json_load(entry.extensions_json, {}, "lore_entry_extensions_json", character_uuid)
                        }
                        entries_for_png.append(entry_dict)
                    png_metadata_to_write["data"]["character_book"] = {
                        "name": lore_book.name,
                        "entries": entries_for_png
                    }

                try:
                    self.png_handler.write_metadata_to_png(db_char.png_file_path, png_metadata_to_write)
                    self.logger.log_info(f"Successfully wrote metadata back to PNG: {db_char.png_file_path}")
                except Exception as e:
                    self.logger.log_error(f"Failed to write metadata to PNG {db_char.png_file_path}: {e}")
                    # Decide if DB commit should proceed if PNG write fails. For now, it will.

            db.commit()
            db.refresh(db_char)
            return db_char

    def create_character(self, character_data: Dict[str, Any], png_file_path_str: str, write_to_png: bool = True) -> CharacterModel:
        """Creates a new character in DB and saves a new PNG."""
        with self._get_session_context() as db:
            abs_png_path = str(Path(png_file_path_str).resolve())
            
            # Ensure character_uuid is present, generate if not
            char_uuid = character_data.get("character_uuid", str(uuid.uuid4()))
            character_data["character_uuid"] = char_uuid # Ensure it's in the data for PNG
            
            db_char = CharacterModel(
                character_uuid=char_uuid,
                png_file_path=abs_png_path,
                name=character_data.get("name", Path(abs_png_path).stem),
                description=character_data.get("description"),
                personality=character_data.get("personality"),
                scenario=character_data.get("scenario"),
                first_mes=character_data.get("first_mes"),
                mes_example=character_data.get("mes_example"),
                creator_comment=character_data.get("creatorcomment"),
                tags=_as_json_str(character_data.get("tags", [])),
                spec_version=character_data.get("spec_version", "2.0"),
                extensions_json=_as_json_str(character_data.get("extensions", {})),
                # New fields from character card spec
                alternate_greetings_json=_as_json_str(character_data.get("alternate_greetings", [])),
                creator_notes=character_data.get("creator_notes"),
                system_prompt=character_data.get("system_prompt"),
                post_history_instructions=character_data.get("post_history_instructions"),
                creator=character_data.get("creator"),
                character_version=character_data.get("character_version"),
                combat_stats_json=_as_json_str(character_data.get("combat_stats")) if character_data.get("combat_stats") else None,
                db_metadata_last_synced_at=datetime.datetime.utcnow(),
                updated_at=datetime.datetime.utcnow(),
                created_at=datetime.datetime.utcnow()
            )
            db.add(db_char)
            db.flush() # Ensure the row is visible to subsequent queries
            
            # Handle lore book from character_data if present
            if "character_book" in character_data and isinstance(character_data["character_book"], dict):
                self._sync_character_lore(char_uuid, character_data["character_book"], db)

        if write_to_png:
            # Prepare metadata for PNG with all fields
            png_metadata_to_write = {
                "spec": "chara_card_v2",
                "spec_version": db_char.spec_version,
                "data": {
                    "name": db_char.name,
                    "description": db_char.description,
                    "personality": db_char.personality,
                    "scenario": db_char.scenario,
                    "first_mes": db_char.first_mes,
                    "mes_example": db_char.mes_example,
                    "character_uuid": db_char.character_uuid,
                    "tags": self._safe_json_load(db_char.tags, [], "tags", db_char.character_uuid),
                    "extensions": self._safe_json_load(db_char.extensions_json, {}, "extensions_json", db_char.character_uuid),
                    # Additional character card fields
                    "alternate_greetings": self._safe_json_load(db_char.alternate_greetings_json, [], "alternate_greetings_json", db_char.character_uuid),
                    "creator_notes": db_char.creator_notes,
                    "system_prompt": db_char.system_prompt,
                    "post_history_instructions": db_char.post_history_instructions,
                    "creator": db_char.creator,
                    "character_version": db_char.character_version,
                    "combat_stats": self._safe_json_load(db_char.combat_stats_json, None, "combat_stats_json", db_char.character_uuid),
                },
                "creatorcomment": db_char.creator_comment
            }
            if "character_book" in character_data: # Add reconstructed book if it was processed
                 png_metadata_to_write["data"]["character_book"] = character_data["character_book"]


            # Create dummy PNG if it doesn't exist, or overwrite if allowed
            # For simplicity, assume PngMetadataHandler can create/overwrite
            try:
                # Ensure parent directory exists for the new PNG
                Path(abs_png_path).parent.mkdir(parents=True, exist_ok=True)
                self.png_handler.write_metadata_to_png(abs_png_path, png_metadata_to_write, create_if_not_exists=True)
                self.logger.log_info(f"Successfully created/updated PNG: {abs_png_path}")
            except Exception as e:
                self.logger.log_error(f"Failed to create/write PNG {abs_png_path}: {e}")
            # If PNG write fails, should we roll back DB? For now, DB commit will proceed.
        
            db.commit()
            db.refresh(db_char)
            return db_char

    def delete_character(self, character_uuid: str, delete_png_file: bool = False) -> bool:
        """Deletes a character from DB and optionally its PNG file."""
        with self._get_session_context() as db:
            db_char = self.get_character_by_uuid(character_uuid, db)
            if not db_char:
                return False
            
            png_path_to_delete = db_char.png_file_path
            
            db.delete(db_char) # Cascade should handle lore_books and related lore_entries

            if delete_png_file:
                try:
                    Path(png_path_to_delete).unlink(missing_ok=True)
                    self.logger.log_info(f"Deleted PNG file: {png_path_to_delete}")
                except Exception as e:
                    self.logger.log_error(f"Failed to delete PNG file {png_path_to_delete}: {e}")
            
            db.commit()
            return True

    def save_uploaded_character_card(
        self,
        raw_character_card_data: Dict[str, Any],
        image_bytes: bytes,
        original_filename: str
    ) -> Optional[CharacterModel]:
        """
        Handles saving a new or updated character card from an upload.
        - Determines if create or update based on character_uuid in raw_character_card_data.
        - Generates UUID if new and not provided.
        - Determines save path using SettingsManager.
        - Handles filename sanitization and collision for new files.
        - Embeds metadata into PNG.
        - Saves PNG to disk.
        - Creates or updates character record in DB, including lore.
        Returns the saved/updated CharacterModel or None on failure.
        """
        self.logger.log_info(f"Service: save_uploaded_character_card for original_filename: {original_filename}")

        try:
            # 1. Extract and Validate/Generate Character UUID
            data_section = raw_character_card_data.get("data", {})
            
            # Try to get UUID from 'data.character_uuid' first, then top-level 'character_uuid'
            provided_uuid_str = data_section.get("character_uuid", raw_character_card_data.get("character_uuid"))
            
            final_uuid_str: Optional[str] = None
            is_update = False
            existing_db_char: Optional[CharacterModel] = None

            if provided_uuid_str:
                try:
                    uuid.UUID(str(provided_uuid_str)) # Validate format
                    final_uuid_str = str(provided_uuid_str)
                    # Check if character exists in DB using proper session context
                    with self._get_session_context() as db:
                        existing_db_char = self.get_character_by_uuid(final_uuid_str, db)
                    if existing_db_char:
                        is_update = True
                        self.logger.log_info(f"Service: Will update existing character UUID: {final_uuid_str}")
                    else:
                        self.logger.log_info(f"Service: Provided UUID {final_uuid_str} not in DB. Will create new character with this UUID.")
                except ValueError:
                    self.logger.log_warning(f"Service: Invalid UUID '{provided_uuid_str}' in metadata. Generating new one.")
                    final_uuid_str = str(uuid.uuid4())
            else:
                final_uuid_str = str(uuid.uuid4())
                self.logger.log_info(f"Service: No UUID in metadata, generated new UUID: {final_uuid_str}")

            # Ensure the final UUID is correctly placed in the metadata for embedding
            if isinstance(data_section, dict):
                data_section["character_uuid"] = final_uuid_str
            else: # Ensure data section exists if it didn't
                data_section = {"character_uuid": final_uuid_str}
            raw_character_card_data["data"] = data_section
            raw_character_card_data["character_uuid"] = final_uuid_str # Also at top level for some specs

            # 2. Determine Character Name for Filename
            char_name_from_meta = data_section.get("name", raw_character_card_data.get("name"))
            if not char_name_from_meta: # Fallback name if not in metadata
                char_name_from_meta = Path(original_filename).stem if original_filename else f"character_{final_uuid_str[:8]}"
            
            sanitized_name = re.sub(r'[\\/*?:"<>|]', "", char_name_from_meta)
            sanitized_name = sanitized_name[:100] if sanitized_name else f"character_{final_uuid_str[:8]}"

            # 3. Determine Save Directory and Path
            # Use the first configured character directory.
            # TODO: Allow user to choose which configured directory if multiple exist, or use a primary.
            character_dirs = self._get_character_dirs()
            if not character_dirs: # Should not happen if _get_character_dirs has a fallback
                self.logger.log_error("Service: No character directories configured or found.")
                raise ValueError("Character directory not configured.")
            
            save_directory = Path(character_dirs[0]) # Use the first directory
            save_directory.mkdir(parents=True, exist_ok=True)

            save_png_path: Path
            if is_update and existing_db_char and existing_db_char.png_file_path:
                save_png_path = Path(existing_db_char.png_file_path)
                # Ensure parent directory of existing path exists
                save_png_path.parent.mkdir(parents=True, exist_ok=True)
                self.logger.log_info(f"Service: Will update existing PNG at: {save_png_path}")
            else: # New character or existing character needs a new path
                base_filename = f"{sanitized_name}.png"
                save_png_path = save_directory / base_filename
                counter = 1
                while save_png_path.exists(): # Handle filename collision for new files
                    save_png_path = save_directory / f"{sanitized_name}_{counter}.png"
                    counter += 1
                self.logger.log_info(f"Service: New character, proposed save path: {save_png_path}")
            
            abs_save_png_path = str(save_png_path.resolve())

            # 4. Embed metadata into PNG
            try:
                final_image_bytes_with_meta = self.png_handler.write_metadata(image_bytes, raw_character_card_data)
                self.logger.log_info("Service: Successfully embedded metadata into PNG bytes for saving.")
            except Exception as e:
                self.logger.log_error(f"Service: Failed to embed metadata into PNG: {e}", exc_info=True)
                raise # Re-raise to be caught by endpoint

            # 5. Save PNG to disk
            try:
                with open(save_png_path, "wb") as f:
                    f.write(final_image_bytes_with_meta)
                self.logger.log_info(f"Service: Successfully saved character PNG to: {abs_save_png_path}")
            except IOError as e:
                self.logger.log_error(f"Service: Failed to save character PNG to disk at {abs_save_png_path}: {e}", exc_info=True)
                raise # Re-raise
            
            # 6. Create or Update DB Record using proper session context
            # Ensure all fields for CharacterModel are extracted from raw_character_card_data
            db_data = {
                "name": char_name_from_meta, # Use the determined name
                "description": data_section.get("description"),
                "personality": data_section.get("personality"),
                "scenario": data_section.get("scenario"),
                "first_mes": data_section.get("first_mes"),
                "mes_example": data_section.get("mes_example"),
                "creator_comment": raw_character_card_data.get("creatorcomment"), # From top level of card spec
                "tags": _as_json_str(data_section.get("tags", [])),
                "spec_version": raw_character_card_data.get("spec_version", "2.0"),
                "extensions_json": _as_json_str(data_section.get("extensions", {})),
                # New fields from character card spec
                "alternate_greetings_json": _as_json_str(data_section.get("alternate_greetings", [])),
                "creator_notes": data_section.get("creator_notes"),
                "system_prompt": data_section.get("system_prompt"),
                "post_history_instructions": data_section.get("post_history_instructions"),
                "creator": data_section.get("creator"),
                "character_version": data_section.get("character_version"),
                "combat_stats_json": _as_json_str(data_section.get("combat_stats")) if data_section.get("combat_stats") else None,
                "png_file_path": abs_save_png_path,
                "db_metadata_last_synced_at": datetime.datetime.utcnow(),
                "updated_at": datetime.datetime.utcnow()
            }

            # Use proper database session context
            with self._get_session_context() as db:
                saved_db_model: CharacterModel
                if is_update and existing_db_char:
                    self.logger.log_info(f"Service: Updating DB for character UUID: {final_uuid_str}")
                    # Update existing_db_char instance
                    for key, value in db_data.items():
                        setattr(existing_db_char, key, value)
                    # original_character_id should not change on update typically
                    db.add(existing_db_char) # Add to session to mark as dirty
                    saved_db_model = existing_db_char
                else: # Create new
                    self.logger.log_info(f"Service: Creating new DB record for character UUID: {final_uuid_str}")
                    db_data["character_uuid"] = final_uuid_str
                    db_data["created_at"] = datetime.datetime.utcnow()
                    # original_character_id could be the initial file path if it's a first-time import of an external file
                    # For cards created *within* CardShark, original_character_id might be null or same as png_file_path.
                    db_data["original_character_id"] = data_section.get("original_character_id", abs_save_png_path if not is_update else None)

                    new_char_model = CharacterModel(**db_data)
                    db.add(new_char_model)
                    saved_db_model = new_char_model
                
                db.flush() # Ensure IDs are available for lore sync, and model is populated

                # 7. Sync Lore
                self._sync_character_lore(final_uuid_str, data_section.get("character_book", {}), db)

                db.commit()
                db.refresh(saved_db_model) # Get any DB-generated values like auto-increments (not used here but good practice)
                self.logger.log_info(f"Service: Character {'updated' if is_update else 'created'} in DB: {final_uuid_str}")
                return saved_db_model

        except Exception as e:
            self.logger.log_error(f"Service: General error in save_uploaded_character_card: {e}", exc_info=True)
            return None

    def duplicate_character(self, character_uuid: str, new_name: Optional[str] = None) -> Optional[CharacterModel]:
        """
        Duplicates a character by creating a copy with a new UUID and filename.
        
        Args:
            character_uuid: UUID of the character to duplicate
            new_name: Optional new name for the duplicated character
            
        Returns:
            The duplicated CharacterModel or None if the original character wasn't found
        """
        self.logger.log_info(f"Duplicating character {character_uuid} with new_name: {new_name}")
        
        try:
            # Get the original character
            with self._get_session_context() as db:
                original_char = self.get_character_by_uuid(character_uuid, db)
                if not original_char:
                    self.logger.log_warning(f"Character {character_uuid} not found for duplication")
                    return None
                
                # Read the original PNG metadata
                if not original_char.png_file_path or not Path(original_char.png_file_path).exists():
                    self.logger.log_error(f"Original character PNG file not found: {original_char.png_file_path}")
                    return None
                
                # Read the original PNG file
                with open(original_char.png_file_path, 'rb') as f:
                    original_image_bytes = f.read()
                
                # Read metadata from the original PNG
                original_metadata = self.png_handler.read_metadata(original_char.png_file_path)
                if not original_metadata:
                    original_metadata = {}
                
                # Generate new UUID for the duplicate
                new_uuid = str(uuid.uuid4())
                
                # Determine new name
                if new_name:
                    duplicate_name = new_name
                else:
                    duplicate_name = f"{original_char.name}_copy"
                
                # Update metadata with new UUID and name
                if "data" not in original_metadata:
                    original_metadata["data"] = {}
                
                original_metadata["data"]["character_uuid"] = new_uuid
                original_metadata["data"]["name"] = duplicate_name
                
                # Create the duplicate using save_uploaded_character_card
                # which handles all the PNG saving and DB creation logic
                duplicated_char = self.save_uploaded_character_card(
                    raw_character_card_data=original_metadata,
                    image_bytes=original_image_bytes,
                    original_filename=f"{duplicate_name}.png"
                )
                
                if duplicated_char:
                    self.logger.log_info(f"Successfully duplicated character {character_uuid} as {new_uuid}")
                    return duplicated_char
                else:
                    self.logger.log_error(f"Failed to save duplicated character")
                    return None
                    
        except Exception as e:
            self.logger.log_error(f"Error duplicating character {character_uuid}: {e}")
            return None

    def clear_all_characters(self) -> bool:
        """
        Clears all characters from the database.
        This is useful when the character directory changes and we want to rebuild the database.
        Returns True if successful, False otherwise.
        """
        try:
            with self.db_session_generator() as db:
                # Delete all characters (cascade should handle related lore_books, lore_entries, etc.)
                deleted_count = db.query(CharacterModel).delete()
                db.commit()
                self.logger.log_info(f"Cleared {deleted_count} characters from database")
                return True
        except Exception as e:
            self.logger.log_error(f"Failed to clear characters from database: {e}")
            return False
