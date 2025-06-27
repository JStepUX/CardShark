"""Path utilities for consistent path handling across the application."""

import sys
from pathlib import Path
from typing import Union, Optional


def normalize_path(path_input: Union[str, Path]) -> str:
    """
    Normalize paths consistently across the application.
    
    This function ensures that:
    1. Paths are resolved to absolute paths
    2. Path separators are normalized for the OS
    3. Symlinks are resolved
    4. Case is normalized on case-insensitive filesystems
    
    Args:
        path_input: Path string or Path object to normalize
        
    Returns:
        Normalized absolute path as string
    """
    try:
        path_obj = Path(path_input)
        # Resolve to absolute path and resolve symlinks
        resolved_path = path_obj.resolve()
        
        # On Windows, normalize case for consistency
        if sys.platform.startswith('win'):
            # Convert to string and back to ensure consistent casing
            return str(resolved_path).lower()
        
        return str(resolved_path)
    except (OSError, ValueError) as e:
        # If path resolution fails, return the original string representation
        return str(path_input)


def paths_are_equal(path1: Union[str, Path], path2: Union[str, Path]) -> bool:
    """
    Compare two paths for equality using normalized paths.
    
    Args:
        path1: First path to compare
        path2: Second path to compare
        
    Returns:
        True if paths refer to the same location
    """
    return normalize_path(path1) == normalize_path(path2)


def get_relative_path(path: Union[str, Path], base: Union[str, Path]) -> Optional[str]:
    """
    Get relative path from base directory.
    
    Args:
        path: Target path
        base: Base directory
        
    Returns:
        Relative path string or None if not relative to base
    """
    try:
        path_obj = Path(normalize_path(path))
        base_obj = Path(normalize_path(base))
        
        # Check if path is relative to base
        try:
            relative = path_obj.relative_to(base_obj)
            return str(relative)
        except ValueError:
            # Path is not relative to base
            return None
    except Exception:
        return None


def ensure_directory_exists(directory: Union[str, Path]) -> bool:
    """
    Ensure a directory exists, creating it if necessary.
    
    Args:
        directory: Directory path to ensure exists
        
    Returns:
        True if directory exists or was created successfully
    """
    try:
        dir_path = Path(directory)
        dir_path.mkdir(parents=True, exist_ok=True)
        return True
    except Exception:
        return False


def is_pyinstaller_bundle():
    """
    Check if the application is running as a PyInstaller bundle.
    
    Returns:
        bool: True if running as PyInstaller bundle, False otherwise
    """
    return getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')

def paths_are_equivalent(path1, path2):
    """
    Check if two paths are equivalent after normalization.
    
    Args:
        path1 (str): First path to compare
        path2 (str): Second path to compare
    
    Returns:
        bool: True if paths are equivalent, False otherwise
    """
    return normalize_path(path1) == normalize_path(path2)


def get_application_base_path() -> Path:
    """
    Get the base path for the application, handling PyInstaller bundles.
    
    Returns:
        Base path for the application
    """
    if is_pyinstaller_bundle():
        # Running as PyInstaller bundle
        return Path(sys.executable).parent
    else:
        # Running from source
        return Path(__file__).resolve().parent.parent.parent


def resolve_directory_path(directory_path: str) -> str:
    """
    Resolve a directory path, supporting both absolute and relative paths.
    
    For relative paths (not starting with drive letter or slash), they are resolved
    relative to the application base directory.
    
    Args:
        directory_path: Directory path to resolve (can be absolute or relative)
        
    Returns:
        Normalized absolute path as string
    """
    if not directory_path:
        return ""
    
    path_obj = Path(directory_path)
    
    # Check if path is already absolute
    if path_obj.is_absolute():
        return normalize_path(directory_path)
    
    # For relative paths, resolve from application base
    base_path = get_application_base_path()
    resolved_path = base_path / directory_path
    return normalize_path(str(resolved_path))