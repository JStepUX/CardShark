import logging
import requests

# Initialize logger
# logger = logging.getLogger(__name__) # Use FastAPI dependency injection instead
# backend/character_endpoints.py
# Endpoints for character management

import os
import json
import uuid
import glob
import time
import urllib.parse
import logging
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Form, Query, Request # Add Form
from fastapi.responses import JSONResponse, FileResponse # Added FileResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import re # Add re for filename sanitization

# Import handler types for type hinting
from backend.log_manager import LogManager
from backend.png_metadata_handler import PngMetadataHandler
from backend.backyard_handler import BackyardHandler # Import BackyardHandler
from backend.settings_manager import SettingsManager # Add SettingsManager import

# Dependency provider functions (defined locally, import from main inside)
def get_logger() -> LogManager:
    from backend.main import logger # Import locally
    if logger is None: raise HTTPException(status_code=500, detail="Logger not initialized")
    return logger

def get_png_handler() -> PngMetadataHandler:
    from backend.main import png_handler # Import locally
    if png_handler is None: raise HTTPException(status_code=500, detail="PNG handler not initialized")
    return png_handler

def get_backyard_handler() -> BackyardHandler:
    from backend.main import backyard_handler # Import locally
    if backyard_handler is None: raise HTTPException(status_code=500, detail="Backyard handler not initialized")
    return backyard_handler

def get_settings_manager() -> SettingsManager:
    from backend.main import settings_manager  # Import locally
    if settings_manager is None: raise HTTPException(status_code=500, detail="Settings manager not initialized")
    return settings_manager

# Create router
router = APIRouter(
    prefix="/api", # Use common /api prefix
    tags=["characters"],
    responses={404: {"description": "Not found"}},
)

# Set up logger (using dependency injection now)
# logger = logging.getLogger("character_endpoints")

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

# Characters directory (Consider making this configurable via settings)
CHARACTERS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "characters")
os.makedirs(CHARACTERS_DIR, exist_ok=True)

# Helper functions
def normalize_path(path: str, logger: LogManager) -> str:
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

    logger.log_step(f"Normalized path: '{path}' to '{normalized}'")
    return normalized

def get_character_path(character_id: str) -> str:
    """Get the file path for a character (JSON based - likely deprecated)"""
    return os.path.join(CHARACTERS_DIR, f"{character_id}.json")

def load_character(character_id: str, logger: LogManager) -> Optional[Dict[str, Any]]:
    """Load a character from disk (JSON based - likely deprecated)"""
    character_path = get_character_path(character_id)
    if not os.path.exists(character_path):
        return None

    try:
        with open(character_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading character {character_id}: {e}")
        return None

def save_character(character_data: Dict[str, Any], logger: LogManager) -> bool:
    """Save a character to disk (JSON based - likely deprecated)"""
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

def get_all_characters(logger: LogManager) -> List[Dict[str, Any]]:
    """Get all characters (JSON based - likely deprecated)"""
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
def scan_directory_for_characters(directory_path: str, logger: LogManager) -> Dict[str, Any]:
    """Scan a directory for character PNG files, handling case-insensitivity robustly."""
    # Normalize the path for better cross-platform compatibility
    directory = normalize_path(directory_path, logger) # Pass logger
    logger.log_info(f"Scanning directory for characters: {directory}")

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
        logger.log_info(f"Searching with pattern: {pattern}")
        
        # Add exception handling for glob operation
        try:
            found_files = glob.glob(pattern)
            logger.log_info(f"Found {len(found_files)} PNG files")
        except Exception as glob_err:
            logger.error(f"Error during glob search: {str(glob_err)}", exc_info=True)
            return {
                "success": False,
                "exists": True,
                "directory": directory,
                "message": f"Error during file search: {str(glob_err)}",
                "files": []
            }

        # Use a dictionary with normalized paths as keys to ensure uniqueness
        unique_files = {}
        for file_path in found_files:
            try:
                norm_path = os.path.normcase(os.path.abspath(file_path))
                if norm_path not in unique_files:
                    unique_files[norm_path] = file_path
            except Exception as norm_err:
                # Log but continue processing other files
                logger.error(f"Error normalizing path {file_path}: {str(norm_err)}")
                continue

        logger.log_info(f"After deduplication: {len(unique_files)} unique files")

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
            except FileNotFoundError:
                logger.warning(f"File not found during processing: {file_path}")
                continue
            except PermissionError:
                logger.warning(f"Permission denied accessing file: {file_path}")
                continue
            except Exception as e:
                logger.error(f"Error processing file info for {file_path}: {e}")
                continue

        # Sort files by name (case-insensitive)
        try:
            files_data.sort(key=lambda x: x["name"].lower())
        except Exception as sort_err:
            logger.error(f"Error sorting file data: {str(sort_err)}")
            # Continue without sorting if there's an error

        logger.log_info(f"Successfully processed {len(files_data)} unique character files in {directory}")

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
            "message": f"Error scanning directory: {str(e)}",
            "files": []  # Always return empty files array on error
        }

