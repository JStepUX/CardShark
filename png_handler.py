import os
import base64
import json
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import tkinter as tk
from tkinter import filedialog
from constants import *

class PngHandler:
    def __init__(self, json_text, json_handler, lore_manager, status_var, logger):
        """Initialize PNG Handler with required dependencies."""
        self.json_text = json_text
        self.json_handler = json_handler
        self.lore_manager = lore_manager
        self.status_var = status_var
        self.logger = logger
        self.current_file = None
        self.image_loaded_callback = None
        self.last_saved_directory = None
        self.status_frame = None
        self.folder_button = None
        # Initialize the V2CardHandler
        from v2_handler import V2CardHandler  # Import here to avoid circular imports
        self.v2_handler = V2CardHandler(logger)

    def set_status_frame(self, status_frame, folder_button):
        """Set reference to status frame and folder button."""
        self.status_frame = status_frame
        self.folder_button = folder_button

    def set_image_loaded_callback(self, callback):
        """Set callback to be called when image is loaded."""
        self.image_loaded_callback = callback

    def load_png(self):
        """Load and process a PNG file."""
        self.logger.start_operation("Load PNG")
        file_path = filedialog.askopenfilename(filetypes=[("PNG files", "*.png")])
        if not file_path:
            self.logger.log_step("Operation cancelled")
            self.logger.end_operation()
            return
                
        try:
            self.current_file = file_path
            self.logger.log_step(f"Loading file: {file_path}")
                
            with Image.open(file_path) as image:
                self.original_metadata = dict(image.info)
                self.original_mode = image.mode
                self.logger.log_step("Image properties", {
                    "Mode": self.original_mode,
                    "Size": image.size,
                    "Format": image.format
                })
                    
                # Use V2Handler to read the character data
                metadata = self.v2_handler.read_character_data(image)
                    
            if metadata:
                self.logger.log_step("Character data loaded", metadata)
                    
                # Update main JSON display
                formatted_json = json.dumps(metadata, indent=4, ensure_ascii=False)
                self.json_text.delete(1.0, "end-1c")
                self.json_text.insert(1.0, formatted_json)
                    
                # Use the proven update path from url_handler
                self.json_handler.update_specific_fields(metadata)
                self.status_var.set("Character data loaded successfully")
            else:
                self.logger.log_step("No valid character data found")
                self.status_var.set("No valid character data found in PNG")
                
            # Call the image loaded callback if set
            if self.image_loaded_callback:
                self.image_loaded_callback(file_path)
                    
        except Exception as e:
            self.logger.log_step(f"Error loading PNG: {str(e)}")
            self.status_var.set(f"Error: {str(e)}")
            Messagebox.show_error(f"Failed to read PNG metadata: {str(e)}", "Error")
                
        self.logger.end_operation()

    def save_png(self):
        """Save character data to PNG file using PIL."""
        self.logger.start_operation("Save PNG")

        if not self.current_file:
            self.logger.log_step("No PNG file loaded")
            self.logger.end_operation()
            self.status_var.set("No PNG file loaded")
            return

        try:
            # Ensure all edits are captured in the main JSON
            self.json_handler.update_main_json()

            # Get and validate JSON
            json_str = self.json_text.get("1.0", "end-1c").strip()
            json_data = json.loads(json_str)

            # Get save filepath
            original_name = os.path.basename(self.current_file)
            base_name, ext = os.path.splitext(original_name)
            suggested_name = f"{base_name}_edit{ext}"

            # Determine initial directory
            if self.current_file:
                initial_dir = os.path.dirname(self.current_file)
            else:
                initial_dir = os.path.expanduser("~/Desktop")

            new_file_path = filedialog.asksaveasfilename(
                defaultextension=".png",
                filetypes=[("PNG files", "*.png")],
                initialdir=initial_dir,
                initialfile=suggested_name
            )

            if not new_file_path:
                self.logger.log_step("Save cancelled by user")
                self.logger.end_operation()
                return

            # Convert JSON to base64
            json_bytes = json.dumps(json_data).encode('utf-8')
            base64_str = base64.b64encode(json_bytes).decode('utf-8')

            # Open and save image with new metadata
            with Image.open(self.current_file) as image:
                # Create new metadata
                metadata = PngInfo()
                metadata.add_text('chara', base64_str)

                # Save with new metadata
                image.save(new_file_path, 'PNG', pnginfo=metadata)

            # Update UI
            self.last_saved_directory = os.path.dirname(new_file_path)
            self.status_var.set(f"Character data saved successfully to {os.path.basename(new_file_path)}")

        except json.JSONDecodeError as e:
            self.logger.log_step(f"JSON decode error: {str(e)}")
            self.status_var.set("Error: Invalid JSON format")
            MessageDialog.error("The JSON data is not properly formatted", "Error")
        except Exception as e:
            self.logger.log_step(f"Save error: {str(e)}")
            self.status_var.set(f"Error: {str(e)}")
            MessageDialog.error(f"Failed to save metadata: {str(e)}", "Error")
        finally:
            self.logger.end_operation()