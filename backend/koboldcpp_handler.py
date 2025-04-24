"""
KoboldCPP Handler - FastAPI router for KoboldCPP integration
"""
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from typing import Dict, Any, List, Optional, AsyncGenerator
import asyncio
import json
import logging
import threading
import queue
from sse_starlette.sse import EventSourceResponse

from backend.koboldcpp_manager import manager

# Configure logging
logger = logging.getLogger("KoboldCPP Handler")

# Create FastAPI router
router = APIRouter(prefix="/api/koboldcpp", tags=["koboldcpp"])

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
    # Use a standard Python queue for thread-safe communication
    progress_queue = queue.Queue()
    download_completed = threading.Event()
    download_result = {"status": "error", "error": "Unknown error"}
    
    # Function to receive progress updates from the manager (runs in a different thread)
    def progress_callback(data):
        try:
            progress_queue.put(data)
        except Exception as e:
            logger.error(f"Error in progress callback: {str(e)}")
    
    # Function to run the download in a background thread
    def run_download():
        try:
            result = manager.download(progress_callback)
            download_result.update(result)
        except Exception as e:
            logger.error(f"Download thread error: {str(e)}")
            download_result.update({
                "status": "error",
                "error": str(e)
            })
        finally:
            download_completed.set()
    
    # Start the download in a separate thread
    download_thread = threading.Thread(target=run_download)
    download_thread.daemon = True
    download_thread.start()
    
    try:
        while True:
            # Check if the client is still connected
            if await request.is_disconnected():
                logger.warning("Client disconnected during download")
                break
            
            # Check if download is complete
            if download_completed.is_set():
                yield json.dumps(download_result)
                break
            
            # Check for new progress updates (non-blocking)
            try:
                # Using asyncio to check the queue without blocking
                progress = None
                for _ in range(progress_queue.qsize()):
                    progress = progress_queue.get_nowait()
                
                if progress:
                    yield json.dumps(progress)
                else:
                    # If no progress update, wait a bit then send a keep-alive message
                    await asyncio.sleep(0.5)
                    yield json.dumps({"status": "pending"})
            except queue.Empty:
                # If queue is empty, send a keep-alive message
                await asyncio.sleep(0.5)
                yield json.dumps({"status": "pending"})
    finally:
        # Cleanup - the thread will terminate when the process ends
        pass

@router.post("/download")
async def download_koboldcpp(request: Request):
    """Download KoboldCPP with streaming progress updates"""
    try:
        return EventSourceResponse(download_progress_generator(request))
    except Exception as e:
        logger.error(f"Error in download endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Download error: {str(e)}")