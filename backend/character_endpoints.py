# backend/character_endpoints.py
# Endpoints for character management

import os
import json
import uuid
import glob
import time
import urllib.parse
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Form, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# Create router
router = APIRouter(
    prefix="/api/characters",
    tags=["characters"],
    responses={404: {"description": "Not found"}},
)

# Set up logger
logger = logging.getLogger("character_endpoints")

# Models
class CharacterModel(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    personality: Optional[str] = None
    backstory: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    user_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class CharacterResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    character: Optional[CharacterModel] = None
    characters: Optional[List[CharacterModel]] = None

# Characters directory
CHARACTERS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "characters")
os.makedirs(CHARACTERS_DIR, exist_ok=True)

# Helper functions
def normalize_path(path: str) -> str:
    """Normalize path for cross-platform compatibility"""
    # Replace URL encoded characters
    path = urllib.parse.unquote(path)
    
    # Special handling for Windows paths from URL parameters
    if os.name == 'nt':
        # Handle URL-encoded drive letters (C%3A/ to C:/)
        if '%3A' in path:
            path = path.replace('%3A', ':')
        
        # Fix forward slashes to backslashes for Windows
        path = path.replace('/', '\\')
        
        # Ensure drive letter is properly formatted
        if len(path) > 1 and path[1] == ':':
            # Make sure drive letter is uppercase for consistency
            path = path[0].upper() + path[1:]
    
    # Use normpath to handle any .. or . in the path
    normalized = os.path.normpath(path)
    
    # Use normcase for consistent case handling, especially on Windows
    normalized = os.path.normcase(normalized)

    logger.debug(f"Normalized path: '{path}' to '{normalized}'")
    return normalized

def get_character_path(character_id: str) -> str:
    """Get the file path for a character"""
    return os.path.join(CHARACTERS_DIR, f"{character_id}.json")

