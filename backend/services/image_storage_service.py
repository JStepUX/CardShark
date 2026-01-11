"""Unified service for non-metadata image storage."""
import os
import uuid
from pathlib import Path
from typing import Dict, Optional, Tuple

from backend.utils.path_utils import get_application_base_path
from backend.log_manager import LogManager


class ImageStorageService:
    """
    Centralized service for storing images that don't require PNG metadata embedding.
    Handles: lore images, backgrounds, world assets, general uploads.
    """

    # Known categories and their subdirectory structure
    CATEGORIES = {
        "lore_images": "{owner_uuid}",      # uploads/lore_images/{char_uuid}/
        "backgrounds": "",                   # uploads/backgrounds/
        "world_assets": "{owner_uuid}",      # uploads/world_assets/{world_uuid}/
        "general": "",                       # uploads/general/
    }

    def __init__(self, logger: LogManager):
        self.logger = logger
        self.base_path = get_application_base_path() / "uploads"
        self._ensure_base_directory()

    def _ensure_base_directory(self):
        """Ensure the base uploads directory exists."""
        self.base_path.mkdir(parents=True, exist_ok=True)

    def get_category_path(self, category: str, owner_uuid: Optional[str] = None) -> Path:
        """
        Get the storage path for a category.
        
        Args:
            category: One of CATEGORIES keys (lore_images, backgrounds, etc.)
            owner_uuid: Required for categories that use owner-based subdirs
            
        Returns:
            Absolute Path to the storage directory
        """
        if category not in self.CATEGORIES:
            raise ValueError(f"Unknown category: {category}. Valid: {list(self.CATEGORIES.keys())}")
        
        category_pattern = self.CATEGORIES[category]
        
        if "{owner_uuid}" in category_pattern:
            if not owner_uuid:
                raise ValueError(f"Category '{category}' requires owner_uuid")
            subdir = category_pattern.replace("{owner_uuid}", owner_uuid)
        else:
            subdir = category_pattern
        
        if subdir:
            path = self.base_path / category / subdir
        else:
            path = self.base_path / category
            
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_image(
        self,
        category: str,
        file_data: bytes,
        original_filename: str,
        owner_uuid: Optional[str] = None,
        custom_filename: Optional[str] = None
    ) -> Dict[str, str]:
        """
        Save an image file.
        
        Args:
            category: Storage category
            file_data: Raw bytes of the image
            original_filename: Original filename (used to determine extension)
            owner_uuid: Owner identifier (required for some categories)
            custom_filename: Optional custom filename (without extension)
            
        Returns:
            Dict with keys: filename, absolute_path, relative_url
        """
        storage_dir = self.get_category_path(category, owner_uuid)
        
        # Determine extension
        extension = Path(original_filename).suffix.lower()
        if not extension:
            extension = ".png"  # Default
        
        # Generate filename
        if custom_filename:
            filename = f"{custom_filename}{extension}"
        else:
            filename = f"{uuid.uuid4()}{extension}"
        
        file_path = storage_dir / filename
        
        # Write file
        with open(file_path, "wb") as f:
            f.write(file_data)
        
        self.logger.log_info(f"Saved image: {file_path}")
        
        # Build relative URL
        if owner_uuid:
            relative_url = f"/uploads/{category}/{owner_uuid}/{filename}"
        else:
            relative_url = f"/uploads/{category}/{filename}"
        
        return {
            "filename": filename,
            "absolute_path": str(file_path),
            "relative_url": relative_url
        }

    def delete_image(
        self,
        category: str,
        filename: str,
        owner_uuid: Optional[str] = None
    ) -> bool:
        """Delete an image file."""
        storage_dir = self.get_category_path(category, owner_uuid)
        file_path = storage_dir / filename
        
        if file_path.exists():
            try:
                # Try send2trash first
                try:
                    import send2trash
                    send2trash.send2trash(str(file_path))
                except ImportError:
                    os.remove(file_path)
                self.logger.log_info(f"Deleted image: {file_path}")
                return True
            except Exception as e:
                self.logger.log_error(f"Failed to delete {file_path}: {e}")
                return False
        return False

    def get_image_path(
        self,
        category: str,
        filename: str,
        owner_uuid: Optional[str] = None
    ) -> Optional[Path]:
        """Get the absolute path to an image if it exists."""
        storage_dir = self.get_category_path(category, owner_uuid)
        file_path = storage_dir / filename
        return file_path if file_path.exists() else None
