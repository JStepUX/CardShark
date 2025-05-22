# backend/world_endpoints.py
# Implements API endpoints for world card operations and world chat
import json
import os
import re
import shutil
import time
import traceback
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse

# Import handler types for type hinting
from backend.log_manager import LogManager
from backend.png_metadata_handler import PngMetadataHandler
from backend.handlers.world_state_handler import WorldStateHandler
from backend.handlers.world_card_chat_handler import WorldCardChatHandler
from backend.models.world_state import WorldState  # Import the Pydantic model
from backend import schemas as pydantic_models # Renamed to avoid conflict, and import from schemas
from backend.services import world_service
from backend.database import get_db # Import get_db
from sqlalchemy.orm import Session # Import Session

# Dependency provider functions (defined locally, import from main inside)
def get_logger() -> LogManager:
    from backend.main import logger # Import locally
    if logger is None: raise HTTPException(status_code=500, detail="Logger not initialized")
    return logger

def get_png_handler() -> PngMetadataHandler:
    from backend.main import png_handler # Import locally
    if png_handler is None: raise HTTPException(status_code=500, detail="PNG handler not initialized")
    return png_handler

def get_world_state_handler() -> WorldStateHandler:
    from backend.main import world_state_handler # Import locally
    if world_state_handler is None: raise HTTPException(status_code=500, detail="World state handler not initialized")
    return world_state_handler

def get_world_card_chat_handler() -> WorldCardChatHandler:
    from backend.main import world_card_chat_handler # Import locally
    if world_card_chat_handler is None: raise HTTPException(status_code=500, detail="World card chat handler not initialized")
    return world_card_chat_handler

# Create router
router = APIRouter(
    prefix="/api", # Set prefix for consistency
    tags=["worlds"], # Add tags for documentation
)

# --- World CRUD Endpoints (Database) ---

@router.post("/worlds/", response_model=pydantic_models.WorldRead, status_code=201)
def create_world_db(
    world: pydantic_models.WorldCreate,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger)
):
    logger.log_step(f"Request to create world: {world.name}")
    try:
        db_world = world_service.create_world(db=db, world=world)
        logger.log_step(f"Successfully created world with UUID: {db_world.world_uuid}")
        return db_world
    except Exception as e:
        logger.log_error(f"Error creating world '{world.name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to create world: {str(e)}")

@router.get("/worlds/", response_model=List[pydantic_models.WorldRead])
def read_worlds_db(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger)
):
    logger.log_step(f"Request to read worlds, skip: {skip}, limit: {limit}")
    try:
        worlds = world_service.get_worlds(db, skip=skip, limit=limit)
        logger.log_step(f"Successfully retrieved {len(worlds)} worlds")
        return worlds
    except Exception as e:
        logger.log_error(f"Error reading worlds: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to read worlds: {str(e)}")

@router.get("/worlds/{world_id}", response_model=pydantic_models.WorldRead)
def read_world_db(
    world_id: str,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger)
):
    logger.log_step(f"Request to read world with UUID: {world_id}")
    try:
        db_world = world_service.get_world(db, world_uuid=world_id)
        if db_world is None:
            logger.warning(f"World with UUID '{world_id}' not found")
            raise HTTPException(status_code=404, detail="World not found")
        logger.log_step(f"Successfully retrieved world: {db_world.name}")
        return db_world
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error reading world '{world_id}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to read world: {str(e)}")

@router.put("/worlds/{world_id}", response_model=pydantic_models.WorldRead)
def update_world_db(
    world_id: str,
    world: pydantic_models.WorldUpdate,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger)
):
    logger.log_step(f"Request to update world with UUID: {world_id}")
    try:
        db_world = world_service.update_world(db=db, world_uuid=world_id, world_update=world)
        if db_world is None:
            logger.warning(f"World with UUID '{world_id}' not found for update")
            raise HTTPException(status_code=404, detail="World not found")
        logger.log_step(f"Successfully updated world: {db_world.name}")
        return db_world
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error updating world '{world_id}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to update world: {str(e)}")

