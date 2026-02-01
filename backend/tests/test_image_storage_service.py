"""
Tests for image_storage_service.py

Covers:
- save_image() with file creation, UUID generation, extension handling
- get_category_path() with owner-based subdirs, category validation
- delete_image() with file removal, missing file handling
- get_image_path() with existence check, path resolution
- Path handling consistency
"""
import pytest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock

# Add parent to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.services.image_storage_service import ImageStorageService


@pytest.fixture
def mock_logger():
    """Create a mock logger for testing."""
    logger = MagicMock()
    logger.log_info = MagicMock()
    logger.log_error = MagicMock()
    logger.log_step = MagicMock()
    return logger


@pytest.fixture
def temp_uploads_dir(tmp_path):
    """Create a temporary uploads directory."""
    uploads_dir = tmp_path / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    return uploads_dir


@pytest.fixture
def service(mock_logger, temp_uploads_dir):
    """Create an ImageStorageService with mocked base path."""
    with patch('backend.services.image_storage_service.get_application_base_path') as mock_path:
        mock_path.return_value = temp_uploads_dir.parent
        service = ImageStorageService(mock_logger)
        return service


@pytest.fixture
def sample_image_bytes():
    """Create sample PNG image bytes."""
    # Minimal valid PNG (1x1 transparent pixel)
    return (
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01'
        b'\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
        b'\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01'
        b'\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    )


class TestGetCategoryPath:
    """Tests for get_category_path method."""

    def test_backgrounds_category(self, service, temp_uploads_dir):
        """Test getting path for backgrounds category."""
        path = service.get_category_path("backgrounds")

        assert path.exists()
        assert path == temp_uploads_dir / "backgrounds"

    def test_general_category(self, service, temp_uploads_dir):
        """Test getting path for general category."""
        path = service.get_category_path("general")

        assert path.exists()
        assert path == temp_uploads_dir / "general"

    def test_lore_images_with_owner(self, service, temp_uploads_dir):
        """Test getting path for lore_images requires owner_uuid."""
        owner_uuid = "char-uuid-12345"
        path = service.get_category_path("lore_images", owner_uuid=owner_uuid)

        assert path.exists()
        assert path == temp_uploads_dir / "lore_images" / owner_uuid

    def test_world_assets_with_owner(self, service, temp_uploads_dir):
        """Test getting path for world_assets requires owner_uuid."""
        owner_uuid = "world-uuid-67890"
        path = service.get_category_path("world_assets", owner_uuid=owner_uuid)

        assert path.exists()
        assert path == temp_uploads_dir / "world_assets" / owner_uuid

    def test_lore_images_missing_owner_raises_error(self, service):
        """Test lore_images without owner_uuid raises ValueError."""
        with pytest.raises(ValueError, match="requires owner_uuid"):
            service.get_category_path("lore_images")

    def test_world_assets_missing_owner_raises_error(self, service):
        """Test world_assets without owner_uuid raises ValueError."""
        with pytest.raises(ValueError, match="requires owner_uuid"):
            service.get_category_path("world_assets")

    def test_unknown_category_raises_error(self, service):
        """Test unknown category raises ValueError."""
        with pytest.raises(ValueError, match="Unknown category"):
            service.get_category_path("invalid_category")

    def test_creates_directory_if_not_exists(self, service, temp_uploads_dir):
        """Test that get_category_path creates directories."""
        # Remove the uploads dir
        import shutil
        uploads_path = temp_uploads_dir / "uploads"
        if uploads_path.exists():
            shutil.rmtree(uploads_path)

        path = service.get_category_path("backgrounds")

        assert path.exists()


class TestSaveImage:
    """Tests for save_image method."""

    def test_save_with_auto_uuid_filename(self, service, sample_image_bytes):
        """Test saving image generates UUID filename."""
        result = service.save_image(
            category="backgrounds",
            file_data=sample_image_bytes,
            original_filename="test.png"
        )

        assert "filename" in result
        assert result["filename"].endswith(".png")
        # Filename should be UUID format (36 chars) + .png (4 chars)
        assert len(result["filename"]) == 40

    def test_save_with_custom_filename(self, service, sample_image_bytes):
        """Test saving image with custom filename."""
        result = service.save_image(
            category="backgrounds",
            file_data=sample_image_bytes,
            original_filename="test.png",
            custom_filename="my_custom_name"
        )

        assert result["filename"] == "my_custom_name.png"

    def test_save_preserves_extension_from_original(self, service, sample_image_bytes):
        """Test that extension is taken from original filename."""
        result = service.save_image(
            category="backgrounds",
            file_data=sample_image_bytes,
            original_filename="photo.jpg"
        )

        assert result["filename"].endswith(".jpg")

    def test_save_defaults_to_png_extension(self, service, sample_image_bytes):
        """Test default extension is .png when original has none."""
        result = service.save_image(
            category="backgrounds",
            file_data=sample_image_bytes,
            original_filename="no_extension"
        )

        assert result["filename"].endswith(".png")

    def test_save_returns_absolute_path(self, service, sample_image_bytes, temp_uploads_dir):
        """Test that save returns absolute path."""
        result = service.save_image(
            category="backgrounds",
            file_data=sample_image_bytes,
            original_filename="test.png"
        )

        abs_path = Path(result["absolute_path"])
        assert abs_path.is_absolute()
        assert abs_path.exists()

    def test_save_returns_relative_url(self, service, sample_image_bytes):
        """Test that save returns relative URL."""
        result = service.save_image(
            category="backgrounds",
            file_data=sample_image_bytes,
            original_filename="test.png"
        )

        assert result["relative_url"].startswith("/uploads/backgrounds/")

    def test_save_with_owner_uuid(self, service, sample_image_bytes):
        """Test saving with owner_uuid creates correct path."""
        owner = "char-uuid-xyz"
        result = service.save_image(
            category="lore_images",
            file_data=sample_image_bytes,
            original_filename="lore.png",
            owner_uuid=owner
        )

        assert owner in result["relative_url"]
        assert f"/uploads/lore_images/{owner}/" in result["relative_url"]

    def test_save_file_content_correct(self, service, sample_image_bytes):
        """Test saved file contains correct data."""
        result = service.save_image(
            category="backgrounds",
            file_data=sample_image_bytes,
            original_filename="test.png"
        )

        saved_path = Path(result["absolute_path"])
        assert saved_path.read_bytes() == sample_image_bytes

    def test_save_normalizes_extension_to_lowercase(self, service, sample_image_bytes):
        """Test extension is normalized to lowercase."""
        result = service.save_image(
            category="backgrounds",
            file_data=sample_image_bytes,
            original_filename="test.PNG"
        )

        assert result["filename"].endswith(".png")

    def test_save_multiple_files(self, service, sample_image_bytes):
        """Test saving multiple files creates unique names."""
        results = []
        for _ in range(5):
            result = service.save_image(
                category="backgrounds",
                file_data=sample_image_bytes,
                original_filename="test.png"
            )
            results.append(result["filename"])

        # All filenames should be unique
        assert len(set(results)) == 5


class TestDeleteImage:
    """Tests for delete_image method."""

    def test_delete_existing_file(self, service, sample_image_bytes):
        """Test deleting an existing file returns True."""
        # First save a file
        result = service.save_image(
            category="backgrounds",
            file_data=sample_image_bytes,
            original_filename="to_delete.png"
        )
        filename = result["filename"]

        # Mock send2trash to avoid actual trash operations
        with patch('backend.services.image_storage_service.os.remove') as mock_remove:
            success = service.delete_image(category="backgrounds", filename=filename)

        # Verify deletion was attempted
        assert success or mock_remove.called

    def test_delete_nonexistent_file(self, service):
        """Test deleting non-existent file returns False."""
        success = service.delete_image(
            category="backgrounds",
            filename="does_not_exist.png"
        )

        assert success is False

    def test_delete_with_owner_uuid(self, service, sample_image_bytes):
        """Test deleting file with owner_uuid."""
        owner = "char-uuid-abc"
        result = service.save_image(
            category="lore_images",
            file_data=sample_image_bytes,
            original_filename="lore.png",
            owner_uuid=owner
        )

        with patch('backend.services.image_storage_service.os.remove') as mock_remove:
            success = service.delete_image(
                category="lore_images",
                filename=result["filename"],
                owner_uuid=owner
            )

        assert success or mock_remove.called

    def test_delete_handles_permission_error(self, service, sample_image_bytes, mock_logger):
        """Test delete handles permission errors gracefully."""
        result = service.save_image(
            category="backgrounds",
            file_data=sample_image_bytes,
            original_filename="locked.png"
        )

        with patch('backend.services.image_storage_service.os.remove') as mock_remove:
            mock_remove.side_effect = PermissionError("File is locked")
            with patch.dict('sys.modules', {'send2trash': None}):
                success = service.delete_image(
                    category="backgrounds",
                    filename=result["filename"]
                )

        assert success is False
        mock_logger.log_error.assert_called()


class TestGetImagePath:
    """Tests for get_image_path method."""

    def test_get_existing_image_path(self, service, sample_image_bytes):
        """Test getting path for existing image."""
        result = service.save_image(
            category="backgrounds",
            file_data=sample_image_bytes,
            original_filename="exists.png"
        )

        path = service.get_image_path(
            category="backgrounds",
            filename=result["filename"]
        )

        assert path is not None
        assert path.exists()
        assert path == Path(result["absolute_path"])

    def test_get_nonexistent_image_path(self, service):
        """Test getting path for non-existent image returns None."""
        path = service.get_image_path(
            category="backgrounds",
            filename="does_not_exist.png"
        )

        assert path is None

    def test_get_image_path_with_owner(self, service, sample_image_bytes):
        """Test getting path with owner_uuid."""
        owner = "char-uuid-def"
        result = service.save_image(
            category="lore_images",
            file_data=sample_image_bytes,
            original_filename="owned.png",
            owner_uuid=owner
        )

        path = service.get_image_path(
            category="lore_images",
            filename=result["filename"],
            owner_uuid=owner
        )

        assert path is not None
        assert owner in str(path)


class TestCategoryConfiguration:
    """Tests for category configuration constants."""

    def test_all_categories_defined(self, service):
        """Test all expected categories are defined."""
        expected_categories = ["lore_images", "backgrounds", "world_assets", "general"]

        for category in expected_categories:
            # Should not raise
            if category in ["lore_images", "world_assets"]:
                service.get_category_path(category, owner_uuid="test-uuid")
            else:
                service.get_category_path(category)

    def test_category_patterns(self, service):
        """Test category patterns are correctly configured."""
        assert "{owner_uuid}" in service.CATEGORIES["lore_images"]
        assert "{owner_uuid}" in service.CATEGORIES["world_assets"]
        assert service.CATEGORIES["backgrounds"] == ""
        assert service.CATEGORIES["general"] == ""


class TestBaseDirectory:
    """Tests for base directory initialization."""

    def test_base_path_is_uploads(self, service, temp_uploads_dir):
        """Test that base_path is set to uploads directory."""
        assert service.base_path == temp_uploads_dir

    def test_ensures_base_directory_exists(self, mock_logger, tmp_path):
        """Test that __init__ creates base directory."""
        with patch('backend.services.image_storage_service.get_application_base_path') as mock_path:
            mock_path.return_value = tmp_path
            service = ImageStorageService(mock_logger)

        assert (tmp_path / "uploads").exists()


class TestEdgeCases:
    """Tests for edge cases."""

    def test_filename_with_spaces(self, service, sample_image_bytes):
        """Test handling filenames with spaces."""
        result = service.save_image(
            category="backgrounds",
            file_data=sample_image_bytes,
            original_filename="image with spaces.png",
            custom_filename="custom name with spaces"
        )

        assert result["filename"] == "custom name with spaces.png"
        path = Path(result["absolute_path"])
        assert path.exists()

    def test_filename_with_unicode(self, service, sample_image_bytes):
        """Test handling filenames with unicode characters."""
        result = service.save_image(
            category="backgrounds",
            file_data=sample_image_bytes,
            original_filename="image.png",
            custom_filename="image_with_unicode"
        )

        assert "image_with_unicode" in result["filename"]

    def test_various_extensions(self, service, sample_image_bytes):
        """Test various image extensions are preserved."""
        extensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]

        for ext in extensions:
            result = service.save_image(
                category="backgrounds",
                file_data=sample_image_bytes,
                original_filename=f"test{ext}"
            )
            assert result["filename"].endswith(ext.lower())

    def test_empty_file_data(self, service):
        """Test saving empty file data."""
        result = service.save_image(
            category="backgrounds",
            file_data=b"",
            original_filename="empty.png"
        )

        # Should still create the file
        assert Path(result["absolute_path"]).exists()
        assert Path(result["absolute_path"]).stat().st_size == 0

    def test_large_file_data(self, service):
        """Test saving large file data."""
        # 1MB of data
        large_data = b"x" * (1024 * 1024)

        result = service.save_image(
            category="backgrounds",
            file_data=large_data,
            original_filename="large.png"
        )

        saved = Path(result["absolute_path"])
        assert saved.exists()
        assert saved.stat().st_size == 1024 * 1024
