import sys
import socket
import uvicorn # type: ignore
from typing import Optional
from pathlib import Path

def get_local_ip() -> Optional[str]:
    """Get the local IP address of the machine."""
    try:
        # Create a socket to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Doesn't actually create a connection
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return None

def is_frozen():
    """Check if running as PyInstaller executable"""
    return getattr(sys, 'frozen', False)

def run_server(app, port: int = 9696, local_only: bool = False):
    """
    Run the server with configurable network access.
    Works in both development and frozen (EXE) environments.
    
    Args:
        app: The FastAPI application
        port: Port number (default 9696)
        local_only: If True, only allow localhost access
    """
    host = "127.0.0.1" if local_only else "0.0.0.0"
    
    # Get execution context
    context = "Executable" if is_frozen() else "Development"
    
    if not local_only:
        local_ip = get_local_ip()
        if local_ip:
            print(f"\nCardShark {context} Server")
            print(f"========================")
            print(f"Server accessible at:")
            print(f"- Local:   http://localhost:{port}")
            print(f"- Network: http://{local_ip}:{port}")
            print("\nPress CTRL+C to quit\n")
    
    # Configure logging based on environment
    log_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "()": "uvicorn.logging.DefaultFormatter",
                "fmt": "%(levelprefix)s %(message)s",
                "use_colors": None,
            },
        },
        "handlers": {
            "default": {
                "formatter": "default",
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stderr",
            },
        },
        "loggers": {
            "uvicorn": {"handlers": ["default"], "level": "INFO"},
            "uvicorn.error": {"level": "INFO"},
            "uvicorn.access": {"handlers": ["default"], "level": "INFO"},
        },
    }
    
    # Run the server with appropriate configuration
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        log_config=log_config,
        workers=1  # Important for PyInstaller compatibility
    )