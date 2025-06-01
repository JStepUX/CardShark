# backend/lore_endpoints.py
# Endpoints for lore extraction and handling
import traceback
import os
import uuid
from fastapi import APIRouter, Request, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional
import urllib.parse
from pathlib import Path

from backend.log_manager import LogManager
# Don't import logger from main - this creates a circular import
from backend.lore_handler import LoreHandler
from backend.services.character_service import CharacterService # Import CharacterService
from backend.dependencies import get_character_service_dependency # For CharacterService dependency

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
    get_logger_dependency
)

# Get dependencies

# Dependency function to provide the global logger instance
def get_main_app_logger(request: Request) -> LogManager:
    """Get the logger from the FastAPI app state instead of importing directly from main."""
    if request.app.state.logger is None:
        raise HTTPException(status_code=500, detail="Logger not initialized")
    return request.app.state.logger

def get_lore_handler(logger: LogManager = Depends(get_main_app_logger)):
    return LoreHandler(logger)

# Create router
router = APIRouter(
    prefix="/api/lore", 
    tags=["lore"],
    responses=STANDARD_RESPONSES
)

# --- Helper Functions ---
# get_lore_image_dir is now handled by CharacterService.get_lore_image_paths

async def save_lore_image(
    logger: LogManager,
    character_service: CharacterService, # Added CharacterService dependency
    character_identifier: str,
    lore_entry_id: str, # Assuming lore_entry_id can be used for naming or part of it
    image_file: UploadFile,
    timestamp: bool = True
) -> tuple[str, str]: # Returns (image_uuid, image_path_on_disk)
    """Saves an uploaded image file for a lore entry."""
    # Get appropriate directory based on character identifier using CharacterService
    # We need a placeholder filename for get_lore_image_paths if we only want the directory
    # Or, construct the filename first, then get paths.
    # Let's generate UUID and filename parts first.
    
    # Generate a unique ID for the image itself
    image_uuid_val = str(uuid.uuid4())
    
    original_filename = image_file.filename if image_file.filename else "unknown_image"
    file_extension = Path(original_filename).suffix.lower()
    if not file_extension:
        # Try to infer from content type if filename has no extension
        content_type = image_file.content_type
        if content_type == "image/png": file_extension = ".png"
        elif content_type == "image/jpeg": file_extension = ".jpg"
        elif content_type == "image/webp": file_extension = ".webp"
        elif content_type == "image/gif": file_extension = ".gif"
        else: file_extension = ".png" # Default to png

    # Construct filename: {image_uuid_val}_{timestamp}.{extension} or {lore_entry_id}_{timestamp}.{extension}
    # Using image_uuid_val for the filename base.
    filename_base = image_uuid_val
    if timestamp:
        # Using a simpler timestamp for filename, or rely on UUID uniqueness primarily
        # current_timestamp = str(int(uuid.uuid4().int / (10**28))) # Shorter timestamp
        # filename = f"{filename_base}_{current_timestamp}{file_extension}"
        filename = f"{filename_base}{file_extension}" # UUID should be unique enough
    else:
        filename = f"{filename_base}{file_extension}"

    paths = character_service.get_lore_image_paths(character_identifier, filename)
    # lore_image_dir = Path(paths["base_path"]) # This is the directory
    file_path = Path(paths["absolute_image_path"]) # This is the full path to the file
    lore_image_dir = file_path.parent # Get the directory from the full file path
    
    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        content = await image_file.read()
        with open(file_path, 'wb') as out_file:
            out_file.write(content)
        logger.log_info(f"Lore image saved: {file_path}")
        return image_uuid_val, str(file_path)
    except Exception as e:
        logger.log_error(f"Error saving lore image {file_path}: {e}")
        # Attempt to clean up partially written file if error occurs
        if file_path.exists():
            try:
                os.remove(file_path)
            except Exception as cleanup_e:
                logger.log_error(f"Error cleaning up partial file {file_path}: {cleanup_e}")
        raise HTTPException(status_code=500, detail=f"Could not save image: {e}")

