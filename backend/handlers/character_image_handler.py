"""
backend/handlers/character_image_handler.py
Business logic for character secondary images.

Manages storage and metadata for additional character images beyond the main portrait.
Images are stored in character_images/{character_uuid}/ directory.
"""

import os
import uuid
from pathlib import Path
from typing import List, Optional, Dict
from PIL import Image
from sqlalchemy.orm import Session

from backend.sql_models import CharacterImage
from backend.utils.path_utils import get_application_base_path


class CharacterImageHandler:
    """
    Handles character secondary image storage and metadata.

    Images are stored in: character_images/{character_uuid}/{filename}
    Metadata is stored in the character_images database table.
    """

    def __init__(self, logger):
        self.logger = logger
        self.base_dir = self._get_character_images_dir()

    def _get_character_images_dir(self) -> Path:
        """Get the character_images directory, creating it if needed."""
        base_path = get_application_base_path()
        images_dir = base_path / 'character_images'
        images_dir.mkdir(parents=True, exist_ok=True)
        self.logger.log_step(f"Character images directory: {images_dir}")
        return images_dir

    def _get_character_dir(self, character_uuid: str) -> Path:
        """Get the directory for a specific character's images."""
        char_dir = self.base_dir / character_uuid
        char_dir.mkdir(parents=True, exist_ok=True)
        return char_dir

    def _generate_unique_filename(self, original_filename: str) -> str:
        """
        Generate a unique filename using the pattern: {safe_name}_{uuid8}.{ext}

        Args:
            original_filename: Original filename from upload

        Returns:
            Unique filename string
        """
        path = Path(original_filename)
        safe_name = ''.join(c for c in path.stem if c.isalnum() or c in ['-', '_', ' '])
        safe_name = safe_name[:50]  # Limit length

        if not safe_name:
            safe_name = "image"

        extension = path.suffix.lower()
        unique_id = uuid.uuid4().hex[:8]

        return f"{safe_name}_{unique_id}{extension}"

    def _validate_image(self, file_path: Path) -> bool:
        """
        Validate that a file is a valid image using PIL.

        Args:
            file_path: Path to the image file

        Returns:
            True if valid image, False otherwise
        """
        try:
            with Image.open(file_path) as img:
                img.verify()
            # Re-open to ensure it's fully valid (verify() closes the file)
            with Image.open(file_path) as img:
                img.load()
            return True
        except Exception as e:
            self.logger.log_error(f"Image validation failed: {str(e)}")
            return False

    def list_images(self, db: Session, character_uuid: str) -> List[Dict]:
        """
        Get all images for a character, ordered by display_order.

        Args:
            db: Database session
            character_uuid: UUID of the character

        Returns:
            List of image metadata dictionaries
        """
        try:
            self.logger.log_step(f"Listing images for character: {character_uuid}")

            images = (
                db.query(CharacterImage)
                .filter(CharacterImage.character_uuid == character_uuid)
                .order_by(CharacterImage.display_order.asc())
                .all()
            )

            result = []
            for img in images:
                # Check if file actually exists
                file_path = self._get_character_dir(character_uuid) / img.filename
                if file_path.exists():
                    result.append({
                        'id': img.id,
                        'character_uuid': img.character_uuid,
                        'filename': img.filename,
                        'display_order': img.display_order,
                        'created_at': img.created_at.isoformat() if img.created_at else None,
                        'file_size': file_path.stat().st_size,
                        'file_path': str(file_path)
                    })
                else:
                    self.logger.log_warning(f"Image file missing: {img.filename}")

            self.logger.log_step(f"Found {len(result)} images for character {character_uuid}")
            return result

        except Exception as e:
            self.logger.log_error(f"Error listing images: {str(e)}")
            return []

    def add_image(
        self,
        db: Session,
        character_uuid: str,
        file_data: bytes,
        filename: str
    ) -> Optional[Dict]:
        """
        Save an image file and create database record.

        Args:
            db: Database session
            character_uuid: UUID of the character
            file_data: Image file bytes
            filename: Original filename

        Returns:
            Dictionary with image metadata if successful, None otherwise
        """
        try:
            self.logger.log_step(f"Adding image for character: {character_uuid}")

            # Validate image format
            extension = Path(filename).suffix.lower()
            valid_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
            if extension not in valid_extensions:
                self.logger.log_warning(f"Invalid image format: {extension}")
                return None

            # Generate unique filename
            unique_filename = self._generate_unique_filename(filename)

            # Get character directory
            char_dir = self._get_character_dir(character_uuid)
            file_path = char_dir / unique_filename

            # Write file
            with open(file_path, 'wb') as f:
                f.write(file_data)

            # Validate image
            if not self._validate_image(file_path):
                self.logger.log_error("Image validation failed, removing file")
                file_path.unlink()
                return None

            # Get next display_order
            max_order = (
                db.query(CharacterImage.display_order)
                .filter(CharacterImage.character_uuid == character_uuid)
                .order_by(CharacterImage.display_order.desc())
                .first()
            )
            next_order = (max_order[0] + 1) if max_order else 0

            # Create database record
            image_record = CharacterImage(
                character_uuid=character_uuid,
                filename=unique_filename,
                display_order=next_order
            )

            db.add(image_record)
            db.commit()
            db.refresh(image_record)

            result = {
                'id': image_record.id,
                'character_uuid': image_record.character_uuid,
                'filename': image_record.filename,
                'display_order': image_record.display_order,
                'created_at': image_record.created_at.isoformat() if image_record.created_at else None,
                'file_size': file_path.stat().st_size,
                'file_path': str(file_path)
            }

            self.logger.log_step(f"Successfully added image: {unique_filename}")
            return result

        except Exception as e:
            db.rollback()
            self.logger.log_error(f"Error adding image: {str(e)}")
            # Clean up file if it was created
            try:
                if 'file_path' in locals() and file_path.exists():
                    file_path.unlink()
            except:
                pass
            return None

    def delete_image(
        self,
        db: Session,
        character_uuid: str,
        filename: str
    ) -> bool:
        """
        Remove image file and database record.

        Args:
            db: Database session
            character_uuid: UUID of the character
            filename: Filename to delete

        Returns:
            True if successful, False otherwise
        """
        try:
            self.logger.log_step(f"Deleting image: {filename} for character: {character_uuid}")

            # Find database record
            image_record = (
                db.query(CharacterImage)
                .filter(
                    CharacterImage.character_uuid == character_uuid,
                    CharacterImage.filename == filename
                )
                .first()
            )

            if not image_record:
                self.logger.log_warning(f"Image record not found: {filename}")
                return False

            # Delete file
            file_path = self._get_character_dir(character_uuid) / filename
            if file_path.exists():
                file_path.unlink()
                self.logger.log_step(f"Deleted file: {file_path}")
            else:
                self.logger.log_warning(f"File not found: {file_path}")

            # Delete database record
            db.delete(image_record)
            db.commit()

            self.logger.log_step(f"Successfully deleted image: {filename}")
            return True

        except Exception as e:
            db.rollback()
            self.logger.log_error(f"Error deleting image: {str(e)}")
            return False

    def reorder_images(
        self,
        db: Session,
        character_uuid: str,
        filenames_in_order: List[str]
    ) -> bool:
        """
        Update display_order for all images based on provided order.

        Args:
            db: Database session
            character_uuid: UUID of the character
            filenames_in_order: List of filenames in desired order

        Returns:
            True if successful, False otherwise
        """
        try:
            self.logger.log_step(f"Reordering {len(filenames_in_order)} images for character: {character_uuid}")

            # Get all current images
            images = (
                db.query(CharacterImage)
                .filter(CharacterImage.character_uuid == character_uuid)
                .all()
            )

            # Create filename -> image mapping
            image_map = {img.filename: img for img in images}

            # Validate all filenames exist
            for filename in filenames_in_order:
                if filename not in image_map:
                    self.logger.log_warning(f"Filename not found in database: {filename}")
                    return False

            # Update display_order for each image
            for order, filename in enumerate(filenames_in_order):
                image_map[filename].display_order = order

            db.commit()

            self.logger.log_step(f"Successfully reordered images for character: {character_uuid}")
            return True

        except Exception as e:
            db.rollback()
            self.logger.log_error(f"Error reordering images: {str(e)}")
            return False

    def sync_from_disk(self, db: Session) -> int:
        """
        Re-populate character_images table from files on disk.
        Called at startup to restore DB records after a schema rebuild.

        Returns:
            Number of image records created.
        """
        valid_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
        created = 0

        if not self.base_dir.exists():
            return 0

        for char_dir in self.base_dir.iterdir():
            if not char_dir.is_dir():
                continue

            character_uuid = char_dir.name
            # Collect files already tracked in DB for this character
            existing = set(
                row[0] for row in
                db.query(CharacterImage.filename)
                .filter(CharacterImage.character_uuid == character_uuid)
                .all()
            )

            order = len(existing)
            for file_path in sorted(char_dir.iterdir(), key=lambda p: p.stat().st_mtime):
                if not file_path.is_file():
                    continue
                if file_path.suffix.lower() not in valid_extensions:
                    continue
                if file_path.name in existing:
                    continue

                # Validate it's a real image
                if not self._validate_image(file_path):
                    continue

                record = CharacterImage(
                    character_uuid=character_uuid,
                    filename=file_path.name,
                    display_order=order
                )
                db.add(record)
                order += 1
                created += 1

        if created:
            db.commit()
            self.logger.log_step(f"Synced {created} secondary image(s) from disk")

        return created

    def get_image_path(self, character_uuid: str, filename: str) -> Optional[Path]:
        """
        Get full path to an image file.

        Args:
            character_uuid: UUID of the character
            filename: Filename of the image

        Returns:
            Path object if file exists, None otherwise
        """
        try:
            file_path = self._get_character_dir(character_uuid) / filename
            if file_path.exists():
                return file_path
            else:
                self.logger.log_warning(f"Image file not found: {filename}")
                return None
        except Exception as e:
            self.logger.log_error(f"Error getting image path: {str(e)}")
            return None
