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
            "last_export_directory": "",
            "theme": "dark",
            "version": "1.0",
            "api": {
                "enabled": False,
                "url": "http://localhost:5001",
                "apiKey": "",
                "template": "mistral-v3",
                "lastConnectionStatus": None
            }
        }
        
        try:
            if self.settings_file.exists():
                with open(self.settings_file, 'r') as f:
                    stored_settings = json.load(f)
                    # Merge with defaults in case new settings were added
                    merged = {**default_settings, **stored_settings}
                    # Ensure API settings exist
                    if 'api' not in merged:
                        merged['api'] = default_settings['api']
                    return merged
            
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
        
    def get_api_settings(self) -> Dict[str, Any]:
        """Get API settings."""
        return self.settings.get('api', {})
        
    def update_api_settings(self, updates: Dict[str, Any]) -> bool:
        """Update API settings and check connection if URL or key changes."""
        try:
            current_api = self.settings.get('api', {})
            
            # Check if we need to verify connection
            need_connection_check = (
                'url' in updates and updates['url'] != current_api.get('url') or
                'apiKey' in updates and updates['apiKey'] != current_api.get('apiKey')
            )
            
            updated_api = {**current_api, **updates}
            self.settings['api'] = updated_api
            success = self._save_settings(self.settings)
            
            if success and need_connection_check:
                # Reset connection status until next check
                updated_api['lastConnectionStatus'] = None
                self._save_settings(self.settings)
                
            return success
        except Exception as e:
            self.logger.log_error(f"Error updating API settings: {str(e)}")
            return False

    def update_setting(self, key: str, value: Any) -> bool:
        """Update a specific setting by key."""
        try:
            # Special handling for character_directory to ensure it exists
            if key == 'character_directory':
                if not self._validate_directory(value):
                    self.logger.log_error(f"Invalid directory path: {value}")
                    return False
            
            # Update the setting
            self.settings[key] = value
            return self._save_settings(self.settings)
            
        except Exception as e:
            self.logger.log_error(f"Error updating setting '{key}': {str(e)}")
            return False

    def _validate_directory(self, directory: str) -> bool:
        """Validate if a directory exists and is accessible."""
        try:
            # Convert to Path and resolve
            dir_path = Path(directory).resolve()
            
            # Check if directory exists
            if not dir_path.exists():
                self.logger.log_error(f"Directory does not exist: {directory}")
                return False
                
            if not dir_path.is_dir():
                self.logger.log_error(f"Path is not a directory: {directory}")
                return False
                
            # Check if directory contains PNG files
            png_files = list(dir_path.glob("*.png"))
            if not png_files:
                self.logger.log_error(f"No PNG files found in directory: {directory}")
                return False
                
            self.logger.log_info(f"Directory validation passed: {directory}")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error validating directory: {str(e)}")
            return False