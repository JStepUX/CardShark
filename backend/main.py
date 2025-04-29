# backend/main.py
# Main application file for CardShark
import argparse
import os
import sys
import uvicorn
from pathlib import Path
from typing import Dict, Any, Optional, List
import traceback
import webbrowser
from threading import Timer

# FastAPI imports
from fastapi import FastAPI, Request, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse, StreamingResponse
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
from backend.handlers.world_state_handler import WorldStateHandler
from backend.handlers.world_card_chat_handler import WorldCardChatHandler
from backend.koboldcpp_handler import router as koboldcpp_router
from backend.room_card_endpoint import router as room_card_router

# Import our new endpoint modules
from backend.chat_endpoints import ChatEndpoints
from backend.character_endpoints import CharacterEndpoints, router as character_router
from backend.user_endpoints import UserEndpoints, router as user_router
from backend.settings_endpoints import SettingsEndpoints, router as settings_router
from backend.world_endpoints import WorldEndpoints, router as world_router
from backend.world_chat_endpoints import router as world_chat_router

# Create FastAPI app
app = FastAPI(title="CardShark API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize handlers
logger = LogManager()
settings_manager = SettingsManager(logger)
# Load settings at startup
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
character_endpoints = CharacterEndpoints(logger, png_handler, validator, settings_manager, backyard_handler)
user_endpoints = UserEndpoints(logger, settings_manager)
settings_endpoints = SettingsEndpoints(logger, settings_manager)
# Add template handler to settings endpoints for templates management
settings_endpoints.template_handler = template_handler
world_endpoints = WorldEndpoints(logger, world_state_handler, world_card_chat_handler)

# Register endpoints from classes
chat_endpoints.register_routes(app)
character_endpoints.register_routes(app)
user_endpoints.register_routes(app)
settings_endpoints.register_routes(app)
world_endpoints.register_routes(app)

# Include routers directly
app.include_router(koboldcpp_router)
app.include_router(room_card_router)
app.include_router(character_router)
app.include_router(user_router)
app.include_router(settings_router)
app.include_router(world_router)
app.include_router(world_chat_router)

# ---------- Direct routes that haven't been modularized yet ----------

@app.post("/api/debug-png")
async def debug_png(file: UploadFile = File(...)):
    """Debug a PNG file to extract all chunks and metadata."""
    try:
        content = await file.read()
        debug_info = debug_handler.debug_png(content)
        return JSONResponse(status_code=200, content=debug_info)
    except Exception as e:
        logger.log_error(f"Error debugging PNG: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to debug PNG: {str(e)}"}
        )

@app.post("/api/extract-lore")
async def extract_lore(file: UploadFile = File(...)):
    """Extract lore items from a PNG character card."""
    try:
        content = await file.read()
        logger.log_step("Extracting lore from uploaded PNG file")
        
        # Extract metadata from PNG
        metadata = png_handler.read_metadata(content)
        if not metadata:
            logger.log_warning("No metadata found in PNG")
            return JSONResponse(
                status_code=400,
                content={
                    "success": False, 
                    "message": "No metadata found in PNG"
                }
            )
        
        # Extract lore from character book
        lore_items = lore_handler.extract_lore_from_metadata(metadata)
        
        logger.log_step(f"Extracted {len(lore_items)} lore items")
        return JSONResponse(
            status_code=200,
            content={
                "success": True, 
                "lore": lore_items,
                "character_name": metadata.get("data", {}).get("name", "Unknown")
            }
        )
    except Exception as e:
        logger.log_error(f"Error extracting lore: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False, 
                "message": str(e)
            }
        )

@app.get("/api/backgrounds")
async def get_backgrounds():
    """Get a list of available background images."""
    try:
        backgrounds = background_handler.list_backgrounds()
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "backgrounds": backgrounds
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

@app.post("/api/generate-stream")
async def generate_stream(request: Request):
    """Streaming generation from an API endpoint."""
    try:
        data = await request.json()
        api_name = data.get("api")
        prompt = data.get("prompt")
        model_params = data.get("params", {})
        
        if not api_name or not prompt:
            raise HTTPException(status_code=400, detail="API name and prompt are required")
            
        logger.log_step(f"Streaming generation from {api_name}")
        
        # Create async generator for streaming the response
        async def response_generator():
            async for chunk in api_handler.generate_stream(api_name, prompt, model_params):
                yield f"data: {chunk}\n\n"
        
        return StreamingResponse(
            response_generator(),
            media_type="text/event-stream"
        )
    except Exception as e:
        logger.log_error(f"Error in streaming generation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ---------- Frontend Static Files ----------

def get_frontend_path():
    """Determine the correct frontend path."""
    # Check if in PyInstaller bundle
    if getattr(sys, 'frozen', False):
        base_path = Path(sys._MEIPASS)
    else:
        base_path = Path().absolute()
    
    # Look for the frontend directory
    frontend_path = base_path / "frontend"
    
    # Check if frontend exists
    if not frontend_path.exists():
        # Try one level up (for development)
        frontend_path = base_path.parent / "frontend"
    
    return frontend_path

frontend_path = get_frontend_path()
if frontend_path.exists():
    logger.log_step(f"Mounting frontend static files from: {frontend_path}")
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")

@app.get("/")
async def root():
    """Root endpoint serving the frontend."""
    try:
        index_path = frontend_path / "index.html"
        with open(index_path, "r") as f:
            return HTMLResponse(content=f.read())
    except Exception as e:
        logger.log_error(f"Error serving frontend: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": "Frontend not available"}
        )

# ---------- Main Entry Point ----------

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
        webbrowser.open_new(f"http://{host}:{port}")

    Timer(1, open_browser).start()
    
    # Start the server
    uvicorn.run("backend.main:app", host=host, port=port, reload=False)

if __name__ == "__main__":
    # When run directly, not as an import
    main()