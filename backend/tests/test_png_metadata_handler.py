"""
Tests for png_metadata_handler.py

Covers:
- read_metadata() with EXIF extraction, tEXt chunk fallback, V1/V2/V3 card formats
- write_metadata() with metadata embedding, EXIF preservation
- _decode_metadata() with Base64 decoding, padding correction
- Malformed PNG handling: Missing metadata, corrupt data, non-PNG files
"""
import pytest
import base64
import json
from io import BytesIO
from unittest.mock import MagicMock, patch
from PIL import Image, PngImagePlugin

# Add parent to path for imports
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.png_metadata_handler import PngMetadataHandler


@pytest.fixture
def mock_logger():
    """Create a mock logger for testing."""
    logger = MagicMock()
    logger.log_step = MagicMock()
    logger.log_info = MagicMock()
    logger.log_error = MagicMock()
    logger.log_warning = MagicMock()
    return logger


@pytest.fixture
def handler(mock_logger):
    """Create a PngMetadataHandler instance with mock logger."""
    return PngMetadataHandler(mock_logger)


@pytest.fixture
def sample_character_data():
    """Sample V2 character card data."""
    return {
        "spec": "chara_card_v2",
        "spec_version": "2.0",
        "data": {
            "name": "Test Character",
            "description": "A test character for unit testing.",
            "personality": "Helpful and friendly.",
            "scenario": "Testing environment.",
            "first_mes": "Hello! I'm a test character.",
            "mes_example": "<START>{{user}}: Hi\n{{char}}: Hello!",
            "creator_notes": "Created for testing.",
            "system_prompt": "You are a test character.",
            "post_history_instructions": "",
            "tags": ["test", "unit-test"],
            "creator": "Test Suite",
            "character_version": "1.0",
            "alternate_greetings": [],
            "extensions": {
                "talkativeness": "0.5",
                "fav": False,
                "world": "",
                "depth_prompt": {"prompt": "", "depth": 0, "role": "system"}
            },
            "group_only_greetings": [],
            "character_book": {"entries": [], "name": ""},
            "character_uuid": "test-uuid-12345"
        }
    }


@pytest.fixture
def png_with_chara_metadata(sample_character_data):
    """Create a PNG image with 'chara' tEXt chunk metadata."""
    # Create a simple test image
    img = Image.new('RGBA', (100, 100), color='red')

    # Encode metadata as base64
    json_str = json.dumps(sample_character_data)
    base64_str = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')

    # Add to PNG info
    png_info = PngImagePlugin.PngInfo()
    png_info.add_text('chara', base64_str)

    # Save to bytes
    output = BytesIO()
    img.save(output, format='PNG', pnginfo=png_info)
    return output.getvalue()


@pytest.fixture
def png_without_metadata():
    """Create a PNG image without any character metadata."""
    img = Image.new('RGBA', (100, 100), color='blue')
    output = BytesIO()
    img.save(output, format='PNG')
    return output.getvalue()


class TestDecodeMetadata:
    """Tests for _decode_metadata helper method."""

    def test_decode_valid_base64(self, handler):
        """Test decoding valid base64 encoded JSON."""
        data = {"name": "Test", "value": 123}
        encoded = base64.b64encode(json.dumps(data).encode('utf-8')).decode('utf-8')

        result = handler._decode_metadata(encoded)

        assert result == data

    def test_decode_with_missing_padding(self, handler):
        """Test decoding base64 with missing padding characters."""
        data = {"name": "Test Character"}
        encoded = base64.b64encode(json.dumps(data).encode('utf-8')).decode('utf-8')
        # Remove padding
        encoded = encoded.rstrip('=')

        result = handler._decode_metadata(encoded)

        assert result == data

    def test_decode_raw_json(self, handler):
        """Test decoding raw JSON that wasn't base64 encoded."""
        data = {"name": "Test", "nested": {"key": "value"}}
        raw_json = json.dumps(data)

        result = handler._decode_metadata(raw_json)

        assert result == data

    def test_decode_with_ascii_prefix(self, handler):
        """Test decoding data with ASCII prefix (common in EXIF)."""
        data = {"name": "Test"}
        encoded = base64.b64encode(json.dumps(data).encode('utf-8')).decode('utf-8')
        # Add ASCII prefix like some EXIF data has
        with_prefix = "ASCII\x00\x00\x00" + encoded

        result = handler._decode_metadata(with_prefix)

        assert result == data

    def test_decode_bytes_input(self, handler):
        """Test decoding bytes input instead of string."""
        data = {"name": "Test"}
        encoded = base64.b64encode(json.dumps(data).encode('utf-8'))

        result = handler._decode_metadata(encoded)

        assert result == data

    def test_decode_with_null_bytes(self, handler):
        """Test decoding data with null bytes."""
        data = {"name": "Test"}
        encoded = base64.b64encode(json.dumps(data).encode('utf-8')).decode('utf-8')
        with_nulls = "\x00\x00" + encoded + "\x00\x00"

        result = handler._decode_metadata(with_nulls)

        assert result == data

    def test_decode_url_safe_base64(self, handler):
        """Test decoding URL-safe base64 variant."""
        data = {"name": "Test+Special/Chars"}
        # URL-safe base64 uses - and _ instead of + and /
        json_bytes = json.dumps(data).encode('utf-8')
        encoded = base64.urlsafe_b64encode(json_bytes).decode('utf-8')

        result = handler._decode_metadata(encoded)

        assert result == data

    def test_decode_invalid_data_raises_exception(self, handler):
        """Test that invalid data raises an exception."""
        with pytest.raises(Exception):
            handler._decode_metadata("not valid base64 or json $$%%^^")


