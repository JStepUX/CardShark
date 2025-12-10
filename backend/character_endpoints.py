import logging
import os
import json
import uuid

import urllib.parse
from pathlib import Path
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Form, Query, Request
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import re
from sqlalchemy.orm import Session

# Import core services and dependencies
from backend.log_manager import LogManager
from backend.png_metadata_handler import PngMetadataHandler
from backend.backyard_handler import BackyardHandler # For Backyard import endpoint
from backend.settings_manager import SettingsManager
from backend.services.character_service import CharacterService
from backend.services.character_indexing_service import CharacterIndexingService

# Use sql_models.py instead of models.py to avoid conflicts with models package
from backend.sql_models import Character as CharacterDBModel

# Import standardized response models and error handling
from backend.response_models import (
    DataResponse,
    ListResponse,
    ErrorResponse,
    STANDARD_RESPONSES,
    create_data_response,
    create_list_response,
    create_error_response
)
from backend.error_handlers import (
    handle_database_error,
    handle_validation_error,
    handle_generic_error,
    NotFoundException,
    ValidationException
)
from backend.dependencies import (
    get_logger_dependency,
    get_character_service_dependency,
    get_png_handler_dependency,
    get_backyard_handler_dependency,
    get_settings_manager_dependency,
    get_db_dependency # Import the database session dependency
)

def get_character_indexing_service(
    char_service: CharacterService = Depends(get_character_service_dependency),
    settings_manager: SettingsManager = Depends(get_settings_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
) -> CharacterIndexingService:
    """Get the character indexing service for database-first directory syncing"""
    return CharacterIndexingService(char_service, settings_manager, logger)


router = APIRouter(
    prefix="/api",
    tags=["characters"],
    responses={404: {"description": "Not found"}},
)

# --- Pydantic Models for API Responses ---
class CharacterAPIBase(BaseModel):
    character_uuid: str
    name: str
    description: Optional[str] = None
    personality: Optional[str] = None
    scenario: Optional[str] = None
    first_mes: Optional[str] = None
    mes_example: Optional[str] = None
    creator_comment: Optional[str] = None
    png_file_path: str
    tags: Optional[List[str]] = Field(default_factory=list)
    spec_version: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    db_metadata_last_synced_at: datetime
    extensions_json: Optional[Dict[str, Any]] = Field(default_factory=dict)
    original_character_id: Optional[str] = None
    is_incomplete: bool = False  # True if character has no valid metadata (needs editing)

    class Config:
        from_attributes = True # Changed from orm_mode for Pydantic V2
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None,
        }

class CharacterDetailResponse(BaseModel):
    success: bool = True
    character: CharacterAPIBase

class CharacterListResponse(BaseModel):
    success: bool = True
    characters: List[CharacterAPIBase]
    total: int # Add total for pagination

class FileInfo(BaseModel):
    name: str
    path: str
    size: int
    modified: datetime # This will be handled by BaseResponse's json_encoders

class SimpleSuccessResponse(BaseModel):
    success: bool
    message: Optional[str] = None

class ExtractedMetadataResponse(BaseModel):
    success: bool = True
    message: Optional[str] = "Metadata extracted successfully."
    metadata: Dict[str, Any]

class ExtractedLoreResponse(BaseModel):
    success: bool = True
    message: Optional[str] = "Lore extracted successfully."
    lore_book: Optional[Dict[str, Any]] = None # Based on CharacterCardV2 spec for character_book

# --- Helper Functions ---
def normalize_path(path_str: str, logger: LogManager) -> str:
    """Normalize path for cross-platform compatibility and security."""
    decoded_path = urllib.parse.unquote(path_str)
    # Basic security: prevent '..' to escape expected directories.
    # More robust checks should happen if paths are used for direct file system access outside controlled roots.
    if ".." in decoded_path:
        logger.warning(f"Potential path traversal attempt in '{decoded_path}'")
        raise HTTPException(status_code=400, detail="Invalid path components.")
    
    # Normalize path separators and case for consistency
    normalized = os.path.normpath(decoded_path)
    # Forcing to use forward slashes for internal consistency if needed, but os.path.normpath handles OS specifics.
    # normalized = normalized.replace('\\', '/') 
    logger.log_step(f"Normalized path: '{path_str}' to '{normalized}'")
    return normalized

