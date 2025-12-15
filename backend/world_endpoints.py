# backend/world_endpoints.py
# Implements API endpoints for world card operations and world chat with standardized FastAPI patterns
import json
import os
import re
import shutil
import time
import traceback
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, Depends, Request, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse

# Import handler types for type hinting
from backend.log_manager import LogManager
from backend.png_metadata_handler import PngMetadataHandler
from backend.handlers.world_card_chat_handler import WorldCardChatHandler
from backend.models.world_state import WorldState  # Import the Pydantic model
from backend import schemas as pydantic_models # Renamed to avoid conflict, and import from schemas
from backend.services import world_service
from backend.database import get_db # Import get_db
from sqlalchemy.orm import Session # Import Session

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
    handle_database_error,
    handle_validation_error,
    handle_generic_error,
    NotFoundException,
    ValidationException
)
from backend.dependencies import (
    get_logger_dependency,
    get_png_handler_dependency,
    get_world_card_chat_handler,
    get_world_asset_handler_dependency,
    get_world_card_handler_dependency
)
from backend.world_asset_handler import WorldAssetHandler
from backend.world_card_handler import WorldCardHandler

# Create router
router = APIRouter(
    prefix="/api", # Set prefix for consistency
    tags=["worlds"], # Add tags for documentation
    responses=STANDARD_RESPONSES
)

# --- World CRUD Endpoints (Database - Legacy/Deprecated or Separate System) ---

