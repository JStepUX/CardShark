import os
import sys
from pathlib import Path
from typing import List, Dict, Optional
from PIL import Image
import uuid
import shutil

class BackgroundHandler:
    def __init__(self, logger):
        self.logger = logger
        self.backgrounds_dir = self._get_backgrounds_dir()
        
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
                        backgrounds.append({
                            "name": file_path.stem,
                            "filename": file_path.name,
                            "path": str(file_path),
                            "size": file_path.stat().st_size,
                            "modified": file_path.stat().st_mtime
                        })
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
    
    def save_background(self, file_content: bytes, original_filename: str) -> Optional[Dict]:
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
                        
                        self.logger.log_step(f"Validated GIF. Animated: {is_animated}")
                else:
                    # For non-GIFs, use verify()
                    with Image.open(file_path) as img:
                        img.verify()
            except Exception as e:
                self.logger.log_error(f"Invalid image file: {str(e)}")
                if file_path.exists():
                    file_path.unlink()
                return None
            
            # Return file info
            result = {
                "name": safe_name,
                "filename": filename,
                "path": str(file_path),
                "size": file_path.stat().st_size,
                "modified": file_path.stat().st_mtime
            }
            
            self.logger.log_step(f"Saved background: {filename}")
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
            self.logger.log_step(f"Deleted background: {filename}")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error deleting background: {str(e)}")
            return False
    
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
                    
            self.logger.log_step("Default backgrounds initialization complete")
        
        except Exception as e:
            self.logger.log_error(f"Error initializing default backgrounds: {str(e)}")