def to_api_model(db_char: CharacterDBModel, logger: LogManager) -> CharacterAPIBase:
    """Helper function to convert a DB model to an API model with proper handling of JSON fields."""
    try:
        # Parse JSON fields before validation
        parsed_tags = []
        parsed_extensions = {}
        
        # Parse tags field
        if db_char.tags:
            if isinstance(db_char.tags, str):
                try:
                    parsed_tags = json.loads(db_char.tags)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON in tags field for character {db_char.character_uuid}")
                    parsed_tags = []
            elif isinstance(db_char.tags, list):
                parsed_tags = db_char.tags
            else:
                parsed_tags = []
        
        # Parse extensions_json field
        if db_char.extensions_json:
            if isinstance(db_char.extensions_json, str):
                try:
                    parsed_extensions = json.loads(db_char.extensions_json)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON in extensions_json field for character {db_char.character_uuid}")
                    parsed_extensions = {}
            elif isinstance(db_char.extensions_json, dict):
                parsed_extensions = db_char.extensions_json
            else:
                parsed_extensions = {}          # Handle None datetime values with defaults
        now = datetime.now(tz=timezone.utc)
        created_at = db_char.created_at if db_char.created_at is not None else now
        updated_at = db_char.updated_at if db_char.updated_at is not None else now
        synced_at = db_char.db_metadata_last_synced_at if db_char.db_metadata_last_synced_at is not None else now
        
        # Create API model with parsed data
        api_char = CharacterAPIBase(
            character_uuid=db_char.character_uuid,
            name=db_char.name,
            description=db_char.description,
            personality=db_char.personality,
            scenario=db_char.scenario,
            first_mes=db_char.first_mes,
            mes_example=db_char.mes_example,
            creator_comment=db_char.creator_comment,
            png_file_path=db_char.png_file_path,
            tags=parsed_tags,
            spec_version=db_char.spec_version,
            created_at=created_at,
            updated_at=updated_at,
            db_metadata_last_synced_at=synced_at,
            extensions_json=parsed_extensions,
            original_character_id=db_char.original_character_id,
            is_incomplete=getattr(db_char, 'is_incomplete', False)
        )
        
        return api_char
    except Exception as e:
        logger.error(f"Error converting DB model to API model for character {db_char.character_uuid}: {str(e)}")        # Create a minimal valid model as fallback
        now = datetime.now(tz=timezone.utc)
        fallback_created_at = db_char.created_at if db_char.created_at is not None else now
        fallback_updated_at = db_char.updated_at if db_char.updated_at is not None else now
        fallback_synced_at = db_char.db_metadata_last_synced_at if db_char.db_metadata_last_synced_at is not None else now
        
        return CharacterAPIBase(
            character_uuid=db_char.character_uuid,
            name=db_char.name or "Unknown",
            description=db_char.description,
            personality=db_char.personality,
            scenario=db_char.scenario,
            first_mes=db_char.first_mes,
            mes_example=db_char.mes_example,
            creator_comment=db_char.creator_comment,
            png_file_path=db_char.png_file_path or "",
            tags=[],
            spec_version=db_char.spec_version,
            created_at=fallback_created_at,
            updated_at=fallback_updated_at,
            db_metadata_last_synced_at=fallback_synced_at,
            extensions_json={},
            original_character_id=db_char.original_character_id,
            is_incomplete=getattr(db_char, 'is_incomplete', False)
        )

# --- Character Endpoints ---