# Endpoints
@router.get("/characters", summary="Get characters from a directory") # Corrected path
async def get_characters_in_directory(
    request: Request,
    directory: str = Query(None),
    logger: LogManager = Depends(get_logger)
):
    """Get characters from a directory or the default characters directory"""
    logger.log_info(f"Received GET request for characters with directory: {directory}")
    logger.log_info(f"Full URL: {request.url}")

    target_directory = ""
    if directory:
        # Decode URL-encoded path if directory is provided
        try:
            decoded_directory = urllib.parse.unquote(directory)
            logger.log_info(f"Decoded directory path: {decoded_directory}")
            target_directory = decoded_directory
        except Exception as e:
            logger.log_error(f"Error decoding directory path '{directory}': {e}")
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": f"Invalid directory path provided: {directory}"}
            )
    else:
        # Use the default CHARACTERS_DIR if no directory is provided
        logger.log_info(f"No directory provided, using default: {CHARACTERS_DIR}")
        target_directory = CHARACTERS_DIR

    # Always use the scan_directory_for_characters function
    result = scan_directory_for_characters(target_directory, logger) # Pass logger

    if result["success"]:
        return JSONResponse(status_code=200, content=result)
    else:
        # Return 404 if directory doesn't exist, 500 for other errors
        status_code = 404 if not result.get("exists", True) else 500
        logger.warning(f"Scan failed for directory '{target_directory}'. Status: {status_code}, Message: {result.get('message')}")
        return JSONResponse(status_code=status_code, content=result)

# --- JSON Character Endpoints (Likely Deprecated) ---
# These seem to manage JSON files, not PNG cards. Keeping for now but mark as potentially deprecated.

@router.get("/characters/{character_id}", response_model=CharacterResponse, tags=["characters_json"])
async def get_character(character_id: str, logger: LogManager = Depends(get_logger)):
    """Get a specific character by ID (JSON based - likely deprecated)"""
    character = load_character(character_id, logger) # Pass logger
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    return CharacterResponse(success=True, character=character)

@router.post("/characters", response_model=CharacterResponse, tags=["characters_json"])
async def create_character(character: CharacterModel, logger: LogManager = Depends(get_logger)):
    """Create a new character (JSON based - likely deprecated)"""
    character_dict = character.dict(exclude_unset=True)

    # Generate new ID
    character_dict['id'] = str(uuid.uuid4())

    if save_character(character_dict, logger): # Pass logger
        return CharacterResponse(
            success=True,
            message="Character created successfully",
            character=character_dict
        )
    else:
        raise HTTPException(status_code=500, detail="Failed to save character")

@router.put("/characters/{character_id}", response_model=CharacterResponse, tags=["characters_json"])
async def update_character(character_id: str, character: CharacterModel, logger: LogManager = Depends(get_logger)):
    """Update a character (JSON based - likely deprecated)"""
    existing_character = load_character(character_id, logger) # Pass logger
    if not existing_character:
        raise HTTPException(status_code=404, detail="Character not found")

    # Update fields
    character_dict = character.dict(exclude_unset=True)
    character_dict['id'] = character_id  # Ensure ID remains the same

    # Preserve created_at from existing character
    if 'created_at' in existing_character:
        character_dict['created_at'] = existing_character['created_at']

    if save_character(character_dict, logger): # Pass logger
        return CharacterResponse(
            success=True,
            message="Character updated successfully",
            character=character_dict
        )
    else:
        raise HTTPException(status_code=500, detail="Failed to update character")

