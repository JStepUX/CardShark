from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path
import re
from backend.log_manager import LogManager
from backend.png_metadata_handler import PngMetadataHandler

router = APIRouter()
logger = LogManager()
png_handler = PngMetadataHandler(logger)

@router.get("/api/worlds/{world_name}/rooms/{room_id}/card")
async def get_room_card_image(world_name: str, room_id: str):
    """Serve the v2 Character Card PNG for a specific room."""
    try:
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        safe_room_id = re.sub(r'[^\w\-]+', '_', room_id)
        if not safe_world_name or not safe_room_id:
            raise HTTPException(status_code=400, detail="Invalid world or room id.")
        worlds_dir = Path("worlds")
        file_path = worlds_dir / safe_world_name / "rooms" / f"{safe_room_id}.png"
        if not file_path.is_file():
            logger.log_warning(f"Room card image not found at: {file_path}")
            raise HTTPException(status_code=404, detail="Room card image not found")
        logger.log_step(f"Serving room card image from: {file_path}")
        return FileResponse(file_path)
    except HTTPException as http_exc:
        logger.log_error(f"HTTP error serving room card image: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error serving room card image for '{world_name}/{room_id}': {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error while serving room card image.")

@router.get("/api/worlds/{world_name}/rooms/{room_id}/card/metadata")
async def get_room_card_metadata(world_name: str, room_id: str):
    """Serve JSON metadata for a specific room card."""
    try:
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        safe_room_id = re.sub(r'[^\w\-]+', '_', room_id)
        if not safe_world_name or not safe_room_id:
            raise HTTPException(status_code=400, detail="Invalid world or room id.")
        file_path = Path("worlds") / safe_world_name / "rooms" / f"{safe_room_id}.png"
        if not file_path.is_file():
            logger.log_warning(f"Room card image not found at: {file_path}")
            raise HTTPException(status_code=404, detail="Room card image not found")
        content = file_path.read_bytes()
        metadata = png_handler.read_metadata(content)
        return JSONResponse(status_code=200, content=metadata)
    except HTTPException as http_exc:
        logger.log_error(f"HTTP error serving room card metadata: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error serving room card metadata for '{world_name}/{room_id}': {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error serving room metadata")