# --- API Endpoints ---

@router.post("/images/upload", response_model=DataResponse[dict])
async def upload_lore_image(
    request: Request, # Add request parameter
    character_uuid: str = Form(None),  # Made optional
    character_fallback_id: Optional[str] = Form(None),  # Added fallback ID
    lore_entry_id: str = Form(...),  # This ID is used to update the correct lore entry
    image_file: UploadFile = File(...),
    logger: LogManager = Depends(get_logger_dependency),
    character_service: CharacterService = Depends(get_character_service_dependency) # Added CharacterService
):
    """
    Uploads an image for a specific lore entry.
    Updates the lore entry metadata (has_image, image_uuid) - this part needs to be handled by updating the character JSON.
    """
    # Handle cases where character_uuid is not provided
    character_identifier = character_uuid
    
    if not character_identifier and character_fallback_id:
        logger.log_info(f"No UUID provided, using fallback ID: {character_fallback_id}")
        # Try to get UUID from mapping if we have a fallback ID
        # try:
            # UUID generation/lookup is now primarily handled by CharacterService during character creation/sync
            # For lore image association, we expect a valid character_identifier (UUID)
            # If fallback_id is used, the frontend or a previous step should resolve it to a UUID.
            # For now, we'll assume character_identifier will be a UUID if character_uuid is provided.
            # If only fallback_id is provided, we might need to look up the UUID.
            # This part of the logic might need to be re-evaluated based on how CharacterService handles UUIDs.
            # For now, if character_uuid is None, character_identifier remains character_fallback_id.
            # The CharacterService.get_lore_image_paths will need a valid UUID.
            # Let's assume if character_uuid is provided, it's the one to use.
            # If not, and fallback_id is, we might need a lookup step here or expect client to provide UUID.
            # This cim.get_character_uuid is removed as cim doesn't exist.
            # uuid_result = await cim.get_character_uuid(character_fallback_id, character_name)
            # if uuid_result:
            #     character_identifier = uuid_result
            #     logger.log_info(f"Found/generated UUID {character_identifier} for fallback ID {character_fallback_id}")
        # except Exception as e:
        #     logger.log_error(f"Error getting UUID for fallback ID: {e}")
        #     # Continue with fallback ID if UUID lookup fails
        #     pass
        # Simplified: if character_uuid is given, use it. Otherwise, the fallback_id is used as identifier.
        # CharacterService will need to handle non-UUID identifiers if that's the case, or this endpoint
        # must ensure character_identifier is always a UUID.
        # For now, let's assume character_service.get_lore_image_paths expects a UUID.
        # If character_uuid is None, we might need to raise an error or perform a lookup.
        # This logic is simplified for now.
        if not character_identifier and character_fallback_id:
             # This implies character_identifier is now character_fallback_id
             # This might not be a UUID. CharacterService needs to handle this or we need a lookup.
             # For now, we pass it as is.
             pass
        elif not character_identifier and not character_fallback_id:
             raise ValidationException("Either character_uuid or character_fallback_id must be provided")

    
    # If we still don't have a character identifier, use fallback or raise error
    if not character_identifier:
        if character_fallback_id:
            # Use fallback ID if available
            logger.log_info(f"Using fallback ID directly: {character_fallback_id}")
            character_identifier = character_fallback_id
        else:
            # No identifiers provided
            raise ValidationException("Either character_uuid or character_fallback_id must be provided")
    
    logger.log_info(f"Processing lore image upload for char: {character_identifier}, lore_entry: {lore_entry_id}")

    if not image_file.content_type or not image_file.content_type.startswith("image/"):
        raise ValidationException("Invalid file type. Only images are allowed.")

    try:
        image_uuid, image_disk_path = await save_lore_image(logger, character_service, character_identifier, lore_entry_id, image_file)
        
        # The client will handle updating the character JSON with has_image and image_uuid.
        # This endpoint just saves the file and returns its details.
        # Get paths based on character identifier using CharacterService
        # image_disk_path is an absolute path to the saved file. We need its filename part.
        saved_image_filename = Path(image_disk_path).name
        paths = character_service.get_lore_image_paths(character_identifier, saved_image_filename)
        relative_image_path = f"/{paths['relative_path']}" # Ensure leading slash for URL
        
        return create_data_response({
            "success": True,
            "message": "Image uploaded successfully.",
            "image_uuid": image_uuid,
            "image_path": relative_image_path, # Path client can use in <img> src
            "lore_entry_id": lore_entry_id # Return for client to update correct entry
        })
    except (ValidationException, NotFoundException):
        raise
    except HTTPException as http_exc:
        raise http_exc # Re-raise HTTP exceptions from save_lore_image
    except Exception as e:
        logger.log_error(f"Unhandled error in lore image upload: {e}", exc_info=True)
        raise handle_generic_error(e, logger, "uploading lore image")

