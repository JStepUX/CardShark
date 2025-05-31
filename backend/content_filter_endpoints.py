# backend/content_filter_endpoints.py
# Description: Implements API endpoints for content filtering management
import json
import traceback
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

# Import handler types for type hinting
from backend.log_manager import LogManager
from backend.content_filter_manager import ContentFilterManager

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
    get_content_filter_manager_dependency
)

# Legacy dependency functions - replaced by standardized dependencies
# def get_logger() -> LogManager:
#     from backend.main import logger
#     if logger is None: raise ValidationException("Logger not initialized")
#     return logger

# def get_content_filter_manager() -> ContentFilterManager:
#     from backend.main import content_filter_manager
#     if content_filter_manager is None: raise ValidationException("Content filter manager not initialized")
#     return content_filter_manager

# Create router
router = APIRouter(
    prefix="/api",
    tags=["content-filters"],
    responses=STANDARD_RESPONSES
)

# Define Pydantic models for request bodies
class ContentFilterUpdatePayload(BaseModel):
    rules: List[Dict[str, Any]]

class RemoveIncompleteSentencesPayload(BaseModel):
    enabled: bool
    
class FilterPackagePayload(BaseModel):
    id: str

class CreateFilterPackagePayload(BaseModel):
    package_info: Dict[str, Any]
    rules: List[Dict[str, Any]]

class UpdateFilterPackagePayload(BaseModel):
    rules: List[Dict[str, Any]]

# --- Content Filter Endpoints ---