@router.delete("/characters/{character_id}", response_model=CharacterResponse, tags=["characters_json"])
async def delete_character(character_id: str, logger: LogManager = Depends(get_logger)):
    """Delete a character (JSON based - likely deprecated)"""
    character_path = get_character_path(character_id)
    if not os.path.exists(character_path):
        raise HTTPException(status_code=404, detail="Character not found")

    try:
        os.remove(character_path)
        return CharacterResponse(success=True, message="Character deleted successfully")
    except Exception as e:
        logger.error(f"Error deleting character {character_id}: {e}") # Log error
        raise HTTPException(status_code=500, detail=f"Failed to delete character: {str(e)}")

# --- PNG Character Card Endpoints ---

@router.delete("/character/{path:path}") # Keep path relative to /api
async def delete_character_by_path(path: str, logger: LogManager = Depends(get_logger)):
    """Delete a character PNG file by path"""
    normalized_path = normalize_path(path, logger) # Pass logger
    logger.info(f"Request to delete character at path: {normalized_path}")

    try:
        # Add more robust path validation if needed (e.g., ensure it's within allowed dirs)
        if os.path.exists(normalized_path) and os.path.isfile(normalized_path) and normalized_path.lower().endswith('.png'):
            # Use send2trash if available
            try:
                import send2trash
                send2trash.send2trash(normalized_path)
                logger.info(f"Successfully sent character file to trash: {normalized_path}")
            except ImportError:
                logger.warning("send2trash not found, deleting directly.")
                os.remove(normalized_path)
                logger.info(f"Successfully deleted character file: {normalized_path}")
            except Exception as trash_error:
                 logger.error(f"Error sending character file to trash: {trash_error}. Deleting directly.")
                 os.remove(normalized_path)
                 logger.info(f"Successfully deleted character file after trash error: {normalized_path}")

            return {"success": True, "message": "Character deleted successfully"}
        else:
            logger.warning(f"Character file not found or not a PNG: {normalized_path}")
            raise HTTPException(status_code=404, detail="Character file not found or not a PNG")
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.error(f"Failed to delete character: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete character: {str(e)}")

# Character avatar handling (JSON based - likely deprecated)
@router.post("/characters/{character_id}/avatar", response_model=CharacterResponse, tags=["characters_json"])
async def upload_avatar(
    character_id: str,
    file: UploadFile = File(...),
    logger: LogManager = Depends(get_logger)
):
    """Upload an avatar for a character (JSON based - likely deprecated)"""
    character = load_character(character_id, logger) # Pass logger
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # Create avatars directory if it doesn't exist
    avatars_dir = Path("uploads") / "avatars" # Use Path object
    avatars_dir.mkdir(parents=True, exist_ok=True)

    # Save the uploaded file
    file_extension = os.path.splitext(file.filename)[1] if file.filename else ".png"
    # Basic sanitization for extension
    safe_extension = re.sub(r'[^\w.]+', '', file_extension)
    if not safe_extension or not safe_extension.startswith('.'): safe_extension = ".png"

    avatar_filename = f"{character_id}{safe_extension}"
    avatar_path = avatars_dir / avatar_filename

    try:
        contents = await file.read()
        with open(avatar_path, "wb") as f:
            f.write(contents)

        # Update character with avatar URL
        # Ensure URL path matches how files are served (e.g., via StaticFiles in main.py)
        avatar_url = f"/uploads/avatars/{avatar_filename}"
        character["avatar_url"] = avatar_url
        save_character(character, logger) # Pass logger

        return CharacterResponse(
            success=True,
            message="Avatar uploaded successfully",
            character=character
        )
    except Exception as e:
        logger.error(f"Error uploading avatar for {character_id}: {e}") # Log error
        raise HTTPException(status_code=500, detail=f"Failed to upload avatar: {str(e)}")

