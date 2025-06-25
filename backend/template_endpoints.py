# backend/template_endpoints.py
# Implements API endpoints for template management with standardized FastAPI patterns
import json
import traceback
from typing import Dict, List, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

# Import handler types for type hinting
from backend.log_manager import LogManager
from backend.template_handler import TemplateHandler

# Import standardized response models and error handling
from backend.response_models import (
    DataResponse,
    ListResponse,
    ErrorResponse,
    STANDARD_RESPONSES,
    create_data_response,
    create_list_response,
    create_error_response
)
from backend.error_handlers import (
    handle_database_error,
    handle_validation_error,
    handle_generic_error,
    NotFoundException,
    ValidationException
)
from backend.dependencies import (
    get_logger_dependency,
    get_template_handler_dependency
)

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

class TemplateCreate(TemplateBase):
    pass

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    userFormat: Optional[str] = None
    assistantFormat: Optional[str] = None
    description: Optional[str] = None
    systemFormat: Optional[str] = None
    memoryFormat: Optional[str] = None
    stopSequences: Optional[List[str]] = None
    detectionPatterns: Optional[List[str]] = None

# Create router
router = APIRouter(
    prefix="/api",
    tags=["templates"],
    responses={404: {"description": "Not found"}}
)

@router.get("/templates", response_model=ListResponse, responses=STANDARD_RESPONSES)
async def get_templates(
    template_handler: TemplateHandler = Depends(get_template_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Get all templates with standardized response."""
    try:
        logger.log_step("Getting all templates")
        templates = template_handler.get_all_templates()
        
        return create_list_response(templates, total=len(templates))
    except Exception as e:
        logger.log_error(f"Error getting templates: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "Failed to get templates")

@router.post("/templates/save", response_model=DataResponse, responses=STANDARD_RESPONSES)
async def save_template(
    request: Request,
    template_handler: TemplateHandler = Depends(get_template_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Save a template with standardized response."""
    try:
        # Parse JSON body
        template_data = await request.json()
        
        if not template_data:
            raise ValidationException("No template data provided")
        
        logger.log_step(f"Saving template: {template_data.get('name', 'Unknown')}")
        
        # Save the template
        result = template_handler.save_template(template_data)
        
        if result.get("success"):
            return create_data_response({
                "message": "Template saved successfully",
                "template": result.get("template")
            })
        else:
            return create_error_response(
                result.get("message", "Failed to save template"),
                400
            )
    except ValidationException as e:
        return handle_validation_error(e)
    except Exception as e:
        logger.log_error(f"Error saving template: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "Failed to save template")

@router.delete("/templates/{template_id}", response_model=DataResponse, responses=STANDARD_RESPONSES)
async def delete_template(
    template_id: str,
    template_handler: TemplateHandler = Depends(get_template_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Delete a template with standardized response."""
    try:
        logger.log_step(f"Deleting template: {template_id}")
        
        # Check if template exists
        template = template_handler.get_template_by_id(template_id)
        if not template:
            raise NotFoundException(f"Template with ID '{template_id}' not found")
        
        # Check if template is editable
        if not template.get("isEditable", True):
            raise ValidationException("Cannot delete built-in templates")
        
        # Delete the template
        result = template_handler.delete_template(template_id)
        
        if result.get("success"):
            return create_data_response({
                "message": "Template deleted successfully"
            })
        else:
            return create_error_response(
                result.get("message", "Failed to delete template"),
                400
            )
    except (NotFoundException, ValidationException) as e:
        if isinstance(e, NotFoundException):
            return create_error_response(str(e), "404")
        else:
            return handle_validation_error(e)
    except Exception as e:
        logger.log_error(f"Error deleting template: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "Failed to delete template")

@router.get("/templates/{template_id}", response_model=DataResponse, responses=STANDARD_RESPONSES)
async def get_template_by_id(
    template_id: str,
    template_handler: TemplateHandler = Depends(get_template_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Get a specific template by ID with standardized response."""
    try:
        logger.log_step(f"Getting template: {template_id}")
        
        template = template_handler.get_template_by_id(template_id)
        if not template:
            raise NotFoundException(f"Template with ID '{template_id}' not found")
        
        return create_data_response({
            "template": template
        })
    except NotFoundException as e:
        return create_error_response(str(e), "404")
    except Exception as e:
        logger.log_error(f"Error getting template {template_id}: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "Failed to get template")

@router.put("/templates/{template_id}", response_model=DataResponse, responses=STANDARD_RESPONSES)
async def update_template(
    template_id: str,
    template_update: TemplateUpdate,
    template_handler: TemplateHandler = Depends(get_template_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Update a template with standardized response."""
    try:
        logger.log_step(f"Updating template: {template_id}")
        
        # Check if template exists
        existing_template = template_handler.get_template_by_id(template_id)
        if not existing_template:
            raise NotFoundException(f"Template with ID '{template_id}' not found")
        
        # Check if template is editable
        if not existing_template.get("isEditable", True):
            raise ValidationException("Cannot modify built-in templates")
        
        # Update the template
        update_data = template_update.dict(exclude_unset=True)
        result = template_handler.update_template(template_id, update_data)
        
        if result.get("success"):
            return create_data_response({
                "message": "Template updated successfully",
                "template": result.get("template")
            })
        else:
            return create_error_response(
                result.get("message", "Failed to update template"),
                400
            )
    except (NotFoundException, ValidationException) as e:
        if isinstance(e, NotFoundException):
            return create_error_response(str(e), "404")
        else:
            return handle_validation_error(e)
    except Exception as e:
        logger.log_error(f"Error updating template {template_id}: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "Failed to update template")

@router.post("/templates/detect", response_model=DataResponse, responses=STANDARD_RESPONSES)
async def detect_template(
    request: Request,
    template_handler: TemplateHandler = Depends(get_template_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Detect template from text sample with standardized response."""
    try:
        # Parse JSON body
        request_data = await request.json()
        text_sample = request_data.get("text", "")
        
        if not text_sample:
            raise ValidationException("No text sample provided for detection")
        
        logger.log_step("Detecting template from text sample")
        
        # Detect template
        detected_template = template_handler.detect_template(text_sample)
        
        return create_data_response({
            "detected_template": detected_template,
            "confidence": detected_template.get("confidence", 0) if detected_template else 0
        })
    except ValidationException as e:
        return handle_validation_error(e)
    except Exception as e:
        logger.log_error(f"Error detecting template: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "Failed to detect template")
