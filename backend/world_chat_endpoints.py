# backend/world_chat_endpoints.py
# Implements API endpoints specifically for world chat operations
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
import traceback
import time
import re
import uuid
from pathlib import Path

# Create router
router = APIRouter()

# Import handlers
from backend.log_manager import LogManager
from backend.handlers.world_card_chat_handler import WorldCardChatHandler

# Initialize handler with worlds directory
logger = LogManager()
worlds_dir = Path("worlds")
if not worlds_dir.exists():
    worlds_dir.mkdir(parents=True, exist_ok=True)
logger.log_step(f"World chat endpoints using worlds directory: {worlds_dir.absolute()}")
world_chat_handler = WorldCardChatHandler(logger, worlds_path=worlds_dir)

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
        
        logger.log_step(f"Loading latest chat for world: {safe_world_name}")
        
        # Get list of available chats for the world and take the latest one
        chats = world_chat_handler.list_chats(safe_world_name)
        
        if not chats:
            logger.log_warning(f"No chats found for world '{world_name}'")
            return JSONResponse(
                status_code=404,
                content={
                    "success": False,
                    "message": f"No chats found for world '{world_name}'"
                }
            )
        
        # Get the first chat (most recent) from the list
        latest_chat_info = chats[0]
        chat_id = latest_chat_info["id"]
        
        # Get the full chat data
        latest_chat = world_chat_handler.get_chat(safe_world_name, chat_id)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "chat": latest_chat
            }
        )
    except Exception as e:
        logger.log_error(f"Error getting latest chat for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
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
        success = world_chat_handler.save_chat(safe_world_name, chat_id, data)
        
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
        logger.log_error(f"Error saving chat for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
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
        
        # Get the requested chat
        chat = world_chat_handler.get_chat(safe_world_name, chat_id)
        
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
        logger.log_error(f"Error getting chat '{chat_id}' for world '{world_name}': {str(e)}")
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
        
        # Get request data
        data = await request.json()
        title = data.get("title", f"Chat {time.strftime('%Y-%m-%d')}")
        location_id = data.get("location_id", "")
        
        # Create a new chat
        chat = world_chat_handler.create_chat(safe_world_name, title, location_id)
        
        return JSONResponse(
            status_code=201,
            content={
                "success": True,
                "chat": chat,
                "chat_id": chat["id"]
            }
        )
    except Exception as e:
        logger.log_error(f"Error creating chat for world '{world_name}': {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to create chat: {str(e)}"
            }
        )