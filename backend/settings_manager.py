import json
import os
import sys
from pathlib import Path
from typing import Dict, Any

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
            "save_to_character_directory": False,
            "theme": "dark",
            "version": "1.2",
            "api": {
                "enabled": False,
                "url": "http://localhost:5001",
                "apiKey": "",
                "templateId": "mistral",  # Use templateId only
                "lastConnectionStatus": None
            }
        }
        
        try:
            if self.settings_file.exists():
                with open(self.settings_file, 'r') as f:
                    stored_settings = json.load(f)
                    
                    # Convert any legacy template field to templateId
                    if 'api' in stored_settings and isinstance(stored_settings['api'], dict):
                        api_config = stored_settings['api']
                        if 'template' in api_config:
                            self.logger.log_step("Converting legacy 'template' to 'templateId'")
                            api_config['templateId'] = api_config['template']
                            api_config.pop('template')  # Remove the old field
                    
                    # Check all API configs in the 'apis' field
                    if 'apis' in stored_settings and isinstance(stored_settings['apis'], dict):
                        for api_id, api_config in stored_settings['apis'].items():
                            if isinstance(api_config, dict) and 'template' in api_config:
                                self.logger.log_step(f"Converting API {api_id} legacy 'template' to 'templateId'")
                                api_config['templateId'] = api_config['template']
                                api_config.pop('template')  # Remove the old field
                    
                    # Merge with defaults in case new settings were added
                    merged = {**default_settings, **stored_settings}
                    
                    # Ensure API settings exist with defaults
                    if 'api' not in merged:
                        merged['api'] = default_settings['api']
                    
                    return merged
            
            # If no settings file exists, create one with defaults
            self._save_settings(default_settings)
            return default_settings
            
        except Exception as e:
            self.logger.log_error(f"Error loading settings: {str(e)}")
            return default_settings

    def update_settings_with_apis(self, data):
        """Special handler for API settings update to preserve templateId"""
        if 'apis' in data:
            try:
                # Extract the APIs data
                apis_data = data['apis']
                self.logger.log_step(f"Processing APIs update: {apis_data}")
                
                # Get current settings
                current_settings = self.settings
                current_apis = current_settings.get('apis', {})
                
                # Initialize updated APIs dictionary
                updated_apis = {}
                
                # Process each API
                for api_id, api_config in apis_data.items():
                    # Log the API config for debugging
                    self.logger.log_step(f"API {api_id} configuration:")
                    self.logger.log_step(f"  - Raw data: {api_config}")
                    
                    # Check if templateId is present
                    if 'templateId' in api_config:
                        self.logger.log_step(f"  - Found templateId: {api_config['templateId']}")
                    
                    # Merge with existing config if available
                    if api_id in current_apis:
                        # Start with existing config
                        merged_config = dict(current_apis[api_id])
                        
                        # Update with new values, ensuring templateId is preserved
                        for key, value in api_config.items():
                            merged_config[key] = value
                            self.logger.log_step(f"  - Updated {key}: {value}")
                            
                        updated_apis[api_id] = merged_config
                    else:
                        # Just use new config
                        updated_apis[api_id] = api_config
                    
                    # Verify the final config has templateId if it was in the original data
                    if 'templateId' in api_config and 'templateId' not in updated_apis[api_id]:
                        self.logger.log_error(f"templateId lost during merge for {api_id}!")
                    
                    # Log the final API config
                    self.logger.log_step(f"Final API {api_id} config: {updated_apis[api_id]}")
                
                # Update the settings directly
                current_settings['apis'] = updated_apis
                
                # Save the updated settings
                success = self._save_settings(current_settings)
                self.logger.log_step(f"Settings save result: {success}")
                
                # Verify the settings were saved correctly
                saved_settings = self.settings
                self.logger.log_step("Verifying saved settings...")
                
                if 'apis' in saved_settings:
                    for api_id, api_config in saved_settings['apis'].items():
                        self.logger.log_step(f"Saved API {api_id}:")
                        self.logger.log_step(f"  - templateId: {api_config.get('templateId')}")
                
                return success
                
            except Exception as e:
                self.logger.log_error(f"Error updating API settings: {str(e)}")
                import traceback
                self.logger.log_error(traceback.format_exc())
                return False
        
        return True  # No APIs to update
    
    def update_api_settings(self, updates: Dict[str, Any]) -> bool:
        """Update API settings and maintain connection state."""
        try:
            self.logger.log_step(f"Updating API settings: {updates}")
            
            # Convert any legacy template to templateId
            if 'template' in updates:
                self.logger.log_step(f"Converting legacy 'template' to 'templateId': {updates['template']}")
                updates['templateId'] = updates['template']
                updates.pop('template')  # Remove the old field
            
            current_api = self.settings.get('api', {})
            
            # Preserve connection status if not explicitly changed
            if ('lastConnectionStatus' not in updates and 
                'lastConnectionStatus' in current_api):
                updates['lastConnectionStatus'] = current_api['lastConnectionStatus']
                self.logger.log_step("Preserved existing connection status")
                
            # Update API settings
            updated_api = {**current_api, **updates}
            
            # Remove any legacy template field
            if 'template' in updated_api:
                updated_api.pop('template')
                
            self.settings['api'] = updated_api
            
            # Save settings
            success = self._save_settings(self.settings)
            if success:
                self.logger.log_step("API settings saved successfully")
                self.logger.log_step(f"Current API state: {json.dumps(updated_api, indent=2)}")
            else:
                self.logger.log_warning("Failed to save API settings")
                
            return success
            
        except Exception as e:
            self.logger.log_error(f"Error updating API settings: {str(e)}")
            return False

    def _save_settings(self, settings: Dict[str, Any]) -> bool:
        """Save settings to file with proper JSON serialization."""
        try:
            # Convert Python booleans to JSON booleans
            def convert_booleans(obj):
                if isinstance(obj, dict):
                    return {k: convert_booleans(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [convert_booleans(x) for x in obj]
                elif isinstance(obj, bool):
                    return bool(obj)  # Ensure it's a Python boolean
                return obj

            # Convert settings before saving
            json_settings = convert_booleans(settings)
            
            # Debug logging for API enabled state
            if 'api' in json_settings:
                api_settings = json_settings['api']
                self.logger.log_step(f"Pre-save API enabled state: {api_settings.get('enabled')}")
                self.logger.log_step(f"Pre-save API enabled type: {type(api_settings.get('enabled'))}")
            
            # Save to file
            with open(self.settings_file, 'w') as f:
                json.dump(json_settings, f, indent=2)
            
            # Verify what we just saved
            with open(self.settings_file, 'r') as f:
                saved_content = json.load(f)
                self.logger.log_step(f"Verified saved settings: {json.dumps(saved_content, indent=2)}")
            
            # Verify API enabled state specifically
            if 'api' in saved_content:
                self.logger.log_step(f"Post-save API enabled state: {saved_content['api'].get('enabled')}")
                self.logger.log_step(f"Post-save API enabled type: {type(saved_content['api'].get('enabled'))}")
            
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error saving settings: {str(e)}")
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
                
            # Check if directory contains PNG files
            png_files = list(dir_path.glob("*.png"))
            if not png_files:
                self.logger.log_warning(f"No PNG files found in directory: {directory}")
                return False
                
            self.logger.log_step(f"Directory validation passed: {directory}")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error validating directory: {str(e)}")
            return False

    def get_setting(self, key: str) -> Any:
        """Get a setting value."""
        return self.settings.get(key)
        
    def get_api_settings(self) -> Dict[str, Any]:
        """Get API settings."""
        return self.settings.get('api', {})

    def update_setting(self, key: str, value: Any) -> bool:
        """Update a specific setting by key."""
        try:
            # Special handling for character_directory to ensure it exists
            if key == 'character_directory':
                if not self._validate_directory(value):
                    self.logger.log_warning(f"Invalid directory path: {value}")
                    return False
            
            # Special handling for API settings
            if key == 'api':
                if isinstance(value, dict):
                    current_api = self.settings.get('api', {})
                    self.settings['api'] = {**current_api, **value}
                    return self._save_settings(self.settings)
            
            # Update the setting
            self.settings[key] = value
            return self._save_settings(self.settings)
            
        except Exception as e:
            self.logger.log_error(f"Error updating setting '{key}': {str(e)}")
            return False

    def update_api_settings(self, updates: Dict[str, Any]) -> bool:
        """Update API settings and maintain connection state."""
        try:
            self.logger.log_step(f"Updating API settings: {updates}")
            current_api = self.settings.get('api', {})
            
            # Preserve connection status if not explicitly changed
            if ('lastConnectionStatus' not in updates and 
                'lastConnectionStatus' in current_api):
                updates['lastConnectionStatus'] = current_api['lastConnectionStatus']
                self.logger.log_step("Preserved existing connection status")
                
            # Update API settings
            updated_api = {**current_api, **updates}
            self.settings['api'] = updated_api
            
            # Save settings
            success = self._save_settings(self.settings)
            if success:
                self.logger.log_step("API settings saved successfully")
                self.logger.log_step(f"Current API state: {json.dumps(updated_api, indent=2)}")
            else:
                self.logger.log_warning("Failed to save API settings")
                
            return success
            
        except Exception as e:
            self.logger.log_error(f"Error updating API settings: {str(e)}")
            return False