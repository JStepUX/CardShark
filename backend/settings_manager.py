# backend/settings_manager.py
# Description: Manages settings for the application, including loading, saving, and updating settings.
import copy
import json
import os
import sys
from pathlib import Path
from typing import Dict, Any
import traceback
import collections.abc # Import for deep_merge type checking

# Helper function for deep merging dictionaries
def deep_merge(source, destination):
    """
    Recursively merge source dict into destination dict.
    Modifies destination in place.
    A value of None signals deletion of that key from the destination.
    """
    for key, value in source.items():
        if value is None:
            # None means "delete this key"
            destination.pop(key, None)
        elif isinstance(value, collections.abc.Mapping):
            # Get node or create one
            node = destination.setdefault(key, {})
            if isinstance(node, collections.abc.Mapping):
                deep_merge(value, node)
            else:
                # If destination node exists but is not a dict, overwrite it
                destination[key] = value
        else:
            destination[key] = value
    return destination

class SettingsManager:
    def __init__(self, logger):
        self.logger = logger
        self.settings_file = self._get_settings_path()
        self.settings = self._load_settings()
        # Log initial state after loading
        self.logger.log_step(f"[SettingsManager initialized] Initial settings loaded. models_directory: '{self.settings.get('models_directory')}', model_directory: '{self.settings.get('model_directory')}'")

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
            "character_directory": "characters",
            "worldcards_directory": "",  # Default directory for world cards
            "models_directory": "",      # Default directory for AI models
            "last_export_directory": "",
            "save_to_character_directory": False,
            "show_koboldcpp_launcher": False,  # Default: don't show KoboldCPP launcher on startup
            "remove_incomplete_sentences": True,  # Default: enable incomplete sentence removal
            "sfxVolume": 50,    # Sound effects volume 0-100
            "musicVolume": 30,  # Music volume 0-100
            "font_family": "Poppins",
            "theme": "dark",
            "version": "1.2",
            "api": {
                "enabled": False,
                "url": "http://localhost:5001",
                "apiKey": "",
                "templateId": "mistral",  # Use templateId only
                "lastConnectionStatus": None
            },
            # Add default syntax highlighting settings
            "syntaxHighlighting": {
                "bold": {
                    "textColor": "#f97316",
                    "backgroundColor": "transparent"
                },
                "italic": {
                    "textColor": "#ce3bf7",
                    "backgroundColor": "transparent"
                },
                "code": {
                    "textColor": "#a3e635",
                    "backgroundColor": "rgba(30, 41, 59, 0.5)"
                },
                "quote": {
                    "textColor": "#f59e0b",
                    "backgroundColor": "transparent"
                },
                "variable": {
                    "textColor": "#ec4899",
                    "backgroundColor": "rgba(236, 72, 153, 0.1)"
                }
            },
            # Default word substitution rules for content filtering
            "wordSwapRules": [],
            # Gallery folder management
            "gallery_folders": {
                "migrated": False,
                "folders": [
                    {"id": "default-characters", "name": "Characters", "isDefault": True, "color": "stone", "sortOrder": 0},
                    {"id": "default-worlds", "name": "Worlds", "isDefault": True, "color": "emerald", "sortOrder": 1},
                    {"id": "default-rooms", "name": "Rooms", "isDefault": True, "color": "purple", "sortOrder": 2},
                    {"id": "default-npcs", "name": "NPCs", "isDefault": True, "color": "amber", "sortOrder": 3}
                ]
            }
        }
        
        try:
            if self.settings_file.exists():
                try:
                    with open(self.settings_file, 'r', encoding='utf-8') as f:
                        try:
                            stored_settings = json.load(f)
                            
                            # Merge with defaults in case new settings were added
                            merged = {**default_settings, **stored_settings}
                            
                            # Ensure API settings exist with defaults
                            if 'api' not in merged:
                                merged['api'] = default_settings['api']
                            
                            # Ensure the API config uses templateId
                            if 'api' in merged and isinstance(merged['api'], dict):
                                api_config = merged['api']
                                # Remove any legacy template field
                                if 'template' in api_config:
                                    self.logger.log_step("Removing legacy 'template' field from settings")
                                    api_config.pop('template')
                                
                                # Ensure templateId exists
                                if 'templateId' not in api_config:
                                    self.logger.log_step("Adding missing 'templateId' field to settings")
                                    api_config['templateId'] = 'mistral'  # Default template
                            
                            # Check all API configs in the 'apis' field
                            if 'apis' in merged and isinstance(merged['apis'], dict):
                                for api_id, api_config in merged['apis'].items():
                                    if isinstance(api_config, dict):
                                        # Remove any legacy template field
                                        if 'template' in api_config:
                                            self.logger.log_step(f"Removing legacy 'template' field from API {api_id}")
                                            api_config.pop('template')
                                        
                                        # Ensure templateId exists
                                        if 'templateId' not in api_config:
                                            self.logger.log_step(f"Adding missing 'templateId' field to API {api_id}")
                                            api_config['templateId'] = 'mistral'  # Default template
                            
                            return merged
                        except json.JSONDecodeError as json_err:
                            self.logger.log_error(f"Invalid JSON in settings file: {str(json_err)}")
                            self.logger.log_error(traceback.format_exc())
                            
                            # Try to recover the file by making a backup
                            backup_file = self.settings_file.parent / f"{self.settings_file.name}.bak"
                            try:
                                import shutil
                                shutil.copy2(self.settings_file, backup_file)
                                self.logger.log_step(f"Created backup of settings file at {backup_file}")
                            except Exception as backup_err:
                                self.logger.log_error(f"Failed to create backup of settings file: {str(backup_err)}")
                            
                            # Use default settings
                            self._save_settings(default_settings)
                            return default_settings
                except IOError as io_err:
                    self.logger.log_error(f"IO error reading settings file: {str(io_err)}")
                    self._save_settings(default_settings)
                    return default_settings
            
            # If no settings file exists, create one with defaults
            self._save_settings(default_settings)
            return default_settings
            
        except Exception as e:
            self.logger.log_error(f"Error loading settings: {str(e)}")
            self.logger.log_error(traceback.format_exc()) # Add traceback
            
            # Always return default settings if there's any error
            try:
                # Try to save default settings
                self._save_settings(default_settings)
            except Exception as save_err:
                self.logger.log_error(f"Also failed to save default settings: {str(save_err)}")
                
            return default_settings

    # Removed update_settings_with_apis (handled by deep_merge in update_settings)
    # Removed update_api_settings (handled by deep_merge in update_settings)

    def _save_settings(self, settings_to_save: Dict[str, Any]) -> bool:
        """Save the provided settings dictionary to file."""
        try:
            # Make a deep copy to avoid modifying the live settings object during processing
            settings_copy = copy.deepcopy(settings_to_save)            # Convert Python booleans to JSON booleans
            def convert_booleans(obj):
                if isinstance(obj, dict):
                    return {k: convert_booleans(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [convert_booleans(x) for x in obj]
                elif isinstance(obj, bool):
                    return bool(obj)
                return obj

            json_settings_to_save = convert_booleans(settings_copy)

            # Ensure templateId consistency (optional but good practice)
            if 'api' in json_settings_to_save and isinstance(json_settings_to_save['api'], dict):
                if 'template' in json_settings_to_save['api']:
                    json_settings_to_save['api'].pop('template')
                if 'templateId' not in json_settings_to_save['api']:
                    json_settings_to_save['api']['templateId'] = 'mistral'

            if 'apis' in json_settings_to_save and isinstance(json_settings_to_save['apis'], dict):
                for api_id, api_config in json_settings_to_save['apis'].items():
                    if isinstance(api_config, dict):
                        if 'template' in api_config:
                            api_config.pop('template')
                        if 'templateId' not in api_config:
                            api_config['templateId'] = 'mistral'

            # Save to file
            with open(self.settings_file, 'w', encoding='utf-8') as f:
                json.dump(json_settings_to_save, f, indent=2)

            # --- Verification Logging ---
            try:
                with open(self.settings_file, 'r', encoding='utf-8') as f:
                    saved_content = json.load(f)
                    self.logger.log_step(f"**Verified saved settings:** {json.dumps(saved_content, indent=2)}")
            except Exception as verify_err:
                 self.logger.log_error(f"Error verifying saved settings file: {verify_err}")
            # --- End Verification Logging ---

            return True

        except Exception as e:
            self.logger.log_error(f"Error saving settings: {str(e)}")
            self.logger.log_error(traceback.format_exc()) # Add traceback
            return False

    def _validate_directory(self, directory: str) -> bool:
        """Validate if a directory exists and is accessible."""
        try:
            if not directory:
                return True  # Empty directory is valid (disables the feature)
                
            # Convert to Path and resolve
            dir_path = Path(directory).resolve()
            
            # Check if directory exists
            if not dir_path.exists():
                self.logger.log_warning(f"Directory does not exist: {directory}")
                return False
                
            if not dir_path.is_dir():
                self.logger.log_warning(f"Path is not a directory: {directory}")
                return False
                
            # Check if directory is accessible (don't require PNG files to exist)
            # This allows users to set empty directories where they plan to add characters later
            try:
                # Test directory access by attempting to list contents
                list(dir_path.iterdir())
            except PermissionError:
                self.logger.log_warning(f"Permission denied accessing directory: {directory}")
                return False
                
            self.logger.log_step(f"Directory validation passed: {directory}")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error validating directory: {str(e)}")
            self.logger.log_error(traceback.format_exc()) # Add traceback
            return False

    def _validate_models_directory(self, directory: str) -> bool:
        """Validate if a directory exists and could contain model files."""
        try:
            if not directory:
                return True  # Empty directory is valid (disables the feature)
                
            # Convert to Path and resolve
            dir_path = Path(directory).resolve()
            
            # Check if directory exists
            if not dir_path.exists():
                self.logger.log_warning(f"Models directory does not exist: {directory}")
                return False
                
            if not dir_path.is_dir():
                self.logger.log_warning(f"Models path is not a directory: {directory}")
                return False
            
            # For models directory, we don't strictly require model files to be present
            # as users might scan an empty directory where they plan to download models
            self.logger.log_step(f"Models directory validation passed: {directory}")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error validating models directory: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False

    def get_setting(self, key: str) -> Any:
        """Get a setting value."""
        return self.settings.get(key)
        
    def get_api_settings(self) -> Dict[str, Any]:
        """Get API settings."""
        return self.settings.get('api', {})

    # Removed update_setting (handled by deep_merge in update_settings)

    def update_settings(self, new_settings: Dict[str, Any]) -> bool:
        """Update multiple settings at once using a deep merge."""
        try:
            self.logger.log_step(f"Updating settings with deep merge: {json.dumps(new_settings)}")

            # Perform a deep merge of new_settings onto a copy of self.settings
            # This prevents modifying self.settings directly if saving fails
            current_settings_copy = copy.deepcopy(self.settings)
            merged_settings = deep_merge(new_settings, current_settings_copy)

            # Optional: Add validation logic here if needed after merge
            # e.g., validate directory paths in merged_settings

            # Save the fully merged settings
            if self._save_settings(merged_settings):
                 # If save is successful, update the live settings object
                 self.settings = merged_settings
                 return True
            else:
                 # If save fails, the live self.settings remains unchanged
                 return False

        except Exception as e:
            self.logger.log_error(f"Error updating multiple settings: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False
    
    def save_settings(self) -> bool:
        """Public method to save current settings to file."""
        try:
            self.logger.log_step("Saving settings to file")
            return self._save_settings(self.settings)
        except Exception as e:
            self.logger.log_error(f"Error in save_settings: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False