@router.post("/characters/save-card", summary="Save character card PNG with metadata")
async def save_character_card(
    file: UploadFile = File(...),
    metadata_json: str = Form(...),
    png_handler: PngMetadataHandler = Depends(get_png_handler),
    settings_manager: SettingsManager = Depends(get_settings_manager),
    logger: LogManager = Depends(get_logger)
):
    """
    Receives a PNG image file and a JSON string of character metadata.
    Embeds the metadata into the PNG using PngMetadataHandler
    and saves it to the appropriate character directory based on settings.
    """
    try:
        # 1. Read image data
        image_bytes = await file.read()
        logger.info(f"Received image file: {file.filename}, size: {len(image_bytes)} bytes")
        
        # 1.1 Validate image data - check for minimum size and PNG signature
        if len(image_bytes) < 100:  # Minimum size check - a valid PNG is at least this big
            logger.warning(f"Image file too small ({len(image_bytes)} bytes). Not a valid PNG.")
            raise HTTPException(status_code=400, detail=f"Invalid image file: too small to be a valid PNG")
            
        # Check PNG signature (first 8 bytes)
        png_signature = b'\x89PNG\r\n\x1a\n'
        if not image_bytes.startswith(png_signature):
            logger.warning("Image file does not have PNG signature")
            raise HTTPException(status_code=400, detail="Invalid image file: not a PNG image")

        # 2. Parse metadata JSON
        try:
            metadata = json.loads(metadata_json)
            logger.info("Successfully parsed metadata JSON.")

            # Handle character_uuid
            existing_uuid = metadata.get("character_uuid")
            is_valid_existing_uuid = False
            if existing_uuid:
                try:
                    # Ensure it's a string for UUID constructor and check version 4
                    uuid.UUID(str(existing_uuid), version=4)
                    is_valid_existing_uuid = True
                    logger.info(f"Found valid existing character_uuid: {existing_uuid}")
                except ValueError:
                    logger.warning(f"Invalid existing character_uuid found: '{existing_uuid}'. A new one will be generated.")
            
            if is_valid_existing_uuid:
                final_uuid = str(existing_uuid) # Ensure it's a string
            else:
                final_uuid = str(uuid.uuid4())
                if existing_uuid: # Log if we are replacing an invalid one
                    logger.info(f"Replacing invalid character_uuid '{existing_uuid}' with new one: {final_uuid}")
                else: # Log if we are generating a new one because none existed
                    logger.info(f"Generated new character_uuid: {final_uuid}")
            
            metadata["character_uuid"] = final_uuid
            
            # Extract character name from metadata
            character_name = None
            
            # Try to get name directly from top-level metadata
            if 'name' in metadata:
                character_name = metadata['name']
                logger.info(f"Found character name in top-level metadata: {character_name}")
            # Try to get name from data structure if it exists
            elif 'data' in metadata and isinstance(metadata['data'], dict) and 'name' in metadata['data']:
                character_name = metadata['data']['name']
                logger.info(f"Found character name in metadata.data: {character_name}")
            
            # If no name found, log warning but continue with UUID fallback
            if not character_name:
                logger.warning("Metadata is missing the 'name' field, will use UUID for filename.")
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

        # 4. Determine filename using character name
        # Use character name (from either location) or fall back to UUID if not found
        if not character_name:
            character_name = f'character_{uuid.uuid4()}'
            
        # Sanitize filename: remove invalid characters, limit length
        sanitized_name = re.sub(r'[\\/*?:"<>|]', "", character_name)
        sanitized_name = sanitized_name[:100]  # Limit length
        
        # Get save directory based on settings
        save_to_user_dir = settings_manager.get_setting('save_to_character_directory')
        user_character_dir = settings_manager.get_setting('character_directory')
        
        # Determine where to save the file
        save_directory = CHARACTERS_DIR  # Default to app's characters directory
        
        if save_to_user_dir and user_character_dir:
            # Use user-selected directory if setting is enabled and directory is set
            if os.path.isdir(user_character_dir):
                save_directory = user_character_dir
                logger.info(f"Using character directory from settings: {save_directory}")
            else:
                logger.warning(f"Character directory from settings doesn't exist: {user_character_dir}, using default")
        
        # Handle filename conflicts properly to avoid overwriting
        base_filename = f"{sanitized_name}.png"
        save_path = os.path.join(save_directory, base_filename)
        
        # Check if file exists and generate a unique name if needed
        counter = 1
        while os.path.exists(save_path):
            new_filename = f"{sanitized_name} ({counter}).png"
            save_path = os.path.join(save_directory, new_filename)
            counter += 1
            logger.info(f"File exists, trying alternative name: {new_filename}")
        
        logger.info(f"Final save path: {save_path}")

        # 5. Save the new PNG file
        try:
            # Ensure the save directory exists
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            
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
                "filename": os.path.basename(save_path),
                "path": save_path # Return the server-side path for reference
            }
        )

    except HTTPException:
        # Re-raise HTTPExceptions directly
        raise
    except Exception as e:
        logger.error(f"Unexpected error in save_character_card: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")