@router.get("/characters", response_model=CharacterListResponse, responses=STANDARD_RESPONSES, summary="List characters from database with directory sync")
async def list_characters(
    directory: Optional[str] = Query(None, description="Get characters from a specific directory instead of DB"),
    skip: int = Query(0, ge=0),
    limit: int = Query(0, ge=0, description="0 means no limit (return all)"),
    db_limit: Optional[int] = Query(None, ge=1, description="Limit for DB queries when filtering by directory (None for no limit)"),
    char_service: CharacterService = Depends(get_character_service_dependency),
    indexing_service: CharacterIndexingService = Depends(get_character_indexing_service),
    logger: LogManager = Depends(get_logger_dependency)
):
    """List characters with directory sync and standardized response."""
    # If a directory is provided, we'll use the legacy directory-scanning behavior
    if directory:
        logger.info(f"GET /api/characters with directory={directory}")
        try:
            from pathlib import Path
            # Create a Path object from the provided directory
            directory_path = Path(directory)
            
            # Try to make it absolute for better error reporting
            try:
                directory_path = directory_path.resolve()
            except Exception:
                # If resolve fails, use the original path
                pass
            
            # Check if directory exists
            if not directory_path.exists() or not directory_path.is_dir():
                logger.warning(f"Directory not found: {directory_path}")
                return create_error_response(
                    f"Directory not found: {directory}",
                    404,
                    {"exists": False, "directory": str(directory)}
                )# Try database-first approach for better performance
            files = []
            try:                # First attempt: Get characters from database that are in this directory
                from fastapi.concurrency import run_in_threadpool
                from backend.utils.path_utils import normalize_path
                
                # Use configurable limit or None for no limit
                query_limit = db_limit if db_limit is not None else None
                if query_limit is None:
                    # Get all characters if no limit specified
                    db_characters = await run_in_threadpool(char_service.get_all_characters, 0, None)
                else:
                    db_characters = await run_in_threadpool(char_service.get_all_characters, 0, query_limit)
                  # Filter for characters in the requested directory using normalized paths
                db_files_in_dir = []
                normalized_directory = normalize_path(str(directory_path))
                
                for db_char in db_characters:
                    try:
                        char_path = Path(db_char.png_file_path)
                        normalized_char_dir = normalize_path(str(char_path.parent))
                        
                        if normalized_char_dir == normalized_directory and char_path.exists():
                            db_files_in_dir.append({
                                "name": char_path.stem,
                                "path": str(char_path),
                                "size": char_path.stat().st_size,
                                "modified": datetime.fromtimestamp(char_path.stat().st_mtime, tz=timezone.utc)
                            })
                    except Exception as char_error:
                        logger.warning(f"Error processing character {db_char.character_uuid}: {char_error}")
                
                logger.info(f"Found {len(db_files_in_dir)} characters in database for directory {directory}")
                
                # If we found characters in DB, use those
                if db_files_in_dir:
                    files = db_files_in_dir
                else:
                    # Fallback to directory scanning if database is empty
                    logger.info("No database records found, falling back to directory scanning")
                    png_files = list(directory_path.glob("*.png"))
                    logger.info(f"Found {len(png_files)} PNG files in directory {directory}")
                    
                    for file_path in png_files:
                        try:
                            stat_info = file_path.stat()
                            files.append({
                                "name": file_path.stem,
                                "path": str(file_path),
                                "size": stat_info.st_size,
                                "modified": datetime.fromtimestamp(stat_info.st_mtime, tz=timezone.utc)
                            })
                        except Exception as e:
                            logger.error(f"Error processing file {file_path}: {e}")
                            
            except Exception as db_error:
                logger.warning(f"Database query failed, falling back to directory scan: {db_error}")
                # Final fallback to directory scanning
                png_files = list(directory_path.glob("*.png"))
                logger.info(f"Found {len(png_files)} PNG files in directory {directory}")
                
                for file_path in png_files:
                    try:
                        stat_info = file_path.stat()
                        files.append({
                            "name": file_path.stem,
                            "path": str(file_path),
                            "size": stat_info.st_size,
                            "modified": datetime.fromtimestamp(stat_info.st_mtime, tz=timezone.utc)
                        })
                    except Exception as e:
                        logger.error(f"Error processing file {file_path}: {e}")
                        
            logger.info(f"Successfully processed {len(files)} characters in directory {directory}")
            # When directory is provided, return a ListResponse of FileInfo
            # When directory is provided, return a CharacterListResponse
            # Convert FileInfo to a CharacterAPIBase-like structure for consistency
            # This is a simplified representation, as full metadata isn't available from file system scan
            characters_from_files = []
            for f_info in files:
                # Create a minimal CharacterAPIBase from FileInfo
                # This might not have all fields, but will satisfy the basic structure
                characters_from_files.append(CharacterAPIBase(
                    character_uuid=str(uuid.uuid4()), # Generate a dummy UUID for files not in DB
                    name=f_info["name"],
                    png_file_path=f_info["path"],
                    created_at=f_info["modified"],
                    updated_at=f_info["modified"],
                    db_metadata_last_synced_at=f_info["modified"],
                    # Default other optional fields
                    description="", personality="", scenario="", first_mes="", mes_example="",
                    creator_comment="", tags=[], spec_version="2.0", extensions_json={},
                    original_character_id=None
                ))
            return CharacterListResponse(characters=characters_from_files, total=len(characters_from_files))
        except Exception as e:
            logger.error(f"Error scanning directory {directory}: {e}")
            return create_error_response(
                f"Error scanning directory: {str(e)}",
                500,
                {"exists": False, "directory": directory}
            )    # If no directory is provided, use the new database-first approach with directory sync
    logger.info(f"GET /api/characters - using database-first with directory sync (skip: {skip}, limit: {limit})")
    try:
        # Use the new indexing service to get characters with directory sync
        all_characters = await indexing_service.get_characters_with_directory_sync()
        
        # Apply pagination to the results
        total_characters = len(all_characters)
        paginated_characters = all_characters[skip:skip + limit] if limit > 0 else all_characters[skip:]
        
        # Convert to API format using the existing to_api_model function
        characters_api_list = []
        for db_char in paginated_characters:
            try:
                api_char = to_api_model(db_char, logger)
                characters_api_list.append(api_char)
            except Exception as e:
                logger.error(f"Error converting character to API model: {e}")
                continue
        
        # When no directory is provided, return a ListResponse of CharacterAPIBase
        return CharacterListResponse(characters=characters_api_list, total=total_characters)

    except Exception as e:
        logger.error(f"Error fetching or processing characters: {e}")
        raise HTTPException(status_code=500, detail="Internal server error while fetching or processing characters.")

