# backend/main.py
# Main FastAPI application file for CardShark
import sys
import os
import argparse
from pathlib import Path
import uuid
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Response, Request # type: ignore
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse # type: ignore
from fastapi.staticfiles import StaticFiles # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
import send2trash
import uvicorn # type: ignore
import json
import base64
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import tempfile
from tempfile import NamedTemporaryFile
import requests # type: ignore
import re
import traceback
from fastapi.responses import FileResponse, JSONResponse # type: ignore
from typing import Optional, Dict, List
import webbrowser
from threading import Timer
import time
from datetime import datetime

# Local imports
from backend.log_manager import LogManager  # Change to relative import
from backend.png_metadata_handler import PngMetadataHandler  # For normal operation
from backend.png_debug_handler import PngDebugHandler  
from backend.errors import CardSharkError
from backend.backyard_handler import BackyardHandler
from backend.settings_manager import SettingsManager
from backend.character_validator import CharacterValidator
from backend.api_handler import ApiHandler
from backend.chat_handler import ChatHandler
from backend.network_server import run_server
from backend.template_handler import TemplateHandler
from backend.background_handler import BackgroundHandler
from backend.lore_handler import LoreHandler
from backend.world_state_manager import WorldStateManager

def get_frontend_path() -> Path:
    if getattr(sys, 'frozen', False):  # Running as PyInstaller EXE
        return Path(sys._MEIPASS) / "frontend" / "dist"
    else:  # Running as normal Python script
        return Path(__file__).parent.parent / "frontend" / "dist"
    
# Initialize FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize managers and handlers
logger = LogManager()
settings_manager = SettingsManager(logger)
png_handler = PngMetadataHandler(logger)
backyard_handler = BackyardHandler(logger)
validator = CharacterValidator(logger)
png_debug = PngDebugHandler(logger)
api_handler = ApiHandler(logger)
chat_handler = ChatHandler(logger) 
template_handler = TemplateHandler(logger)
background_handler = BackgroundHandler(logger)
background_handler.initialize_default_backgrounds()
lore_handler = LoreHandler(logger, default_position=0)
world_state_manager = WorldStateManager(logger)

# API Endpoints

from fastapi.responses import JSONResponse

@app.post("/api/world-state/save")
async def save_world_state(request: Request, world: Optional[str] = None): # Add world query parameter
    """Saves the world state JSON for a specific world."""
    try:
        # Determine world name - prioritize query param, fallback to name in body? (Decide on priority)
        world_name = world
        data = await request.json()
        if not world_name:
             world_name = data.get('name') # Fallback to name in JSON body if query param missing

        if not world_name:
            raise HTTPException(status_code=400, detail="World name is required either as query parameter 'world' or in the JSON body 'name'.")

        logger.log_step(f"Received save request for world: {world_name}")
        success = world_state_manager.save_world_state(world_name, data)
        if success:
            return JSONResponse(status_code=200, content={"success": True, "message": f"World state for '{world_name}' saved successfully"})
        else:
            return JSONResponse(status_code=500, content={"success": False, "message": f"Failed to save world state for '{world_name}'"})
    except Exception as e:
        logger.log_error(f"Error in save_world_state for world '{world_name}': {str(e)}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Error saving world state: {str(e)}"})