def load_character(character_id: str) -> Optional[Dict[str, Any]]:
    """Load a character from disk"""
    character_path = get_character_path(character_id)
    if not os.path.exists(character_path):
        return None
    
    try:
        with open(character_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading character {character_id}: {e}")
        return None

def save_character(character_data: Dict[str, Any]) -> bool:
    """Save a character to disk"""
    if not character_data.get('id'):
        character_data['id'] = str(uuid.uuid4())
    
    # Update timestamps
    now = datetime.now().isoformat()
    if not character_data.get('created_at'):
        character_data['created_at'] = now
    character_data['updated_at'] = now
    
    character_path = get_character_path(character_data['id'])
    try:
        with open(character_path, 'w', encoding='utf-8') as f:
            json.dump(character_data, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Error saving character: {e}")
        return False

def get_all_characters() -> List[Dict[str, Any]]:
    """Get all characters"""
    characters = []
    if not os.path.exists(CHARACTERS_DIR):
        return characters
        
    for filename in os.listdir(CHARACTERS_DIR):
        if filename.endswith('.json'):
            try:
                character_path = os.path.join(CHARACTERS_DIR, filename)
                with open(character_path, 'r', encoding='utf-8') as f:
                    character = json.load(f)
                    characters.append(character)
            except Exception as e:
                logger.error(f"Error loading character from {filename}: {e}")
    
    return characters

# Add function to scan directory for character files
def scan_directory_for_characters(directory_path: str) -> Dict[str, Any]:
    """Scan a directory for character PNG files, handling case-insensitivity robustly."""
    # Normalize the path for better cross-platform compatibility
    directory = normalize_path(directory_path)
    logger.info(f"Scanning directory for characters: {directory}")

    if not directory or not os.path.exists(directory):
        logger.warning(f"Directory not found: {directory}")
        return {
            "success": False,
            "exists": False,
            "directory": directory,
            "message": f"Directory not found: {directory}"
        }

    try:
        # Use a single case-insensitive pattern to find all PNG files
        pattern = os.path.join(directory, "*.[pP][nN][gG]")  # Case-insensitive match
        logger.info(f"Searching with pattern: {pattern}")
        found_files = glob.glob(pattern)
        logger.info(f"Found {len(found_files)} PNG files")
        
        # Use a dictionary with normalized paths as keys to ensure uniqueness
        unique_files = {}
        for file_path in found_files:
            norm_path = os.path.normcase(os.path.abspath(file_path))
            if norm_path not in unique_files:
                unique_files[norm_path] = file_path
        
        logger.info(f"After deduplication: {len(unique_files)} unique files")

        # Format file information
        files_data = []
        for file_path in unique_files.values():
            try:
                stat = os.stat(file_path)
                name = os.path.basename(file_path)
                # Remove extension (case-insensitive)
                if name.lower().endswith('.png'):
                    name = name[:-4]

                files_data.append({
                    "name": name,
                    "path": file_path,  # Return the original path casing
                    "size": stat.st_size,
                    "modified": int(stat.st_mtime * 1000)  # Convert to milliseconds
                })
            except Exception as e:
                logger.error(f"Error processing file info for {file_path}: {e}")

        # Sort files by name (case-insensitive)
        files_data.sort(key=lambda x: x["name"].lower())
        logger.info(f"Successfully processed {len(files_data)} unique character files in {directory}")

        return {
            "success": True,
            "exists": True,
            "directory": directory,
            "files": files_data
        }
    except Exception as e:
        logger.error(f"Error scanning directory {directory}: {str(e)}", exc_info=True)
        return {
            "success": False,
            "exists": True,
            "directory": directory,
            "message": f"Error scanning directory: {str(e)}"
        }

# Endpoints
@router.get("/", summary="Get characters from a directory")
async def get_characters_in_directory(request: Request, directory: str = Query(None)):
    """Get characters from a directory or the default characters directory"""
    logger.info(f"Received GET request for characters with directory: {directory}")
    logger.info(f"Full URL: {request.url}")

    target_directory = ""
    if directory:
        # Decode URL-encoded path if directory is provided
        try:
            decoded_directory = urllib.parse.unquote(directory)
            logger.info(f"Decoded directory path: {decoded_directory}")
            target_directory = decoded_directory
        except Exception as e:
            logger.error(f"Error decoding directory path '{directory}': {e}")
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": f"Invalid directory path provided: {directory}"}
            )
    else:
        # Use the default CHARACTERS_DIR if no directory is provided
        logger.info(f"No directory provided, using default: {CHARACTERS_DIR}")
        target_directory = CHARACTERS_DIR

    # Always use the scan_directory_for_characters function
    result = scan_directory_for_characters(target_directory)

    if result["success"]:
        return JSONResponse(status_code=200, content=result)
    else:
        # Return 404 if directory doesn't exist, 500 for other errors
        status_code = 404 if not result.get("exists", True) else 500
        logger.warning(f"Scan failed for directory '{target_directory}'. Status: {status_code}, Message: {result.get('message')}")
        return JSONResponse(status_code=status_code, content=result)

@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(character_id: str):
    """Get a specific character by ID"""
    character = load_character(character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    return CharacterResponse(success=True, character=character)

@router.post("/", response_model=CharacterResponse)
async def create_character(character: CharacterModel):
    """Create a new character"""
    character_dict = character.dict(exclude_unset=True)
    
    # Generate new ID
    character_dict['id'] = str(uuid.uuid4())
    
    if save_character(character_dict):
        return CharacterResponse(
            success=True,
            message="Character created successfully",
            character=character_dict
        )
    else:
        raise HTTPException(status_code=500, detail="Failed to save character")

@router.put("/{character_id}", response_model=CharacterResponse)
async def update_character(character_id: str, character: CharacterModel):
    """Update a character"""
    existing_character = load_character(character_id)
    if not existing_character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    # Update fields
    character_dict = character.dict(exclude_unset=True)
    character_dict['id'] = character_id  # Ensure ID remains the same
    
    # Preserve created_at from existing character
    if 'created_at' in existing_character:
        character_dict['created_at'] = existing_character['created_at']
    
    if save_character(character_dict):
        return CharacterResponse(
            success=True,
            message="Character updated successfully",
            character=character_dict
        )
    else:
        raise HTTPException(status_code=500, detail="Failed to update character")

@router.delete("/{character_id}", response_model=CharacterResponse)
async def delete_character(character_id: str):
    """Delete a character"""
    character_path = get_character_path(character_id)
    if not os.path.exists(character_path):
        raise HTTPException(status_code=404, detail="Character not found")
    
    try:
        os.remove(character_path)
        return CharacterResponse(success=True, message="Character deleted successfully")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete character: {str(e)}")

# Delete character by path
@router.delete("/character/{path:path}")
async def delete_character_by_path(path: str):
    """Delete a character file by path"""
    normalized_path = normalize_path(path)
    logger.info(f"Request to delete character at path: {normalized_path}")
    
    try:
        if os.path.exists(normalized_path) and os.path.isfile(normalized_path) and normalized_path.lower().endswith('.png'):
            os.remove(normalized_path)
            logger.info(f"Successfully deleted character file: {normalized_path}")
            return {"success": True, "message": "Character deleted successfully"}
        else:
            logger.warning(f"Character file not found or not a PNG: {normalized_path}")
            raise HTTPException(status_code=404, detail="Character file not found or not a PNG")
    except Exception as e:
        logger.error(f"Failed to delete character: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete character: {str(e)}")

# Character avatar handling
@router.post("/{character_id}/avatar", response_model=CharacterResponse)
async def upload_avatar(
    character_id: str,
    file: UploadFile = File(...)
):
    """Upload an avatar for a character"""
    character = load_character(character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    # Create avatars directory if it doesn't exist
    avatars_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads", "avatars")
    os.makedirs(avatars_dir, exist_ok=True)
    
    # Save the uploaded file
    file_extension = os.path.splitext(file.filename)[1] if file.filename else ".png"
    avatar_filename = f"{character_id}{file_extension}"
    avatar_path = os.path.join(avatars_dir, avatar_filename)
    
    try:
        contents = await file.read()
        with open(avatar_path, "wb") as f:
            f.write(contents)
        
        # Update character with avatar URL
        character["avatar_url"] = f"/uploads/avatars/{avatar_filename}"
        save_character(character)
        
        return CharacterResponse(
            success=True, 
            message="Avatar uploaded successfully",
            character=character
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload avatar: {str(e)}")

# Add character metadata and image endpoints outside the router for direct access
@router.get("/metadata/{path:path}", summary="Extract metadata from a character file")
async def get_character_metadata(path: str):
    """Extract and return metadata from a character PNG file."""
    # URL decode the path and normalize for the platform
    path = normalize_path(path)
    
    if not os.path.exists(path):
        logger.error(f"Character file not found: {path}")
        raise HTTPException(status_code=404, detail="Character file not found")
    
    try:
        # Use the application's global png_handler to extract metadata
        # Import at function level to avoid circular imports
        from backend.main import png_handler
        
        # Read metadata from the PNG file
        metadata = png_handler.read_metadata(path)
        return {
            "success": True,
            "metadata": metadata
        }
    except Exception as e:
        logger.error(f"Error extracting metadata: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Failed to extract metadata: {str(e)}"}
        )

@router.get("/image/{path:path}", summary="Serve a character image file")
async def get_character_image(path: str):
    """Serve a character image file by path."""
    # URL decode the path and normalize for the platform
    path = normalize_path(path)
    
    if not os.path.exists(path):
        logger.error(f"Character image not found: {path}")
        raise HTTPException(status_code=404, detail="Character image not found")
    
    if not path.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
        logger.error(f"Invalid file format for character image: {path}")
        raise HTTPException(status_code=400, detail="Invalid file format")
    
    try:
        from fastapi.responses import FileResponse
        return FileResponse(path)
    except Exception as e:
        logger.error(f"Error serving character image: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to serve image")