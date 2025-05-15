# backend/content_filter_manager.py
# Description: Manages content filtering rules for the application
import json
import os
import traceback
import glob
from pathlib import Path
from typing import Dict, Any, List

class ContentFilterManager:
    def __init__(self, logger):
        self.logger = logger
        self.filters_dir = self._get_filters_dir()
        self.active_filters_file = self.filters_dir / "active_filters.json"
        self.available_packages = {}  # Dict of package_id -> package_info
        self.active_package_ids = []  # List of active package IDs
        self.rules = []  # Combined rules from all active packages
        
        # Create filters directory if it doesn't exist
        if not self.filters_dir.exists():
            self.filters_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize filter packages
        self._load_available_packages()
        self._load_active_packages()
        self._combine_active_rules()
        
        self.logger.log_step(f"[ContentFilterManager initialized] Loaded {len(self.rules)} content filtering rules from {len(self.active_package_ids)} active packages")

    def _get_filters_dir(self) -> Path:
        """Get the path where content filters should be stored."""
        import sys
        if getattr(sys, 'frozen', False):
            # If running as PyInstaller bundle
            return Path(sys.executable).parent / 'content_filters'
        else:
            # If running from source
            return Path(__file__).parent.parent / 'content_filters'

    def _load_available_packages(self):
        """Load information about all available filter packages."""
        self.available_packages = {}
        
        # Look for all filter package JSON files
        package_files = glob.glob(str(self.filters_dir / "*_filter.json"))
        builtin_files = glob.glob(str(self.filters_dir / "builtin" / "*_filter.json"))
        all_files = package_files + builtin_files
        
        for file_path in all_files:
            try:
                package_id = Path(file_path).stem  # e.g., "profanity_filter"
                with open(file_path, 'r', encoding='utf-8') as f:
                    package_data = json.load(f)
                    
                # Extract package metadata and rules
                package_info = {
                    'id': package_id,
                    'name': package_data.get('name', package_id),
                    'description': package_data.get('description', ''),
                    'version': package_data.get('version', '1.0'),
                    'rules_count': len(package_data.get('rules', [])),
                    'path': file_path,
                    'is_builtin': 'builtin' in file_path,
                    'rules': package_data.get('rules', [])
                }
                
                self.available_packages[package_id] = package_info
                self.logger.log_step(f"Loaded filter package: {package_id} ({package_info['rules_count']} rules)")
                
            except Exception as e:
                self.logger.log_error(f"Error loading filter package {file_path}: {str(e)}")

    def _load_active_packages(self):
        """Load the list of active filter packages."""
        # Default to empty list if no active filters file exists
        self.active_package_ids = []
        
        if self.active_filters_file.exists():
            try:
                with open(self.active_filters_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.active_package_ids = data.get('active_packages', [])
                    self.logger.log_step(f"Loaded active filter packages: {', '.join(self.active_package_ids)}")
            except Exception as e:
                self.logger.log_error(f"Error loading active filter packages: {str(e)}")
                # Create a new active filters file
                self._save_active_packages()

    def _save_active_packages(self):
        """Save the list of active filter packages."""
        try:
            with open(self.active_filters_file, 'w', encoding='utf-8') as f:
                json.dump({
                    'active_packages': self.active_package_ids
                }, f, indent=2)
                self.logger.log_step(f"Saved active filter packages: {', '.join(self.active_package_ids)}")
            return True
        except Exception as e:
            self.logger.log_error(f"Error saving active filter packages: {str(e)}")
            return False

    def _combine_active_rules(self):
        """Combine rules from all active packages into a single rules list."""
        self.rules = []
        
        for package_id in self.active_package_ids:
            if package_id in self.available_packages:
                package = self.available_packages[package_id]
                self.rules.extend(package['rules'])
        
        # Ensure all rules have the required fields
        for rule in self.rules:
            if 'enabled' not in rule:
                rule['enabled'] = True
                
        self.logger.log_step(f"Combined {len(self.rules)} rules from active filter packages")

    def get_available_packages(self) -> List[Dict[str, Any]]:
        """Get information about all available filter packages."""
        return [
            {
                'id': pkg['id'],
                'name': pkg['name'],
                'description': pkg['description'],
                'version': pkg['version'],
                'rules_count': pkg['rules_count'],
                'is_active': pkg['id'] in self.active_package_ids,
                'is_builtin': pkg['is_builtin']
            }
            for pkg in self.available_packages.values()
        ]

    def get_active_packages(self) -> List[Dict[str, Any]]:
        """Get information about active filter packages."""
        return [
            {
                'id': pkg['id'],
                'name': pkg['name'],
                'description': pkg['description'],
                'version': pkg['version'],
                'rules_count': pkg['rules_count'],
                'is_builtin': pkg['is_builtin']
            }
            for pkg_id, pkg in self.available_packages.items()
            if pkg_id in self.active_package_ids
        ]

    def activate_package(self, package_id: str) -> bool:
        """Activate a filter package."""
        if package_id not in self.available_packages:
            self.logger.log_error(f"Cannot activate unknown package: {package_id}")
            return False
            
        if package_id not in self.active_package_ids:
            self.active_package_ids.append(package_id)
            self._save_active_packages()
            self._combine_active_rules()
            self.logger.log_step(f"Activated filter package: {package_id}")
        return True

    def deactivate_package(self, package_id: str) -> bool:
        """Deactivate a filter package."""
        if package_id in self.active_package_ids:
            self.active_package_ids.remove(package_id)
            self._save_active_packages()
            self._combine_active_rules()
            self.logger.log_step(f"Deactivated filter package: {package_id}")
        return True

    def get_package_rules(self, package_id: str) -> List[Dict[str, Any]]:
        """Get rules for a specific package."""
        if package_id in self.available_packages:
            return self.available_packages[package_id]['rules']
        return []

    def create_package(self, package_info: Dict[str, Any], rules: List[Dict[str, Any]]) -> bool:
        """Create a new filter package."""
        try:
            package_id = package_info.get('id', f"custom_{len(self.available_packages)}_filter")
            if not package_id.endswith('_filter'):
                package_id += '_filter'
                
            # Create package data
            package_data = {
                'name': package_info.get('name', 'Custom Filter'),
                'description': package_info.get('description', 'Custom filter package'),
                'version': package_info.get('version', '1.0'),
                'rules': rules
            }
            
            # Save package file
            file_path = self.filters_dir / f"{package_id}.json"
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(package_data, f, indent=2)

            # Reload available packages
            self._load_available_packages()
            
            self.logger.log_step(f"Created new filter package: {package_id}")
            return True
        except Exception as e:
            self.logger.log_error(f"Error creating filter package: {str(e)}")
            return False

    def update_package(self, package_id: str, rules: List[Dict[str, Any]]) -> bool:
        """Update rules in an existing package."""
        if package_id not in self.available_packages:
            self.logger.log_error(f"Cannot update unknown package: {package_id}")
            return False
            
        try:
            package = self.available_packages[package_id]
            
            # Don't allow updating builtin packages
            if package.get('is_builtin', False):
                self.logger.log_error(f"Cannot update builtin package: {package_id}")
                return False
                
            # Read existing package data
            with open(package['path'], 'r', encoding='utf-8') as f:
                package_data = json.load(f)
                
            # Update rules
            package_data['rules'] = rules
            
            # Save updated package
            with open(package['path'], 'w', encoding='utf-8') as f:
                json.dump(package_data, f, indent=2)
                
            # Reload packages
            self._load_available_packages()
            self._combine_active_rules()
            
            self.logger.log_step(f"Updated filter package: {package_id}")
            return True
        except Exception as e:
            self.logger.log_error(f"Error updating filter package: {str(e)}")
            return False

    def delete_package(self, package_id: str) -> bool:
        """Delete a filter package."""
        if package_id not in self.available_packages:
            self.logger.log_error(f"Cannot delete unknown package: {package_id}")
            return False
            
        # Don't allow deleting builtin packages
        package = self.available_packages[package_id]
        if package.get('is_builtin', False):
            self.logger.log_error(f"Cannot delete builtin package: {package_id}")
            return False
            
        try:
            # Remove from active packages first
            if package_id in self.active_package_ids:
                self.active_package_ids.remove(package_id)
                self._save_active_packages()
            
            # Delete the file
            file_path = Path(package['path'])
            if file_path.exists():
                file_path.unlink()
                
            # Reload packages
            self._load_available_packages()
            self._combine_active_rules()
            
            self.logger.log_step(f"Deleted filter package: {package_id}")
            return True
        except Exception as e:
            self.logger.log_error(f"Error deleting filter package: {str(e)}")
            return False

    def get_filters(self) -> List[Dict[str, Any]]:
        """Get all content filtering rules from active packages."""
        return self.rules

    def update_filters(self, new_rules: List[Dict[str, Any]]) -> bool:
        """Update content filtering rules.
        This will create or update a package called "custom_filter" with the provided rules.
        """
        try:
            # Create or update the custom filter package
            custom_pkg_id = "custom_filter"
            
            if custom_pkg_id in self.available_packages:
                # Update existing custom package
                success = self.update_package(custom_pkg_id, new_rules)
            else:
                # Create new custom package
                pkg_info = {
                    'id': custom_pkg_id,
                    'name': 'Custom Filters',
                    'description': 'User-defined content filters'
                }
                success = self.create_package(pkg_info, new_rules)
            
            # Ensure the custom package is active
            if success and custom_pkg_id not in self.active_package_ids:
                self.activate_package(custom_pkg_id)
                
            return success
        except Exception as e:
            self.logger.log_error(f"Error updating content filters: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False

    # Legacy method to ensure backward compatibility
    def save_filters(self) -> bool:
        """Legacy method: Save the combined rules to a file.
        This is maintained for backward compatibility.
        """
        try:
            # Use update_filters to save to the custom filter package
            return self.update_filters(self.rules)
        except Exception as e:
            self.logger.log_error(f"Error in legacy save_filters: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False

    # Method to initialize default filter packages
    def initialize_default_packages(self):
        """Create and initialize default filter packages if they don't exist."""
        builtin_dir = self.filters_dir / "builtin"
        builtin_dir.mkdir(exist_ok=True, parents=True)
        
        # Define default packages
        default_packages = {
            "profanity_filter": {
                "name": "Basic Profanity Filter",
                "description": "Filters common profanity terms",
                "version": "1.0",
                "rules": [
                    {
                        "original": "fuck",
                        "substitutions": ["f***", "darn"],
                        "mode": "case-insensitive",
                        "enabled": True,
                        "strategy": "auto"
                    },
                    {
                        "original": "shit",
                        "substitutions": ["s***", "shoot"],
                        "mode": "case-insensitive",
                        "enabled": True,
                        "strategy": "auto"
                    }
                ]
            },
            "safety_filter": {
                "name": "Safety Filter",
                "description": "Filters content unsafe for younger audiences",
                "version": "1.0",
                "rules": [
                    {
                        "original": "nsfw",
                        "substitutions": [""],
                        "mode": "case-insensitive",
                        "enabled": True,
                        "strategy": "api-ban"
                    }
                ]
            },
            "purple_prose_filter": {
                "name": "Purple Prose Filter",
                "description": "Reduces overly flowery language",
                "version": "1.0",
                "rules": [
                    {
                        "original": "orbs",
                        "substitutions": ["eyes"],
                        "mode": "case-insensitive",
                        "enabled": True,
                        "strategy": "client-replace"
                    }
                ]
            }
        }
        
        # Create each default package if it doesn't exist
        for pkg_id, pkg_data in default_packages.items():
            file_path = builtin_dir / f"{pkg_id}.json"
            if not file_path.exists():
                try:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        json.dump(pkg_data, f, indent=2)
                    self.logger.log_step(f"Created default filter package: {pkg_id}")
                except Exception as e:
                    self.logger.log_error(f"Error creating default filter package {pkg_id}: {str(e)}")
        
        # Reload packages
        self._load_available_packages()
        
        # Activate default packages if no packages are active
        if not self.active_package_ids:
            self.active_package_ids = ["profanity_filter"]
            self._save_active_packages()
            self._combine_active_rules()