@router.post("/worlds/", response_model=DataResponse[pydantic_models.WorldRead], status_code=201)
def create_world_db(
    world: pydantic_models.WorldCreate,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger_dependency)
):
    try:
        logger.log_step(f"Request to create world: {world.name}")
        db_world = world_service.create_world(db=db, world=world)
        logger.log_step(f"Successfully created world with UUID: {db_world.world_uuid}")
        return create_data_response(db_world)
    except Exception as e:
        logger.log_error(f"Error creating world '{world.name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "creating world")

@router.get("/worlds/", response_model=ListResponse[pydantic_models.WorldRead])
def read_worlds_db(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger_dependency)
):
    try:
        logger.log_step(f"Request to read worlds, skip: {skip}, limit: {limit}")
        worlds = world_service.get_worlds(db, skip=skip, limit=limit)
        logger.log_step(f"Successfully retrieved {len(worlds)} worlds")
        return create_list_response(worlds, total=len(worlds))
    except Exception as e:
        logger.log_error(f"Error reading worlds: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "reading worlds")

@router.get("/worlds/{world_id}", response_model=DataResponse[pydantic_models.WorldRead])
def read_world_db(
    world_id: str,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger_dependency)
):
    try:
        logger.log_step(f"Request to read world with UUID: {world_id}")
        db_world = world_service.get_world(db, world_uuid=world_id)
        if db_world is None:
            logger.warning(f"World with UUID '{world_id}' not found")
            raise NotFoundException("World not found")
        logger.log_step(f"Successfully retrieved world: {db_world.name}")
        return create_data_response(db_world)
    except NotFoundException:
        raise
    except Exception as e:
        logger.log_error(f"Error reading world '{world_id}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "reading world")

@router.put("/worlds/{world_id}", response_model=DataResponse[pydantic_models.WorldRead])
def update_world_db(
    world_id: str,
    world: pydantic_models.WorldUpdate,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger_dependency)
):
    try:
        logger.log_step(f"Request to update world with UUID: {world_id}")
        db_world = world_service.update_world(db=db, world_uuid=world_id, world_update=world)
        if db_world is None:
            logger.warning(f"World with UUID '{world_id}' not found for update")
            raise NotFoundException("World not found")
        logger.log_step(f"Successfully updated world: {db_world.name}")
        return create_data_response(db_world)
    except NotFoundException:
        raise
    except Exception as e:
        logger.log_error(f"Error updating world '{world_id}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "updating world")

@router.delete("/worlds/{world_id}", response_model=DataResponse[pydantic_models.WorldRead])
def delete_world_db(
    world_id: str,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger_dependency)
):
    try:
        logger.log_step(f"Request to delete world with UUID: {world_id}")
        db_world = world_service.delete_world(db=db, world_uuid=world_id)
        if db_world is None:
            logger.warning(f"World with UUID '{world_id}' not found for deletion")
            raise NotFoundException("World not found")
        logger.log_step(f"Successfully deleted world: {db_world.name}")
        return create_data_response(db_world)
    except NotFoundException:
        raise
    except Exception as e:
        logger.log_error(f"Error deleting world '{world_id}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "deleting world")


# --- World Card Management Endpoints (V2) ---

@router.get("/world-cards", response_model=ListResponse[Dict])
async def list_worlds_api(
    world_card_handler: WorldCardHandler = Depends(get_world_card_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Lists available world cards."""
    try:
        worlds = world_card_handler.list_worlds()
        logger.log_step(f"Found {len(worlds)} worlds")
        return create_list_response(worlds, total=len(worlds))
    except Exception as e:
        logger.log_error(f"Error listing worlds: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "listing worlds")

@router.post("/world-cards/create", response_model=DataResponse[Dict], status_code=201)
async def create_world_api(
    request: Request,
    world_card_handler: WorldCardHandler = Depends(get_world_card_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Creates a new world card, either empty or based on a character card."""
    try:
        data = await request.json()
        world_name = data.get("name") or data.get("world_name")
        character_path = data.get("character_path") or data.get("character_file_path")

        if not world_name:
            raise ValidationException("World name is required")

        # Sanitize world name before using it
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise ValidationException("Invalid characters in world name")

        logger.log_step(f"Creating world '{safe_world_name}', character_path: {character_path}")

        result = world_card_handler.create_world(safe_world_name, character_path)

        if not result:
            logger.error(f"Failed to create world '{safe_world_name}' using handler")
            raise ValidationException(f"Failed to create world '{safe_world_name}'")

        logger.log_step(f"Successfully created world '{safe_world_name}'")
        return create_data_response(result)
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error creating world: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "creating world")

@router.delete("/world-cards/{world_name}", response_model=DataResponse[Dict])
async def delete_world_card_api(
    world_name: str,
    world_card_handler: WorldCardHandler = Depends(get_world_card_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Deletes a world card."""
    try:
        logger.log_step(f"Request to delete world: {world_name}")
        success = world_card_handler.delete_world(world_name)

        if not success:
            logger.warning(f"World '{world_name}' not found or could not be deleted.")
            raise NotFoundException(f"World '{world_name}' not found or could not be deleted")

        logger.log_step(f"Successfully deleted world: {world_name}")
        return create_data_response({"message": f"World '{world_name}' deleted successfully"})
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error deleting world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "deleting world")

@router.get("/world-cards/{world_name}/state", response_model=DataResponse[Dict])
async def get_world_state_api(
    world_name: str,
    world_card_handler: WorldCardHandler = Depends(get_world_card_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Loads the world state for a specific world card."""
    try:
        logger.log_step(f"Request to get world state for: {world_name}")
        world_state = world_card_handler.get_world_state(world_name)

        if not world_state:
            logger.warning(f"World state not found for: {world_name}")
            raise NotFoundException(f"World '{world_name}' not found")

        logger.log_step(f"Successfully loaded world state for: {world_name}")
        # Handle both Pydantic model and Dict (legacy)
        response_data = world_state.dict() if hasattr(world_state, 'dict') else world_state
        return create_data_response(response_data)
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error getting world state for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "getting world state")

@router.post("/world-cards/{world_name}/state", response_model=DataResponse[Dict])
async def save_world_state_api(
    world_name: str,
    request: Request,
    world_card_handler: WorldCardHandler = Depends(get_world_card_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Saves the world state for a specific world card."""
    try:
        data = await request.json()
        state_data = data.get("state", {})

        if not state_data:
            raise ValidationException("No state data provided")

        # Ensure the state data includes a name field
        if "name" not in state_data:
            state_data["name"] = world_name
            
        logger.log_step(f"Request to save world state for: {world_name}")

        try:
            world_state = WorldState(**state_data)
            success = world_card_handler.save_world_state(world_name, world_state)
        except Exception as validation_error:
            logger.error(f"Invalid world state data for {world_name}: {validation_error}")
            logger.error(traceback.format_exc())
            raise ValidationException(f"Invalid world state data: {str(validation_error)}")

        if not success:
            logger.error(f"Failed to save world state for '{world_name}' using handler")
            raise ValidationException(f"Failed to save world state for '{world_name}'")

        logger.log_step(f"Successfully saved world state for: {world_name}")
        return create_data_response({"message": f"World state saved for '{world_name}'"})
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error saving world state for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "saving world state")

@router.get("/worlds/{world_name}/card")
async def get_world_card_image(
    world_name: str,
    world_card_handler: WorldCardHandler = Depends(get_world_card_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Serve the main card image for a specific world."""
    try:
        logger.log_step(f"Attempting to serve world card image for: {world_name}")
        
        card_path = world_card_handler.get_world_image_path(world_name)

        if card_path and card_path.is_file():
            return FileResponse(card_path, media_type="image/png")

        # If card doesn't exist, try fallback
        logger.log_warning(f"World card not found for '{world_name}', using default")
        possible_paths = [
            Path("frontend/src/assets/default_world.png"),
            Path("../frontend/src/assets/default_world.png"),
            Path("src/assets/default_world.png"),
            Path("backend/default_room.png")
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
            raise NotFoundException("World card image not found and default is missing")

    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error serving world card image for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "serving world card image")

@router.post("/worlds/{world_name}/upload-png", response_model=DataResponse[Dict], status_code=201)
async def upload_world_png(
    world_name: str,
    file: UploadFile = File(...),
    world_card_handler: WorldCardHandler = Depends(get_world_card_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Upload or replace the image for a specific world card."""
    try:
        # Check file type
        if not file.content_type or file.content_type != "image/png":
            raise ValidationException("Only PNG files are allowed for world cards.")

        logger.log_step(f"Saving/overwriting world PNG for: {world_name}")

        content = await file.read()
        success = world_card_handler.upload_world_image(world_name, content)

        if not success:
             raise ValidationException("Failed to save world PNG file")

        return create_data_response({
            "message": "World PNG uploaded successfully"
        })
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error uploading world PNG for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "uploading world PNG")


# --- World Chat Endpoints ---

@router.get("/world-chat/{world_name}/latest", response_model=DataResponse[Dict])
async def get_latest_world_chat(
    world_name: str,
    world_card_chat_handler: WorldCardChatHandler = Depends(get_world_card_chat_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Gets the latest chat session for a specific world."""
    try:
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise ValidationException("Invalid world name")

        if not world_card_chat_handler:
            raise ValidationException("Chat functionality not available")

        logger.log_step(f"Request to get latest chat for world: {safe_world_name}")
        latest_chat = world_card_chat_handler.load_latest_chat(safe_world_name)

        if not latest_chat:
            logger.warning(f"No chats found for world '{safe_world_name}'")
            raise NotFoundException(f"No chats found for world '{world_name}'")

        logger.log_step(f"Found latest chat for world '{safe_world_name}'")
        return create_data_response(latest_chat)
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error getting latest chat for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "getting latest chat")

@router.post("/world-chat/{world_name}/save", response_model=DataResponse[Dict])
async def save_world_chat(
    world_name: str,
    request: Request,
    world_card_chat_handler: WorldCardChatHandler = Depends(get_world_card_chat_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Saves a chat session for a specific world."""
    try:
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise ValidationException("Invalid world name")

        if not world_card_chat_handler:
            raise ValidationException("Chat functionality not available")

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
            raise ValidationException(f"Failed to save chat for world '{world_name}'")

        logger.log_step(f"Successfully saved chat '{chat_id}' for world '{safe_world_name}'")
        return create_data_response({
            "message": f"Chat saved for world '{world_name}'",
            "chat_id": chat_id
        })
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error saving chat for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "saving chat")

@router.get("/world-chat/{world_name}/{chat_id}", response_model=DataResponse[Dict])
async def get_world_chat(
    world_name: str,
    chat_id: str,
    world_card_chat_handler: WorldCardChatHandler = Depends(get_world_card_chat_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Gets a specific chat session for a world by ID."""
    try:
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        # Basic sanitization for chat_id as well
        safe_chat_id = re.sub(r'[^\w\-\.]+', '_', chat_id)
        if not safe_world_name or not safe_chat_id:
            raise ValidationException("Invalid world or chat id.")

        if not world_card_chat_handler:
            raise ValidationException("Chat functionality not available")

        logger.log_step(f"Request to get chat '{safe_chat_id}' for world: {safe_world_name}")
        chat_data = world_card_chat_handler.load_chat(safe_world_name, safe_chat_id)

        if not chat_data:
            logger.warning(f"Chat '{safe_chat_id}' not found for world '{safe_world_name}'")
            raise NotFoundException(f"Chat '{chat_id}' not found for world '{world_name}'")

        logger.log_step(f"Successfully loaded chat '{safe_chat_id}' for world '{safe_world_name}'")
        return create_data_response(chat_data)
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error getting chat '{chat_id}' for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "getting chat")

@router.post("/world-chat/{world_name}/create", response_model=DataResponse[Dict], status_code=201)
async def create_world_chat(
    world_name: str,
    request: Request,
    world_card_chat_handler: WorldCardChatHandler = Depends(get_world_card_chat_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Creates a new chat session for a world."""
    try:
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise ValidationException("Invalid world name")

        if not world_card_chat_handler:
            raise ValidationException("Chat functionality not available")

        logger.log_step(f"Request to create new chat for world: {safe_world_name}")
        new_chat_id = world_card_chat_handler.create_new_chat(safe_world_name)

        if not new_chat_id:
            logger.error(f"Failed to create new chat for world '{safe_world_name}' using handler")
            raise ValidationException(f"Failed to create new chat for world '{world_name}'")

        logger.log_step(f"Successfully created new chat '{new_chat_id}' for world '{safe_world_name}'")
        return create_data_response({"chat_id": new_chat_id})
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error creating new chat for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "creating new chat")

@router.delete("/world-chat/{world_name}/{chat_id}", response_model=DataResponse[Dict])
async def delete_world_chat(
    world_name: str,
    chat_id: str,
    world_card_chat_handler: WorldCardChatHandler = Depends(get_world_card_chat_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Deletes a chat session for a world."""
    try:
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        safe_chat_id = re.sub(r'[^\w\-\.]+', '_', chat_id)
        if not safe_world_name or not safe_chat_id:
            raise ValidationException("Invalid world or chat id.")

        if not world_card_chat_handler:
            raise ValidationException("Chat functionality not available")

        logger.log_step(f"Request to delete chat '{safe_chat_id}' for world: {safe_world_name}")
        success = world_card_chat_handler.delete_chat(safe_world_name, safe_chat_id)

        if not success:
            logger.warning(f"Chat '{safe_chat_id}' not found or could not be deleted for world '{safe_world_name}'")
            raise NotFoundException(f"Chat '{chat_id}' not found or could not be deleted for world '{world_name}'")

        logger.log_step(f"Successfully deleted chat '{safe_chat_id}' for world '{safe_world_name}'")
        return create_data_response({"message": f"Chat '{chat_id}' deleted successfully for world '{world_name}'"})
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error deleting chat '{chat_id}' for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "deleting chat")

# --- Other World Endpoints ---

@router.get("/world-count", response_model=DataResponse[Dict])
async def get_world_count(
    world_card_handler: WorldCardHandler = Depends(get_world_card_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Get the count of available worlds."""
    try:
        worlds = world_card_handler.list_worlds()
        count = len(worlds)
        logger.log_step(f"Reporting world count: {count}")
        return create_data_response({"count": count})
    except Exception as e:
        logger.log_error(f"Error getting world count: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "getting world count")

# --- World V2 Endpoints ---

@router.post("/world-assets/{world_uuid}", response_model=DataResponse[Dict])
async def upload_world_asset(
    world_uuid: str,
    file: UploadFile = File(...),
    asset_handler: WorldAssetHandler = Depends(get_world_asset_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Uploads an asset for a World Card (V2)."""
    try:
        logger.log_step(f"Uploading asset for world {world_uuid}: {file.filename}")
        
        # Read file content
        content = await file.read()
        
        # Save asset
        filename = file.filename or f"asset_{uuid.uuid4()}.png"
        relative_path = asset_handler.save_asset(world_uuid, content, filename)
        
        return create_data_response({
            "message": "Asset uploaded successfully",
            "path": relative_path,
            "filename": filename
        })
    except Exception as e:
        logger.log_error(f"Error uploading asset for world '{world_uuid}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "uploading world asset")

@router.get("/world-assets/{world_uuid}/{filename}")
async def get_world_asset(
    world_uuid: str,
    filename: str,
    asset_handler: WorldAssetHandler = Depends(get_world_asset_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Serves a world asset."""
    try:
        relative_path = f"{world_uuid}/{filename}"
        full_path = asset_handler.get_asset_path(relative_path)
        
        if not full_path:
            raise NotFoundException("Asset not found")
            
        return FileResponse(full_path)
    except NotFoundException:
        raise
    except Exception as e:
        logger.log_error(f"Error serving asset '{filename}' for world '{world_uuid}': {str(e)}")
        raise handle_generic_error(e, "serving world asset")
