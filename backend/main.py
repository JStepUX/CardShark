import sys
import os
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Response, Request # type: ignore
from fastapi.responses import FileResponse, JSONResponse # type: ignore
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

# Local imports
from backend.log_manager import LogManager  # Change to relative import
from backend.png_metadata_handler import PngMetadataHandler
from backend.errors import CardSharkError
from backend.backyard_handler import BackyardHandler
from backend.png_debug_handler import PngDebugHandler # type: ignore

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

# Initialize logger first since other components need it
logger = LogManager()

# Initialize handlers with proper error handling
try:
    png_handler = PngMetadataHandler(logger)
    backyard_handler = BackyardHandler(logger)  # New handler
    logger.log_step("Initialized handlers")
except Exception as e:
    logger.log_error(f"Failed to initialize handlers: {str(e)}")
    raise

# API Endpoints
@app.get("/api/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "message": "Server is running"}

@app.post("/api/upload-png")
async def upload_png(file: UploadFile = File(...)):
    """Handle PNG upload with enhanced debugging"""
    try:
        content = await file.read()
        
        # Run debug analysis first
        debug_handler = PngDebugHandler(logger)
        debug_info = debug_handler.debug_png_metadata(content)
        
        # Log debug information
        logger.log_step("PNG Debug Information:")
        logger.log_step(f"Has chara field: {debug_info['has_chara']}")
        logger.log_step(f"Has userComment field: {debug_info['has_userComment']}")
        
        if debug_info['error']:
            logger.log_error(f"Debug found error: {debug_info['error']}")
            return {"success": False, "error": debug_info['error']}
            
        handler = PngMetadataHandler(logger)
        
        if debug_info['decoded_data']:
            # Existing card with metadata
            metadata = handler.read_metadata(content)
            return {
                "success": True, 
                "metadata": metadata,
                "debug_info": debug_info,
                "is_new": False
            }
        else:
            # New card - create empty V2 structure
            metadata = handler._create_empty_card()
            logger.log_step("Created new empty character card")
            return {
                "success": True,
                "metadata": metadata,
                "debug_info": debug_info,
                "is_new": True
            }
            
    except Exception as e:
        logger.log_error(f"Upload failed: {str(e)}")
        return {"success": False, "error": str(e)}

@app.post("/api/save-png")
async def save_png(file: UploadFile = File(...), metadata: str = Form(...)):
    """Save PNG with metadata."""
    try:
        content = await file.read()
        metadata_dict = json.loads(metadata)
        handler = PngMetadataHandler(logger)
        new_content = handler.write_metadata(content, metadata_dict)
        return Response(content=new_content, media_type="image/png")
    except Exception as e:
        logger.log_error(f"Save failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/extract-lore")
async def extract_lore(file: UploadFile = File(...)):
    """Extract lore items from a PNG character card."""
    temp_file = None
    try:
        logger.log_step("Processing lore extraction request")
        
        # Create temp file
        temp_file = NamedTemporaryFile(delete=False, suffix='.png')
        contents = await file.read()
        temp_file.write(contents)
        temp_file.flush()
        
        logger.log_step(f"Created temp file: {temp_file.name}")
        
        # Load character data
        metadata = png_handler.read_metadata(temp_file.name)
        
        if not metadata:
            logger.log_step("No character data found in PNG")
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "No character data found in PNG"}
            )
        
        # Extract lore items
        lore_items = []
        
        # Try both V2 format paths for character book
        if metadata.get('spec') == 'chara_card_v2':
            # First try data/character_book path
            entries = metadata.get('data', {}).get('character_book', {}).get('entries', [])
            
            # If no entries found, try direct character_book path
            if not entries:
                entries = metadata.get('character_book', {}).get('entries', [])
            
            lore_items = entries
            
        logger.log_step(f"Extracted {len(lore_items)} lore items")
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "loreItems": lore_items
            }
        )
        
    except Exception as e:
        logger.log_step(f"Error extracting lore: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e)}
        )
    finally:
        if temp_file:
            try:
                os.unlink(temp_file.name)
                logger.log_step("Cleaned up temp file")
            except Exception as e:
                logger.log_step(f"Error cleaning temp file: {str(e)}")
                pass

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
        
        handler = BackyardHandler(logger)
        metadata, preview_url = handler.import_character(url)
        
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

if __name__ == "__main__":
    frontend_path = get_frontend_path()
    if (frontend_path.exists()):
        # Serve everything at "/", including index.html automatically
        app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="static")
        logger.log_step(f"Mounted frontend files from {frontend_path}")
    else:
        logger.log_warning(f"Frontend static files not found at {frontend_path}")
        raise FileNotFoundError(f"Frontend directory not found: {frontend_path}")

    import uvicorn # type: ignore
    uvicorn.run(app, host="127.0.0.1", port=9696)