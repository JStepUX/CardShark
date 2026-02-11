"""Character deduplication service for handling duplicate character detection and resolution."""

import json
import uuid
import contextlib
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from datetime import datetime

from ..sql_models import Character as CharacterModel
from ..png_metadata_handler import PngMetadataHandler
from ..utils.path_utils import normalize_path, paths_are_equal


class CharacterDeduplicationService:
    """Service for detecting and resolving character duplicates."""
    
    def __init__(self, logger, db_session_generator):
        self.logger = logger
        self.db_session_generator = db_session_generator
        self.png_handler = PngMetadataHandler(logger)
    
    def find_duplicates_by_uuid(self, characters: List[CharacterModel]) -> Dict[str, List[CharacterModel]]:
        """
        Find characters with duplicate UUIDs.
        
        Args:
            characters: List of character models to check
            
        Returns:
            Dictionary mapping UUIDs to lists of characters with that UUID
        """
        uuid_map = {}
        
        for char in characters:
            if char.character_uuid:
                if char.character_uuid not in uuid_map:
                    uuid_map[char.character_uuid] = []
                uuid_map[char.character_uuid].append(char)
        
        # Return only UUIDs with multiple characters
        return {uuid_str: chars for uuid_str, chars in uuid_map.items() if len(chars) > 1}
    
    def find_duplicates_by_path(self, characters: List[CharacterModel]) -> Dict[str, List[CharacterModel]]:
        """
        Find characters with duplicate normalized paths.
        
        Args:
            characters: List of character models to check
            
        Returns:
            Dictionary mapping normalized paths to lists of characters with that path
        """
        path_map = {}
        
        for char in characters:
            if char.png_file_path:
                normalized_path = normalize_path(char.png_file_path)
                if normalized_path not in path_map:
                    path_map[normalized_path] = []
                path_map[normalized_path].append(char)
        
        # Return only paths with multiple characters
        return {path: chars for path, chars in path_map.items() if len(chars) > 1}
    
    def find_duplicates_by_name_and_content(self, characters: List[CharacterModel]) -> List[List[CharacterModel]]:
        """
        Find characters that are likely duplicates based on name and content similarity.
        
        Args:
            characters: List of character models to check
            
        Returns:
            List of lists, where each inner list contains likely duplicate characters
        """
        # Group by name first
        name_groups = {}
        for char in characters:
            name = char.name.strip().lower() if char.name else "unnamed"
            if name not in name_groups:
                name_groups[name] = []
            name_groups[name].append(char)
        
        duplicates = []
        
        # For each name group with multiple characters, check content similarity
        for name, chars in name_groups.items():
            if len(chars) > 1:
                # Simple content comparison - could be enhanced with more sophisticated matching
                content_groups = {}
                for char in chars:
                    # Create a simple content hash based on key fields
                    content_key = self._create_content_key(char)
                    if content_key not in content_groups:
                        content_groups[content_key] = []
                    content_groups[content_key].append(char)
                
                # Add groups with multiple characters as duplicates
                for content_chars in content_groups.values():
                    if len(content_chars) > 1:
                        duplicates.append(content_chars)
        
        return duplicates
    
    def _create_content_key(self, char: CharacterModel) -> str:
        """
        Create a content-based key for duplicate detection.
        
        Args:
            char: Character model
            
        Returns:
            String key representing character content
        """
        # Normalize and combine key content fields
        fields = [
            (char.description or "").strip()[:100],  # First 100 chars of description
            (char.personality or "").strip()[:100],  # First 100 chars of personality
            (char.scenario or "").strip()[:100],     # First 100 chars of scenario
            (char.first_mes or "").strip()[:100],    # First 100 chars of first message
        ]
        
        # Create a simple hash of the combined content
        content = "|".join(fields).lower()
        return str(hash(content))
    
    def resolve_uuid_duplicates(self, uuid_duplicates: Dict[str, List[CharacterModel]]) -> List[CharacterModel]:
        """
        Resolve UUID duplicates by keeping the most recent or complete record.
        
        Args:
            uuid_duplicates: Dictionary of UUID to duplicate characters
            
        Returns:
            List of characters to remove from database
        """
        to_remove = []
        
        for uuid_str, chars in uuid_duplicates.items():
            if len(chars) <= 1:
                continue
            
            self.logger.log_warning(f"Found {len(chars)} characters with UUID {uuid_str}")
            
            # Sort by preference: most recent sync time, then most complete data
            sorted_chars = sorted(chars, key=lambda c: (
                c.db_metadata_last_synced_at or datetime.min,
                len(c.description or "") + len(c.personality or ""),
                c.updated_at or datetime.min
            ), reverse=True)
            
            # Keep the first (best) character, mark others for removal
            keeper = sorted_chars[0]
            duplicates = sorted_chars[1:]
            
            self.logger.log_info(f"Keeping character {keeper.character_uuid} (path: {keeper.png_file_path})")

            for dup in duplicates:
                self.logger.log_info(f"Marking for removal: character {dup.character_uuid} (path: {dup.png_file_path})")
                to_remove.append(dup)
        
        return to_remove
    
    def resolve_path_duplicates(self, path_duplicates: Dict[str, List[CharacterModel]]) -> List[CharacterModel]:
        """
        Resolve path duplicates by keeping the most recent record.
        
        Args:
            path_duplicates: Dictionary of path to duplicate characters
            
        Returns:
            List of characters to remove from database
        """
        to_remove = []
        
        for path, chars in path_duplicates.items():
            if len(chars) <= 1:
                continue
            
            self.logger.log_warning(f"Found {len(chars)} characters with path {path}")
            
            # Check if file actually exists
            file_exists = Path(path).exists()
            
            if not file_exists:
                # File doesn't exist, remove all records
                self.logger.log_info(f"File {path} doesn't exist, removing all {len(chars)} records")
                to_remove.extend(chars)
                continue
            
            # File exists, keep the most recent record
            sorted_chars = sorted(chars, key=lambda c: (
                c.db_metadata_last_synced_at or datetime.min,
                c.updated_at or datetime.min
            ), reverse=True)
            
            keeper = sorted_chars[0]
            duplicates = sorted_chars[1:]
            
            self.logger.log_info(f"Keeping character {keeper.character_uuid} for path {path}")

            for dup in duplicates:
                self.logger.log_info(f"Marking for removal: character {dup.character_uuid} (duplicate path)")
                to_remove.append(dup)
        
        return to_remove
    
    def extract_uuid_from_png(self, file_path: str) -> Optional[str]:
        """
        Extract UUID from PNG metadata.
        
        Args:
            file_path: Path to PNG file
            
        Returns:
            UUID string if found, None otherwise
        """
        try:
            metadata = self.png_handler.read_metadata(file_path)
            if metadata and isinstance(metadata, dict):
                # Check for UUID in various possible locations
                uuid_candidates = [
                    metadata.get('character_uuid'),
                    metadata.get('uuid'),
                    metadata.get('id'),
                ]
                
                # Also check in nested data structures
                if 'data' in metadata and isinstance(metadata['data'], dict):
                    uuid_candidates.extend([
                        metadata['data'].get('character_uuid'),
                        metadata['data'].get('uuid'),
                        metadata['data'].get('id'),
                    ])
                
                for candidate in uuid_candidates:
                    if candidate and isinstance(candidate, str):
                        # Validate UUID format
                        try:
                            uuid.UUID(candidate)
                            return candidate
                        except ValueError:
                            continue
            
            return None
        except Exception as e:
            self.logger.log_error(f"Error extracting UUID from {file_path}: {e}")
            return None
    
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

    def cleanup_duplicates(self, characters: List[CharacterModel]) -> Tuple[int, int]:
        """
        Comprehensive duplicate cleanup.
        
        Args:
            characters: List of all characters to check
            
        Returns:
            Tuple of (uuid_duplicates_removed, path_duplicates_removed)
        """
        self.logger.log_info(f"Starting duplicate cleanup for {len(characters)} characters")
        
        # Find different types of duplicates
        uuid_duplicates = self.find_duplicates_by_uuid(characters)
        path_duplicates = self.find_duplicates_by_path(characters)
        
        self.logger.log_info(f"Found {len(uuid_duplicates)} UUID duplicate groups")
        self.logger.log_info(f"Found {len(path_duplicates)} path duplicate groups")
        
        # Resolve duplicates
        uuid_removals = self.resolve_uuid_duplicates(uuid_duplicates)
        path_removals = self.resolve_path_duplicates(path_duplicates)
        
        # Remove duplicates from database
        uuid_removed_count = 0
        path_removed_count = 0
        
        try:
            with self._get_session_context() as db:
                # Remove UUID duplicates
                for char in uuid_removals:
                    db.delete(char)
                    uuid_removed_count += 1
                
                # Remove path duplicates (avoid double-removal)
                for char in path_removals:
                    if char not in uuid_removals:
                        db.delete(char)
                        path_removed_count += 1
                
                db.commit()
                
        except Exception as e:
            self.logger.log_error(f"Error removing duplicates from database: {e}")
            raise
        
        self.logger.log_info(f"Removed {uuid_removed_count} UUID duplicates and {path_removed_count} path duplicates")
        
        return uuid_removed_count, path_removed_count