# --- NEW ENDPOINT TO LOAD WORLD STATE ---
@app.get("/api/world-state/load/{world_name}")
async def load_world_state_api(world_name: str):
    """Loads the world state JSON for a specific world."""
    try:
        logger.log_step(f"Received load request for world: {world_name}")
        state = world_state_manager.load_world_state(world_name)
        if not state:
             # If state is empty (file not found or empty), return 404
             raise HTTPException(status_code=404, detail=f"World state for '{world_name}' not found.")

        return JSONResponse(status_code=200, content=state)

    except HTTPException as http_exc:
        # Re-raise known HTTP errors
        logger.log_error(f"HTTP error loading world state for '{world_name}': {http_exc.detail}")
        raise http_exc
    except ValueError as ve: # Catch invalid world name from manager
        logger.log_error(f"Invalid world name provided for loading: {world_name} - {str(ve)}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.log_error(f"Error loading world state for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error loading world state: {str(e)}")
# --- END NEW ENDPOINT ---


# --- NEW ENDPOINT START ---
@app.post("/api/worlds/{world_name}/upload-png")
async def upload_world_png(world_name: str, file: UploadFile = File(...)):
    """Upload a PNG image for a specific world."""
    try:
        logger.log_step(f"Received PNG upload request for world: {world_name}")

        # Define the target directory for world images
        # Ensure world_name is sanitized to prevent path traversal issues
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name) # Basic sanitization
        if not safe_world_name:
             raise HTTPException(status_code=400, detail="Invalid world name provided.")

        worlds_dir = Path("worlds")
        world_image_dir = worlds_dir / safe_world_name / "images"
        world_image_dir.mkdir(parents=True, exist_ok=True)

        # Generate a unique filename to avoid conflicts (optional but recommended)
        # For simplicity now, using original filename, but consider UUIDs later
        # Ensure filename is also sanitized
        safe_filename = re.sub(r'[^\w\.\-]+', '_', file.filename)
        if not safe_filename.lower().endswith(".png"):
             raise HTTPException(status_code=400, detail="Only PNG files are allowed.")

        file_path = world_image_dir / safe_filename

        # Save the uploaded file
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())

        logger.log_step(f"Saved world PNG to: {file_path}")

        # Return the path or URL to the saved image
        # Construct the API path for the new serving endpoint
        api_file_path = f"/api/worlds/images/{safe_world_name}/{safe_filename}"

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"World PNG '{safe_filename}' uploaded successfully for '{safe_world_name}'.",
                "filePath": api_file_path # Use the constructed API path
            }
        )

    except HTTPException as http_exc:
        logger.log_error(f"HTTP error uploading world PNG: {http_exc.detail}")
        raise http_exc # Re-raise HTTPException
    except Exception as e:
        logger.log_error(f"Error uploading world PNG for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
# --- NEW ENDPOINT END ---


@app.get("/api/uploads/{filename}")
async def get_uploaded_image(filename: str):
    """Serve uploaded images."""
    try:
        uploads_dir = Path("uploads")
        file_path = uploads_dir / filename

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Image not found")

        return FileResponse(file_path)
    except Exception as e:
        logger.log_error(f"Error serving image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# --- NEW ENDPOINT TO SERVE WORLD IMAGES ---
@app.get("/api/worlds/images/{world_name}/{filename}")
async def get_world_image(world_name: str, filename: str):
    """Serve images uploaded for specific worlds."""
    try:
        # Sanitize inputs
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        safe_filename = re.sub(r'[^\w\.\-]+', '_', filename)

        if not safe_world_name or not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid world name or filename.")

        worlds_dir = Path("worlds")
        file_path = worlds_dir / safe_world_name / "images" / safe_filename

        if not file_path.is_file(): # Check if it's actually a file
            logger.log_warning(f"World image not found at: {file_path}")
            raise HTTPException(status_code=404, detail="World image not found")

        logger.log_step(f"Serving world image from: {file_path}")
        return FileResponse(file_path)

    except HTTPException as http_exc:
        # Log and re-raise known HTTP errors
        logger.log_error(f"HTTP error serving world image: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error serving world image '{filename}' for world '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        # Return a generic 500 error for unexpected issues
        raise HTTPException(status_code=500, detail="Internal server error while serving image.")
# --- END NEW ENDPOINT ---


# --- NEW ENDPOINT FOR MAIN WORLD CARD UPLOAD ---
@app.post("/api/worlds/{world_name}/upload-card")
async def upload_world_card_image(world_name: str, file: UploadFile = File(...)):
    """Upload the main PNG card image for a specific world."""
    try:
        logger.log_step(f"Received main card PNG upload request for world: {world_name}")

        # Basic sanitization
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
             raise HTTPException(status_code=400, detail="Invalid world name provided.")

        # Ensure it's a PNG
        if not file.filename or not file.filename.lower().endswith(".png"):
             raise HTTPException(status_code=400, detail="Only PNG files are allowed for the world card.")

        # Define the target directory and fixed filename
        worlds_dir = Path("worlds")
        world_dir = worlds_dir / safe_world_name
        world_dir.mkdir(parents=True, exist_ok=True)
        file_path = world_dir / "world_card.png" # Use a fixed name

        # Save the uploaded file
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())

        logger.log_step(f"Saved main world card PNG to: {file_path}")

        # Construct the API path to serve the file
        api_file_path = f"/api/worlds/{safe_world_name}/card"

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"Main world card PNG uploaded successfully for '{safe_world_name}'.",
                "filePath": api_file_path
            }
        )

    except HTTPException as http_exc:
        logger.log_error(f"HTTP error uploading main world card PNG: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error uploading main world card PNG for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
# --- END NEW ENDPOINT ---


# --- NEW ENDPOINT TO LIST WORLDS ---
@app.get("/api/worlds/list")
async def list_worlds():
    """Scans the worlds directory and returns a list of available worlds."""
    worlds_data = []
    worlds_base_dir = Path("worlds")

    if not worlds_base_dir.is_dir():
        logger.log_warning(f"Worlds base directory not found at: {worlds_base_dir}")
        return JSONResponse(status_code=200, content=[]) # Return empty list if base dir doesn't exist

    try:
        for world_dir in worlds_base_dir.iterdir():
            if world_dir.is_dir():
                world_name = world_dir.name # Use directory name as the world identifier/name
                card_image_path = world_dir / "world_card.png"
                state_file_path = world_dir / "world_state.json"

                # Basic info from JSON (optional for now, primarily need the image)
                display_name = world_name # Default to directory name
                description = ""
                if state_file_path.is_file():
                    try:
                        with open(state_file_path, "r", encoding="utf-8") as f:
                            state_data = json.load(f)
                            display_name = state_data.get("name", world_name) # Use name from JSON if available
                            description = state_data.get("description", "")
                    except json.JSONDecodeError:
                        logger.log_warning(f"Could not decode JSON for world: {world_name}")
                    except Exception as e:
                         logger.log_error(f"Error reading state file for {world_name}: {e}")


                if card_image_path.is_file():
                    # Construct the API URL to fetch the card image
                    card_image_url = f"/api/worlds/{world_name}/card"
                    worlds_data.append({
                        "id": world_name, # Use directory name as unique ID
                        "name": display_name,
                        "description": description,
                        "cardImageUrl": card_image_url
                    })
                else:
                    logger.log_warning(f"World card image not found for world: {world_name} at {card_image_path}")
                    # Optionally include worlds even without a card image? For now, only include those with cards.
                    # worlds_data.append({
                    #     "id": world_name,
                    #     "name": display_name,
                    #     "description": description,
                    #     "cardImageUrl": None # Indicate no image
                    # })


        logger.log_step(f"Found {len(worlds_data)} worlds with card images.")
        return JSONResponse(status_code=200, content=worlds_data)

    except Exception as e:
        logger.log_error(f"Error listing worlds: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error while listing worlds.")
# --- END NEW ENDPOINT ---

# --- NEW ENDPOINT TO SERVE MAIN WORLD CARD ---
@app.get("/api/worlds/{world_name}/card")
async def get_world_card_image(world_name: str):
    """Serve the main card image for a specific world."""
    try:
        # Sanitize world name
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise HTTPException(status_code=400, detail="Invalid world name.")

        worlds_dir = Path("worlds")
        file_path = worlds_dir / safe_world_name / "world_card.png" # Fixed name

        if not file_path.is_file():
            logger.log_warning(f"Main world card image not found at: {file_path}")
            # Optionally, return a default image or 404
            raise HTTPException(status_code=404, detail="Main world card image not found")

        logger.log_step(f"Serving main world card image from: {file_path}")
        return FileResponse(file_path)

    except HTTPException as http_exc:
        logger.log_error(f"HTTP error serving main world card image: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error serving main world card image for '{world_name}': {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error while serving image.")
# --- END NEW ENDPOINT ---

        uploads_dir = Path("uploads")
        file_path = uploads_dir / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Image not found")
            
        return FileResponse(file_path)
    except Exception as e:
        logger.log_error(f"Error serving image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/api/generate-greeting")
async def generate_greeting(request: Request):
    """Generate a greeting for a character using the existing generation system."""
    try:
        # Get request data
        data = await request.json()
        
        character_data = data.get('character_data')
        api_config = data.get('api_config')
        
        if not character_data or not api_config:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Missing character data or API configuration"
                }
            )
        
        # --- Align with Chat Generation Logic ---
        
        # Extract character info
        char_data = character_data.get('data', {})
        char_name = char_data.get('name', 'Character')
        
        logger.log_step(f"Generating greeting for character: {char_name}")

        # 1. Get Template (similar to /api/generate)
        template_id = api_config.get('templateId', 'mistral') # Default to mistral
        # Get all templates and find the one with the matching ID
        all_templates = template_handler.get_all_templates()
        template = next((t for t in all_templates if t.get('id') == template_id), None)
        if not template:
            logger.log_warning(f"Template '{template_id}' not found in available templates, using default structure.")
            # Define a basic default template structure if lookup fails
            template = {
                'memoryFormat': "{{system}}\nPersona: {{description}}\nPersonality: {{personality}}\n[Scenario: {{scenario}}]\n{{examples}}\n***",
                'userFormat': "[INST] {{content}} [/INST]",
                'assistantFormat': "{{char}}: {{content}}",
                'stopSequences': ["User:", "Human:", f"{char_name}:", "[INST]", "[/INST]"]
            }
            
        # Helper to replace variables in template strings
        def replace_vars(text, variables):
            for key, value in variables.items():
                text = text.replace(f"{{{{{key}}}}}", str(value) or '')
            return text

        # 2. Build Memory using Template Format
        memory_vars = {
            'system': char_data.get('system_prompt', ''),
            'description': char_data.get('description', ''),
            'personality': char_data.get('personality', ''),
            'scenario': char_data.get('scenario', ''),
            'examples': char_data.get('mes_example', '')
        }
        memory = replace_vars(template.get('memoryFormat', ''), memory_vars).strip()
        logger.log_step(f"Built memory context (length: {len(memory)})")

        # 3. Build Prompt (using a dedicated instruction, formatted with template structure)
        # Use the specialized instruction from the original endpoint
        greeting_instruction = f"""You are tasked with crafting a new, engaging first message for {char_name}. Your new message should be natural, distinctly in-character, and should not replicate the scenario of the current first message, while still matching its style, formatting, and relative length as a quality benchmark. Use the character's description, personality, and examples provided in the memory context. Craft a new introductory message that starts the conversation in a fresh and engaging way."""

        # Format the instruction like a user message in the template
        prompt_instruction_formatted = replace_vars(template.get('userFormat', '[INST] {{content}} [/INST]'), {'content': greeting_instruction})
        
        # Format the start of the assistant response
        assistant_start_formatted = replace_vars(template.get('assistantFormat', '{{char}}: {{content}}'), {'char': char_name, 'content': ''})

        # Combine memory, formatted instruction, and assistant start
        # Note: We don't include chat history for greeting generation
        prompt = f"{memory}\n{prompt_instruction_formatted}\n{assistant_start_formatted}".strip()
        logger.log_step(f"Built prompt (length: {len(prompt)})")

        # 4. Get Stop Sequences from Template
        stop_sequence = [seq.replace('{{char}}', char_name) for seq in template.get('stopSequences', [])]
        if not stop_sequence: # Add defaults if template is missing them
             stop_sequence = ["User:", "Human:", f"{char_name}:", "[INST]", "[/INST]", "</s>"]
        # Ensure common EOS tokens are present
        if "</s>" not in stop_sequence: stop_sequence.append("</s>")
        if "</s>" not in stop_sequence: stop_sequence.append("</s>")
        data = await request.json()
        character_data = data.get('character_data')
        
        if not character_data:
            raise HTTPException(status_code=400, detail="Character data is required")
            
        result = chat_handler.load_latest_chat(character_data)
        
        if not result:
            # Return a successful response with empty messages if no chat exists
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "messages": {"messages": [], "metadata": None}
                }
            )
            
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "messages": result
            }
        )
        
    except Exception as e:
        logger.log_error(f"Failed to load chat: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e),
                "messages": None
            }
        )

