"""
@file main.py
@description Entry point for the FastAPI backend application. Configures middleware, routes, and startup/shutdown events.
@dependencies fastapi, uvicorn, various routers
@consumers Dockerfile, start scripts
"""
# backend/main.py
# Main application file for CardShark
import os
import sys
import traceback
import argparse
import urllib.parse
import glob
import uuid
import re
import uvicorn
import webbrowser
from pathlib import Path
from typing import Dict, Any, Optional, List
from threading import Timer

# Force import HTTP modules for PyInstaller
try:
    import h11
    import httptools
    import uvicorn.protocols.http.h11_impl
    import uvicorn.protocols.http.httptools_impl
    import _strptime # Fix for _strptime threading issue in PyInstaller builds
except ImportError as e:
    print(f"Warning: Failed to import HTTP modules: {e}")

# FastAPI imports
from fastapi import FastAPI, Request, HTTPException, UploadFile, File, Query, APIRouter
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse, StreamingResponse, RedirectResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Add a custom StaticFiles implementation to handle cross-drive paths
from starlette.staticfiles import StaticFiles as StarletteStaticFiles
from starlette.types import Scope, Receive, Send
import os
import anyio

# Extend StaticFiles to handle cross-drive paths
class CrossDriveStaticFiles(StarletteStaticFiles):
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Handle a request and return a response."""
        assert scope["type"] == "http"
        request = Request(scope)
        path = request.path_params.get("path", "")
        response = await self.get_response(path, scope)
        await response(scope, receive, send)

    async def get_response(self, path: str, scope: Scope):
        """Get a response for a given path."""
        if path.startswith("/"):
            path = path[1:]

        try:
            full_path, stat_result = await anyio.to_thread.run_sync(
                self.safe_lookup_path, path
            )
            return self.file_response(full_path, stat_result, scope)
        except (FileNotFoundError, PermissionError):
            return self.not_found(scope)

    def not_found(self, scope: Scope):
        """Return a 404 Not Found response."""
        if self.html:
            return HTMLResponse(content="Not Found", status_code=404)
        return PlainTextResponse(content="Not Found", status_code=404)
    
    def safe_lookup_path(self, path: str):
        """Modified lookup path that handles cross-drive paths."""
        try:
            full_path = os.path.join(self.directory, path)
            
            # Skip the path containment check if paths are on different drives
            if os.path.splitdrive(full_path)[0] != os.path.splitdrive(self.directory)[0]:
                if not os.path.exists(full_path):
                    raise FileNotFoundError()
            else:
                # If same drive, perform the normal security check
                if not os.path.exists(full_path):
                    raise FileNotFoundError()
                if os.path.commonpath([full_path, self.directory]) != self.directory:
                    raise PermissionError()
                    
            stat_result = os.stat(full_path)
            if stat_result.st_mode & 0o100000 == 0:
                raise FileNotFoundError()
                
            return full_path, stat_result
        except (FileNotFoundError, PermissionError) as exc:
            raise exc

# Internal modules/handlers
from backend.log_manager import LogManager
from backend.png_metadata_handler import PngMetadataHandler
from backend.png_debug_handler import PngDebugHandler
from backend.errors import CardSharkError, ErrorType
from backend.backyard_handler import BackyardHandler
from backend.settings_manager import SettingsManager
from backend.character_validator import CharacterValidator
from backend.api_handler import ApiHandler

from backend.template_handler import TemplateHandler
from backend.background_handler import BackgroundHandler
from backend.content_filter_manager import ContentFilterManager
from backend.lore_handler import LoreHandler
import backend.sql_models # Use sql_models.py instead of models.py to avoid package conflicts

# Import standardized response models and error handling
from backend.response_models import (
    HealthCheckResponse, 
    ErrorResponse, 
    STANDARD_RESPONSES,
    create_error_response,
    create_data_response
)
from backend.error_handlers import (
    CardSharkException,
    ValidationException,
    NotFoundException,
    ConfigurationException,
    APIException,
    register_exception_handlers,
    handle_generic_error
)
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

# API endpoint modules
from backend.chat_endpoints import router as chat_session_router # Router for ChatSession CRUD
# Import routers directly, no need for class instances
from backend.background_endpoints import router as background_router
from backend.room_card_endpoint import router as room_card_router
from backend.character_endpoints import router as character_router
from backend.dependencies import get_character_service_dependency # Import from new dependencies file
from backend.user_endpoints import router as user_router
from backend.settings_endpoints import router as settings_router
from backend.world_endpoints import router as world_router
from backend.template_endpoints import router as template_router  # Import the new template router
from backend.lore_endpoints import router as lore_router  # Import the lore router
from backend.room_endpoints import router as room_router # Import the room_router
from backend.npc_room_assignment_endpoints import router as npc_room_assignment_router # Import the new NPC-Room assignment router
# from backend.character_inventory_endpoints import router as character_inventory_router # REMOVED - functionality integrated into CharacterService
# from backend.world_chat_endpoints import router as world_chat_router # Removed, functionality merged into world_router

# Import koboldcpp handler & manager
from backend.koboldcpp_handler import router as koboldcpp_router

# Import user directory utilities functions
from backend.utils.user_dirs import get_users_dir # type: ignore

# Import various handlers
from backend.handlers.world_state_handler import WorldStateHandler
from backend.handlers.world_card_chat_handler import WorldCardChatHandler
from backend.world_asset_handler import WorldAssetHandler
from backend.world_card_handler import WorldCardHandler

# Global configuration
VERSION = "0.1.0"
DEBUG = os.environ.get("DEBUG", "").lower() in ("true", "1", "t")

# Initialize Database imports
from backend.database import init_db, SessionLocal, get_db # Import SessionLocal and get_db
from contextlib import asynccontextmanager
from backend.services.character_service import CharacterService # Import CharacterService
from backend.services.character_sync_service import CharacterSyncService # Import CharacterSyncService
from backend.services.user_profile_service import UserProfileService # Import UserProfileService
from sqlalchemy.orm import Session # For type hinting in dependency
from fastapi import Depends # For dependency injection

# Initialize core handlers first (needed for lifespan)
logger = LogManager()
settings_manager = SettingsManager(logger)
settings_manager._load_settings()
content_filter_manager = ContentFilterManager(logger)
validator = CharacterValidator(logger)
png_handler = PngMetadataHandler(logger)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    try:
        init_db()
        logger.log_info("Database tables initialised")        
        # Synchronize character directories
        # Initialize CharacterService and attach to app.state
        db_session_generator = SessionLocal # Pass the callable for CharacterService to manage its own sessions
        app.state.character_service = CharacterService(
            db_session_generator=db_session_generator,
            png_handler=png_handler,
            settings_manager=settings_manager,
            logger=logger,
            # character_indexing_service=character_indexing_service # Add this if CharacterService needs it
        )
        
        # Initialize World Handlers
        app.state.world_asset_handler = WorldAssetHandler(logger)
        app.state.world_card_handler = WorldCardHandler(
            character_service=app.state.character_service,
            asset_handler=app.state.world_asset_handler,
            logger=logger
        )
        
        # Synchronize character directories using the initialized service
        try:
            # app.state.character_service.sync_character_directories() # Deprecated method
            
            # Initialize and run the new CharacterSyncService
            character_sync_service = CharacterSyncService(
                db_session_generator=db_session_generator,
                png_handler=png_handler,
                settings_manager=settings_manager,
                logger=logger
            )
            app.state.character_sync_service = character_sync_service # Store for dependency injection if needed
            character_sync_service.sync_characters()
        except Exception as sync_exc:
            logger.log_error(f"Character sync failed: {sync_exc}")
            raise
        logger.log_info("Initial character directory synchronization complete.")
        
        # Initialize and run user profile synchronization
        try:
            user_profile_service = UserProfileService(
                db_session_generator=db_session_generator,
                logger=logger
            )
            app.state.user_profile_service = user_profile_service
            user_profile_service.sync_users_directory()
            logger.log_info("User profiles directory synchronization complete.")
        except Exception as user_sync_exc:
            logger.log_error(f"User profile sync failed: {user_sync_exc}")
            # Don't raise - user profiles are not critical for app startup
    except Exception as exc:
        logger.log_error(f"DB init or character sync failed: {exc}\n{traceback.format_exc()}")
        raise
    
    yield  # App is running
    
    # Shutdown (optional cleanup)
    logger.log_info("Application shutting down")

# Initialize FastAPI app with comprehensive metadata
description = """
## CardShark API 🃏

