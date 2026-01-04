"""
Gallery image endpoints for serving themed room images.
"""
import os
import sys
import json
from pathlib import Path
from typing import Dict, List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from backend.log_manager import LogManager
from backend.dependencies import get_logger_dependency
from backend.response_models import DataResponse, create_data_response

router = APIRouter(
    prefix="/api/gallery",
    tags=["gallery"]
)

def get_asset_path(relative_path: str) -> Path:
    """Resolve asset path for both dev and frozen modes"""
    if getattr(sys, 'frozen', False):
        # Running as PyInstaller bundle
        base_path = sys._MEIPASS
    else:
        # Running in development - use the project root (two levels up from this file)
        base_path = Path(__file__).parent.parent
    return Path(base_path) / relative_path

@router.get("/themes", response_model=DataResponse[Dict])
async def get_gallery_themes(
    logger: LogManager = Depends(get_logger_dependency)
):
    """
    Get available gallery themes and their image counts.
    Returns manifest of all themed galleries.
    """
    try:
        manifest_path = get_asset_path("backend/gallery_metadata.json")

        logger.log_info(f"Looking for gallery manifest at: {manifest_path}")
        logger.log_info(f"File exists: {manifest_path.exists()}")

        if not manifest_path.exists():
            logger.log_warning(f"Gallery manifest not found at {manifest_path} - no gallery images available")
            return create_data_response({"themes": {}})

        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)

        # Transform for frontend: include image counts
        themes = {
            theme_name: {
                "count": len(images),
                "images": [img['filename'] for img in images]
            }
            for theme_name, images in manifest.items()
        }

        return create_data_response({"themes": themes})

    except Exception as e:
        logger.log_error(f"Error loading gallery themes: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load gallery themes")

@router.get("/image/{theme}/{filename}")
async def get_gallery_image(
    theme: str,
    filename: str,
    logger: LogManager = Depends(get_logger_dependency)
):
    """
    Serve a specific gallery image by theme and filename.
    """
    try:
        # Sanitize inputs to prevent path traversal
        safe_theme = theme.replace('/', '').replace('\\', '').replace('..', '')
        safe_filename = filename.replace('/', '').replace('\\', '').replace('..', '')

        image_path = get_asset_path(f"gallery_images/{safe_theme}/{safe_filename}")

        if not image_path.exists() or not image_path.is_file():
            raise HTTPException(status_code=404, detail="Gallery image not found")

        return FileResponse(image_path)

    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error serving gallery image {theme}/{filename}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to serve gallery image")
