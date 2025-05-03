# backend/chat_endpoints.py
# Implements API endpoints for chat operations
import json
import traceback
from typing import Dict, List, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Import handler types for type hinting
from backend.log_manager import LogManager
from backend.chat_handler import ChatHandler

# Dependency provider functions (defined locally, import from main inside)
def get_logger() -> LogManager:
    from backend.main import logger  # Import locally
    if logger is None: raise HTTPException(status_code=500, detail="Logger not initialized")
    return logger

def get_chat_handler() -> ChatHandler:
    from backend.main import chat_handler  # Import locally
    if chat_handler is None: raise HTTPException(status_code=500, detail="Chat handler not initialized")
    return chat_handler

# Create router
router = APIRouter(
    prefix="/api",  # Use common /api prefix
    tags=["chats"],
    responses={404: {"description": "Not found"}}
)

# ROADMAP: Additional endpoints to implement
# Priority levels are based on common chat functionality requirements
# 
# HIGH PRIORITY:
# - /api/delete-chat            - Essential for chat management
# - /api/rename-chat            - Common user requirement
# - /api/update-message         - Important for correcting mistakes
# 
# MEDIUM PRIORITY:
# - /api/delete-message         - Useful for content moderation
# - /api/set-chat-metadata      - Helpful for organization
# - /api/export-chat            - Valuable for data portability
# 
# LOW PRIORITY:
# - /api/import-chat            - For advanced use cases
# - /api/chat-statistics        - For analytics features
# - /api/delete-all-character-chats - Less commonly used
# - /api/autosave-settings      - For fine-tuning performance

@router.post("/create-new-chat")
async def create_new_chat(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Create a new empty chat."""
    try:
        data = await request.json()
        character_data = data.get("character_data")
        
        if not character_data:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Character data is required"
                }
            )
            
        logger.log_step(f"Creating new chat for character: {character_data.get('name', 'Unknown')}")
        result = chat_handler.create_new_chat(character_data)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "chat_id": result["chat_id"],
                "messages": []
            }
        )
    except Exception as e:
        logger.log_error(f"Error creating new chat: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to create new chat: {str(e)}"
            }
        )

@router.post("/load-chat")
async def load_chat(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Load a specific chat."""
    try:
        data = await request.json()
        character_data = data.get("character_data")
        chat_id = data.get("chat_id")
        
        if not character_data or not chat_id:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Character data and chat_id are required"
                }
            )
            
        logger.log_step(f"Loading chat {chat_id} for character: {character_data.get('name', 'Unknown')}")
        result = chat_handler.load_chat(character_data, chat_id)
        
        return JSONResponse(
            status_code=200,
            content=result
        )
    except Exception as e:
        logger.log_error(f"Error loading chat: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to load chat: {str(e)}"
            }
        )

@router.post("/load-latest-chat")
async def load_latest_chat(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Load the latest chat for a character."""
    try:
        data = await request.json()
        character_data = data.get("character_data")
        
        if not character_data:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Character data is required"
                }
            )
            
        logger.log_step(f"Loading latest chat for character: {character_data.get('name', 'Unknown')}")
        result = chat_handler.load_latest_chat(character_data)
        
        return JSONResponse(
            status_code=200,
            content=result
        )
    except Exception as e:
        logger.log_error(f"Error loading latest chat: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to load latest chat: {str(e)}"
            }
        )
        
@router.post("/list-character-chats")
async def list_character_chats(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """List all chats for a character."""
    try:
        data = await request.json()
        character_data = data.get("character_data")
        
        if not character_data:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Character data is required"
                }
            )
            
        logger.log_step(f"Listing chats for character: {character_data.get('name', 'Unknown')}")
        chats = chat_handler.list_character_chats(character_data)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "chats": chats
            }
        )
    except Exception as e:
        logger.log_error(f"Error listing character chats: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to list character chats: {str(e)}"
            }
        )

@router.post("/save-chat")
async def save_chat(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Save the current chat state."""
    try:
        data = await request.json()
        character_data = data.get("character_data")
        messages = data.get("messages", [])
        last_user = data.get("last_user")
        api_info = data.get("api_info")
        
        if not character_data:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Character data is required"
                }
            )
            
        logger.log_step(f"Saving chat for character: {character_data.get('name', 'Unknown')}")
        result = chat_handler.save_chat(character_data, messages, last_user, api_info)
        
        # Handle different return types from the chat_handler.save_chat method
        if isinstance(result, dict) and "chat_id" in result:
            # If result is a dictionary with chat_id
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "chat_id": result["chat_id"]
                }
            )
        elif isinstance(result, bool):
            # If result is a boolean (likely indicating success/failure)
            if result:
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True
                    }
                )
            else:
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": "Failed to save chat (operation returned false)"
                    }
                )
        else:
            # Handle any other unexpected return type
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "chat_id": str(result) if result else None
                }
            )
    except Exception as e:
        logger.log_error(f"Error saving chat: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to save chat: {str(e)}"
            }
        )

