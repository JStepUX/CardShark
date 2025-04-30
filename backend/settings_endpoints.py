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
        self.api_handler = None  # Will be set by main.py after initialization
        self.template_handler = None  # Will be set by main.py after initialization
        
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

        @router.post("/api/test-connection")
        async def test_api_connection(request: Request):
            """Test connection to an API endpoint with provider-specific handling."""
            try:
                import time
                
                # Get request data and log it
                data = await request.json()
                self.logger.log_step(f"Testing API connection with data: {data}")
                
                url = data.get('url')
                api_key = data.get('apiKey')
                provider = data.get('provider')
                model = data.get('model')
                template_id = data.get('templateId')
                
                if not url:
                    self.logger.log_warning("No URL provided")
                    return JSONResponse(
                        status_code=400,
                        content={"success": False, "message": "URL is required"}
                    )
                
                # Log the connection attempt details
                self.logger.log_step(f"Attempting connection to: {url}")
                self.logger.log_step(f"Provider: {provider}")
                self.logger.log_step(f"Model: {model}")
                
                # Import here to avoid circular imports
                from backend.api_provider_adapters import get_provider_adapter
                
                # Get the adapter for this provider
                adapter = get_provider_adapter(provider, self.logger)
                
                # Get the correct endpoint URL based on provider
                endpoint_url = adapter.get_endpoint_url(url)
                self.logger.log_step(f"Using endpoint URL: {endpoint_url}")
                
                # Get the correct headers based on provider
                headers = adapter.prepare_headers(api_key)
                self.logger.log_step(f"Headers prepared (keys only): {list(headers.keys())}")
                
                # Prepare test message with provider-specific format
                test_data = adapter.prepare_request_data(
                    prompt="Hi",
                    memory="You are a helpful assistant.",
                    stop_sequence=["User:", "Human:", "Assistant:"],
                    generation_settings={
                        "max_length": 10,
                        "temperature": 0.7,
                        "model": model
                    }
                )
                
                self.logger.log_step(f"Test data prepared: {test_data}")
                
                # Make the test request
                import requests
                response = requests.post(
                    endpoint_url,
                    headers=headers,
                    json=test_data,
                    timeout=10
                )
                
                self.logger.log_step(f"Response status: {response.status_code}")
                
                try:
                    response_data = response.json()
                    self.logger.log_step(f"Response data: {response_data}")
                except:
                    self.logger.log_warning("Could not parse response as JSON")
                    response_data = None
                
                if response.status_code == 200:
                    self.logger.log_step("Connection test successful")
                    
                    # Get model info - safely handle None response_data
                    model_info = {
                        "id": "unknown",
                        "name": provider or "unknown"
                    }
                    
                    if response_data:
                        model_info["id"] = response_data.get("model") or response_data.get("id") or model or "unknown"
                        model_info["name"] = response_data.get("model_name") or response_data.get("name") or response_data.get("model") or provider or "unknown"
                    
                    # Try to detect template from response content
                    detected_template = None
                    if response_data and response_data.get("choices") and len(response_data.get("choices", [])) > 0:
                        choice = response_data["choices"][0]
                        content = choice.get("message", {}).get("content") or choice.get("text", "")
                        
                        # Simple detection - look for common template markers
                        if content and "<|im_start|>" in content or "<|im_end|>" in content:
                            detected_template = "chatml"
                        elif content and "[/INST]" in content:
                            detected_template = "mistral"
                        elif content and "<|start_header_id|>" in content:
                            detected_template = "llama3"
                    
                    self.logger.log_step(f"Detected template: {detected_template}")
                
                    return JSONResponse(
                        status_code=200,
                        content={
                            "success": True,
                            "message": "Connection successful",
                            "model": model_info,
                            "detected_template": detected_template,
                            "timestamp": time.time()
                        }
                    )
                else:
                    error_msg = "Connection failed"
                    if response_data and 'error' in response_data:
                        error_msg = f"{error_msg}: {response_data['error']}"
                    
                    self.logger.log_warning(f"Connection test failed: {error_msg}")
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "message": error_msg,
                            "timestamp": time.time()
                        }
                    )
                
            except Exception as e:
                import time
                self.logger.log_error(f"API connection test error: {str(e)}")
                self.logger.log_error(traceback.format_exc())
                return JSONResponse(
                    status_code=500,
                    content={
                        "success": False,
                        "message": str(e),
                        "timestamp": time.time()
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


@router.post("/api/openrouter/models")
async def get_openrouter_models(request: Request):
    """Fetch available models from OpenRouter."""
    try:
        data = await request.json()
        url = data.get('url', 'https://openrouter.ai')
        api_key = data.get('apiKey')
        
        if not url or not api_key:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": "URL and API key are required"}
            )
            
        # Import required classes
        from backend.api_provider_adapters import OpenRouterAdapter
        from backend.log_manager import LogManager
        
        # Create logger and adapter
        logger = LogManager()
        adapter = OpenRouterAdapter(logger)
        
        # Fetch models
        result = adapter.list_models(url, api_key)
        
        if not result.get('success', False):
            return JSONResponse(
                status_code=500,
                content=result
            )
            
        return JSONResponse(content=result)
    except Exception as e:
        import traceback
        logger.log_error(f"Error fetching OpenRouter models: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Failed to fetch models: {str(e)}"}
        )