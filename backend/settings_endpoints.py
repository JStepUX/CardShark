# backend/settings_endpoints.py
# Implements API endpoints for settings management
import json
import os
import time
import traceback
from pathlib import Path
from typing import Dict, Any, Optional, List # Added List

from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Import handler types for type hinting
from backend.log_manager import LogManager
from backend.settings_manager import SettingsManager
# Import adapters needed for test_connection
from backend.api_provider_adapters import get_provider_adapter
import requests # Import requests directly for test_connection

# Dependency provider functions (defined locally, import from main inside)
def get_logger() -> LogManager:
    from backend.main import logger # Import locally
    if logger is None: raise HTTPException(status_code=500, detail="Logger not initialized")
    return logger

def get_settings_manager() -> SettingsManager:
    from backend.main import settings_manager # Import locally
    if settings_manager is None: raise HTTPException(status_code=500, detail="Settings manager not initialized")
    return settings_manager

# Create router
router = APIRouter(
    prefix="/api", # Corrected prefix
    tags=["settings", "utilities"], # Added utilities tag
)

# Define Pydantic models for request bodies
class DirectoryPath(BaseModel):
    directory: str

class SettingsUpdatePayload(BaseModel):
    settings: Dict[str, Any]

class TestConnectionPayload(BaseModel):
    url: str
    apiKey: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    templateId: Optional[str] = None # Keep if used by adapters

# --- Settings Endpoints ---

@router.get("/settings") # Corrected path
async def get_settings(
    settings_manager: SettingsManager = Depends(get_settings_manager),
    logger: LogManager = Depends(get_logger)
):
    """Get all application settings."""
    try:
        settings = settings_manager.settings
        logger.log_step("Serving settings")
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "settings": settings
            }
        )
    except Exception as e:
        logger.log_error(f"Error getting settings: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"Failed to get settings: {str(e)}"
            }
        )

@router.post("/settings") # Corrected path
async def update_settings(
    payload: Dict[str, Any], # Accept raw dict to handle both formats
    settings_manager: SettingsManager = Depends(get_settings_manager),
    logger: LogManager = Depends(get_logger)
):
    """Update application settings."""
    try:
        # Handle both formats: direct object or nested under "settings" key
        if "settings" in payload:
            new_settings = payload.get("settings")
        else:
            new_settings = payload # Assume direct payload is the settings object

        logger.log_step(f"Received settings update: {json.dumps(new_settings)}")

        if not new_settings or not isinstance(new_settings, dict):
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Invalid or no settings provided"}
            )

        # Apply new settings
        logger.log_step("Updating settings")
        settings_manager.update_settings(new_settings)

        # Save settings to file
        settings_manager.save_settings()

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Settings updated successfully",
                "settings": settings_manager.settings
            }
        )
    except Exception as e:
        logger.log_error(f"Error updating settings: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to update settings: {str(e)}"}
        )

# --- Template Endpoints Removed ---
# (These should be in template_endpoints.py)

# --- Utility Endpoints ---