@router.post("/images/from-url", response_model=DataResponse[dict])
async def import_lore_image_from_url(
    request: Request, # Add request parameter
    character_uuid: str = Form(None),  # Made optional
    character_fallback_id: Optional[str] = Form(None),  # Added fallback ID
    lore_entry_id: str = Form(...),
    image_url: str = Form(...),
    logger: LogManager = Depends(get_logger_dependency),
    character_service: CharacterService = Depends(get_character_service_dependency) # Added CharacterService
):
    """
    Downloads an image from a URL and associates it with a lore entry.
    """
    # Handle cases where character_uuid is not provided
    character_identifier = character_uuid
    
    if not character_identifier and character_fallback_id:
        logger.log_info(f"No UUID provided, using fallback ID: {character_fallback_id}")
        # try:
            # See comment in upload_lore_image regarding UUID resolution.
            # uuid_result = await cim.get_character_uuid(character_fallback_id, character_name)
            # if uuid_result:
            #     character_identifier = uuid_result
            #     logger.log_info(f"Found/generated UUID {character_identifier} for fallback ID {character_fallback_id}")
        # except Exception as e:
        #     logger.log_error(f"Error getting UUID for fallback ID: {e}")
            # pass
        # Simplified logic for character_identifier
        if not character_identifier and character_fallback_id:
            pass # character_identifier is character_fallback_id
        elif not character_identifier and not character_fallback_id:
            raise ValidationException("Either character_uuid or character_fallback_id must be provided")
    
    # If we still don't have a character identifier, use fallback or raise error
    if not character_identifier:
        if character_fallback_id:
            # Use fallback ID if available
            logger.log_info(f"Using fallback ID directly: {character_fallback_id}")
            character_identifier = character_fallback_id
        else:
            # No identifiers provided
            raise ValidationException("Either character_uuid or character_fallback_id must be provided")
    
    logger.log_info(f"Importing lore image from URL: {image_url} for char: {character_identifier}, lore: {lore_entry_id}")
    
    # Basic URL validation (can be more robust)
    if not image_url.startswith(("http://", "https://")):
        raise ValidationException("Invalid image URL provided.")

    try:
        # Use a library like 'requests' to download the image.
        # For simplicity, this example assumes a synchronous download.
        # In a production app, use an async HTTP client (e.g., httpx).
        import httpx # Replace requests with httpx
        
        async with httpx.AsyncClient() as client:
            response = await client.get(image_url, timeout=10, follow_redirects=True)
            response.raise_for_status() # Raise an exception for bad status codes

            # Determine file extension from content type or URL
            content_type = response.headers.get('content-type', '').lower()
            file_extension = ".png" # Default
            if 'image/jpeg' in content_type: file_extension = ".jpg"
            elif 'image/png' in content_type: file_extension = ".png"
            elif 'image/webp' in content_type: file_extension = ".webp"
            elif 'image/gif' in content_type: file_extension = ".gif"
            else: # Try to guess from URL if content-type is generic
                parsed_url_path = Path(urllib.parse.urlparse(image_url).path)
                if parsed_url_path.suffix and parsed_url_path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp', '.gif']:
                    file_extension = parsed_url_path.suffix.lower()
            
            # Create a temporary UploadFile-like object to reuse save_lore_image
            from io import BytesIO
            
            # Read content into a BytesIO buffer
            image_content_bytes = await response.aread() # Use await for async read
            image_content_buffer = BytesIO(image_content_bytes)
            # No need to seek(0) as BytesIO is initialized with content

        # Create a mock UploadFile outside the httpx client's async context
        class MockUploadFile:
            def __init__(self, data: bytes, filename: str, content_type: str):
                self._data = data
                self.filename = filename
                self.content_type = content_type

            async def read(self):
                return self._data

            # Remove seek method as it's not compatible with returning self._data directly
            # async def seek(self, offset):
            #     # This would require self.file to be a BytesIO object and self._data to be updated
            #     # For simplicity with current change, removing seek.
            #     # If seek is truly needed, MockUploadFile needs to more closely mimic a file stream.
            #     pass
        
        # Use a generic filename as it will be renamed by save_lore_image
        mock_filename = f"downloaded_image{file_extension}"
        mock_upload_file = MockUploadFile(image_content_bytes, mock_filename, content_type)
        
        image_uuid_val, image_disk_path = await save_lore_image(
            logger, character_service, character_identifier, lore_entry_id, mock_upload_file # type: ignore
        )
        
        # Get paths based on character identifier using CharacterService
        saved_image_filename = Path(image_disk_path).name
        paths = character_service.get_lore_image_paths(character_identifier, saved_image_filename)
        relative_image_path = f"/{paths['relative_path']}" # Ensure leading slash

        return create_data_response({
            "success": True,
            "message": "Image imported from URL successfully.",
            "image_uuid": image_uuid_val,
            "image_path": relative_image_path,
            "lore_entry_id": lore_entry_id
        })
    except httpx.RequestError as req_err: # Catch httpx specific request errors
        logger.log_error(f"Error downloading image from URL {image_url}: {req_err}")
        raise ValidationException(f"Failed to download image: {req_err}")
    except (ValidationException, NotFoundException):
        raise
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error importing image from URL: {e}", exc_info=True)
        raise handle_generic_error(e, logger, "importing image from URL")


