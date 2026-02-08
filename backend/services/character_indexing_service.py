# backend/services/character_indexing_service.py
import asyncio
import datetime
import os
from pathlib import Path
from typing import List, Dict, Set
from asyncio import to_thread

from backend.errors import CardSharkError

from backend.sql_models import Character as CharacterModel
from backend.utils.path_utils import normalize_path, paths_are_equal, is_pyinstaller_bundle
from backend.services.character_deduplication_service import CharacterDeduplicationService


class CharacterIndexingService:
    """Service for indexing characters from database and patching with directory changes"""
    
    def __init__(self, character_service, settings_manager, logger):
        self.character_service = character_service
        self.settings_manager = settings_manager
        self.logger = logger
        self.deduplication_service = CharacterDeduplicationService(logger, character_service.db_session_generator)
    
    async def get_characters_with_directory_sync(self) -> List[CharacterModel]:
        """
        Get characters from database first, then patch with any changes from directories.
        This is called on Character Gallery page load.
        Returns actual CharacterModel objects for API compatibility.
        """
        try:
            self.logger.log_info("Loading characters from database with directory sync")
            
            # Step 1: Get all characters from database quickly
            db_characters = await to_thread(self.character_service.get_all_characters)
            
            # Step 2: Get character directories to check for new/changed files
            character_dirs = await to_thread(self.character_service._get_character_dirs)
            
            # Step 3: Build a map of existing characters by normalized file path for quick lookup
            db_char_map = {}
            for char in db_characters:
                if getattr(char, "png_file_path", None):
                    norm_path = normalize_path(char.png_file_path)
                    if os.name == 'nt':
                        norm_path = norm_path.lower()
                    db_char_map[norm_path] = char
            
            # Step 4: Scan directories for changes (in background thread)
            directory_changes = await to_thread(
                self._scan_directories_for_changes, 
                character_dirs, 
                db_char_map
            )
            
            # Step 5: Apply any changes found
            if directory_changes['new_files'] or directory_changes['modified_files']:
                await self._apply_directory_changes(directory_changes)
                # Refresh the character list to include new changes
                db_characters = await to_thread(self.character_service.get_all_characters)
            
            # Step 6: Clean up any deleted files
            if directory_changes['deleted_files']:
                await self._cleanup_deleted_files(directory_changes['deleted_files'])
                # Refresh again after cleanup
                db_characters = await to_thread(self.character_service.get_all_characters)
            
            # Step 7: Perform deduplication cleanup
            await self._perform_deduplication_cleanup(db_characters)
            
            # Final refresh to get clean character list
            db_characters = await to_thread(self.character_service.get_all_characters)
            
            self.logger.log_info(f"Loaded {len(db_characters)} characters with directory sync")
            return db_characters
            
        except Exception as e:
            self.logger.log_error(f"Failed to get characters with directory sync: {e}")            # Fallback to just database characters
            try:
                db_characters = await to_thread(self.character_service.get_all_characters)
                return db_characters
            except Exception as fallback_error:
                self.logger.log_error(f"Fallback also failed: {fallback_error}")
                return []
    
    def _scan_directories_for_changes(self, character_dirs: List[str], db_char_map: Dict) -> Dict:
        """
        Scan character directories and compare with database to find changes.
        This runs in a background thread to avoid blocking.
        """
        changes = {
            'new_files': [],
            'modified_files': [],
            'deleted_files': []
        }
        
        # Track all files we find in directories
        files_found = set()
        
        for dir_path in character_dirs:
            try:
                dir_obj = Path(dir_path)
                if not dir_obj.exists():
                    continue
                
                # Scan for PNG files
                for png_file in dir_obj.glob("*.png"):
                    # Resolve to absolute path first to avoid relative path confusion
                    abs_path = png_file.resolve()
                    file_path = str(abs_path)
                    
                    # Normalize path (handling slashes)
                    normalized_file_path = normalize_path(file_path)
                    
                    # On Windows, filesystem is case-insensitive.
                    # normalize_path might not lower-case it, but DB might have different casing.
                    # Best practice for deduplication map keys is to lower-case them on Windows.
                    if os.name == 'nt': 
                         normalized_file_path = normalized_file_path.lower()

                    files_found.add(normalized_file_path)
                    
                    # Get file modification time
                    try:
                        file_mod_time = datetime.datetime.fromtimestamp(png_file.stat().st_mtime)
                    except (OSError, IOError):
                        continue
                    
                    # Check if file is in database
                    if normalized_file_path in db_char_map:
                        # File exists in DB, check if it's been modified
                        db_char = db_char_map[normalized_file_path]
                        
                        # Compare modification times
                        if (not db_char.db_metadata_last_synced_at or 
                            db_char.db_metadata_last_synced_at < file_mod_time):
                            changes['modified_files'].append(file_path)
                    else:
                        # New file not in database
                        changes['new_files'].append(file_path)
                        
            except Exception as e:
                self.logger.log_error(f"Error scanning directory {dir_path}: {e}")
        
        # Find deleted files (in DB but not found in directories)
        for normalized_db_path, db_char in db_char_map.items():
            if normalized_db_path not in files_found:
                # Double-check that file doesn't exist using original path
                original_path = db_char.png_file_path
                if not Path(original_path).exists():
                    changes['deleted_files'].append(original_path)
        
        self.logger.log_info(
            f"Directory scan found: {len(changes['new_files'])} new, "
            f"{len(changes['modified_files'])} modified, "
            f"{len(changes['deleted_files'])} deleted files"
        )
        
        return changes
    
    async def _apply_directory_changes(self, changes: Dict):
        """Apply new and modified files to the database"""
        
        # Process new files
        for file_path in changes['new_files']:
            try:
                await self._sync_single_file(file_path, is_new=True)
            except Exception as e:
                self.logger.log_error(f"Failed to sync new file {file_path}: {e}")
        
        # Process modified files
        for file_path in changes['modified_files']:
            try:
                await self._sync_single_file(file_path, is_new=False)
            except Exception as e:
                self.logger.log_error(f"Failed to sync modified file {file_path}: {e}")
    
    async def _cleanup_deleted_files(self, deleted_files: List[str]):
        """Remove deleted files from database"""
        # We need to run this in a thread because it involves DB operations
        await to_thread(self._cleanup_deleted_files_sync, deleted_files)

    def _cleanup_deleted_files_sync(self, deleted_files: List[str]):
        """Synchronous implementation of cleanup"""
        # Use a single session for lookups
        try:
             with self.character_service._get_session_context() as db:
                for file_path in deleted_files:
                    try:
                        char_to_delete = self.character_service.get_character_by_path(file_path, db)
                        
                        if char_to_delete:
                            # Note: delete_character manages its own session/transaction
                            # We should probably get the UUID, close our lookup session (or just use the UUID), 
                            # and then call delete_character.
                            # However, reusing the object across sessions might be tricky if it's attached.
                            # Best to get the UUID, then call delete.
                            uuid_to_delete = char_to_delete.character_uuid
                            
                            # Log first
                            self.logger.log_info(f"Removing deleted character from database: {file_path} (UUID: {uuid_to_delete})")
                            
                            # Call delete_character (which handles its own session)
                            # We don't verify success here as it logs errors itself
                            self.character_service.delete_character(
                                uuid_to_delete,
                                delete_png_file=False 
                            )
                    except Exception as e:
                        self.logger.log_error(f"Failed to cleanup deleted character {file_path}: {e}")
        except Exception as session_error:
             self.logger.log_error(f"Session error during cleanup: {session_error}")
    
    async def _sync_single_file(self, file_path: str, is_new: bool = False):
        """Sync a single character file to the database"""
        try:
            # Convert to absolute path and normalize
            abs_file_path = normalize_path(file_path)
            png_file = Path(abs_file_path)
            if not png_file.exists():
                return
              # Read metadata in thread to avoid blocking event loop
            try:
                metadata = await to_thread(
                    self.character_service.png_handler.read_metadata, abs_file_path
                )
            except CardSharkError as e:
                self.logger.log_warning(f"CardSharkError processing PNG file {file_path}: {e} - Creating incomplete character stub.")
                metadata = None  # Treat as incomplete character
            
            # Determine if this is an incomplete character (no valid metadata)
            is_incomplete = not metadata or not metadata.get("data")
            
            if is_incomplete:
                self.logger.log_info(f"No valid metadata in {file_path} - creating incomplete character stub for editing.")
            
            # Extract or generate UUID
            character_uuid = await to_thread(
                self.deduplication_service.extract_uuid_from_png, abs_file_path
            )
            if not character_uuid:
                import uuid
                character_uuid = str(uuid.uuid4())
                self.logger.log_info(f"Generated new UUID {character_uuid} for {file_path}")
            
            if is_new:
                # Create database record pointing to the existing file (avoid filename collision logic)
                await self._create_database_record_for_existing_file(file_path, metadata, is_incomplete)
                self.logger.log_info(f"Added new character: {file_path}{' (incomplete)' if is_incomplete else ''}")
            else:
                # Update existing character — lookup + update in a single sync call with db session
                def _update_existing():
                    with self.character_service._get_session_context() as db:
                        existing_char = self.character_service.get_character_by_path(file_path, db)
                        if existing_char:
                            self.character_service.update_character(
                                existing_char.character_uuid,
                                metadata,
                                False  # write_to_png=False
                            )
                            return True
                    return False
                updated = await to_thread(_update_existing)
                if updated:
                    self.logger.log_info(f"Updated character: {file_path}")
            
        except Exception as e:
            self.logger.log_error(f"Failed to sync single file {file_path}: {e}")
    
    def _character_to_dict(self, char: CharacterModel) -> Dict:
        """Convert character model to dictionary for frontend"""
        return {
            'character_uuid': char.character_uuid,
            'name': char.name,
            'description': char.description,
            'file_path': char.file_path,
            'image_url': f"/api/character-image/{char.character_uuid}" if char.character_uuid else None,
            'created_at': char.created_at.isoformat() if char.created_at else None,
            'updated_at': char.updated_at.isoformat() if char.updated_at else None,
            'db_metadata_last_synced_at': char.db_metadata_last_synced_at.isoformat() if char.db_metadata_last_synced_at else None,
            # Add any other fields the frontend needs
        }
    
    async def perform_full_sync(self):
        """
        Perform a full synchronization of all character directories.
        This can be called manually if needed, but normally the directory sync 
        on page load should be sufficient.
        """
        try:
            self.logger.log_info("Starting full character directory synchronization")
            await to_thread(self.character_service.sync_character_directories)
            self.logger.log_info("Full character directory synchronization completed")
            
        except Exception as e:
            self.logger.log_error(f"Full sync failed: {e}")
    
    async def get_indexing_status(self) -> Dict:
        """Get the current status of the indexing service"""
        total_characters = await to_thread(self.character_service.count_all_characters)
        character_dirs = await to_thread(self.character_service._get_character_dirs)
        
        return {
            "indexing_method": "database_first_with_directory_patch",
            "total_characters": total_characters,
            "character_directories": character_dirs,
            "description": "Characters loaded from database, patched with directory changes on page load"
        }
    
    async def _create_database_record_for_existing_file(self, file_path: str, metadata: Dict, is_incomplete: bool = False):
        """Create database record pointing to existing PNG file without creating new PNG files"""
        try:
            from backend.sql_models import Character as CharacterModel
            import datetime
            import uuid
            import json
            
            # Handle case where metadata is None for incomplete characters
            metadata = metadata or {}
            data_section = metadata.get("data", {})
            char_name = data_section.get("name")
            if not char_name:
                # Extract name from filename, removing trailing _\d+ if present
                import re
                stem_name = Path(file_path).stem
                match = re.match(r"^(.*?)(_\d+)?$", stem_name)
                if match:
                    char_name = match.group(1)
                else:
                    char_name = stem_name
            
            # Get or generate UUID
            abs_file_path = str(Path(file_path).resolve())
            char_uuid = None
            
            # Only try to extract UUID from PNG if we have valid metadata
            if not is_incomplete:
                char_uuid = await to_thread(
                    self.deduplication_service.extract_uuid_from_png, abs_file_path
                )
            
            if not char_uuid:
                char_uuid = str(uuid.uuid4())
                self.logger.log_info(f"Generated new UUID {char_uuid} for character: {char_name}")
            
            # Check for UUID duplicates
            uuid_duplicate = await to_thread(
                self._check_uuid_duplicate, char_uuid, abs_file_path
            )
            if uuid_duplicate:
                self.logger.log_warning(
                    f"Found UUID duplicate: {uuid_duplicate.png_file_path} and {abs_file_path} "
                    f"both have UUID {char_uuid}"
                )
            
            def _as_json_str(data):
                """Helper to safely convert data to JSON string"""
                if data is None:
                    return None
                if isinstance(data, str):
                    return data
                try:
                    return json.dumps(data)
                except (TypeError, ValueError):
                    return str(data)
            
            db_char = CharacterModel(
                character_uuid=char_uuid,
                name=char_name,
                png_file_path=abs_file_path,
                description=data_section.get("description"),
                personality=data_section.get("personality"),
                scenario=data_section.get("scenario"),
                first_mes=data_section.get("first_mes"),
                mes_example=data_section.get("mes_example"),
                creator_comment=metadata.get("creatorcomment"),
                tags=_as_json_str(data_section.get("tags", [])),
                spec_version=metadata.get("spec_version", "2.0") if not is_incomplete else None,
                extensions_json=_as_json_str(data_section.get("extensions", {})),
                # New fields from character card spec
                alternate_greetings_json=_as_json_str(data_section.get("alternate_greetings", [])),
                creator_notes=data_section.get("creator_notes"),
                system_prompt=data_section.get("system_prompt"),
                post_history_instructions=data_section.get("post_history_instructions"),
                creator=data_section.get("creator"),
                character_version=data_section.get("character_version"),
                combat_stats_json=_as_json_str(data_section.get("combat_stats")) if data_section.get("combat_stats") else None,
                is_incomplete=is_incomplete,
                db_metadata_last_synced_at=datetime.datetime.utcnow(),
                updated_at=datetime.datetime.utcnow(),
                created_at=datetime.datetime.utcnow()
            )
            
            # Add to database using the character service's session
            await to_thread(self._add_character_to_db, db_char)
            
            self.logger.log_info(f"Successfully added existing character to database with UUID: {char_uuid}")
            
        except Exception as e:
            # Check if this is a UUID duplicate (not a real error)
            error_str = str(e).lower()
            if 'unique constraint' in error_str and 'character_uuid' in error_str:
                self.logger.log_step(
                    f"Skipping duplicate character file (UUID already exists): {file_path}",
                    level=0  # DEBUG level
                )
            else:
                # This is a real error
                self.logger.log_error(f"Failed to create database record for {file_path}: {e}")

    def _add_character_to_db(self, db_char):
        """Helper method to add character to database in sync context"""
        try:
            # Use the character service's database session
            with self.character_service._get_session_context() as db:
                db.add(db_char)
                db.commit()
                db.refresh(db_char)
        except Exception as e:
            # Check if this is a UUID duplicate (not a real error, just means we already have this character)
            error_str = str(e).lower()
            if 'unique constraint' in error_str and 'character_uuid' in error_str:
                self.logger.log_step(
                    f"Skipping duplicate character (UUID {db_char.character_uuid} already exists): {db_char.png_file_path}",
                    level=0  # DEBUG level - not shown in console
                )
                # Don't raise - this is expected when we have duplicate characters
                return
            else:
                # This is a real error
                self.logger.log_error(f"Failed to add character to database: {e}")
                raise
    
    def _check_uuid_duplicate(self, character_uuid: str, file_path: str):
        """Check if UUID already exists for a different file"""
        try:
            with self.character_service._get_session_context() as db:
                return db.query(CharacterModel).filter(
                    CharacterModel.character_uuid == character_uuid,
                    CharacterModel.png_file_path != file_path
                ).first()
        except Exception as e:
            self.logger.log_error(f"Failed to check UUID duplicate: {e}")
            return None
    
    async def _perform_deduplication_cleanup(self, characters: List[CharacterModel]):
        """Perform comprehensive deduplication cleanup"""
        try:
            self.logger.log_info("Starting deduplication cleanup")
            
            # Run deduplication in background thread
            uuid_removed, path_removed = await to_thread(
                self.deduplication_service.cleanup_duplicates, characters
            )
            
            if uuid_removed > 0 or path_removed > 0:
                self.logger.log_info(
                    f"Deduplication cleanup completed: removed {uuid_removed} UUID duplicates "
                    f"and {path_removed} path duplicates"
                )
            else:
                self.logger.log_info("No duplicates found during cleanup")
                
        except Exception as e:
            self.logger.log_error(f"Error during deduplication cleanup: {e}")
            # Don't raise - this is a cleanup operation that shouldn't break the main flow