@app.post("/api/load-chat")
async def load_specific_chat(request: Request):
    """Load a specific chat by ID."""
    try:
        data = await request.json()
        character_data = data.get('character_data')
        chat_id = data.get('chat_id')
        
        if not character_data or not chat_id:
            raise HTTPException(status_code=400, detail="Missing required fields")
            
        result = chat_handler.load_chat(character_data, chat_id)
        
        if not result:
            return JSONResponse(
                status_code=404,
                content={
                    "success": False,
                    "message": "Chat not found"
                }
            )
            
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "messages": result
            }
        )
        
    except Exception as e:
        logger.log_error(f"Failed to load chat: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.post("/api/create-new-chat")
async def create_new_chat(request: Request):
    """Create a new empty chat for a character."""
    try:
        data = await request.json()
        character_data = data.get('character_data')
        
        if not character_data:
            raise HTTPException(status_code=400, detail="Character data is required")
            
        result = chat_handler.create_new_chat(character_data)
        
        if not result:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "message": "Failed to create new chat"
                }
            )
            
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "messages": result
            }
        )
        
    except Exception as e:
        logger.log_error(f"Error creating new chat: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to create new chat: {str(e)}"
            }
        )

@app.get("/api/list-chats")
async def list_chats(character_name: str):
    """List all chat sessions for a character."""
    try:
        # Create minimal character data object
        character_data = {
            "data": {
                "name": character_name
            }
        }
        
        chats = chat_handler.get_all_chats(character_data)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "chats": chats
            }
        )
        
    except Exception as e:
        logger.log_error(f"Error listing chats: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to list chats: {str(e)}"
            }
        )
    
