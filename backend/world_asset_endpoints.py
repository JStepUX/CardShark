# backend/world_asset_endpoints.py
# API endpoints for world asset management (room images, backgrounds, etc.)
import traceback
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

from backend.log_manager import LogManager
from backend.world_asset_handler import WorldAssetHandler

from backend.response_models import (
    DataResponse,
    STANDARD_RESPONSES,
    create_data_response,
)
from backend.error_handlers import (
    NotFoundException,
    handle_generic_error
)
from backend.dependencies import (
    get_logger_dependency,
    get_world_asset_handler_dependency
)

# Create router
router = APIRouter(
    prefix="/api/world-assets",
    tags=["worlds"],
    responses=STANDARD_RESPONSES
)


@router.post("/{world_uuid}", response_model=DataResponse[dict])
async def upload_world_asset(
    world_uuid: str,
    file: UploadFile = File(...),
    world_asset_handler: WorldAssetHandler = Depends(get_world_asset_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """
    Upload an asset (image) for a world.
    Returns the relative path to use for referencing the asset.
    """
    try:
        # Validate file type
        content_type = file.content_type.lower() if file.content_type else ""
        allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported image format. Allowed: {', '.join(t.split('/')[1] for t in allowed_types)}"
            )

        # Read file content
        file_content = await file.read()

        # Generate a unique filename to avoid collisions
        original_filename = file.filename or "asset.png"
        extension = Path(original_filename).suffix or ".png"
        unique_filename = f"{uuid.uuid4()}{extension}"

        # Save the asset
        relative_path = world_asset_handler.save_asset(world_uuid, file_content, unique_filename)

        logger.log_step(f"Uploaded world asset: {relative_path}")

        return create_data_response({
            "path": relative_path,
            "filename": unique_filename
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error uploading world asset: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "uploading world asset")


@router.get("/{world_uuid}/{filename}")
async def get_world_asset(
    world_uuid: str,
    filename: str,
    world_asset_handler: WorldAssetHandler = Depends(get_world_asset_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """
    Get a world asset (image) by world UUID and filename.
    """
    try:
        # Construct the relative path
        relative_path = f"{world_uuid}/{filename}"

        # Get the absolute path
        asset_path = world_asset_handler.get_asset_path(relative_path)

        if not asset_path:
            raise NotFoundException(f"Asset not found: {relative_path}")

        return FileResponse(asset_path)
    except NotFoundException:
        raise
    except Exception as e:
        logger.log_error(f"Error getting world asset {world_uuid}/{filename}: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, f"getting world asset {filename}")


@router.delete("/{world_uuid}/{filename}", response_model=DataResponse[dict])
async def delete_world_asset(
    world_uuid: str,
    filename: str,
    world_asset_handler: WorldAssetHandler = Depends(get_world_asset_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """
    Delete a specific world asset.
    """
    try:
        relative_path = f"{world_uuid}/{filename}"
        success = world_asset_handler.delete_asset(relative_path)

        if not success:
            raise NotFoundException(f"Asset not found or could not be deleted: {relative_path}")

        return create_data_response({"deleted": relative_path})
    except NotFoundException:
        raise
    except Exception as e:
        logger.log_error(f"Error deleting world asset {world_uuid}/{filename}: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, f"deleting world asset {filename}")
