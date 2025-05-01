import uuid
import re
# backend/main.py
# Main application file for CardShark
import argparse
import os
import sys
import urllib.parse
import glob
import uvicorn
from pathlib import Path
from typing import Dict, Any, Optional, List
import traceback
import webbrowser
from threading import Timer

# FastAPI imports
from fastapi import FastAPI, Request, HTTPException, UploadFile, File, Query
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse, StreamingResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Internal modules/handlers
from backend.log_manager import LogManager
from backend.png_metadata_handler import PngMetadataHandler
from backend.png_debug_handler import PngDebugHandler
from backend.errors import CardSharkError, ErrorType
from backend.backyard_handler import BackyardHandler
from backend.settings_manager import SettingsManager
from backend.character_validator import CharacterValidator
from backend.api_handler import ApiHandler
from backend.chat_handler import ChatHandler
from backend.template_handler import TemplateHandler
from backend.background_handler import BackgroundHandler
from backend.lore_handler import LoreHandler

# API endpoint modules
from backend.chat_endpoints import ChatEndpoints
# Remove the CharacterEndpoints import since it doesn't exist
from backend.user_endpoints import UserEndpoints
from backend.settings_endpoints import SettingsEndpoints
from backend.world_endpoints import WorldEndpoints
from backend.background_endpoints import BackgroundEndpoints, setup_router as setup_background_router
from backend.background_endpoints import router as background_router
from backend.room_card_endpoint import router as room_card_router
from backend.character_endpoints import router as character_router
from backend.user_endpoints import router as user_router
from backend.settings_endpoints import router as settings_router
from backend.world_endpoints import router as world_router
from backend.world_chat_endpoints import router as world_chat_router

# Import koboldcpp handler & manager
from backend.koboldcpp_handler import router as koboldcpp_router

# Import user directory utilities functions
from backend.utils.user_dirs import get_users_dir # type: ignore

# Import various handlers
from backend.handlers.world_state_handler import WorldStateHandler
from backend.handlers.world_card_chat_handler import WorldCardChatHandler

# Global configuration
VERSION = "0.1.0"
DEBUG = os.environ.get("DEBUG", "").lower() in ("true", "1", "t")

# Initialize FastAPI app
logger = LogManager()
app = FastAPI(debug=DEBUG)

# Add CORS middleware to allow all origins (for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, this should be restricted
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Initialize Handlers ----------

# Initialize core handlers
settings_manager = SettingsManager(logger)
settings_manager._load_settings()
validator = CharacterValidator(logger)
png_handler = PngMetadataHandler(logger)
debug_handler = PngDebugHandler(logger)
backyard_handler = BackyardHandler(logger)
api_handler = ApiHandler(logger)
chat_handler = ChatHandler(logger)
template_handler = TemplateHandler(logger)
background_handler = BackgroundHandler(logger)
background_handler.initialize_default_backgrounds() # Initialize default backgrounds
lore_handler = LoreHandler(logger, default_position=0)
world_state_handler = WorldStateHandler(logger, settings_manager)

# Initialize the world card chat handler with explicit worlds directory
worlds_dir = Path("worlds")
if not worlds_dir.exists():
    worlds_dir.mkdir(parents=True, exist_ok=True)
logger.log_step(f"Initializing world chat handler with worlds directory: {worlds_dir.absolute()}")
world_card_chat_handler = WorldCardChatHandler(logger, worlds_path=worlds_dir)

# ---------- Initialize and register endpoints ----------

# Initialize endpoint classes
chat_endpoints = ChatEndpoints(logger, chat_handler, api_handler)
user_endpoints = UserEndpoints(logger, settings_manager)
settings_endpoints = SettingsEndpoints(logger, settings_manager)
# Add template handler to settings endpoints for templates management
settings_endpoints.template_handler = template_handler
world_endpoints = WorldEndpoints(logger, world_state_handler, world_card_chat_handler)
background_endpoints = BackgroundEndpoints(logger, background_handler, chat_handler)  # Pass chat_handler here

# Register endpoints from classes
chat_endpoints.register_routes(app)
user_endpoints.register_routes(app)
settings_endpoints.register_routes(app)
world_endpoints.register_routes(app)
background_endpoints.register_routes(app)

# Set up and include routers directly
setup_background_router(background_handler, logger, chat_handler)  # Pass chat_handler here as well
app.include_router(koboldcpp_router)
app.include_router(room_card_router)
app.include_router(character_router)
app.include_router(user_router)
app.include_router(settings_router)
app.include_router(world_router)
app.include_router(world_chat_router)
app.include_router(background_router)

# ---------- Direct routes that haven't been modularized yet ----------

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

@app.get("/api/character-image/{path:path}")
async def get_character_image(path: str):
    """Serve a character image file by path."""
    logger.log_step(f"Character image endpoint accessed with path: {path}")
    # Redirect to the router implementation
    from fastapi.responses import RedirectResponse
    
    # URL encode the path for safe redirection
    encoded_path = urllib.parse.quote(path)
    redirect_url = f"/api/characters/image/{encoded_path}"
    logger.log_step(f"Redirecting to router endpoint: {redirect_url}")
    return RedirectResponse(url=redirect_url)

