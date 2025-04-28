# backend/world_endpoints.py
# Implements API endpoints for world card operations
from fastapi import APIRouter, Request, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from pathlib import Path
import traceback
import shutil
import os
import time
from typing import Dict, List, Optional
import json
import re

# Import handlers
from backend.log_manager import LogManager
from backend.png_metadata_handler import PngMetadataHandler

# Create router
router = APIRouter()

# Initialize local instances (for router pattern)
logger = LogManager()
png_handler = PngMetadataHandler(logger)

class WorldEndpoints:
    """Encapsulates world card-related endpoints."""
    
    def __init__(self, logger, world_state_handler, world_card_chat_handler=None):
        """Initialize with dependencies."""
        self.logger = logger
        self.world_state_handler = world_state_handler
        self.world_card_chat_handler = world_card_chat_handler
    
    def register_routes(self, router):
        """Register all world card endpoints with the provided router."""
        
        @router.get("/api/world-cards")
        async def list_worlds_api():
            """Lists available world cards."""
            try:
                worlds = self.world_state_handler.list_worlds()
                self.logger.log_step(f"Found {len(worlds)} worlds")
                
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "worlds": worlds
                    }
                )
            except Exception as e:
                self.logger.log_error(f"Error listing worlds: {str(e)}")
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to list worlds: {str(e)}"
                    }
                )

        @router.post("/api/world-cards/create")
        async def create_world_api(request: Request):
            """Creates a new world, either empty or based on a character card."""
            try:
                data = await request.json()
                world_name = data.get("name")
                character_path = data.get("character_path")
                
                if not world_name:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": "World name is required"
                        }
                    )
                
                self.logger.log_step(f"Creating world '{world_name}', character_path: {character_path}")
                
                # Create a new world - either from character or empty
                if character_path:
                    self.logger.log_step(f"Creating world '{world_name}' from character path: {character_path}")
                    result = self.world_state_handler.initialize_from_character(world_name, character_path)
                else:
                    self.logger.log_step(f"Creating empty world '{world_name}'")
                    result = self.world_state_handler.initialize_empty_world_state(world_name)
                
                if not result:
                    return JSONResponse(
                        status_code=500,
                        content={
                            "success": False,
                            "message": f"Failed to create world '{world_name}'"
                        }
                    )
                
                return JSONResponse(
                    status_code=201,
                    content={
                        "success": True,
                        "world": result.dict()
                    }
                )
            except Exception as e:
                self.logger.log_error(f"Error creating world: {str(e)}")
                self.logger.log_error(traceback.format_exc())
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to create world: {str(e)}"
                    }
                )

        @router.delete("/api/world-cards/{world_name}")
        async def delete_world_card_api(world_name: str):
            """Deletes a world card directory."""
            try:
                # Validate and sanitize world name for security
                safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
                if not safe_world_name:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": "Invalid world name"
                        }
                    )
                
                # Delete the world
                success = self.world_state_handler.delete_world(safe_world_name)
                
                if not success:
                    return JSONResponse(
                        status_code=404,
                        content={
                            "success": False,
                            "message": f"World '{world_name}' not found or could not be deleted"
                        }
                    )
                
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "message": f"World '{world_name}' deleted successfully"
                    }
                )
            except Exception as e:
                self.logger.log_error(f"Error deleting world '{world_name}': {str(e)}")
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to delete world: {str(e)}"
                    }
                )

        @router.get("/api/world-cards/{world_name}/state")
        async def get_world_state_api(world_name: str):
            """Loads the world state for a specific world."""
            try:
                # Validate and sanitize world name for security
                safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
                if not safe_world_name:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": "Invalid world name"
                        }
                    )
                
                # Get the world state
                world_state = self.world_state_handler.load_world_state(safe_world_name)
                
                if not world_state:
                    return JSONResponse(
                        status_code=404,
                        content={
                            "success": False,
                            "message": f"World '{world_name}' not found"
                        }
                    )
                
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "state": world_state.dict()
                    }
                )
            except Exception as e:
                self.logger.log_error(f"Error getting world state for '{world_name}': {str(e)}")
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to get world state: {str(e)}"
                    }
                )

        @router.post("/api/world-cards/{world_name}/state")
        async def save_world_state_api(world_name: str, request: Request):
            """Saves the world state for a specific world."""
            try:
                # Validate and sanitize world name for security
                safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
                if not safe_world_name:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": "Invalid world name"
                        }
                    )
                
                data = await request.json()
                state_data = data.get("state", {})
                
                if not state_data:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": "No state data provided"
                        }
                    )
                
                # Ensure the state data includes a name field
                if "name" not in state_data:
                    state_data["name"] = safe_world_name
                    
                # Create a WorldState object from the data using pydantic
                from backend.models.world_state import WorldState
                try:
                    world_state = WorldState(**state_data)
                    success = self.world_state_handler.save_world_state(safe_world_name, world_state)
                except Exception as validation_error:
                    self.logger.log_error(f"Invalid world state data: {validation_error}")
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": f"Invalid world state data: {str(validation_error)}"
                        }
                    )
                
                if not success:
                    return JSONResponse(
                        status_code=500,
                        content={
                            "success": False,
                            "message": f"Failed to save world state for '{world_name}'"
                        }
                    )
                
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "message": f"World state saved for '{world_name}'"
                    }
                )
            except Exception as e:
                self.logger.log_error(f"Error saving world state for '{world_name}': {str(e)}")
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to save world state: {str(e)}"
                    }
                )

        @router.get("/api/worlds/{world_name}/card")
        async def get_world_card_image(world_name: str):
            """Serve the main card image for a specific world, with fallback to default."""
            try:
                # Validate and sanitize world name for security
                safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
                if not safe_world_name:
                    raise HTTPException(status_code=400, detail="Invalid world name")
                
                worlds_dir = Path("worlds")
                world_dir = worlds_dir / safe_world_name
                
                # Look for world card image
                card_path = world_dir / "world_card.png"
                
                # If card doesn't exist, use default
                if not card_path.exists():
                    self.logger.log_warning(f"World card not found for '{world_name}', using default")
                    
                    # Try multiple possible locations for the default world card
                    possible_paths = [
                        Path("frontend/src/assets/default_world.png"),  # From project root
                        Path("../frontend/src/assets/default_world.png"),  # From backend folder
                        Path("src/assets/default_world.png"),  # From frontend folder
                        Path("backend/default_room.png")  # Legacy path
                    ]
                    
                    default_card = None
                    
                    for path in possible_paths:
                        if path.exists():
                            default_card = path
                            self.logger.log_step(f"Using default world card: {default_card}")
                            break
                    
                    if not default_card:
                        # Create a simple fallback image in memory if no default is found
                        self.logger.log_warning("No default world card found, serving 404")
                        raise HTTPException(status_code=404, detail="World card image not found")
                    
                    return FileResponse(default_card)
                
                self.logger.log_step(f"Serving world card image from: {card_path}")
                return FileResponse(card_path)
            except HTTPException as http_exc:
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error serving world card image for '{world_name}': {str(e)}")
                raise HTTPException(status_code=500, detail="Internal server error while serving world card image")

        @router.post("/api/worlds/{world_name}/upload-png")
        async def upload_world_png(world_name: str, file: UploadFile = File(...)):
            """Upload a PNG image for a specific world."""
            try:
                # Validate and sanitize world name for security
                safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
                if not safe_world_name:
                    raise HTTPException(status_code=400, detail="Invalid world name")
                
                # Ensure the world directory exists
                worlds_dir = Path("worlds")
                world_dir = worlds_dir / safe_world_name
                
                if not world_dir.exists():
                    world_dir.mkdir(parents=True, exist_ok=True)
                    self.logger.log_step(f"Created world directory: {world_dir}")
                
                # Save the uploaded file as the world card
                file_path = world_dir / "world_card.png"
                
                with open(file_path, "wb") as f:
                    content = await file.read()
                    f.write(content)
                
                self.logger.log_step(f"World PNG saved to: {file_path}")
                
                return JSONResponse(
                    status_code=201,
                    content={
                        "success": True,
                        "message": "World PNG uploaded successfully",
                        "path": str(file_path)
                    }
                )
            except HTTPException as http_exc:
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error uploading world PNG for '{world_name}': {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to upload world PNG: {str(e)}")

        # --- Adding World Chat Endpoints ---
        
        @router.get("/api/world-chat/{world_name}/latest")
        async def get_latest_world_chat(world_name: str):
            """Gets the latest chat session for a specific world."""
            try:
                # Validate and sanitize world name for security
                safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
                if not safe_world_name:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": "Invalid world name"
                        }
                    )
                
                if not self.world_card_chat_handler:
                    self.logger.log_warning("World card chat handler not initialized")
                    return JSONResponse(
                        status_code=500,
                        content={
                            "success": False,
                            "message": "Chat functionality not available"
                        }
                    )
                
                # Get the latest chat
                latest_chat = self.world_card_chat_handler.load_latest_chat(safe_world_name)
                
                if not latest_chat:
                    return JSONResponse(
                        status_code=404,
                        content={
                            "success": False,
                            "message": f"No chats found for world '{world_name}'"
                        }
                    )
                
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "chat": latest_chat
                    }
                )
            except Exception as e:
                self.logger.log_error(f"Error getting latest chat for world '{world_name}': {str(e)}")
                self.logger.log_error(traceback.format_exc())
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to get latest chat: {str(e)}"
                    }
                )

        @router.post("/api/world-chat/{world_name}/save")
        async def save_world_chat(world_name: str, request: Request):
            """Saves a chat session for a specific world."""
            try:
                # Validate and sanitize world name for security
                safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
                if not safe_world_name:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": "Invalid world name"
                        }
                    )
                
                if not self.world_card_chat_handler:
                    self.logger.log_warning("World card chat handler not initialized")
                    return JSONResponse(
                        status_code=500,
                        content={
                            "success": False,
                            "message": "Chat functionality not available"
                        }
                    )
                
                # Get request data
                data = await request.json()
                
                # Extract chat ID from metadata
                chat_id = data.get("metadata", {}).get("chat_id")
                
                if not chat_id:
                    self.logger.log_warning("No chat ID provided in save request")
                    # Generate a chat ID if none exists
                    import uuid
                    chat_id = f"chat_{uuid.uuid4().hex[:8]}"
                    self.logger.log_step(f"Generated new chat ID: {chat_id}")
                
                # Save the chat data
                success = self.world_card_chat_handler.save_chat(safe_world_name, chat_id, data)
                
                if not success:
                    return JSONResponse(
                        status_code=500,
                        content={
                            "success": False,
                            "message": f"Failed to save chat for world '{world_name}'"
                        }
                    )
                
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "message": f"Chat saved for world '{world_name}'",
                        "chat_id": chat_id
                    }
                )
            except Exception as e:
                self.logger.log_error(f"Error saving chat for world '{world_name}': {str(e)}")
                self.logger.log_error(traceback.format_exc())
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to save chat: {str(e)}"
                    }
                )

        @router.get("/api/world-chat/{world_name}/{chat_id}")
        async def get_world_chat(world_name: str, chat_id: str):
            """Gets a specific chat session for a world by ID."""
            try:
                # Validate and sanitize world name for security
                safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
                if not safe_world_name:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": "Invalid world name"
                        }
                    )
                
                if not self.world_card_chat_handler:
                    self.logger.log_warning("World card chat handler not initialized")
                    return JSONResponse(
                        status_code=500,
                        content={
                            "success": False,
                            "message": "Chat functionality not available"
                        }
                    )
                
                # Get the requested chat
                chat = self.world_card_chat_handler.get_chat(safe_world_name, chat_id)
                
                if not chat:
                    return JSONResponse(
                        status_code=404,
                        content={
                            "success": False,
                            "message": f"Chat '{chat_id}' not found for world '{world_name}'"
                        }
                    )
                
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "chat": chat
                    }
                )
            except ValueError as ve:
                return JSONResponse(
                    status_code=404,
                    content={
                        "success": False,
                        "message": str(ve)
                    }
                )
            except Exception as e:
                self.logger.log_error(f"Error getting chat '{chat_id}' for world '{world_name}': {str(e)}")
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to get chat: {str(e)}"
                    }
                )

        @router.post("/api/world-chat/{world_name}/create")
        async def create_world_chat(world_name: str, request: Request):
            """Creates a new chat session for a world."""
            try:
                # Validate and sanitize world name for security
                safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
                if not safe_world_name:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": "Invalid world name"
                        }
                    )
                
                if not self.world_card_chat_handler:
                    self.logger.log_warning("World card chat handler not initialized")
                    return JSONResponse(
                        status_code=500,
                        content={
                            "success": False,
                            "message": "Chat functionality not available"
                        }
                    )
                
                # Get request data
                data = await request.json()
                title = data.get("title", f"Chat {time.strftime('%Y-%m-%d')}")
                location_id = data.get("location_id", "")
                
                # Create a new chat
                chat = self.world_card_chat_handler.create_chat(safe_world_name, title, location_id)
                
                return JSONResponse(
                    status_code=201,
                    content={
                        "success": True,
                        "chat": chat,
                        "chat_id": chat["id"]
                    }
                )
            except Exception as e:
                self.logger.log_error(f"Error creating chat for world '{world_name}': {str(e)}")
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to create chat: {str(e)}"
                    }
                )

        @router.delete("/api/world-chat/{world_name}/{chat_id}")
        async def delete_world_chat(world_name: str, chat_id: str):
            """Deletes a chat session for a world."""
            try:
                # Validate and sanitize world name for security
                safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
                if not safe_world_name:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": "Invalid world name"
                        }
                    )
                
                if not self.world_card_chat_handler:
                    self.logger.log_warning("World card chat handler not initialized")
                    return JSONResponse(
                        status_code=500,
                        content={
                            "success": False,
                            "message": "Chat functionality not available"
                        }
                    )
                
                # Delete the chat
                success = self.world_card_chat_handler.delete_chat(safe_world_name, chat_id)
                
                if not success:
                    return JSONResponse(
                        status_code=404,
                        content={
                            "success": False,
                            "message": f"Chat '{chat_id}' not found for world '{world_name}'"
                        }
                    )
                
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "message": f"Chat '{chat_id}' deleted for world '{world_name}'"
                    }
                )
            except Exception as e:
                self.logger.log_error(f"Error deleting chat '{chat_id}' for world '{world_name}': {str(e)}")
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to delete chat: {str(e)}"
                    }
                )

# Add direct routes for router pattern usage
@router.get("/api/world-count")
async def get_world_count():
    """Get the count of available worlds."""
    try:
        worlds_dir = Path("worlds")
        if not worlds_dir.exists():
            return {"count": 0}
        
        # Count directories in the worlds folder
        count = sum(1 for item in worlds_dir.iterdir() if item.is_dir())
        return {"count": count}
    except Exception as e:
        logger.log_error(f"Error counting worlds: {str(e)}")
        return {"count": -1, "error": str(e)}