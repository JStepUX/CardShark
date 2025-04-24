# backend
# Main FastAPI application file for CardShark
import sys
import os
import argparse
from pathlib import Path
import uuid
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Response, Request # type: ignore
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse # type: ignore
from fastapi.staticfiles import StaticFiles # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
import send2trash
import uvicorn # type: ignore
import json
import base64
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import tempfile
from tempfile import NamedTemporaryFile
import requests # type: ignore
import re
import traceback
from fastapi.responses import FileResponse, JSONResponse # type: ignore
from typing import Optional, Dict, List
import webbrowser
from threading import Timer
import time
from datetime import datetime
import urllib.parse

# Local imports
from backend.log_manager import LogManager  # Change to relative import
from backend.png_metadata_handler import PngMetadataHandler  # For normal operation
from backend.png_debug_handler import PngDebugHandler  
from backend.errors import CardSharkError, ErrorType # Added ErrorType
from backend.backyard_handler import BackyardHandler
from backend.settings_manager import SettingsManager
from backend.character_validator import CharacterValidator
from backend.api_handler import ApiHandler
from backend.chat_handler import ChatHandler
from backend.chat_endpoints import ChatEndpoints  # Import our new chat endpoints
from backend.network_server import run_server
from backend.template_handler import TemplateHandler
from backend.background_handler import BackgroundHandler
from backend.lore_handler import LoreHandler
from backend.handlers.world_state_handler import WorldStateHandler # Added for World Cards
from backend.models.world_state import WorldState, Location # Added Location for type validation
# from backend.world_state_manager import WorldStateManager # Replaced by WorldStateHandler
from backend.room_card_endpoint import router as room_card_router
from backend.handlers.world_card_chat_handler import WorldCardChatHandler # Fixed import path
from backend.koboldcpp_handler import router as koboldcpp_router # Import KoboldCPP router

def get_resource_path(resource_name: str) -> Path:
    """
    Get path to a resource file, handling differences between running as script vs EXE.
    This centralizes path resolution logic for all resources (templates, backgrounds, etc).
    
    Args:
        resource_name: The name of the resource directory (e.g., 'templates', 'backgrounds', 'worlds')
    
    Returns:
        Path object to the resource directory
    """
    exe_path = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).parent.parent
    logger.log_step(f"Base path for resources: {exe_path}")
    
    # First check if resource exists in the distribution directory (alongside the EXE)
    dist_path = exe_path / resource_name
    if dist_path.exists():
        logger.log_step(f"Found {resource_name} in dist directory: {dist_path}")
        return dist_path
        
    # Then check in the PyInstaller _MEI temp directory
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        mei_path = Path(sys._MEIPASS) / resource_name
        if mei_path.exists():
            logger.log_step(f"Found {resource_name} in MEI directory: {mei_path}")
            return mei_path
        
        # Also check under assets subfolder (common PyInstaller pattern)
        mei_assets_path = Path(sys._MEIPASS) / "assets" / resource_name
        if mei_assets_path.exists():
            logger.log_step(f"Found {resource_name} in MEI assets directory: {mei_assets_path}")
            return mei_assets_path
    
    # Fallback to current working directory
    cwd_path = Path.cwd() / resource_name
    logger.log_step(f"Using fallback path for {resource_name}: {cwd_path}")
    return cwd_path

def get_frontend_path() -> Path:
    if getattr(sys, 'frozen', False):  # Running as PyInstaller EXE
        exe_path = Path(sys.executable).parent
        logger.log_step(f"Running as EXE. Executable path: {exe_path}")
        logger.log_step(f"MEI Path: {Path(sys._MEIPASS)}")
        frontend_path = Path(sys._MEIPASS) / "frontend" / "dist"
        logger.log_step(f"Resolved frontend path: {frontend_path}")
        return frontend_path
    else:  # Running as normal Python script
        script_path = Path(__file__).parent.parent
        logger.log_step(f"Running as script. Script path: {script_path}")
        frontend_path = script_path / "frontend" / "dist"
        logger.log_step(f"Resolved frontend path: {frontend_path}")
        return frontend_path
    
# Initialize FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize managers and handlers
logger = LogManager()

# Log environment information
logger.log_step(f"Running in {'frozen/EXE mode' if getattr(sys, 'frozen', False) else 'script mode'}")
if getattr(sys, 'frozen', False):
    logger.log_step(f"Executable path: {Path(sys.executable).resolve()}")
    logger.log_step(f"MEI path: {Path(sys._MEIPASS).resolve()}")
    logger.log_step(f"Current working directory: {Path.cwd().resolve()}")

# Initialize settings manager first as it's needed by other components
settings_manager = SettingsManager(logger)

# Initialize path-dependent handlers with proper resolution
templates_path = get_resource_path("templates")
backgrounds_path = get_resource_path("backgrounds")
users_path = get_resource_path("users")
worlds_path = get_resource_path("worlds")
uploads_path = get_resource_path("uploads")

logger.log_step(f"Templates directory: {templates_path}")
logger.log_step(f"Backgrounds directory: {backgrounds_path}")
logger.log_step(f"Users directory: {users_path}")
logger.log_step(f"Worlds directory: {worlds_path}")
logger.log_step(f"Uploads directory: {uploads_path}")

# Create directories if they don't exist
for path in [templates_path, backgrounds_path, users_path, worlds_path, uploads_path]:
    path.mkdir(parents=True, exist_ok=True)

# Initialize other handlers with resolved paths
png_handler = PngMetadataHandler(logger)
backyard_handler = BackyardHandler(logger)
validator = CharacterValidator(logger)
png_debug = PngDebugHandler(logger)
api_handler = ApiHandler(logger)
chat_handler = ChatHandler(logger)
template_handler = TemplateHandler(logger)
background_handler = BackgroundHandler(logger)  # Removed backgrounds_path parameter
background_handler.initialize_default_backgrounds()
lore_handler = LoreHandler(logger, default_position=0)

# Initialize world state handler with proper path
world_state_handler = WorldStateHandler(logger, settings_manager, worlds_path=worlds_path)
world_card_chat_handler = WorldCardChatHandler(logger, worlds_path=worlds_path)

# API Endpoints

# --- CHARACTERS ENDPOINT ---

@app.post("/api/validate-directory")
async def validate_directory(request: Request):
    """Validate that a directory exists and contains at least one PNG file."""
    try:
        data = await request.json()
        directory = data.get("directory", "")
        if not directory:
            return {"success": False, "message": "No directory provided"}
        
        # Get the target directory as a Path object
        target_dir = Path(directory).resolve()
        logger.log_step(f"Validating directory: {target_dir}")
        
        # Check if directory exists
        if not target_dir.is_dir():
            logger.log_warning(f"Directory not found: {target_dir}")
            return {"success": False, "message": "Directory not found"}
        
        # Get allowed base directory from settings
        allowed_base = Path(settings_manager.settings.get("character_directory") or "./characters").resolve()
        logger.log_step(f"Default allowed base directory: {allowed_base}")
        
        # Get any additional allowed directories from settings (if configured)
        additional_allowed_dirs = settings_manager.settings.get("additional_character_directories", [])
        logger.log_step(f"Additional allowed directories from settings: {additional_allowed_dirs}")
        
        # Check if target is in any allowed directory
        is_allowed = str(target_dir).startswith(str(allowed_base))
        
        # Also check additional directories if not in the main one
        if not is_allowed and additional_allowed_dirs:
            for allowed_dir in additional_allowed_dirs:
                allowed_path = Path(allowed_dir).resolve()
                if str(target_dir).startswith(str(allowed_path)):
                    is_allowed = True
                    logger.log_step(f"Directory allowed via additional directory: {allowed_path}")
                    break
        
        # Special case: Allow SillyTavern paths specifically
        if not is_allowed and "SillyTavern" in str(target_dir):
            is_allowed = True
            logger.log_step(f"SillyTavern directory allowed: {target_dir}")
        
        if not is_allowed:
            logger.log_warning(f"Directory traversal attempt blocked: {target_dir}")
            return {"success": False, "message": "Invalid directory"}
        
        # Check if directory contains PNG files
        png_files = list(target_dir.glob("*.png"))
        if not png_files:
            logger.log_warning(f"No PNG files found in directory: {target_dir}")
            return {"success": False, "message": "No PNG files found in directory"}
        
        logger.log_step(f"Validated directory with {len(png_files)} PNG(s): {target_dir}")
        return {"success": True}
    except Exception as e:
        logger.log_error(f"Error validating directory: {str(e)}")
        return {"success": False, "message": str(e)}

