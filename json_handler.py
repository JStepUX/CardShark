import json
from tkinter import messagebox
from datetime import datetime, timezone

class JsonHandler:
    def __init__(self, main_json_text, base_prompt_text, status_var, logger, app):
        """Initialize JsonHandler with required UI elements and logger."""
        self.json_text = main_json_text
        self.base_prompt_text = base_prompt_text
        self.status_var = status_var
        self.logger = logger
        self.app = app  # Store reference to main app
        self.png_handler = None

    def set_png_handler(self, handler):
        """Set the PNG handler reference."""
        self.png_handler = handler

    def update_specific_fields(self, json_data):
        """Update the specific text fields from JSON data."""
        try:
            # Update basic info fields through manager
            self.app.basic_manager.update_fields(json_data)

            # Update personality/scenario fields through manager
            self.app.personality_manager.update_fields(json_data)

            # Update messages through manager
            self.app.message_manager.refresh_messages(json_data)

            # Handle V2 format
            if json_data.get('spec') == 'chara_card_v2':
                char_data = json_data.get('data', {})
                
                # Update base prompt
                self.base_prompt_text.delete(1.0, "end-1c")
                self.base_prompt_text.insert(1.0, char_data.get('description', ''))
                
        except Exception as e:
            self.logger.log_step(f"Error updating specific fields: {str(e)}")
            raise
    
    def update_main_json(self):
        """Update the main JSON with values from specific fields."""
        try:
            # Get current JSON content
            json_str = self.json_text.get("1.0", "end-1c").strip()
            self.logger.log_step("Current JSON before update:", json_str)
            
            json_data = json.loads(json_str)
            
            # Ensure we're working with V2 format
            if json_data.get('spec') != 'chara_card_v2':
                raise ValueError("Invalid card format - must be V2")
            
            # Get current field values
            base_prompt = self.base_prompt_text.get("1.0", "end-1c").strip()
            
            # Get first message from MessageManager
            first_message = self.app.message_manager.get_first_message()
            
            # Get basic info data through manager
            basic_info = self.app.basic_manager.get_field_data()

            # Get personality/scenario data through manager
            personality_data = self.app.personality_manager.get_field_data()
            
            # Get alternate greetings from MessageManager
            alternate_greetings = self.app.message_manager.get_alternate_greetings()
            
            self.logger.log_step("Current field values:", {
                "base_prompt": base_prompt,
                "first_message": first_message,
                "basic_info": basic_info,
                "personality_data": personality_data,
                "alternate_greetings": alternate_greetings
            })
            
            # Update fields in V2 format
            json_data['data']['description'] = base_prompt
            json_data['data']['first_mes'] = first_message
            json_data['data']['alternate_greetings'] = alternate_greetings
            json_data['data'].update(basic_info)  # Add basic info fields
            json_data['data'].update(personality_data)  # Add personality/scenario fields
            
            # Update main JSON display
            formatted_json = json.dumps(json_data, indent=4, ensure_ascii=False)
            self.json_text.delete(1.0, "end-1c")
            self.json_text.insert(1.0, formatted_json)
            
            self.logger.log_step("Updated JSON:", formatted_json)
            
            self.status_var.set("Main JSON updated successfully")
            return True
            
        except Exception as e:
            self.logger.log_step(f"Error updating JSON: {str(e)}")
            self.status_var.set(f"Error updating JSON: {str(e)}")
            messagebox.showerror("Error", f"Failed to update JSON: {str(e)}")
            return False