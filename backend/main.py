# backend/main.py
# Main FastAPI application file for CardShark
import sys
import os
import argparse
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Response, Request # type: ignore
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse # type: ignore
from fastapi.staticfiles import StaticFiles # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
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
from typing import Optional
import webbrowser
from threading import Timer
import time

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

# API Endpoints
@app.get("/api/backgrounds")
async def get_backgrounds():
    """List all background images."""
    try:
        backgrounds = background_handler.get_all_backgrounds()
        modified_backgrounds = [
            {**background}
            for background in backgrounds
        ]
        print(f"Current backgrounds: {modified_backgrounds}")
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "backgrounds": modified_backgrounds
            }
        )
    except Exception as e:
        logger.log_error(f"Error listing backgrounds: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.post("/api/backgrounds/upload")
async def upload_background(file: UploadFile = File(...)):
    """Upload a new background image."""
    try:
        # Verify the file is an image including GIF
        content_type = file.content_type.lower()
        if not content_type.startswith('image/'):
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "File must be an image"
                }
            )
            
        # Check against allowed image types
        allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if content_type not in allowed_types:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": f"Unsupported image format. Allowed formats: {', '.join(t.split('/')[1] for t in allowed_types)}"
                }
            )
        
        # Read file content
        content = await file.read()
        result = background_handler.save_background(content, file.filename)
        
        if not result:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Invalid image file"
                }
            )
        
        # For GIFs, add an isAnimated flag in the response
        if file.filename.lower().endswith('.gif'):
            result["isAnimated"] = True
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "background": result
            }
        )
    except Exception as e:
        logger.log_error(f"Error uploading background: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.get("/api/backgrounds/{filename}")
async def get_background_image(filename: str):
    """Serve a background image."""
    try:
        logger.log_step(f"Requested background image: {filename}")
        
        # Use the background_handler's directory path for consistency
        file_path = background_handler.backgrounds_dir / filename
        
        logger.log_step(f"Looking for file at: {file_path}")
        if not file_path.exists():
            logger.log_warning(f"Background image not found: {file_path}")
            raise HTTPException(status_code=404, detail="Image not found")
            
        return FileResponse(file_path)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error serving background image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/backgrounds/{filename}")
async def delete_background(filename: str):
    """Delete a background image."""
    try:
        success = background_handler.delete_background(filename)
        
        if not success:
            return JSONResponse(
                status_code=404,
                content={
                    "success": False,
                    "message": "Background not found"
                }
            )
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Background deleted successfully"
            }
        )
    except Exception as e:
        logger.log_error(f"Error deleting background: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.get("/api/templates")
async def get_templates():
    """Get all custom templates."""
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
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.post("/api/templates")
async def save_templates(request: Request):
    """Save templates to the file system."""
    try:
        data = await request.json()
        templates = data.get('templates', [])
        
        if not templates:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "No templates provided"
                }
            )
        
        success = template_handler.save_templates(templates)
        
        return JSONResponse(
            status_code=200 if success else 500,
            content={
                "success": success,
                "message": "Templates saved successfully" if success else "Failed to save templates"
            }
        )
    except Exception as e:
        logger.log_error(f"Error saving templates: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.delete("/api/templates/{template_id}")
async def delete_template(template_id: str):
    """Delete a template from the file system."""
    try:
        success = template_handler.delete_template(template_id)
        
        return JSONResponse(
            status_code=200 if success else 404,
            content={
                "success": success,
                "message": "Template deleted successfully" if success else "Template not found"
            }
        )
    except Exception as e:
        logger.log_error(f"Error deleting template: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.post("/api/templates/{template_id}")
async def save_template(template_id: str, request: Request):
    """Save a specific template to the file system."""
    try:
        data = await request.json()
        template = data.get('template')
        
        if not template:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "No template provided"
                }
            )
        
        # Ensure the template ID matches the URL parameter
        template['id'] = template_id
        
        success = template_handler.save_template(template)
        
        return JSONResponse(
            status_code=200 if success else 500,
            content={
                "success": success,
                "message": "Template saved successfully" if success else "Failed to save template"
            }
        )
    except Exception as e:
        logger.log_error(f"Error saving template: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )
    
@app.get("/api/context-window")
async def get_context_window():
    """Get the saved context window data."""
    try:
        # Get base directory
        base_dir = Path(sys._MEIPASS) if getattr(sys, 'frozen', False) else Path.cwd()
        
        # Create context directory if it doesn't exist
        context_dir = base_dir / 'context'
        context_dir.mkdir(parents=True, exist_ok=True)
        
        # Context file path
        context_file = context_dir / 'latest_context.json'
        
        if not context_file.exists():
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "context": None
                }
            )
        
        # Read and return the context data
        with open(context_file, 'r', encoding='utf-8') as f:
            context_data = json.load(f)
            
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "context": context_data
            }
        )
        
    except Exception as e:
        logger.log_error(f"Error reading context window: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.post("/api/context-window")
async def save_context_window(request: Request):
    """Save context window data."""
    try:
        data = await request.json()
        context_data = data.get('context')
        
        if context_data is None:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "No context data provided"
                }
            )
        
        # Get base directory
        base_dir = Path(sys._MEIPASS) if getattr(sys, 'frozen', False) else Path.cwd()
        
        # Create context directory if it doesn't exist
        context_dir = base_dir / 'context'
        context_dir.mkdir(parents=True, exist_ok=True)
        
        # Context file path
        context_file = context_dir / 'latest_context.json'
        
        # Write the context data
        with open(context_file, 'w', encoding='utf-8') as f:
            json.dump(context_data, f, indent=2)
            
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Context saved successfully"
            }
        )
        
    except Exception as e:
        logger.log_error(f"Error saving context window: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.delete("/api/context-window")
async def delete_context_window():
    """Delete saved context window data."""
    try:
        # Get base directory
        base_dir = Path(sys._MEIPASS) if getattr(sys, 'frozen', False) else Path.cwd()
        
        # Context file path
        context_file = base_dir / 'context' / 'latest_context.json'
        
        if context_file.exists():
            context_file.unlink()
            
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Context deleted successfully"
            }
        )
        
    except Exception as e:
        logger.log_error(f"Error deleting context window: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e)
            }
        )

