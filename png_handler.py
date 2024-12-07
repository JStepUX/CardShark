import os
import sys
import base64
import json
from PIL import Image
import subprocess
import tempfile
import tkinter as tk
from tkinter import filedialog, messagebox
from datetime import datetime
from v2_handler import V2CardHandler

class PngHandler:
    def __init__(self, json_text, json_handler, lore_manager, status_var, logger):
        """Initialize PNG Handler with required dependencies."""
        self.json_text = json_text
        self.json_handler = json_handler
        self.lore_manager = lore_manager
        self.status_var = status_var
        self.logger = logger
        self.current_file = None
        self.original_metadata = {}
        self.original_mode = None
        self.image_loaded_callback = None
        self.last_saved_directory = None
        self.status_frame = None
        self.folder_button = None
        self.v2_handler = V2CardHandler(logger)

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
                
                # Update specific fields and lore table
                self.json_handler.update_specific_fields(metadata)
                self.lore_manager.update_lore_table(metadata)
                
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
            messagebox.showerror("Error", f"Failed to read PNG metadata: {str(e)}")
            
        self.logger.end_operation()

    def set_status_frame(self, status_frame, folder_button):
        """Set reference to status frame and folder button."""
        self.status_frame = status_frame
        self.folder_button = folder_button

    def get_exiftool_paths(self):
        """Get the correct paths for ExifTool and its dependencies."""
        try:
            # Check if running in PyInstaller bundle
            if getattr(sys, 'frozen', False):
                base_path = sys._MEIPASS
            else:
                base_path = os.path.dirname(os.path.abspath(__file__))
                
            # Get all required paths
            perl_lib = os.path.join(base_path, 'exiftool_files', 'lib')
            exiftool_pl = os.path.join(base_path, 'exiftool_files', 'exiftool.pl')
            perl_exe = os.path.join(base_path, 'exiftool_files', 'perl.exe')
            config_path = os.path.join(base_path, '.ExifTool_config')

            # Log all critical paths for ExifTool
            self.logger.log_step("ExifTool paths:")
            self.logger.log_step(f"  Perl library path: {perl_lib}")
            self.logger.log_step(f"  Perl executable: {perl_exe}")
            self.logger.log_step(f"  ExifTool script: {exiftool_pl}")
            self.logger.log_step(f"  Config file path: {config_path}")

            # Ensure all required files exist
            missing_files = []
            for path in [perl_lib, perl_exe, exiftool_pl, config_path]:
                if not os.path.exists(path):
                    missing_files.append(path)

            if missing_files:
                error_message = f"Missing required files for ExifTool: {', '.join(missing_files)}"
                self.logger.log_step(error_message)
                raise FileNotFoundError(error_message)

            # Return paths if all validations pass
            return perl_lib, perl_exe, exiftool_pl, config_path

            
        except Exception as e:
            self.logger.log_step(f"Error getting ExifTool paths: {str(e)}")
            raise

    
    def save_png(self):
        """Save character data to PNG file while preserving original image exactly."""
        self.logger.start_operation("Save PNG")
        temp_file = None
        
        if not self.current_file:
            self.logger.log_step("No PNG file loaded")
            self.logger.end_operation()
            self.status_var.set("No PNG file loaded")
            return
                
        try:
            # Get ExifTool paths
            perl_lib, perl_exe, exiftool_pl, config_path = self.get_exiftool_paths()
            
            # Set up environment for Perl with multiple lib paths
            env = os.environ.copy()
            env['PERL5LIB'] = os.pathsep.join([
                perl_lib,
                os.path.join(os.path.dirname(perl_exe), 'lib'),
                os.path.dirname(exiftool_pl)
            ])
            
            self.logger.log_step(f"PERL5LIB set to: {env['PERL5LIB']}")

            # Ensure all edits are captured in the main JSON
            self.json_handler.update_main_json()
            
            # Get and validate JSON
            json_str = self.json_text.get("1.0", "end-1c").strip()
            json_data = json.loads(json_str)
            
            # Minify JSON
            minified_json = json.dumps(json_data, separators=(',', ':'), ensure_ascii=False)
            
            # Create temp directory if needed
            temp_dir = os.path.join(os.path.dirname(perl_exe), 'temp')
            os.makedirs(temp_dir, exist_ok=True)

            # Create temp file for metadata
            with tempfile.NamedTemporaryFile(mode='w', delete=False, dir=temp_dir, suffix='.txt') as f:
                temp_file = f.name
                char_data_b64 = base64.b64encode(minified_json.encode('utf-8')).decode('utf-8')
                f.write(char_data_b64)
                self.logger.log_step(f"Created temp metadata file: {temp_file}")

            # Get save filepath
            original_name = os.path.basename(self.current_file)
            base_name, ext = os.path.splitext(original_name)
            suggested_name = f"{base_name}_edit{ext}"

            # Determine initial directory
            if self.current_file and not self.current_file.startswith(tempfile.gettempdir()):
                initial_dir = os.path.dirname(self.current_file)
            else:
                possible_dirs = [
                    os.path.expanduser("~/Downloads"),
                    os.path.dirname(os.path.abspath(__file__)),
                    os.path.expanduser("~/Desktop")
                ]
                initial_dir = next((d for d in possible_dirs if os.path.exists(d)), 
                                os.path.expanduser("~"))

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

            # Make exact copy of original file
            import shutil
            shutil.copy2(self.current_file, new_file_path)
            
            # Build ExifTool command
            cmd = [
                perl_exe,
                exiftool_pl,
                '-config', config_path,
                '-n',
                '-charset', 'filename=UTF8',
                f'-Chara<={temp_file}',
                new_file_path
            ]
            
            self.logger.log_step("Running ExifTool command:", ' '.join(cmd))
            result = subprocess.run(cmd, capture_output=True, text=True, env=env)
            self.logger.log_step("ExifTool stdout:", result.stdout)
            self.logger.log_step("ExifTool stderr:", result.stderr)

            if result.returncode != 0:
                raise Exception(f"ExifTool failed: {result.stderr}")
            
            # Clean up the "_original" file
            original_file = new_file_path + "_original"
            if os.path.exists(original_file):
                try:
                    os.remove(original_file)
                    self.logger.log_step("Cleaned up _original file")
                except Exception as e:
                    self.logger.log_step(f"Warning: Could not remove _original file: {str(e)}")

            # Update UI
            self.last_saved_directory = os.path.dirname(new_file_path)
            self.status_var.set(f"Character data saved successfully to {os.path.basename(new_file_path)}")
            
            if hasattr(self, 'show_folder_button'):
                self.show_folder_button()
                    
        except json.JSONDecodeError as e:
            self.logger.log_step(f"JSON decode error: {str(e)}")
            self.status_var.set("Error: Invalid JSON format")
            messagebox.showerror("Error", "The JSON data is not properly formatted")
        except Exception as e:
            self.logger.log_step(f"Save error: {str(e)}")
            self.status_var.set(f"Error: {str(e)}")
            messagebox.showerror("Error", f"Failed to save metadata: {str(e)}")
        finally:
            # Clean up temp file
            if temp_file and os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                    self.logger.log_step("Cleaned up temp metadata file")
                except Exception as e:
                    self.logger.log_step(f"Warning: Could not remove temp file: {str(e)}")
            
            self.logger.end_operation()