@app.post("/api/save-chat")
async def save_chat_state(request: Request):
    """Save the current state of the chat."""
    try:
        data = await request.json()
        character_data = data.get('character_data')  # Changed from character_name
        messages = data.get('messages', [])
        lastUser = data.get('lastUser')
        api_info = data.get('api_info')  # Add API info parameter
        
        if not character_data:
            raise HTTPException(status_code=400, detail="Character data is required")
            
        # Pass API info to chat_handler
        success = chat_handler.save_chat_state(character_data, messages, lastUser, api_info)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": success,
                "message": "Chat saved successfully" if success else "Failed to save chat"
            }
        )
        
    except Exception as e:
        logger.log_error(f"Error saving chat: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to save chat: {str(e)}"
            }
        )
    
@app.post("/api/generate")
async def generate_message(request: Request):
    """Handle streaming message generation request."""
    try:
        logger.log_step("Backend: Entered /api/generate endpoint") # <<< ADDED LOG
        data = await request.json()  # Get the full request body as JSON
        logger.log_step("Backend: Received /api/generate request data")

        # Extract API config and generation params
        api_config = data.get('api_config', {})
        generation_params = data.get('generation_params', {})
        
        # Log important configuration details
        logger.log_step(f"API Config Provider: {api_config.get('provider')}")
        logger.log_step(f"API URL: {api_config.get('url')}")
        logger.log_step(f"Using templateId: {api_config.get('templateId')}")
        
        # Log generation settings if present
        generation_settings = api_config.get('generation_settings', {})
        if generation_settings:
            logger.log_step(f"Generation settings received: {generation_settings}")
        
        # Validate API configuration
        if not api_config.get('url'):
            raise HTTPException(
                status_code=400,
                detail="API URL is required in the configuration"
            )
            
        # Check if API is enabled
        if not api_config.get('enabled', False):
            logger.log_warning("API not enabled in configuration, but attempting generation anyway")
        
        # Get template information if available
        if 'template' in api_config:
            # Handle legacy template field by converting to templateId
            logger.log_step("Converting legacy template field to templateId")
            api_config['templateId'] = api_config.pop('template')
        
        # Always prioritize templateId over template
        if not api_config.get('templateId'):
            logger.log_warning("No templateId found, defaulting to 'mistral'")
            api_config['templateId'] = 'mistral'  # Default template

        # Ensure generation_settings is passed correctly
        # Create a deep copy to avoid modifying the original
        processed_data = {
            'api_config': dict(api_config),
            'generation_params': dict(generation_params)
        }
        
        # Pass the processed request data to api_handler.stream_generate
        return StreamingResponse(
            api_handler.stream_generate(processed_data),
            media_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        )

    except Exception as e:
        logger.log_error(f"Error in stream generation: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/test-connection")
async def test_api_connection(request: Request):
    """Test connection to an API endpoint with improved template handling."""
    try:
        # Get request data and log it
        data = await request.json()
        logger.log_step(f"Testing API connection with data: {data}")
        
        url = data.get('url')
        api_key = data.get('apiKey')
        provider = data.get('provider')
        model = data.get('model')
        template_id = data.get('templateId')  # Now properly using templateId
        
        if not url:
            logger.log_warning("No URL provided")
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "URL is required"}
            )
        
        # Log the connection attempt details
        logger.log_step(f"Attempting connection to: {url}")
        logger.log_step(f"Provider: {provider}")
        logger.log_step(f"Model: {model}")
        logger.log_step(f"Template ID: {template_id}")
        
        # Ensure URL has protocol
        if not url.startswith(('http://', 'https://')):
            url = f'http://{url}'
        
        # Add trailing /v1/chat/completions if not present
        if not url.endswith('/v1/chat/completions'):
            url = url.rstrip('/') + '/v1/chat/completions'
            
        logger.log_step(f"Final URL: {url}")
        
        # Prepare headers
        headers = {
            'Content-Type': 'application/json'
        }
        
        if api_key:
            if provider == 'OpenAI':
                headers['Authorization'] = f'Bearer {api_key}'
            elif provider == 'Claude':
                headers['x-api-key'] = api_key
            elif provider == 'Gemini':
                headers['x-goog-api-key'] = api_key
                
        logger.log_step(f"Headers prepared: {headers}")
        
        # Prepare test message
        test_data = {
            "messages": [
                {"role": "user", "content": "Hi"}
            ],
            "max_tokens": 10,
            "temperature": 0.7
        }
        
        # Add model if provided
        if model:
            test_data["model"] = model
            
        logger.log_step(f"Test data prepared: {test_data}")
        
        # Make the test request
        response = requests.post(
            url,
            headers=headers,
            json=test_data,
            timeout=10
        )
        
        logger.log_step(f"Response status: {response.status_code}")
        
        try:
            response_data = response.json()
            logger.log_step(f"Response data: {response_data}")
        except:
            logger.log_warning("Could not parse response as JSON")
            response_data = None
        
        if response.status_code == 200:
            logger.log_step("Connection test successful")
            
            # Get model info
            model_info = {
                "id": response_data.get("model") or response_data.get("id") or model or "unknown",
                "name": response_data.get("model_name") or response_data.get("name") or response_data.get("model") or provider
            }
            
            # Try to detect template from response content
            detected_template = None
            if response_data and response_data.get("choices") and len(response_data["choices"]) > 0:
                choice = response_data["choices"][0]
                content = choice.get("message", {}).get("content") or choice.get("text", "")
                
                # Super simple detection - look for common template markers
                if "<|im_start|>" in content or "<|im_end|>" in content:
                    detected_template = "chatml"
                elif "[/INST]" in content:
                    detected_template = "mistral"
                elif "<|start_header_id|>" in content:
                    detected_template = "llama3"
                
                logger.log_step(f"Detected template: {detected_template}")
            
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "Connection successful",
                    "model": model_info,
                    "detected_template": detected_template,
                    "timestamp": time.time()
                }
            )
        else:
            error_msg = "Connection failed"
            if response_data and 'error' in response_data:
                error_msg = f"{error_msg}: {response_data['error']}"
            
            logger.log_warning(f"Connection test failed: {error_msg}")
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": error_msg,
                    "timestamp": time.time()
                }
            )
            
    except Exception as e:
        logger.log_error(f"API connection test error: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e),
                "timestamp": time.time()
            }
        )

