# backend/chat_endpoints.py
# Implements API endpoints for chat operations
import traceback
from datetime import datetime
import json # Added for logging
from typing import Dict, List, Any, Optional, Generator # Added Generator
 
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse # Added StreamingResponse
from pydantic import BaseModel, Field
 
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
        
        if result and result.get("success") and result.get("chat_id"):
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "chat_id": result["chat_id"],
                    "messages": []
                }
            )
        else:
            failure_reason = result.get("message") if isinstance(result, dict) else "Chat handler failed to create chat or return valid ID."
            logger.log_error(f"Chat creation failed in handler: {failure_reason}")
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "message": f"Failed to create new chat: {failure_reason}"
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
        scan_all_files = data.get("scan_all_files", True)  # Default to scanning all files
        
        if not character_data:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Character data is required"
                }
            )
            
        character_name = character_data.get("data", {}).get("name", "Unknown")
        logger.log_step(f"Loading latest chat for character: {character_name}")
        
        # If data contains character_id, log it for debugging
        character_id = data.get("character_id")
        if character_id:
            logger.log_step(f"Using provided character_id: {character_id}")
        
        # Pass scan_all_files parameter if the chat handler supports it
        result = None
        try:
            # Try with scan_all_files parameter first
            result = chat_handler.load_latest_chat(character_data, scan_all_files=scan_all_files)
        except TypeError:
            # Fall back to standard call if parameter isn't supported
            result = chat_handler.load_latest_chat(character_data)
            
        if result:
            # Log the number of messages loaded
            message_count = len(result.get("messages", []))
            logger.log_step(f"Successfully loaded {message_count} messages for character: {character_name}")
            
            # Add additional information to the response
            result["message_count"] = message_count

            # Sanitize messages to ensure they are serializable
            sanitized_messages = []
            if "messages" in result and isinstance(result["messages"], list):
                for msg in result["messages"]:
                    if hasattr(msg, 'to_dict'): # Check for a to_dict method
                        sanitized_messages.append(msg.to_dict())
                    elif isinstance(msg, dict): # If already a dict, assume it's fine
                        sanitized_messages.append(msg)
                    elif hasattr(msg, '__dict__'): # Fallback to __dict__
                         # Be cautious with __dict__ as it can include private/internal attrs
                         # A more robust solution would be to define explicit serialization
                        sanitized_messages.append(msg.__dict__)
                    else:
                        # If it's some other non-serializable type, log a warning and skip or represent as string
                        logger.log_warning(f"Message of type {type(msg)} may not be JSON serializable. Converting to string.")
                        sanitized_messages.append(str(msg)) # Or skip, or raise error
            
            result["messages"] = sanitized_messages
            
            # Return the result
            return JSONResponse(
                status_code=200,
                content=result
            )
        else:
            logger.log_warning(f"No chat found for character: {character_name}")
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "message": "No chat found for this character",
                    "messages": []
                }
            )
    except Exception as e:
        logger.log_error(f"Error loading latest chat: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to load latest chat: {str(e)}",
                "messages": []
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
        
        # Detailed log of the received character_data
        logger.log_info(f"Received character_data in list_character_chats: {json.dumps(character_data)}")

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
        last_user = data.get("lastUser")  # Note the camelCase name matching frontend
        api_info = data.get("api_info")
        metadata = data.get("metadata")
        
        if not character_data:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Character data is required"
                }
            )
            
        # Validate character data consistency between chat and actual character data
        char_name = character_data.get('data', {}).get('name', 'Unknown')
        
        # Check for potential mismatch in character data
        expected_name = None
        if metadata and metadata.get('chat_metadata') and metadata['chat_metadata'].get('character_name'):
            expected_name = metadata['chat_metadata'].get('character_name')
        elif messages and len(messages) > 0:
            # Try to extract name from first message or chat metadata
            if 'name' in messages[0]:
                expected_name = messages[0].get('name')
            elif messages[0].get('chat_metadata', {}).get('character_name'):
                expected_name = messages[0].get('chat_metadata', {}).get('character_name')
        
        if expected_name and char_name != expected_name:
            logger.log_warning(f"CHAT CONSISTENCY ISSUE: Character name in data '{char_name}' doesn't match expected name '{expected_name}'")
            logger.log_warning(f"This could indicate character data inconsistency - the name has been corrected")
            # Update the character data to match the expected name
            if 'data' not in character_data:
                character_data['data'] = {}
            character_data['data']['name'] = expected_name
            char_name = expected_name
            
        # Log the number of messages being saved for debugging
        logger.log_step(f"Saving chat for character: {char_name}")
        logger.log_step(f"Saving {len(messages)} messages")
        
        # Make sure we're passing all messages to the save function
        result = chat_handler.save_chat_state(character_data, messages, last_user, api_info, metadata)
        
        if result:
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message_count": len(messages)
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
        result = chat_handler.append_message(character_data, message)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Message appended successfully"
            }
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