@app.get("/api/characters")
async def list_characters(directory: str):
    """List character filenames (PNG and JSON) in the specified directory. No metadata extraction."""
    try:
        # Basic sanitization: only allow subdirectories under a known safe root
        allowed_base = Path(settings_manager.settings.get("character_directory") or "./characters").resolve()
        target_dir = Path(directory).resolve()
        if not str(target_dir).startswith(str(allowed_base)):
            logger.log_warning(f"Directory traversal attempt blocked: {target_dir}")
            return JSONResponse(status_code=400, content={"success": False, "exists": False, "message": "Invalid directory"})
        if not target_dir.is_dir():
            logger.log_warning(f"Directory not found: {target_dir}")
            return JSONResponse(status_code=404, content={"success": False, "exists": False, "message": "Directory not found"})
        files = []
        for f in target_dir.iterdir():
            if f.is_file() and f.suffix.lower() in [".png", ".json"]:
                files.append({
                    "name": f.name,
                    "path": str(f.resolve()),
                    "size": f.stat().st_size,
                    "modified": int(f.stat().st_mtime)
                })
        logger.log_step(f"Listed {len(files)} character files in {target_dir}")
        return {"exists": True, "files": files, "directory": str(target_dir.resolve())}
    except Exception as e:
        logger.log_error(f"Error listing characters: {str(e)}")
        # Use JSONResponse for consistency and explicit status codes
        return JSONResponse(status_code=500, content={"success": False, "exists": False, "message": str(e)})

# --- CHARACTER IMAGE ENDPOINT ---
@app.get("/api/character-image/{encoded_path:path}")
async def get_character_image(encoded_path: str):
    """Serve a character image file based on its absolute path."""
    try:
        # Decode the URL-encoded path
        file_path_str = urllib.parse.unquote(encoded_path)
        file_path = Path(file_path_str).resolve()

        # Security Check: Ensure the requested path is within the allowed character directory
        allowed_base = Path(settings_manager.settings.get("character_directory") or "./characters").resolve()
        if not str(file_path).startswith(str(allowed_base)):
            logger.log_warning(f"Character image access denied (outside allowed dir): {file_path}")
            raise HTTPException(status_code=403, detail="Access denied")

        if not file_path.is_file() or file_path.suffix.lower() != ".png":
            logger.log_warning(f"Character image not found or not a PNG: {file_path}")
            raise HTTPException(status_code=404, detail="Image not found or not a PNG file")

        logger.log_step(f"Serving character image: {file_path}")
        return FileResponse(file_path)

    except HTTPException as http_exc:
        # Re-raise known HTTP errors (like 404, 403)
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error serving character image '{encoded_path}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error serving image")

