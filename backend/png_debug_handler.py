"""Debug handler for PNG metadata issues"""
from PIL import Image, ExifTags
from fastapi import UploadFile # type: ignore # ignore
from io import BytesIO
import base64
import json

class PngDebugHandler:
    def __init__(self, logger):
        self.logger = logger
        
    async def debug_png(self, file: UploadFile) -> dict:
        """Debug endpoint handler for PNG files"""
        content = await file.read()
        return self.debug_png_metadata(content)
        
    def debug_png_metadata(self, file_data: bytes) -> dict:
        """Analyze PNG metadata and return debug info"""
        debug_info = {
            "has_chara": False,
            "has_userComment": False,
            "chara_length": 0,
            "userComment_length": 0,
            "raw_data": None,
            "decoded_data": None,
            "error": None
        }
        
        try:
            # Open image from bytes
            with Image.open(BytesIO(file_data)) as img:
                self.logger.log_step("Successfully opened PNG")
                
                # Log complete EXIF data if available
                if hasattr(img, '_getexif'):
                    exif = img._getexif()
                    if exif:
                        self.logger.log_step("Full EXIF data:")
                        for tag_id in exif:
                            tag_name = ExifTags.TAGS.get(tag_id, tag_id)
                            tag_value = exif[tag_id]
                            self.logger.log_step(f"  {tag_name} ({tag_id}): {str(tag_value)[:100]}")
                
                # Log all metadata keys with their exact case
                keys = list(img.info.keys())
                self.logger.log_step(f"Available metadata keys: {keys}")
                
                # Specifically look for any key containing 'chara' case-insensitively
                chara_keys = [k for k in keys if 'chara' in k.lower()]
                self.logger.log_step(f"Found chara-like keys: {chara_keys}")
                
                # Log the type and first few bytes of each chara field
                for key in chara_keys:
                    value = img.info[key]
                    value_type = type(value).__name__
                    preview = str(value[:100]) if isinstance(value, (str, bytes)) else str(value)
                    self.logger.log_step(f"Key '{key}' has type {value_type}, preview: {preview}")
                
                # Check EXIF data
                if 'exif' in img.info:
                    self.logger.log_step("Found EXIF data, checking UserComment...")
                    exif = img._getexif()  # Get raw EXIF data
                    if exif and 0x9286 in exif:  # 0x9286 is UserComment tag
                        usercomment = exif[0x9286]
                        debug_info["has_userComment"] = True
                        debug_info["userComment_length"] = len(usercomment)
                        debug_info["raw_data"] = usercomment
                        self.logger.log_step(f"Found UserComment of length {len(usercomment)}")
                
                if 'chara' in img.info:
                    debug_info["has_chara"] = True
                    debug_info["chara_length"] = len(img.info['chara'])
                    debug_info["raw_data"] = img.info['chara']
                
                # Check userComment field
                if 'userComment' in img.info:
                    debug_info["has_userComment"] = True
                    debug_info["userComment_length"] = len(img.info['userComment'])
                    if not debug_info["raw_data"]:  # Only use if no chara data
                        debug_info["raw_data"] = img.info['userComment']
                
                # Try to decode if we have raw data
                if debug_info["raw_data"]:
                    try:
                        # Clean the data
                        raw_data = debug_info["raw_data"]
                        if isinstance(raw_data, bytes):
                            raw_data = raw_data.decode('utf-8')
                            
                        # Remove ASCII prefix if present
                        if raw_data.startswith('ASCII\x00\x00\x00'):
                            raw_data = raw_data[8:]
                        elif raw_data.startswith('ASCII'):
                            raw_data = raw_data[5:]
                        
                        # Remove null bytes and whitespace
                        raw_data = raw_data.strip('\x00').strip()
                        
                        # Try base64 decode
                        decoded = base64.b64decode(raw_data).decode('utf-8')
                        debug_info["decoded_data"] = json.loads(decoded)
                        
                    except Exception as decode_error:
                        debug_info["error"] = f"Decoding error: {str(decode_error)}"
                        
                                # Check raw text chunks
                    if hasattr(img, 'text'):
                        self.logger.log_step("Raw text chunks:")
                        for chunk_name, chunk_data in img.text.items():
                            self.logger.log_step(f"  {chunk_name}: {str(chunk_data)[:100]}")
                            
                    return debug_info
            
        except Exception as e:
            debug_info["error"] = f"Main error: {str(e)}"
            return debug_info