@router.post("/autosave-settings")
async def autosave_settings(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Configure autosave behavior for chats."""
    try:
        data = await request.json()
        
        # Extract settings from the request
        enabled = data.get("enabled", True)  # Default to enabled
        interval_seconds = data.get("interval_seconds", 30)  # Default 30 seconds
        save_threshold = data.get("save_threshold", 3)  # Default after 3 changes
        
        # Validate settings
        if not isinstance(enabled, bool):
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Enabled must be a boolean value"
                }
            )
            
        if not isinstance(interval_seconds, int) or interval_seconds < 1:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Interval seconds must be a positive integer"
                }
            )
            
        if not isinstance(save_threshold, int) or save_threshold < 1:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Save threshold must be a positive integer"
                }
            )
        
        # Apply the settings to the chat handler
        chat_handler.set_autosave_interval(interval_seconds)
        
        # Store the full settings for persistence and future retrieval
        settings = {
            "enabled": enabled,
            "interval_seconds": interval_seconds,
            "save_threshold": save_threshold,
            "last_updated": datetime.now().isoformat()
        }
        
        logger.log_step(f"Configured chat autosave: enabled={enabled}, interval={interval_seconds}s, threshold={save_threshold}")
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "settings": settings,
                "message": "Autosave settings updated successfully"
            }
        )
    except Exception as e:
        logger.log_error(f"Error configuring autosave settings: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to configure autosave settings: {str(e)}"
            }
        )
# Pydantic model for the flat generation request body from frontend
class FlatGenerateRequest(BaseModel):
    # API Config related fields (flattened)
    id: Optional[str] = None # API Config ID
    name: Optional[str] = None # API Config Name
    provider: Optional[str] = None
    url: Optional[str] = None
    apiKey: Optional[str] = None
    model: Optional[str] = None
    templateId: Optional[str] = None
    generation_settings: Dict[str, Any] = Field(default_factory=dict)
    enabled: Optional[bool] = None
    lastConnectionStatus: Optional[Dict[str, Any]] = None
    model_info: Optional[Dict[str, Any]] = None

    # Generation Parameter related fields (flattened)
    prompt: Optional[str] = None
    stop_sequences: List[str] = Field(default_factory=list) # Frontend sends "stop_sequences"

    # Character Data (expected at top level by original GenerateRequest, now part of flat structure)
    character_data: Optional[Dict[str, Any]] = None

    # Other potential generation params that might be part of the flat payload
    # or needed by api_handler.stream_generate
    memory: Optional[str] = None
    chat_history: List[Dict[str, Any]] = Field(default_factory=list)
    current_message: Optional[str] = None
    # context_window: Optional[Dict[str, Any]] = None # Not in error, api_handler defaults

# Original GenerateRequest model (can be kept for reference or if used elsewhere)
class GenerateRequest(BaseModel):
    character_data: Dict
    api_config: Dict
    generation_params: Dict

@router.post("/chat/generate")
def generate_chat_response(
    flat_request: FlatGenerateRequest, # Use the new flat model
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Generate a chat response using the LLM API with streaming."""
    try:
        logger.log_step("Received generation request at /api/chat/generate (using FlatGenerateRequest)")
        logger.log_step(f"Flat request received: {flat_request.model_dump_json(indent=2, exclude_none=True)}")

        # Reconstruct api_config from the flat request
        api_config_reconstructed = {
            "id": flat_request.id,
            "name": flat_request.name,
            "provider": flat_request.provider,
            "url": flat_request.url,
            "apiKey": flat_request.apiKey,
            "model": flat_request.model,
            "templateId": flat_request.templateId,
            "generation_settings": flat_request.generation_settings,
            "enabled": flat_request.enabled,
            "lastConnectionStatus": flat_request.lastConnectionStatus,
            "model_info": flat_request.model_info
        }
        logger.log_step(f"Reconstructed api_config: {json.dumps(api_config_reconstructed, indent=2)}")

        # Reconstruct generation_params from the flat request
        # api_handler.stream_generate expects 'stop_sequence' (singular)
        generation_params_reconstructed = {
            "prompt": flat_request.prompt,
            "stop_sequence": flat_request.stop_sequences, # Pass as is, api_handler has defaults
            "memory": flat_request.memory,
            "chat_history": flat_request.chat_history,
            "current_message": flat_request.current_message,
            # character_data is passed separately to chat_handler.generate_chat_response_stream
            # and chat_handler is assumed to merge it into generation_params for api_handler
        }
        logger.log_step(f"Reconstructed generation_params: {json.dumps(generation_params_reconstructed, indent=2)}")
        
        # Character data is taken directly from the flat request's top-level field
        char_data_for_handler = flat_request.character_data
        if char_data_for_handler is None:
            logger.log_warning("Character data is missing in the flat request.")
            # Depending on requirements, might raise HTTPException or provide default
            # For now, pass None and let downstream handlers manage it.

        logger.log_step(f"Character data for handler: {json.dumps(char_data_for_handler, indent=2) if char_data_for_handler else 'None'}")

        # Use the generator from the chat handler with reconstructed data
        response_generator = chat_handler.generate_chat_response_stream(
            character_data=char_data_for_handler,
            api_config=api_config_reconstructed,
            generation_params=generation_params_reconstructed
        )
        
        # Return a streaming response
        return StreamingResponse(
            response_generator,
            media_type="text/event-stream"
        )
    except Exception as e:
        logger.log_error(f"Error in /api/chat/generate endpoint: {str(e)}")
        logger.log_error(traceback.format_exc())
        # Note: If headers are already sent by the stream starting, this JSONResponse might not work.
        # The error handling within the generator itself might be the primary way to signal errors.
        return JSONResponse(
            status_code=500,
            content={"error": f"Generation failed: {str(e)}"}
        )