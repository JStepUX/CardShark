"""
Background endpoints for the CardShark application.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse
from typing import Optional, List, Dict
import traceback
from pathlib import Path
import os
import json
import send2trash  # Import the send2trash module

from backend.background_handler import BackgroundHandler
from backend.chat_handler import ChatHandler  # Added import for chat handler
from backend.log_manager import LogManager

router = APIRouter()

class BackgroundEndpoints:
    def __init__(self, logger: LogManager, background_handler: BackgroundHandler, chat_handler: ChatHandler = None):
        self.logger = logger
        self.background_handler = background_handler
        self.chat_handler = chat_handler  # Store chat_handler for character operations

    def register_routes(self, app):
        """Register all background endpoints with the app."""
        
        @app.get("/api/backgrounds")
        async def get_backgrounds():
            """Get a list of available background images."""
            try:
                backgrounds = self.background_handler.get_all_backgrounds()
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "backgrounds": backgrounds
                    }
                )
            except Exception as e:
                self.logger.log_error(f"Error listing backgrounds: {str(e)}")
                self.logger.log_error(traceback.format_exc())
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to list backgrounds: {str(e)}"
                    }
                )
                
        @app.get("/api/backgrounds/{filename}")
        async def get_background_file(filename: str):
            """Serve a background image file."""
            try:
                # Get file path from the background handler
                file_path = self.background_handler.backgrounds_dir / filename
                
                # Check if file exists
                if not file_path.exists():
                    self.logger.log_warning(f"Background file not found: {filename}")
                    return JSONResponse(
                        status_code=404,
                        content={
                            "success": False,
                            "message": f"Background not found: {filename}"
                        }
                    )
                
                # Get content type based on file extension
                content_type = None
                extension = Path(filename).suffix.lower()
                if extension == '.jpg' or extension == '.jpeg':
                    content_type = "image/jpeg"
                elif extension == '.png':
                    content_type = "image/png"
                elif extension == '.gif':
                    content_type = "image/gif"
                elif extension == '.webp':
                    content_type = "image/webp"
                
                # Return the file
                return FileResponse(
                    path=file_path,
                    media_type=content_type,
                    filename=filename
                )
            except Exception as e:
                self.logger.log_error(f"Error serving background file: {str(e)}")
                self.logger.log_error(traceback.format_exc())
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to serve background: {str(e)}"
                    }
                )

        @app.post("/api/backgrounds/upload")
        async def upload_background(
            file: UploadFile = File(...),
            aspect_ratio: Optional[float] = Form(None)
        ):
            """Upload a new background image."""
            try:
                content = await file.read()
                
                # Save the background
                result = self.background_handler.save_background(
                    file_content=content,
                    original_filename=file.filename,
                    aspect_ratio=aspect_ratio
                )
                
                if not result:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": "Failed to save background image"
                        }
                    )
                    
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "background": result
                    }
                )
            except Exception as e:
                self.logger.log_error(f"Error uploading background: {str(e)}")
                self.logger.log_error(traceback.format_exc())
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to upload background: {str(e)}"
                    }
                )

        @app.delete("/api/backgrounds/{filename}")
        async def delete_background(filename: str):
            """Delete a background image."""
            try:
                success = self.background_handler.delete_background(filename)
                
                if not success:
                    return JSONResponse(
                        status_code=404,
                        content={
                            "success": False,
                            "message": f"Background not found: {filename}"
                        }
                    )
                    
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "message": f"Background deleted: {filename}"
                    }
                )
            except Exception as e:
                self.logger.log_error(f"Error deleting background: {str(e)}")
                self.logger.log_error(traceback.format_exc())
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to delete background: {str(e)}"
                    }
                )

        # New endpoints for character background management
        @app.post("/api/character-background/{character_id}")
        async def set_character_background(character_id: str, data: dict):
            """Set a background for a specific character."""
            try:
                # Ensure chat_handler is available
                if not self.chat_handler:
                    self.logger.log_error("Chat handler not available for character background operations")
                    return JSONResponse(
                        status_code=500,
                        content={
                            "success": False,
                            "message": "Service configuration error: chat handler not available"
                        }
                    )
                
                # Get the chat directory for this character ID
                chat_folder = self.chat_handler._get_character_folder(character_id)
                if not chat_folder:
                    return JSONResponse(
                        status_code=404,
                        content={
                            "success": False,
                            "message": f"Character folder not found for ID: {character_id}"
                        }
                    )

                # Ensure the chat folder exists
                if not chat_folder.exists():
                    chat_folder.mkdir(parents=True, exist_ok=True)
                
                background_file = chat_folder / "background.json"
                background_data = {"background": data.get("background")}
                
                # If background is None or empty, remove the file
                if not background_data["background"]:
                    if background_file.exists():
                        # Use send2trash instead of directly deleting
                        try:
                            send2trash.send2trash(str(background_file))
                            self.logger.log_step(f"Sent background file to trash: {background_file}")
                        except Exception as trash_error:
                            # Fallback to standard file removal if send2trash fails
                            self.logger.log_warning(f"Failed to send to trash, deleting directly: {str(trash_error)}")
                            background_file.unlink()
                    
                    return JSONResponse(
                        status_code=200,
                        content={
                            "success": True,
                            "message": "Character background removed"
                        }
                    )
                
                # Otherwise, save the background preference
                with open(background_file, "w") as f:
                    json.dump(background_data, f)
                
                self.logger.log_step(f"Saved background for character {character_id}: {background_data['background']}")
                
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "message": "Character background set successfully"
                    }
                )
                
            except Exception as e:
                self.logger.log_error(f"Error setting character background: {str(e)}")
                self.logger.log_error(traceback.format_exc())
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to set character background: {str(e)}"
                    }
                )

        @app.get("/api/character-background/{character_id}")
        async def get_character_background(character_id: str):
            """Get the background for a specific character."""
            try:
                # Ensure chat_handler is available
                if not self.chat_handler:
                    self.logger.log_error("Chat handler not available for character background operations")
                    return JSONResponse(
                        status_code=500,
                        content={
                            "success": False,
                            "message": "Service configuration error: chat handler not available"
                        }
                    )
                
                # Get the chat directory for this character ID
                chat_folder = self.chat_handler._get_character_folder(character_id)
                if not chat_folder:
                    return JSONResponse(
                        status_code=404,
                        content={
                            "success": False,
                            "message": f"Character folder not found for ID: {character_id}"
                        }
                    )
                
                background_file = chat_folder / "background.json"
                
                # If background file exists, read and return it
                if background_file.exists():
                    with open(background_file, "r") as f:
                        background_data = json.load(f)
                    
                    return JSONResponse(
                        status_code=200,
                        content={
                            "success": True,
                            "background": background_data.get("background")
                        }
                    )
                
                # If no background is set, return null
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "background": None
                    }
                )
                
            except Exception as e:
                self.logger.log_error(f"Error getting character background: {str(e)}")
                self.logger.log_error(traceback.format_exc())
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to get character background: {str(e)}"
                    }
                )


# Router-based endpoints
@router.get("/api/backgrounds/list")
async def list_backgrounds(
    background_handler: BackgroundHandler = Depends(lambda: router.background_handler)
):
    """Alternative endpoint to list backgrounds using router pattern."""
    try:
        backgrounds = background_handler.get_all_backgrounds()
        return {
            "success": True,
            "backgrounds": backgrounds
        }
    except Exception as e:
        router.logger.log_error(f"Error listing backgrounds via router: {str(e)}")
        router.logger.log_error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list backgrounds: {str(e)}"
        )

@router.get("/api/backgrounds/{filename}")
async def get_background_file_router(
    filename: str,
    background_handler: BackgroundHandler = Depends(lambda: router.background_handler)
):
    """Serve a background image file using router pattern."""
    try:
        # Get file path from the background handler
        file_path = background_handler.backgrounds_dir / filename
        
        # Check if file exists
        if not file_path.exists():
            router.logger.log_warning(f"Background file not found: {filename}")
            raise HTTPException(
                status_code=404,
                detail=f"Background not found: {filename}"
            )
        
        # Get content type based on file extension
        content_type = None
        extension = Path(filename).suffix.lower()
        if extension == '.jpg' or extension == '.jpeg':
            content_type = "image/jpeg"
        elif extension == '.png':
            content_type = "image/png"
        elif extension == '.gif':
            content_type = "image/gif"
        elif extension == '.webp':
            content_type = "image/webp"
        
        # Return the file
        return FileResponse(
            path=file_path,
            media_type=content_type,
            filename=filename
        )
    except HTTPException:
        raise
    except Exception as e:
        router.logger.log_error(f"Error serving background file via router: {str(e)}")
        router.logger.log_error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Failed to serve background: {str(e)}"
        )

# Register dependencies for router-based endpoints
router.background_handler = None
router.logger = None
router.chat_handler = None  # Add chat handler dependency

def setup_router(background_handler: BackgroundHandler, logger: LogManager, chat_handler: ChatHandler = None):
    """Set up the router with dependencies."""
    router.background_handler = background_handler
    router.logger = logger
    router.chat_handler = chat_handler  # Set chat handler dependency