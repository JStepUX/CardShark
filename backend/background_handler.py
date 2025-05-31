import os
import sys
from pathlib import Path
from typing import List, Dict, Optional
from PIL import Image
import uuid
import shutil
import json

class BackgroundHandler:
    def __init__(self, logger):
        self.logger = logger
        self.backgrounds_dir = self._get_backgrounds_dir()
        self.metadata_file = self.backgrounds_dir / 'metadata.json'
        self._load_metadata()
        
    def _get_backgrounds_dir(self) -> Path:
        """Get the backgrounds directory path"""
        # Determine base directory based on environment
        if getattr(sys, 'frozen', False):
            # Running as PyInstaller bundle
            base_dir = Path(sys.executable).parent
        else:
            # Running from source
            base_dir = Path(__file__).parent.parent
            
        # Create backgrounds directory if it doesn't exist
        backgrounds_dir = base_dir / 'backgrounds'
        backgrounds_dir.mkdir(parents=True, exist_ok=True)
        
        self.logger.log_step(f"Backgrounds directory: {backgrounds_dir}")
        return backgrounds_dir
    
    def _load_metadata(self):
        """Load background metadata from JSON file"""
        self.metadata = {}
        try:
            if self.metadata_file.exists():
                with open(self.metadata_file, 'r') as f:
                    self.metadata = json.load(f)
                self.logger.log_step(f"Loaded metadata for {len(self.metadata)} backgrounds")
        except Exception as e:
            self.logger.log_error(f"Error loading background metadata: {str(e)}")
            self.metadata = {}
    
    def _save_metadata(self):
        """Save background metadata to JSON file"""
        try:
            with open(self.metadata_file, 'w') as f:
                json.dump(self.metadata, f)
            self.logger.log_step(f"Saved metadata for {len(self.metadata)} backgrounds")
        except Exception as e:
            self.logger.log_error(f"Error saving background metadata: {str(e)}")
    
    def get_all_backgrounds(self) -> List[Dict]:
        """List all background images"""
        try:
            self.logger.log_step("Listing background images")
            backgrounds = []
            
            # Find all image files - now including .gif
            image_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
            for file_path in self.backgrounds_dir.glob('*'):
                if file_path.suffix.lower() in image_extensions:
                    try:
                        # Get basic file info
                        filename = file_path.name
                        background_info = {
                            "name": file_path.stem,
                            "filename": filename,
                            "path": str(file_path),
                            "size": file_path.stat().st_size,
                            "modified": file_path.stat().st_mtime,
                            "isAnimated": file_path.suffix.lower() == '.gif'
                        }
                        
                        # Add metadata if available
                        if filename in self.metadata:
                            background_info.update(self.metadata[filename])
                        
                        backgrounds.append(background_info)
                        self.logger.log_step(f"Found background: {file_path.name}")
                    except Exception as e:
                        self.logger.log_error(f"Error processing background {file_path}: {str(e)}")
                        continue
            
            # Sort by name
            backgrounds.sort(key=lambda x: x["name"].lower())
            
            self.logger.log_step(f"Found {len(backgrounds)} background images")
            return backgrounds
            
        except Exception as e:
            self.logger.log_error(f"Error listing backgrounds: {str(e)}")
            return []
    
    def save_background(self, file_content: bytes, original_filename: str, aspect_ratio: Optional[float] = None) -> Optional[Dict]:
        """Save a new background image"""
        try:
            # Generate a safe filename
            original_name = Path(original_filename).stem
            extension = Path(original_filename).suffix.lower()
            
            # Check if it's a valid image format, now including .gif
            if extension not in ['.jpg', '.jpeg', '.png', '.webp', '.gif']:
                self.logger.log_warning(f"Invalid image format: {extension}")
                return None
            
            # Create a unique filename
            safe_name = ''.join(c for c in original_name if c.isalnum() or c in ['-', '_', ' '])
            unique_id = uuid.uuid4().hex[:8]
            filename = f"{safe_name}_{unique_id}{extension}"
            file_path = self.backgrounds_dir / filename
            
            # Write the file
            with open(file_path, 'wb') as f:
                f.write(file_content)
            
            # Validate it's a valid image - special handling for GIFs
            is_animated = False
            img_width = 0
            img_height = 0
            
            try:
                if extension.lower() == '.gif':
                    # Just try to open the file to validate without calling verify()
                    with Image.open(file_path) as img:
                        # Check if it's animated by trying to seek to the second frame
                        try:
                            img.seek(1)
                            is_animated = True
                        except EOFError:
                            is_animated = False
                        
                        # Get image dimensions
                        img_width, img_height = img.size
                        
                        self.logger.log_step(f"Validated GIF. Animated: {is_animated}")
                else:
                    # For non-GIFs, use verify()
                    with Image.open(file_path) as img:
                        img.verify()
                        # Open again to get dimensions (verify closes the file)
                        with Image.open(file_path) as img2:
                            img_width, img_height = img2.size
            except Exception as e:
                self.logger.log_error(f"Invalid image file: {str(e)}")
                if file_path.exists():
                    file_path.unlink()
                return None
                
            # If aspect ratio wasn't provided, calculate it from dimensions
            if aspect_ratio is None and img_width > 0 and img_height > 0:
                aspect_ratio = img_width / img_height
            
            # Save metadata
            self.metadata[filename] = {
                "aspectRatio": aspect_ratio,
                "isAnimated": is_animated,
                "width": img_width,
                "height": img_height
            }
            self._save_metadata()
            
            # Return file info
            result = {
                "name": safe_name,
                "filename": filename,
                "path": str(file_path),
                "size": file_path.stat().st_size,
                "modified": file_path.stat().st_mtime,
                "isAnimated": is_animated,
                "aspectRatio": aspect_ratio
            }
            
            self.logger.log_step(f"Saved background: {filename} with aspect ratio {aspect_ratio}")
            return result
            
        except Exception as e:
            self.logger.log_error(f"Error saving background: {str(e)}")
            return None
            
    def delete_background(self, filename: str) -> bool:
        """Delete a background image"""
        try:
            file_path = self.backgrounds_dir / filename
            
            if not file_path.exists():
                self.logger.log_warning(f"Background file not found: {filename}")
                return False
                
            # Delete the file
            file_path.unlink()
              # Remove from metadata
            if filename in self.metadata:
                del self.metadata[filename]
                self._save_metadata()
                
            self.logger.log_step(f"Deleted background: {filename}")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error deleting background: {str(e)}")
            return False
    
    def get_background_path(self, filename: str) -> Optional[Path]:
        """Get the path to a background file by filename."""
        try:
            file_path = self.backgrounds_dir / filename
            if file_path.exists():
                return file_path
            else:
                self.logger.log_warning(f"Background file not found: {filename}")
                return None
        except Exception as e:
            self.logger.log_error(f"Error getting background path for {filename}: {str(e)}")
            return None
    
    def initialize_default_backgrounds(self) -> None:
        """Copy default backgrounds from assets directory to backgrounds directory"""
        try:
            # Get the assets directory path
            if getattr(sys, 'frozen', False):
                # Running as PyInstaller bundle
                assets_dir = Path(sys._MEIPASS) / 'assets' / 'backgrounds'
            else:
                # Running from source
                assets_dir = Path(__file__).parent.parent / 'assets' / 'backgrounds'
            
            if not assets_dir.exists():
                self.logger.log_warning(f"Default backgrounds directory not found: {assets_dir}")
                return
            
            # Copy default backgrounds if they don't already exist
            # Now including .gif in the extensions
            for file_path in assets_dir.glob('*'):
                if file_path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp', '.gif']:
                    target_path = self.backgrounds_dir / file_path.name
                    
                    if not target_path.exists():
                        shutil.copy2(file_path, target_path)
                        self.logger.log_step(f"Copied default background: {file_path.name}")
                        
                        # Calculate and store aspect ratio for default backgrounds
                        try:
                            with Image.open(target_path) as img:
                                width, height = img.size
                                aspect_ratio = width / height
                                
                                # Check if it's an animated GIF
                                is_animated = False
                                if file_path.suffix.lower() == '.gif':
                                    try:
                                        img.seek(1)
                                        is_animated = True
                                    except EOFError:
                                        pass
                                
                                # Store metadata
                                self.metadata[file_path.name] = {
                                    "aspectRatio": aspect_ratio,
                                    "isAnimated": is_animated,
                                    "width": width,
                                    "height": height
                                }
                        except Exception as e:
                            self.logger.log_error(f"Error processing default background metadata: {str(e)}")
                    
            # Save metadata after processing all default backgrounds
            self._save_metadata()
            self.logger.log_step("Default backgrounds initialization complete")
        
        except Exception as e:
            self.logger.log_error(f"Error initializing default backgrounds: {str(e)}")