@router.post("/characters/extract-metadata", summary="Upload a character PNG and extract metadata") # Corrected path
async def extract_metadata_from_upload(
    file: UploadFile = File(...),
    png_handler: PngMetadataHandler = Depends(get_png_handler), # Inject dependency
    logger: LogManager = Depends(get_logger)
):
    """
    Accepts a PNG file upload, reads its metadata using PngMetadataHandler,
    and returns the extracted metadata. Does not save the file.
    """
    try:
        # Read file content into memory
        image_bytes = await file.read()
        logger.info(f"Received file for metadata extraction: {file.filename}, size: {len(image_bytes)} bytes")
        
        # Validate image data
        if len(image_bytes) < 100:  # Minimum size check
            logger.warning(f"Image file too small ({len(image_bytes)} bytes). Not a valid PNG.")
            raise HTTPException(status_code=400, detail=f"Invalid image file: too small to be a valid PNG")
            
        # Check PNG signature
        png_signature = b'\x89PNG\r\n\x1a\n'
        if not image_bytes.startswith(png_signature):
            logger.warning("Image file does not have PNG signature")
            raise HTTPException(status_code=400, detail="Invalid image file: not a PNG image")

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


@router.get("/characters/metadata/{path:path}", summary="Extract metadata from a character file") # Corrected path
async def get_character_metadata(
    path: str,
    png_handler: PngMetadataHandler = Depends(get_png_handler),
    logger: LogManager = Depends(get_logger)
):
    """Extract and return metadata from a character PNG file."""
    # URL decode the path and normalize for the platform
    normalized_path = normalize_path(path, logger) # Pass logger

    if not os.path.exists(normalized_path):
        logger.error(f"Character file not found: {normalized_path}")
        raise HTTPException(status_code=404, detail="Character file not found")

    if not os.path.isfile(normalized_path) or not normalized_path.lower().endswith('.png'):
         logger.error(f"Path is not a valid PNG file: {normalized_path}")
         raise HTTPException(status_code=400, detail="Invalid file path or type")

    try:
        content = Path(normalized_path).read_bytes()
        metadata = png_handler.read_metadata(content)
        logger.info(f"Successfully extracted metadata from {normalized_path}")
        return JSONResponse(status_code=200, content=metadata)
    except Exception as e:
        logger.error(f"Error reading metadata from {normalized_path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to read metadata: {str(e)}")


@router.get("/characters/image/{path:path}", summary="Serve a character image file") # Corrected path
async def get_character_image(
    path: str,
    logger: LogManager = Depends(get_logger)
):
    """Serve a character image file by path."""
    # URL decode the path and normalize for the platform
    normalized_path = normalize_path(path, logger) # Pass logger

    # Modified security check: Skip path containment check if the paths are on different drives
    try:
        # Get absolute paths
        abs_path = os.path.abspath(normalized_path)
        allowed_base = os.path.abspath(CHARACTERS_DIR)
        
        # Only perform the commonpath check if the drives match
        if os.path.splitdrive(abs_path)[0] == os.path.splitdrive(allowed_base)[0]:
            if not abs_path.startswith(allowed_base):
                logger.log_warning(f"Attempt to access character image outside allowed directory: {normalized_path}")
                logger.log_warning(f"Path {abs_path} is not within {allowed_base}")
                raise HTTPException(status_code=403, detail="Access denied")
        else:
            # For cross-drive requests, log but allow the access
            logger.log_warning(f"Cross-drive access detected: {abs_path} is on a different drive than {allowed_base}")
            # Additional security checks could be implemented here if needed
    except ValueError as e:
        # Handle potential errors from commonpath comparison
        logger.log_warning(f"Path comparison error: {str(e)}")
        # Allow the request to proceed

    if not os.path.exists(normalized_path):
        logger.log_error(f"Character image file not found: {normalized_path}")
        raise HTTPException(status_code=404, detail="Character image not found")

    if not os.path.isfile(normalized_path) or not normalized_path.lower().endswith('.png'):
         logger.log_error(f"Path is not a valid PNG file: {normalized_path}")
         raise HTTPException(status_code=400, detail="Invalid file path or type")

    try:
        logger.log_info(f"Serving character image: {normalized_path}")
        return FileResponse(normalized_path, media_type="image/png")
    except Exception as e:
        logger.log_error(f"Error serving character image {normalized_path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to serve image: {str(e)}")


