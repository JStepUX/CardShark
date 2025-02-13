from PIL import Image, PngImagePlugin, ExifTags
from typing import Dict, Union, BinaryIO, Optional, Any
from io import BytesIO
import base64
import json

class PngMetadataHandler:
    """Handles reading and writing character card metadata in PNG files."""
    
    def __init__(self, logger):
        self.logger = logger

    def _decode_metadata(self, encoded_data: Union[str, bytes]) -> Dict:
        """Helper to decode base64 metadata."""
        try:
            self.logger.log_step(f"Decoding metadata of type: {type(encoded_data)}")
            
            if isinstance(encoded_data, bytes):
                encoded_data = encoded_data.decode('utf-8', errors='ignore')
                self.logger.log_step("Decoded bytes to string")
            
            # Remove ASCII prefix if present
            if encoded_data.startswith('ASCII\x00\x00\x00'):
                encoded_data = encoded_data[8:]
                self.logger.log_step("Removed ASCII\\x00\\x00\\x00 prefix")
            elif encoded_data.startswith('ASCII'):
                encoded_data = encoded_data[5:]
                self.logger.log_step("Removed ASCII prefix")
            
            # Remove null bytes and whitespace
            encoded_data = encoded_data.strip('\x00').strip()
            
            # Try base64 decode and parse JSON
            decoded = base64.b64decode(encoded_data)
            self.logger.log_step("Successfully decoded base64")
            result = json.loads(decoded)
            self.logger.log_step(f"Parsed JSON structure:")
            self.logger.log_step(json.dumps(result, indent=2)[:500] + "...")  # Log first 500 chars
            return result
            
        except Exception as e:
            self.logger.log_error(f"Failed to decode metadata: {str(e)}")
            raise
            
        except Exception as e:
            self.logger.log_error(f"Failed to decode metadata: {str(e)}")
            raise

    def read_metadata(self, file_data: Union[bytes, BinaryIO]) -> Dict:
        """Read character metadata from a PNG file."""
        try:
            # Convert input to BytesIO
            bio = BytesIO(file_data if isinstance(file_data, bytes) else file_data.read())
            
            # Open image and read metadata
            with Image.open(bio) as image:
                # First try 'chara' field
                if 'chara' in image.info:
                    self.logger.log_step("Found 'chara' metadata")
                    return self._decode_metadata(image.info['chara'])
                
                # Try UserComment in EXIF if no 'chara' field
                if hasattr(image, '_getexif'):
                    exif = image._getexif()
                    if exif:
                        for tag_id, value in exif.items():
                            tag_name = ExifTags.TAGS.get(tag_id, tag_id)
                            if tag_name == 'UserComment' and value:
                                self.logger.log_step("Found UserComment metadata")
                                return self._decode_metadata(value)
                
                # No metadata found
                self.logger.log_step("No character metadata found")
                if hasattr(image, '_getexif'):
                    exif = image._getexif()
                    if exif:
                        self.logger.log_step("EXIF Data Found:")
                        for tag_id, value in exif.items():
                            tag_name = ExifTags.TAGS.get(tag_id, tag_id)
                            self.logger.log_step(f"Tag {tag_name} ({tag_id}): {str(value)[:100]}")
                
                self.logger.log_step("Image Info Keys:")
                for key in image.info:
                    self.logger.log_step(f"Info Key: {key}")
                
                return {}
        except Exception as e:
            self.logger.log_error(f"Failed to read metadata: {str(e)}")
            raise

    def write_metadata(self, image_data: bytes, metadata: Dict) -> bytes:
        """Write character metadata to a PNG file."""
        try:
            # Encode metadata to base64
            json_str = json.dumps(metadata)
            base64_str = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')
            
            # Prepare PNG info
            png_info = PngImagePlugin.PngInfo()
            
            # Write metadata to image
            with Image.open(BytesIO(image_data)) as img:
                # Preserve existing metadata (except 'chara')
                for key, value in img.info.items():
                    if key != 'chara':
                        try:
                            str_value = str(value) if not isinstance(value, (bytes, str)) else value
                            png_info.add_text(key, str_value)
                        except:
                            continue
                
                # Add character metadata
                png_info.add_text('chara', base64_str)
                
                # Save image with metadata
                output = BytesIO()
                img.save(output, format="PNG", pnginfo=png_info, optimize=False)
                return output.getvalue()

        except Exception as e:
            self.logger.log_error(f"Failed to write metadata: {str(e)}")
            raise