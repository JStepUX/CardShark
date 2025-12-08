# backend/services/user_profile_service.py
"""
User Profile Service - Indexes user profile PNG files from the users/ directory.

Design Philosophy:
- PNG files in users/ are the source of truth
- Database table (user_profile_cards) is an index/cache
- Can be rebuilt from scratch by re-scanning users/ directory
"""
import base64
import datetime
import json
import os
import sys
import uuid
from io import BytesIO
from pathlib import Path
from typing import Dict, Any, Optional, List

from PIL import Image, PngImagePlugin
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.sql_models import UserProfileCard
from backend.utils.path_utils import normalize_path, get_application_base_path, ensure_directory_exists


def _as_json_str(value) -> Optional[str]:
    """Helper to convert a value to a JSON string if it's not already a string."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value)
    except (TypeError, ValueError):
        return str(value)


class UserProfileService:
    """Service for managing user profile PNG files and their database index."""
    
    def __init__(self, db_session_generator, logger):
        self.db_session_generator = db_session_generator
        self.logger = logger
    
    def _get_users_dir(self) -> Path:
        """Get the users directory path."""
        # Get application base path
        base_path = get_application_base_path()
        users_dir = base_path / "users"
        
        # Ensure directory exists
        ensure_directory_exists(users_dir)
        
        return users_dir
    
    def _read_metadata_from_png(self, file_path: Path) -> dict:
        """Read user metadata from PNG file's 'chara' text chunk."""
        try:
            with Image.open(file_path) as img:
                if 'chara' in img.info:
                    encoded_data = img.info['chara']
                    if isinstance(encoded_data, bytes):
                        encoded_data = encoded_data.decode('utf-8', errors='ignore')
                    # Handle padding
                    padding_needed = len(encoded_data) % 4
                    if padding_needed:
                        encoded_data += '=' * (4 - padding_needed)
                    decoded_bytes = base64.b64decode(encoded_data)
                    return json.loads(decoded_bytes.decode('utf-8'))
        except Exception as e:
            self.logger.log_warning(f"Could not read metadata from {file_path}: {e}")
        return {}
    
    def _write_metadata_to_png(self, image_data: bytes, metadata: dict) -> bytes:
        """Write user metadata to PNG file's 'chara' text chunk."""
        # Encode metadata as base64 JSON (same format as character cards)
        json_str = json.dumps(metadata)
        base64_str = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')
        
        # Prepare PNG info
        png_info = PngImagePlugin.PngInfo()
        
        with Image.open(BytesIO(image_data)) as img:
            # Preserve existing metadata (except character data)
            for key, value in img.info.items():
                if key not in ['chara', 'ccv3', 'exif']:
                    try:
                        if isinstance(value, (str, bytes)):
                            png_info.add_text(key, value if isinstance(value, str) else value.decode('utf-8', errors='ignore'))
                    except Exception:
                        pass
            
            # Add user metadata
            png_info.add_text('chara', base64_str)
            
            # Save image with metadata
            output = BytesIO()
            img.save(output, format="PNG", pnginfo=png_info, optimize=False)
            return output.getvalue()
    
    def _get_session_context(self):
        """Get a database session context."""
        import contextlib
        
        @contextlib.contextmanager
        def session_context():
            session = self.db_session_generator()
            if hasattr(session, '__next__') or hasattr(session, 'send'):
                try:
                    yield next(session)
                finally:
                    try:
                        next(session)
                    except StopIteration:
                        pass
            else:
                try:
                    yield session
                finally:
                    session.close()
        
        return session_context()
    
    def sync_users_directory(self):
        """
        Scan users/ directory and sync PNG metadata with the database.
        This is the main indexing function called on startup or when rebuilding.
        """
        self.logger.log_info("Starting user profiles directory synchronization...")
        
        users_dir = self._get_users_dir()
        if not users_dir.exists():
            self.logger.log_warning(f"Users directory does not exist: {users_dir}")
            return
        
        # Track all PNG files found on disk
        all_png_files_on_disk = set()
        
        self.logger.log_info(f"Processing PNG files in {users_dir}...")
        
        for png_file in users_dir.glob('*.png'):
            abs_png_path = normalize_path(str(png_file.resolve()))
            all_png_files_on_disk.add(abs_png_path)
            
            try:
                file_mod_time = datetime.datetime.fromtimestamp(png_file.stat().st_mtime)
                
                # Check if already in database and up-to-date
                with self._get_session_context() as db:
                    existing_user = db.query(UserProfileCard).filter(
                        UserProfileCard.png_file_path == abs_png_path
                    ).first()
                    
                    if existing_user and existing_user.db_metadata_last_synced_at:
                        if existing_user.db_metadata_last_synced_at >= file_mod_time:
                            self.logger.log_info(f"Skipping {abs_png_path}, DB record is up-to-date.")
                            continue
                
                self.logger.log_info(f"Syncing user profile PNG: {abs_png_path}")
                
                # Read metadata from PNG
                metadata = self._read_metadata_from_png(png_file)
                data_section = metadata.get("data", {})
                
                # Extract user name
                user_name = data_section.get("name") or metadata.get("name")
                if not user_name:
                    user_name = png_file.stem  # Fallback to filename
                
                # Extract or generate UUID
                user_uuid = data_section.get("user_uuid") or data_section.get("character_uuid")
                if not user_uuid:
                    user_uuid = str(uuid.uuid4())
                    self.logger.log_info(f"Generated new UUID {user_uuid} for user: {user_name}")
                
                # Prepare database record
                with self._get_session_context() as db:
                    if existing_user:
                        # Update existing record
                        self.logger.log_info(f"Updating user profile {user_uuid} in DB.")
                        existing_user.user_uuid = user_uuid
                        existing_user.name = user_name
                        existing_user.description = data_section.get("description")
                        existing_user.extensions_json = _as_json_str(data_section.get("extensions", {}))
                        existing_user.file_last_modified = int(file_mod_time.timestamp())
                        existing_user.db_metadata_last_synced_at = datetime.datetime.utcnow()
                        existing_user.updated_at = datetime.datetime.utcnow()
                        db.add(existing_user)
                    else:
                        # Create new record
                        self.logger.log_info(f"Adding new user profile {user_uuid} to DB.")
                        new_user = UserProfileCard(
                            user_uuid=user_uuid,
                            name=user_name,
                            description=data_section.get("description"),
                            png_file_path=abs_png_path,
                            file_last_modified=int(file_mod_time.timestamp()),
                            extensions_json=_as_json_str(data_section.get("extensions", {})),
                            db_metadata_last_synced_at=datetime.datetime.utcnow()
                        )
                        db.add(new_user)
                    
                    db.commit()
                    
            except Exception as e:
                self.logger.log_error(f"Failed to process/sync user profile PNG {abs_png_path}: {e}")
                import traceback
                self.logger.log_error(traceback.format_exc())
        
        # Prune users from DB that no longer exist on disk
        with self._get_session_context() as db:
            all_db_users = db.query(UserProfileCard.png_file_path, UserProfileCard.user_uuid).all()
            for db_path, db_uuid in all_db_users:
                if db_path not in all_png_files_on_disk:
                    self.logger.log_info(f"User profile PNG {db_path} (UUID: {db_uuid}) no longer exists. Removing from DB.")
                    user_to_delete = db.query(UserProfileCard).filter(
                        UserProfileCard.user_uuid == db_uuid
                    ).first()
                    if user_to_delete:
                        db.delete(user_to_delete)
            db.commit()
        
        self.logger.log_info("User profiles directory synchronization finished.")
    
    def get_all_users(self, skip: int = 0, limit: Optional[int] = None) -> List[UserProfileCard]:
        """Get all user profiles from database."""
        with self._get_session_context() as db:
            query = db.query(UserProfileCard).offset(skip)
            if limit is not None:
                query = query.limit(limit)
            return query.all()
    
    def get_user_by_uuid(self, user_uuid: str) -> Optional[UserProfileCard]:
        """Get a user profile by UUID."""
        with self._get_session_context() as db:
            return db.query(UserProfileCard).filter(
                UserProfileCard.user_uuid == user_uuid
            ).first()
    
    def get_user_by_path(self, png_file_path: str) -> Optional[UserProfileCard]:
        """Get a user profile by PNG file path."""
        with self._get_session_context() as db:
            return db.query(UserProfileCard).filter(
                UserProfileCard.png_file_path == normalize_path(png_file_path)
            ).first()
    
    def count_all_users(self) -> int:
        """Count all user profiles in database."""
        with self._get_session_context() as db:
            return db.query(UserProfileCard).count()
    
    def clear_all_users(self) -> bool:
        """Clear all user profiles from database (for rebuild)."""
        try:
            with self._get_session_context() as db:
                deleted_count = db.query(UserProfileCard).delete()
                db.commit()
                self.logger.log_info(f"Cleared {deleted_count} user profiles from database")
                return True
        except Exception as e:
            self.logger.log_error(f"Failed to clear user profiles from database: {e}")
            return False
    
    def create_user_profile(
        self,
        image_bytes: bytes,
        metadata: Dict[str, Any],
        filename: Optional[str] = None
    ) -> Optional[UserProfileCard]:
        """
        Create a new user profile by saving PNG to disk and indexing in database.
        
        Args:
            image_bytes: Raw image bytes
            metadata: User metadata to embed in PNG
            filename: Optional filename (will be derived from name if not provided)
        
        Returns:
            The created UserProfileCard or None on failure
        """
        try:
            users_dir = self._get_users_dir()
            
            # Extract user info from metadata
            data_section = metadata.get("data", {})
            user_name = data_section.get("name") or metadata.get("name") or "User"
            
            # Generate or get UUID
            user_uuid = data_section.get("user_uuid") or str(uuid.uuid4())
            
            # Ensure UUID is in metadata
            if "data" not in metadata:
                metadata["data"] = {}
            metadata["data"]["user_uuid"] = user_uuid
            
            # Determine filename
            if not filename:
                # Sanitize name for filename
                safe_name = ''.join(c for c in user_name if c.isalnum() or c in ['_', '-', ' '])
                safe_name = safe_name.strip()[:50] or "user"
                filename = f"{safe_name}.png"
            
            # Handle filename collisions
            file_path = users_dir / filename
            counter = 1
            while file_path.exists():
                base = Path(filename).stem
                file_path = users_dir / f"{base}_{counter}.png"
                counter += 1
            
            # Write metadata to PNG
            final_bytes = self._write_metadata_to_png(image_bytes, metadata)
            
            # Save to disk
            with open(file_path, "wb") as f:
                f.write(final_bytes)
            
            abs_path = normalize_path(str(file_path.resolve()))
            self.logger.log_info(f"Saved user profile PNG: {abs_path}")
            
            # Create database record
            with self._get_session_context() as db:
                new_user = UserProfileCard(
                    user_uuid=user_uuid,
                    name=user_name,
                    description=data_section.get("description"),
                    png_file_path=abs_path,
                    file_last_modified=int(datetime.datetime.now().timestamp()),
                    extensions_json=_as_json_str(data_section.get("extensions", {})),
                    db_metadata_last_synced_at=datetime.datetime.utcnow()
                )
                db.add(new_user)
                db.commit()
                db.refresh(new_user)
                
                self.logger.log_info(f"Created user profile in database: {user_uuid}")
                return new_user
                
        except Exception as e:
            self.logger.log_error(f"Failed to create user profile: {e}")
            import traceback
            self.logger.log_error(traceback.format_exc())
            return None
    
    def delete_user_profile(self, user_uuid: str, delete_png_file: bool = True) -> bool:
        """
        Delete a user profile from database and optionally from disk.
        
        Args:
            user_uuid: UUID of user to delete
            delete_png_file: Whether to also delete the PNG file
        
        Returns:
            True if successful, False otherwise
        """
        try:
            with self._get_session_context() as db:
                user = db.query(UserProfileCard).filter(
                    UserProfileCard.user_uuid == user_uuid
                ).first()
                
                if not user:
                    self.logger.log_warning(f"User profile not found: {user_uuid}")
                    return False
                
                png_path = user.png_file_path
                
                # Delete from database
                db.delete(user)
                db.commit()
                
                self.logger.log_info(f"Deleted user profile from database: {user_uuid}")
                
                # Delete PNG file if requested
                if delete_png_file and png_path:
                    try:
                        Path(png_path).unlink(missing_ok=True)
                        self.logger.log_info(f"Deleted user profile PNG: {png_path}")
                    except Exception as e:
                        self.logger.log_error(f"Failed to delete PNG file {png_path}: {e}")
                
                return True
                
        except Exception as e:
            self.logger.log_error(f"Failed to delete user profile {user_uuid}: {e}")
            return False

