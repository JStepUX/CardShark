# backend/character_endpoints.py
# Implements API endpoints for character operations
from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse, Response
from pathlib import Path
import urllib.parse
import traceback
import json
from typing import Dict, List, Optional
import os
import re

# Import handlers
from backend.log_manager import LogManager
from backend.character_validator import CharacterValidator
from backend.png_metadata_handler import PngMetadataHandler
from backend.errors import CardSharkError
from backend.backyard_handler import BackyardHandler

# Create router
router = APIRouter()

# Initialize local instances (for router pattern)
logger = LogManager()
validator = CharacterValidator(logger)
png_handler = PngMetadataHandler(logger)

class CharacterEndpoints:
    """Encapsulates character-related endpoints."""
    
    def __init__(self, logger, png_handler, validator, settings_manager, backyard_handler=None):
        """Initialize with dependencies."""
        self.logger = logger
        self.png_handler = png_handler
        self.validator = validator
        self.settings_manager = settings_manager
        self.backyard_handler = backyard_handler
        
    def register_routes(self, router):
        """Register all character endpoints with the provided router."""
        
        @router.post("/api/validate-directory")
        async def validate_directory(request: Request):
            """Validate that a directory exists and contains at least one PNG file."""
            try:
                data = await request.json()
                directory = data.get('directory')
                
                if not directory:
                    self.logger.log_warning("No directory provided for validation")
                    return {"success": False, "message": "No directory provided"}
                    
                # Convert to Path object and resolve
                directory_path = Path(directory).resolve()
                
                if not directory_path.exists():
                    self.logger.log_step(f"Directory not found: {directory_path}")
                    return {"exists": False, "message": "Directory not found"}
                    
                if not directory_path.is_dir():
                    self.logger.log_step(f"Not a directory: {directory_path}")
                    return {"exists": False, "message": "Not a directory"}
                    
                # Check for PNG files
                png_files = list(directory_path.glob("*.png"))
                
                return {
                    "exists": True,
                    "has_png_files": len(png_files) > 0,
                    "message": f"Directory exists with {len(png_files)} PNG files"
                }
                
            except Exception as e:
                self.logger.log_error(f"Error validating directory: {str(e)}")
                return {"success": False, "message": f"Error: {str(e)}"}
                
        @router.get("/api/characters")
        async def list_characters(directory: str):
            """List character filenames (PNG and JSON) in the specified directory."""
            try:
                # Convert to absolute path if relative
                directory_path = Path(directory).resolve()
                
                self.logger.log_step(f"Scanning directory: {directory_path}")
                
                if not directory_path.exists():
                    self.logger.log_step(f"Directory not found: {directory_path}")
                    return {
                        "exists": False,
                        "message": "Directory not found",
                        "files": []
                    }
                    
                if not directory_path.is_dir():
                    self.logger.log_step(f"Not a directory: {directory_path}")
                    return {
                        "exists": False,
                        "message": "Not a directory",
                        "files": []
                    }
                    
                # List all PNG files
                png_files = []
                for file in directory_path.glob("*.png"):
                    png_files.append({
                        "name": file.stem,
                        "path": str(file),
                        "size": file.stat().st_size,
                        "modified": file.stat().st_mtime
                    })
                    
                # Sort alphabetically by name
                png_files.sort(key=lambda x: x["name"].lower())
                
                self.logger.log_step(f"Found {len(png_files)} PNG files")
                
                return {
                    "exists": True,
                    "message": "Successfully scanned directory",
                    "directory": str(directory_path),
                    "files": png_files
                }
                
            except Exception as e:
                self.logger.log_error(f"Error scanning directory: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to scan directory: {str(e)}"
                )

        @router.get("/api/character-image/{encoded_path:path}")
        async def get_character_image(encoded_path: str):
            """Serve a character image file based on its absolute path."""
            try:
                # Decode the URL-encoded path
                file_path_str = urllib.parse.unquote(encoded_path)
                file_path = Path(file_path_str).resolve()
                
                self.logger.log_step(f"Serving character image: {file_path}")
                
                if not file_path.exists():
                    self.logger.log_warning(f"Character image not found: {file_path}")
                    raise HTTPException(status_code=404, detail="Character image not found")
                    
                if not file_path.is_file():
                    self.logger.log_warning(f"Not a file: {file_path}")
                    raise HTTPException(status_code=400, detail="Not a file")
                    
                # Security check - only allow PNG files
                if file_path.suffix.lower() != ".png":
                    self.logger.log_warning(f"Not a PNG file: {file_path}")
                    raise HTTPException(status_code=400, detail="Not a PNG file")
                    
                return FileResponse(file_path)
                
            except HTTPException as http_exc:
                # Re-raise HTTP exceptions
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error serving character image: {str(e)}")
                raise HTTPException(status_code=500, detail=str(e))

        @router.delete("/api/character/{encoded_path:path}")
        async def delete_character(encoded_path: str):
            """Delete a character file based on its absolute path."""
            try:
                # Decode the URL-encoded path
                file_path_str = urllib.parse.unquote(encoded_path)
                file_path = Path(file_path_str).resolve()
                
                # Extract filename for error reporting
                file_name = file_path.name
                
                self.logger.log_step(f"Attempting to delete character file: {file_path}")

                # Security Check: Ensure the requested path is within the allowed character directory
                allowed_base = Path(self.settings_manager.settings.get("character_directory") or "./characters").resolve()
                if not str(file_path).startswith(str(allowed_base)):
                    self.logger.log_warning(f"Character deletion denied (outside allowed dir): {file_path}")
                    raise HTTPException(status_code=403, detail=f"Access denied: Cannot delete files outside the character directory")

                # Check if file exists before attempting deletion
                if not file_path.exists():
                    self.logger.log_warning(f"Character file not found for deletion: {file_path}")
                    raise HTTPException(status_code=404, detail=f"File not found: {file_name}")
                
                if not file_path.is_file():
                    self.logger.log_warning(f"Not a file: {file_path}")
                    raise HTTPException(status_code=400, detail=f"Not a file: {file_name}")
                
                # Delete the file
                try:
                    os.remove(file_path)
                    self.logger.log_step(f"Character file deleted: {file_path}")
                    
                    # Also try to delete associated JSON file if it exists
                    json_file_path = file_path.with_suffix(".json")
                    if json_file_path.exists() and json_file_path.is_file():
                        os.remove(json_file_path)
                        self.logger.log_step(f"Also deleted associated JSON file: {json_file_path}")
                        
                    return JSONResponse(status_code=200, content={
                        "success": True,
                        "message": f"Character '{file_name}' deleted successfully"
                    })
                    
                except PermissionError as pe:
                    self.logger.log_error(f"Permission error deleting character file: {pe}")
                    raise HTTPException(status_code=403, detail=f"Permission denied when trying to delete {file_name}. The file may be in use.")
                    
                except Exception as del_err:
                    self.logger.log_error(f"Error during file deletion: {del_err}")
                    raise HTTPException(status_code=500, detail=f"Failed to delete {file_name}: {str(del_err)}")

            except HTTPException as http_exc:
                # Re-raise HTTP exceptions
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Unexpected error in character deletion: {str(e)}")
                self.logger.log_error(traceback.format_exc())
                raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

        @router.get("/api/character-metadata/{encoded_path:path}")
        async def get_character_metadata(encoded_path: str):
            """Extract and return metadata from a character PNG file."""
            try:
                # Decode the URL-encoded path
                file_path_str = urllib.parse.unquote(encoded_path)
                file_path = Path(file_path_str).resolve()
                
                self.logger.log_step(f"Extracting metadata from: {file_path}")
                
                if not file_path.exists():
                    self.logger.log_warning(f"Character file not found: {file_path}")
                    raise HTTPException(status_code=404, detail="File not found")
                    
                if not file_path.is_file():
                    self.logger.log_warning(f"Not a file: {file_path}")
                    raise HTTPException(status_code=400, detail="Not a file")
                    
                # Read the file
                with open(file_path, 'rb') as f:
                    content = f.read()
                    
                # Extract metadata
                metadata = self.png_handler.read_metadata(content)
                
                if not metadata:
                    self.logger.log_warning(f"No metadata found in file: {file_path}")
                    raise HTTPException(status_code=400, detail="No metadata found in file")
                    
                # Normalize with CharacterValidator
                normalized_metadata = self.validator.normalize(metadata)
                
                return JSONResponse(status_code=200, content={"success": True, "metadata": normalized_metadata})

            except HTTPException as http_exc:
                # Re-raise known HTTP errors
                raise http_exc
            except CardSharkError as cse:
                self.logger.log_error(f"CardSharkError getting metadata for '{encoded_path}': {str(cse)}")
                raise HTTPException(status_code=400, detail=str(cse))
            except Exception as e:
                self.logger.log_error(f"Error getting character metadata '{encoded_path}': {str(e)}")
                self.logger.log_error(traceback.format_exc())
                raise HTTPException(status_code=500, detail="Internal server error getting metadata")

        @router.post("/api/import-backyard")
        async def import_backyard(request: Request):
            """Import character from Backyard.ai URL."""
            if not self.backyard_handler:
                self.logger.log_error("Backyard handler not initialized")
                raise HTTPException(status_code=500, detail="Backyard handler not initialized")
                
            try:
                data = await request.json()
                url = data.get('url')
                
                if not url:
                    return JSONResponse(
                        status_code=400, 
                        content={"success": False, "message": "No URL provided"}
                    )
                
                metadata, preview_url = self.backyard_handler.import_character(url)
                
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "metadata": metadata,
                        "imageUrl": preview_url
                    }
                )
            except Exception as e:
                self.logger.log_error(f"Import failed: {str(e)}")
                return JSONResponse(
                    status_code=500,
                    content={"success": False, "message": str(e)}
                )

        @router.post("/api/save-png")
        async def save_png(
            file: UploadFile = File(...),
            metadata: str = Form(...),
            save_directory: Optional[str] = Form(None),
        ):
            """Handle PNG save with validation."""
            try:
                content = await file.read()
                metadata_dict = json.loads(metadata)
                # Validate metadata before saving
                validated_metadata = self.validator.normalize(metadata_dict)
                char_name = validated_metadata.get("data", {}).get("name", "character")
                
                # Clean filename
                safe_name = re.sub(r'[<>:"/\\|?*]', '_', char_name)
                filename = f"{safe_name}.png"
                
                if save_directory:
                    try:
                        save_path = Path(save_directory) / filename
                        self.logger.log_step(f"Attempting to save to: {save_path}")
                        
                        # Generate unique filename if file exists
                        base_name = save_path.stem
                        extension = save_path.suffix
                        counter = 1
                        while save_path.exists():
                            save_path = Path(save_directory) / f"{base_name}_{counter}{extension}"
                            counter += 1
                        
                        self.logger.log_step(f"Final save path: {save_path}")
                        
                        # Try writing file with unique name using validated metadata
                        updated_content = self.png_handler.write_metadata(content, validated_metadata)

                        with open(save_path, 'wb') as f:
                            f.write(updated_content)
                        
                        if not save_path.exists():
                            self.logger.log_error(f"File was not created: {save_path}")
                            raise HTTPException(status_code=500, detail="File write failed")
                            
                        file_size = save_path.stat().st_size
                        self.logger.log_step(f"File written successfully. Size: {file_size} bytes")
                        
                        return Response(content=updated_content, media_type="image/png")
                        
                    except PermissionError as pe:
                        self.logger.log_error(f"Permission denied: {str(pe)}")
                        raise HTTPException(status_code=403, detail=str(pe))
                        
                    except Exception as e:
                        self.logger.log_error(f"Save failed: {str(e)}")
                        self.logger.log_error(traceback.format_exc())
                        raise HTTPException(status_code=500, detail=str(e))
                
                # If no directory specified, return validated content for browser download
                updated_content = self.png_handler.write_metadata(content, validated_metadata)
                return Response(content=updated_content, media_type="image/png")
                
            except Exception as e:
                self.logger.log_error(f"Unexpected error: {str(e)}")
                self.logger.log_error(traceback.format_exc())
                raise HTTPException(status_code=500, detail=str(e))

# Add direct routes here for router pattern usage
# Example:
# @router.get("/api/character-count")
# async def get_character_count():
#     return {"count": 0}