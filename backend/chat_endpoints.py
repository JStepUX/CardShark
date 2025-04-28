# backend/chat_endpoints.py
# Implements API endpoints for chat functionality
from fastapi import APIRouter, Request, HTTPException
from typing import Dict, List, Optional
import json

# Create router
router = APIRouter()

class ChatEndpoints:
    def __init__(self, logger, chat_handler, api_handler=None):
        """Initialize with dependencies."""
        self.logger = logger
        self.chat_handler = chat_handler
        self.api_handler = api_handler  # Add API handler for generate endpoint

    def register_routes(self, router):
        """Register all chat endpoints with the provided router."""
        
        @router.post("/api/load-latest-chat")
        async def load_latest_chat(request: Request):
            """Load the latest chat for a character."""
            try:
                data = await request.json()
                character_data = data.get("character_data")
                
                if not character_data:
                    self.logger.log_warning("No character data provided for load-latest-chat")
                    raise HTTPException(status_code=400, detail="Missing character data")
                
                self.logger.log_step("Loading latest chat for character")
                result = self.chat_handler.load_latest_chat(character_data)
                
                if not result:
                    self.logger.log_warning("No chat found or failed to load")
                    return {"success": False, "error": "No chat found or failed to load"}
                    
                return result
            except HTTPException as http_exc:
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error loading latest chat: {str(e)}")
                return {"success": False, "error": str(e)}
        
        @router.post("/api/save-chat")
        async def save_chat(request: Request):
            """Save a chat session."""
            try:
                data = await request.json()
                character_data = data.get("character_data")
                messages = data.get("messages", [])
                last_user = data.get("lastUser")
                api_info = data.get("api_info")
                
                if not character_data:
                    self.logger.log_warning("No character data provided for save-chat")
                    raise HTTPException(status_code=400, detail="Missing character data")
                
                self.logger.log_step(f"Saving chat with {len(messages)} messages")
                success = self.chat_handler.save_chat_state(
                    character_data=character_data, 
                    messages=messages, 
                    lastUser=last_user, 
                    api_info=api_info
                )
                
                if not success:
                    self.logger.log_warning("Failed to save chat")
                    return {"success": False, "error": "Failed to save chat"}
                    
                return {"success": True}
            except HTTPException as http_exc:
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error saving chat: {str(e)}")
                return {"success": False, "error": str(e)}
        
        @router.post("/api/load-chat")
        async def load_chat(request: Request):
            """Load a specific chat by ID."""
            try:
                data = await request.json()
                character_data = data.get("character_data")
                chat_id = data.get("chat_id")
                use_active = data.get("use_active", False)
                
                if not character_data:
                    self.logger.log_warning("No character data provided for load-chat")
                    raise HTTPException(status_code=400, detail="Missing character data")
                
                # If use_active is True, prioritize loading the active chat
                if use_active:
                    self.logger.log_step(f"Attempting to load active chat for character: {character_data.get('data', {}).get('name')}")
                    active_chat_id = self.chat_handler._get_active_chat_id(character_data)
                    
                    if active_chat_id:
                        self.logger.log_step(f"Found active chat ID: {active_chat_id}")
                        chat_id = active_chat_id
                    else:
                        self.logger.log_warning("No active chat found, will attempt to load latest chat")
                        result = self.chat_handler.load_latest_chat(character_data)
                        if result:
                            self.logger.log_step("Successfully loaded latest chat")
                            return result
                        else:
                            self.logger.log_warning("No latest chat found")
                            return {"success": False, "error": "No chat found for this character"}
                
                if not chat_id:
                    self.logger.log_warning("No chat ID provided for load-chat and no active chat found")
                    raise HTTPException(status_code=400, detail="Missing chat ID")
                
                self.logger.log_step(f"Loading chat with ID {chat_id}")
                result = self.chat_handler.load_chat(character_data, chat_id)
                
                if not result:
                    self.logger.log_warning(f"Chat with ID {chat_id} not found")
                    return {"success": False, "error": f"Chat not found: {chat_id}"}
                    
                return result
            except HTTPException as http_exc:
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error loading chat: {str(e)}")
                return {"success": False, "error": str(e)}
        
        @router.post("/api/create-chat")
        async def create_chat(request: Request):
            """Create a new chat."""
            try:
                data = await request.json()
                character_data = data.get("character_data")
                
                if not character_data:
                    self.logger.log_warning("No character data provided for create-chat")
                    raise HTTPException(status_code=400, detail="Missing character data")
                
                self.logger.log_step("Creating new chat")
                result = self.chat_handler.create_new_chat(character_data)
                
                if not result:
                    self.logger.log_warning("Failed to create new chat")
                    return {"success": False, "error": "Failed to create new chat"}
                    
                return {"success": True, "chat_id": result.get("chat_id")}
            except HTTPException as http_exc:
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error creating new chat: {str(e)}")
                return {"success": False, "error": str(e)}
        
        @router.post("/api/create-new-chat")
        async def create_new_chat(request: Request):
            """Create a new chat (alias for create-chat for frontend compatibility)."""
            try:
                data = await request.json()
                character_data = data.get("character_data")
                
                if not character_data:
                    self.logger.log_warning("No character data provided for create-new-chat")
                    raise HTTPException(status_code=400, detail="Missing character data")
                
                self.logger.log_step("Creating new chat")
                result = self.chat_handler.create_new_chat(character_data)
                
                if not result:
                    self.logger.log_warning("Failed to create new chat")
                    return {"success": False, "error": "Failed to create new chat"}
                    
                return {"success": True, "chat_id": result.get("chat_id")}
            except HTTPException as http_exc:
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error creating new chat: {str(e)}")
                return {"success": False, "error": str(e)}
        
        @router.post("/api/delete-chat")
        async def delete_chat(request: Request):
            """Delete a specific chat by ID."""
            try:
                data = await request.json()
                character_data = data.get("character_data")
                chat_id = data.get("chat_id")
                
                if not character_data:
                    self.logger.log_warning("No character data provided for delete-chat")
                    raise HTTPException(status_code=400, detail="Missing character data")
                
                if not chat_id:
                    self.logger.log_warning("No chat ID provided for delete-chat")
                    raise HTTPException(status_code=400, detail="Missing chat ID")
                
                self.logger.log_step(f"Deleting chat with ID {chat_id}")
                success = self.chat_handler.delete_chat(character_data, chat_id)
                
                if not success:
                    self.logger.log_warning(f"Failed to delete chat with ID {chat_id}")
                    return {"success": False, "error": f"Failed to delete chat: {chat_id}"}
                    
                return {"success": True}
            except HTTPException as http_exc:
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error deleting chat: {str(e)}")
                return {"success": False, "error": str(e)}

        @router.post("/api/list-chats")
        async def list_chats(request: Request):
            """List all chats for a character."""
            try:
                data = await request.json()
                character_data = data.get("character_data")
                
                if not character_data:
                    self.logger.log_warning("No character data provided for list-chats")
                    raise HTTPException(status_code=400, detail="Missing character data")
                
                self.logger.log_step("Listing chats for character")
                chats = self.chat_handler.get_all_chats(character_data)
                
                return {"success": True, "chats": chats}
            except HTTPException as http_exc:
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error listing chats: {str(e)}")
                return {"success": False, "error": str(e), "chats": []}

        @router.post("/api/list-character-chats")
        async def list_character_chats(request: Request):
            """List all chats for a character (alias for list-chats for frontend compatibility)."""
            try:
                data = await request.json()
                character_data = data.get("character_data")
                
                if not character_data:
                    self.logger.log_warning("No character data provided for list-character-chats")
                    raise HTTPException(status_code=400, detail="Missing character data")
                
                self.logger.log_step("Listing character chats")
                chats = self.chat_handler.get_all_chats(character_data)
                
                return {"success": True, "chats": chats}
            except HTTPException as http_exc:
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error listing character chats: {str(e)}")
                return {"success": False, "error": str(e), "chats": []}
        
        @router.post("/api/append-chat-message")
        async def append_chat_message(request: Request):
            """Append a single message to the current chat."""
            try:
                data = await request.json()
                character_data = data.get("character_data")
                message = data.get("message")
                
                if not character_data:
                    self.logger.log_warning("No character data provided for append-chat-message")
                    raise HTTPException(status_code=400, detail="Missing character data")
                
                if not message:
                    self.logger.log_warning("No message provided for append-chat-message")
                    raise HTTPException(status_code=400, detail="Missing message data")
                
                self.logger.log_step("Appending message to chat")
                success = self.chat_handler.append_message(character_data, message)
                
                if not success:
                    self.logger.log_warning("Failed to append message")
                    return {"success": False, "error": "Failed to append message"}
                    
                return {"success": True}
            except HTTPException as http_exc:
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error appending chat message: {str(e)}")
                return {"success": False, "error": str(e)}

        @router.post("/api/generate")
        async def generate_response(request: Request):
            """Generate an AI response using the provided API configuration."""
            try:
                from fastapi.responses import StreamingResponse
                
                data = await request.json()
                api_config = data.get("api_config", {})
                generation_params = data.get("generation_params", {})
                
                if not self.api_handler:
                    self.logger.log_error("API handler not initialized for generate endpoint")
                    raise HTTPException(status_code=500, detail="API handler not initialized")
                
                if not api_config:
                    self.logger.log_warning("No API configuration provided for generate")
                    raise HTTPException(status_code=400, detail="Missing API configuration")
                
                if not generation_params:
                    self.logger.log_warning("No generation parameters provided for generate")
                    raise HTTPException(status_code=400, detail="Missing generation parameters")
                
                self.logger.log_step("Generating response using API")
                
                # Use the API handler to stream a response instead of using generate_with_config
                processed_data = {
                    'api_config': dict(api_config),
                    'generation_params': dict(generation_params)
                }
                
                # Return a streaming response that uses the stream_generate method
                return StreamingResponse(
                    self.api_handler.stream_generate(processed_data),
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
                self.logger.log_error(f"Error generating response: {str(e)}")
                return {"success": False, "error": str(e)}

# Note: The router will be initialized when this file is imported into main.py