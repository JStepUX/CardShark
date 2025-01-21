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
from fastapi.responses import FileResponse, JSONResponse # type: ignore
from typing import Optional

# Local imports
from backend.log_manager import LogManager  # Change to relative import
from backend.png_metadata_handler import PngMetadataHandler
from backend.errors import CardSharkError
from backend.backyard_handler import BackyardHandler
from backend.png_debug_handler import PngDebugHandler # type: ignore
from backend.settings_manager import SettingsManager

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

# API Endpoints

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
    """Update settings."""
    try:
        data = await request.json()
        logger.log_step(f"Received settings update request: {data}")
        
        # Validate incoming settings
        valid_settings = ["character_directory", "save_to_character_directory", 
                         "last_export_directory", "theme"]
        
        # Filter out any unexpected settings
        filtered_data = {k: v for k, v in data.items() if k in valid_settings}
        
        # Handle character_directory setting specifically
        if 'character_directory' in filtered_data:
            directory = filtered_data['character_directory']
            logger.log_step(f"Validating directory: {directory}")
            
            # Log directory status
            exists = os.path.exists(directory) if directory else True  # Allow empty string
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
            
            # If directory is invalid, also disable save_to_directory setting
            if not directory:
                filtered_data['save_to_character_directory'] = False
                
            logger.log_step("Directory validation passed")
        
        # Update all validated settings
        logger.log_step("Attempting to update settings...")
        success = all(
            settings_manager.update_setting(key, value)
            for key, value in filtered_data.items()
        )
        
        logger.log_step(f"Settings update success: {success}")
        
        if success:
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "Settings updated successfully",
                    "settings": settings_manager.settings  # Return updated settings
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
        content = await file.read()
        metadata = png_handler.read_metadata(content)
        return {
            "success": True,
            "metadata": metadata,
        }
    except Exception as e:
        logger.log_error(f"Upload failed: {str(e)}")
        return {"success": False, "error": str(e)}

from typing import Optional
import os

@app.post("/api/save-png")
async def save_png(
    file: UploadFile = File(...), 
    metadata: str = Form(...),
    save_directory: Optional[str] = Form(default=None)
):
    """Save PNG with metadata."""
    try:
        # Log all incoming form data
        logger.log_step("=== Save PNG Request ===")
        logger.log_step(f"Save directory provided: {save_directory!r}")
        
        content = await file.read()
        logger.log_step(f"File content size: {len(content)} bytes")
        
        metadata_dict = json.loads(metadata)
        char_name = metadata_dict.get('data', {}).get('name', 'character')
        logger.log_step(f"Character name: {char_name}")
        
        new_content = png_handler.write_metadata(content, metadata_dict)
        
        # If save_directory is provided, save the file there
        if save_directory:
            try:
                logger.log_step("Attempting directory save...")
                
                # Verify directory exists first
                save_dir_path = Path(save_directory)
                if not save_dir_path.exists():
                    logger.log_error(f"Directory does not exist: {save_directory}")
                    raise ValueError(f"Directory does not exist: {save_directory}")
                
                # Clean filename
                clean_name = re.sub(r'[<>:"/\\|?*]', '_', char_name)
                save_path = save_dir_path / f"{clean_name}.png"
                logger.log_step(f"Full save path: {save_path}")
                
                # Write file with explicit error capture
                try:
                    with open(save_path, 'wb') as f:
                        f.write(new_content)
                    
                    # Verify file was written
                    if save_path.exists():
                        logger.log_step(f"Successfully wrote file: {save_path}")
                        logger.log_step(f"File size: {save_path.stat().st_size} bytes")
                    else:
                        logger.log_error(f"File was not created: {save_path}")
                        
                except IOError as io_error:
                    logger.log_error(f"IO Error writing file: {str(io_error)}")
                    raise
                    
            except Exception as dir_error:
                logger.log_error(f"Directory save failed: {str(dir_error)}")
                logger.log_error(traceback.format_exc())
        else:
            logger.log_step("No directory save requested")
        
        # Return the content for browser download
        logger.log_step("Returning PNG content to client")
        return Response(content=new_content, media_type="image/png")
        
    except Exception as e:
        logger.log_error(f"Save failed: {str(e)}")
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
        metadata = png_handler.read_metadata(content)
        
        if not metadata:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "No character data found in PNG"}
            )
        
        # Extract lore items from V2 format
        lore_items = []
        if metadata.get('spec') == 'chara_card_v2':
            if 'data' in metadata and 'character_book' in metadata['data']:
                lore_items = metadata['data']['character_book'].get('entries', [])
            elif 'character_book' in metadata:
                lore_items = metadata['character_book'].get('entries', [])
            
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "loreItems": lore_items
            }
        )
        
    except Exception as e:
        logger.log_error(f"Error extracting lore: {str(e)}")
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