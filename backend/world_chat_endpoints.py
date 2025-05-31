# backend/world_chat_endpoints.py
# Implements API endpoints specifically for world chat operations
from fastapi import APIRouter, Request, Depends
import traceback
import time
import re
import uuid
from pathlib import Path

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
    get_world_card_chat_handler
)

# Import handlers
from backend.log_manager import LogManager
from backend.handlers.world_card_chat_handler import WorldCardChatHandler

# Create router
router = APIRouter(
    tags=["world-chat"],
    responses=STANDARD_RESPONSES
)

# Handler initialization now handled by dependency injection

@router.get("/api/world-chat/{world_name}/latest", response_model=DataResponse[dict])
async def get_latest_world_chat(
    world_name: str,
    world_card_chat_handler: WorldCardChatHandler = Depends(get_world_card_chat_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Gets the latest chat session for a specific world."""
    try:
        # Validate and sanitize world name for security
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise ValidationException("Invalid world name")
        
        logger.log_step(f"Loading latest chat for world: {safe_world_name}")
        
        # Get list of available chats for the world and take the latest one
        chats = world_card_chat_handler.list_chats(safe_world_name)
        
        if not chats:
            logger.log_warning(f"No chats found for world '{world_name}'")
            raise NotFoundException(f"No chats found for world '{world_name}'")
        
        # Get the first chat (most recent) from the list
        latest_chat_info = chats[0]
        chat_id = latest_chat_info["id"]
        
        # Get the full chat data
        latest_chat = world_card_chat_handler.get_chat(safe_world_name, chat_id)
        
        return create_data_response({"chat": latest_chat})
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error getting latest chat for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "getting latest chat")

@router.post("/api/world-chat/{world_name}/save", response_model=DataResponse[dict])
async def save_world_chat(
    world_name: str, 
    request: Request,
    world_card_chat_handler: WorldCardChatHandler = Depends(get_world_card_chat_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Saves a chat session for a specific world."""
    try:
        # Validate and sanitize world name for security
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise ValidationException("Invalid world name")
        
        # Get request data
        data = await request.json()
        logger.log_step(f"Saving chat for world '{safe_world_name}' with {len(data.get('messages', []))} messages")
        
        # Extract chat ID from metadata
        chat_id = data.get("metadata", {}).get("chat_id")
        
        if not chat_id:
            logger.log_warning("No chat ID provided in save request")
            # Generate a chat ID if none exists
            chat_id = f"chat_{uuid.uuid4().hex[:8]}"
            logger.log_step(f"Generated new chat ID: {chat_id}")
        
        # Save the chat data
        success = world_card_chat_handler.save_chat(safe_world_name, chat_id, data)
        
        if not success:
            raise ValidationException(f"Failed to save chat for world '{world_name}'")
        
        return create_data_response({
            "success": True,
            "message": f"Chat saved for world '{world_name}'",
            "chat_id": chat_id
        })
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error saving chat for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "saving chat")

@router.get("/api/world-chat/{world_name}/{chat_id}", response_model=DataResponse[dict])
async def get_world_chat(
    world_name: str, 
    chat_id: str,
    world_card_chat_handler: WorldCardChatHandler = Depends(get_world_card_chat_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Gets a specific chat session for a world by ID."""
    try:
        # Validate and sanitize world name for security
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise ValidationException("Invalid world name")
        
        # Get the requested chat
        chat = world_card_chat_handler.get_chat(safe_world_name, chat_id)
        
        if not chat:
            raise NotFoundException(f"Chat '{chat_id}' not found for world '{world_name}'")
        
        return create_data_response({"chat": chat})
    except ValueError as ve:
        raise NotFoundException(str(ve))
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error getting chat '{chat_id}' for world '{world_name}': {str(e)}")
        raise handle_generic_error(e, logger, "getting chat")

@router.post("/api/world-chat/{world_name}/create", response_model=DataResponse[dict])
async def create_world_chat(
    world_name: str, 
    request: Request,
    world_card_chat_handler: WorldCardChatHandler = Depends(get_world_card_chat_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Creates a new chat session for a world."""
    try:
        # Validate and sanitize world name for security
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise ValidationException("Invalid world name")
        
        # Get request data
        data = await request.json()
        title = data.get("title", f"Chat {time.strftime('%Y-%m-%d')}")
        location_id = data.get("location_id", "")
        
        # Create a new chat
        chat = world_card_chat_handler.create_chat(safe_world_name, title, location_id)
        
        return create_data_response({
            "success": True,
            "chat": chat,
            "chat_id": chat["id"]
        })
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error creating chat for world '{world_name}': {str(e)}")
        raise handle_generic_error(e, logger, "creating chat")