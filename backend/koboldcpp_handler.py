"""
KoboldCPP Handler - FastAPI router for KoboldCPP integration
"""
from fastapi import APIRouter, Request, HTTPException, Body, Query
from fastapi.responses import StreamingResponse, JSONResponse
from typing import Dict, Any, List, Optional, AsyncGenerator
import asyncio
import json
import logging
import threading
import queue
import os
import requests
import platform
from pathlib import Path
import subprocess
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from backend.koboldcpp_manager import manager

# Configure logging
logger = logging.getLogger("KoboldCPP Handler")

# Create FastAPI router
router = APIRouter(prefix="/api/koboldcpp", tags=["koboldcpp"])

# Pydantic models for request validation
class ModelConfig(BaseModel):
    contextsize: Optional[int] = 4096
    threads: Optional[int] = None
    gpulayers: Optional[int] = None
    usecublas: Optional[bool] = False
    usevulkan: Optional[bool] = False
    usecpu: Optional[bool] = False
    port: Optional[int] = 5001
    defaultgenamt: Optional[int] = 128
    multiuser: Optional[int] = None
    skiplauncher: Optional[bool] = True

class ModelDirectoryRequest(BaseModel):
    directory: str

class LaunchModelRequest(BaseModel):
    model_path: str
    config: Optional[ModelConfig] = None

@router.get("/status")
async def get_status():
    """Get KoboldCPP status"""
    try:
        status = manager.get_status()
        return status
    except Exception as e:
        logger.error(f"Error getting KoboldCPP status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get KoboldCPP status: {str(e)}")

@router.post("/recheck")
async def recheck_status():
    """Force a recheck of KoboldCPP status"""
    try:
        # Reset the executable path to force a fresh check
        manager._find_executable()
        status = manager.get_status()
        return status
    except Exception as e:
        logger.error(f"Error rechecking KoboldCPP status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to recheck KoboldCPP status: {str(e)}")