@router.delete("/images/{character_uuid}/{image_uuid_or_filename}", response_model=DataResponse[dict])
async def delete_lore_image(
    request: Request, # Add request parameter
    character_uuid: str,
    image_uuid_or_filename: str, # This is the UUID of the image or its full filename
    logger: LogManager = Depends(get_logger_dependency),
    character_service: CharacterService = Depends(get_character_service_dependency) # Added CharacterService
):
    """
    Deletes a lore image file from the filesystem.
    The client is responsible for updating the LoreEntry metadata.
    """
    logger.log_info(f"Request to delete lore image: {image_uuid_or_filename} for character: {character_uuid}")
    
    # Use CharacterService to get the absolute path to the image
    # image_uuid_or_filename could be just UUID or UUID with extension.
    # get_lore_image_paths expects a filename. If only UUID is given, we might need to list dir or assume extension.
    # For simplicity, assume image_uuid_or_filename is the actual filename (e.g., uuid.png)
    
    # We need to determine the filename if only UUID is provided.
    # This logic might be complex if filenames have timestamps.
    # For now, assume image_uuid_or_filename IS the filename.
    
    try:
        paths = character_service.get_lore_image_paths(character_uuid, image_uuid_or_filename)
        image_path_to_delete = Path(paths["absolute_image_path"])
    except ValueError as ve: # Catch error if character_uuid is empty
        raise ValidationException(str(ve))
    except Exception as e:
        logger.log_error(f"Error getting image path for deletion: {e}")
        raise handle_generic_error(e, logger, "determining image path for deletion")


    if not image_path_to_delete.is_file(): # Check if it's a file, not just if path exists
        logger.log_warning(f"Lore image not found or not a file: {image_path_to_delete}")
        # Attempt to find by UUID stem if image_uuid_or_filename might be just the UUID part
        # This requires listing the directory, which CharacterService could provide a helper for.
        # For now, keeping it simple: if exact filename doesn't match, it's a 404.
        # A more robust solution would involve CharacterService listing files for a UUID.
        raise NotFoundException("Lore image file not found.")

    try:
        # Use send2trash if available (recommended)
        try:
            import send2trash
            send2trash.send2trash(str(image_path_to_delete))
            logger.log_info(f"Lore image sent to trash: {image_path_to_delete}")
        except ImportError:
            logger.log_warning("send2trash not found. Deleting image file directly.")
            os.remove(image_path_to_delete)
            logger.log_info(f"Lore image deleted directly: {image_path_to_delete}")
        except Exception as trash_error:
            logger.log_error(f"Error sending to trash: {trash_error}. Deleting directly.")
            os.remove(image_path_to_delete)
            logger.log_info(f"Lore image deleted directly after trash error: {image_path_to_delete}")

        return create_data_response({"success": True, "message": "Lore image deleted successfully."})
    except FileNotFoundError: # Should be caught by exists() check, but as a safeguard
        logger.log_warning(f"Lore image not found during deletion attempt: {image_path_to_delete}")
        raise NotFoundException("Lore image file not found.")
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error deleting lore image {image_path_to_delete}: {e}", exc_info=True)
        raise handle_generic_error(e, logger, "deleting lore image")