@router.get("/character/{character_uuid}", response_model=DataResponse, responses=STANDARD_RESPONSES, summary="Get a specific character by UUID")
async def get_character_by_uuid_endpoint(
    character_uuid: str,
    char_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger_dependency),
    db: Session = Depends(get_db_dependency)
):
    """Get a specific character by UUID with standardized response."""
    try:
        logger.info(f"GET /api/character/{character_uuid}")
        db_char = char_service.get_character_by_uuid(character_uuid, db)
        if not db_char:
            raise NotFoundException(f"Character with UUID {character_uuid} not found")
        
        api_char = to_api_model(db_char, logger)
        return create_data_response(api_char)
        
    except NotFoundException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving character {character_uuid}: {str(e)}")
        raise handle_generic_error(e, "retrieving character")

@router.post("/characters/save-card", response_model=DataResponse, responses=STANDARD_RESPONSES, summary="Save/Update character card (PNG+DB)")
async def save_character_card_endpoint(
    file: UploadFile = File(...),
    metadata_json: str = Form(...), # Full character card spec as JSON string
    char_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Save/Update character card (PNG+DB) with standardized response."""
    try:
        logger.info(f"POST /api/characters/save-card for file: {file.filename}")
        
        image_bytes = await file.read()
        if not image_bytes:
            raise ValidationException("Uploaded image file is empty")
        if not image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValidationException("Invalid image file: not a PNG")

        try:
            raw_metadata = json.loads(metadata_json)
        except json.JSONDecodeError as e:
            raise ValidationException(f"Invalid metadata JSON: {e}")

        saved_db_character = char_service.save_uploaded_character_card(
            raw_character_card_data=raw_metadata,
            image_bytes=image_bytes,
            original_filename=file.filename or "character.png"
        )

        if not saved_db_character:
            raise ValidationException("Failed to save character card")

        api_char_response = to_api_model(saved_db_character, logger)
        return create_data_response({"character": api_char_response})
        
    except ValidationException:
        raise
    except Exception as e:
        logger.error(f"Error in save_character_card endpoint: {e}")
        raise handle_generic_error(e, "saving character card")

@router.delete("/character/{character_uuid}", response_model=DataResponse, responses=STANDARD_RESPONSES, summary="Delete a character by UUID")
async def delete_character_by_uuid_endpoint(
    character_uuid: str,
    delete_png: bool = Query(False, description="Whether to also delete the character's PNG file from disk."),
    char_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger_dependency),
    db: Session = Depends(get_db_dependency)
):
    """Delete a character by UUID with standardized response."""
    try:
        logger.info(f"DELETE /api/character/{character_uuid} with delete_png: {delete_png}")
        success = char_service.delete_character(character_uuid, delete_png_file=delete_png)
        if not success:
            # Check if it was not found vs other error
            db_char_check = char_service.get_character_by_uuid(character_uuid, db)
            if not db_char_check:
                raise NotFoundException(f"Character with UUID {character_uuid} not found")
            raise ValidationException("Failed to delete character")
        
        return create_data_response({"success": True, "message": "Character deleted successfully"})
        
    except NotFoundException:
        raise
    except ValidationException:
        raise
    except Exception as e:
        logger.error(f"Error deleting character {character_uuid}: {str(e)}")
        raise handle_generic_error(e, "deleting character")

@router.post("/character/{character_uuid}/duplicate", response_model=DataResponse, responses=STANDARD_RESPONSES, summary="Duplicate a character by UUID")
async def duplicate_character_endpoint(
    character_uuid: str,
    new_name: Optional[str] = Body(None, description="Optional new name for the duplicated character"),
    char_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Duplicate a character by UUID, creating a copy with a new UUID and filename."""
    try:
        logger.info(f"POST /api/character/{character_uuid}/duplicate with new_name: {new_name}")
        
        # Duplicate the character using the service
        duplicated_character = char_service.duplicate_character(character_uuid, new_name)
        if not duplicated_character:
            raise NotFoundException(f"Character with UUID {character_uuid} not found or could not be duplicated")
        
        # Convert to API response format
        api_char_response = to_api_model(duplicated_character, logger)
        return create_data_response({
            "character": api_char_response,
            "message": f"Character duplicated successfully as '{duplicated_character.name}'"
        })
        
    except NotFoundException:
        raise
    except ValidationException:
        raise
    except Exception as e:
        logger.error(f"Error duplicating character {character_uuid}: {str(e)}")
        raise handle_generic_error(e, "duplicating character")

@router.get("/character-image/{character_uuid}", summary="Serve a character's PNG image by UUID")
async def get_character_image_by_uuid(
    character_uuid: str,
    char_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger_dependency),
    db: Session = Depends(get_db_dependency)
):
    logger.info(f"Request for image for character UUID: {character_uuid}")
    
    # Remove .png extension if present in the UUID parameter
    if character_uuid.endswith('.png'):
        character_uuid = character_uuid[:-4]  # Remove .png extension
        logger.info(f"Removed .png extension from UUID parameter, using: {character_uuid}")
    
    db_char = char_service.get_character_by_uuid(character_uuid, db)
    
    # Fallback: Try looking up by name if UUID lookup fails
    if not db_char:
        logger.info(f"Character not found by UUID: {character_uuid}. Trying lookup by name.")
        # Try exact name match
        db_char = db.query(CharacterDBModel).filter(CharacterDBModel.name == character_uuid).first()
        
        if not db_char:
            # Try matching filename stem if name lookup fails
            # This is expensive but useful for legacy/broken paths
            # We look for a character whose png_file_path ends with the requested string + .png
            search_filename = f"{character_uuid}.png"
            # Note: This might be slow on large databases, but it's a fallback
            try:
                db_char = db.query(CharacterDBModel).filter(CharacterDBModel.png_file_path.ilike(f"%{search_filename}")).first()
            except Exception:
                pass # Ignore if ILIKE validation fails or other DB issues

    if not db_char or not db_char.png_file_path:
        raise HTTPException(status_code=404, detail="Character or character image path not found.")
    
    file_path = Path(db_char.png_file_path)
    if not file_path.is_file():
        logger.error(f"Character image file not found at path from DB: {file_path} for UUID {character_uuid}")
        raise HTTPException(status_code=404, detail="Character image file not found on disk.")
    
    return FileResponse(file_path, media_type="image/png")

