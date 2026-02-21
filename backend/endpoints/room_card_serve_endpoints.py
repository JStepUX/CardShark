from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path
import re

# Import handler types for type hinting
from backend.log_manager import LogManager
from backend.png_metadata_handler import PngMetadataHandler

# Dependency provider functions (defined locally, import from main inside)
def get_logger() -> LogManager:
    from backend.main import logger # Import locally
    if logger is None: raise HTTPException(status_code=500, detail="Logger not initialized")
    return logger

def get_png_handler() -> PngMetadataHandler:
    from backend.main import png_handler # Import locally
    if png_handler is None: raise HTTPException(status_code=500, detail="PNG handler not initialized")
    return png_handler

# Create router
router = APIRouter(
    prefix="/api/worlds", # Set prefix for consistency
    tags=["worlds", "rooms"], # Add tags for documentation
)

@router.get("/{world_name}/rooms/{room_id}/card")
async def get_room_card_image(
    world_name: str,
    room_id: str,
    logger: LogManager = Depends(get_logger)
):
    """Serve the v2 Character Card PNG for a specific room."""
    try:
        # Sanitize inputs
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        safe_room_id = re.sub(r'[^\w\-]+', '_', room_id)
        if not safe_world_name or not safe_room_id:
            logger.log_warning(f"Invalid world/room ID requested: {world_name}/{room_id}")
            raise HTTPException(status_code=400, detail="Invalid world or room id.")

        worlds_dir = Path("worlds")
        file_path = worlds_dir / safe_world_name / "rooms" / f"{safe_room_id}.png"
        logger.log_step(f"Attempting to serve room card image from: {file_path}")

        if not file_path.is_file():
            logger.log_warning(f"Room card image not found at: {file_path}")
            raise HTTPException(status_code=404, detail="Room card image not found")

        return FileResponse(file_path, media_type="image/png")
    except HTTPException as http_exc:
        # Log details if available, then re-raise
        logger.log_error(f"HTTP error serving room card image for {world_name}/{room_id}: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.log_error(f"Unexpected error serving room card image for '{world_name}/{room_id}': {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error while serving room card image.")

@router.get("/{world_name}/rooms/{room_id}/card/metadata")
async def get_room_card_metadata(
    world_name: str,
    room_id: str,
    png_handler: PngMetadataHandler = Depends(get_png_handler),
    logger: LogManager = Depends(get_logger)
):
    """Serve JSON metadata for a specific room card."""
    try:
        # Sanitize inputs
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        safe_room_id = re.sub(r'[^\w\-]+', '_', room_id)
        if not safe_world_name or not safe_room_id:
            logger.log_warning(f"Invalid world/room ID requested for metadata: {world_name}/{room_id}")
            raise HTTPException(status_code=400, detail="Invalid world or room id.")

        worlds_dir = Path("worlds")
        file_path = worlds_dir / safe_world_name / "rooms" / f"{safe_room_id}.png"
        logger.log_step(f"Attempting to read metadata from room card: {file_path}")

        if not file_path.is_file():
            logger.log_warning(f"Room card image not found for metadata extraction: {file_path}")
            raise HTTPException(status_code=404, detail="Room card image not found")

        # Read metadata using the injected handler
        try:
             content = file_path.read_bytes()
             metadata = png_handler.read_metadata(content)
             logger.log_step(f"Successfully extracted metadata for room {world_name}/{room_id}")
             return JSONResponse(status_code=200, content=metadata)
        except Exception as read_err:
             logger.error(f"Failed to read or parse metadata from {file_path}: {read_err}")
             raise HTTPException(status_code=500, detail="Failed to read metadata from room card PNG")

    except HTTPException as http_exc:
        # Log details if available, then re-raise
        logger.log_error(f"HTTP error serving room card metadata for {world_name}/{room_id}: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.log_error(f"Unexpected error serving room card metadata for '{world_name}/{room_id}': {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error serving room metadata")
