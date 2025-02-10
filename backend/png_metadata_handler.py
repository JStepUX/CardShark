from PIL import Image, PngImagePlugin
from typing import Dict, Union, BinaryIO
from io import BytesIO
import base64
import json

class PngMetadataHandler:
    """Handles reading and writing character card metadata in PNG files."""
    
    def __init__(self, logger):
        self.logger = logger

    def read_metadata(self, file_data: Union[bytes, BinaryIO]) -> Dict:
        """Read character metadata from a PNG file."""
        try:
            # Convert input to BytesIO
            bio = BytesIO(file_data if isinstance(file_data, bytes) else file_data.read())
            
            # Open image and read metadata
            with Image.open(bio) as image:
                if 'chara' in image.info:
                    # Decode base64 data
                    encoded_data = image.info['chara']
                    if isinstance(encoded_data, bytes):
                        encoded_data = encoded_data.decode('utf-8')
                    
                    # Remove any ASCII prefix if present
                    if encoded_data.startswith('ASCII\x00\x00\x00'):
                        encoded_data = encoded_data[8:]
                    elif encoded_data.startswith('ASCII'):
                        encoded_data = encoded_data[5:]
                    
                    # Decode and return metadata
                    decoded = base64.b64decode(encoded_data.strip('\x00').strip())
                    return json.loads(decoded)
                
                return {}  # Return empty dict if no metadata found

        except Exception as e:
            self.logger.log_error(f"Failed to read metadata: {str(e)}")
            raise

    # In png_metadata_handler.py
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
                        # Convert value to string if it isn't already
                        try:
                            str_value = str(value) if not isinstance(value, (bytes, str)) else value
                            png_info.add_text(key, str_value)
                        except:
                            # Skip metadata we can't convert
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