# backend/content_filter_endpoints.py
# Description: Implements API endpoints for content filtering management
import json
import traceback
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Import handler types for type hinting
from backend.log_manager import LogManager
from backend.content_filter_manager import ContentFilterManager

# Dependency provider functions (defined locally, import from main inside)
def get_logger() -> LogManager:
    from backend.main import logger
    if logger is None: raise HTTPException(status_code=500, detail="Logger not initialized")
    return logger

def get_content_filter_manager() -> ContentFilterManager:
    from backend.main import content_filter_manager
    if content_filter_manager is None: raise HTTPException(status_code=500, detail="Content filter manager not initialized")
    return content_filter_manager

# Create router
router = APIRouter(
    prefix="/api",
    tags=["content-filters"],
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

@router.get("/content-filters")
async def get_content_filters(
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager),
    logger: LogManager = Depends(get_logger)
):
    """Get all content filtering rules."""
    try:
        rules = content_filter_manager.get_filters()
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "rules": rules
            }
        )
    except Exception as e:
        logger.log_error(f"Error getting content filters: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to get content filters: {str(e)}"
            }
        )

@router.post("/content-filters")
async def update_content_filters(
    payload: ContentFilterUpdatePayload,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager),
    logger: LogManager = Depends(get_logger)
):
    """Update content filtering rules."""
    try:
        logger.log_step(f"Received content filters update: {len(payload.rules)} rules")

        if not payload.rules:
            payload.rules = []  # Ensure we have at least an empty list

        # Update the rules
        success = content_filter_manager.update_filters(payload.rules)
        if not success:
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": "Failed to update content filters"}
            )

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Content filters updated successfully",
                "rules": content_filter_manager.get_filters()
            }
        )
    except Exception as e:
        logger.log_error(f"Error updating content filters: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to update content filters: {str(e)}"}
        )

@router.put("/content-filters")
async def update_content_filters_put(
    payload: ContentFilterUpdatePayload,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager),
    logger: LogManager = Depends(get_logger)
):
    """Update content filtering rules via PUT request."""
    try:
        logger.log_step(f"Received content filters update via PUT: {len(payload.rules)} rules")

        if not payload.rules:
            payload.rules = []  # Ensure we have at least an empty list

        # Update the rules
        success = content_filter_manager.update_filters(payload.rules)
        if not success:
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": "Failed to update content filters"}
            )

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Content filters updated successfully",
                "rules": content_filter_manager.get_filters()
            }
        )
    except Exception as e:
        logger.log_error(f"Error updating content filters via PUT: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to update content filters: {str(e)}"}
        )

@router.post("/content-filters/incomplete-sentences")
async def update_incomplete_sentences_setting(
    payload: RemoveIncompleteSentencesPayload,
    logger: LogManager = Depends(get_logger)
):
    """Update the remove incomplete sentences setting."""
    try:
        from backend.main import settings_manager
        
        logger.log_step(f"Updating remove_incomplete_sentences setting: {payload.enabled}")
        
        # Update the setting in the main settings
        success = settings_manager.update_settings({"remove_incomplete_sentences": payload.enabled})
        if not success:
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": "Failed to update incomplete sentences setting"}
            )
            
        # Save settings to persist the change
        settings_manager.save_settings()
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Incomplete sentences setting updated successfully",
                "enabled": payload.enabled
            }
        )
    except Exception as e:
        logger.log_error(f"Error updating incomplete sentences setting: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to update incomplete sentences setting: {str(e)}"}
        )

# --- Filter Package Endpoints ---

@router.get("/content-filters/packages")
async def get_filter_packages(
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager),
    logger: LogManager = Depends(get_logger)
):
    """Get all available filter packages."""
    try:
        packages = content_filter_manager.get_available_packages()
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "packages": packages
            }
        )
    except Exception as e:
        logger.log_error(f"Error getting filter packages: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to get filter packages: {str(e)}"}
        )

@router.get("/content-filters/active-packages")
async def get_active_filter_packages(
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager),
    logger: LogManager = Depends(get_logger)
):
    """Get active filter packages."""
    try:
        packages = content_filter_manager.get_active_packages()
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "packages": packages
            }
        )
    except Exception as e:
        logger.log_error(f"Error getting active filter packages: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to get active filter packages: {str(e)}"}
        )

@router.get("/content-filters/package/{package_id}")
async def get_filter_package_rules(
    package_id: str,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager),
    logger: LogManager = Depends(get_logger)
):
    """Get rules for a specific filter package."""
    try:
        rules = content_filter_manager.get_package_rules(package_id)
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "package_id": package_id,
                "rules": rules
            }
        )
    except Exception as e:
        logger.log_error(f"Error getting filter package rules: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to get filter package rules: {str(e)}"}
        )

@router.post("/content-filters/package/activate")
async def activate_filter_package(
    payload: FilterPackagePayload,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager),
    logger: LogManager = Depends(get_logger)
):
    """Activate a filter package."""
    try:
        success = content_filter_manager.activate_package(payload.id)
        if not success:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": f"Failed to activate filter package: {payload.id}"}
            )
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"Filter package activated: {payload.id}"
            }
        )
    except Exception as e:
        logger.log_error(f"Error activating filter package: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to activate filter package: {str(e)}"}
        )

@router.post("/content-filters/package/deactivate")
async def deactivate_filter_package(
    payload: FilterPackagePayload,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager),
    logger: LogManager = Depends(get_logger)
):
    """Deactivate a filter package."""
    try:
        success = content_filter_manager.deactivate_package(payload.id)
        if not success:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": f"Failed to deactivate filter package: {payload.id}"}
            )
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"Filter package deactivated: {payload.id}"
            }
        )
    except Exception as e:
        logger.log_error(f"Error deactivating filter package: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to deactivate filter package: {str(e)}"}
        )

@router.post("/content-filters/package")
async def create_filter_package(
    payload: CreateFilterPackagePayload,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager),
    logger: LogManager = Depends(get_logger)
):
    """Create a new filter package."""
    try:
        success = content_filter_manager.create_filter_package(payload.package_info.get('id'), payload.package_info)
        if not success:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Failed to create filter package"}
            )
        
        # Get updated packages list
        packages = content_filter_manager.get_available_packages()
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Filter package created successfully",
                "packages": packages
            }
        )
    except Exception as e:
        logger.log_error(f"Error creating filter package: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to create filter package: {str(e)}"}
        )

@router.put("/content-filters/package/{package_id}")
async def update_filter_package(
    package_id: str,
    payload: UpdateFilterPackagePayload,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager),
    logger: LogManager = Depends(get_logger)
):
    """Update an existing filter package."""
    try:
        success = content_filter_manager.update_filter_package(package_id, payload.rules)
        if not success:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": f"Failed to update filter package: {package_id}"}
            )
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"Filter package updated: {package_id}"
            }
        )
    except Exception as e:
        logger.log_error(f"Error updating filter package: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to update filter package: {str(e)}"}
        )

@router.delete("/content-filters/package/{package_id}")
async def delete_filter_package(
    package_id: str,
    content_filter_manager: ContentFilterManager = Depends(get_content_filter_manager),
    logger: LogManager = Depends(get_logger)
):
    """Delete a filter package."""
    try:
        success = content_filter_manager.delete_filter_package(package_id)
        if not success:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": f"Failed to delete filter package: {package_id}"}
            )
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": f"Filter package deleted: {package_id}"
            }
        )
    except Exception as e:
        logger.log_error(f"Error deleting filter package: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to delete filter package: {str(e)}"}
        )
