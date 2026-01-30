"""
@file file_upload_endpoints.py
@description Endpoints for image upload and serving uploaded files.
@dependencies fastapi
@consumers main.py
"""
import re
import traceback
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse

from backend.log_manager import LogManager

# Create router
router = APIRouter(
    prefix="/api",
    tags=["uploads"]
)

# Module-level dependencies (will be set from main.py via setup function)
_logger: LogManager = None


def setup_file_upload_router(logger: LogManager):
    """Initialize the file upload router with required dependencies."""
    global _logger
    _logger = logger


@router.post("/upload-image")
async def upload_image(request: Request, file: UploadFile = File(...)):
    """Handle image upload for rich text editor."""
    try:
        # Check if file is an image
        content_type = file.content_type.lower() if file.content_type else ""
        if not content_type.startswith('image/'):
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "File must be an image"}
            )

        # Check allowed image types
        allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if content_type not in allowed_types:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": f"Unsupported image format. Allowed: {', '.join(t.split('/')[1] for t in allowed_types)}"}
            )

        # Use ImageStorageService for consistent path handling
        service = request.app.state.image_storage_service
        content = await file.read()
        result = service.save_image(
            category="general",
            file_data=content,
            original_filename=file.filename
        )

        _logger.log_step(f"Uploaded image for editor: {result['absolute_path']}")

        # Return success with URL for TipTap to use
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "url": result["relative_url"]
            }
        )
    except Exception as e:
        _logger.log_error(f"Error uploading image: {str(e)}")
        _logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e)}
        )


@router.get("/uploads/{filename}")
async def get_uploaded_image(filename: str):
    """Serve uploaded images from the 'uploads' directory."""
    try:
        # Basic sanitization to prevent path traversal
        safe_filename = re.sub(r'[\\/]', '', filename)  # Remove slashes
        if safe_filename != filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        uploads_dir = Path("uploads")
        file_path = uploads_dir / safe_filename

        if not file_path.is_file():  # Check if it's a file and exists
            _logger.log_warning(f"Uploaded image not found: {file_path}")
            raise HTTPException(status_code=404, detail="Image not found")

        _logger.log_step(f"Serving uploaded image: {file_path}")
        return FileResponse(file_path)
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        _logger.log_error(f"Error serving uploaded image '{filename}': {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
