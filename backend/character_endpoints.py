import logging
import requests

# Initialize logger
logger = logging.getLogger(__name__)
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
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Form, Query, Request # Add Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import re # Add re for filename sanitization
from backend.backyard_handler import BackyardHandler # Import BackyardHandler

# Import png_handler from main application instance
try:
    from backend.main import png_handler
except ImportError:
    # Handle case where main might not be directly importable (e.g., testing)
    # This is a placeholder, proper dependency injection might be better
    logger.error("Could not import png_handler from backend.main")
    png_handler = None

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

@router.post("/save-card", summary="Save character card PNG with metadata")
async def save_character_card(
    file: UploadFile = File(...),
    metadata_json: str = Form(...) # Frontend sends 'metadata' key
):
    """
    Receives a PNG image file and a JSON string of character metadata.
    Embeds the metadata into the PNG using PngMetadataHandler
    and saves it to the characters directory.
    """
    if not png_handler:
        logger.error("PngMetadataHandler not available.")
        raise HTTPException(status_code=500, detail="Server configuration error: PngMetadataHandler not loaded.")

    try:
        # 1. Read image data
        image_bytes = await file.read()
        logger.info(f"Received image file: {file.filename}, size: {len(image_bytes)} bytes")

        # 2. Parse metadata JSON
        try:
            metadata = json.loads(metadata_json)
            logger.info("Successfully parsed metadata JSON.")
            # Basic validation: check if 'name' exists
            if 'name' not in metadata:
                 logger.warning("Metadata is missing the 'name' field.")
                 # Optionally raise an error or use a default name
                 # raise HTTPException(status_code=400, detail="Metadata must include a 'name' field.")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse metadata JSON: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid metadata JSON: {e}")
        except Exception as e:
             logger.error(f"Unexpected error parsing metadata: {e}")
             raise HTTPException(status_code=400, detail=f"Error processing metadata: {e}")


        # 3. Embed metadata into PNG
        try:
            output_bytes = png_handler.write_metadata(image_bytes, metadata)
            logger.info("Successfully embedded metadata into PNG.")
        except Exception as e:
            logger.error(f"Failed to write metadata to PNG: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to process PNG metadata: {e}")

        # 4. Determine filename (use character name, sanitize it)
        character_name = metadata.get('name', f'character_{uuid.uuid4()}') # Use name or fallback to UUID
        # Sanitize filename: remove invalid characters, limit length
        sanitized_name = re.sub(r'[\\/*?:"<>|]', "", character_name) # Remove invalid chars
        sanitized_name = sanitized_name[:100] # Limit length
        filename = f"{sanitized_name}.png"
        save_path = os.path.join(CHARACTERS_DIR, filename)
        logger.info(f"Determined save path: {save_path}")

        # Handle potential filename conflicts (optional: check if file exists and maybe rename)
        # For simplicity, we'll overwrite for now.

        # 5. Save the new PNG file
        try:
            with open(save_path, "wb") as f:
                f.write(output_bytes)
            logger.info(f"Successfully saved character card to {save_path}")
        except IOError as e:
            logger.error(f"Failed to save character card file to disk: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to save character file: {e}")

        # 6. Return success response
        return JSONResponse(
            content={
                "success": True,
                "message": "Character card saved successfully.",
                "filename": filename,
                "path": save_path # Return the server-side path for reference
            }
        )

    except HTTPException:
        # Re-raise HTTPExceptions directly
        raise
    except Exception as e:
        logger.error(f"Unexpected error in save_character_card: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")


