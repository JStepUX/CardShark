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
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Custom StaticFiles implementation to handle cross-drive paths
from backend.utils.cross_drive_static_files import CrossDriveStaticFiles

# Internal modules/handlers
from backend.log_manager import LogManager
from backend.png_metadata_handler import PngMetadataHandler
from backend.errors import CardSharkError, ErrorType

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

# API endpoint registry
from backend.endpoints import ALL_ROUTERS, setup_generation_router, setup_health_router, setup_file_upload_router
from backend.koboldcpp_handler import router as koboldcpp_router
from backend.dependencies import get_character_service_dependency

# Import user directory utilities functions
from backend.utils.user_dirs import get_users_dir # type: ignore

# Import various handlers
from backend.handlers.world_card_chat_handler import WorldCardChatHandler
from backend.world_asset_handler import WorldAssetHandler
from backend.services.world_card_service import WorldCardService

# Global configuration
VERSION = "0.1.0"
DEBUG = os.environ.get("DEBUG", "").lower() in ("true", "1", "t")

# Initialize Database imports
from backend.database import init_db, SessionLocal, get_db # Import SessionLocal and get_db
from contextlib import asynccontextmanager
from backend.services.character_service import CharacterService # Import CharacterService
from backend.services.character_sync_service import CharacterSyncService # Import CharacterSyncService
from backend.services.default_world_service import DefaultWorldService # Import DefaultWorldService
from backend.services.user_profile_service import UserProfileService # Import UserProfileService
from backend.services.image_storage_service import ImageStorageService # Import ImageStorageService
from backend.services.character_lore_service import CharacterLoreService # Import CharacterLoreService

# Initialize core handlers first (needed for lifespan)
logger = LogManager(console_verbosity=1)  # INFO level - reduces terminal spam
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
        # Initialize CharacterLoreService (extracted from CharacterService)
        lore_service = CharacterLoreService(logger=logger)
        app.state.lore_service = lore_service

        # Initialize CharacterService and attach to app.state
        db_session_generator = SessionLocal # Pass the callable for CharacterService to manage its own sessions
        app.state.character_service = CharacterService(
            db_session_generator=db_session_generator,
            png_handler=png_handler,
            settings_manager=settings_manager,
            logger=logger,
            lore_service=lore_service,
            # character_indexing_service=character_indexing_service # Add this if CharacterService needs it
        )
        
        # Initialize ImageStorageService
        app.state.image_storage_service = ImageStorageService(logger)
        
        # Initialize World Handlers
        app.state.world_asset_handler = WorldAssetHandler(logger)
        app.state.world_card_handler = WorldCardService(
            character_service=app.state.character_service,
            png_handler=png_handler,
            settings_manager=settings_manager,
            logger=logger
        )
        
        # Initialize DefaultWorldService (needed before sync for bundled asset deployment)
        default_world_service = DefaultWorldService(
            character_service=app.state.character_service,
            world_card_service=app.state.world_card_handler,
            png_handler=png_handler,
            settings_manager=settings_manager,
            logger=logger,
        )

        # Deploy bundled character PNGs from assets/defaults/ before sync
        try:
            default_world_service.deploy_bundled_characters()
        except Exception as e:
            logger.log_warning(f"Bundled character deployment failed: {e}")

        # Synchronize character directories using the initialized service
        try:
            # Initialize and run the new CharacterSyncService
            character_sync_service = CharacterSyncService(
                db_session_generator=db_session_generator,
                png_handler=png_handler,
                settings_manager=settings_manager,
                logger=logger
            )
            app.state.character_sync_service = character_sync_service
            character_sync_service.sync_characters()
        except Exception as sync_exc:
            logger.log_error(f"Character sync failed: {sync_exc}")
            raise
        logger.log_info("Initial character directory synchronization complete.")

        # Ensure default demo world exists
        try:
            default_world_service.ensure_default_world()
        except Exception as e:
            logger.log_warning(f"Default world provisioning failed: {e}")

        # Initialize and run user profile synchronization
        try:
            user_profile_service = UserProfileService(
                db_session_generator=db_session_generator,
                logger=logger,
                png_handler=png_handler
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

# Setup health router with dependencies
setup_health_router(logger, settings_manager, VERSION)

# Add CORS middleware to allow all origins (for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, this should be restricted
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Initialize Remaining Handlers ----------

api_handler = ApiHandler(logger)

# Setup generation router with dependencies
setup_generation_router(logger, api_handler)

# Setup file upload router with dependencies
setup_file_upload_router(logger)

template_handler = TemplateHandler(logger)
background_handler = BackgroundHandler(logger)
background_handler.initialize_default_backgrounds() # Initialize default backgrounds
lore_handler = LoreHandler(logger, default_position=0) # Create LoreHandler for dependency injection

# Store handlers on app.state for access in dependencies
app.state.png_handler = png_handler
app.state.settings_manager = settings_manager

app.state.background_handler = background_handler # Store BackgroundHandler for dependency injection
app.state.content_filter_manager = content_filter_manager # Store ContentFilterManager for dependency injection
app.state.template_handler = template_handler # Store TemplateHandler for dependency injection

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

# ---------- Register all endpoint routers ----------
for router in ALL_ROUTERS:
    app.include_router(router)
app.include_router(koboldcpp_router)

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

        @app.get("/sounds/{file_path:path}")
        async def serve_sounds(file_path: str):
            sound_path = static_dir / "sounds" / file_path
            if sound_path.exists():
                logger.log_step(f"Serving sound: {sound_path}")
                return FileResponse(sound_path, media_type="audio/mpeg")
            logger.log_warning(f"Sound not found: {file_path}")
            raise HTTPException(status_code=404, detail="Sound not found")

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
# Use get_application_base_path() for correct handling in both dev and PyInstaller
from backend.utils.path_utils import get_application_base_path
uploads_dir = get_application_base_path() / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", CrossDriveStaticFiles(directory=uploads_dir), name="uploads")

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