@router.get("/character-image/{path:path}", summary="Serve a character's PNG image by file path")
async def get_character_image_by_path(
    path: str,
    logger: LogManager = Depends(get_logger_dependency)
):
    logger.info(f"Request for image for character path: {path}")
    
    try:
        # Handle Windows paths correctly - replace forward slashes with backslashes if on Windows
        fixed_path = path.replace('/', os.sep) if os.name == 'nt' else path
        
        # Try to be more robust with path resolution
        try:
            # First try with the path as is
            file_path = Path(fixed_path)
            
            # If the path is not absolute or doesn't exist, try to make it relative to the application root
            if not file_path.is_absolute() or not file_path.exists():
                # Try to find the application root directory
                app_root = Path(__file__).parent.parent.parent
                file_path = app_root / fixed_path
                
                # If that doesn't work, try a last fallback to characters directory
                if not file_path.exists():
                    characters_dir = app_root / "characters"
                    file_path = characters_dir / Path(fixed_path).name
        except Exception:
            # Fall back to basic path if all resolution attempts fail
            file_path = Path(fixed_path)

        # Check if the file exists
        if not file_path.is_file():
            logger.error(f"Character image file not found at path: {file_path}")
            raise HTTPException(status_code=404, detail=f"Character image file not found on disk at {file_path}")
        
        return FileResponse(file_path, media_type="image/png")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving character image by path {path}: {str(e)}")
        raise HTTPException(status_code=404, detail=f"Error serving character image: {str(e)}")

