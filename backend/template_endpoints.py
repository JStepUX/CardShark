# backend/template_endpoints.py
# Implements API endpoints for template management
import json
import traceback
from typing import Dict, List, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Import handler types for type hinting
from backend.log_manager import LogManager
from backend.template_handler import TemplateHandler

# Dependency provider functions (defined locally, import from main inside)
def get_logger() -> LogManager:
    from backend.main import logger  # Import locally
    if logger is None: raise HTTPException(status_code=500, detail="Logger not initialized")
    return logger

def get_template_handler() -> TemplateHandler:
    from backend.main import template_handler  # Import locally
    if template_handler is None: raise HTTPException(status_code=500, detail="Template handler not initialized")
    return template_handler

# Template models
class TemplateBase(BaseModel):
    id: str
    name: str
    userFormat: str
    assistantFormat: str
    description: Optional[str] = ""
    systemFormat: Optional[str] = None
    memoryFormat: Optional[str] = None
    stopSequences: Optional[List[str]] = None
    detectionPatterns: Optional[List[str]] = None
    isBuiltIn: bool = False
    isEditable: bool = True

# Create router
router = APIRouter(
    prefix="/api",  # Use common /api prefix
    tags=["templates"],
    responses={404: {"description": "Not found"}}
)

@router.get("/templates")
async def get_templates(
    template_handler: TemplateHandler = Depends(get_template_handler),
    logger: LogManager = Depends(get_logger)
):
    """Get all templates."""
    try:
        logger.log_step("Getting all templates")
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
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to get templates: {str(e)}"
            }
        )

@router.post("/templates/save")
async def save_template(
    request: Request,
    template_handler: TemplateHandler = Depends(get_template_handler),
    logger: LogManager = Depends(get_logger)
):
    """Save a template."""
    try:
        # Parse JSON body
        template_data = await request.json()
        
        if not template_data:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "No template data provided"
                }
            )
            
        # Save template
        logger.log_step(f"Saving template: {template_data.get('id')}")
        success = template_handler.save_template(template_data)
        
        if success:
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "Template saved successfully"
                }
            )
        else:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "message": "Failed to save template"
                }
            )
    except json.JSONDecodeError as e:
        logger.log_error(f"Error parsing template JSON: {str(e)}")
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": f"Invalid JSON: {str(e)}"
            }
        )
    except Exception as e:
        logger.log_error(f"Error saving template: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to save template: {str(e)}"
            }
        )
        
@router.post("/templates/delete")
async def delete_template(
    request: Request,
    template_handler: TemplateHandler = Depends(get_template_handler),
    logger: LogManager = Depends(get_logger)
):
    """Delete a template."""
    try:
        # Parse JSON body
        data = await request.json()
        
        template_id = data.get("id")
        if not template_id:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Template ID is required"
                }
            )
            
        # Delete template
        logger.log_step(f"Deleting template: {template_id}")
        success = template_handler.delete_template(template_id)
        
        if success:
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "Template deleted successfully"
                }
            )
        else:
            return JSONResponse(
                status_code=404,
                content={
                    "success": False,
                    "message": "Template not found or could not be deleted"
                }
            )
    except Exception as e:
        logger.log_error(f"Error deleting template: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to delete template: {str(e)}"
            }
        )

@router.post("/templates/import")
async def import_templates(
    request: Request,
    template_handler: TemplateHandler = Depends(get_template_handler),
    logger: LogManager = Depends(get_logger)
):
    """Import multiple templates."""
    try:
        # Parse JSON body
        data = await request.json()
        
        templates = data.get("templates")
        if not templates or not isinstance(templates, list):
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "No templates provided or invalid format"
                }
            )
            
        # Save templates
        logger.log_step(f"Importing {len(templates)} templates")
        success = template_handler.save_templates(templates)
        
        if success:
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": f"Successfully imported {len(templates)} templates"
                }
            )
        else:
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "message": "Some templates failed to import"
                }
            )
    except json.JSONDecodeError as e:
        logger.log_error(f"Error parsing templates JSON: {str(e)}")
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": f"Invalid JSON: {str(e)}"
            }
        )
    except Exception as e:
        logger.log_error(f"Error importing templates: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to import templates: {str(e)}"
            }
        )