# --- NEW CHARACTER DELETE ENDPOINT ---
@app.delete("/api/character/{encoded_path:path}")
async def delete_character(encoded_path: str):
    """Delete a character file based on its absolute path."""
    try:
        # Decode the URL-encoded path
        file_path_str = urllib.parse.unquote(encoded_path)
        file_path = Path(file_path_str).resolve()
        
        # Extract filename for error reporting
        file_name = file_path.name
        
        logger.log_step(f"Attempting to delete character file: {file_path}")

        # Security Check: Ensure the requested path is within the allowed character directory
        allowed_base = Path(settings_manager.settings.get("character_directory") or "./characters").resolve()
        if not str(file_path).startswith(str(allowed_base)):
            logger.log_warning(f"Character deletion denied (outside allowed dir): {file_path}")
            raise HTTPException(status_code=403, detail=f"Access denied: Cannot delete files outside the character directory")

        # Check if file exists before attempting deletion
        if not file_path.exists():
            logger.log_warning(f"Character file not found for deletion: {file_path}")
            raise HTTPException(status_code=404, detail=f"File not found: {file_name}. The file may have been moved or deleted already.")
            
        # Verify it's a PNG file
        if file_path.suffix.lower() != ".png":
            logger.log_warning(f"Attempted to delete non-PNG file: {file_path}")
            raise HTTPException(status_code=400, detail=f"Only PNG character files can be deleted.")

        try:
            # Use send2trash for safer deletion (moves to recycle bin instead of permanent delete)
            send2trash.send2trash(str(file_path))
            logger.log_step(f"Successfully deleted character file: {file_path}")
            
            # Also try to delete associated JSON file if it exists (same name but .json extension)
            json_file_path = file_path.with_suffix(".json")
            if json_file_path.exists():
                send2trash.send2trash(str(json_file_path))
                logger.log_step(f"Also deleted associated JSON file: {json_file_path}")
                
            return JSONResponse(status_code=200, content={
                "success": True,
                "message": f"Character '{file_name}' deleted successfully"
            })
            
        except PermissionError as pe:
            logger.log_error(f"Permission error deleting character file: {pe}")
            raise HTTPException(status_code=403, detail=f"Permission denied when trying to delete {file_name}. The file may be in use.")
            
        except Exception as del_err:
            logger.log_error(f"Error during file deletion: {del_err}")
            raise HTTPException(status_code=500, detail=f"Failed to delete {file_name}: {str(del_err)}")

    except HTTPException as http_exc:
        # Re-raise HTTP exceptions
        raise http_exc
    except Exception as e:
        logger.log_error(f"Unexpected error in character deletion: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
# --- END CHARACTER DELETE ENDPOINT ---

# --- NEW ENDPOINT FOR CHARACTER METADATA ---
@app.get("/api/character-metadata/{encoded_path:path}")
async def get_character_metadata(encoded_path: str):
    """Extract and return metadata from a character PNG file."""
    try:
        # Decode the URL-encoded path
        file_path_str = urllib.parse.unquote(encoded_path)
        file_path = Path(file_path_str).resolve()

        # Security Check: Ensure the requested path is within the allowed character directory
        allowed_base = Path(settings_manager.settings.get("character_directory") or "./characters").resolve()
        if not str(file_path).startswith(str(allowed_base)):
            logger.log_warning(f"Character metadata access denied (outside allowed dir): {file_path}")
            raise HTTPException(status_code=403, detail="Access denied")

        if not file_path.is_file() or file_path.suffix.lower() != ".png":
            logger.log_warning(f"Character metadata source not found or not a PNG: {file_path}")
            raise HTTPException(status_code=404, detail="Character file not found or not a PNG file")

        logger.log_step(f"Reading metadata for character: {file_path}")
        # Use the existing png_handler instance
        # Open the file in binary read mode and pass the content
        with open(file_path, 'rb') as f:
            file_content = f.read()
        metadata = png_handler.read_metadata(file_content)

        if not metadata:
             logger.log_warning(f"No metadata found in character file: {file_path}")
             # Return 404 if no metadata found within the PNG
             return JSONResponse(status_code=404, content={"success": False, "message": "No metadata found in PNG file."})

        # Normalize the extracted metadata (this also validates the structure)
        normalized_metadata = validator.normalize(metadata)
        # The normalize function always returns a dict, even if input is bad.
        # We rely on the frontend to handle potentially empty fields in the normalized data.

        logger.log_step(f"Successfully read and normalized metadata for: {file_path}")
        return JSONResponse(status_code=200, content={"success": True, "metadata": normalized_metadata}) # Return the normalized data

    except HTTPException as http_exc:
        # Re-raise known HTTP errors
        raise http_exc
    except CardSharkError as cse: # Catch specific app errors
        logger.log_error(f"CardSharkError getting metadata for '{encoded_path}': {str(cse)}")
        raise HTTPException(status_code=400, detail=str(cse))
    except Exception as e:
        logger.log_error(f"Error getting character metadata '{encoded_path}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error getting metadata")
# --- END CHARACTER METADATA ENDPOINT ---


# --- USERS ENDPOINTS ---

@app.get("/api/users")
async def list_users():
    """List user profile filenames (PNG) in the users directory."""
    # Use the centralized resource path resolution instead of hardcoded "./users"
    users_dir = users_path
    logger.log_step(f"Attempting to list users from: {users_dir}")
    try:
        if not users_dir.is_dir():
            logger.log_warning(f"Users directory not found: {users_dir}")
            # Create the directory if it doesn't exist
            users_dir.mkdir(parents=True, exist_ok=True)
            logger.log_step(f"Created missing users directory: {users_dir}")
            return JSONResponse(status_code=200, content={"success": True, "files": [], "directory": str(users_dir)})

        files = []
        logger.log_step(f"Reading user files from directory: {users_dir}")
        
        # List all PNG files in the users directory
        for f in users_dir.iterdir():
            # Only list PNG files for user profiles
            if f.is_file() and f.suffix.lower() == ".png":
                logger.log_step(f"Found user image: {f.name}")
                files.append({
                    "name": f.name,
                    "size": f.stat().st_size,
                    "modified": int(f.stat().st_mtime),
                    # Add a URL for the frontend to fetch the image later
                    "imageUrl": f"/api/user-image/{urllib.parse.quote(f.name)}"
                })
                
        logger.log_step(f"Listed {len(files)} user profile files in {users_dir}")
        return JSONResponse(status_code=200, content={"success": True, "files": files, "directory": str(users_dir)})
    except Exception as e:
        logger.log_error(f"Error listing users: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(status_code=500, content={"success": False, "message": f"Internal server error listing users: {str(e)}"})

# Endpoint to serve user images (similar to character images)
@app.get("/api/user-image/{filename}")
async def get_user_image(filename: str):
    """Serve a user profile image file."""
    try:
        # Decode potentially URL-encoded filename
        decoded_filename = urllib.parse.unquote(filename)
        # Basic sanitization - prevent accessing files outside the users dir
        safe_filename = re.sub(r'[^\w\.\-]+', '_', decoded_filename) # Allow letters, numbers, underscore, hyphen, dot

        # Try multiple paths for user images to fix 404 errors
        # First try the users directory in the current path
        users_dir_paths = [
            Path("./users").resolve(),
            Path(sys.executable).parent / "users" if getattr(sys, 'frozen', False) else Path.cwd() / "users",
            users_path
        ]
        
        file_path = None
        
        # Try each potential path
        for users_dir in users_dir_paths:
            potential_path = (users_dir / safe_filename).resolve()
            if potential_path.is_file():
                file_path = potential_path
                logger.log_step(f"Found user image at: {file_path}")
                break
                
        if not file_path:
            # If still not found, check if we need to serve a default image
            logger.log_warning(f"User image not found in any location: {safe_filename}")
            
            # Try to serve a default user image instead
            for users_dir in users_dir_paths:
                default_file = users_dir / "default.png"
                if default_file.is_file():
                    file_path = default_file
                    logger.log_step(f"Using default user image: {file_path}")
                    break
            
            # If no default image, raise 404
            if not file_path:
                raise HTTPException(status_code=404, detail="User image not found")

        # Security Check: Ensure the requested path is within one of the allowed users directories
        is_allowed = False
        for users_dir in users_dir_paths:
            if str(file_path).startswith(str(users_dir)):
                is_allowed = True
                break
                
        if not is_allowed:
            logger.log_warning(f"User image access denied (outside allowed dirs): {file_path}")
            raise HTTPException(status_code=403, detail="Access denied")

        if not file_path.suffix.lower() == ".png":
            logger.log_warning(f"User image not a PNG: {file_path}")
            raise HTTPException(status_code=404, detail="User image must be a PNG file")

        logger.log_step(f"Serving user image: {file_path}")
        return FileResponse(file_path)

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error serving user image '{filename}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error serving user image")

@app.post("/api/user-image/create")
async def create_user_image(file: UploadFile = File(...)):
    """Upload a new user profile PNG image."""
    # Use the centralized resource path resolution instead of hardcoded "./users"
    users_dir = users_path
    logger.log_step(f"Saving user image to: {users_dir}")
    
    try:
        # Validate file type and content
        if not file.filename:
            logger.log_error("Missing filename in upload request")
            raise HTTPException(status_code=400, detail="No filename provided")
            
        # Check file content type
        content_type = file.content_type or ""
        logger.log_step(f"Upload content type: {content_type}")
        
        # More permissive validation - allow any image type but ensure PNG extension
        if not (content_type.startswith('image/') or file.filename.lower().endswith('.png')):
            logger.log_error(f"Invalid file type: {content_type}")
            raise HTTPException(status_code=400, detail="Only image files are allowed for user profiles. Please upload a PNG image.")

        # Extract just the filename without path and ensure .png extension
        filename = Path(file.filename).name
        if not filename.lower().endswith('.png'):
            filename = f"{Path(filename).stem}.png"
            
        # Further sanitize to prevent path traversal or invalid chars
        safe_filename = re.sub(r'[^\w\.\-]+', '_', filename)
        
        # If no extension after sanitizing, add .png
        if not safe_filename.lower().endswith('.png'):
            safe_filename += '.png'
            
        logger.log_step(f"Sanitized filename: {safe_filename}")
        file_path = (users_dir / safe_filename).resolve()
        
        # Ensure the directory exists
        if not users_dir.exists():
            users_dir.mkdir(parents=True, exist_ok=True)
            logger.log_step(f"Created users directory: {users_dir}")

        # Security Check: Ensure the final path is within the allowed users directory
        if not str(file_path).startswith(str(users_dir)):
            logger.log_warning(f"User image upload blocked (path traversal attempt): {file_path}")
            raise HTTPException(status_code=400, detail="Invalid filename or path.")

        # Check for existing file (optional: decide whether to overwrite or reject)
        if file_path.exists():
            logger.log_warning(f"User image '{safe_filename}' already exists. Overwriting.")
            # Or raise HTTPException(status_code=409, detail="File already exists.")

        # Read the uploaded file
        contents = await file.read()
        
        # Ensure it's a valid image
        try:
            # Use PIL to validate and optionally save as PNG
            from PIL import Image
            import io
            img = Image.open(io.BytesIO(contents))
            logger.log_step(f"Valid image detected: {img.format}, size: {img.size}")
            
            # Save the image as PNG
            img.save(file_path, format="PNG")
            logger.log_step(f"Saved user image to: {file_path}")
        except Exception as img_err:
            logger.log_error(f"Invalid image file: {str(img_err)}")
            raise HTTPException(status_code=400, detail="The uploaded file is not a valid image")

        # Return details of the created/updated file
        return JSONResponse(
            status_code=201, # 201 Created
            content={
                "success": True,
                "message": f"User profile image '{safe_filename}' uploaded successfully.",
                "filename": safe_filename,
                "file": {
                    "name": safe_filename,
                    "size": file_path.stat().st_size,
                    "modified": int(file_path.stat().st_mtime),
                    "imageUrl": f"/api/user-image/{urllib.parse.quote(safe_filename)}"
                }
            }
        )

    except HTTPException as http_exc:
        # Re-raise specific HTTP errors
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error uploading user image: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error uploading user image: {str(e)}")


# --- END USERS ENDPOINTS ---


# --- SETTINGS ENDPOINTS ---
@app.get("/api/settings")
async def get_settings():
    try:
        settings = settings_manager.settings
        return {"success": True, "settings": settings}
    except Exception as e:
        logger.log_error(f"Error fetching settings: {str(e)}")
        return {"success": False, "error": str(e)}

@app.post("/api/settings")
async def update_settings(request: Request):
    try:
        updates = await request.json()
        # Merge updates into current settings
        current = settings_manager.settings.copy()
        current.update(updates)
        success = settings_manager._save_settings(current)
        if success:
            settings_manager.settings = current
            return {"success": True, "settings": current}
        else:
            return {"success": False, "error": "Failed to save settings"}
    except Exception as e:
        logger.log_error(f"Error updating settings: {str(e)}")
        return {"success": False, "error": str(e)}

# --- HEALTH ENDPOINT ---
@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

# --- TEMPLATES ENDPOINTS ---
@app.get("/api/templates")
async def get_templates():
    try:
        templates = template_handler.get_all_templates()
        return {"success": True, "templates": templates}
    except Exception as e:
        logger.log_error(f"Error fetching templates: {str(e)}")
        return {"success": False, "error": str(e)}

@app.post("/api/templates")
async def save_templates(request: Request):
    try:
        data = await request.json()
        templates = data.get("templates", [])
        success = template_handler.save_templates(templates)
        if success:
            return {"success": True}
        else:
            return {"success": False, "error": "Failed to save templates"}
    except Exception as e:
        logger.log_error(f"Error saving templates: {str(e)}")
        return {"success": False, "error": str(e)}

app.include_router(room_card_router)
app.include_router(koboldcpp_router) # Include the KoboldCPP router

from fastapi.responses import JSONResponse

# --- World Card API Routes (Phase 1) ---

@app.get("/api/world-cards")
async def list_worlds_api():
    """Lists available world cards."""
    try:
        logger.log_step("Received request to list worlds")
        worlds_metadata = world_state_handler.list_worlds()
        # Enhance metadata if needed (e.g., read character names)
        return JSONResponse(status_code=200, content={"success": True, "worlds": worlds_metadata})
    except Exception as e:
        logger.log_error(f"Error listing worlds: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error listing worlds: {str(e)}")

@app.post("/api/world-cards/create")
async def create_world_api(request: Request):
    """Creates a new world, either empty or based on a character card."""
    try:
        data = await request.json()
        world_name = data.get("world_name")
        character_file_path = data.get("character_file_path") # Optional

        if not world_name:
            raise HTTPException(status_code=400, detail="Missing 'world_name' in request body.")

        logger.log_step(f"Received request to create world: {world_name}")

        if character_file_path:
            logger.log_step(f"Creating world from character: {character_file_path}")
            world_state = world_state_handler.initialize_from_character(world_name, character_file_path)
        else:
            logger.log_step("Creating empty world")
            world_state = world_state_handler.initialize_empty_world_state(world_name)

        # Return success and the created world's state (or just name)
        return JSONResponse(status_code=201, content={"success": True, "world_name": world_state.name, "message": f"World '{world_state.name}' created successfully."})

    except CardSharkError as cse:
        logger.log_error(f"CardSharkError creating world: {cse}")
        status_code = 404 if cse.error_type == ErrorType.FILE_NOT_FOUND else 400
        raise HTTPException(status_code=status_code, detail=str(cse))
    except Exception as e:
        logger.log_error(f"Error creating world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error creating world: {str(e)}")

@app.delete("/api/world-cards/{world_name}")
async def delete_world_card_api(world_name: str):
    """Deletes a world card directory."""
    try:
        logger.log_step(f"Received delete request for world: {world_name}")

        # Basic sanitization to prevent path traversal
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise HTTPException(status_code=400, detail="Invalid world name provided.")

        # Check for world directory in both locations - backend/worlds and frontend/worlds
        backend_world_dir = Path("./worlds").resolve() / safe_world_name
        frontend_world_dir = Path("./frontend/worlds").resolve() / safe_world_name
        
        # Track deletion success separately
        backend_deleted = False
        frontend_deleted = False
        deletion_errors = []

        # Function to safely delete a directory
        async def safe_delete_directory(directory: Path, location_name: str):
            if not directory.is_dir():
                logger.log_warning(f"{location_name} world directory not found for deletion: {directory}")
                return True, None  # Not an error if directory doesn't exist
                
            try:
                logger.log_step(f"Attempting to delete {location_name} world directory using send2trash: {directory}")
                send2trash.send2trash(str(directory))
                logger.log_step(f"Successfully deleted {location_name} world directory: {directory}")
                return True, None
            except PermissionError as e:
                logger.log_warning(f"Permission error deleting {location_name} world directory with send2trash: {e}")
                
                # Fallback: Try using shutil.rmtree with error handling
                try:
                    import shutil
                    import time
                    
                    # Sometimes files might be locked, wait a moment
                    time.sleep(0.5)
                    
                    logger.log_step(f"Attempting fallback deletion with shutil.rmtree: {directory}")
                    shutil.rmtree(directory, ignore_errors=True)
                    
                    # Verify if deletion was successful
                    if not directory.exists():
                        logger.log_step(f"Successfully deleted {location_name} world directory using fallback method.")
                        return True, None
                    else:
                        msg = f"Failed to delete {location_name} world directory even with fallback method."
                        logger.log_error(msg)
                        return False, f"{msg} It may be in use by another process."
                except Exception as fallback_e:
                    msg = f"Error using fallback deletion for {location_name} world directory: {str(fallback_e)}"
                    logger.log_error(msg)
                    return False, f"{msg} You may need to delete it manually."
            except Exception as e:
                msg = f"Error deleting {location_name} world directory: {str(e)}"
                logger.log_error(msg)
                return False, msg

        # Delete backend directory
        backend_deleted, backend_error = await safe_delete_directory(backend_world_dir, "backend")
        if backend_error:
            deletion_errors.append(backend_error)

        # Delete frontend directory if it exists
        frontend_deleted, frontend_error = await safe_delete_directory(frontend_world_dir, "frontend")
        if frontend_error:
            deletion_errors.append(frontendend_error)

        # Check overall deletion result
        if deletion_errors:
            # Return partial success with warnings if at least one directory was deleted
            if backend_deleted or frontend_deleted:
                return JSONResponse(status_code=207, content={  # 207 Multi-Status
                    "success": True,
                    "partial": True,
                    "message": f"World '{world_name}' partially deleted. Some errors occurred.",
                    "errors": deletion_errors
                })
            else:
                # Both deletions failed
                raise HTTPException(status_code=500, 
                                   detail=f"Failed to delete world '{world_name}': {'; '.join(deletion_errors)}")
        
        return JSONResponse(status_code=200, content={
            "success": True, 
            "message": f"World '{world_name}' deleted successfully.",
            "existed": backend_deleted or frontend_deleted
        })

    except HTTPException as http_exc:
        # Re-raise HTTP exceptions
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error deleting world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error deleting world: {str(e)}")

@app.get("/api/world-cards/{world_name}/state")
async def get_world_state_api(world_name: str):
    """Loads the world state for a specific world."""
    try:
        logger.log_step(f"Received load request for world state: {world_name}")
        state = world_state_handler.load_world_state(world_name)
        # Pydantic model is automatically converted to JSON by FastAPI
        return JSONResponse(status_code=200, content=state.dict())
    except CardSharkError as cse:
        logger.log_error(f"CardSharkError loading world state for '{world_name}': {cse}")
        status_code = 404 if cse.error_type == ErrorType.WORLD_NOT_FOUND else 400
        raise HTTPException(status_code=status_code, detail=str(cse))
    except Exception as e:
        logger.log_error(f"Error loading world state for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error loading world state: {str(e)}")

@app.post("/api/world-cards/{world_name}/state")
async def save_world_state_api(world_name: str, request: Request):
    """Saves the world state for a specific world."""
    try:
        data = await request.json()
        logger.log_step(f"Received save request for world state: {world_name}")

        # Validate data with Pydantic model before saving
        try:
            world_state_to_save = WorldState(**data)
        except Exception as e: # Catch Pydantic validation errors
             logger.log_error(f"Invalid world state data received for saving '{world_name}': {e}")
             raise HTTPException(status_code=400, detail=f"Invalid world state format: {e}")

        success = world_state_handler.save_world_state(world_name, world_state_to_save)
        if success:
            return JSONResponse(status_code=200, content={"success": True, "message": f"World state for '{world_name}' saved successfully"})
        else:
            # Assume save_world_state logged the error
            raise HTTPException(status_code=500, detail=f"Failed to save world state for '{world_name}'")
    except Exception as e:
        logger.log_error(f"Error saving world state for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error saving world state: {str(e)}")


@app.post("/api/world-cards/{world_name}/move")
async def move_player_api(world_name: str, request: Request):
    """Moves the player in a specified direction."""
    try:
        data = await request.json()
        direction = data.get("direction")
        if not direction:
            raise HTTPException(status_code=400, detail="Missing 'direction' in request body.")

        logger.log_step(f"Received move request for world '{world_name}', direction: {direction}")

        # --- Placeholder Logic ---
        # 1. Load current state
        state = world_state_handler.load_world_state(world_name)
        # 2. Calculate target coordinates based on current_position and direction
        try:
            coords = list(map(int, state.current_position.split(',')))
            x, y, z = coords[0], coords[1], coords[2]
            target_coords_list = []
            if direction == "north": target_coords_list = [x, y + 1, z]
            elif direction == "south": target_coords_list = [x, y - 1, z]
            elif direction == "east": target_coords_list = [x + 1, y, z]
            elif direction == "west": target_coords_list = [x - 1, y, z]
            elif direction == "up": target_coords_list = [x, y, z + 1]
            elif direction == "down": target_coords_list = [x, y, z - 1]
            else: raise ValueError("Invalid direction")
            target_coords_str = ",".join(map(str, target_coords_list))
        except Exception as e:
             raise HTTPException(status_code=400, detail=f"Invalid current position or direction: {e}")

        # 3. Check if target location exists in state.locations
        if target_coords_str not in state.locations:
             raise HTTPException(status_code=404, detail=f"Location not found at target coordinates: {target_coords_str}")

        # 4. Update current_position and visited_positions
        state.current_position = target_coords_str
        if target_coords_str not in state.visited_positions:
            state.visited_positions.append(target_coords_str)

        # 5. Check for 'enter' events at the new location (implement later)
        # event_info = check_for_events(state, state.locations[target_coords_str], 'enter')
        # if event_info: state.pending_event = event_info

        # 6. Save the updated state
        success = world_state_handler.save_world_state(world_name, state)
        if not success:
             raise HTTPException(status_code=500, detail="Failed to save updated world state after move.")

        # 7. Return the updated state
        logger.log_step(f"Player moved to {target_coords_str} in world '{world_name}'")
        return JSONResponse(status_code=200, content=state.dict())
        # --- End Placeholder Logic ---

    except CardSharkError as cse:
        logger.log_error(f"CardSharkError moving player in '{world_name}': {cse}")
        status_code = 404 if cse.error_type == ErrorType.WORLD_NOT_FOUND else 400
        raise HTTPException(status_code=status_code, detail=str(cse))
    except Exception as e:
        logger.log_error(f"Error moving player in world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error moving player: {str(e)}")


@app.post("/api/world-cards/{world_name}/location/create")
async def create_location_api(world_name: str, request: Request):
    """Creates a new location adjacent to an existing one."""
    try:
        data = await request.json()
        origin_coords_str = data.get("origin_coordinates")
        direction = data.get("direction")

        if not origin_coords_str or not direction:
            raise HTTPException(status_code=400, detail="Missing 'origin_coordinates' or 'direction' in request body.")

        logger.log_step(f"Received request to create location from {origin_coords_str} towards {direction} in world '{world_name}'")

        # --- Placeholder Logic ---
        # 1. Load state
        state = world_state_handler.load_world_state(world_name)

        # 2. Validate origin coordinates exist
        if origin_coords_str not in state.locations:
             raise HTTPException(status_code=404, detail=f"Origin location not found at coordinates: {origin_coords_str}")

        # 3. Calculate target coordinates
        try:
            coords = list(map(int, origin_coords_str.split(',')))
            x, y, z = coords[0], coords[1], coords[2]
            target_coords_list = []
            if direction == "north": target_coords_list = [x, y + 1, z]
            elif direction == "south": target_coords_list = [x, y - 1, z]
            elif direction == "east": target_coords_list = [x + 1, y, z]
            elif direction == "west": target_coords_list = [x - 1, y, z]
            elif direction == "up": target_coords_list = [x, y, z + 1]
            elif direction == "down": target_coords_list = [x, y, z - 1]
            else: raise ValueError("Invalid direction")
            target_coords_str = ",".join(map(str, target_coords_list))
        except Exception as e:
             raise HTTPException(status_code=400, detail=f"Invalid origin coordinates or direction: {e}")

        # 4. Check if target location already exists
        if target_coords_str in state.locations:
             raise HTTPException(status_code=409, detail=f"Location already exists at target coordinates: {target_coords_str}")

        # 5. Create new Location object (basic default)
        new_location_id = f"loc_{uuid.uuid4().hex[:8]}" # Generate a unique ID
        new_location = Location( # Use imported Location type
            name=f"New Room ({direction} from origin)",
            coordinates=target_coords_list,
            location_id=new_location_id,
            description="An empty space, waiting to be defined.",
            introduction="This space feels newly formed and lacks distinct features.", # Added default introduction
            connected=True
        )

        # 6. Add to WorldState
        state.locations[target_coords_str] = new_location

        # 7. Save and return updated state
        success = world_state_handler.save_world_state(world_name, state)
        if not success:
             raise HTTPException(status_code=500, detail="Failed to save world state after creating location.")

        logger.log_step(f"Created new location at {target_coords_str} in world '{world_name}'")
        return JSONResponse(status_code=201, content=state.dict())
        # --- End Placeholder Logic ---

    except CardSharkError as cse:
        logger.log_error(f"CardSharkError creating location in '{world_name}': {cse}")
        status_code = 404 if cse.error_type == ErrorType.WORLD_NOT_FOUND else 400
        raise HTTPException(status_code=status_code, detail=str(cse))
    except Exception as e:
        logger.log_error(f"Error creating location in world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error creating location: {str(e)}")


@app.post("/api/world-cards/{world_name}/connect-location")
async def connect_location_api(world_name: str, request: Request):
    """Connects an unconnected location to the map at specified coordinates."""
    try:
        data = await request.json()
        location_id = data.get("location_id")
        coordinates_list = data.get("coordinates") # Expecting [x, y, z]

        if not location_id or not isinstance(coordinates_list, list) or len(coordinates_list) != 3:
            raise HTTPException(status_code=400, detail="Missing or invalid 'location_id' or 'coordinates' (must be [x, y, z]) in request body.")

        logger.log_step(f"Received request to connect location '{location_id}' at {coordinates_list} in world '{world_name}'")

        success = world_state_handler.connect_location(world_name, location_id, coordinates_list)

        if success:
            # Load the updated state to return it
            updated_state = world_state_handler.load_world_state(world_name)
            return JSONResponse(status_code=200, content=updated_state.dict())
        else:
            # Assume connect_location logged the specific error (e.g., conflict, not found)
            # Return a generic error, or try to determine specific reason?
            # For now, assume 400 for client errors (not found, conflict) and 500 for save errors
            # This might need refinement based on connect_location's error handling
             raise HTTPException(status_code=400, detail=f"Failed to connect location '{location_id}'. It might not exist, or coordinates might conflict.")

    except CardSharkError as cse:
        logger.log_error(f"CardSharkError connecting location in '{world_name}': {cse}")
        status_code = 404 if cse.error_type == ErrorType.WORLD_NOT_FOUND else 400
        raise HTTPException(status_code=status_code, detail=str(cse))
    except Exception as e:
        logger.log_error(f"Error connecting location in world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error connecting location: {str(e)}")

# --- End World Card API Routes ---


# --- NEW ENDPOINT START ---
@app.post("/api/worlds/{world_name}/upload-png")
async def upload_world_png(world_name: str, file: UploadFile = File(...)):
    """Upload a PNG image for a specific world."""
    try:
        logger.log_step(f"Received PNG upload request for world: {world_name}")

        # Define the target directory for world images
        # Ensure world_name is sanitized to prevent path traversal issues
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name) # Basic sanitization
        if not safe_world_name:
             raise HTTPException(status_code=400, detail="Invalid world name provided.")

        worlds_dir = Path("worlds")
        world_image_dir = worlds_dir / safe_world_name / "images"
        world_image_dir.mkdir(parents=True, exist_ok=True)

        # Generate a unique filename to avoid conflicts (optional but recommended)
        # For simplicity now, using original filename, but consider UUIDs later
        # Ensure filename is also sanitized
        safe_filename = re.sub(r'[^\w\.\-]+', '_', file.filename)
        if not safe_filename.lower().endswith(".png"):
             raise HTTPException(status_code=400, detail="Only PNG files are allowed.")

        file_path = world_image_dir / safe_filename

        # Save the uploaded file
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())

        logger.log_step(f"Saved world PNG to: {file_path}")

        # Return the path or URL to the saved image
        # Construct the API path for the new serving endpoint
        api_file_path = f"/api/worlds/images/{safe_world_name}/{safe_filename}"

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"World PNG '{safe_filename}' uploaded successfully for '{safe_world_name}'.",
                "filePath": api_file_path # Use the constructed API path
            }
        )

    except HTTPException as http_exc:
        logger.log_error(f"HTTP error uploading world PNG: {http_exc.detail}")
        raise http_exc # Re-raise HTTPException
    except Exception as e:
        logger.log_error(f"Error uploading world PNG for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
# --- NEW ENDPOINT END ---


@app.get("/api/uploads/{filename}")
async def get_uploaded_image(filename: str):
    """Serve uploaded images."""
    try:
        uploads_dir = Path("uploads")
        file_path = uploads_dir / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Image not found")
            
        return FileResponse(file_path)
    except Exception as e:
        logger.log_error(f"Error serving image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# --- NEW ENDPOINT TO SERVE WORLD IMAGES ---
@app.get("/api/worlds/images/{world_name}/{filename}")
async def get_world_image(world_name: str, filename: str):
    """Serve images uploaded for specific worlds."""
    try:
        # Sanitize inputs
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        safe_filename = re.sub(r'[^\w\.\-]+', '_', filename)

        if not safe_world_name or not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid world name or filename.")

        worlds_dir = Path("worlds")
        file_path = worlds_dir / safe_world_name / "images" / safe_filename

        if not file_path.is_file(): # Check if it's actually a file
            logger.log_warning(f"World image not found at: {file_path}")
            raise HTTPException(status_code=404, detail="World image not found")

        logger.log_step(f"Serving world image from: {file_path}")
        return FileResponse(file_path)

    except HTTPException as http_exc:
        # Log and re-raise known HTTP errors
        logger.log_error(f"HTTP error serving world image: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error serving world image '{filename}' for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        # Return a generic 500 error for unexpected issues
        raise HTTPException(status_code=500, detail="Internal server error while serving image.")
# --- END NEW ENDPOINT ---


# --- NEW ENDPOINT FOR MAIN WORLD CARD UPLOAD ---
@app.post("/api/worlds/{world_name}/upload-card")
async def upload_world_card_image(world_name: str, file: UploadFile = File(...)):
    """Upload the main PNG card image for a specific world."""
    try:
        logger.log_step(f"Received main card PNG upload request for world: {world_name}")

        # Basic sanitization
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
             raise HTTPException(status_code=400, detail="Invalid world name provided.")

        # Ensure it's a PNG
        if not file.filename or not file.filename.lower().endswith(".png"):
             raise HTTPException(status_code=400, detail="Only PNG files are allowed for the world card.")

        # Define the target directory and fixed filename
        worlds_dir = Path("worlds")
        world_dir = worlds_dir / safe_world_name
        world_dir.mkdir(parents=True, exist_ok=True)
        file_path = world_dir / "world_card.png" # Use a fixed name

        # Save the uploaded file
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())

        logger.log_step(f"Saved main world card PNG to: {file_path}")

        # Construct the API path to serve the file
        api_file_path = f"/api/worlds/{safe_world_name}/card"

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"Main world card PNG uploaded successfully for '{safe_world_name}'.",
                "filePath": api_file_path
            }
        )

    except HTTPException as http_exc:
        logger.log_error(f"HTTP error uploading main world card PNG: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error uploading main world card PNG for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# --- NEW ENDPOINT TO LIST WORLDS ---
@app.get("/api/worlds/list")
async def list_worlds():
    """Scans the worlds directory and returns a list of available worlds."""
    worlds_data = []
    worlds_base_dir = Path("worlds")

    if not worlds_base_dir.is_dir():
        logger.log_warning(f"Worlds base directory not found at: {worlds_base_dir}")
        return JSONResponse(status_code=200, content=[]) # Return empty list if base dir doesn't exist

    try:
        for world_dir in worlds_base_dir.iterdir():
            if world_dir.is_dir():
                world_name = world_dir.name # Use directory name as the world identifier/name
                card_image_path = world_dir / "world_card.png"
                state_file_path = world_dir / "world_state.json"

                # Basic info from JSON (optional for now, primarily need the image)
                display_name = world_name # Default to directory name
                description = ""
                if state_file_path.is_file():
                    try:
                        with open(state_file_path, "r", encoding="utf-8") as f:
                            state_data = json.load(f)
                            display_name = state_data.get("name", world_name) # Use name from JSON if available
                            description = state_data.get("description", "")
                    except json.JSONDecodeError:
                        logger.log_warning(f"Could not decode JSON for world: {world_name}")
                    except Exception as e:
                         logger.log_error(f"Error reading state file for {world_name}: {e}")


                if card_image_path.is_file():
                    # Construct the API URL to fetch the card image
                    card_image_url = f"/api/worlds/{world_name}/card"
                    worlds_data.append({
                        "id": world_name, # Use directory name as unique ID
                        "name": display_name,
                        "description": description,
                        "cardImageUrl": card_image_url
                    })
                else:
                    logger.log_warning(f"World card image not found for world: {world_name} at {card_image_path}")
                    # Optionally include worlds even without a card image? For now, only include those with cards.
                    # worlds_data.append({
                    #     "id": world_name,
                    #     "name": display_name,
                    #     "description": description,
                    #     "cardImageUrl": None # Indicate no image
                    # })


        logger.log_step(f"Found {len(worlds_data)} worlds with card images.")
        return JSONResponse(status_code=200, content=worlds_data)

    except Exception as e:
        logger.log_error(f"Error listing worlds: {str(e)}")
        return JSONResponse(status_code=500, content={
            "success": False, 
            "message": f"Failed to list worlds: {str(e)}"
        })

# --- END NEW ENDPOINT ---

# --- NEW ENDPOINT FOR CHARACTER METADATA ---
@app.get("/api/character-metadata/{encoded_path:path}")
async def get_character_metadata(encoded_path: str):
    """Extract and return metadata from a character PNG file."""
    try:
        # Decode the URL-encoded path
        file_path_str = urllib.parse.unquote(encoded_path)
        file_path = Path(file_path_str).resolve()

        # Security Check: Ensure the requested path is within the allowed character directory
        allowed_base = Path(settings_manager.settings.get("character_directory") or "./characters").resolve()
        if not str(file_path).startswith(str(allowed_base)):
            logger.log_warning(f"Character metadata access denied (outside allowed dir): {file_path}")
            raise HTTPException(status_code=403, detail="Access denied")

        if not file_path.is_file() or file_path.suffix.lower() != ".png":
            logger.log_warning(f"Character metadata source not found or not a PNG: {file_path}")
            raise HTTPException(status_code=404, detail="Character file not found or not a PNG file")

        logger.log_step(f"Reading metadata for character: {file_path}")
        # Use the existing png_handler instance
        # Open the file in binary read mode and pass the content
        with open(file_path, 'rb') as f:
            file_content = f.read()
        metadata = png_handler.read_metadata(file_content)

        if not metadata:
             logger.log_warning(f"No metadata found in character file: {file_path}")
             # Return 404 if no metadata found within the PNG
             return JSONResponse(status_code=404, content={"success": False, "message": "No metadata found in PNG file."})

        # Normalize the extracted metadata (this also validates the structure)
        normalized_metadata = validator.normalize(metadata)
        # The normalize function always returns a dict, even if input is bad.
        # We rely on the frontend to handle potentially empty fields in the normalized data.

        logger.log_step(f"Successfully read and normalized metadata for: {file_path}")
        return JSONResponse(status_code=200, content={"success": True, "metadata": normalized_metadata}) # Return the normalized data

    except HTTPException as http_exc:
        # Re-raise known HTTP errors
        raise http_exc
    except CardSharkError as cse: # Catch specific app errors
        logger.log_error(f"CardSharkError getting metadata for '{encoded_path}': {str(cse)}")
        raise HTTPException(status_code=400, detail=str(cse))
    except Exception as e:
        logger.log_error(f"Error getting character metadata '{encoded_path}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error getting metadata")
# --- END CHARACTER METADATA ENDPOINT ---


# --- USER DELETE ENDPOINT ---
@app.delete("/api/user/{filename}")
async def delete_user_image(filename: str):
    """Delete a user profile image file."""
    try:
        # Decode potentially URL-encoded filename
        decoded_filename = urllib.parse.unquote(filename)
        # Basic sanitization - prevent accessing files outside the users dir
        safe_filename = re.sub(r'[^\w\.\-]+', '_', decoded_filename)

        # Use the centralized resource path for users
        users_dir = users_path
        file_path = (users_dir / safe_filename).resolve()

        logger.log_step(f"Attempting to delete user image: {file_path}")

        # Security Check: Ensure the file path is within the allowed users directory
        if not str(file_path).startswith(str(users_dir)):
            logger.log_warning(f"User image deletion denied (outside allowed dir): {file_path}")
            raise HTTPException(status_code=403, detail="Access denied: Cannot delete files outside the user directory")

        # Check if file exists
        if not file_path.exists():
            logger.log_warning(f"User image not found for deletion: {file_path}")
            raise HTTPException(status_code=404, detail=f"File not found: {safe_filename}")
            
        # Verify it's a PNG file
        if not file_path.suffix.lower() == ".png":
            logger.log_warning(f"Attempted to delete non-PNG file: {file_path}")
            raise HTTPException(status_code=400, detail="Only PNG user profile images can be deleted")

        # Use send2trash for safer deletion (moves to recycle bin instead of permanent delete)
        send2trash.send2trash(str(file_path))
        logger.log_step(f"Successfully deleted user image: {file_path}")
            
        return JSONResponse(status_code=200, content={
            "success": True,
            "message": f"User image '{safe_filename}' deleted successfully"
        })
            
    except HTTPException as http_exc:
        # Re-raise known HTTP exceptions
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error deleting user image '{filename}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
# --- END USER DELETE ENDPOINT ---

# --- WORLD CARD CHAT ENDPOINTS ---

@app.get("/api/world/{world_name}/chats")
async def list_world_chats(world_name: str):
    """List all chat sessions for a world."""
    try:
        chats = world_card_chat_handler.list_chats(world_name)
        return JSONResponse(status_code=200, content={
            "success": True, 
            "chats": chats
        })
    except Exception as e:
        logger.log_error(f"Error listing chats for world '{world_name}': {str(e)}")
        return JSONResponse(status_code=500, content={
            "success": False, 
            "message": f"Failed to list chats: {str(e)}"
        })

@app.post("/api/world/{world_name}/chats")
async def create_world_chat(world_name: str, request: Request):
    """Create a new chat session for a world."""
    try:
        data = await request.json()
        title = data.get("title", "New Chat")
        location_id = data.get("location_id", None)
        
        chat_data = world_card_chat_handler.create_chat(
            world_name=world_name,
            title=title,
            location_id=location_id
        )
        
        return JSONResponse(status_code=201, content={
            "success": True, 
            "chat": chat_data
        })
    except Exception as e:
        logger.log_error(f"Error creating chat for world '{world_name}': {str(e)}")
        return JSONResponse(status_code=500, content={
            "success": False, 
            "message": f"Failed to create chat: {str(e)}"
        })

@app.get("/api/world/{world_name}/chats/{chat_id}")
async def get_world_chat(world_name: str, chat_id: str):
    """Get a specific chat session for a world."""
    try:
        chat_data = world_card_chat_handler.get_chat(world_name, chat_id)
        return JSONResponse(status_code=200, content={
            "success": True, 
            "chat": chat_data
        })
    except ValueError as ve:
        logger.log_warning(f"Chat not found: {str(ve)}")
        return JSONResponse(status_code=404, content={
            "success": False, 
            "message": str(ve)
        })
    except Exception as e:
        logger.log_error(f"Error getting chat '{chat_id}' for world '{world_name}': {str(e)}")
        return JSONResponse(status_code=500, content={
            "success": False, 
            "message": str(e)
        })

@app.post("/api/world/{world_name}/chats/{chat_id}/messages")
async def add_chat_message(world_name: str, chat_id: str, request: Request):
    """Add a message to a world chat session."""
    try:
        data = await request.json()
        sender = data.get("sender", "Unknown")
        content = data.get("content", "")
        character_id = data.get("character_id")
        is_user = data.get("is_user", False)
        
        if not content:
            return JSONResponse(status_code=400, content={
                "success": False, 
                "message": "Message content cannot be empty"
            })
        
        updated_chat = world_card_chat_handler.add_message(
            world_name=world_name,
            chat_id=chat_id,
            sender=sender,
            content=content,
            character_id=character_id,
            is_user=is_user
        )
        
        return JSONResponse(status_code=200, content={
            "success": True, 
            "chat": updated_chat
        })
    except ValueError as ve:
        if "Chat not found" in str(ve):
            return JSONResponse(status_code=404, content={
                "success": False, 
                "message": str(ve)
            })
        else:
            return JSONResponse(status_code=400, content={
                "success": False, 
                "message": str(ve)
            })
    except Exception as e:
        logger.log_error(f"Error adding message to chat '{chat_id}' in world '{world_name}': {str(e)}")
        return JSONResponse(status_code=500, content={
            "success": False, 
            "message": str(e)
        })

@app.delete("/api/world/{world_name}/chats/{chat_id}")
async def delete_world_chat(world_name: str, chat_id: str):
    """Delete a chat session from a world."""
    try:
        success = world_card_chat_handler.delete_chat(world_name, chat_id)
        if not success:
            return JSONResponse(status_code=404, content={
                "success": False, 
                "message": f"Chat '{chat_id}' not found or could not be deleted"
            })
        return JSONResponse(status_code=200, content={
            "success": True, 
            "message": f"Chat '{chat_id}' deleted successfully"
        })
    except Exception as e:
        logger.log_error(f"Error deleting chat '{chat_id}' from world '{world_name}': {str(e)}")
        return JSONResponse(status_code=500, content={
            "success": False, 
            "message": f"Failed to delete chat: {str(e)}"
        })

# --- END WORLD CARD CHAT ENDPOINTS ---

@app.get("/api/worlds/{world_name}/card")
async def get_world_card_image(world_name: str):
    """Serve the main card image for a specific world, with fallback to default."""
    try:
        # Basic sanitization
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise HTTPException(status_code=400, detail="Invalid world name provided.")

        # Define possible locations for the world card image
        worlds_dir = Path("worlds")
        world_dir = worlds_dir / safe_world_name
        
        # Try multiple possible filenames in order
        possible_files = [
            world_dir / "world_card.png",
            world_dir / f"{safe_world_name}.png",
            world_dir / "World.png"
        ]
        
        # Check each possible file
        file_path = None
        for possible_file in possible_files:
            if possible_file.is_file():
                file_path = possible_file
                logger.log_step(f"Found world card image at: {file_path}")
                break
        
        if not file_path:
            # If no custom image found, use default from frontend assets
            logger.log_warning(f"Main world card image not found at: {' or '.join(str(p) for p in possible_files)}")
            
            # Try multiple possible paths for default_world.png
            
            default_paths = []
            
            if getattr(sys, 'frozen', False):
                # Running as exe - check in PyInstaller _MEIPASS
                default_paths.append(Path(sys._MEIPASS) / "frontend" / "assets" / "default_world.png")
                # Also check relative to executable
                exe_dir = Path(sys.executable).parent
                default_paths.append(exe_dir / "frontend" / "assets" / "default_world.png")
            else:
                # Development - check relative to backend directory
                default_paths.append(Path(__file__).parent.parent / "frontend" / "src" / "assets" / "default_world.png")
                default_paths.append(Path.cwd() / "frontend" / "src" / "assets" / "default_world.png")
            
            # Also check in common possible locations
            default_paths.append(Path("frontend") / "src" / "assets" / "default_world.png")
            default_paths.append(Path("frontend") / "src" / "assets" / "default_world.png")
            
            # Try each possible default path
            for default_path in default_paths:
                if default_path.is_file():
                    file_path = default_path
                    logger.log_step(f"Using default world card image from: {file_path}")
                    break
            
            # If no default world image found, try using pngPlaceholder as absolute last resort
            if not file_path:
                placeholder_paths = [
                    Path(__file__).parent.parent / "frontend" / "src" / "assets" / "pngPlaceholder.png",
                    Path.cwd() / "frontend" / "src" / "assets" / "pngPlaceholder.png",
                    Path("frontend") / "src" / "assets" / "pngPlaceholder.png"
                ]
                
                for placeholder_path in placeholder_paths:
                    if placeholder_path.is_file():
                        file_path = placeholder_path
                        logger.log_step(f"Using placeholder image as last resort: {file_path}")
                        break
            
            # If we still don't have an image, give up
            if not file_path:
                logger.log_error("Could not find default_world.png or any fallback image")
                raise HTTPException(status_code=404, detail="World card image not found and no default available")
        
        logger.log_step(f"Serving world card image from: {file_path}")
        return FileResponse(file_path)
        
    except HTTPException as http_exc:
        logger.log_error(f"HTTP error serving main world card image for '{world_name}': {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error serving main world card image for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error serving world card image")

# Static files and frontend - must be after all API routes
# Initialize chat endpoints - IMPORTANT ADDITION
chat_endpoints = ChatEndpoints(logger, chat_handler, api_handler)
# Register chat endpoints with the app
chat_endpoints.register_routes(app)

# API generation endpoing
@app.post("/api/generate-stream")
async def generate_stream(request: Request):
    """Streaming generation from an API endpoint."""
    try:
        data = await request.json()
        logger.log_step("Received request to api_handler.stream_generate")
        return StreamingResponse(
            api_handler.stream_generate(data),
            media_type="text/event-stream"
        )
    except Exception as e:
        logger.log_error(f"Error in stream generate: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})

# Mount frontend after all API routes
frontend_path = get_frontend_path()
if frontend_path.exists():
    logger.log_step(f"Mounting frontend static files from: {frontend_path}")
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
else:
    logger.log_warning(f"Frontend path doesn't exist: {frontend_path}")
    
def start_browser():
    """Open the browser after a short delay."""
    try:
        webbrowser.open("http://localhost:4000")
    except Exception as e:
        logger.log_warning(f"Failed to open browser: {str(e)}")

# Main entry point
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='CardShark server')
    parser.add_argument('--port', type=int, default=4000, help='Port to run the server on')
    parser.add_argument('--host', type=str, default="0.0.0.0", help='Host to run the server on')
    parser.add_argument('--no-browser', action='store_true', help='Do not open browser automatically')
    parser.add_argument('--network', action='store_true', help='Start the local network server for device discovery')
    args = parser.parse_args()

    if args.network:
        logger.log_step("Starting network server for device discovery")
        import threading
        network_thread = threading.Thread(target=run_server, args=(logger,))
        network_thread.daemon = True
        network_thread.start()

    # Start the browser after a short delay
    if not args.no_browser:
        logger.log_step("Setting timer to open browser")
        Timer(1.5, start_browser).start()

    logger.log_step(f"Starting uvicorn server on http://{args.host}:{args.port}")
    uvicorn.run("backend.main:app", host=args.host, port=args.port, reload=False)