@app.get("/api/users_dir")  # Define the route
def get_users_dir() -> Path:  # Define the function
    """Get the users directory path."""
    # Determine base directory based on environment
    if getattr(sys, 'frozen', False):
        # Running as PyInstaller bundle
        base_dir = Path(sys.executable).parent
    else:
        # Running from source
        base_dir = Path.cwd()

    # Create users directory if it doesn't exist
    users_dir = base_dir / 'users'
    users_dir.mkdir(parents=True, exist_ok=True)

    logger.log_step(f"Users directory: {users_dir}")
    return users_dir

# Then update the user image routes to use this helper function

@app.get("/api/users")
async def get_users():
    """List user profiles from the users directory."""
    try:
        users_dir = get_users_dir()
        
        logger.log_step(f"Scanning users directory: {users_dir}")
        
        # List all PNG files in users directory
        png_files = []
        for file in users_dir.glob("*.png"):
            logger.log_step(f"Found user PNG: {file.name}")
            png_files.append({
                "name": file.stem,
                "filename": file.name,
                "path": str(file),
                "size": file.stat().st_size,
                "modified": file.stat().st_mtime
            })
            
        # Sort alphabetically by name
        png_files.sort(key=lambda x: x["name"].lower())
        
        logger.log_step(f"Found {len(png_files)} user profiles")
        
        return {
            "success": True,
            "users": png_files
        }
        
    except Exception as e:
        logger.log_error(f"Error scanning users: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to scan users: {str(e)}"
        )

