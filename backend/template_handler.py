# backend/template_handler.py
import os
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Any
import traceback

class TemplateHandler:
    """Handles operations for chat templates"""
    
    def __init__(self, logger):
        self.logger = logger
        self.templates_dir = self._get_templates_dir()
        
    def _get_templates_dir(self) -> Path:
        """Get the templates directory path"""
        # Determine base directory based on environment
        if getattr(sys, 'frozen', False):
            # Running as PyInstaller bundle
            base_dir = Path(sys._MEIPASS)
        else:
            # Running from source
            base_dir = Path(__file__).parent.parent
            
        # Create templates directory if it doesn't exist
        templates_dir = base_dir / 'templates'
        templates_dir.mkdir(parents=True, exist_ok=True)
        
        self.logger.log_step(f"Templates directory: {templates_dir}")
        return templates_dir
        
    def get_all_templates(self) -> List[Dict[str, Any]]:
        """Get all custom templates from the file system"""
        try:
            templates = []
            
            # Load all JSON files in the templates directory
            for file_path in self.templates_dir.glob('*.json'):
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        try:
                            template_data = json.load(f)
                            # Validate template has required fields
                            if self._validate_template_data(template_data, file_path):
                                templates.append(template_data)
                            else:
                                self.logger.log_warning(f"Invalid template data in {file_path}")
                        except json.JSONDecodeError as e:
                            self.logger.log_error(f"Invalid JSON in template {file_path}: {str(e)}")
                            continue
                except Exception as e:
                    self.logger.log_error(f"Error loading template {file_path}: {str(e)}")
                    continue
                    
            self.logger.log_step(f"Loaded {len(templates)} templates from {self.templates_dir}")
            return templates
            
        except Exception as e:
            self.logger.log_error(f"Error getting templates: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return []
    
    def _validate_template_data(self, data: Any, file_path: Path) -> bool:
        """Validate template data has required fields"""
        # Check if data is a dictionary
        if not isinstance(data, dict):
            self.logger.log_warning(f"Template data in {file_path} is not a dictionary")
            return False
            
        # Check for required fields
        required_fields = ['id', 'name', 'userFormat', 'assistantFormat']
        for field in required_fields:
            if field not in data:
                self.logger.log_warning(f"Template in {file_path} missing required field: {field}")
                return False
                
        # Provide default values for optional fields
        
    def _validate_template_data(self, data: Any, file_path: Path) -> bool:
        """Validate template data has required fields"""
        # Check if data is a dictionary
        if not isinstance(data, dict):
            self.logger.log_warning(f"Template data in {file_path} is not a dictionary")
            return False
            
        # Check for required fields
        required_fields = ['id', 'name', 'userFormat', 'assistantFormat']
        for field in required_fields:
            if field not in data:
                self.logger.log_warning(f"Template in {file_path} missing required field: {field}")
                return False
                
        # Provide default values for optional fields
        if 'description' not in data:
            data['description'] = ''
            
        if 'isBuiltIn' not in data:
            data['isBuiltIn'] = False
            
        if 'isEditable' not in data:
            data['isEditable'] = True
            
        if 'detectionPatterns' not in data or not isinstance(data['detectionPatterns'], list):
            data['detectionPatterns'] = []
            
        if 'stopSequences' not in data or not isinstance(data['stopSequences'], list):
            data['stopSequences'] = []
            
        return True
            
    def save_template(self, template: Dict[str, Any]) -> bool:
        """Save a template to the file system"""
        try:
            if not template.get('id'):
                self.logger.log_error("Template ID is required")
                return False
                
            # Validate the template
            if not self._validate_template_data(template, Path("new_template")):
                return False
                
            # Sanitize ID for filename
            template_id = template['id']
            sanitized_id = ''.join(c for c in template_id if c.isalnum() or c in '-_')
            
            # Create filename
            file_path = self.templates_dir / f"{sanitized_id}.json"
            
            # Save the template
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(template, f, indent=2)
                
            self.logger.log_step(f"Saved template {template_id} to {file_path}")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error saving template: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False
            
    def delete_template(self, template_id: str) -> bool:
        """Delete a template from the file system"""
        try:
            # Sanitize ID for filename
            sanitized_id = ''.join(c for c in template_id if c.isalnum() or c in '-_')
            
            # Find the file
            file_path = self.templates_dir / f"{sanitized_id}.json"
            
            if not file_path.exists():
                self.logger.log_warning(f"Template file not found: {file_path}")
                return False
                
            # Delete the file
            file_path.unlink()
            self.logger.log_step(f"Deleted template {template_id} from {file_path}")
            return True
            
        except Exception as e:
            self.logger.log_error(f"Error deleting template: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False
            
    def save_templates(self, templates: List[Dict[str, Any]]) -> bool:
        """Save multiple templates at once"""
        try:
            success = True
            saved_count = 0
            
            for template in templates:
                if self.save_template(template):
                    saved_count += 1
                else:
                    success = False
                    
            self.logger.log_step(f"Saved {saved_count}/{len(templates)} templates")
            return success
            
        except Exception as e:
            self.logger.log_error(f"Error saving templates: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False