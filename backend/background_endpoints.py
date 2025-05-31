# backend/background_endpoints.py
# Implements API endpoints for background image management with standardized FastAPI patterns
import os
import traceback
from pathlib import Path
from typing import Dict, List, Any, Optional

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

# Import handler types for type hinting
from backend.log_manager import LogManager
from backend.background_handler import BackgroundHandler

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
    get_logger_dependency,
    get_background_handler_dependency
)

# Create router
router = APIRouter(
    prefix="/api",
    tags=["backgrounds"],
    responses=STANDARD_RESPONSES
)

@router.get("/backgrounds", response_model=ListResponse[dict])
async def list_backgrounds(
    background_handler: BackgroundHandler = Depends(get_background_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """List all available background images."""
    try:
        backgrounds = background_handler.get_all_backgrounds()
        return create_list_response(backgrounds, total=len(backgrounds))
    except Exception as e:
        logger.log_error(f"Error listing backgrounds: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "listing backgrounds")

@router.get("/backgrounds/{background_id}")
async def get_background_image(
    background_id: str,
    background_handler: BackgroundHandler = Depends(get_background_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Get a background image by ID."""
    try:
        background_path = background_handler.get_background_path(background_id)
        if not background_path or not background_path.exists():
            raise NotFoundException(f"Background not found: {background_id}")
        
        return FileResponse(background_path)
    except NotFoundException:
        raise
    except Exception as e:
        logger.log_error(f"Error getting background {background_id}: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, f"getting background {background_id}")

@router.post("/backgrounds/upload", response_model=DataResponse[dict])
async def upload_background(
    file: UploadFile = File(...),
    background_handler: BackgroundHandler = Depends(get_background_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Upload a new background image."""
    try:
        result = await background_handler.save_background(file)
        return create_data_response(result)
    except Exception as e:
        logger.log_error(f"Error uploading background: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "uploading background")

@router.delete("/backgrounds/{background_id}", response_model=DataResponse[dict])
async def delete_background(
    background_id: str,
    background_handler: BackgroundHandler = Depends(get_background_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Delete a background image."""
    try:
        result = background_handler.delete_background(background_id)
        return create_data_response(result)
    except Exception as e:
        logger.log_error(f"Error deleting background {background_id}: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, f"deleting background {background_id}")