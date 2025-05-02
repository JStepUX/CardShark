# backend/chat_endpoints.py
# Implements API endpoints for chat functionality
import json
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import Dict, List, Optional

# Import handler types for type hinting
from backend.log_manager import LogManager
from backend.chat_handler import ChatHandler
from backend.api_handler import ApiHandler
from backend.settings_manager import SettingsManager

# Dependency provider functions (defined locally, import from main inside)
def get_logger() -> LogManager:
    from backend.main import logger # Import locally to avoid circular dependency at module level
    if logger is None: raise HTTPException(status_code=500, detail="Logger not initialized")
    return logger

def get_chat_handler() -> ChatHandler:
    from backend.main import chat_handler # Import locally
    if chat_handler is None: raise HTTPException(status_code=500, detail="Chat handler not initialized")
    return chat_handler

def get_api_handler() -> ApiHandler:
    from backend.main import api_handler # Import locally
    if api_handler is None: raise HTTPException(status_code=500, detail="API handler not initialized")
    return api_handler

def get_settings_manager() -> SettingsManager:
    from backend.main import settings_manager # Import locally
    if settings_manager is None: raise HTTPException(status_code=500, detail="Settings manager not initialized")
    return settings_manager

# Create router
router = APIRouter(
    prefix="/api", # Add prefix here for consistency
    tags=["chat"], # Add tags for documentation
)

# --- Helper Function (Moved outside class) ---

def _fallback_greeting_generation(character_data: Dict, logger: LogManager):
    """Fallback method when API generation isn't available."""
    logger.log_step("Using fallback greeting generation")

    # Get the character's first message if available
    first_message = None
    char_data = character_data.get("data", {})

    if "first_mes" in char_data and char_data["first_mes"]:
        first_message = char_data["first_mes"]
        logger.log_step("Using character's first_mes for greeting")
    elif "description" in char_data and char_data["description"]:
        # If no first_mes, create a simple greeting based on description and name
        description = char_data["description"]
        char_name = char_data.get("name", "Character")
        logger.log_step(f"Creating simple greeting for {char_name} based on description")

        # Create a simple greeting using name and the first line of description
        first_line = description.split('.')[0] if '.' in description else description
        first_message = f"Hello! I'm {char_name}. {first_line}. It's nice to meet you!"
    else:
        char_name = char_data.get("name", "Character")
        first_message = f"Hello! I'm {char_name}. It's nice to meet you!"
        logger.log_step("No first_mes or description found, using default greeting")

    return {
        "success": True,
        "greeting": first_message
    }

# --- API Endpoints ---

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
            logger.log_warning("No character data provided for load-latest-chat")
            raise HTTPException(status_code=400, detail="Missing character data")

        logger.log_step("Loading latest chat for character")
        result = chat_handler.load_latest_chat(character_data)

        if not result:
            logger.log_warning("No chat found or failed to load")
            return {"success": False, "error": "No chat found or failed to load"}

        return result
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error loading latest chat: {str(e)}")
        return {"success": False, "error": str(e)}