AI-powered character chat and world simulation platform providing comprehensive tools for interactive storytelling.

### Features

* **Character Management** - Create, import, and manage AI characters with rich metadata and chat capabilities
* **World Building** - Design immersive worlds with custom backgrounds, NPCs, and interactive environments  
* **Chat System** - Real-time streaming conversations with multiple AI providers (OpenAI, Claude, KoboldCPP, etc.)
* **Template System** - Customizable prompt templates for different conversation styles and scenarios
* **Content Filtering** - Advanced content moderation and safety controls
* **Room Management** - Create and manage different conversation spaces and contexts

### API Organization

All endpoints are organized under `/api/` with consistent patterns and comprehensive error handling.
"""

tags_metadata = [
    {
        "name": "health",
        "description": "System health and status monitoring",
    },
    {
        "name": "characters", 
        "description": "Character management operations including creation, import, and metadata handling",
    },
    {
        "name": "chat",
        "description": "Real-time chat operations with streaming support and session management",
    },
    {
        "name": "worlds",
        "description": "World building and simulation features including NPCs and environments",
    },
    {
        "name": "templates",
        "description": "Prompt template management for different conversation scenarios",
    },
    {
        "name": "settings",
        "description": "Application configuration and user preferences",
    },
    {
        "name": "backgrounds",
        "description": "Background image management for visual customization",
    },
    {
        "name": "rooms",
        "description": "Chat room and conversation space management",
    },
    {
        "name": "content-filters",
        "description": "Content moderation and filtering operations",
    },
    {
        "name": "lore",
        "description": "Lore and narrative element management",
    },
]

app = FastAPI(
    title="CardShark API",
    description=description,
    summary="AI-powered character chat and world simulation platform",
    version=VERSION,
    debug=DEBUG,
    lifespan=lifespan,
    openapi_tags=tags_metadata,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    contact={
        "name": "CardShark Development Team",
        "url": "https://github.com/your-org/cardshark",
    },
    license_info={
        "name": "MIT",
        "identifier": "MIT",
    },
)

# Store logger on app.state for access in dependencies
app.state.logger = logger

# Register global exception handlers
register_exception_handlers(app)

# Original database initialization block removed; moved to startup event.
# Create a dedicated router for health check
health_router = APIRouter(prefix="/api", tags=["health"])

@health_router.get("/health", response_model=HealthCheckResponse, responses=STANDARD_RESPONSES)
async def health_check():
    """Health check endpoint with standardized response."""
    return create_data_response({
        "status": "healthy",
        "version": VERSION,
        "service": "CardShark API"
    })

# Add CORS middleware to allow all origins (for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, this should be restricted
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Initialize Remaining Handlers ----------

# Remaining handler initialization
debug_handler = PngDebugHandler(logger)
backyard_handler = BackyardHandler(logger)
api_handler = ApiHandler(logger)

template_handler = TemplateHandler(logger)
background_handler = BackgroundHandler(logger)
background_handler.initialize_default_backgrounds() # Initialize default backgrounds
lore_handler = LoreHandler(logger, default_position=0) # Create LoreHandler for dependency injection
world_state_handler = WorldStateHandler(logger, settings_manager)

# Store handlers on app.state for access in dependencies
app.state.png_handler = png_handler
app.state.settings_manager = settings_manager

app.state.background_handler = background_handler # Store BackgroundHandler for dependency injection
app.state.content_filter_manager = content_filter_manager # Store ContentFilterManager for dependency injection
app.state.template_handler = template_handler # Store TemplateHandler for dependency injection
app.state.backyard_handler = backyard_handler # Store BackyardHandler for dependency injection
app.state.world_state_handler = world_state_handler # Store WorldStateHandler for dependency injection
app.state.lore_handler = lore_handler # Store LoreHandler for dependency injection
# app.state.logger is already set above

# Initialize the world card chat handler with explicit worlds directory
worlds_dir = Path("worlds")
if not worlds_dir.exists():
    worlds_dir.mkdir(parents=True, exist_ok=True)
logger.log_step(f"Initializing world chat handler with worlds directory: {worlds_dir.absolute()}")
world_card_chat_handler = WorldCardChatHandler(logger, worlds_path=worlds_dir)

# Store world card chat handler on app.state
app.state.world_card_chat_handler = world_card_chat_handler

# ---------- Initialize and register endpoints ----------
# NOTE: Removed initialization and registration of endpoint classes (ChatEndpoints, UserEndpoints, etc.)
# as routers are included directly below using app.include_router.
# Removed stray marker and duplicate comment block from previous failed diff

# Cleaned up duplicated lines from previous failed diffs

# Set up and include routers directly
# setup_background_router call removed as it's no longer needed
app.include_router(health_router) # Include the health check router
# app.include_router(chat_router) # This line is now handled by chat_session_router inclusion
app.include_router(koboldcpp_router)
app.include_router(room_card_router)
app.include_router(character_router)
app.include_router(user_router)
app.include_router(settings_router)
app.include_router(world_router)
app.include_router(template_router)  # Include the new template router
app.include_router(lore_router)  # Include the lore router
app.include_router(room_router) # Include the room_router
app.include_router(npc_room_assignment_router) # Include the new NPC-Room assignment router
# app.include_router(character_inventory_router) # REMOVED
# app.include_router(world_chat_router) # Removed, functionality merged into world_router
app.include_router(background_router)
app.include_router(chat_session_router) # Include the new chat session router

# ---------- FastAPI Dependency for Services ----------
# get_character_service_dependency is now imported from backend.dependencies

# Import content filter router
from backend.content_filter_endpoints import router as content_filter_router
app.include_router(content_filter_router)

# ---------- Direct routes that haven't been modularized yet ----------

@app.post("/api/generate")
async def generate(request: Request):
    """Generate a chat response using the LLM API with streaming."""
    try:
        logger.log_step("Received generation request at /api/generate")
        # Parse the request JSON
        request_data = await request.json()
        
        # Use the ApiHandler to stream the response
        return StreamingResponse(
            api_handler.stream_generate(request_data),
            media_type="text/event-stream"
        )
    except Exception as e:
        logger.log_error(f"Error in /api/generate endpoint: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500, 
            content={"error": f"Generation failed: {str(e)}"}
        )

@app.post("/api/generate-greeting")
async def generate_greeting(request: Request):
    """Generate a greeting using the LLM API without streaming."""
    try:
        logger.log_step("Received greeting generation request")
        # Parse the request JSON
        request_data = await request.json()
        
        # Extract character data and API config
        character_data = request_data.get('character_data')
        api_config = request_data.get('api_config')
        
        if not character_data:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Character data is required"}
            )
            
        if not api_config:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "API configuration is required"}
            )
            
        # Extract character fields for context
        data = character_data.get('data', {})
        name = data.get('name', 'Character')
        personality = data.get('personality', '')
        description = data.get('description', '')
        scenario = data.get('scenario', '')
        first_mes = data.get('first_mes', '')
        
        # Construct detailed context
        context_parts = []
        if description:
            context_parts.append(f"Description: {description}")
        if personality:
            context_parts.append(f"Personality: {personality}")
        if scenario:
            context_parts.append(f"Scenario: {scenario}")
            
        character_context = "\n\n".join(context_parts)
        
        # Get existing system prompt if any
        system_prompt = data.get('system_prompt', '')
        
        # Combine system prompt and character context
        full_memory = ""
        if system_prompt:
             full_memory += system_prompt + "\n\n"
        if character_context:
             full_memory += "Character Data:\n" + character_context

        # Construct prompt
        # Get internal prompt template from request or use default
        prompt_template = request_data.get('prompt_template')
        
        if prompt_template:
            # Use provided template
            prompt = prompt_template.replace('{{char}}', name)
            # Ensure {{user}} remains as {{user}} for the LLM if it was in the template
            # (No action needed if we just replace {{char}})
        else:
            # Default prompt
            prompt = f"#Generate an alternate first message for {name}. ##Only requirements: - Establish the world: Where are we? What does it feel like here? - Establish {name}'s presence (not bio): How do they occupy this space? Everything else (tone, structure, acknowledging/ignoring {{{{user}}}}, dialogue/action/interiority, length) is your choice. ##Choose what best serves this character in this moment. ##Goal: Create a scene unique to {name} speaking only for {name}"
        
        # Stream the response using ApiHandler
        # Pass full_memory as the memory context
        stream_request_data = {
            "api_config": api_config,
            "generation_params": {
                "prompt": prompt,
                "memory": full_memory,
                "stop_sequence": ["User:", "Human:", "</s>"],
                "character_data": character_data,
                "quiet": True
            }
        }
        
        return StreamingResponse(
            api_handler.stream_generate(stream_request_data),
            media_type="text/event-stream"
        )
    except Exception as e:
        logger.log_error(f"Error generating greeting: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to generate greeting: {str(e)}"}
        )

@app.post("/api/debug-png")
async def debug_png(file: UploadFile = File(...)):
    """Debug a PNG file to extract all chunks and metadata."""
    try:
        result = await debug_handler.debug_png(file)
        return JSONResponse(content=result)
    except Exception as e:
        logger.log_error(f"Error debugging PNG: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500, 
            content={"error": f"Failed to debug PNG: {str(e)}"}
        )

# NOTE: Removed character-related routes (/api/character-image, /api/character-metadata, /api/character, /api/characters)
# as they are now handled by the router included from backend.character_endpoints

# ---------- Serve frontend if running in production mode ----------

# Check if we're running as a standalone executable or script
if getattr(sys, 'frozen', False):
    # Running as PyInstaller bundle - serve built frontend files
    logger.log_step("Running as PyInstaller bundle, serving built frontend")
    static_dir = Path(sys._MEIPASS) / "frontend"
    if static_dir.exists():
        logger.log_step(f"Serving frontend from {static_dir}")
        
        # Create explicit index route to handle root path
        @app.get("/")
        async def serve_index():
            index_path = static_dir / "index.html"
            if index_path.exists():
                logger.log_step(f"Serving index.html explicitly: {index_path}")
                return FileResponse(index_path)
            else:
                logger.log_warning("index.html not found in frontend directory")
                return {"error": "Frontend not found"}
        
        # Mount static files handler for assets
        @app.get("/assets/{file_path:path}")
        async def serve_assets(file_path: str):
            # First try to find the asset in the frontend directory
            asset_path = static_dir / file_path
            
            # Then try to find it directly in the frontend directory
            if not asset_path.exists():
                direct_asset_path = static_dir / Path(file_path).name
                if direct_asset_path.exists():
                    logger.log_step(f"Serving asset from direct path: {direct_asset_path}")
                    return FileResponse(direct_asset_path)
            
            # If we found the asset in the frontend/assets directory
            if asset_path.exists():
                logger.log_step(f"Serving asset: {asset_path}")
                return FileResponse(asset_path)
                
            # Finally check if assets are in an assets subdirectory
            assets_dir_path = static_dir / "assets" / file_path
            if assets_dir_path.exists():
                logger.log_step(f"Serving asset from assets subdirectory: {assets_dir_path}")
                return FileResponse(assets_dir_path)
            logger.log_warning(f"Asset not found: {file_path}, tried paths: {asset_path}, {direct_asset_path}, {assets_dir_path}")
            raise HTTPException(status_code=404, detail="Asset not found")

        @app.get("/cardshark.ico")
        async def serve_favicon():
            favicon_path = static_dir / "cardshark.ico"
            if favicon_path.exists():
                logger.log_step(f"Serving cardshark.ico explicitly: {favicon_path}")
                return FileResponse(favicon_path, media_type="image/vnd.microsoft.icon")
            else:
                logger.log_warning(f"cardshark.ico not found at {favicon_path}")
                raise HTTPException(status_code=404, detail="Favicon not found")

        @app.get("/pngPlaceholder.png")
        async def serve_placeholder_png():
            placeholder_path = static_dir / "pngPlaceholder.png"
            if placeholder_path.exists():
                logger.log_step(f"Serving pngPlaceholder.png explicitly: {placeholder_path}")
                return FileResponse(placeholder_path, media_type="image/png")
            else:
                logger.log_warning(f"pngPlaceholder.png not found at {placeholder_path}")
                raise HTTPException(status_code=404, detail="pngPlaceholder.png not found")
        
        # Mount static files for all other assets
        app.mount("/", CrossDriveStaticFiles(directory=static_dir, html=True), name="frontend")
        
        
        # Log directory contents for debugging
        try:
            logger.log_step(f"Frontend directory contents: {list(static_dir.iterdir())}")
            index_path = static_dir / "index.html"
            if index_path.exists():
                logger.log_step("index.html found")
            else:
                logger.log_warning("index.html not found in frontend directory")
                
            assets_dir = static_dir / "assets"
            if assets_dir.exists():
                logger.log_step(f"Assets directory exists with contents: {list(assets_dir.iterdir())[:5]}...")
            else:
                logger.log_warning("Assets directory not found")
        except Exception as e:
            logger.log_error(f"Error checking frontend directory: {str(e)}")
    else:
        logger.log_warning(f"Frontend directory not found at {static_dir}")
        
        # Fallback: try to find frontend files at the root level
        try:
            root_dir = Path(sys._MEIPASS)
            logger.log_step(f"Checking root directory for frontend files: {root_dir}")
            if (root_dir / "index.html").exists():
                logger.log_step("Found index.html in root directory, serving from there")
                
                # Create explicit index route to handle root path
                @app.get("/")
                async def serve_index():
                    index_path = root_dir / "index.html"
                    logger.log_step(f"Serving index.html explicitly from root: {index_path}")
                    return FileResponse(index_path)
                
                # Mount static files for all other assets
                app.mount("/", CrossDriveStaticFiles(directory=root_dir, html=True), name="frontend")
                
                # Log contents
                logger.log_step(f"Root directory contents: {list(root_dir.iterdir())}")
            else:
                logger.log_warning("No frontend files found in root directory either")
                # Log what's in the root directory for debugging
                logger.log_step(f"Root directory contents: {list(root_dir.iterdir())}")
        except Exception as e:
            logger.log_error(f"Error checking root directory: {str(e)}")
else:
    # Running as script - serve from frontend/dist if exists
    static_dir = Path(__file__).parent.parent / "frontend" / "dist"
    if static_dir.exists():
        logger.log_step(f"Serving frontend from {static_dir}")
        app.mount("/", CrossDriveStaticFiles(directory=static_dir, html=True), name="frontend")
    else:
        logger.log_warning(f"Frontend build directory not found at {static_dir}, API endpoints only")

# Also mount the uploads directory to serve uploaded files
uploads_dir = Path("uploads")
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", CrossDriveStaticFiles(directory=uploads_dir), name="uploads")

# Removed direct @app.get("/api/health") definition, now handled by health_router

# ---------- Utility Endpoints (Migrated from old main.py) ----------

@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """Handle image upload for rich text editor."""
    try:
        # Check if file is an image
        content_type = file.content_type.lower() if file.content_type else ""
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
        filename = f"{uuid.uuid4()}.{file.filename.split('.')[-1] if '.' in file.filename else 'png'}"

        # Create uploads directory if it doesn't exist (relative to main.py location)
        uploads_dir = Path("uploads")
        uploads_dir.mkdir(parents=True, exist_ok=True)

        file_path = uploads_dir / filename

        # Read file content
        content = await file.read()

        # Write file to disk
        with open(file_path, "wb") as f:
            f.write(content)

        logger.log_step(f"Uploaded image for editor: {file_path}")

        # Return success with URL for TipTap to use
        # IMPORTANT: The URL path must match the GET endpoint below
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "url": f"/api/uploads/{filename}" # Use the correct serving path
            }
        )
    except Exception as e:
        logger.log_error(f"Error uploading image: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e)}
        )

@app.get("/api/uploads/{filename}")
async def get_uploaded_image(filename: str):
    """Serve uploaded images from the 'uploads' directory."""
    try:
        # Basic sanitization to prevent path traversal
        safe_filename = re.sub(r'[\\/]', '', filename) # Remove slashes
        if safe_filename != filename:
             raise HTTPException(status_code=400, detail="Invalid filename")

        uploads_dir = Path("uploads")
        file_path = uploads_dir / safe_filename

        if not file_path.is_file(): # Check if it's a file and exists
            logger.log_warning(f"Uploaded image not found: {file_path}")
            raise HTTPException(status_code=404, detail="Image not found")

        logger.log_step(f"Serving uploaded image: {file_path}")
        return FileResponse(file_path)
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error serving uploaded image '{filename}': {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


# Removed duplicate @app.get("/api/health") definition.
# The health check is now handled solely by the health_router included earlier.
# ---------- Main entry point ----------

def main():
    """Main entry point for the application."""
    
    parser = argparse.ArgumentParser(description="CardShark Character Card Editor")
    parser.add_argument("-host", "--host", default="0.0.0.0", help="Host to run the server on") # Changed default from "127.0.0.1"
    parser.add_argument("-port", "--port", type=int, default=9696, help="Port to run the server on")
    parser.add_argument("--batch", action="store_true", help="Run in batch processing mode (no GUI)")
    args = parser.parse_args()
    
    if args.batch:
        from backend.batch_converter import run_batch_processing
        run_batch_processing()
        return
      # Log startup information
    host = os.environ.get("CARDSHARK_HOST", args.host)
    port = int(os.environ.get("CARDSHARK_PORT", args.port))
    
    # Try to get local IP for LAN access notification
    local_ip = "127.0.0.1"
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    logger.log_step(f"Starting CardShark server at http://{host}:{port}")
    if host == "0.0.0.0" and local_ip != "127.0.0.1":
        logger.log_step(f"LAN Access available at: http://{local_ip}:{port}")
    
    # Always show localhost URL for local access
    browser_url = f"http://localhost:{port}"
    logger.log_step(f"To access the UI, open your browser and go to: {browser_url}")
    
    # Open the browser after a short delay - always use localhost for browser
    def open_browser():
        webbrowser.open(browser_url)
    
    Timer(1, open_browser).start()
    
    # Start the server
    uvicorn.run("backend.main:app", host=host, port=port, reload=False)

if __name__ == "__main__":
    main()