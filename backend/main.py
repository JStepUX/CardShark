from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Response, Request, Body
from fastapi.responses import FileResponse, JSONResponse
from tempfile import NamedTemporaryFile
import json
import io
import os
from pathlib import Path
import tempfile
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import base64
import uvicorn
import sys
import webbrowser
import signal
import subprocess
from threading import Thread
import re
import requests
from requests.exceptions import RequestException
import traceback

# Import our handlers
from log_manager import LogManager
from png_handler import PngHandler
from json_handler import JsonHandler
from v2_handler import V2CardHandler
from url_handler import UrlHandler

def run_backend():
    try:
        # Get the correct backend directory path
        current_dir = os.path.dirname(os.path.abspath(__file__))
        os.chdir(current_dir)
        
        # Ensure logs directory exists at startup
        os.makedirs('logs', exist_ok=True)
        print("Logs directory ready at:", os.path.join(current_dir, 'logs'))
        
        print(f"Starting backend from: {os.getcwd()}")
        
        uvicorn.run(
            "main:app",
            host="127.0.0.1",
            port=9696,
            reload=False,
            log_level="info"
        )
    except Exception as e:
        print(f"Backend server error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

app = FastAPI()

@app.get("/api/health")
async def health_check():
    """Simple health check endpoint."""
    try:
        return {"status": "ok", "message": "Server is running"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Initialize logging
os.makedirs('logs', exist_ok=True)  # Create logs directory if it doesn't exist
logger = LogManager()  # Initialize without arguments

# Initialize core handlers
v2_handler = V2CardHandler(logger)  # Initialize V2 handler
png_handler = PngHandler(logger=logger)  # Create PNG handler with basic dependencies
# Create URL handler with proper dependencies
url_handler = UrlHandler(
    json_handler=None,  # We don't need json_handler since we handle JSON directly in endpoint
    json_text=None,     # Not needed for API endpoint
    lore_manager=None,  # Not needed for API endpoint 
    status_var=None,    # Not needed for API endpoint
    logger=logger       # Just pass logger for error tracking
)

logger.log_step("Initialized handlers")

@app.post("/api/upload-png")
async def upload_png(file: UploadFile = File(...)):
    temp_file = None
    try:
        temp_file = NamedTemporaryFile(delete=False, suffix='.png')
        contents = await file.read()
        temp_file.write(contents)
        temp_file.flush()
        
        metadata = png_handler.load_card(temp_file.name)
        
        # Create data URL for image preview
        with Image.open(temp_file.name) as image:
            buffered = io.BytesIO()
            image.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode()
            image_url = f"data:image/png;base64,{img_str}"
        
        if metadata:
            logger.log_step("Returning metadata:", metadata)  # Add logging to verify data
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "metadata": metadata,
                    "imageUrl": image_url
                }
            )
        else:
            return JSONResponse(
                status_code=200,  # Note: Still return 200 for no metadata
                content={
                    "success": True,
                    "metadata": None,
                    "message": "No character data found"
                }
            )
            
    except Exception as e:
        logger.log_step(f"Error processing file: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )
    finally:
        if temp_file:
            try:
                os.unlink(temp_file.name)
            except:
                pass

@app.post("/api/save-png")
async def save_png(file: UploadFile, metadata: str = Form(...)):
    """Save PNG with complete metadata including lore items."""
    try:
        # Log incoming save request
        logger.log_step("Saving PNG with metadata")
        
        # Read the uploaded file
        contents = await file.read()
        
        # Create temp file for original image
        with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as temp_file:
            temp_file.write(contents)
            temp_path = temp_file.name
            
        try:
            # Parse metadata JSON and log it
            metadata_dict = json.loads(metadata)
            logger.log_step("Parsed metadata:", metadata_dict)
            
            # Ensure the metadata is in V2 format
            if metadata_dict.get('spec') != 'chara_card_v2':
                raise ValueError("Invalid metadata format - must be V2 spec")
                
            # Convert complete metadata to base64
            json_str = json.dumps(metadata_dict, ensure_ascii=False)
            base64_str = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')
            
            # Create metadata for new PNG
            new_metadata = PngInfo()
            new_metadata.add_text('chara', base64_str)
            
            # Save new image with metadata
            with Image.open(temp_path) as img:
                # Preserve original PNG properties
                if img.mode != 'RGBA':
                    img = img.convert('RGBA')
                img.save(temp_path, 'PNG', pnginfo=new_metadata, optimize=True)
            
            # Verify the saved metadata
            with Image.open(temp_path) as verify_img:
                if 'chara' not in verify_img.info:
                    raise ValueError("Metadata verification failed")
                    
            logger.log_step("Successfully saved PNG with metadata")
            
            # Read and return the modified file
            with open(temp_path, 'rb') as f:
                modified_contents = f.read()
                
            return Response(content=modified_contents, 
                          media_type="image/png",
                          headers={"Content-Disposition": f"attachment; filename={file.filename}"})
            
        finally:
            # Cleanup temp file
            if os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception as e:
                    logger.log_step(f"Error cleaning up temp file: {str(e)}")
                
    except Exception as e:
        logger.log_step(f"Error saving PNG: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    run_backend()

@app.post("/api/import-backyard")
async def import_backyard(request: Request):
    try:
        data = await request.json()
        url = data.get('url')
        logger.log_step(f"Processing URL: {url}")
        
        if not url:
            return JSONResponse(status_code=400, content={"success": False, "message": "No URL provided"})
            
        # Get the page HTML
        response = requests.get(url)
        response.raise_for_status()
        html = response.text
        logger.log_step("Successfully fetched page HTML")
        
        # Extract trpcState data
        match = re.search(r'trpcState":(.*?),"_sentryTraceData"', html)
        if not match:
            logger.log_step("Failed to find trpcState data")
            raise ValueError("Could not find character data")
            
        # Parse the JSON data
        json_str = match.group(1).strip()
        trpc_data = json.loads(json_str)
        
        # Find character data in queries
        queries = trpc_data.get('json', {}).get('queries', [])
        character_query = next(
            (q for q in queries if q.get('queryKey', [])[0] == ['hub', 'character', 'getCharacterById']),
            None
        )
        
        if not character_query:
            raise ValueError("Character data not found")
            
        character = character_query.get('state', {}).get('data', {}).get('character', {})
        logger.log_step("Successfully extracted character data")
        
        # Collect all image URLs
        image_urls = []
        
        # Add avatar if present
        avatar_url = character.get('avatar')
        if avatar_url:
            image_urls.append(avatar_url)
            
        # Add additional images if present
        if character.get('Images'):
            image_urls.extend(
                img.get('imageUrl') for img in character['Images'] 
                if img.get('imageUrl')
            )
            
        # Add background images if present
        if character.get('backgroundImages'):
            image_urls.extend(
                img.get('imageUrl') for img in character['backgroundImages'] 
                if img.get('imageUrl')
            )
            
        # Remove duplicates while preserving order
        image_urls = list(dict.fromkeys(image_urls))
        logger.log_step(f"Found {len(image_urls)} images")
            
        # Convert to V1 format
        v1_data = {
            'character': {
                'aiDisplayName': character.get('aiName', ''),
                'basePrompt': character.get('basePrompt', ''),
                'aiPersona': character.get('aiPersona', ''),
                'firstMessage': character.get('firstMessage', ''),
                'customDialogue': character.get('customDialogue', ''),
                'scenario': character.get('scenario', ''),
                'creatorNotes': character.get('authorNotes', ''),
                'systemPrompt': character.get('systemPrompt', ''),
                'postHistoryInstructions': character.get('postHistoryInstructions', ''),
                'tags': [tag.get('name') for tag in character.get('Tags', []) if 'name' in tag],
                'creator': character.get('creator', ''),
                'version': 'main',
                'loreItems': []
            }
        }

        # Add lorebook items if present
        if character.get('Lorebook') and character['Lorebook'].get('LorebookItems'):
            v1_data['character']['loreItems'] = [
                {
                    'key': item.get('key', ''),
                    'value': item.get('value', ''),
                    'metadata': {
                        'case_sensitive': False,
                        'priority': 10,
                        'constant': False,
                        'position': 'after_char'
                    }
                }
                for item in character['Lorebook']['LorebookItems']
            ]

        logger.log_step("Converting to V2 format...")
        v2_data = v2_handler.convert_v1_to_v2(v1_data)
        if not v2_data:
            raise ValueError("Failed to convert to V2 format")

        # Add collected image URLs to V2 data
        v2_data['data']['imported_images'] = image_urls
        logger.log_step("Added imported images to V2 data")
        
        # Return the first image URL as the preview image
        preview_url = image_urls[0] if image_urls else None
        logger.log_step("Conversion complete, returning data")
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "metadata": v2_data,
                "imageUrl": preview_url
            }
        )
        
    except Exception as e:
        logger.log_step(f"Error: {str(e)}")
        logger.log_step(f"Traceback: {traceback.format_exc()}") # type: ignore
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e)}
        )

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
        metadata = png_handler.load_card(temp_file.name)
        
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