@router.get("/character-image/{path:path}", summary="Serve a character image file directly")
async def serve_character_image(
    path: str,
    logger: LogManager = Depends(get_logger)
):
    """Serve a character image file by path. Uses direct file access to handle cross-drive file serving."""
    try:
        # URL decode the path and normalize for the platform
        normalized_path = normalize_path(path, logger)
        
        logger.log_info(f"Direct serving character image: {normalized_path}")
        
        if not os.path.exists(normalized_path):
            logger.log_error(f"Character image file not found: {normalized_path}")
            raise HTTPException(status_code=404, detail="Character image not found")

        if not os.path.isfile(normalized_path) or not normalized_path.lower().endswith('.png'):
            logger.log_error(f"Path is not a valid PNG file: {normalized_path}")
            raise HTTPException(status_code=400, detail="Invalid file path or type")

        # Use FileResponse directly to serve the file
        return FileResponse(normalized_path, media_type="image/png")
        
    except Exception as e:
        logger.log_error(f"Error serving character image {path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to serve image: {str(e)}")


@router.get("/character-metadata/{path:path}", summary="Extract metadata from a character file directly")
async def get_character_metadata_direct(
    path: str,
    png_handler: PngMetadataHandler = Depends(get_png_handler),
    logger: LogManager = Depends(get_logger)
):
    """Direct version of metadata extraction that properly handles cross-drive paths."""
    try:
        # URL decode the path and normalize for the platform
        normalized_path = normalize_path(path, logger)
        
        logger.log_info(f"Direct extraction of metadata from: {normalized_path}")
        
        if not os.path.exists(normalized_path):
            logger.log_error(f"Character file not found: {normalized_path}")
            raise HTTPException(status_code=404, detail="Character file not found")

        if not os.path.isfile(normalized_path) or not normalized_path.lower().endswith('.png'):
            logger.log_error(f"Path is not a valid PNG file: {normalized_path}")
            raise HTTPException(status_code=400, detail="Invalid file path or type")

        # Read the file and extract metadata
        content = Path(normalized_path).read_bytes()
        metadata = png_handler.read_metadata(content)
        
        # Success response
        return JSONResponse(status_code=200, content=metadata)
        
    except Exception as e:
        logger.log_error(f"Error reading metadata from {path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to read metadata: {str(e)}")


# --- Backyard Import ---
# Consider moving this to a separate 'import' module if complexity grows

class BackyardImportRequest(BaseModel):
    url: str

