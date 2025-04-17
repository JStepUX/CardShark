# backend/worldcards/storage.py
"""
World Card Storage Utilities
- Handles directory creation and file path resolution for world cards.
- Follows patterns established in chat storage and user directory logic.
"""
import os
from pathlib import Path
from backend.settings_manager import SettingsManager
from backend.main import get_users_dir


def get_worldcards_base_dir(settings_manager: SettingsManager) -> Path:
    """
    Returns the base directory for world cards.
    Ensures the directory exists.
    """
    users_dir = get_users_dir()
    worldcards_subdir = settings_manager.settings.get("worldcards_directory", "worldcards")
    worldcards_dir = users_dir / worldcards_subdir
    worldcards_dir.mkdir(parents=True, exist_ok=True)
    return worldcards_dir


def get_worldcard_path(settings_manager: SettingsManager, world_name: str) -> Path:
    """
    Returns the full path to a specific world card file (e.g., as JSON).
    """
    base_dir = get_worldcards_base_dir(settings_manager)
    safe_name = world_name.replace("/", "_").replace("\\", "_")
    return base_dir / f"{safe_name}.json"
