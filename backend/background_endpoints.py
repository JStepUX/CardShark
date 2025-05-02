"""
Background endpoints for the CardShark application.
"""
import json
import os
import traceback
from pathlib import Path
from typing import Optional, List, Dict

import send2trash
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel # Added for payload model

# Import handler types for type hinting
from backend.background_handler import BackgroundHandler
from backend.chat_handler import ChatHandler
from backend.log_manager import LogManager

# Dependency provider functions (defined locally, import from main inside)
def get_logger() -> LogManager:
    from backend.main import logger # Import locally
    if logger is None: raise HTTPException(status_code=500, detail="Logger not initialized")
    return logger

def get_background_handler() -> BackgroundHandler:
    from backend.main import background_handler # Import locally
    if background_handler is None: raise HTTPException(status_code=500, detail="Background handler not initialized")
    return background_handler

def get_chat_handler() -> ChatHandler:
    from backend.main import chat_handler # Import locally
    if chat_handler is None: raise HTTPException(status_code=500, detail="Chat handler not initialized")
    return chat_handler

# Create router
router = APIRouter(
    prefix="/api/backgrounds", # Set prefix for all routes in this module
    tags=["backgrounds"], # Add tags for documentation
)

# --- Background Management Endpoints ---

@router.get("/")
async def get_backgrounds(
    background_handler: BackgroundHandler = Depends(get_background_handler),
    logger: LogManager = Depends(get_logger)
):
    """Get a list of available background images."""
    try:
        backgrounds = background_handler.get_all_backgrounds()
        logger.log_step(f"Serving {len(backgrounds)} backgrounds")
        return JSONResponse(
            status_code=200,
            content={"success": True, "backgrounds": backgrounds}
        )
    except Exception as e:
        logger.log_error(f"Error listing backgrounds: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to list backgrounds: {str(e)}"}
        )

@router.get("/{filename}")
async def get_background_file(
    filename: str,
    background_handler: BackgroundHandler = Depends(get_background_handler),
    logger: LogManager = Depends(get_logger)
):
    """Serve a background image file."""
    try:
        # Basic filename sanitization (prevent path traversal)
        if ".." in filename or "/" in filename or "\\" in filename:
             logger.log_warning(f"Invalid characters in background filename request: {filename}")
             raise HTTPException(status_code=400, detail="Invalid filename")

        file_path = background_handler.backgrounds_dir / filename
        logger.log_step(f"Attempting to serve background: {file_path}")

        if not file_path.is_file(): # Check if it's a file and exists
            logger.log_warning(f"Background file not found: {filename}")
            raise HTTPException(status_code=404, detail=f"Background not found: {filename}")

        # Determine content type
        content_type = None
        extension = file_path.suffix.lower()
        if extension in ['.jpg', '.jpeg']:
            content_type = "image/jpeg"
        elif extension == '.png':
            content_type = "image/png"
        elif extension == '.gif':
            content_type = "image/gif"
        elif extension == '.webp':
            content_type = "image/webp"
        else:
             logger.warning(f"Unsupported background file type requested: {filename}")
             raise HTTPException(status_code=415, detail="Unsupported file type") # 415 Unsupported Media Type

        return FileResponse(
            path=file_path,
            media_type=content_type,
            filename=filename
        )
    except HTTPException as http_exc:
        raise http_exc # Re-raise specific HTTP exceptions
    except Exception as e:
        logger.log_error(f"Error serving background file: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to serve background: {str(e)}")


