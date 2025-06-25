# backend/settings_endpoints.py
# Implements API endpoints for settings management with standardized FastAPI patterns
import json
import os
import time
import traceback
from pathlib import Path
from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import requests

# Import handler types for type hinting
from backend.log_manager import LogManager
from backend.settings_manager import SettingsManager
# Import adapters needed for test_connection
from backend.api_provider_adapters import get_provider_adapter

# Import standardized response models and error handling
from backend.response_models import (
    DataResponse,
    ErrorResponse,
    STANDARD_RESPONSES,
    create_data_response,
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
    get_settings_manager_dependency
)

# Create router
router = APIRouter(
    prefix="/api",
    tags=["settings", "utilities"],
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
    templateId: Optional[str] = None

class FeatherlessModelsPayload(BaseModel):
    url: str
    apiKey: Optional[str] = None

# --- Settings Endpoints ---

@router.get("/settings", response_model=DataResponse, responses=STANDARD_RESPONSES)
async def get_settings(
    settings_manager: SettingsManager = Depends(get_settings_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Get all application settings with standardized response."""
    try:
        settings = settings_manager.settings
        # Log the specific settings being served, especially models_directory
        logger.log_step(f"Serving settings. models_directory: '{settings.get('models_directory')}', model_directory: '{settings.get('model_directory')}'")
        return create_data_response({
            "settings": settings
        })
    except Exception as e:
        logger.log_error(f"Error getting settings: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "Failed to get settings")

@router.post("/settings", response_model=DataResponse, responses=STANDARD_RESPONSES)
async def update_settings(
    payload: Dict[str, Any],  # Accept raw dict to handle both formats
    settings_manager: SettingsManager = Depends(get_settings_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Update application settings with standardized response."""
    try:
        # Handle both formats: direct object or nested under "settings" key
        if "settings" in payload:
            new_settings = payload.get("settings")
        else:
            new_settings = payload  # Assume direct payload is the settings object

        logger.log_step(f"Received settings update: {json.dumps(new_settings)}")

        if not new_settings or not isinstance(new_settings, dict):
            raise ValidationException("Invalid or no settings provided")

        # Apply new settings
        logger.log_step("Updating settings")
        settings_manager.update_settings(new_settings)

        # Save settings to file
        settings_manager.save_settings()

        return create_data_response({
            "message": "Settings updated successfully",
            "settings": settings_manager.settings
        })
    except ValidationException as e:
        return handle_validation_error(e)
    except Exception as e:
        logger.log_error(f"Error updating settings: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "Failed to update settings")

@router.put("/settings", response_model=DataResponse, responses=STANDARD_RESPONSES)
async def update_settings_put(
    payload: Dict[str, Any],
    settings_manager: SettingsManager = Depends(get_settings_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Update application settings via PUT request with standardized response."""
    try:
        if "settings" in payload:
            new_settings = payload.get("settings")
        else:
            new_settings = payload

        logger.log_step(f"Received settings update via PUT: {json.dumps(new_settings)}")

        if not new_settings or not isinstance(new_settings, dict):
            raise ValidationException("Invalid or no settings provided")

        logger.log_step("Updating settings")
        settings_manager.update_settings(new_settings)
        settings_manager.save_settings()

        return create_data_response({
            "message": "Settings updated successfully",
            "settings": settings_manager.settings
        })
    except ValidationException as e:
        return handle_validation_error(e)
    except Exception as e:
        logger.log_error(f"Error updating settings via PUT: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "Failed to update settings")

# --- Utility Endpoints ---

@router.post("/test-connection", response_model=DataResponse, responses=STANDARD_RESPONSES)
async def test_api_connection(
    payload: TestConnectionPayload,
    logger: LogManager = Depends(get_logger_dependency)
):
    """Test connection to an API endpoint with provider-specific handling."""
    try:
        logger.log_step(f"Testing API connection with data: {payload.dict()}")

        url = payload.url
        api_key = payload.apiKey
        provider = payload.provider
        model = payload.model

        if not url:
            raise ValidationException("URL is required")

        logger.log_step(f"Attempting connection to: {url}")
        logger.log_step(f"Provider: {provider}")
        logger.log_step(f"Model: {model}")

        adapter = get_provider_adapter(provider, logger)

        if provider == 'Featherless':
            logger.log_step(f"Testing Featherless AI chat completion (streamed) from: {url}")
            try:
                endpoint_url = adapter.get_endpoint_url(url)
                headers = adapter.prepare_headers(api_key)
                
                # Prepare a minimal payload for testing streaming chat completion
                test_data = adapter.prepare_request_data(
                    prompt="Test stream connection. Please send a short reply.",
                    memory=None,
                    stop_sequence=[],
                    generation_settings={
                        "model": model,
                        "max_tokens": 10
                    },
                    stream=True
                )
                logger.log_step(f"Featherless stream test request data: {json.dumps(test_data)}")

                # Make the request with stream=True
                response = requests.post(
                    endpoint_url,
                    headers=headers,
                    json=test_data,
                    timeout=20,
                    stream=True
                )

                logger.log_step(f"Featherless stream test response status: {response.status_code}")

                if response.status_code == 200:
                    first_chunk_received = False
                    try:
                        for chunk in response.iter_lines(chunk_size=512, decode_unicode=True):
                            if chunk:
                                logger.log_step(f"Featherless stream test: Received first chunk (first 100 chars): {chunk[:100]}")
                                first_chunk_received = True
                                break
                    except requests.exceptions.ChunkedEncodingError as ce:
                        logger.log_warning(f"Featherless stream test: ChunkedEncodingError while reading stream: {str(ce)}")
                    except Exception as stream_read_exc:
                        logger.log_warning(f"Featherless stream test: Exception while reading stream: {str(stream_read_exc)}")
                    finally:
                        response.close()

                    if first_chunk_received:
                        logger.log_step("Featherless AI stream connection test successful: Stream started and data received.")
                        model_id_to_report = model or "unknown_or_default_model"
                        model_name_to_report = model or provider or "Unknown or Default Model"
                        
                        return create_data_response({
                            "message": "Connection successful: Stream started and data received.",
                            "model": {"id": model_id_to_report, "name": model_name_to_report},
                            "timestamp": time.time()
                        })
                    else:
                        logger.log_warning("Featherless AI stream test: Status 200 but no stream data was successfully read.")
                        return create_error_response(
                            "Connection test returned status 200, but no stream data could be read.",
                            400
                        )
                else:
                    # Handle non-200 status codes
                    error_message = f"Featherless AI stream test failed with status {response.status_code}"
                    try:
                        response_text = response.text
                        response.close()
                        error_detail_json = json.loads(response_text)
                        if isinstance(error_detail_json, dict):
                            if 'error' in error_detail_json:
                                if isinstance(error_detail_json['error'], dict) and 'message' in error_detail_json['error']:
                                    error_message += f". Detail: {error_detail_json['error']['message']}"
                                else:
                                    error_message += f". Detail: {str(error_detail_json['error'])}"
                            elif 'message' in error_detail_json:
                                error_message += f". Detail: {error_detail_json['message']}"
                            else:
                                error_message += f". Response: {response_text[:200]}" if response_text else "(empty response)"
                    except json.JSONDecodeError:
                        error_message += f". Raw Response: {response_text[:200]}" if response_text else "(empty response)"
                    except Exception as e_resp:
                        logger.log_warning(f"Could not fully parse error response: {str(e_resp)}")
                        error_message += f". Raw Response: {response_text[:200]}" if response_text else "(empty response)"
                    finally:
                        response.close()
                    
                    logger.log_warning(error_message)
                    return create_error_response(error_message, str(response.status_code) if response.status_code >= 400 else "400")

            except requests.exceptions.RequestException as req_exc:
                logger.log_error(f"RequestException during Featherless AI stream test: {str(req_exc)}")
                logger.log_error(traceback.format_exc())
                return create_error_response(f"Connection error: {str(req_exc)}", "503")
            except Exception as e:
                logger.log_error(f"Error testing Featherless AI stream connection: {str(e)}")
                logger.log_error(traceback.format_exc())
                raise handle_generic_error(e, "Connection test failed")
        else:
            # Generic provider test (remains non-streaming for now)
            endpoint_url = adapter.get_endpoint_url(url)
            logger.log_step(f"Using generic endpoint URL: {endpoint_url}")

            headers = adapter.prepare_headers(api_key)
            logger.log_step(f"Headers prepared (keys only): {list(headers.keys())}")

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
            test_data["stream"] = False
            logger.log_step(f"Test data prepared: {test_data}")

            response = requests.post(
                endpoint_url,
                headers=headers,
                json=test_data,
                timeout=10
            )
            logger.log_step(f"Response status: {response.status_code}")

            response_data = None
            try:
                response_data = response.json()
                logger.log_step(f"Response data: {json.dumps(response_data)[:500]}...")
            except Exception as json_err:
                logger.log_warning(f"Could not parse response as JSON: {str(json_err)}")
                logger.log_step(f"Raw response: {response.text[:100]}...")

            if response.status_code == 200:
                logger.log_step("Connection test successful")
                model_info_data = {
                    "id": model or (response_data.get("model") if response_data else None) or "unknown",
                    "name": model or (response_data.get("model") if response_data else None) or provider or "unknown"
                }
                if response_data and isinstance(response_data, dict) and response_data.get("id"):
                    model_info_data["id"] = response_data.get("id")
                
                return create_data_response({
                    "message": "Connection successful",
                    "model": model_info_data,
                    "detected_template": None,
                    "timestamp": time.time()
                })
            else:
                error_msg = f"Connection failed with status {response.status_code}"
                if response_data and isinstance(response_data, dict) and 'error' in response_data:
                    if isinstance(response_data['error'], dict) and 'message' in response_data['error']:
                        error_msg = f"{error_msg}: {response_data['error']['message']}"
                    else:
                        error_msg = f"{error_msg}: {response_data['error']}"
                elif response_data and isinstance(response_data, dict) and 'message' in response_data:
                    error_msg = f"{error_msg}: {response_data['message']}"
                elif response.text:
                    error_msg = f"{error_msg}: {response.text[:200]}"
                logger.log_warning(f"Connection test failed: {error_msg}")
                return create_error_response(error_msg, "400")

    except ValidationException as e:
        return handle_validation_error(e)
    except Exception as e:
        logger.log_error(f"API connection test error: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "Connection test failed")

@router.post("/validate-directory", response_model=DataResponse, responses=STANDARD_RESPONSES)
async def validate_directory(
    payload: DirectoryPath,
    logger: LogManager = Depends(get_logger_dependency)
):
    """Validate if a given path is an existing directory."""
    try:
        dir_path_str = payload.directory
        logger.log_step(f"Validating directory path: {dir_path_str}")

        dir_path = Path(dir_path_str)
        is_valid = dir_path.is_dir()
        logger.log_step(f"Path '{dir_path_str}' is_dir: {is_valid}")

        return create_data_response({
            "exists": is_valid,
            "path": dir_path_str
        })
    except Exception as e:
        logger.log_error(f"Error validating directory '{payload.directory}': {str(e)}")
        logger.log_error(traceback.format_exc())
        return create_data_response({
            "exists": False,
            "path": payload.directory,
            "message": f"Error validating directory: {str(e)}"
        })

@router.post("/featherless/models", response_model=DataResponse, responses=STANDARD_RESPONSES)
async def get_featherless_models_proxy(
    payload: FeatherlessModelsPayload,
    logger: LogManager = Depends(get_logger_dependency)
):
    """Proxy to fetch available models from Featherless AI."""
    try:
        logger.log_step(f"Proxying Featherless models request for URL: {payload.url}")
        adapter = get_provider_adapter("Featherless", logger)
        
        models_response = adapter.list_models(payload.url, payload.apiKey)
        
        # Check the structure returned by adapter.list_models
        if models_response and isinstance(models_response, dict):
            if models_response.get("success") is True and "models" in models_response:
                logger.log_step("Successfully fetched models from Featherless adapter.")
                return create_data_response({
                    "models": models_response["models"]
                })
            elif models_response.get("success") is False and "error" in models_response:
                logger.log_warning(f"Error reported by Featherless adapter list_models: {models_response['error']}")
                return create_error_response(models_response['error'], "400")
        
        # Fallback for truly unexpected response structure from adapter
        logger.log_warning(f"Unexpected response format from Featherless adapter: {models_response}")
        return create_error_response("Unexpected response format from Featherless adapter", "500")
    except Exception as e:
        logger.log_error(f"Error proxying Featherless models request: {str(e)}")
        logger.log_error(traceback.format_exc())
        raise handle_generic_error(e, "Failed to fetch models")
