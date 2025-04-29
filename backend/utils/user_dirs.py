"""
Utility functions for working with user directories and files.
"""
from pathlib import Path

def get_users_dir() -> Path:
    """
    Get the path to the users directory.
    
    Returns:
        Path: The absolute path to the users directory.
    """
    # The users directory is at the root of the project
    base_dir = Path(__file__).parent.parent.parent  # Go up from utils to backend to root
    users_dir = base_dir / "users"
    
    # Ensure the directory exists
    users_dir.mkdir(parents=True, exist_ok=True)
    
    return users_dir