@router.post("/launch")
async def launch_koboldcpp():
    """Launch KoboldCPP"""
    try:
        result = manager.launch()
        if result.get('status') == 'error':
            raise HTTPException(status_code=500, detail=result.get('message', 'Unknown error'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error launching KoboldCPP: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to launch KoboldCPP: {str(e)}")

@router.get("/check-updates")
async def check_updates(force: bool = False):
    """Check if updates are available for KoboldCPP"""
    try:
        update_info = manager.check_for_updates(force=force)
        return update_info
    except Exception as e:
        logger.error(f"Error checking for updates: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to check for updates: {str(e)}")

async def download_progress_generator(request: Request) -> AsyncGenerator[str, None]:
    """Generator for streaming download progress as SSE events"""
    try:
        # Create a queue for progress updates
        progress_queue = queue.Queue()
        
        # Callback function to enqueue progress updates
        def progress_callback(data):
            progress_queue.put(data)
        
        # Start download in a separate thread
        def download_thread():
            manager.download(callback=progress_callback)
            # Signal that the download is complete by enqueueing None
            progress_queue.put(None)
        
        threading.Thread(target=download_thread).start()
        
        # Process progress updates from the queue
        while True:
            if await request.is_disconnected():
                logger.info("Client disconnected from download progress stream")
                break
                
            try:
                # Get progress update with timeout
                data = progress_queue.get(timeout=1)
                
                # None signals that the download is complete
                if data is None:
                    logger.info("Download complete")
                    yield json.dumps({"event": "completed"})
                    break
                    
                # Convert data to JSON and yield SSE event
                yield json.dumps({"event": "progress", "data": data})
                
            except queue.Empty:
                # Continue waiting for more updates
                pass
                
            await asyncio.sleep(0.1)
            
    except Exception as e:
        logger.error(f"Error in download progress generator: {str(e)}")
        yield json.dumps({"event": "error", "data": {"error": str(e)}})

@router.post("/download")
async def download_koboldcpp(request: Request):
    """Download KoboldCPP with streaming progress updates"""
    try:
        return EventSourceResponse(download_progress_generator(request))
    except Exception as e:
        logger.error(f"Error in download endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Download error: {str(e)}")

@router.post("/scan-models")
async def scan_models_directory(request: ModelDirectoryRequest):
    """
    Scan a directory for compatible model files
    """
    try:
        models = manager.scan_models_directory(request.directory)
        return {"models": models, "count": len(models)}
    except Exception as e:
        logger.error(f"Error scanning models directory: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to scan models directory: {str(e)}")

@router.get("/models")
async def get_available_models():
    """
    Get the list of available models that have been scanned
    """
    try:
        models = manager.get_available_models()
        return {"models": models, "count": len(models)}
    except Exception as e:
        logger.error(f"Error getting available models: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get available models: {str(e)}")

@router.post("/launch-model")
async def launch_with_model(request: LaunchModelRequest):
    """
    Launch KoboldCPP with a specific model and configuration
    """
    try:
        # Convert Pydantic model to dict, filtering None values
        config = request.config.dict(exclude_none=True) if request.config else {}
        
        result = manager.launch_with_model(request.model_path, config)
        if result.get('status') == 'error':
            raise HTTPException(status_code=500, detail=result.get('message', 'Unknown error'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error launching KoboldCPP with model: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to launch KoboldCPP with model: {str(e)}")

@router.post("/recommended-config")
async def get_recommended_config(model_size_gb: float = Body(..., embed=True)):
    """
    Get recommended configuration settings based on model size
    """
    try:
        config = manager.get_recommended_config(model_size_gb)
        return config
    except Exception as e:
        logger.error(f"Error getting recommended config: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get recommended config: {str(e)}")

@router.get("/models-directory")
async def get_models_directory():
    """Get the configured models directory from settings"""
    from backend.main import settings_manager
    models_dir = settings_manager.get_setting("models_directory") or ""
    return {"directory": models_dir}

@router.post("/models-directory")
async def set_models_directory(directory: str = Body(..., embed=True)):
    """Set the models directory in settings"""
    from backend.main import settings_manager
    success = settings_manager.update_setting("models_directory", directory)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to save models directory setting")
    return {"success": True, "directory": directory}

@router.post("/stop")
async def stop_koboldcpp():
    """Stop running KoboldCPP process"""
    try:
        import psutil
        import os

        # Find KoboldCPP process
        for proc in psutil.process_iter(['pid', 'name', 'exe']):
            try:
                if 'koboldcpp' in proc.info['name'].lower() or (
                    proc.info['exe'] and 'koboldcpp' in os.path.basename(proc.info['exe']).lower()
                ):
                    # Terminate the process
                    logger.info(f"Found KoboldCPP process (PID: {proc.pid}), attempting to terminate")
                    proc.terminate()
                    
                    # Give it a moment to terminate gracefully
                    try:
                        proc.wait(timeout=3)
                    except psutil.TimeoutExpired:
                        # Force kill if it doesn't terminate gracefully
                        logger.warning(f"KoboldCPP process (PID: {proc.pid}) did not terminate gracefully, force killing")
                        proc.kill()
                    
                    return {"success": True, "message": "KoboldCPP stopped successfully"}
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
        
        # If we get here, no process was found
        return {"success": False, "message": "KoboldCPP process not found"}
    except Exception as e:
        logger.error(f"Error stopping KoboldCPP: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to stop KoboldCPP: {str(e)}")
# --- External Model Listing Endpoints ---
import traceback
from backend.api_provider_adapters import OpenRouterAdapter # Assuming FeatherlessAdapter might not exist yet

@router.post("/openrouter/models", tags=["external_models"])
async def get_openrouter_models(request: Request):
    """Fetch available models from OpenRouter."""
    logger.info("Received request for OpenRouter models")
    try:
        data = await request.json()
        url = data.get('url', 'https://openrouter.ai/api/v1') # Use v1 API endpoint
        api_key = data.get('apiKey')

        if not api_key: # API Key is essential for OpenRouter
            logger.warning("OpenRouter API key missing")
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": "OpenRouter API key is required"}
            )

        adapter = OpenRouterAdapter(logger)
        result = adapter.list_models(url, api_key) # Pass URL and key

        if not result.get('success', False):
             logger.error(f"Failed to fetch OpenRouter models: {result.get('error', 'Unknown error')}")
             return JSONResponse(
                 status_code=result.get('status_code', 500),
                 content=result
             )

        logger.info(f"Successfully fetched {len(result.get('models', []))} OpenRouter models")
        return JSONResponse(content=result)
    except Exception as e:
        logger.error(f"Error fetching OpenRouter models: {str(e)}")
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Failed to fetch models: {str(e)}"}
        )

@router.post("/featherless/models", tags=["external_models"])
async def get_featherless_models(request: Request):
    """Fetch available models from Featherless."""
    logger.info("Received request for Featherless models")
    try:
        # Attempt to import FeatherlessAdapter dynamically
        try:
            from backend.api_provider_adapters import FeatherlessAdapter
        except ImportError:
             logger.error("FeatherlessAdapter not found in api_provider_adapters.py")
             raise HTTPException(status_code=501, detail="Featherless model listing not implemented")

        data = await request.json()
        url = data.get('url', 'https://api.featherless.ai/v1') # Use v1 API endpoint
        api_key = data.get('apiKey') # May not be needed for Featherless list

        adapter = FeatherlessAdapter(logger)
        result = adapter.list_models(url, api_key) # Pass URL and key (if needed)

        if not result.get('success', False):
            logger.error(f"Failed to fetch Featherless models: {result.get('error', 'Unknown error')}")
            return JSONResponse(
                status_code=result.get('status_code', 500),
                content=result
            )

        logger.info(f"Successfully fetched {len(result.get('models', []))} Featherless models")
        return JSONResponse(content=result)
    except HTTPException as http_exc:
         raise http_exc # Re-raise specific HTTP exceptions (like 501 Not Implemented)
    except Exception as e:
        logger.error(f"Error fetching Featherless models: {str(e)}")
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Failed to fetch models: {str(e)}"}
        )

@router.post("/ping-server")
async def ping_koboldcpp_server(port: int = None):
    """Check if KoboldCPP server is responsive"""
    try:
        # Use default port if not specified
        if (port is None):
            port = DEFAULT_KCPP_PORT
        
        # Create handler instance just for this check
        handler = KoboldCPPHandler()
        result = handler.ping_server(port)
        return result
    except Exception as e:
        logger.error(f"Error pinging KoboldCPP server: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to ping KoboldCPP server: {str(e)}")

@router.post("/cleanup-mei")
async def cleanup_mei_directories():
    """Clean up orphaned _MEI directories in temp folder"""
    try:
        result = manager.cleanup_orphaned_mei_directories()
        if not result.get('success'):
            raise HTTPException(status_code=500, detail=result.get('error', 'Unknown error during cleanup'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cleaning up orphaned _MEI directories: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to clean up orphaned _MEI directories: {str(e)}")

import os
import sys
import json
import requests
import logging
import subprocess
import platform
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List, Union

# Setup logging
logger = logging.getLogger(__name__)

# Default port for KoboldCPP
DEFAULT_KCPP_PORT = 5001

class KoboldCPPHandler:
    def __init__(self, koboldcpp_dir: str = None):
        """Initialize the KoboldCPP handler with optional custom directory."""
        if koboldcpp_dir:
            self.koboldcpp_dir = Path(koboldcpp_dir)
        else:
            # Default to the KoboldCPP directory in the parent directory
            self.koboldcpp_dir = Path(os.path.join(os.path.dirname(os.path.dirname(__file__)), "KoboldCPP"))
        
        logger.info(f"KoboldCPP directory set to: {self.koboldcpp_dir}")
    
    def get_status(self) -> Dict[str, Any]:
        """Get the current status of KoboldCPP installation and process."""
        exe_name = "koboldcpp.exe" if platform.system() == "Windows" else "koboldcpp"
        exe_path = self.koboldcpp_dir / exe_name
        
        status = {
            "status": "unknown",
            "is_running": False,
            "exe_path": str(exe_path) if exe_path.exists() else None,
            "version": None,
            "error": None
        }
        
        # Check if executable exists
        if not exe_path.exists():
            status["status"] = "missing"
            return status
        
        # Executable exists
        status["status"] = "present"
        
        # Try to check if the process is running
        try:
            # Use netstat to check if the port is in use (platform dependent)
            if platform.system() == "Windows":
                # Command to check port on Windows
                netstat_output = subprocess.check_output(
                    ["netstat", "-ano", "-p", "TCP"], 
                    text=True
                )
                # Look for the KoboldCPP default port
                for line in netstat_output.splitlines():
                    if f":{DEFAULT_KCPP_PORT}" in line and "LISTENING" in line:
                        status["is_running"] = True
                        break
            else:
                # For Linux/Mac
                try:
                    netstat_output = subprocess.check_output(
                        ["lsof", "-i", f":{DEFAULT_KCPP_PORT}", "-n"], 
                        text=True
                    )
                    status["is_running"] = len(netstat_output.strip()) > 0
                except (subprocess.SubprocessError, FileNotFoundError):
                    # Try netstat as a fallback
                    try:
                        netstat_output = subprocess.check_output(
                            ["netstat", "-tuln"], 
                            text=True
                        )
                        status["is_running"] = f":{DEFAULT_KCPP_PORT}" in netstat_output
                    except (subprocess.SubprocessError, FileNotFoundError):
                        logger.warning("Could not check if KoboldCPP is running - netstat and lsof commands failed")
        except Exception as e:
            logger.error(f"Error checking if KoboldCPP is running: {str(e)}")
            status["error"] = f"Error checking process status: {str(e)}"
        
        # If we think it's running, try to get version from the API
        if status["is_running"]:
            try:
                # Set a short timeout to quickly fail if the server isn't responding
                response = requests.get(f"http://localhost:{DEFAULT_KCPP_PORT}/api/v1/model", timeout=2)
                if response.status_ok:
                    data = response.json()
                    if "result" in data:
                        status["version"] = data["result"]
            except Exception as e:
                logger.warning(f"KoboldCPP appears to be running but API is not responding: {str(e)}")
                # Don't change is_running status, since the process could be starting up
        
        return status
    
    def ping_server(self, port: int = DEFAULT_KCPP_PORT) -> Dict[str, Any]:
        """Check if the KoboldCPP server is responsive at the given port."""
        result = {
            "is_responding": False,
            "port": port,
            "error": None
        }
        
        try:
            # Use a very short timeout to quickly detect if server is not responding
            response = requests.get(f"http://localhost:{port}/api/v1/model", timeout=1)
            result["is_responding"] = response.status_code == 200
            
            if not result["is_responding"]:
                result["error"] = f"Server responded with status code: {response.status_code}"
        except requests.exceptions.ConnectionError as e:
            result["error"] = "Connection refused: The server is not accepting connections"
        except requests.exceptions.Timeout:
            result["error"] = "Connection timed out: The server took too long to respond"
        except Exception as e:
            result["error"] = f"Error connecting to KoboldCPP server: {str(e)}"
        
        return result

    # Other methods (launch, download, etc.) would go here

    def launch(self, model_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Launch KoboldCPP with the specified model.
        
        Args:
            model_path: Path to the model file to load
            
        Returns:
            Dictionary with status of launch attempt
        """
        # Implementation would be here
        pass

    def download_koboldcpp(self) -> Dict[str, Any]:
        """
        Download the latest release of KoboldCPP.
        
        Returns:
            Dictionary with download status
        """
        # Implementation would be here
        pass