@app.post("/api/debug-png")
async def debug_png_metadata(file: UploadFile = File(...)):
    """Debug endpoint to analyze PNG metadata"""
    try:
        logger.log_step(f"Analyzing PNG file: {file.filename}")
        content = await file.read()
        debug_info = png_debug.debug_png_metadata(content)
        
        logger.log_step("Debug analysis completed")
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "debug_info": debug_info
            }
        )
    except Exception as e:
        logger.log_error(f"PNG debug analysis failed: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e)
            }
        )


@app.post("/api/validate-directory")
async def validate_directory(request: Request):
    """Validate if a directory exists and contains PNG files."""
    try:
        data = await request.json()
        directory = data.get('directory')
        
        if not directory:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "No directory provided"
                }
            )
            
        # Convert to Path and resolve
        dir_path = Path(directory).resolve()
        
        # Check if directory exists
        if not dir_path.exists():
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Directory does not exist"
                }
            )
            
        if not dir_path.is_dir():
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Path is not a directory"
                }
            )
            
        # Check for PNG files
        png_files = list(dir_path.glob("*.png"))
        if not png_files:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "No PNG files found in directory"
                }
            )
            
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"Found {len(png_files)} PNG files",
                "directory": str(dir_path)
            }
        )
        
    except Exception as e:
        logger.log_error(f"Error validating directory: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.get("/api/settings")
async def get_settings():
    """Get all settings."""
    try:
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "settings": settings_manager.settings
            }
        )
    except Exception as e:
        logger.log_error(f"Error getting settings: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.post("/api/settings")
async def update_settings(request: Request):
    """Update settings with special handling for APIs and templateId."""
    try:
        data = await request.json()
        logger.log_step(f"Received settings update request: {data}")

        # Validate incoming settings for direct updates
        valid_settings = ["character_directory", "save_to_character_directory",
                         "last_export_directory", "theme"]

        # Filter out any unexpected settings for direct settings
        filtered_data = {k: v for k, v in data.items() if k in valid_settings}

        # Handle character_directory setting specifically (existing logic)
        if 'character_directory' in filtered_data:
            directory = filtered_data['character_directory']
            logger.log_step(f"Validating directory: {directory}")
            exists = os.path.exists(directory) if directory else True
            logger.log_step(f"Directory exists: {exists}")
            if directory and not exists:
                logger.log_step("Directory validation failed")
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "message": f"Directory does not exist: {directory}"
                    }
                )
            if not directory:
                filtered_data['save_to_character_directory'] = False
            logger.log_step("Directory validation passed")

        # --- API SETTINGS HANDLING ---
        api_update_success = True
        if 'apis' in data:
            # Use the special handler for APIs directly from settings_manager
            api_update_success = settings_manager.update_settings_with_apis(data)
            
            if not api_update_success:
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": "Failed to update API settings"
                    }
                )
            
            # Update api.enabled based on the first API's enabled state
            if data.get('apis'):
                first_api_key = next(iter(data['apis']))
                first_api = data['apis'][first_api_key]
                
                # Get current API settings
                current_api = settings_manager.settings.get('api', {})
                
                # Update enabled state while keeping other fields
                updated_api = {
                    **current_api,
                    'enabled': first_api.get('enabled', False)
                }
                
                # Update the api settings directly
                settings_manager.update_setting('api', updated_api)
        else:
            logger.log_warning("No 'apis' key in settings data")

        # --- UPDATE OTHER VALIDATED SETTINGS ---
        logger.log_step("Updating other settings...")
        other_settings_success = all(
            settings_manager.update_setting(key, value)
            for key, value in filtered_data.items()
        )

        # Overall success based on API settings update and other settings updates
        success = api_update_success and other_settings_success

        logger.log_step(f"Settings update success: {success}")
        logger.log_step(f"**Current settings after update:** {settings_manager.settings}")
        if success:
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "Settings updated successfully",
                    "settings": settings_manager.settings
                }
            )
        else:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "message": "Failed to update one or more settings"
                }
            )

    except Exception as e:
        logger.log_error(f"Error updating settings: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )


@app.get("/api/character-image/{path:path}")
async def get_character_image(path: str):
    """Serve character PNG files from any directory."""
    try:
        file_path = Path(path)
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Image not found")
            
        return FileResponse(file_path)
        
    except Exception as e:
        logger.log_error(f"Error serving character image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/characters")
async def get_characters(directory: str):
    """List character files in the specified directory."""
    try:
        # Convert to absolute path if relative
        directory_path = Path(directory).resolve()
        
        logger.log_step(f"Scanning directory: {directory_path}")
        
        if not directory_path.exists():
            logger.log_step(f"Directory not found: {directory_path}")
            return {
                "exists": False,
                "message": "Directory not found",
                "files": []
            }
            
        if not directory_path.is_dir():
            logger.log_step(f"Not a directory: {directory_path}")
            return {
                "exists": False,
                "message": "Not a directory",
                "files": []
            }
            
        # List all PNG files
        png_files = []
        for file in directory_path.glob("*.png"):
            png_files.append({
                "name": file.stem,
                "path": str(file),
                "size": file.stat().st_size,
                "modified": file.stat().st_mtime
            })
            
        # Sort alphabetically by name
        png_files.sort(key=lambda x: x["name"].lower())
        
        logger.log_step(f"Found {len(png_files)} PNG files")
        
        return {
            "exists": True,
            "message": "Successfully scanned directory",
            "directory": str(directory_path),
            "files": png_files
        }
        
    except Exception as e:
        logger.log_error(f"Error scanning directory: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to scan directory: {str(e)}"
        )

@app.get("/api/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "message": "Server is running"}

@app.get("/api/templates")
async def get_templates():
    """Get all available templates."""
    try:
        templates = template_handler.get_all_templates()
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "templates": templates
            }
        )
    except Exception as e:
        logger.log_error(f"Error getting templates: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.get("/api/users")
async def get_users():
    """Get all available users."""
    try:
        # Define the users directory (typically in the same location as characters)
        users_dir = Path(__file__).parent.parent / "frontend" / "users"
        if not users_dir.exists():
            users_dir.mkdir(parents=True, exist_ok=True)
            logger.log_step(f"Created users directory: {users_dir}")
        
        # List all PNG files in the users directory
        users = []
        for file_path in users_dir.glob("*.png"):
            users.append({
                "name": file_path.stem,
                "path": str(file_path),
                "size": file_path.stat().st_size,
                "modified": file_path.stat().st_mtime
            })
        
        # Sort alphabetically by name
        users.sort(key=lambda x: x["name"].lower())
        
        logger.log_step(f"Found {len(users)} users")
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "users": users
            }
        )
    except Exception as e:
        logger.log_error(f"Error getting users: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.get("/api/user-image/serve/{filename}")
async def serve_user_image(filename: str):
    """Serve a user image file."""
    try:
        # Define the users directory
        users_dir = Path(__file__).parent.parent / "frontend" / "users"
        file_path = users_dir / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="User image not found")
            
        return FileResponse(file_path)
        
    except Exception as e:
        logger.log_error(f"Error serving user image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/user-image/create")