class TestReadMetadata:
    """Tests for read_metadata method."""

    def test_read_from_chara_text_chunk(self, handler, png_with_chara_metadata, sample_character_data):
        """Test reading metadata from 'chara' tEXt chunk."""
        result = handler.read_metadata(png_with_chara_metadata)

        assert result is not None
        assert result["spec"] == sample_character_data["spec"]
        assert result["data"]["name"] == sample_character_data["data"]["name"]
        assert result["data"]["character_uuid"] == sample_character_data["data"]["character_uuid"]

    def test_read_from_file_path(self, handler, png_with_chara_metadata, tmp_path, sample_character_data):
        """Test reading metadata from a file path."""
        # Write test PNG to temp file
        test_file = tmp_path / "test_character.png"
        test_file.write_bytes(png_with_chara_metadata)

        result = handler.read_metadata(str(test_file))

        assert result is not None
        assert result["data"]["name"] == sample_character_data["data"]["name"]

    def test_read_from_path_object(self, handler, png_with_chara_metadata, tmp_path, sample_character_data):
        """Test reading metadata from a Path object."""
        test_file = tmp_path / "test_character.png"
        test_file.write_bytes(png_with_chara_metadata)

        result = handler.read_metadata(test_file)

        assert result is not None
        assert result["data"]["name"] == sample_character_data["data"]["name"]

    def test_read_from_bytes(self, handler, png_with_chara_metadata, sample_character_data):
        """Test reading metadata from bytes."""
        result = handler.read_metadata(png_with_chara_metadata)

        assert result is not None
        assert result["data"]["name"] == sample_character_data["data"]["name"]

    def test_read_from_file_object(self, handler, png_with_chara_metadata, sample_character_data):
        """Test reading metadata from a file-like object."""
        file_obj = BytesIO(png_with_chara_metadata)

        result = handler.read_metadata(file_obj)

        assert result is not None
        assert result["data"]["name"] == sample_character_data["data"]["name"]

    def test_read_no_metadata_returns_empty(self, handler, png_without_metadata):
        """Test reading from PNG without metadata returns empty dict."""
        result = handler.read_metadata(png_without_metadata)

        assert result == {}

    def test_read_character_data_alias(self, handler, png_with_chara_metadata, sample_character_data):
        """Test read_character_data is an alias for read_metadata."""
        result = handler.read_character_data(png_with_chara_metadata)

        assert result is not None
        assert result["data"]["name"] == sample_character_data["data"]["name"]

    def test_read_ccv3_format(self, handler, mock_logger):
        """Test reading ccv3 format metadata."""
        # Create image with ccv3 metadata
        img = Image.new('RGBA', (100, 100), color='green')
        data = {"spec": "chara_card_v3", "data": {"name": "V3 Char"}}
        encoded = base64.b64encode(json.dumps(data).encode('utf-8')).decode('utf-8')

        png_info = PngImagePlugin.PngInfo()
        png_info.add_text('ccv3', encoded)

        output = BytesIO()
        img.save(output, format='PNG', pnginfo=png_info)

        result = handler.read_metadata(output.getvalue())

        assert result is not None
        assert result["spec"] == "chara_card_v3"

    def test_read_invalid_png_raises_exception(self, handler):
        """Test reading from invalid data raises exception."""
        with pytest.raises(Exception):
            handler.read_metadata(b"not a png file")

    def test_read_empty_file_raises_exception(self, handler):
        """Test reading from empty bytes raises exception."""
        with pytest.raises(Exception):
            handler.read_metadata(b"")