@app.post("/api/user-image/create")
async def upload_user_image(
    file: UploadFile = File(...),
    metadata: str = Form(...)
):
    """Save a user profile image with metadata."""
    try:
        # Read file content
        content = await file.read()
        metadata_dict = json.loads(metadata)
        
        # Validate metadata
        validated_metadata = validator.normalize(metadata_dict)
        
        # Get users directory
        users_dir = get_users_dir()
        
        logger.log_step(f"Users directory: {users_dir}")  # Debug log

        # Generate safe filename from name
        name = validated_metadata.get("data", {}).get("name", "user")
        safe_name = re.sub(r'[<>:"/\\|?*]', '_', name)
        filename = f"{safe_name}.png"
        save_path = users_dir / filename
        
        # Handle filename conflicts with incrementing counter
        counter = 1
        while save_path.exists():
            save_path = users_dir / f"{safe_name}_{counter}.png"
            counter += 1
            
        logger.log_step(f"Saving user profile to: {save_path}")
        
        # Write metadata to PNG
        try:
            updated_content = png_handler.write_metadata(content, validated_metadata)
            
            with open(save_path, 'wb') as f:
                f.write(updated_content)
                
            if not save_path.exists():
                raise HTTPException(
                    status_code=500, 
                    detail="File write failed"
                )
                
            logger.log_step("Successfully saved user profile")
            
            # Return the filename and full path for debugging
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "filename": save_path.name,
                    "path": str(save_path),
                    "name": name
                }
            )
            
        except Exception as e:
            logger.log_error(f"Error writing PNG: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to write PNG: {str(e)}"
            )
                
    except Exception as e:
        logger.log_error(f"Error saving user profile: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

@app.get("/api/user-image/serve/{filename}")
async def get_user_image(filename: str):
    """Serve user profile images by filename only."""
    try:
        # Get users directory
        users_dir = get_users_dir()
        file_path = users_dir / filename

        logger.log_step(f"Attempting to serve user image: {file_path}")

        if not filename or filename == 'undefined':
            logger.log_error("Invalid filename requested")
            raise HTTPException(status_code=400, detail="Invalid filename")

        # Validate the file exists and is within users directory
        if not file_path.exists():
            logger.log_error(f"User image not found: {file_path}")
            raise HTTPException(status_code=404, detail="Image not found")
            
        if not file_path.is_file():
            logger.log_error(f"Not a file: {file_path}")
            raise HTTPException(status_code=404, detail="Not a file")
        
        logger.log_step(f"Serving user image file: {file_path}")
            
        # Serve the file
        return FileResponse(
            file_path,
            media_type="image/png",
            filename=filename
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error serving user image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/append-chat-message")
async def append_chat_message(request: Request):
    """Append a single message to the current chat."""
    try:
        data = await request.json()
        character_data = data.get('character_data')  # Changed from character_name
        message = data.get('message')
        
        if not character_data or not message:
            raise HTTPException(status_code=400, detail="Missing required fields")
            
        success = chat_handler.append_message(character_data, message)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": success,
                "message": "Message appended successfully" if success else "Failed to append message"
            }
        )
        
    except Exception as e:
        logger.log_error(f"Error appending message: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to append message: {str(e)}"
            }
        )

# Add these API routes to your main.py file

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
        data = await request.json()  # Get the full request body as JSON
        logger.log_step("Received generation request")

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
            logger.log_step(f"Found PNG: {file.name}")
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
            run_server(app, port=9696, local_only=False)  # Use the already imported run_server
            
        else:
            logger.log_warning(f"Frontend static files not found at {frontend_path}")
            raise FileNotFoundError(f"Frontend directory not found: {frontend_path}")

    except Exception as e:
        logger.log_error(f"Server startup failed: {str(e)}")
        input("\nPress Enter to exit...")  # Allow user to see error in EXE context
        sys.exit(1)