@router.post("/save-chat")
async def save_chat(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Save a chat session."""
    try:
        data = await request.json()
        character_data = data.get("character_data")
        messages = data.get("messages", [])
        last_user = data.get("lastUser")
        api_info = data.get("api_info")

        if not character_data:
            logger.log_warning("No character data provided for save-chat")
            raise HTTPException(status_code=400, detail="Missing character data")

        logger.log_step(f"Saving chat with {len(messages)} messages")
        success = chat_handler.save_chat_state(
            character_data=character_data,
            messages=messages,
            lastUser=last_user,
            api_info=api_info
        )

        if not success:
            logger.log_warning("Failed to save chat")
            return {"success": False, "error": "Failed to save chat"}

        return {"success": True}
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error saving chat: {str(e)}")
        return {"success": False, "error": str(e)}

@router.post("/load-chat")
async def load_chat(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Load a specific chat by ID."""
    try:
        data = await request.json()
        character_data = data.get("character_data")
        chat_id = data.get("chat_id")
        use_active = data.get("use_active", False)

        if not character_data:
            logger.log_warning("No character data provided for load-chat")
            raise HTTPException(status_code=400, detail="Missing character data")

        # If use_active is True, prioritize loading the active chat
        if use_active:
            logger.log_step(f"Attempting to load active chat for character: {character_data.get('data', {}).get('name')}")
            active_chat_id = chat_handler._get_active_chat_id(character_data)

            if active_chat_id:
                logger.log_step(f"Found active chat ID: {active_chat_id}")
                chat_id = active_chat_id
            else:
                logger.log_warning("No active chat found, will attempt to load latest chat")
                result = chat_handler.load_latest_chat(character_data)
                if result:
                    logger.log_step("Successfully loaded latest chat")
                    return result
                else:
                    logger.log_warning("No latest chat found")
                    return {"success": False, "error": "No chat found for this character"}

        if not chat_id:
            logger.log_warning("No chat ID provided for load-chat and no active chat found")
            raise HTTPException(status_code=400, detail="Missing chat ID")

        logger.log_step(f"Loading chat with ID {chat_id}")
        result = chat_handler.load_chat(character_data, chat_id)

        if not result:
            logger.log_warning(f"Chat with ID {chat_id} not found")
            return {"success": False, "error": f"Chat not found: {chat_id}"}

        return result
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error loading chat: {str(e)}")
        return {"success": False, "error": str(e)}

@router.post("/create-chat")
@router.post("/create-new-chat") # Alias for frontend compatibility
async def create_chat(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Create a new chat."""
    try:
        data = await request.json()
        character_data = data.get("character_data")

        if not character_data:
            logger.log_warning("No character data provided for create-chat")
            raise HTTPException(status_code=400, detail="Missing character data")

        logger.log_step("Creating new chat")
        result = chat_handler.create_new_chat(character_data)

        if not result:
            logger.log_warning("Failed to create new chat")
            return {"success": False, "error": "Failed to create new chat"}

        return {"success": True, "chat_id": result.get("chat_id")}
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error creating new chat: {str(e)}")
        return {"success": False, "error": str(e)}

@router.post("/delete-chat")
async def delete_chat(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Delete a specific chat by ID."""
    try:
        data = await request.json()
        character_data = data.get("character_data")
        chat_id = data.get("chat_id")

        if not character_data:
            logger.log_warning("No character data provided for delete-chat")
            raise HTTPException(status_code=400, detail="Missing character data")

        if not chat_id:
            logger.log_warning("No chat ID provided for delete-chat")
            raise HTTPException(status_code=400, detail="Missing chat ID")

        logger.log_step(f"Deleting chat with ID {chat_id}")
        success = chat_handler.delete_chat(character_data, chat_id)

        if not success:
            logger.log_warning(f"Failed to delete chat with ID {chat_id}")
            return {"success": False, "error": f"Failed to delete chat: {chat_id}"}

        return {"success": True}
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error deleting chat: {str(e)}")
        return {"success": False, "error": str(e)}

@router.post("/list-chats")
@router.post("/list-character-chats") # Alias for frontend compatibility
async def list_chats(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """List all chats for a character."""
    try:
        data = await request.json()
        character_data = data.get("character_data")
        scan_all_files = data.get("scan_all_files", False) # For list-character-chats alias

        if not character_data:
            logger.log_warning("No character data provided for list-chats")
            raise HTTPException(status_code=400, detail="Missing character data")

        logger.log_step(f"Listing chats for character (scan_all_files={scan_all_files})")
        # Use list_character_chats if scan_all_files is true, otherwise get_all_chats
        if scan_all_files:
             chats = chat_handler.list_character_chats(character_data, scan_all_files)
        else:
             chats = chat_handler.get_all_chats(character_data) # Original behavior for /list-chats

        logger.log_step(f"Found {len(chats)} chat files")
        return {"success": True, "chats": chats}
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error listing chats: {str(e)}")
        return {"success": False, "error": str(e), "chats": []}

@router.post("/append-chat-message")
async def append_chat_message(
    request: Request,
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Append a single message to the current chat."""
    try:
        data = await request.json()
        character_data = data.get("character_data")
        message = data.get("message")

        if not character_data:
            logger.log_warning("No character data provided for append-chat-message")
            raise HTTPException(status_code=400, detail="Missing character data")

        if not message:
            logger.log_warning("No message provided for append-chat-message")
            raise HTTPException(status_code=400, detail="Missing message data")

        logger.log_step("Appending message to chat")
        success = chat_handler.append_message(character_data, message)

        if not success:
            logger.log_warning("Failed to append message")
            return {"success": False, "error": "Failed to append message"}

        return {"success": True}
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error appending chat message: {str(e)}")
        return {"success": False, "error": str(e)}

@router.post("/clear-context")
async def clear_context(
    request: Request, # Keep request if needed, otherwise remove
    chat_handler: ChatHandler = Depends(get_chat_handler),
    logger: LogManager = Depends(get_logger)
):
    """Clear the persisted context window for the current session/character."""
    try:
        # Assuming context is global or handled internally by chat_handler
        logger.log_step("Clearing context window")
        # Assuming chat_handler has a method like this:
        success = chat_handler.clear_context_window() # Might need adjustment based on handler method

        if not success:
            logger.log_warning("Failed to clear context window")
            return {"success": False, "error": "Failed to clear context window"}

        return {"success": True}
    except Exception as e:
        logger.log_error(f"Error clearing context window: {str(e)}")
        return {"success": False, "error": str(e)}

@router.post("/generate")
async def generate_response(
    request: Request,
    api_handler: ApiHandler = Depends(get_api_handler),
    logger: LogManager = Depends(get_logger)
):
    """Generate an AI response using the provided API configuration."""
    try:
        data = await request.json()
        api_config = data.get("api_config", {})
        generation_params = data.get("generation_params", {})

        if not api_handler: # Should not happen with Depends, but good practice
            logger.log_error("API handler not initialized for generate endpoint")
            raise HTTPException(status_code=500, detail="API handler not initialized")

        if not api_config:
            logger.log_warning("No API configuration provided for generate")
            raise HTTPException(status_code=400, detail="Missing API configuration")

        if not generation_params:
            logger.log_warning("No generation parameters provided for generate")
            raise HTTPException(status_code=400, detail="Missing generation parameters")

        logger.log_step("Generating response using API")

        # Use the API handler to stream a response
        processed_data = {
            'api_config': dict(api_config),
            'generation_params': dict(generation_params)
        }

        # Return a streaming response that uses the stream_generate method
        return StreamingResponse(
            api_handler.stream_generate(processed_data),
            media_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error generating response: {str(e)}")
        # Return JSON error for non-streaming errors
        return {"success": False, "error": str(e)}

@router.post("/generate-greeting")
async def generate_greeting(
    request: Request,
    api_handler: ApiHandler = Depends(get_api_handler),
    settings_manager: SettingsManager = Depends(get_settings_manager),
    logger: LogManager = Depends(get_logger)
):
    """Generate a greeting message for a character based on their first_mes or description."""
    try:
        data = await request.json()
        character_data = data.get("character_data")
        api_config = data.get("api_config", {})

        if not character_data:
            logger.log_warning("No character data provided for generate-greeting")
            raise HTTPException(status_code=400, detail="Missing character data")

        # If no API config provided, check if there's a default one to use
        if not api_config and settings_manager:
            api_config = settings_manager.get_default_api_config()
            if api_config:
                logger.log_step("Using default API configuration for greeting generation")

        # Fallback if no API config and no API handler
        if not api_config or not api_handler:
            logger.log_warning("No API configuration or handler available for generate-greeting, using fallback.")
            return _fallback_greeting_generation(character_data, logger)

        char_data = character_data.get("data", {})
        char_name = char_data.get("name", "Character")
        description = char_data.get("description", "")
        personality = char_data.get("personality", "")
        scenario = char_data.get("scenario", "")
        example_dialogue = char_data.get("example_dialogue", "")

        # Creating a prompt for greeting generation
        system_prompt = (
            f"You are {char_name}. "
            f"Personality: {personality}\n"
            f"Description: {description}\n"
        )

        if scenario:
            system_prompt += f"Scenario: {scenario}\n"

        # Instruction for the greeting
        greeting_instruction = (
            "Generate a warm and engaging greeting message as this character meeting the user "
            "for the first time. The greeting should reflect the character's personality, "
            "speaking style, and unique traits. Keep it under 150 words. Do not include "
            "any meta-information, just write the greeting directly in first person as the character."
        )

        # Check if we already have a first message we can reference
        first_mes = char_data.get("first_mes", "")
        if first_mes:
            greeting_instruction += (
                f"\n\nFor reference, here's a previous greeting by this character: \"{first_mes}\"\n"
                "Create something new but in a similar style."
            )

        # If we have example dialogue, include it for style reference
        if example_dialogue:
            greeting_instruction += f"\n\nHere's an example of how this character speaks: \"{example_dialogue}\""

        # Setup generation parameters
        generation_params = {
            "prompt": greeting_instruction,
            "memory": system_prompt,
            "stop_sequence": ["User:", "Human:", "You:", "<|im_end|>"]
        }

        # Setup streaming response
        logger.log_step(f"Generating greeting for {char_name}")

        # Use the API handler to stream a response
        processed_data = {
            'api_config': dict(api_config),
            'generation_params': dict(generation_params)
        }

        # Return a streaming response that uses the stream_generate method
        return StreamingResponse(
            api_handler.stream_generate(processed_data),
            media_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        )

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error generating greeting: {str(e)}")
        # Fallback on error during API generation
        logger.log_warning("API greeting generation failed, using fallback.")
        # Ensure character_data is available for fallback
        try:
             char_data_fallback = await request.json()
             character_data_fallback = char_data_fallback.get("character_data")
             if character_data_fallback:
                  return _fallback_greeting_generation(character_data_fallback, logger)
             else:
                  # If character data isn't even available, return a generic error
                  return {"success": False, "error": "Failed to generate greeting due to missing data and API error."}
        except Exception as fallback_err:
             logger.log_error(f"Error during fallback greeting generation: {fallback_err}")
             return {"success": False, "error": "Failed to generate greeting due to API error and fallback failure."}