@router.post("/append-chat-message")
async def append_chat_message(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Append a message to the current chat."""
    try:
        data = await request.json()
        character_data = data.get("character_data")
        message = data.get("message")
        
        if not character_data or not message:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Character data and message are required"
                }
            )
            
        logger.log_step(f"Appending message to chat for character: {character_data.get('name', 'Unknown')}")
        result = chat_handler.append_chat_message(character_data, message)
        
        return JSONResponse(
            status_code=200,
            content=result
        )
    except Exception as e:
        logger.log_error(f"Error appending chat message: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to append chat message: {str(e)}"
            }
        )

@router.post("/delete-chat")
async def delete_chat(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Delete a specific chat."""
    try:
        data = await request.json()
        character_data = data.get("character_data")
        chat_id = data.get("chat_id")
        
        if not character_data or not chat_id:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Character data and chat_id are required"
                }
            )
            
        logger.log_step(f"Deleting chat {chat_id} for character: {character_data.get('data', {}).get('name', 'Unknown')}")
        result = chat_handler.delete_chat(character_data, chat_id)
        
        if result:
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "Chat deleted successfully"
                }
            )
        else:
            return JSONResponse(
                status_code=404,
                content={
                    "success": False,
                    "message": "Chat not found or could not be deleted"
                }
            )
    except Exception as e:
        logger.log_error(f"Error deleting chat: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to delete chat: {str(e)}"
            }
        )

# HIGH PRIORITY ENDPOINTS - TO BE IMPLEMENTED

"""
@router.post("/rename-chat")
async def rename_chat(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    '''Rename a specific chat.'''
    # Implementation details:
    # 1. Parse character_data, chat_id and new_title from request
    # 2. Call chat_handler.rename_chat(character_data, chat_id, new_title)  
    # 3. Return success response with updated chat metadata
    pass
"""

"""
@router.post("/update-message")
async def update_message(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    '''Update a specific message in a chat.'''
    # Implementation details:
    # 1. Parse character_data, chat_id, message_id and new_content from request
    # 2. Call chat_handler.update_message(character_data, chat_id, message_id, new_content)
    # 3. Return success response with updated message
    pass
"""

# MEDIUM PRIORITY ENDPOINTS - TO BE IMPLEMENTED

"""
@router.post("/delete-message")
async def delete_message(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    '''Delete a specific message from a chat.'''
    # Implementation details:
    # 1. Parse character_data, chat_id and message_id from request
    # 2. Call chat_handler.delete_message(character_data, chat_id, message_id)
    # 3. Return success response
    pass
"""

"""
@router.post("/set-chat-metadata")
async def set_chat_metadata(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    '''Update metadata for a specific chat (title, tags, etc.).'''
    # Implementation details:
    # 1. Parse character_data, chat_id and metadata from request
    # 2. Call chat_handler.set_chat_metadata(character_data, chat_id, metadata)
    # 3. Return success response with updated chat metadata
    pass
"""

"""
@router.post("/export-chat")
async def export_chat(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    '''Export a chat to various formats (JSON, HTML, TXT).'''
    # Implementation details:
    # 1. Parse character_data, chat_id and format from request
    # 2. Call chat_handler.export_chat(character_data, chat_id, format)
    # 3. Return the exported chat data in requested format
    pass
"""

# LOW PRIORITY ENDPOINTS - TO BE IMPLEMENTED

"""
@router.post("/import-chat")
async def import_chat(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    '''Import a previously exported chat.'''
    # Implementation details:
    # 1. Parse character_data and chat_data from request
    # 2. Call chat_handler.import_chat(character_data, chat_data)
    # 3. Return success response with new chat_id
    pass
"""

"""
@router.post("/chat-statistics")
async def chat_statistics(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    '''Get statistics about a chat (message count, character count, etc.).'''
    # Implementation details:
    # 1. Parse character_data and chat_id from request
    # 2. Call chat_handler.get_chat_statistics(character_data, chat_id)
    # 3. Return statistics data
    pass
"""

"""
@router.post("/delete-all-character-chats")
async def delete_all_character_chats(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    '''Delete all chats for a specific character.'''
    # Implementation details:
    # 1. Parse character_data from request
    # 2. Call chat_handler.delete_all_chats(character_data)
    # 3. Return success response with count of deleted chats
    pass
"""

"""
@router.post("/autosave-settings")
async def autosave_settings(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    '''Configure autosave behavior for chats.'''
    # Implementation details:
    # 1. Parse settings from request (interval, enabled, etc)
    # 2. Call chat_handler.set_autosave_settings(settings)
    # 3. Return success response with updated settings
    pass
"""