import base64
import json
from PIL import Image, PngImagePlugin
from v2_handler import V2CardHandler

class PngHandler:
    def __init__(self, logger):
        """Initialize PNG Handler with logger only."""
        self.logger = logger
        self.current_file = None
        self.v2_handler = V2CardHandler(logger)

    def load_card(self, file_path):
        """Load and process a PNG file, returning metadata if found."""
        try:
            self.current_file = file_path
            self.logger.log_step(f"Loading file: {file_path}")
            
            with Image.open(file_path) as image:
                # Use V2Handler to read the character data
                metadata = self.v2_handler.read_character_data(image)
                
                if metadata:
                    self.logger.log_step("Character data loaded successfully")
                    self.logger.log_step("Metadata:", metadata)  # Log the actual metadata
                    return metadata
                
                self.logger.log_step("No valid character data found")
                return None
                
        except Exception as e:
            self.logger.log_step(f"Error loading PNG: {str(e)}")
            raise ValueError(f"Error processing file: {str(e)}")  # Convert to ValueError

    def save_with_metadata(self, input_path, output_path, metadata):
        """Save metadata to PNG file."""
        try:
            self.logger.log_step(f"Saving to: {output_path}")
            self.logger.log_step("With metadata:", metadata)
            
            # Convert metadata to base64
            json_str = json.dumps(metadata)
            base64_str = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')
            
            # Create new PNG info
            png_info = PngImagePlugin.PngInfo()
            png_info.add_text('chara', base64_str)
            
            # Save image with metadata
            with Image.open(input_path) as image:
                image.save(output_path, 'PNG', pnginfo=png_info)
                
            self.logger.log_step("Save completed successfully")
            return True
            
        except Exception as e:
            self.logger.log_step(f"Error saving PNG: {str(e)}")
            raise