@router.delete("/images/delete", response_model=DataResponse[dict])
async def delete_lore_image_with_fallback(
    request: Request, # Add request parameter
    character_uuid: Optional[str] = None,
    character_fallback_id: Optional[str] = None,
    image_uuid: str = None, # This should be the filename or UUID part
    logger: LogManager = Depends(get_logger_dependency),
    character_service: CharacterService = Depends(get_character_service_dependency) # Added CharacterService
):
    """
    Deletes a lore image file with support for character fallback IDs.
    """
    # Handle cases where character_uuid is not provided
    character_identifier = character_uuid
    
    if not character_identifier and character_fallback_id:
        logger.log_info(f"No UUID provided for deletion, using fallback ID: {character_fallback_id}")
        # try:
            # character_name = None
            # if character_fallback_id.startswith("name-"):
            #     character_name = character_fallback_id[5:]
            # uuid_result = await cim.get_character_uuid(character_fallback_id, character_name) # cim removed
            # if uuid_result:
            #     character_identifier = uuid_result
            #     logger.log_info(f"Found UUID {character_identifier} for fallback ID {character_fallback_id}")
        # except Exception as e:
        #     logger.log_error(f"Error getting UUID for fallback ID: {e}")
            
    # If we still don't have a character identifier, use fallback or raise error
    if not character_identifier:
        if character_fallback_id:
            character_identifier = character_fallback_id
        else:
            raise ValidationException("Either character_uuid or character_fallback_id must be provided")
    
    logger.log_info(f"Deleting lore image: {image_uuid} for character: {character_identifier}")
    
    # Get the appropriate directory and full path for this character's image
    # Assume image_uuid is the filename or can be resolved to one by get_lore_image_paths
    try:
        paths = character_service.get_lore_image_paths(character_identifier, image_uuid if image_uuid else "dummy_filename_for_dir_check.png")
        # If image_uuid is None or just a UUID stem, paths["absolute_image_path"] might not be correct yet.
        # We need the directory first.
        lore_image_dir = Path(paths["base_path"])
    except ValueError as ve:
        raise ValidationException(str(ve))
    except Exception as e:
        logger.log_error(f"Error getting base path for deletion: {e}")
        raise handle_generic_error(e, logger, "determining image directory for deletion")

    if not image_uuid: # Must have an image_uuid (or filename) to delete
        raise ValidationException("image_uuid (filename) must be provided for deletion.")
    
    # Try to find the file
    if image_uuid.endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif')):
        # If image_uuid already has extension, use it directly
        image_path_to_delete = lore_image_dir / image_uuid
    else:
        # If image_uuid is just the UUID part, try to find matching file
        found_files = list(lore_image_dir.glob(f"{image_uuid}*"))
        if found_files:
            image_path_to_delete = found_files[0]  # Take the first match
            logger.log_info(f"Found matching file by UUID stem: {image_path_to_delete}")
        else:
            logger.log_warning(f"Lore image not found: {image_uuid} in {lore_image_dir}")
            raise NotFoundException("Lore image file not found.")
    
    if not image_path_to_delete.exists() or not image_path_to_delete.is_file():
        logger.log_warning(f"Lore image not found: {image_path_to_delete}")
        raise NotFoundException("Lore image file not found.")

    try:
        # Use send2trash if available (recommended)
        try:
            import send2trash
            send2trash.send2trash(str(image_path_to_delete))
            logger.log_info(f"Lore image sent to trash: {image_path_to_delete}")
        except ImportError:
            logger.log_warning("send2trash not found. Deleting image file directly.")
            os.remove(image_path_to_delete)
            logger.log_info(f"Lore image deleted directly: {image_path_to_delete}")
        except Exception as trash_error:
            logger.log_error(f"Error sending to trash: {trash_error}. Deleting directly.")
            os.remove(image_path_to_delete)
            logger.log_info(f"Lore image deleted directly after trash error: {image_path_to_delete}")

        return create_data_response({"success": True, "message": "Lore image deleted successfully."})
    except FileNotFoundError:
        logger.log_warning(f"Lore image not found during deletion attempt: {image_path_to_delete}")
        raise NotFoundException("Lore image file not found.")
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error deleting lore image {image_path_to_delete}: {e}", exc_info=True)
        raise handle_generic_error(e, logger, "deleting lore image")


