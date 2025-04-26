# backend/settings_endpoints.py
# Implements API endpoints for settings management
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
import traceback
from typing import Dict, Any
import json

# Import handlers
from backend.log_manager import LogManager

# Create router
router = APIRouter()

# Initialize local instances (for router pattern)
logger = LogManager()

class SettingsEndpoints:
    """Encapsulates settings-related endpoints."""
    
    def __init__(self, logger, settings_manager):
        """Initialize with dependencies."""
        self.logger = logger
        self.settings_manager = settings_manager
        
    def register_routes(self, router):
        """Register all settings endpoints with the provided router."""
        
        @router.get("/api/settings")
        async def get_settings():
            """Get all settings."""
            try:
                settings = self.settings_manager.settings
                
                self.logger.log_step("Serving settings")
                
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "settings": settings
                    }
                )
                
            except Exception as e:
                self.logger.log_error(f"Error getting settings: {str(e)}")
                self.logger.log_error(traceback.format_exc())
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to get settings: {str(e)}"
                    }
                )

        @router.post("/api/settings")
        async def update_settings(request: Request):
            """Update settings with special handling for APIs and templateId."""
            try:
                data = await request.json()
                
                # Handle both formats: direct object or nested under "settings" key
                if "settings" in data:
                    new_settings = data.get("settings")
                else:
                    # If data is sent directly without being wrapped in a "settings" property
                    new_settings = data
                
                self.logger.log_step(f"Received settings update: {json.dumps(new_settings)}")
                
                if not new_settings:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": "No settings provided"
                        }
                    )
                
                # Apply new settings
                self.logger.log_step("Updating settings")
                self.settings_manager.update_settings(new_settings)
                
                # Save settings to file
                self.settings_manager.save_settings()
                
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "message": "Settings updated successfully",
                        "settings": self.settings_manager.settings
                    }
                )
                
            except Exception as e:
                self.logger.log_error(f"Error updating settings: {str(e)}")
                self.logger.log_error(traceback.format_exc())
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to update settings: {str(e)}"
                    }
                )

        @router.get("/api/templates")
        async def get_templates():
            """Get all available templates."""
            try:
                if hasattr(self, 'template_handler') and self.template_handler:
                    templates = self.template_handler.get_all_templates()
                    
                    self.logger.log_step(f"Serving {len(templates)} templates")
                    
                    return JSONResponse(
                        status_code=200,
                        content={
                            "success": True,
                            "templates": templates
                        }
                    )
                else:
                    self.logger.log_warning("Template handler not available for templates endpoint")
                    return JSONResponse(
                        status_code=200,
                        content={
                            "success": True,
                            "templates": []
                        }
                    )
                    
            except Exception as e:
                self.logger.log_error(f"Error getting templates: {str(e)}")
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to get templates: {str(e)}"
                    }
                )

        @router.post("/api/templates")
        async def save_templates(request: Request):
            """Save templates configuration."""
            try:
                if not hasattr(self, 'template_handler') or not self.template_handler:
                    self.logger.log_warning("Template handler not available for save templates endpoint")
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": "Template handler not available"
                        }
                    )
                
                data = await request.json()
                templates = data.get("templates")
                
                if not templates:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": "No templates provided"
                        }
                    )
                
                # Save templates
                self.template_handler.save_templates(templates)
                
                self.logger.log_step(f"Saved {len(templates)} templates")
                
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": True,
                        "message": "Templates saved successfully"
                    }
                )
                
            except Exception as e:
                self.logger.log_error(f"Error saving templates: {str(e)}")
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": f"Failed to save templates: {str(e)}"
                    }
                )

        @router.get("/api/health")
        async def health_check():
            """Simple health check endpoint."""
            return {"status": "ok"}


# Add direct routes for router pattern usage
@router.get("/api/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok"}