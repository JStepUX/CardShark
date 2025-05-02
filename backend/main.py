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
from backend.chat_handler import ChatHandler
from backend.template_handler import TemplateHandler
from backend.background_handler import BackgroundHandler
from backend.lore_handler import LoreHandler

# API endpoint modules
from backend.chat_endpoints import router as chat_router
# Import routers directly, no need for class instances
from backend.background_endpoints import router as background_router
from backend.room_card_endpoint import router as room_card_router
from backend.character_endpoints import router as character_router
from backend.user_endpoints import router as user_router
from backend.settings_endpoints import router as settings_router
from backend.world_endpoints import router as world_router
from backend.template_endpoints import router as template_router  # Import the new template router
# from backend.world_chat_endpoints import router as world_chat_router # Removed, functionality merged into world_router

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

# Create a dedicated router for health check
health_router = APIRouter(prefix="/api", tags=["health"])

@health_router.get("/health")
async def health_check():
    """Health check endpoint."""
    # Optionally add more checks here (e.g., database connection)
    return {"status": "ok", "version": VERSION}

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
# NOTE: Removed initialization and registration of endpoint classes (ChatEndpoints, UserEndpoints, etc.)
# as routers are included directly below using app.include_router.
# Removed stray marker and duplicate comment block from previous failed diff

# Cleaned up duplicated lines from previous failed diffs

# Set up and include routers directly
# setup_background_router call removed as it's no longer needed
app.include_router(health_router) # Include the health check router
app.include_router(chat_router) # Include the refactored chat router
app.include_router(koboldcpp_router)
app.include_router(room_card_router)
app.include_router(character_router)
app.include_router(user_router)
app.include_router(settings_router)
app.include_router(world_router)
app.include_router(template_router)  # Include the new template router
# app.include_router(world_chat_router) # Removed, functionality merged into world_router
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
        app.mount("/", CrossDriveStaticFiles(directory=static_dir, html=True), name="frontend")
    else:
        logger.log_warning(f"Frontend directory not found at {static_dir}")
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