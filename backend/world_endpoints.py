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

        result = world_card_handler.create_world(safe_world_name, character_path, display_name=world_name)

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
        return create_data_response(world_state.model_dump(mode='json'))
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

        logger.log_step(f"Request to save world state for: {world_name}")

        try:
            # Parse WorldState directly
            world_state = WorldState(**state_data)

            # Ensure world name matches
            if not world_state.metadata.name:
                world_state.metadata.name = world_name

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

# --- World Portability Endpoints ---

@router.get("/world-cards/{world_name}/export")
async def export_world(
    world_name: str,
    world_card_handler: WorldCardHandler = Depends(get_world_card_handler_dependency),
    asset_handler: WorldAssetHandler = Depends(get_world_asset_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Exports a world as a ZIP file for backup and sharing."""
    import zipfile
    from datetime import datetime
    from io import BytesIO
    from fastapi.responses import StreamingResponse

    try:
        logger.log_step(f"Request to export world: {world_name}")

        # 1. Validate: world exists
        world_state = world_card_handler.get_world_state(world_name)
        if not world_state:
            logger.warning(f"World '{world_name}' not found for export")
            raise NotFoundException(f"World '{world_name}' not found")

        # 2. Generate world_meta.json
        world_meta = {
            "format_version": 1,
            "name": world_state.metadata.name,
            "description": world_state.metadata.description or "",
            "author": world_state.metadata.author,
            "created_at": world_state.metadata.created_at.isoformat(),
            "exported_at": datetime.now().isoformat(),
            "cover_image": "cover.png" if world_state.metadata.cover_image else None,
            "room_count": len(world_state.rooms),
            "npc_count": len(set(npc_uuid for room in world_state.rooms for npc_uuid in room.npcs))
        }

        # 3. Create ZIP in memory
        zip_buffer = BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add world_meta.json
            zip_file.writestr('world_meta.json', json.dumps(world_meta, indent=2))
            logger.log_step("Added world_meta.json to ZIP")

            # Add world_state.json
            zip_file.writestr('world_state.json', world_state.json(indent=2))
            logger.log_step("Added world_state.json to ZIP")

            # 4. Add cover image if exists
            world_image_path = world_card_handler.get_world_image_path(world_name)
            if world_image_path and world_image_path.exists():
                with open(world_image_path, 'rb') as f:
                    zip_file.writestr('cover.png', f.read())
                logger.log_step("Added cover.png to ZIP")

            # 5. Collect and add room images
            world_uuid = world_state.metadata.uuid
            for room in world_state.rooms:
                if room.image_path:
                    # Room images are stored in world_assets/{world_uuid}/
                    try:
                        asset_path = asset_handler.get_asset_path(f"{world_uuid}/{room.image_path}")
                        if asset_path and Path(asset_path).exists():
                            with open(asset_path, 'rb') as f:
                                zip_file.writestr(f'images/{Path(room.image_path).name}', f.read())
                            logger.log_step(f"Added room image: {room.image_path}")
                        else:
                            logger.log_warning(f"Room image not found: {room.image_path}")
                    except Exception as e:
                        logger.log_warning(f"Failed to add room image {room.image_path}: {e}")

            # 6. Collect and add NPCs
            collected_npc_uuids = set()
            for room in world_state.rooms:
                collected_npc_uuids.update(room.npcs)

            logger.log_step(f"Collecting {len(collected_npc_uuids)} NPCs")
            for npc_uuid in collected_npc_uuids:
                try:
                    # Get NPC character from character service
                    npc_char = world_card_handler.character_service.get_all_characters()
                    npc_char = next((c for c in npc_char if c.character_uuid == npc_uuid), None)

                    if npc_char and npc_char.png_file_path and Path(npc_char.png_file_path).exists():
                        with open(npc_char.png_file_path, 'rb') as f:
                            # Use character name for filename
                            safe_name = re.sub(r'[^\w\-]+', '_', npc_char.name)
                            zip_file.writestr(f'npcs/{safe_name}.png', f.read())
                        logger.log_step(f"Added NPC: {npc_char.name}")
                    else:
                        logger.log_warning(f"NPC character not found: {npc_uuid}")
                except Exception as e:
                    logger.log_warning(f"Failed to add NPC {npc_uuid}: {e}")

        # 7. Stream response
        zip_buffer.seek(0)
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        filename = f"world_{safe_world_name}.zip"

        logger.log_step(f"Successfully created export ZIP for world: {world_name}")

        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error exporting world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "exporting world")

@router.post("/world-cards/import", response_model=DataResponse[Dict])
async def import_world(
    file: UploadFile = File(...),
    conflict_policy: str = "skip",
    world_card_handler: WorldCardHandler = Depends(get_world_card_handler_dependency),
    asset_handler: WorldAssetHandler = Depends(get_world_asset_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Imports a world from a ZIP file."""
    import zipfile
    from io import BytesIO
    import tempfile

    try:
        logger.log_step(f"Request to import world from file: {file.filename}")

        # Validate conflict policy
        if conflict_policy not in ["skip", "overwrite", "prompt"]:
            raise ValidationException(f"Invalid conflict_policy: {conflict_policy}")

        # Read uploaded file
        content = await file.read()
        zip_buffer = BytesIO(content)

        # 1. Validate ZIP structure
        try:
            with zipfile.ZipFile(zip_buffer, 'r') as zip_file:
                file_list = zip_file.namelist()

                if 'world_meta.json' not in file_list:
                    raise ValidationException("Missing world_meta.json")
                if 'world_state.json' not in file_list:
                    raise ValidationException("Missing world_state.json")

                # Read and validate world_meta.json
                world_meta_data = json.loads(zip_file.read('world_meta.json'))
                format_version = world_meta_data.get("format_version")

                if format_version != 1:
                    raise ValidationException(f"Unsupported format version: {format_version}")

                world_name = world_meta_data.get("name")
                if not world_name:
                    raise ValidationException("World name missing in world_meta.json")

                # Read world_state.json
                world_state_data = json.loads(zip_file.read('world_state.json'))

                logger.log_step(f"Importing world: {world_name}")

        except zipfile.BadZipFile:
            raise ValidationException("Invalid or corrupted ZIP file")

        # 2. Check for world conflict
        existing_world = world_card_handler.get_world_state(world_name)
        if existing_world:
            if conflict_policy == "skip":
                raise ValidationException(f"World '{world_name}' already exists")
            elif conflict_policy == "prompt":
                # Return 409 to signal frontend to prompt user
                from fastapi import HTTPException
                raise HTTPException(status_code=409, detail=f"World '{world_name}' already exists")
            # elif conflict_policy == "overwrite": continue with import

        # 3. Create temporary directory for extraction
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Reset buffer
            zip_buffer.seek(0)

            with zipfile.ZipFile(zip_buffer, 'r') as zip_file:
                # 4. Extract world state and create world
                logger.log_step("Creating world from imported state")

                # Parse WorldState
                world_state = WorldState(**world_state_data)

                # If world exists and we're overwriting, delete it first
                if existing_world and conflict_policy == "overwrite":
                    logger.log_step(f"Deleting existing world: {world_name}")
                    world_card_handler.delete_world(world_name)

                # Create the world
                # We need to create a character card for the world
                world_uuid = world_state.metadata.uuid
                from PIL import Image
                import io

                # Extract cover image if present
                cover_image_bytes = None
                if 'cover.png' in file_list:
                    cover_image_bytes = zip_file.read('cover.png')
                else:
                    # Create default cover image
                    default_img = Image.new('RGB', (512, 512), color='darkblue')
                    img_buffer = io.BytesIO()
                    default_img.save(img_buffer, format='PNG')
                    cover_image_bytes = img_buffer.getvalue()

                # Create character card data for the world
                char_data = {
                    "name": world_name,
                    "description": f"World: {world_name}",
                    "first_mes": f"Welcome to {world_name}",
                    "tags": ["world"],
                    "extensions": {
                        "card_type": "world",
                        "world_data": world_state.model_dump(mode='json')
                    },
                    "spec_version": "2.0",
                    "character_uuid": world_uuid
                }

                # Save the world character card
                saved_world = world_card_handler.character_service.save_uploaded_character_card(
                    raw_character_card_data={"data": char_data},
                    image_bytes=cover_image_bytes,
                    original_filename=f"{world_name}.png"
                )

                if not saved_world:
                    raise ValidationException(f"Failed to create world '{world_name}'")

                # 5. Extract and save room images
                images_dir = temp_path / "images"
                if any(f.startswith('images/') for f in file_list):
                    images_dir.mkdir(exist_ok=True)
                    for file_name in file_list:
                        if file_name.startswith('images/') and file_name != 'images/':
                            zip_file.extract(file_name, temp_path)
                            # Save to world assets
                            image_name = Path(file_name).name
                            image_data = (temp_path / file_name).read_bytes()
                            asset_handler.save_asset(world_uuid, image_data, image_name)
                            logger.log_step(f"Imported room image: {image_name}")

                # 6. Import NPCs
                imported_npcs = 0
                skipped_npcs = 0
                skipped_npc_names = []
                warnings = []

                if any(f.startswith('npcs/') for f in file_list):
                    logger.log_step("Importing NPCs")
                    for file_name in file_list:
                        if file_name.startswith('npcs/') and file_name.endswith('.png'):
                            try:
                                npc_png_data = zip_file.read(file_name)

                                # Read character UUID from PNG metadata
                                npc_metadata = world_card_handler.character_service.png_handler.read_metadata(npc_png_data)

                                if not npc_metadata or 'data' not in npc_metadata:
                                    warnings.append(f"NPC {file_name}: No valid metadata")
                                    skipped_npcs += 1
                                    continue

                                npc_char_data = npc_metadata['data']
                                npc_uuid = npc_char_data.get('character_uuid')
                                npc_name = npc_char_data.get('name', Path(file_name).stem)

                                if not npc_uuid:
                                    warnings.append(f"NPC {npc_name}: No UUID in metadata")
                                    skipped_npcs += 1
                                    skipped_npc_names.append(npc_name)
                                    continue

                                # Check if NPC already exists
                                existing_npc = next(
                                    (c for c in world_card_handler.character_service.get_all_characters()
                                     if c.character_uuid == npc_uuid),
                                    None
                                )

                                if existing_npc:
                                    if conflict_policy == "skip":
                                        logger.log_step(f"Skipping existing NPC: {npc_name}")
                                        skipped_npcs += 1
                                        skipped_npc_names.append(npc_name)
                                        continue
                                    elif conflict_policy == "overwrite":
                                        logger.log_step(f"Overwriting existing NPC: {npc_name}")
                                        # Delete existing to allow overwrite
                                        world_card_handler.character_service.delete_character(npc_uuid, delete_png_file=True)

                                # Import the NPC
                                saved_npc = world_card_handler.character_service.save_uploaded_character_card(
                                    raw_character_card_data=npc_metadata,
                                    image_bytes=npc_png_data,
                                    original_filename=Path(file_name).name
                                )

                                if saved_npc:
                                    imported_npcs += 1
                                    logger.log_step(f"Imported NPC: {npc_name}")
                                else:
                                    skipped_npcs += 1
                                    skipped_npc_names.append(npc_name)
                                    warnings.append(f"Failed to import NPC: {npc_name}")

                            except Exception as e:
                                logger.log_warning(f"Error importing NPC {file_name}: {e}")
                                skipped_npcs += 1
                                warnings.append(f"Error importing {file_name}: {str(e)}")

        logger.log_step(f"Successfully imported world '{world_name}'. NPCs: {imported_npcs} imported, {skipped_npcs} skipped")

        return create_data_response({
            "success": True,
            "world_name": world_name,
            "world_uuid": world_uuid,
            "imported_npcs": imported_npcs,
            "skipped_npcs": skipped_npcs,
            "skipped_npc_names": skipped_npc_names,
            "warnings": warnings
        })

    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error importing world: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "importing world")
