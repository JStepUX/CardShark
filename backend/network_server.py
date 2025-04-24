import sys
import socket
import uvicorn # type: ignore
from typing import Optional, List, Tuple
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

def is_port_available(port: int, host: str = "0.0.0.0") -> bool:
    """Check if a port is available on the specified host."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1)
        s.bind((host, port))
        s.close()
        return True
    except (socket.error, OSError):
        return False

def find_available_port(preferred_ports: List[int], min_port: int = 8000, max_port: int = 10000, host: str = "0.0.0.0") -> Tuple[int, bool]:
    """
    Find an available network port, with preference for ports in preferred_ports list.
    
    Args:
        preferred_ports: List of ports to try first
        min_port: Minimum port number to scan if preferred ports are unavailable
        max_port: Maximum port number to scan
        host: Host address to bind to
        
    Returns:
        Tuple of (port_number, is_preferred_port)
    """
    # First try the preferred ports in order
    for port in preferred_ports:
        if is_port_available(port, host):
            return port, True
            
    # If all preferred ports are taken, scan for any available port
    for port in range(min_port, max_port + 1):
        if port not in preferred_ports and is_port_available(port, host):
            return port, False
            
    # If no ports available in range, return the first preferred port with a failure flag
    return preferred_ports[0], False

def run_server(app, port: int = 9696, local_only: bool = False, on_start=None):
    """
    Run the server with configurable network access.
    Works in both development and frozen (EXE) environments.
    
    Args:
        app: The FastAPI application
        port: Port number (default 9696)
        local_only: If True, only allow localhost access
        on_start: Optional callback function to be called when server starts, receives selected_port as parameter
    """
    host = "127.0.0.1" if local_only else "0.0.0.0"
    
    # Get execution context
    context = "Executable" if is_frozen() else "Development"
    
    # Define preferred ports (primary port followed by fallbacks)
    preferred_ports = [port, 7000, 8080, 8000]
    
    # Find an available port
    selected_port, is_preferred = find_available_port(preferred_ports, host=host)
    
    # Notify if using a fallback port
    if selected_port != port:
        print(f"\n⚠️  Port {port} is already in use.")
        print(f"⚠️  Using fallback port {selected_port} instead.\n")
    
    if not local_only:
        local_ip = get_local_ip()
        if local_ip:
            print(f"\nCardShark {context} Server")
            print(f"========================")
            print(f"Server accessible at:")
            print(f"- Local:   http://localhost:{selected_port}")
            print(f"- Network: http://{local_ip}:{selected_port}")
            print("\nPress CTRL+C to quit\n")
    
    # Execute the on_start callback if provided, passing the selected port
    if on_start and callable(on_start):
        try:
            on_start(selected_port)
        except Exception as e:
            print(f"Warning: Error in on_start callback: {e}")
    
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
    try:
        uvicorn.run(
            app,
            host=host,
            port=selected_port,
            log_level="info",
            log_config=log_config,
            workers=1  # Important for PyInstaller compatibility
        )
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"\n❌ ERROR: Port {selected_port} is now in use. Another application may have claimed it.")
            print("   Please close other applications that might be using the port and try again.")
        else:
            print(f"\n❌ ERROR: {str(e)}")
        sys.exit(1)