@router.post("/characters/scan-sync", response_model=DataResponse, responses=STANDARD_RESPONSES, summary="Manually trigger character directory synchronization")
async def trigger_scan_character_directory_endpoint(
    char_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Manually trigger character directory synchronization with standardized response."""
    try:
        logger.info("POST /api/characters/scan-sync - Manual character directory synchronization triggered.")
        char_service.sync_character_directories() # This is synchronous within the request
        return create_data_response({"success": True, "message": "Character directory synchronization complete"})
    except Exception as e:
        logger.error(f"Error during manual character directory scan: {e}", error=e)
        raise handle_generic_error(e, "character directory scan")

# --- Utility Endpoints (Primarily for uploaded files, not interacting with DB characters directly) ---

@router.get("/character-metadata/{path:path}", response_model=DataResponse[dict], responses=STANDARD_RESPONSES, summary="Get character metadata by file path")
async def get_character_metadata_by_path(
    path: str,
    png_handler: PngMetadataHandler = Depends(get_png_handler_dependency),
    char_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger_dependency),
    db: Session = Depends(get_db_dependency)  # Add database session dependency
):
    logger.info(f"Request for metadata for character path: {path}")
    
    try:
        # Handle Windows paths correctly - replace forward slashes with backslashes if on Windows
        fixed_path = path.replace('/', os.sep) if os.name == 'nt' else path
        
        # Try to be more robust with path resolution
        try:
            # First try with the path as is
            file_path = Path(fixed_path)
            
            # If the path is not absolute or doesn't exist, try to make it relative to the application root
            if not file_path.is_absolute() or not file_path.exists():
                # Try to find the application root directory
                app_root = Path(__file__).parent.parent.parent
                file_path = app_root / fixed_path
                
                # If that doesn't work, try a last fallback to characters directory
                if not file_path.exists():
                    characters_dir = app_root / "characters"
                    file_path = characters_dir / Path(fixed_path).name
        except Exception:
            # Fall back to basic path if all resolution attempts fail
            file_path = Path(fixed_path)
        
        # Check if the file exists
        if not file_path.is_file():
            logger.error(f"Character file not found at path: {file_path}")
            raise HTTPException(status_code=404, detail=f"Character file not found on disk at {file_path}")
        
        # Read metadata directly from the file
        try:
            # Convert Path object to string before passing to read_metadata
            abs_file_path = str(file_path.resolve())
            metadata = png_handler.read_metadata(abs_file_path)
            if not metadata:
                raise HTTPException(status_code=400, detail="Could not extract metadata from PNG.")
            
            # Check if character exists in the database - if not, add it to ensure UUID
            # First check if we have a character_uuid in the metadata
            data_section = metadata.get("data", {})
            character_uuid = data_section.get("character_uuid")
            
            db_char = None
            if character_uuid:
                # Check for character by UUID first
                db_char = char_service.get_character_by_uuid(character_uuid, db) # Pass db session
            
            if not db_char:
                # Also check by path in case it was imported without UUID
                db_char = char_service.get_character_by_path(abs_file_path, db) # Pass db session
            
            # If still not found, we need to add it to database WITHOUT creating new PNG files
            if not db_char:
                logger.info(f"Character not found in database. Adding existing file {file_path} to database.")
                try:
                    # Add the existing character to the database without creating new PNG files
                    # We'll use the sync_character_directories method approach instead
                    data_section = metadata.get("data", {})
                    char_name = data_section.get("name", file_path.stem)
                    
                    # Generate UUID if not present
                    char_uuid = data_section.get("character_uuid")
                    if not char_uuid:
                        import uuid
                        char_uuid = str(uuid.uuid4())
                        # Update metadata with new UUID
                        if "data" not in metadata:
                            metadata["data"] = {}
                        metadata["data"]["character_uuid"] = char_uuid
                        
                        # Write UUID back to the existing PNG file
                        try:
                            char_service.png_handler.write_metadata_to_png(abs_file_path, metadata)
                            logger.info(f"Added UUID {char_uuid} to existing PNG: {abs_file_path}")
                        except Exception as png_error:
                            logger.warning(f"Could not write UUID to PNG {abs_file_path}: {png_error}")
                    
                    # Create database record pointing to the existing file
                    from backend.sql_models import Character as CharacterModel
                    import datetime
                    
                    db_char = CharacterModel(
                        character_uuid=char_uuid,
                        name=char_name,
                        png_file_path=abs_file_path,
                        description=data_section.get("description"),
                        personality=data_section.get("personality"),
                        scenario=data_section.get("scenario"),
                        first_mes=data_section.get("first_mes"),
                        mes_example=data_section.get("mes_example"),
                        creator_comment=metadata.get("creatorcomment"),
                        tags=json.dumps(data_section.get("tags", [])),
                        spec_version=metadata.get("spec_version", "2.0"),
                        extensions_json=json.dumps(data_section.get("extensions", {})),
                        db_metadata_last_synced_at=datetime.datetime.utcnow(),
                        updated_at=datetime.datetime.utcnow(),
                        created_at=datetime.datetime.utcnow()
                    )
                    db.add(db_char)
                    db.commit()
                    db.refresh(db_char)
                    
                    if db_char and db_char.character_uuid:
                        # Update our metadata copy with the new UUID
                        if "data" not in metadata:
                            metadata["data"] = {}
                        metadata["data"]["character_uuid"] = db_char.character_uuid
                        logger.info(f"Successfully added existing character to database with UUID: {db_char.character_uuid}")
                    else:
                        logger.warning(f"Failed to add character to database: {abs_file_path}")
                except Exception as save_error:
                    logger.error(f"Error saving character to database: {save_error}")
                    # Continue with the metadata we have, even without UUID
            elif character_uuid != db_char.character_uuid:
                # UUID in metadata doesn't match database, update metadata
                if "data" not in metadata:
                    metadata["data"] = {}
                metadata["data"]["character_uuid"] = db_char.character_uuid
                logger.info(f"Updated metadata with correct UUID from database: {db_char.character_uuid}")
            
            # Return the metadata, now with UUID if it was added to DB
            return create_data_response(metadata)
        except Exception as read_error:
            logger.error(f"Error reading metadata: {read_error}")
            raise HTTPException(status_code=500, detail=f"Error reading metadata: {str(read_error)}")
            
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.error(f"Error serving character metadata by path {path}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting character metadata: {str(e)}")

@router.post("/characters/extract-metadata", response_model=DataResponse, responses=STANDARD_RESPONSES, summary="Upload PNG and extract metadata")
async def extract_metadata_from_upload_endpoint(
    file: UploadFile = File(...),
    png_handler: PngMetadataHandler = Depends(get_png_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Upload PNG and extract metadata with standardized response."""
    try:
        logger.info(f"POST /api/characters/extract-metadata for file: {file.filename}")
        
        image_bytes = await file.read()
        if not image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValidationException("Invalid file: not a PNG")
        
        metadata = png_handler.read_metadata(image_bytes)
        return create_data_response({"metadata": metadata or {}})
        
    except ValidationException:
        raise
    except Exception as e:
        logger.error(f"Error extracting metadata from upload: {e}")
        raise handle_generic_error(e, "extracting metadata")

@router.post("/characters/extract-lore", response_model=DataResponse, responses=STANDARD_RESPONSES, summary="Upload PNG and extract lore book")
async def extract_lore_from_upload_endpoint(
    file: UploadFile = File(...),
    png_handler: PngMetadataHandler = Depends(get_png_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Upload PNG and extract lore book with standardized response."""
    try:
        logger.info(f"POST /api/characters/extract-lore for file: {file.filename}")
        
        image_bytes = await file.read()
        if not image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValidationException("Invalid file: not a PNG")

        metadata = png_handler.read_metadata(image_bytes)
        lore_book_data = None
        if metadata and isinstance(metadata.get("data"), dict):
            lore_book_data = metadata["data"].get("character_book")
        
        if lore_book_data:
            return create_data_response({
                "lore_book": lore_book_data,
                "message": "Lore extracted successfully"
            })
        else:
            return create_data_response({
                "lore_book": None,
                "message": "No lore book found in character data"
            })
            
    except ValidationException:
        raise
    except Exception as e:
        logger.error(f"Error extracting lore from upload: {e}")
        raise handle_generic_error(e, "extracting lore")

class BackyardImportRequest(BaseModel):
    url: str

@router.post("/characters/import-backyard", response_model=DataResponse, responses=STANDARD_RESPONSES, summary="Import character from Backyard.ai URL")
async def import_from_backyard_endpoint(
    request: Request,
    backyard_request: BackyardImportRequest,
    char_service: CharacterService = Depends(get_character_service_dependency),
    backyard_handler: BackyardHandler = Depends(get_backyard_handler_dependency),
    png_handler: PngMetadataHandler = Depends(get_png_handler_dependency),
    settings_manager: SettingsManager = Depends(get_settings_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Import character from Backyard.ai URL with standardized response."""
    try:
        backyard_url = backyard_request.url
        logger.info(f"POST /api/characters/import-backyard for URL: {backyard_url}")
        
        # Import character data using existing method - this returns V2 format
        character_data, preview_url = backyard_handler.import_character(backyard_url)
        if not character_data:
            raise ValidationException("Failed to import character data from Backyard URL")
        
        # Generate UUID for the character
        character_uuid = str(uuid.uuid4())
        
        # Add UUID to the character data
        if 'data' not in character_data:
            character_data['data'] = {}
        character_data['data']['character_uuid'] = character_uuid
        character_data['character_uuid'] = character_uuid  # Also at top level for compatibility
        
        # Download character image from preview URL
        image_bytes = None
        if preview_url:
            try:
                import requests
                response = requests.get(preview_url, timeout=30)
                response.raise_for_status()
                image_bytes = response.content
                
                if not image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
                    logger.warning("Downloaded image is not a PNG, attempting to use anyway")
                    
            except Exception as e:
                logger.warning(f"Failed to download preview image: {e}")
                # Continue without image - we'll create a default PNG
                
        # If no image downloaded, create a simple default PNG
        if not image_bytes:
            from PIL import Image
            import io
            # Create a simple 512x512 default image
            default_img = Image.new('RGB', (512, 512), color='lightgray')
            img_buffer = io.BytesIO()
            default_img.save(img_buffer, format='PNG')
            image_bytes = img_buffer.getvalue()
            logger.info("Created default PNG image for Backyard import")
        
        # Generate filename from character name
        character_name = character_data.get('data', {}).get('name', 'imported_backyard_char')
        # Sanitize filename
        import re
        sanitized_name = re.sub(r'[\\/*?:"<>|]', "", character_name)
        sanitized_name = sanitized_name[:100] if sanitized_name else f"backyard_import_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Get character directory from settings
        character_dir_setting = settings_manager.get_setting("character_directory")
        if not character_dir_setting:
            # Use default characters directory
            character_dir = Path(__file__).resolve().parent.parent / "characters"
        else:
            character_dir = Path(character_dir_setting)
        
        # Ensure directory exists
        character_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename to avoid collisions
        base_filename = f"{sanitized_name}.png"
        png_path = character_dir / base_filename
        counter = 1
        while png_path.exists():
            png_path = character_dir / f"{sanitized_name}_{counter}.png"
            counter += 1
        
        # Embed V2 metadata into PNG using the metadata handler
        try:
            final_image_bytes = png_handler.write_metadata(image_bytes, character_data)
            logger.info("Successfully embedded V2 metadata into PNG")
        except Exception as e:
            logger.error(f"Failed to embed metadata into PNG: {e}")
            raise ValidationException(f"Failed to embed character metadata: {str(e)}")
        
        # Save PNG file to characters directory
        try:
            with open(png_path, "wb") as f:
                f.write(final_image_bytes)
            logger.info(f"Saved character PNG to: {png_path}")
        except Exception as e:
            logger.error(f"Failed to save PNG file: {e}")
            raise ValidationException(f"Failed to save character file: {str(e)}")
        
        # Trigger directory sync to ensure the new character is immediately available in the database
        # This enables UUID-based image lookups and gallery refresh
        try:
            logger.info("Syncing character directories after Backyard import")
            char_service.sync_character_directories()
            logger.info("Character directory sync completed successfully")
        except Exception as e:
            logger.warning(f"Directory sync failed after import, but PNG was saved: {e}")
            # Don't fail the import if sync fails - the PNG exists and will be picked up later
        
        # Return V2 format directly for immediate frontend use
        # This matches what the character-metadata endpoint returns
        response_data = {
            "character": character_data,  # V2 format with characterData.data structure
            "message": "Character imported successfully",
            "file_path": str(png_path)
        }
        
        logger.info(f"Successfully imported Backyard character: {character_name}")
        return create_data_response(response_data)
        
    except ValidationException:
        raise
    except Exception as e:
        logger.error(f"Error importing from Backyard: {e}")
        raise handle_generic_error(e, "importing from Backyard")

# Deprecated/Old Endpoints to be removed or fully refactored:
# - /characters/{character_id}/avatar (avatar handling is part of save_card now)
# - The old path-based /character/{path:path} delete (replaced by UUID delete)
# - The old path-based /characters/metadata/{path:path} (replaced by UUID metadata get)
# - The old path-based /characters/image/{path:path} (replaced by UUID image get)

# The scan_directory_for_characters function is kept as a utility but not directly exposed as an endpoint
# for listing characters anymore, as /api/characters now serves from DB.
# The /api/characters/scan-directory endpoint triggers the service sync.