@router.delete("/worlds/{world_id}", response_model=pydantic_models.WorldRead) # Or perhaps a status code 204 No Content
def delete_world_db(
    world_id: str,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger)
):
    logger.log_step(f"Request to delete world with UUID: {world_id}")
    try:
        db_world = world_service.delete_world(db=db, world_uuid=world_id)
        if db_world is None: # Or if delete_world returns None on success when not found
            logger.warning(f"World with UUID '{world_id}' not found for deletion")
            raise HTTPException(status_code=404, detail="World not found")
        logger.log_step(f"Successfully deleted world: {db_world.name}")
        # If delete_world returns the deleted object, we can return it.
        # Otherwise, if it returns a boolean or None on success, adjust response.
        # For now, assuming it returns the deleted object (or raises if not found).
        return db_world # Or return JSONResponse(status_code=204) if nothing to return
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error deleting world '{world_id}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to delete world: {str(e)}")


# --- World Card Management Endpoints ---

@router.get("/world-cards")
async def list_worlds_api(
    world_state_handler: WorldStateHandler = Depends(get_world_state_handler),
    logger: LogManager = Depends(get_logger)
):
    """Lists available world cards."""
    try:
        worlds = world_state_handler.list_worlds()
        logger.log_step(f"Found {len(worlds)} worlds")
        return JSONResponse(
            status_code=200,
            content={"success": True, "worlds": worlds}
        )
    except Exception as e:
        logger.log_error(f"Error listing worlds: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to list worlds: {str(e)}"}
        )