@router.post("/characters/import-backyard", summary="Import character from Backyard.ai URL") # Corrected path
async def import_from_backyard(
    request: BackyardImportRequest,
    backyard_handler: BackyardHandler = Depends(lambda: get_backyard_handler()),
    png_handler: PngMetadataHandler = Depends(get_png_handler),
    settings_manager: SettingsManager = Depends(get_settings_manager),
    logger: LogManager = Depends(get_logger)
):
    """
    Downloads a character card from a Backyard.ai URL, extracts metadata,
    and saves it to the characters directory.
    """
    try:
        backyard_url = request.url
        logger.info(f"Received Backyard import request for URL: {backyard_url}")

        # Use BackyardHandler to download the image
        # Assuming download_character returns image_bytes or raises an error
        image_bytes = backyard_handler.download_character(backyard_url)
        logger.info(f"Successfully downloaded image from Backyard URL.")

        # Extract metadata
        metadata = png_handler.read_metadata(image_bytes)
        if not metadata:
            logger.warning("No metadata found in downloaded Backyard character card.")
            # Decide how to handle - maybe save with default name? Or return error?
            # For now, let's try to save with a generic name.
            metadata = {"name": f"backyard_import_{uuid.uuid4().hex[:8]}"}

        logger.info(f"Extracted metadata: {metadata.get('name', 'N/A')}")

        # Handle character_uuid for imported card
        existing_uuid = metadata.get("character_uuid")
        is_valid_existing_uuid = False
        if existing_uuid:
            try:
                uuid.UUID(str(existing_uuid), version=4)
                is_valid_existing_uuid = True
                logger.info(f"Found valid existing character_uuid in imported card: {existing_uuid}")
            except ValueError:
                logger.warning(f"Invalid existing character_uuid in imported card: '{existing_uuid}'. A new one will be generated.")
        
        if is_valid_existing_uuid:
            final_uuid = str(existing_uuid)
        else:
            final_uuid = str(uuid.uuid4())
            if existing_uuid:
                logger.info(f"Replacing invalid character_uuid '{existing_uuid}' in imported card with new one: {final_uuid}")
            else:
                logger.info(f"Generated new character_uuid for imported card: {final_uuid}")
        
        metadata["character_uuid"] = final_uuid

        # Determine filename and save path
        character_name = metadata.get('name', f'backyard_import_{uuid.uuid4().hex[:8]}')
        sanitized_name = re.sub(r'[\\/*?:"<>|]', "", character_name)[:100]
        
        # Get save directory based on settings
        save_to_user_dir = settings_manager.get_setting('save_to_character_directory')
        user_character_dir = settings_manager.get_setting('character_directory')
        
        # Determine where to save the file
        save_directory = CHARACTERS_DIR  # Default to app's characters directory
        
        if save_to_user_dir and user_character_dir:
            # Use user-selected directory if setting is enabled and directory is set
            if os.path.isdir(user_character_dir):
                save_directory = user_character_dir
                logger.info(f"Using character directory from settings: {save_directory}")
            else:
                logger.warning(f"Character directory from settings doesn't exist: {user_character_dir}, using default")
        
        # Handle filename conflicts properly to avoid overwriting
        base_filename = f"{sanitized_name}.png"
        save_path = os.path.join(save_directory, base_filename)
        
        # Check if file exists and generate a unique name if needed
        counter = 1
        while os.path.exists(save_path):
            new_filename = f"{sanitized_name} ({counter}).png"
            save_path = os.path.join(save_directory, new_filename)
            counter += 1
            logger.info(f"File exists, trying alternative name: {new_filename}")
        
        logger.info(f"Final save path for imported character: {save_path}")

        # Save the downloaded PNG file (with its original metadata)
        try:
            # Ensure the save directory exists
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            
            # Re-write metadata to include the character_uuid
            final_image_bytes_to_save = png_handler.write_metadata(image_bytes, metadata)
            logger.info(f"Embedded character_uuid into image bytes for imported card.")

            with open(save_path, "wb") as f:
                f.write(final_image_bytes_to_save)
            logger.info(f"Successfully saved imported character card to {save_path}")
        except IOError as e:
            logger.error(f"Failed to save imported character card file to disk: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to save imported character file: {e}")

        # Return success response
        return JSONResponse(
            content={
                "success": True,
                "message": "Character imported successfully from Backyard.ai.",
                "filename": os.path.basename(save_path),
                "path": save_path,
                "metadata": metadata # Return extracted metadata
            }
        )

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.error(f"Error importing from Backyard URL {request.url}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to import from Backyard: {str(e)}")


@router.post("/characters/extract-lore", summary="Extract lore items from an uploaded character PNG") # Corrected path
async def extract_lore_from_upload(
    file: UploadFile = File(...),
    png_handler: PngMetadataHandler = Depends(get_png_handler),
    logger: LogManager = Depends(get_logger)
):
    """
    Accepts a character PNG file upload, extracts metadata, specifically looking
    for lorebook entries, and returns them.
    """
    try:
        image_bytes = await file.read()
        logger.info(f"Received file for lore extraction: {file.filename}, size: {len(image_bytes)} bytes")
        
        # Validate image data
        if len(image_bytes) < 100:  # Minimum size check
            logger.warning(f"Image file too small ({len(image_bytes)} bytes). Not a valid PNG.")
            raise HTTPException(status_code=400, detail=f"Invalid image file: too small to be a valid PNG")
            
        # Check PNG signature
        png_signature = b'\x89PNG\r\n\x1a\n'
        if not image_bytes.startswith(png_signature):
            logger.warning("Image file does not have PNG signature")
            raise HTTPException(status_code=400, detail="Invalid image file: not a PNG image")

        metadata = png_handler.read_metadata(image_bytes)
        logger.info(f"Extracted metadata for lore check.")

        # Extract lorebook data (adjust key based on actual metadata structure)
        lore_data = metadata.get("lorebook", {}).get("entries", []) # Example path
        if not lore_data and "world_info" in metadata: # Check alternative keys
             lore_data = metadata.get("world_info") # TavernAI format?

        # Further processing might be needed depending on lore format

        logger.info(f"Found {len(lore_data)} potential lore entries.")

        return JSONResponse(
            content={
                "success": True,
                "message": "Lore extracted successfully.",
                "lore": lore_data # Return the extracted lore entries
            }
        )

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.error(f"Error extracting lore from upload: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to extract lore: {str(e)}")