class TestWriteMetadata:
    """Tests for write_metadata method."""

    def test_write_basic_metadata(self, handler, sample_character_data):
        """Test writing metadata to a PNG image."""
        # Create a test image
        img = Image.new('RGBA', (100, 100), color='white')
        output = BytesIO()
        img.save(output, format='PNG')
        image_data = output.getvalue()

        result = handler.write_metadata(image_data, sample_character_data)

        # Verify output is valid PNG
        assert result[:8] == b'\x89PNG\r\n\x1a\n'

        # Verify metadata can be read back
        read_back = handler.read_metadata(result)
        assert read_back is not None
        assert read_back["data"]["name"] == sample_character_data["data"]["name"]

    def test_write_preserves_image_content(self, handler, sample_character_data):
        """Test that writing metadata preserves image dimensions and content."""
        # Create a test image with specific size
        original_img = Image.new('RGBA', (256, 128), color='purple')
        output = BytesIO()
        original_img.save(output, format='PNG')
        image_data = output.getvalue()

        result = handler.write_metadata(image_data, sample_character_data)

        # Load the result and check dimensions
        result_img = Image.open(BytesIO(result))
        assert result_img.size == (256, 128)

    def test_write_to_png_file(self, handler, sample_character_data, tmp_path):
        """Test write_metadata_to_png writes to file correctly."""
        # Create initial PNG
        img = Image.new('RGBA', (100, 100), color='yellow')
        test_file = tmp_path / "test_write.png"
        img.save(test_file, format='PNG')

        handler.write_metadata_to_png(test_file, sample_character_data)

        # Read back and verify
        result = handler.read_metadata(str(test_file))
        assert result is not None
        assert result["data"]["name"] == sample_character_data["data"]["name"]

    def test_write_to_png_create_if_not_exists(self, handler, sample_character_data, tmp_path):
        """Test write_metadata_to_png creates file if it doesn't exist."""
        new_file = tmp_path / "new_character.png"
        assert not new_file.exists()

        handler.write_metadata_to_png(new_file, sample_character_data, create_if_not_exists=True)

        assert new_file.exists()
        result = handler.read_metadata(str(new_file))
        assert result["data"]["name"] == sample_character_data["data"]["name"]

    def test_write_to_png_file_not_found(self, handler, sample_character_data, tmp_path):
        """Test write_metadata_to_png raises error when file doesn't exist."""
        missing_file = tmp_path / "nonexistent.png"

        with pytest.raises(FileNotFoundError):
            handler.write_metadata_to_png(missing_file, sample_character_data, create_if_not_exists=False)

    def test_write_replaces_existing_metadata(self, handler, png_with_chara_metadata):
        """Test that writing new metadata replaces existing metadata."""
        new_data = {
            "spec": "chara_card_v2",
            "data": {
                "name": "Replaced Character",
                "description": "This replaces the original."
            }
        }

        result = handler.write_metadata(png_with_chara_metadata, new_data)

        read_back = handler.read_metadata(result)
        assert read_back["data"]["name"] == "Replaced Character"

    def test_write_large_metadata(self, handler):
        """Test writing large metadata doesn't cause issues."""
        # Create image
        img = Image.new('RGBA', (100, 100), color='cyan')
        output = BytesIO()
        img.save(output, format='PNG')
        image_data = output.getvalue()

        # Create large metadata (with many lore entries)
        large_data = {
            "spec": "chara_card_v2",
            "data": {
                "name": "Large Data Character",
                "description": "A" * 10000,  # 10KB description
                "character_book": {
                    "entries": [
                        {
                            "id": i,
                            "keys": [f"key{i}"],
                            "content": f"Content for entry {i}" * 100
                        }
                        for i in range(50)  # 50 lore entries
                    ]
                }
            }
        }

        result = handler.write_metadata(image_data, large_data)

        # Verify it can be read back
        read_back = handler.read_metadata(result)
        assert read_back["data"]["name"] == "Large Data Character"
        assert len(read_back["data"]["description"]) == 10000

    def test_write_handles_special_characters(self, handler):
        """Test writing metadata with special characters (unicode, emoji)."""
        img = Image.new('RGBA', (100, 100), color='orange')
        output = BytesIO()
        img.save(output, format='PNG')
        image_data = output.getvalue()

        special_data = {
            "spec": "chara_card_v2",
            "data": {
                "name": "Test Character",
                "description": "Description with special chars: \u00e9\u00e8\u00ea \u4e2d\u6587 \U0001F600\U0001F389"
            }
        }

        result = handler.write_metadata(image_data, special_data)

        read_back = handler.read_metadata(result)
        assert "\u4e2d\u6587" in read_back["data"]["description"]