@router.post("/upload")
async def upload_background(
    file: UploadFile = File(...),
    aspect_ratio: Optional[float] = Form(None),
    background_handler: BackgroundHandler = Depends(get_background_handler),
    logger: LogManager = Depends(get_logger)
):
    """Upload a new background image."""
    try:
        content = await file.read()
        logger.log_step(f"Received background upload: {file.filename}, size: {len(content)}")

        # Save the background
        result = background_handler.save_background(
            file_content=content,
            original_filename=file.filename,
            aspect_ratio=aspect_ratio
        )

        if not result:
            logger.warning(f"Failed to save uploaded background: {file.filename}")
            # Provide more specific error if possible from handler
            raise HTTPException(status_code=400, detail="Failed to save background image (check format/size)")

        logger.log_step(f"Successfully saved background: {result.get('filename')}")
        return JSONResponse(
            status_code=200,
            content={"success": True, "background": result}
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error uploading background: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to upload background: {str(e)}")

@router.delete("/{filename}")
async def delete_background(
    filename: str,
    background_handler: BackgroundHandler = Depends(get_background_handler),
    logger: LogManager = Depends(get_logger)
):
    """Delete a background image (sends to trash)."""
    try:
        # Basic filename sanitization
        if ".." in filename or "/" in filename or "\\" in filename:
             logger.log_warning(f"Invalid characters in background delete request: {filename}")
             raise HTTPException(status_code=400, detail="Invalid filename")

        logger.log_step(f"Request to delete background: {filename}")
        success = background_handler.delete_background(filename) # Assumes handler uses send2trash

        if not success:
            logger.warning(f"Background not found or failed to delete: {filename}")
            raise HTTPException(status_code=404, detail=f"Background not found or could not be deleted: {filename}")

        logger.log_step(f"Successfully deleted background: {filename}")
        return JSONResponse(
            status_code=200,
            content={"success": True, "message": f"Background deleted: {filename}"}
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error deleting background: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to delete background: {str(e)}")


# --- Character-Specific Background Endpoints ---
# Note: These are kept under the /api/backgrounds prefix for now,
# but could be moved to /api/characters/{character_id}/background if preferred.

class CharacterBackgroundPayload(BaseModel):
    background: Optional[str] = None

@router.post("/character/{character_id}")
async def set_character_background(
    character_id: str,
    payload: CharacterBackgroundPayload,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Set or clear the background for a specific character."""
    try:
        if not chat_handler: # Should not happen with Depends
            raise HTTPException(status_code=500, detail="Chat handler not configured")

        # Get the chat directory for this character ID
        # Use character_id directly if chat_handler expects it, or construct character_data if needed
        # Assuming _get_character_folder takes the ID string directly based on previous code
        chat_folder = chat_handler._get_character_folder(character_id)

        if not chat_folder:
            logger.warning(f"Character folder not found for ID: {character_id}")
            raise HTTPException(status_code=404, detail=f"Character folder not found for ID: {character_id}")

        # Ensure the chat folder exists
        chat_folder.mkdir(parents=True, exist_ok=True)

        background_file = chat_folder / "background.json"
        background_value = payload.background # Get value from Pydantic model

        # If background is None or empty string, remove the file
        if not background_value:
            if background_file.exists():
                try:
                    send2trash.send2trash(str(background_file))
                    logger.log_step(f"Sent character background file to trash: {background_file}")
                except Exception as trash_error:
                    logger.warning(f"Failed to send character background to trash, deleting directly: {str(trash_error)}")
                    try:
                        background_file.unlink()
                    except OSError as delete_error:
                         logger.error(f"Failed to delete character background file {background_file}: {delete_error}")
                         raise HTTPException(status_code=500, detail="Failed to remove existing background file")

            return JSONResponse(
                status_code=200,
                content={"success": True, "message": "Character background removed"}
            )

        # Otherwise, save the background preference
        background_data = {"background": background_value}
        try:
            with open(background_file, "w", encoding='utf-8') as f:
                json.dump(background_data, f)
            logger.log_step(f"Saved background for character {character_id}: {background_value}")
            return JSONResponse(
                status_code=200,
                content={"success": True, "message": "Character background set successfully"}
            )
        except IOError as save_error:
             logger.error(f"Failed to save character background file {background_file}: {save_error}")
             raise HTTPException(status_code=500, detail="Failed to save character background file")

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error setting character background for {character_id}: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to set character background: {str(e)}")

@router.get("/character/{character_id}")
async def get_character_background(
    character_id: str,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Get the background for a specific character."""
    try:
        if not chat_handler: # Should not happen with Depends
            raise HTTPException(status_code=500, detail="Chat handler not configured")

        # Get the chat directory for this character ID
        chat_folder = chat_handler._get_character_folder(character_id)
        if not chat_folder or not chat_folder.exists(): # Check existence too
            logger.log_step(f"Character folder not found for ID: {character_id}, returning null background.")
            # Return success but with null background if folder doesn't exist
            return JSONResponse(
                status_code=200,
                content={"success": True, "background": None}
            )

        background_file = chat_folder / "background.json"

        # If background file exists, read and return it
        if background_file.is_file():
            try:
                with open(background_file, "r", encoding='utf-8') as f:
                    background_data = json.load(f)
                logger.log_step(f"Found background for character {character_id}: {background_data.get('background')}")
                return JSONResponse(
                    status_code=200,
                    content={"success": True, "background": background_data.get("background")}
                )
            except (IOError, json.JSONDecodeError) as read_error:
                 logger.error(f"Error reading character background file {background_file}: {read_error}")
                 # Return null if file is corrupted or unreadable
                 return JSONResponse(
                    status_code=200, # Still success, but data is unavailable
                    content={"success": True, "background": None, "error": "Could not read background file"}
                 )

        # If no background file is set, return null
        logger.log_step(f"No background file found for character {character_id}")
        return JSONResponse(
            status_code=200,
            content={"success": True, "background": None}
        )

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error getting character background for {character_id}: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to get character background: {str(e)}")

# Removed setup_router function and custom dependency attributes