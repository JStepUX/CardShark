from PIL import Image, PngImagePlugin, ExifTags
from typing import Dict, Union, BinaryIO, Optional, Any
from io import BytesIO
import base64
import json
from pathlib import Path

class PngMetadataHandler:
    """Handles reading and writing character card metadata in PNG files."""
    
    def __init__(self, logger):
        self.logger = logger

    def _decode_metadata(self, encoded_data: Union[str, bytes]) -> Dict:
        """Helper to decode base64 metadata with improved padding handling."""
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
            self.logger.log_step(f"Cleaned data length: {len(encoded_data)}")

            # Check if it's already JSON (some cards use raw JSON instead of base64)
            if (encoded_data.startswith('{') and encoded_data.endswith('}')) or \
               (encoded_data.startswith('[') and encoded_data.endswith(']')):
                try:
                    self.logger.log_step("Data looks like raw JSON, attempting to parse directly")
                    result = json.loads(encoded_data)
                    self.logger.log_step("Successfully parsed raw JSON")
                    return result
                except json.JSONDecodeError:
                    self.logger.log_step("Raw JSON parse failed, proceeding to base64 decode")
            
            # Fix padding - this is the key improvement
            # Base64 data should have length that is a multiple of 4
            # If not, add = characters as padding
            padding_needed = len(encoded_data) % 4
            if padding_needed:
                padding = '=' * (4 - padding_needed)
                encoded_data += padding
                self.logger.log_step(f"Added {4 - padding_needed} padding characters")
                
            # Log a small sample of the encoded data for debugging
            sample_length = min(30, len(encoded_data))
            self.logger.log_step(f"Encoded data sample: {encoded_data[:sample_length]}...")
            
            # Try base64 decode and parse JSON
            try:
                # Try standard base64 decoding first
                decoded = base64.b64decode(encoded_data)
                self.logger.log_step("Successfully decoded with standard base64")
            except Exception as e1:
                self.logger.log_warning(f"Standard base64 decode failed: {str(e1)}")
                try:
                    # Try URL-safe base64 as fallback
                    decoded = base64.urlsafe_b64decode(encoded_data)
                    self.logger.log_step("Successfully decoded with URL-safe base64")
                except Exception as e2:
                    self.logger.log_error(f"URL-safe base64 decode also failed: {str(e2)}")
                    # Last resort: try to clean up the string more aggressively
                    clean_data = ''.join(c for c in encoded_data if c in 
                                        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=')
                    padding_needed = len(clean_data) % 4
                    if padding_needed:
                        clean_data += '=' * (4 - padding_needed)
                    
                    self.logger.log_step(f"Using aggressively cleaned data: {clean_data[:30]}...")
                    decoded = base64.b64decode(clean_data)
                    self.logger.log_step("Successfully decoded with aggressive cleaning")
            
            # Try to decode as UTF-8
            try:
                json_str = decoded.decode('utf-8')
                self.logger.log_step("Decoded base64 to UTF-8 string")
            except UnicodeDecodeError:
                # Try other encodings if UTF-8 fails
                try:
                    json_str = decoded.decode('latin-1')
                    self.logger.log_step("Decoded base64 to latin-1 string")
                except:
                    self.logger.log_warning("Couldn't decode as UTF-8 or latin-1, using bytes directly")
                    json_str = str(decoded)  # Last resort
            
            # Log a small sample of the decoded JSON for debugging
            sample_length = min(100, len(json_str))
            self.logger.log_step(f"JSON sample: {json_str[:sample_length]}...")
            
            # Parse the JSON
            result = json.loads(json_str)
            self.logger.log_step("Successfully parsed JSON structure")
            
            # Log the structure
            if isinstance(result, dict):
                self.logger.log_step(f"Top level keys: {list(result.keys())}")
                for key in result.keys():
                    if isinstance(result[key], dict):
                        self.logger.log_step(f"Nested keys under '{key}': {list(result[key].keys())}")
            
            return result
            
        except Exception as e:
            self.logger.log_error(f"Failed to decode metadata: {str(e)}")
            raise

          
    def read_character_data(self, file_data: Union[str, bytes, BinaryIO]) -> Dict:
        """Alias for read_metadata to match service expectations."""
        return self.read_metadata(file_data)

    def read_metadata(self, file_data: Union[str, bytes, BinaryIO]) -> Dict:
        """Read character metadata from a PNG file, prioritizing EXIF."""
        try:
            # Handle file path string, bytes, or file object
            # Handle file path string, bytes, Path object, or file object
            if isinstance(file_data, (str, Path)):
                with open(str(file_data), 'rb') as f:
                    content = f.read()
                bio = BytesIO(content)
            elif isinstance(file_data, bytes):
                bio = BytesIO(file_data)
            else: # Assume BinaryIO
                bio = BytesIO(file_data.read())

            # Open image and read metadata
            with Image.open(bio) as image:
                self.logger.log_step("Successfully opened PNG image")                # Log all available keys in image.info for initial debugging
                self.logger.log_step("Image Info Keys (initial):")
                for key in image.info:
                    self.logger.log_step(f"Info Key: {key}")
                    value_preview = str(image.info[key])[:100] if isinstance(image.info[key], (str, bytes)) else type(image.info[key]).__name__
                    self.logger.log_step(f"Value preview: {value_preview}")

                # **Prioritize EXIF extraction**
                try:
                    if hasattr(image, '_getexif'):
                        self.logger.log_step("Attempting to get EXIF data using _getexif")
                        exif = image._getexif()
                        if exif:
                            self.logger.log_step("Getting EXIF data using _getexif")
                        else:
                            self.logger.log_step("No EXIF data found via _getexif")
                    else:
                        self.logger.log_step("Image does not support _getexif method")
                        exif = None
                except (OSError, AttributeError, ValueError) as e:
                    self.logger.log_step(f"Error reading EXIF data: {e}")
                    exif = None
                
                if exif:
                    self.logger.log_step("EXIF data found, inspecting EXIF tags...")

                    # 1. Look for UserComment first (common practice)
                    usercomment_tag = None
                    for tag_id, tag_name in ExifTags.TAGS.items():
                        if tag_name == 'UserComment':
                            usercomment_tag = tag_id
                            self.logger.log_step(f"Found UserComment tag ID: {tag_id}")
                            break

                    if usercomment_tag and usercomment_tag in exif:
                        self.logger.log_step("Found UserComment in EXIF data, attempting to decode.")
                        try:
                            return self._decode_metadata(exif[usercomment_tag])
                        except Exception as e:
                            self.logger.log_error(f"Error decoding UserComment: {str(e)}")

                        # 2. If UserComment not found, check for 'chara' directly in EXIF (less standard, but possible)
                        if 'chara' in exif:  # Directly check if 'chara' is an EXIF tag (might not be standard tag ID)
                            self.logger.log_step("Found 'chara' tag directly in EXIF data, attempting to decode.")
                            try:
                                return self._decode_metadata(exif['chara']) # Try to access 'chara' directly - might fail if not standard tag ID
                            except Exception as e:
                                self.logger.log_error(f"Error decoding 'chara' tag from EXIF: {str(e)}")


                        # 3. Log ALL EXIF data for debugging if 'chara' or UserComment not found
                        self.logger.log_step("UserComment and direct 'chara' tag not found in EXIF, logging all EXIF tags:")
                        for tag_id, value in exif.items():
                            tag_name = ExifTags.TAGS.get(tag_id, f"Unknown ({tag_id})")
                            # Safely get a value preview
                            try:
                                value_preview = str(value)[:50] if value else "None"
                            except:
                                value_preview = f"<unrepresentable value of type {type(value).__name__}>"
                            self.logger.log_step(f"  EXIF Tag ID: {tag_id}, Name: {tag_name}, Value: {value_preview}")


                # **Fallback checks (after EXIF)** - for other potential locations, keep these for broader compatibility
                if 'chara' in image.info:
                    self.logger.log_step("Found 'chara' metadata in image.info (non-EXIF), attempting to decode.")
                    try:
                        return self._decode_metadata(image.info['chara'])
                    except Exception as e:
                        self.logger.log_error(f"Error decoding 'chara' field from image.info: {str(e)}")

                if 'ccv3' in image.info:
                    self.logger.log_step("Found 'ccv3' metadata in image.info, attempting to decode.")
                    try:
                        return self._decode_metadata(image.info['ccv3'])
                    except Exception as e:
                        self.logger.log_error(f"Error decoding 'ccv3' field: {str(e)}")

                # Try 'exif' field directly (as before, keep this as a last resort)
                if 'exif' in image.info:
                    self.logger.log_step("Found raw 'exif' data in image.info, attempting to decode.")
                    try:
                        return self._decode_metadata(image.info['exif'])
                    except Exception as e:
                        self.logger.log_error(f"Error processing raw exif data from image.info: {str(e)}")


                # No metadata found in any location
                self.logger.log_error("No character metadata found in EXIF, image.info['chara'], image.info['ccv3'], or raw exif data.")
                return {}

        except Exception as e:
            self.logger.log_error(f"Failed to read metadata: {str(e)}")
            raise

    def write_metadata_to_png(self, file_path: Union[str, Path], metadata: Dict, create_if_not_exists: bool = False):
        """
        Writes metadata to a PNG file at the specified path.
        If the file exists, it preserves the image content.
        If the file does not exist and create_if_not_exists is True, it creates a blank image.
        """
        path = Path(file_path)
        
        if path.exists():
            with open(path, "rb") as f:
                image_data = f.read()
        elif create_if_not_exists:
            self.logger.log_step(f"File {path} does not exist. Creating new blank image.")
            # Create a basic blank image (e.g., 512x512 transparent)
            # Use RGBA for transparency support
            img = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
            bio = BytesIO()
            img.save(bio, format='PNG')
            image_data = bio.getvalue()
        else:
            raise FileNotFoundError(f"PNG file not found at {path} and create_if_not_exists is False")

        # Use the existing write_metadata method to embed the metadata
        new_image_data = self.write_metadata(image_data, metadata)
        
        # Write the new image data back to the file
        with open(path, "wb") as f:
            f.write(new_image_data)
        
        self.logger.log_step(f"Successfully wrote metadata to {path}")

    def write_metadata(self, image_data: bytes, metadata: Dict) -> bytes:
        """Write character metadata to a PNG file with improved error handling and metadata preservation."""
        try:
            # Encode metadata to base64
            json_str = json.dumps(metadata)
            base64_str = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')
            
            # Log metadata size for debugging
            self.logger.log_step(f"Encoding metadata: JSON size: {len(json_str)} bytes, Base64 size: {len(base64_str)} bytes")
            
            # Prepare PNG info
            png_info = PngImagePlugin.PngInfo()
            
            # Write metadata to image
            with Image.open(BytesIO(image_data)) as img:
                # Log original image size and format for debugging
                self.logger.log_step(f"Original image: {img.size}, format: {img.format}")
                
                # Preserve existing metadata (except character data)
                preserved_keys = []
                for key, value in img.info.items():
                    if key not in ['chara', 'ccv3', 'exif']:  # Don't copy existing character data
                        try:
                            if isinstance(value, (str, bytes)):
                                png_info.add_text(key, value)
                                preserved_keys.append(key)
                            elif hasattr(value, '__str__'):
                                str_value = str(value)
                                png_info.add_text(key, str_value)
                                preserved_keys.append(key)
                        except Exception as e:
                            self.logger.log_warning(f"Could not preserve metadata key '{key}': {str(e)}")
                
                self.logger.log_step(f"Preserved {len(preserved_keys)} metadata keys: {preserved_keys}")
                
                # Add character metadata
                png_info.add_text('chara', base64_str)
                self.logger.log_step("Added 'chara' metadata to PNG")
                
                # Save image with metadata, ensuring we maintain original format and quality
                output = BytesIO()
                
                # Make sure we're saving as PNG
                img.save(output, format="PNG", pnginfo=png_info, optimize=False)
                self.logger.log_step("Saved image with metadata")
                
                # Verify metadata was written correctly
                output_bytes = output.getvalue()
                self.logger.log_step(f"Output image size: {len(output_bytes)} bytes")
                
                # Sanity check - try to read back the metadata
                try:
                    verification = BytesIO(output_bytes)
                    with Image.open(verification) as verify_img:
                        if 'chara' in verify_img.info:
                            self.logger.log_step("Metadata verification successful - 'chara' field present")
                        else:
                            self.logger.log_warning("Metadata verification failed - 'chara' field missing")
                except Exception as e:
                    self.logger.log_warning(f"Could not verify metadata: {str(e)}")
                
                return output_bytes

        except Exception as e:
            self.logger.log_error(f"Failed to write metadata: {str(e)}")
            self.logger.log_error(f"Error type: {type(e).__name__}")
            raise