@router.post("/test-connection") # Corrected path
async def test_api_connection(
    payload: TestConnectionPayload,
    logger: LogManager = Depends(get_logger)
):
    """Test connection to an API endpoint with provider-specific handling."""
    try:
        logger.log_step(f"Testing API connection with data: {payload.dict()}")

        url = payload.url
        api_key = payload.apiKey
        provider = payload.provider
        model = payload.model
        # template_id = payload.templateId # Use if needed by adapter

        if not url:
            logger.log_warning("No URL provided")
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "URL is required"}
            )

        logger.log_step(f"Attempting connection to: {url}")
        logger.log_step(f"Provider: {provider}")
        logger.log_step(f"Model: {model}")

        # Get the adapter for this provider
        adapter = get_provider_adapter(provider, logger)

        # Get the correct endpoint URL based on provider
        endpoint_url = adapter.get_endpoint_url(url)
        logger.log_step(f"Using endpoint URL: {endpoint_url}")

        # Get the correct headers based on provider
        headers = adapter.prepare_headers(api_key)
        logger.log_step(f"Headers prepared (keys only): {list(headers.keys())}")

        # For test purposes, create a non-streaming request
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

        # Ensure stream flag is set to False for testing purposes
        test_data["stream"] = False
        logger.log_step(f"Test data prepared: {test_data}")

        # Make the test request
        response = requests.post(
            endpoint_url,
            headers=headers,
            json=test_data,
            timeout=10
        )

        logger.log_step(f"Response status: {response.status_code}")

        # Try to parse as JSON
        response_data = None
        try:
            response_data = response.json()
            logger.log_step(f"Response data: {json.dumps(response_data)[:500]}...")
        except Exception as json_err:
            logger.log_warning(f"Could not parse response as JSON: {str(json_err)}")
            logger.log_step(f"Raw response: {response.text[:100]}...")

        # Check for a successful connection
        if response.status_code == 200:
            logger.log_step("Connection test successful")

            # Get model info - safely handle None response_data
            model_info = {
                "id": model or "unknown",
                "name": model or provider or "unknown"
            }

            if response_data and isinstance(response_data, dict):
                model_info["id"] = (
                    response_data.get("model") or
                    response_data.get("id") or
                    model or
                    "unknown"
                )
                model_info["name"] = (
                    response_data.get("model_name") or
                    response_data.get("name") or
                    response_data.get("model") or
                    model or
                    provider or
                    "unknown"
                )

            # Try to detect template from response content
            detected_template = None
            if response_data and isinstance(response_data, dict):
                if response_data.get("choices") and len(response_data.get("choices", [])) > 0:
                    choice = response_data["choices"][0]
                    content = ""
                    if "message" in choice and "content" in choice["message"]:
                        content = choice["message"]["content"]
                    elif "text" in choice:
                        content = choice["text"]
                    elif "delta" in choice and "content" in choice["delta"]:
                        content = choice["delta"]["content"]

                    if content:
                        if "<|im_start|>" in content or "<|im_end|>" in content:
                            detected_template = "chatml"
                        elif "[/INST]" in content:
                            detected_template = "mistral"
                        elif "<|start_header_id|>" in content:
                            detected_template = "llama3"

            logger.log_step(f"Detected template: {detected_template}")

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
            error_msg = f"Connection failed with status {response.status_code}"
            if response_data and isinstance(response_data, dict) and 'error' in response_data:
                if isinstance(response_data['error'], dict) and 'message' in response_data['error']:
                    error_msg = f"{error_msg}: {response_data['error']['message']}"
                else:
                    error_msg = f"{error_msg}: {response_data['error']}"
            elif response.text:
                error_msg = f"{error_msg}: {response.text[:200]}"

            logger.log_warning(f"Connection test failed: {error_msg}")
            return JSONResponse(
                status_code=400, # Use 400 for client-side config errors or connection failures
                content={
                    "success": False,
                    "message": error_msg,
                    "timestamp": time.time()
                }
            )

    except Exception as e:
        logger.log_error(f"API connection test error: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": str(e),
                "timestamp": time.time()
            }
        )

@router.post("/validate-directory") # Corrected path
async def validate_directory(
    payload: DirectoryPath,
    logger: LogManager = Depends(get_logger)
):
    """Validate if a given path is an existing directory."""
    try:
        dir_path_str = payload.directory
        logger.log_step(f"Validating directory path: {dir_path_str}")

        # Basic security check (optional, adjust as needed)
        # if ".." in dir_path_str:
        #     logger.log_warning(f"Directory path contains '..': {dir_path_str}")
            # raise HTTPException(status_code=400, detail="Path traversal attempt detected ('..' not allowed).")

        dir_path = Path(dir_path_str)
        is_valid = dir_path.is_dir()
        logger.log_step(f"Path '{dir_path_str}' is_dir: {is_valid}")

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "exists": is_valid,
                "path": dir_path_str
            }
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.log_error(f"Error validating directory '{payload.directory}': {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=200, # Return 200 but indicate failure in payload
            content={
                "success": False,
                "exists": False,
                "path": payload.directory,
                "message": f"Error validating directory: {str(e)}"
            }
        )

@router.put("/settings")
async def update_settings_put(
    payload: Dict[str, Any],
    settings_manager: SettingsManager = Depends(get_settings_manager),
    logger: LogManager = Depends(get_logger)
):
    """Update application settings via PUT request."""
    try:
        # Handle both formats: direct object or nested under "settings" key
        if "settings" in payload:
            new_settings = payload.get("settings")
        else:
            new_settings = payload  # Assume direct payload is the settings object

        logger.log_step(f"Received settings update via PUT: {json.dumps(new_settings)}")

        if not new_settings or not isinstance(new_settings, dict):
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Invalid or no settings provided"}
            )

        # Apply new settings
        logger.log_step("Updating settings")
        settings_manager.update_settings(new_settings)

        # Save settings to file
        settings_manager.save_settings()

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Settings updated successfully",
                "settings": settings_manager.settings
            }
        )
    except Exception as e:
        logger.log_error(f"Error updating settings via PUT: {str(e)}")
        logger.log_error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to update settings: {str(e)}"}
        )