@router.post("/extract-metadata", summary="Upload a character PNG and extract metadata")
async def extract_metadata_from_upload(file: UploadFile = File(...)):
    """
    Accepts a PNG file upload, reads its metadata using PngMetadataHandler,
    and returns the extracted metadata. Does not save the file.
    """
    if not png_handler:
        logger.error("PngMetadataHandler not available.")
        raise HTTPException(status_code=500, detail="Server configuration error: PngMetadataHandler not loaded.")

    try:
        # Read file content into memory
        image_bytes = await file.read()
        logger.info(f"Received file for metadata extraction: {file.filename}, size: {len(image_bytes)} bytes")

        # Extract metadata using the handler
        metadata = png_handler.read_metadata(image_bytes)
        logger.info(f"Successfully extracted metadata from uploaded file.")

        # Return success response with metadata
        return JSONResponse(
            content={
                "success": True,
                "message": "Metadata extracted successfully.",
                "metadata": metadata
            }
        )

    except HTTPException:
        # Re-raise HTTPExceptions directly
        raise
    except Exception as e:
        logger.error(f"Error extracting metadata from upload: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to extract metadata: {e}")


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

# Instantiate BackyardHandler (consider dependency injection later)
backyard_handler = BackyardHandler(logger)

@router.post("/import-backyard", summary="Import character from Backyard.ai URL")
async def import_from_backyard(request: Request):
    """
    Accepts a JSON body with a 'url' field pointing to a Backyard.ai character.
    Uses BackyardHandler to fetch, parse, and convert the character data.
    Returns the converted V2 metadata and the preview image URL.
    """
    try:
        body = await request.json()
        url = body.get('url')
        if not url:
            raise HTTPException(status_code=400, detail="Missing 'url' in request body")

        logger.info(f"Received Backyard import request for URL: {url}")

        # Use the handler to import the character
        metadata, image_url = backyard_handler.import_character(url)

        logger.info(f"Successfully imported and converted character from {url}")

        return JSONResponse(
            content={
                "success": True,
                "message": "Character imported successfully.",
                "metadata": metadata,
                "imageUrl": image_url # Include the image URL if found
            }
        )

    except ValueError as e: # Catch specific errors from handler
        logger.error(f"Backyard import validation error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))
    except requests.exceptions.RequestException as e: # Catch network errors
        logger.error(f"Backyard import network error: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Could not fetch from Backyard URL: {e}")
    except HTTPException:
        # Re-raise HTTPExceptions directly
        raise
    except Exception as e:
        logger.error(f"Unexpected error during Backyard import: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during import: {e}")

@router.post("/extract-lore", summary="Extract lore items from an uploaded character PNG")
async def extract_lore_from_upload(file: UploadFile = File(...)):
    """
    Accepts a PNG file upload, reads its metadata using PngMetadataHandler,
    and returns only the lorebook entries found within.
    """
    if not png_handler:
        logger.error("PngMetadataHandler not available.")
        raise HTTPException(status_code=500, detail="Server configuration error: PngMetadataHandler not loaded.")

    try:
        # Read file content into memory
        image_bytes = await file.read()
        logger.info(f"Received file for lore extraction: {file.filename}, size: {len(image_bytes)} bytes")

        # Extract metadata using the handler
        metadata = png_handler.read_metadata(image_bytes)
        logger.info("Successfully extracted metadata for lore extraction.")

        lore_items = []
        if metadata:
            # Extract lore items from V2 format
            if metadata.get('spec') == 'chara_card_v2':
                logger.log_step("Found V2 spec character")
                if 'data' in metadata and 'character_book' in metadata['data']:
                    logger.log_step("Extracting from data.character_book")
                    lore_items = metadata['data']['character_book'].get('entries', [])
                elif 'character_book' in metadata: # Fallback for slightly different structures
                    logger.log_step("Extracting from character_book (fallback)")
                    lore_items = metadata['character_book'].get('entries', [])
            else:
                 logger.log_warning("Metadata does not conform to V2 spec, cannot extract lore reliably.")
        else:
            logger.log_warning("No metadata found in PNG, cannot extract lore.")


        logger.log_step(f"Found {len(lore_items)} lore items")

        # Return success response with lore items
        return JSONResponse(
            content={
                "success": True,
                "message": "Lore extracted successfully.",
                "loreItems": lore_items # Use the same key as old main.py
            }
        )

    except HTTPException:
        # Re-raise HTTPExceptions directly
        raise
    except Exception as e:
        logger.error(f"Error extracting lore from upload: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to extract lore: {e}")