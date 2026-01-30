# backend/character_image_endpoints.py
# API endpoints for character secondary image management with standardized FastAPI patterns
import os
import traceback
from pathlib import Path
from typing import Dict, List, Any, Optional

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Import handler types for type hinting
from backend.log_manager import LogManager
from backend.handlers.character_image_handler import CharacterImageHandler
from backend.database import get_db

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
    ValidationException,
    NotFoundException,
    handle_generic_error
)
from backend.dependencies import (
    get_logger_dependency
)

# Pydantic model for reorder request
class ReorderImagesRequest(BaseModel):
    """Request body for reordering character images."""
    filenames: List[str]

# Create router
router = APIRouter(
    prefix="/api",
    tags=["character-images"],
    responses=STANDARD_RESPONSES
)

# Dependency for CharacterImageHandler
def get_character_image_handler(
    logger: LogManager = Depends(get_logger_dependency)
) -> CharacterImageHandler:
    """Get CharacterImageHandler instance."""
    return CharacterImageHandler(logger)

@router.get("/character/{character_uuid}/images", response_model=ListResponse[dict])
async def list_character_images(
    character_uuid: str,
    db: Session = Depends(get_db),
    handler: CharacterImageHandler = Depends(get_character_image_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """List all secondary images for a character.

    Args:
        character_uuid: UUID of the character

    Returns:
        ListResponse containing image metadata with fields:
        - id: Database record ID
        - character_uuid: UUID of the character
        - filename: Image filename
        - display_order: Order index for display
        - created_at: Creation timestamp (ISO format)
        - file_size: File size in bytes
        - file_path: Absolute path to the image file
    """
    try:
        images = handler.list_images(db, character_uuid)
        return create_list_response(images, total=len(images))
    except Exception as e:
        logger.log_error(f"Error listing images for character {character_uuid}: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, f"listing images for character {character_uuid}")

@router.post("/character/{character_uuid}/images", response_model=DataResponse[dict])
async def upload_character_image(
    character_uuid: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    handler: CharacterImageHandler = Depends(get_character_image_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Upload a new secondary image for a character.

    Args:
        character_uuid: UUID of the character
        file: Image file (multipart form data)

    Returns:
        DataResponse containing the new image metadata

    Raises:
        ValidationException: If file format is invalid
        HTTPException: If upload fails
    """
    try:
        # Read file content and get filename
        file_content = await file.read()
        original_filename = file.filename or "image.png"

        # Validate file type
        extension = Path(original_filename).suffix.lower()
        valid_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
        if extension not in valid_extensions:
            raise ValidationException(
                f"Invalid file format. Allowed formats: {', '.join(valid_extensions)}"
            )

        result = handler.add_image(db, character_uuid, file_content, original_filename)

        if not result:
            raise HTTPException(
                status_code=400,
                detail="Failed to upload image. File may be invalid or corrupted."
            )

        return create_data_response(result)
    except ValidationException:
        raise
    except Exception as e:
        logger.log_error(f"Error uploading image for character {character_uuid}: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, f"uploading image for character {character_uuid}")

@router.delete("/character/{character_uuid}/images/{filename}", response_model=DataResponse[dict])
async def delete_character_image(
    character_uuid: str,
    filename: str,
    db: Session = Depends(get_db),
    handler: CharacterImageHandler = Depends(get_character_image_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Delete a specific secondary image for a character.

    Args:
        character_uuid: UUID of the character
        filename: Filename of the image to delete

    Returns:
        DataResponse with deletion confirmation

    Raises:
        NotFoundException: If image not found
    """
    try:
        success = handler.delete_image(db, character_uuid, filename)

        if not success:
            raise NotFoundException(f"Image not found: {filename}")

        return create_data_response({"deleted": filename})
    except NotFoundException:
        raise
    except Exception as e:
        logger.log_error(f"Error deleting image {filename} for character {character_uuid}: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, f"deleting image {filename}")

@router.put("/character/{character_uuid}/images/reorder", response_model=DataResponse[dict])
async def reorder_character_images(
    character_uuid: str,
    request: ReorderImagesRequest,
    db: Session = Depends(get_db),
    handler: CharacterImageHandler = Depends(get_character_image_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Reorder secondary images for a character.

    Args:
        character_uuid: UUID of the character
        request: Request body containing list of filenames in desired order

    Returns:
        DataResponse with reorder confirmation

    Raises:
        ValidationException: If filenames list is invalid
        NotFoundException: If any filename not found
    """
    try:
        if not request.filenames:
            raise ValidationException("Filenames list cannot be empty")

        success = handler.reorder_images(db, character_uuid, request.filenames)

        if not success:
            raise ValidationException(
                "Failed to reorder images. One or more filenames may not exist."
            )

        return create_data_response({"reordered": True, "count": len(request.filenames)})
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error reordering images for character {character_uuid}: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, f"reordering images for character {character_uuid}")

@router.get("/character-images/{character_uuid}/{filename}")
async def get_character_image(
    character_uuid: str,
    filename: str,
    handler: CharacterImageHandler = Depends(get_character_image_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Serve a character secondary image file.

    Args:
        character_uuid: UUID of the character
        filename: Filename of the image

    Returns:
        FileResponse with the image file

    Raises:
        NotFoundException: If image file not found
    """
    try:
        image_path = handler.get_image_path(character_uuid, filename)

        if not image_path or not image_path.exists():
            raise NotFoundException(f"Image not found: {filename}")

        return FileResponse(image_path)
    except NotFoundException:
        raise
    except Exception as e:
        logger.log_error(f"Error getting image {filename} for character {character_uuid}: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, f"getting image {filename}")