@router.get("/content-filters", response_model=DataResponse[Dict])
async def get_content_filters(
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Get all content filtering rules."""
    try:
        rules = content_filter_manager.get_filters()
        return create_data_response({"rules": rules})
    except Exception as e:
        logger.log_error(f"Error getting content filters: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "getting content filters")

@router.post("/content-filters", response_model=DataResponse[Dict])
async def update_content_filters(
    payload: ContentFilterUpdatePayload,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Update content filtering rules."""
    try:
        logger.log_step(f"Received content filters update: {len(payload.rules)} rules")

        if not payload.rules:
            payload.rules = []  # Ensure we have at least an empty list

        # Update the rules
        success = content_filter_manager.update_filters(payload.rules)
        if not success:
            raise ValidationException("Failed to update content filters")

        return create_data_response({
            "message": "Content filters updated successfully",
            "rules": content_filter_manager.get_filters()
        })
    except ValidationException:
        raise
    except Exception as e:
        logger.log_error(f"Error updating content filters: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "updating content filters")

@router.put("/content-filters", response_model=DataResponse[Dict])
async def update_content_filters_put(
    payload: ContentFilterUpdatePayload,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Update content filtering rules via PUT request."""
    try:
        logger.log_step(f"Received content filters update via PUT: {len(payload.rules)} rules")

        if not payload.rules:
            payload.rules = []  # Ensure we have at least an empty list

        # Update the rules
        success = content_filter_manager.update_filters(payload.rules)
        if not success:
            raise ValidationException("Failed to update content filters")

        return create_data_response({
            "message": "Content filters updated successfully",
            "rules": content_filter_manager.get_filters()
        })
    except ValidationException:
        raise
    except Exception as e:
        logger.log_error(f"Error updating content filters via PUT: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "updating content filters")

@router.post("/content-filters/incomplete-sentences", response_model=DataResponse[Dict])
async def update_incomplete_sentences_setting(
    payload: RemoveIncompleteSentencesPayload,
    logger: LogManager = Depends(get_logger_dependency)
):
    """Update the remove incomplete sentences setting."""
    try:
        from backend.main import settings_manager
        
        logger.log_step(f"Updating remove_incomplete_sentences setting: {payload.enabled}")
        
        # Update the setting in the main settings
        success = settings_manager.update_settings({"remove_incomplete_sentences": payload.enabled})
        if not success:
            raise ValidationException("Failed to update incomplete sentences setting")
            
        # Save settings to persist the change
        settings_manager.save_settings()
        
        return create_data_response({
            "message": "Incomplete sentences setting updated successfully",
            "enabled": payload.enabled
        })
    except ValidationException:
        raise
    except Exception as e:
        logger.log_error(f"Error updating incomplete sentences setting: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "updating incomplete sentences setting")

# --- Filter Package Endpoints ---

@router.get("/content-filters/packages", response_model=DataResponse[Dict])
async def get_filter_packages(
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Get all available filter packages."""
    try:
        packages = content_filter_manager.get_available_packages()
        return create_data_response({"packages": packages})
    except Exception as e:
        logger.log_error(f"Error getting filter packages: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "getting filter packages")

@router.get("/content-filters/active-packages", response_model=DataResponse[Dict])
async def get_active_filter_packages(
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Get active filter packages."""
    try:
        packages = content_filter_manager.get_active_packages()
        return create_data_response({"packages": packages})
    except Exception as e:
        logger.log_error(f"Error getting active filter packages: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "getting active filter packages")

@router.get("/content-filters/package/{package_id}", response_model=DataResponse[Dict])
async def get_filter_package_rules(
    package_id: str,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Get rules for a specific filter package."""
    try:
        rules = content_filter_manager.get_package_rules(package_id)
        return create_data_response({
            "package_id": package_id,
            "rules": rules
        })
    except Exception as e:
        logger.log_error(f"Error getting filter package rules: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "getting filter package rules")

@router.post("/content-filters/package/activate", response_model=DataResponse[Dict])
async def activate_filter_package(
    payload: FilterPackagePayload,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Activate a filter package."""
    try:
        success = content_filter_manager.activate_package(payload.id)
        if not success:
            raise ValidationException(f"Failed to activate filter package: {payload.id}")
        
        return create_data_response({
            "message": f"Filter package activated: {payload.id}"
        })
    except ValidationException:
        raise
    except Exception as e:
        logger.log_error(f"Error activating filter package: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "activating filter package")

@router.post("/content-filters/package/deactivate", response_model=DataResponse[Dict])
async def deactivate_filter_package(
    payload: FilterPackagePayload,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Deactivate a filter package."""
    try:
        success = content_filter_manager.deactivate_package(payload.id)
        if not success:
            raise ValidationException(f"Failed to deactivate filter package: {payload.id}")
        
        return create_data_response({
            "message": f"Filter package deactivated: {payload.id}"
        })
    except ValidationException:
        raise
    except Exception as e:
        logger.log_error(f"Error deactivating filter package: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "deactivating filter package")

@router.post("/content-filters/package", response_model=DataResponse[Dict], status_code=201)
async def create_filter_package(
    payload: CreateFilterPackagePayload,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Create a new filter package."""
    try:
        success = content_filter_manager.create_filter_package(payload.package_info.get('id'), payload.package_info)
        if not success:
            raise ValidationException("Failed to create filter package")
        
        # Get updated packages list
        packages = content_filter_manager.get_available_packages()
        
        return create_data_response({
            "message": "Filter package created successfully",
            "packages": packages
        })
    except ValidationException:
        raise
    except Exception as e:
        logger.log_error(f"Error creating filter package: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "creating filter package")

@router.put("/content-filters/package/{package_id}", response_model=DataResponse[Dict])
async def update_filter_package(
    package_id: str,
    payload: UpdateFilterPackagePayload,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Update an existing filter package."""
    try:
        success = content_filter_manager.update_filter_package(package_id, payload.rules)
        if not success:
            raise ValidationException(f"Failed to update filter package: {package_id}")
        
        return create_data_response({
            "message": f"Filter package updated: {package_id}"
        })
    except ValidationException:
        raise
    except Exception as e:
        logger.log_error(f"Error updating filter package: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "updating filter package")

@router.delete("/content-filters/package/{package_id}", response_model=DataResponse[Dict])
async def delete_filter_package(
    package_id: str,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Delete a filter package."""
    try:
        success = content_filter_manager.delete_filter_package(package_id)
        if not success:
            raise ValidationException(f"Failed to delete filter package: {package_id}")
        
        return create_data_response({
            "message": f"Filter package deleted: {package_id}"
        })
    except ValidationException:
        raise
    except Exception as e:
        logger.log_error(f"Error deleting filter package: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, logger, "deleting filter package")