@app.get("/api/character-metadata/{path:path}")
async def get_character_metadata(path: str):
    """Extract metadata from a character file."""
    logger.log_step(f"Character metadata endpoint accessed with path: {path}")
    # Redirect to the router implementation
    from fastapi.responses import RedirectResponse
    
    # URL encode the path for safe redirection
    encoded_path = urllib.parse.quote(path)
    redirect_url = f"/api/characters/metadata/{encoded_path}"
    logger.log_step(f"Redirecting to router endpoint: {redirect_url}")
    return RedirectResponse(url=redirect_url)

@app.get("/api/character/{path:path}")
async def get_character_by_path(path: str):
    """API endpoint for character operations by path."""
    logger.log_step(f"Character endpoint accessed with path: {path}")
    # For GET requests, we want to redirect to the appropriate image or metadata endpoint
    if path.lower().endswith((".png", ".jpg", ".jpeg", ".gif")):
        # This is likely an image request, redirect to character-image
        return {"success": False, "error": "Use /api/character-image/ for image requests"}
    else:
        raise HTTPException(status_code=404, detail="Invalid character path or operation")

@app.delete("/api/character/{path:path}")
async def delete_character_by_path(path: str):
    """Delete a character file by path."""
    logger.log_step(f"Delete character request with path: {path}")
    
    try:
        # URL decode the path first
        path = urllib.parse.unquote(path)
        # On Windows, convert forward slashes to backslashes
        if os.name == 'nt':
            path = path.replace('/', '\\')
        
        logger.log_step(f"Normalized path: {path}")
        
        if not os.path.exists(path):
            logger.log_error(f"Character file not found: {path}")
            raise HTTPException(status_code=404, detail="Character file not found")
            
        if not path.lower().endswith('.png'):
            logger.log_error(f"Invalid file format for character: {path}")
            raise HTTPException(status_code=400, detail="Invalid file format")
            
        try:
            os.remove(path)
            logger.log_step(f"Successfully deleted character file: {path}")
            return {"success": True, "message": "Character deleted successfully"}
        except Exception as e:
            logger.log_error(f"Error deleting character file: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")
    except Exception as e:
        logger.log_error(f"Error in delete_character_by_path: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/characters")
async def characters_directory_fallback(request: Request, directory: str = Query(None)):
    """Fallback API endpoint for character directory requests if router fails."""
    logger.log_step(f"Fallback characters endpoint accessed with directory: {directory}")
    logger.log_step(f"Full URL: {request.url}")
    
    # This is now just a redirect to the router implementation
    # Forward to the proper router endpoint: /api/characters/?directory=...
    if directory:
        # Construct the redirect URL to the router endpoint
        redirect_url = f"/api/characters/?directory={urllib.parse.quote(directory)}"
        logger.log_step(f"Redirecting to router endpoint: {redirect_url}")
        return RedirectResponse(url=redirect_url)
    else:
        logger.log_error("No directory parameter provided")
        return {
            "success": False,
            "message": "No directory parameter provided"
        }

# ---------- Serve frontend if running in production mode ----------

# Check if we're running as a standalone executable or script
if getattr(sys, 'frozen', False):
    # Running as PyInstaller bundle - serve built frontend files
    logger.log_step("Running as PyInstaller bundle, serving built frontend")
    static_dir = Path(sys._MEIPASS) / "frontend"
    if static_dir.exists():
        logger.log_step(f"Serving frontend from {static_dir}")
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
    else:
        logger.log_warning(f"Frontend directory not found at {static_dir}")
else:
    # Running as script - serve from frontend/dist if exists
    static_dir = Path(__file__).parent.parent / "frontend" / "dist"
    if static_dir.exists():
        logger.log_step(f"Serving frontend from {static_dir}")
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
    else:
        logger.log_warning(f"Frontend build directory not found at {static_dir}, API endpoints only")

# Also mount the uploads directory to serve uploaded files
uploads_dir = Path("uploads")
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# ---------- Health check endpoint ----------

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "version": VERSION}

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


# ---------- Main entry point ----------

def main():
    """Main entry point for the application."""
    parser = argparse.ArgumentParser(description="CardShark Character Card Editor")
    parser.add_argument("-host", "--host", default="127.0.0.1", help="Host to run the server on")
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
    logger.log_step(f"Starting CardShark server at http://{host}:{port}")
    logger.log_step(f"To access the UI, open your browser and go to: http://{host}:{port}")
    
    # Open the browser after a short delay
    def open_browser():
        webbrowser.open(f"http://{host}:{port}")
    
    Timer(1, open_browser).start()
    
    # Start the server
    uvicorn.run("backend.main:app", host=host, port=port, reload=False)

if __name__ == "__main__":
    main()