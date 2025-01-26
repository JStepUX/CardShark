import json
import os
import sys
from pathlib import Path
from typing import Dict, Any

class SettingsManager:
    def __init__(self, logger):
        self.logger = logger
        self.settings_file = self._get_settings_path()
        self.settings = self._load_settings()
        
    def _get_settings_path(self) -> Path:
        """Get the path where settings.json should be stored."""
        if getattr(sys, 'frozen', False):
            # If running as PyInstaller bundle
            return Path(sys.executable).parent / 'settings.json'
        else:
            # If running from source
            return Path(__file__).parent.parent / 'settings.json'
            
    def _load_settings(self) -> Dict[str, Any]:
        """Load settings from file, creating default if doesn't exist."""
        default_settings = {
            "character_directory": "",
            "save_to_character_directory": False,  # Add new default setting
            "last_export_directory": "",
            "theme": "dark",
            "version": "0.7"
        }
        
        try:
            if self.settings_file.exists():
                with open(self.settings_file, 'r') as f:
                    stored_settings = json.load(f)
                    # Merge with defaults in case new settings were added
                    return {**default_settings, **stored_settings}
            
            # If no settings file exists, create one with defaults
            self._save_settings(default_settings)
            return default_settings
            
        except Exception as e:
            self.logger.log_error(f"Error loading settings: {str(e)}")
            return default_settings
            
    def _save_settings(self, settings: Dict[str, Any]) -> bool:
        """Save settings to file."""
        try:
            with open(self.settings_file, 'w') as f:
                json.dump(settings, f, indent=2)
            return True
        except Exception as e:
            self.logger.log_error(f"Error saving settings: {str(e)}")
            return False
            
    def get_setting(self, key: str) -> Any:
        """Get a setting value."""
        return self.settings.get(key)
        
    def update_setting(self, key: str, value: Any) -> bool:
        """Update a single setting."""
        try:
            self.settings[key] = value
            return self._save_settings(self.settings)
        except Exception as e:
            self.logger.log_error(f"Error updating setting {key}: {str(e)}")
            return False
            
    def get_character_directory(self) -> str:
        """Get the character directory, falling back to SillyTavern path if not set."""
        saved_dir = self.get_setting('character_directory')
        if saved_dir and os.path.exists(saved_dir):
            return saved_dir
            
        # Fallback to SillyTavern path
        silly_path = Path.home() / "SillyTavern-Launcher" / "SillyTavern" / "data" / "default-user" / "characters"
        if silly_path.exists():
            self.update_setting('character_directory', str(silly_path))
            return str(silly_path)
            
        return ""