@router.post("/world-cards/create")
async def create_world_api(
    request: Request,
    world_state_handler: WorldStateHandler = Depends(get_world_state_handler),
    logger: LogManager = Depends(get_logger)
):
    """Creates a new world, either empty or based on a character card."""
    try:
        data = await request.json()
        world_name = data.get("name")
        character_path = data.get("character_path")

        if not world_name:
            raise HTTPException(status_code=400, detail="World name is required")

        # Sanitize world name before using it
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
             raise HTTPException(status_code=400, detail="Invalid characters in world name")

        logger.log_step(f"Creating world '{safe_world_name}', character_path: {character_path}")

        # Create a new world - either from character or empty
        if character_path:
            logger.log_step(f"Creating world '{safe_world_name}' from character path: {character_path}")
            # Ensure character_path is validated/sanitized if coming from user input directly
            result = world_state_handler.initialize_from_character(safe_world_name, character_path)
        else:
            logger.log_step(f"Creating empty world '{safe_world_name}'")
            result = world_state_handler.initialize_empty_world_state(safe_world_name)

        if not result:
            logger.error(f"Failed to create world '{safe_world_name}' using handler")
            raise HTTPException(status_code=500, detail=f"Failed to create world '{safe_world_name}'")

        logger.log_step(f"Successfully created world '{safe_world_name}'")
        return JSONResponse(
            status_code=201,
            content={"success": True, "world": result.dict()}
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error creating world: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to create world: {str(e)}")

@router.delete("/world-cards/{world_name}")
async def delete_world_card_api(
    world_name: str,
    world_state_handler: WorldStateHandler = Depends(get_world_state_handler),
    logger: LogManager = Depends(get_logger)
):
    """Deletes a world card directory."""
    try:
        # Validate and sanitize world name for security
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise HTTPException(status_code=400, detail="Invalid world name")

        logger.log_step(f"Request to delete world: {safe_world_name}")
        success = world_state_handler.delete_world(safe_world_name)

        if not success:
            logger.warning(f"World '{safe_world_name}' not found or could not be deleted.")
            raise HTTPException(status_code=404, detail=f"World '{world_name}' not found or could not be deleted")

        logger.log_step(f"Successfully deleted world: {safe_world_name}")
        return JSONResponse(
            status_code=200,
            content={"success": True, "message": f"World '{world_name}' deleted successfully"}
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error deleting world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to delete world: {str(e)}")

@router.get("/world-cards/{world_name}/state")
async def get_world_state_api(
    world_name: str,
    world_state_handler: WorldStateHandler = Depends(get_world_state_handler),
    logger: LogManager = Depends(get_logger)
):
    """Loads the world state for a specific world."""
    try:
        # Validate and sanitize world name for security
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise HTTPException(status_code=400, detail="Invalid world name")

        logger.log_step(f"Request to get world state for: {safe_world_name}")
        world_state = world_state_handler.load_world_state(safe_world_name)

        if not world_state:
            logger.warning(f"World state not found for: {safe_world_name}")
            raise HTTPException(status_code=404, detail=f"World '{world_name}' not found")

        logger.log_step(f"Successfully loaded world state for: {safe_world_name}")
        return JSONResponse(
            status_code=200,
            content={"success": True, "state": world_state.dict()}
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error getting world state for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to get world state: {str(e)}")

@router.post("/world-cards/{world_name}/state")
async def save_world_state_api(
    world_name: str,
    request: Request,
    world_state_handler: WorldStateHandler = Depends(get_world_state_handler),
    logger: LogManager = Depends(get_logger)
):
    """Saves the world state for a specific world."""
    try:
        # Validate and sanitize world name for security
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise HTTPException(status_code=400, detail="Invalid world name")

        data = await request.json()
        state_data = data.get("state", {})

        if not state_data:
            raise HTTPException(status_code=400, detail="No state data provided")

        # Ensure the state data includes a name field matching the sanitized name
        state_data["name"] = safe_world_name
        logger.log_step(f"Request to save world state for: {safe_world_name}")

        # Create a WorldState object from the data using pydantic for validation
        try:
            world_state = WorldState(**state_data)
            success = world_state_handler.save_world_state(safe_world_name, world_state)
        except Exception as validation_error: # Catches Pydantic validation errors too
            logger.error(f"Invalid world state data for {safe_world_name}: {validation_error}")
            logger.error(traceback.format_exc())
            raise HTTPException(status_code=400, detail=f"Invalid world state data: {str(validation_error)}")

        if not success:
            logger.error(f"Failed to save world state for '{safe_world_name}' using handler")
            raise HTTPException(status_code=500, detail=f"Failed to save world state for '{world_name}'")

        logger.log_step(f"Successfully saved world state for: {safe_world_name}")
        return JSONResponse(
            status_code=200,
            content={"success": True, "message": f"World state saved for '{world_name}'"}
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error saving world state for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to save world state: {str(e)}")

@router.get("/worlds/{world_name}/card") # Changed prefix from world-cards to worlds
async def get_world_card_image(
    world_name: str,
    logger: LogManager = Depends(get_logger)
):
    """Serve the main card image for a specific world, with fallback to default."""
    try:
        # Validate and sanitize world name for security
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise HTTPException(status_code=400, detail="Invalid world name")

        worlds_dir = Path("worlds")
        world_dir = worlds_dir / safe_world_name
        card_path = world_dir / "world_card.png"
        logger.log_step(f"Attempting to serve world card image: {card_path}")

        # If card exists, serve it
        if card_path.is_file():
            return FileResponse(card_path, media_type="image/png")

        # If card doesn't exist, try fallback
        logger.log_warning(f"World card not found for '{world_name}', using default")
        possible_paths = [
            Path("frontend/src/assets/default_world.png"),
            Path("../frontend/src/assets/default_world.png"),
            Path("src/assets/default_world.png"),
            Path("backend/default_room.png") # Legacy path
        ]
        default_card = None
        for path in possible_paths:
            if path.exists():
                default_card = path
                logger.log_step(f"Using default world card: {default_card}")
                break

        if default_card and default_card.is_file():
            return FileResponse(default_card, media_type="image/png")
        else:
            logger.error("Default world card image not found at any expected location.")
            raise HTTPException(status_code=404, detail="World card image not found and default is missing")

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error serving world card image for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error while serving world card image")

@router.post("/worlds/{world_name}/upload-png") # Changed prefix from world-cards to worlds
async def upload_world_png(
    world_name: str,
    file: UploadFile = File(...),
    logger: LogManager = Depends(get_logger)
):
    """Upload or replace the world_card.png image for a specific world."""
    try:
        # Validate and sanitize world name for security
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise HTTPException(status_code=400, detail="Invalid world name")

        # Check file type
        if not file.content_type or file.content_type != "image/png":
             raise HTTPException(status_code=415, detail="Only PNG files are allowed for world cards.")

        # Ensure the world directory exists
        worlds_dir = Path("worlds")
        world_dir = worlds_dir / safe_world_name
        world_dir.mkdir(parents=True, exist_ok=True) # Create if it doesn't exist

        # Save the uploaded file as the world card, overwriting if exists
        file_path = world_dir / "world_card.png"
        logger.log_step(f"Saving/overwriting world PNG at: {file_path}")

        try:
            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)
        except IOError as write_error:
             logger.error(f"Failed to write world PNG file {file_path}: {write_error}")
             raise HTTPException(status_code=500, detail="Failed to save world PNG file")

        return JSONResponse(
            status_code=201, # 201 Created or 200 OK if overwriting
            content={
                "success": True,
                "message": "World PNG uploaded successfully",
                "path": str(file_path)
            }
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error uploading world PNG for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to upload world PNG: {str(e)}")


# --- World Chat Endpoints ---
# Note: These are now part of the 'worlds' tag and use the /api prefix

@router.get("/world-chat/{world_name}/latest")
async def get_latest_world_chat(
    world_name: str,
    world_card_chat_handler: WorldCardChatHandler = Depends(get_world_card_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Gets the latest chat session for a specific world."""
    try:
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise HTTPException(status_code=400, detail="Invalid world name")

        if not world_card_chat_handler: # Should not happen with Depends
            raise HTTPException(status_code=500, detail="Chat functionality not available")

        logger.log_step(f"Request to get latest chat for world: {safe_world_name}")
        latest_chat = world_card_chat_handler.load_latest_chat(safe_world_name)

        if not latest_chat:
            logger.warning(f"No chats found for world '{safe_world_name}'")
            # Return success: true but empty chat list/null chat? Or 404?
            # Let's return 404 for consistency with get_world_chat by ID
            raise HTTPException(status_code=404, detail=f"No chats found for world '{world_name}'")

        logger.log_step(f"Found latest chat for world '{safe_world_name}'")
        return JSONResponse(
            status_code=200,
            content={"success": True, "chat": latest_chat}
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error getting latest chat for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to get latest chat: {str(e)}")

@router.post("/world-chat/{world_name}/save")
async def save_world_chat(
    world_name: str,
    request: Request,
    world_card_chat_handler: WorldCardChatHandler = Depends(get_world_card_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Saves a chat session for a specific world."""
    try:
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise HTTPException(status_code=400, detail="Invalid world name")

        if not world_card_chat_handler: # Should not happen with Depends
            raise HTTPException(status_code=500, detail="Chat functionality not available")

        data = await request.json()
        # Extract chat ID from metadata or generate if missing
        chat_id = data.get("metadata", {}).get("chat_id")
        if not chat_id:
            chat_id = f"chat_{uuid.uuid4().hex[:8]}"
            logger.log_step(f"Generated new chat ID for world '{safe_world_name}': {chat_id}")
            # Inject the generated chat_id back into the data if needed by the handler
            if "metadata" not in data: data["metadata"] = {}
            data["metadata"]["chat_id"] = chat_id

        logger.log_step(f"Request to save chat '{chat_id}' for world: {safe_world_name}")
        success = world_card_chat_handler.save_chat(safe_world_name, chat_id, data)

        if not success:
            logger.error(f"Failed to save chat '{chat_id}' for world '{safe_world_name}' using handler")
            raise HTTPException(status_code=500, detail=f"Failed to save chat for world '{world_name}'")

        logger.log_step(f"Successfully saved chat '{chat_id}' for world '{safe_world_name}'")
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"Chat saved for world '{world_name}'",
                "chat_id": chat_id
            }
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error saving chat for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to save chat: {str(e)}")

@router.get("/world-chat/{world_name}/{chat_id}")
async def get_world_chat(
    world_name: str,
    chat_id: str,
    world_card_chat_handler: WorldCardChatHandler = Depends(get_world_card_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Gets a specific chat session for a world by ID."""
    try:
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        # Basic sanitization for chat_id as well
        safe_chat_id = re.sub(r'[^\w\-\.]+', '_', chat_id) # Allow dots for .jsonl
        if not safe_world_name or not safe_chat_id:
            raise HTTPException(status_code=400, detail="Invalid world or chat id.")

        if not world_card_chat_handler: # Should not happen with Depends
            raise HTTPException(status_code=500, detail="Chat functionality not available")

        logger.log_step(f"Request to get chat '{safe_chat_id}' for world: {safe_world_name}")
        chat_data = world_card_chat_handler.load_chat(safe_world_name, safe_chat_id)

        if not chat_data:
            logger.warning(f"Chat '{safe_chat_id}' not found for world '{safe_world_name}'")
            raise HTTPException(status_code=404, detail=f"Chat '{chat_id}' not found for world '{world_name}'")

        logger.log_step(f"Successfully loaded chat '{safe_chat_id}' for world '{safe_world_name}'")
        return JSONResponse(
            status_code=200,
            content={"success": True, "chat": chat_data}
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error getting chat '{chat_id}' for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to get chat: {str(e)}")

@router.post("/world-chat/{world_name}/create")
async def create_world_chat(
    world_name: str,
    request: Request, # Keep request if needed for future data, e.g., initial message
    world_card_chat_handler: WorldCardChatHandler = Depends(get_world_card_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Creates a new chat session for a world."""
    try:
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise HTTPException(status_code=400, detail="Invalid world name")

        if not world_card_chat_handler: # Should not happen with Depends
            raise HTTPException(status_code=500, detail="Chat functionality not available")

        # Potentially get initial message or other data from request body later
        # data = await request.json()
        # initial_message = data.get("initial_message")

        logger.log_step(f"Request to create new chat for world: {safe_world_name}")
        new_chat_id = world_card_chat_handler.create_new_chat(safe_world_name) # Assuming handler returns new ID

        if not new_chat_id:
            logger.error(f"Failed to create new chat for world '{safe_world_name}' using handler")
            raise HTTPException(status_code=500, detail=f"Failed to create new chat for world '{world_name}'")

        logger.log_step(f"Successfully created new chat '{new_chat_id}' for world '{safe_world_name}'")
        return JSONResponse(
            status_code=201,
            content={"success": True, "chat_id": new_chat_id}
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error creating new chat for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to create new chat: {str(e)}")

@router.delete("/world-chat/{world_name}/{chat_id}")
async def delete_world_chat(
    world_name: str,
    chat_id: str,
    world_card_chat_handler: WorldCardChatHandler = Depends(get_world_card_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Deletes a chat session for a world."""
    try:
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        safe_chat_id = re.sub(r'[^\w\-\.]+', '_', chat_id) # Allow dots for .jsonl
        if not safe_world_name or not safe_chat_id:
            raise HTTPException(status_code=400, detail="Invalid world or chat id.")

        if not world_card_chat_handler: # Should not happen with Depends
            raise HTTPException(status_code=500, detail="Chat functionality not available")

        logger.log_step(f"Request to delete chat '{safe_chat_id}' for world: {safe_world_name}")
        success = world_card_chat_handler.delete_chat(safe_world_name, safe_chat_id)

        if not success:
            logger.warning(f"Chat '{safe_chat_id}' not found or could not be deleted for world '{safe_world_name}'")
            raise HTTPException(status_code=404, detail=f"Chat '{chat_id}' not found or could not be deleted for world '{world_name}'")

        logger.log_step(f"Successfully deleted chat '{safe_chat_id}' for world '{safe_world_name}'")
        return JSONResponse(
            status_code=200,
            content={"success": True, "message": f"Chat '{chat_id}' deleted successfully for world '{world_name}'"}
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error deleting chat '{chat_id}' for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to delete chat: {str(e)}")

# --- Other World Endpoints ---

@router.get("/world-count")
async def get_world_count(
    world_state_handler: WorldStateHandler = Depends(get_world_state_handler),
    logger: LogManager = Depends(get_logger)
):
    """Get the count of available worlds."""
    try:
        worlds = world_state_handler.list_worlds()
        count = len(worlds)
        logger.log_step(f"Reporting world count: {count}")
        return {"count": count}
    except Exception as e:
        logger.log_error(f"Error getting world count: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Failed to get world count")