# backend/lore_endpoints.py
# Endpoints for lore extraction and handling
import traceback
from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse

from backend.log_manager import LogManager
from backend.lore_handler import LoreHandler

# Get dependencies 
def get_logger():
    return LogManager()

def get_lore_handler(logger: LogManager = Depends(get_logger)):
    return LoreHandler(logger)

# Create router
router = APIRouter(prefix="/api", tags=["lore"])

@router.post("/extract-lore")
async def extract_lore(
    request: Request,
    lore_handler: LoreHandler = Depends(get_lore_handler),
    logger: LogManager = Depends(get_logger)
):
    """
    Extract and match lore entries from character metadata and chat text.
    """
    try:
        data = await request.json()
        character_data = data.get("character_data")
        chat_text = data.get("text", "")
        
        if not character_data:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Character data is required"
                }
            )
            
        # Extract lore entries from character metadata
        lore_entries = lore_handler.extract_lore_from_metadata(character_data)
        
        # If text is provided, match lore entries against it
        matched_entries = []
        if chat_text:
            matched_entries = lore_handler.match_lore_entries(lore_entries, chat_text)
            
        # Return all lore entries and matched entries
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "lore_entries": lore_entries,
                "matched_entries": matched_entries,
                "count": len(lore_entries),
                "matched_count": len(matched_entries)
            }
        )
    except Exception as e:
        logger.log_error(f"Error extracting lore: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to extract lore: {str(e)}"
            }
        )