# Endpoint for serving lore images - this should align with how main.py serves /uploads
# This might be redundant if /uploads/{character_uuid}/{filename} is already handled by StaticFiles in main.py
# However, having an explicit endpoint can be useful for specific logic or auth in the future.
# For now, we assume main.py's StaticFiles mount for `/uploads` will cover this.
# If not, a route like this would be needed:
# @router.get("/images/{character_uuid}/{image_filename}")
# async def get_lore_image_file(character_uuid: str, image_filename: str, logger: LogManager = Depends(get_logger)):
#     lore_image_dir = get_lore_image_dir(character_uuid, logger)
#     image_path = lore_image_dir / image_filename
#     if not image_path.is_file():
#         raise HTTPException(status_code=404, detail="Image not found")
#     return FileResponse(str(image_path))


# Original /extract-lore endpoint, now prefixed under /api/lore
@router.post("/extract", response_model=DataResponse[dict]) # Changed from /extract-lore to just /extract (relative to /api/lore)
async def extract_lore_entries( # Renamed function for clarity
    request: Request,
    lore_handler: LoreHandler = Depends(get_lore_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """
    Extract and match lore entries from character metadata and chat text.
    """
    try:
        data = await request.json()
        character_data = data.get("character_data")
        chat_text = data.get("text", "")
        
        if not character_data:
            raise ValidationException("Character data is required")
            
        # Extract lore entries from character metadata
        lore_entries = lore_handler.extract_lore_from_metadata(character_data)
        
        # If text is provided, match lore entries against it
        matched_entries = []
        if chat_text:
            matched_entries = lore_handler.match_lore_entries(lore_entries, chat_text)
            
        # Return all lore entries and matched entries
        return create_data_response({
            "success": True,
            "lore_entries": lore_entries,
            "matched_entries": matched_entries,
            "count": len(lore_entries),
            "matched_count": len(matched_entries)
        })
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error extracting lore: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "extracting lore")