class TestRoundTrip:
    """Tests for complete read-write round trips."""

    def test_full_v2_card_roundtrip(self, handler, sample_character_data):
        """Test complete V2 character card survives round trip."""
        # Create initial image
        img = Image.new('RGBA', (512, 512), color='gray')
        output = BytesIO()
        img.save(output, format='PNG')
        image_data = output.getvalue()

        # Write metadata
        with_metadata = handler.write_metadata(image_data, sample_character_data)

        # Read back
        result = handler.read_metadata(with_metadata)

        # Verify all fields
        assert result["spec"] == sample_character_data["spec"]
        assert result["spec_version"] == sample_character_data["spec_version"]
        assert result["data"]["name"] == sample_character_data["data"]["name"]
        assert result["data"]["description"] == sample_character_data["data"]["description"]
        assert result["data"]["personality"] == sample_character_data["data"]["personality"]
        assert result["data"]["scenario"] == sample_character_data["data"]["scenario"]
        assert result["data"]["first_mes"] == sample_character_data["data"]["first_mes"]
        assert result["data"]["character_uuid"] == sample_character_data["data"]["character_uuid"]
        assert result["data"]["tags"] == sample_character_data["data"]["tags"]

    def test_multiple_write_operations(self, handler, tmp_path):
        """Test multiple sequential write operations to same file."""
        test_file = tmp_path / "multi_write.png"

        # Create initial file
        img = Image.new('RGBA', (100, 100), color='red')
        img.save(test_file, format='PNG')

        # Write multiple times
        for i in range(5):
            data = {
                "spec": "chara_card_v2",
                "data": {"name": f"Version {i}", "version_num": i}
            }
            handler.write_metadata_to_png(test_file, data)

            # Verify each write
            result = handler.read_metadata(str(test_file))
            assert result["data"]["name"] == f"Version {i}"
            assert result["data"]["version_num"] == i


class TestEdgeCases:
    """Tests for edge cases and error conditions."""

    def test_empty_metadata_dict(self, handler):
        """Test writing empty metadata dict."""
        img = Image.new('RGBA', (100, 100), color='black')
        output = BytesIO()
        img.save(output, format='PNG')

        result = handler.write_metadata(output.getvalue(), {})

        # Should still be valid PNG
        assert result[:8] == b'\x89PNG\r\n\x1a\n'

    def test_very_small_image(self, handler, sample_character_data):
        """Test handling very small (1x1) image."""
        img = Image.new('RGBA', (1, 1), color='white')
        output = BytesIO()
        img.save(output, format='PNG')

        result = handler.write_metadata(output.getvalue(), sample_character_data)

        read_back = handler.read_metadata(result)
        assert read_back["data"]["name"] == sample_character_data["data"]["name"]

    def test_grayscale_image(self, handler, sample_character_data):
        """Test handling grayscale (non-RGBA) image."""
        img = Image.new('L', (100, 100), color=128)
        output = BytesIO()
        img.save(output, format='PNG')

        result = handler.write_metadata(output.getvalue(), sample_character_data)

        read_back = handler.read_metadata(result)
        assert read_back["data"]["name"] == sample_character_data["data"]["name"]

    def test_metadata_with_nested_objects(self, handler):
        """Test handling deeply nested metadata structures."""
        img = Image.new('RGBA', (100, 100), color='pink')
        output = BytesIO()
        img.save(output, format='PNG')

        nested_data = {
            "spec": "chara_card_v2",
            "data": {
                "name": "Nested Test",
                "extensions": {
                    "level1": {
                        "level2": {
                            "level3": {
                                "level4": {
                                    "deep_value": "found it!"
                                }
                            }
                        }
                    }
                }
            }
        }

        result = handler.write_metadata(output.getvalue(), nested_data)
        read_back = handler.read_metadata(result)

        assert read_back["data"]["extensions"]["level1"]["level2"]["level3"]["level4"]["deep_value"] == "found it!"