async def create_user_image(file: UploadFile = File(...), metadata: str = Form(...)):
    """Create a new user image with metadata."""
    try:
        # Parse metadata
        metadata_dict = json.loads(metadata)
        
        # Get user name from metadata
        user_name = metadata_dict.get("data", {}).get("name", "Unknown")
        if not user_name:
            raise HTTPException(status_code=400, detail="User name is required")
            
        # Clean filename
        safe_name = re.sub(r'[<>:"/\\|?*]', '_', user_name)
        filename = f"{safe_name}.png"
        
        # Define the users directory
        users_dir = Path(__file__).parent.parent / "frontend" / "users"
        users_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename if file exists
        file_path = users_dir / filename
        base_name = file_path.stem
        extension = file_path.suffix
        counter = 1
        while file_path.exists():
            file_path = users_dir / f"{base_name}_{counter}{extension}"
            counter += 1
            
        # Save the file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
            
        logger.log_step(f"Created user image: {file_path}")
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"User image created successfully",
                "filename": file_path.name
            }
        )
        
    except Exception as e:
        logger.log_error(f"Error creating user image: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.delete("/api/user/{filename}")
async def delete_user(filename: str):
    """Delete a user image file."""
    try:
        # Define the users directory
        users_dir = Path(__file__).parent.parent / "frontend" / "users"
        file_path = users_dir / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="User image not found")
            
        # Delete the file
        file_path.unlink()
        
        logger.log_step(f"Deleted user image: {file_path}")
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"User image deleted successfully"
            }
        )
        
    except Exception as e:
        logger.log_error(f"Error deleting user image: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """Handle image upload for rich text editor."""
    try:
        # Check if file is an image
        content_type = file.content_type.lower()
        if not content_type.startswith('image/'):
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "File must be an image"}
            )
            
        # Check allowed image types
        allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if content_type not in allowed_types:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": f"Unsupported image format. Allowed: {', '.join(t.split('/')[1] for t in allowed_types)}"}
            )
        
        # Generate a unique filename
        filename = f"{uuid.uuid4()}.{file.filename.split('.')[-1]}"
        
        # Create uploads directory if it doesn't exist
        uploads_dir = Path("uploads")
        uploads_dir.mkdir(parents=True, exist_ok=True)
        
        file_path = uploads_dir / filename
        
        # Read file content
        content = await file.read()
        
        # Write file to disk
        with open(file_path, "wb") as f:
            f.write(content)
            
        # Return success with URL for TipTap to use
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "url": f"/api/uploads/{filename}"
            }
        )
    except Exception as e:
        logger.log_error(f"Error uploading image: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e)}
        )

@app.post("/api/upload-png")
async def upload_png(file: UploadFile = File(...)):
    """Handle PNG upload with metadata extraction."""
    try:
        logger.log_step(f"Processing uploaded file: {file.filename}")
        content = await file.read()
        logger.log_step(f"File size: {len(content)} bytes")
        
        # Add temporary diagnostic for debugging specific PNGs
        logger.log_step("Using improved PNG metadata handler")
        
        # Extract metadata
        logger.log_step("Reading PNG metadata")
        raw_metadata = png_handler.read_metadata(content)
        
        # Add better debugging to see what's happening
        logger.log_step(f"Extracted metadata type: {type(raw_metadata)}")
        if raw_metadata:
            logger.log_step(f"Metadata keys: {list(raw_metadata.keys()) if isinstance(raw_metadata, dict) else 'Not a dict'}")
            if isinstance(raw_metadata, dict) and 'data' in raw_metadata:
                logger.log_step(f"Found 'data' key, nested keys: {list(raw_metadata['data'].keys())}")
        else:
            logger.log_step("No metadata extracted (raw_metadata is empty)")
        
        if not raw_metadata:
            logger.log_step("No metadata found, creating empty character")
            raw_metadata = validator.create_empty_character()
        else:
            logger.log_step("Raw metadata structure:")
            logger.log_step(json.dumps(raw_metadata, indent=2)[:500] + "..." if len(json.dumps(raw_metadata)) > 500 else json.dumps(raw_metadata))
            
            # If this is Backyard format (has 'character' field), pass directly to validator
            if 'character' in raw_metadata:
                logger.log_step("Detected Backyard.ai format")
                # Extract just the character data for validator
                character_data = raw_metadata['character']
                # Convert lore items if present
                lore_entries = []
                if 'loreItems' in character_data:
                    for item in character_data['loreItems']:
                        entry = {
                            'keys': item['key'].split(','),
                            'content': item['value']
                        }
                        lore_entries.append(entry)

                v2_data = {
                    "data": {
                        "name": character_data.get('aiName') or character_data.get('aiDisplayName') or '',
                        "description": character_data.get('aiPersona', ''),
                        "scenario": character_data.get('scenario', ''),
                        "first_mes": character_data.get('firstMessage', ''),
                        "mes_example": character_data.get('customDialogue', ''),
                        "system_prompt": character_data.get('basePrompt', ''),
                        "character_book": {
                            "entries": lore_entries,
                            "name": "Imported Lore"
                        }
                    }
                }
                raw_metadata = v2_data
                logger.log_step("Converted to V2 structure:")
                logger.log_step(json.dumps(raw_metadata, indent=2)[:500] + "..." if len(json.dumps(raw_metadata)) > 500 else json.dumps(raw_metadata))
        
        # Always validate with our V2 validator
        logger.log_step("Running validator.normalize...")
        validated_metadata = validator.normalize(raw_metadata)
        
        # Check if metadata was correctly normalized
        if validated_metadata:
            logger.log_step("Successfully validated metadata")
            char_name = validated_metadata.get('data', {}).get('name', 'Unknown')
            logger.log_step(f"Validated character name: {char_name}")
            
            # Log structure of validated metadata
            if 'data' in validated_metadata:
                logger.log_step(f"Validated data keys: {list(validated_metadata['data'].keys())}")
                if 'character_book' in validated_metadata['data']:
                    num_entries = len(validated_metadata['data']['character_book'].get('entries', []))
                    logger.log_step(f"Character book entries: {num_entries}")
        else:
            logger.log_step("Validation failed, returned empty result")
        
        return {
            "success": True,
            "metadata": validated_metadata,
        }
        
    except Exception as e:
        logger.log_error(f"Upload failed: {str(e)}")
        logger.log_error(traceback.format_exc())  # Add stack trace for more info
        return {"success": False, "error": str(e)}

@app.post("/api/save-png")
async def save_png(
    file: UploadFile = File(...),
    metadata: str = Form(...),
    save_directory: Optional[str] = Form(None),
):
    """Handle PNG save with validation."""
    try:
        content = await file.read()
        metadata_dict = json.loads(metadata)
        # Validate metadata before saving
        validated_metadata = validator.normalize(metadata_dict)
        char_name = validated_metadata.get("data", {}).get("name", "character")
        
        # Clean filename
        safe_name = re.sub(r'[<>:"/\\|?*]', '_', char_name)
        filename = f"{safe_name}.png"
        
        if save_directory:
            try:
                save_path = Path(save_directory) / filename
                logger.log_step(f"Attempting to save to: {save_path}")
                
                # Generate unique filename if file exists
                base_name = save_path.stem
                extension = save_path.suffix
                counter = 1
                while save_path.exists():
                    save_path = Path(save_directory) / f"{base_name} ({counter}){extension}"
                    counter += 1
                
                logger.log_step(f"Final save path: {save_path}")
                
                # Try writing file with unique name using validated metadata
                updated_content = png_handler.write_metadata(content, validated_metadata)

                with open(save_path, 'wb') as f:
                    f.write(updated_content)
                
                if not save_path.exists():
                    logger.log_error(f"File was not created: {save_path}")
                    raise HTTPException(status_code=500, detail="File write failed")
                    
                file_size = save_path.stat().st_size
                logger.log_step(f"File written successfully. Size: {file_size} bytes")
                
                return Response(content=updated_content, media_type="image/png")
                
            except PermissionError as pe:
                logger.log_error(f"Permission denied: {str(pe)}")
                raise HTTPException(status_code=403, detail=str(pe))
                
            except Exception as e:
                logger.log_error(f"Save failed: {str(e)}")
                logger.log_error(traceback.format_exc())
                raise HTTPException(status_code=500, detail=str(e))
        
        # If no directory specified, return validated content for browser download
        return Response(content=updated_content, media_type="image/png")
        
    except Exception as e:
        logger.log_error(f"Unexpected error: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/import-backyard")
async def import_backyard(request: Request):
    """Import character from Backyard.ai URL."""
    try:
        data = await request.json()
        url = data.get('url')
        
        if not url:
            return JSONResponse(
                status_code=400, 
                content={"success": False, "message": "No URL provided"}
            )
        
        metadata, preview_url = backyard_handler.import_character(url)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "metadata": metadata,
                "imageUrl": preview_url
            }
        )
    except Exception as e:
        logger.log_error(f"Import failed: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e)}
        )

@app.post("/api/extract-lore")
async def extract_lore(file: UploadFile = File(...)):
    """Extract lore items from a PNG character card."""
    try:
        content = await file.read()
        logger.log_step("Reading PNG metadata")
        metadata = png_handler.read_metadata(content)
        
        if not metadata:
            logger.log_warning("No character data found in PNG")
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "No character data found in PNG"}
            )
        
        # Log the metadata structure
        logger.log_step(f"Metadata structure: {json.dumps(metadata, indent=2)[:500]}...")
        
        # Extract lore items from V2 format
        lore_items = []
        if metadata.get('spec') == 'chara_card_v2':
            logger.log_step("Found V2 spec character")
            if 'data' in metadata and 'character_book' in metadata['data']:
                logger.log_step("Extracting from data.character_book")
                lore_items = metadata['data']['character_book'].get('entries', [])
            elif 'character_book' in metadata:
                logger.log_step("Extracting from character_book")
                lore_items = metadata['character_book'].get('entries', [])
                
        logger.log_step(f"Found {len(lore_items)} lore items")
        logger.log_step(f"First item sample: {json.dumps(lore_items[0] if lore_items else None, indent=2)}")
            
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "loreItems": lore_items
            }
        )
        
    except Exception as e:
        logger.log_error(f"Error extracting lore: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e)}
        )

@app.post("/api/list-character-chats")
async def list_character_chats(request: Request):
    """List all available chat files for a character."""
    try:
        data = await request.json()
        character_data = data.get('character_data')
        
        if not character_data:
            raise HTTPException(status_code=400, detail="Character data is required")
            
        chat_list = chat_handler.list_character_chats(character_data)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "chats": chat_list
            }
        )
        
    except Exception as e:
        logger.log_error(f"Error listing character chats: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to list character chats: {str(e)}"
            }
        )

@app.post("/api/load-latest-chat")
async def load_latest_chat(request: Request):
    """Load the most recent chat for a character."""
    try:
        data = await request.json()
        character_data = data.get('character_data')
        
        if not character_data:
            raise HTTPException(status_code=400, detail="Character data is required")
            
        result = chat_handler.load_latest_chat(character_data)
        
        if not result:
            # Return a successful response with empty messages if no chat exists
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "messages": {"messages": [], "metadata": None}
                }
            )
            
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "messages": result
            }
        )
        
    except Exception as e:
        logger.log_error(f"Failed to load latest chat: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e),
                "messages": None
            }
        )

@app.post("/api/append-chat-message")
async def append_chat_message(request: Request):
    """Append a single message to the current chat."""
    try:
        data = await request.json()
        character_data = data.get('character_data')
        message = data.get('message')
        
        if not character_data or not message:
            raise HTTPException(status_code=400, detail="Character data and message are required")
            
        success = chat_handler.append_message(character_data, message)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": success,
                "message": "Message appended successfully" if success else "Failed to append message"
            }
        )
        
    except Exception as e:
        logger.log_error(f"Failed to append message: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )
        
if __name__ == "__main__":
    # Check for command-line arguments
    parser = argparse.ArgumentParser(description="CardShark Character Card Editor")
    parser.add_argument("-batch", "--batch", action="store_true", help="Run in batch processing mode")
    parser.add_argument("-b", "--backup-dir", type=str, help="Path to backup directory (required for batch mode)")
    parser.add_argument("-q", "--quiet", action="store_true", help="Run in quiet mode (minimal output)")
    args, unknown = parser.parse_known_args()
    
    # If batch mode is enabled, run the batch processor instead
    if args.batch:
        try:
            logger.log_step("Running in batch mode")
            
            # Import and run the batch converter
            from backend.batch_converter import main as batch_main
            batch_main()
            
            # Exit after batch processing completes
            sys.exit(0)
            
        except ImportError:
            print("Error: Batch converter module not found")
            logger.log_error("Batch converter module not found")
            sys.exit(1)
        except Exception as e:
            print(f"Error in batch mode: {str(e)}")
            logger.log_error(f"Error in batch mode: {str(e)}")
            logger.log_error(traceback.format_exc())
            sys.exit(1)
    
    # Normal web server mode
    try:
        frontend_path = get_frontend_path()
        if (frontend_path.exists()):
            # Serve everything at "/", including index.html automatically
            app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="static")
            logger.log_step(f"Mounted frontend files from {frontend_path}")
            
            # Add the browser opening functionality
            def open_browser():
                """Open browser to application URL"""
                logger.log_step("Opening browser to application URL")
                webbrowser.open('http://localhost:9696')
            
            # Schedule browser opening after a short delay
            Timer(1.5, open_browser).start()
            logger.log_step("Scheduled browser opening")
            
            # Start the server
            uvicorn.run(
                app,
                host="0.0.0.0",  # Force binding to all interfaces
                port=9696,
                log_level="info",
                workers=1
            )
            
        else:
            logger.log_warning(f"Frontend static files not found at {frontend_path}")
            raise FileNotFoundError(f"Frontend directory not found: {frontend_path}")

    except Exception as e:
        logger.log_error(f"Server startup failed: {str(e)}")
        input("\nPress Enter to exit...")  # Allow user to see error in EXE context
        sys.exit(1)