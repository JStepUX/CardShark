import base64
import json
from PIL import Image, PngImagePlugin
from v2_handler import V2CardHandler
import io
from errors import CardSharkError, ErrorType
from json_handler import V2JsonHandler
import os

class PngHandler:
    def __init__(self, logger):
        """Initialize PNG Handler with logger only."""
        self.logger = logger
        self.current_file = None
        self.v2_handler = V2CardHandler(logger)
        self.json_handler = V2JsonHandler(logger)

    def load_card(self, file_path):
        """Load and process a PNG file, returning metadata if found."""
        try:
            self.current_file = file_path
            self.logger.log_step(f"Loading file: {file_path}")
            
            if not os.path.exists(file_path):
                raise CardSharkError(f"File not found: {file_path}", ErrorType.FILE_NOT_FOUND)
            
            with Image.open(file_path) as image:
                if 'chara' not in image.info:
                    raise CardSharkError.no_metadata()
                    
                metadata = self.json_handler.decode_metadata(image.info['chara'])
                self.json_handler.validate_metadata(metadata)
                
                self.logger.log_step("Character data loaded successfully")
                return metadata
                
        except CardSharkError as e:
            self.logger.log_error(f"{e.error_type}: {e.message}")
            raise
        except Exception as e:
            self.logger.log_error(f"Unexpected error: {str(e)}")
            raise CardSharkError.processing_failed(str(e))

    def save_with_metadata(self, input_path, output_path, metadata):
        """Save PNG with updated metadata"""
        try:
            self.logger.log_step(f"Saving file with metadata: {output_path}")
            
            with Image.open(input_path) as image:
                png_info = PngImagePlugin.PngInfo()
                encoded_metadata = self.json_handler.encode_metadata(metadata)
                png_info.add_text('chara', encoded_metadata)
                
                image.save(output_path, "PNG", pnginfo=png_info)
                self.logger.log_step("File saved successfully")
                
                # Verify PNG integrity
                with Image.open(output_path) as img:
                    img.verify()
                self.logger.log_step("PNG integrity verified")
                
        except Exception as e:
            self.logger.log_error(f"Failed to save PNG: {str(e)}")
            raise CardSharkError.processing_failed(str(e))

    def process_png(self, content):
        """Process PNG content and extract metadata."""
        try:
            img = Image.open(io.BytesIO(content))
            metadata = self.v2_handler.read_character_data(img)
            
            if not metadata:
                raise CardSharkError.no_metadata()
                
            return {
                "success": True,
                "metadata": metadata
            }
            
        except CardSharkError as e:
            self.logger.log_error(f"{e.error_type}: {e.message}")
            return {
                "success": False,
                "error": e.message,
                "error_type": e.error_type.value
            }
        except Exception as e:
            error = CardSharkError.processing_failed(str(e))
            self.logger.log_error(f"{error.error_type}: {error.message}")
            return {
                "success": False,
                "error": error.message,
                "error_type": error.error_type.value
            }