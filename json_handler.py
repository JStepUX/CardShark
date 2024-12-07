import json
import tkinter as tk
import ttkbootstrap as ttk
from tkinter import messagebox
from datetime import datetime, timezone
from text_manager import text_manager

class JsonHandler:
    def __init__(self, main_json_text, base_prompt_text, status_var, logger, app):
        """Initialize JsonHandler with required UI elements and logger."""
        self.json_text = main_json_text
        self.base_prompt_text = base_prompt_text
        self.status_var = status_var
        self.logger = logger
        self.app = app  # Store reference to main app
        self.png_handler = None
        self.viewer = None  # Will hold JsonViewer instance
    
    def create_viewer(self, parent_frame):
        """Create a JSON viewer instance."""
        self.viewer = JsonViewer(parent_frame, self, self.logger)
        return self.viewer
    
    def refresh_viewer(self):
        """Refresh the JSON viewer if it exists."""
        if self.viewer:
            self.viewer.refresh_view()

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

            self.refresh_viewer()
            
            self.status_var.set("Main JSON updated successfully")
            return True
            
        except Exception as e:
            self.logger.log_step(f"Error updating JSON: {str(e)}")
            self.status_var.set(f"Error updating JSON: {str(e)}")
            messagebox.showerror("Error", f"Failed to update JSON: {str(e)}")
            return False
        
class JsonViewer:
    def __init__(self, parent_frame, json_handler, logger):
        """Initialize JSON viewer with parent frame and handler references."""
        self.parent_frame = parent_frame
        self.json_handler = json_handler
        self.logger = logger
        
        # Create frame for text widget and scrollbar
        self.view_frame = ttk.Frame(self.parent_frame)
        self.view_frame.pack(fill=tk.BOTH, expand=True)
        
        # Create text widget for JSON display
        self.json_view = text_manager.create_text_widget(
            self.view_frame,
            height=40,
            state='disabled',  # Read-only
            font=('Consolas', 14)  # Use monospace font for better JSON display
        )
        self.json_view.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # Create scrollbar
        self.scrollbar = ttk.Scrollbar(
            self.view_frame,
            orient="vertical",
            command=self.json_view.text_widget.yview,  # Use internal text widget
            bootstyle="rounded"
        )
        self.scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Configure text widget to use scrollbar
        self.json_view.text_widget.configure(yscrollcommand=self.scrollbar.set)
        
        # Configure syntax highlighting tags
        self.setup_tags()
        
        # Initial update
        self.refresh_view()
    
    def setup_tags(self):
        """Set up text tags for syntax highlighting."""
        text_widget = self.json_view.text_widget  # Get internal text widget
        
        text_widget.tag_configure('key', foreground='#89CFF0')      # Light blue for keys
        text_widget.tag_configure('string', foreground='#90EE90')   # Light green for strings
        text_widget.tag_configure('number', foreground='#FFB6C1')   # Light pink for numbers
        text_widget.tag_configure('boolean', foreground='#FFA07A')  # Light salmon for booleans
        text_widget.tag_configure('null', foreground='#D3D3D3')     # Light gray for null
        text_widget.tag_configure('bracket', foreground='#DDA0DD')  # Plum for brackets/braces
    
    def apply_highlighting(self, text):
        """Apply syntax highlighting to JSON text."""
        import re
        text_widget = self.json_view.text_widget  # Get internal text widget
        
        # Enable editing temporarily
        text_widget.configure(state='normal')
        text_widget.delete('1.0', tk.END)
        
        # Split the text into lines for processing
        lines = text.split('\n')
        for i, line in enumerate(lines):
            if i > 0:
                text_widget.insert(tk.END, '\n')
            
            # Find and highlight parts of each line
            pos = 0
            while pos < len(line):
                if line[pos:pos+4] == '    ':
                    # Insert indentation
                    text_widget.insert(tk.END, '    ')
                    pos += 4
                    continue
                
                # Match patterns
                if line[pos] in '[{':
                    text_widget.insert(tk.END, line[pos], 'bracket')
                    pos += 1
                elif line[pos] in ']}':
                    text_widget.insert(tk.END, line[pos], 'bracket')
                    pos += 1
                elif line[pos] == '"':
                    # Find the end of the string
                    end = pos + 1
                    while end < len(line):
                        if line[end] == '"' and line[end-1] != '\\':
                            break
                        end += 1
                    end += 1
                    
                    # Check if this is a key (followed by :)
                    is_key = False
                    next_non_space = end
                    while next_non_space < len(line) and line[next_non_space].isspace():
                        next_non_space += 1
                    if next_non_space < len(line) and line[next_non_space] == ':':
                        is_key = True
                    
                    text_widget.insert(tk.END, line[pos:end], 'key' if is_key else 'string')
                    pos = end
                elif line[pos].isdigit() or line[pos] == '-':
                    # Find the end of the number
                    end = pos + 1
                    while end < len(line) and (line[end].isdigit() or line[end] in '.eE-'):
                        end += 1
                    text_widget.insert(tk.END, line[pos:end], 'number')
                    pos = end
                elif line[pos:pos+4] == 'true' or line[pos:pos+5] == 'false':
                    length = 4 if line[pos:pos+4] == 'true' else 5
                    text_widget.insert(tk.END, line[pos:pos+length], 'boolean')
                    pos += length
                elif line[pos:pos+4] == 'null':
                    text_widget.insert(tk.END, 'null', 'null')
                    pos += 4
                else:
                    text_widget.insert(tk.END, line[pos])
                    pos += 1
        
        # Disable editing again
        text_widget.configure(state='disabled')
    
    def refresh_view(self):
        """Update the JSON view with current content."""
        try:
            # Get current JSON content from handler
            json_str = self.json_handler.json_text.get("1.0", "end-1c").strip()
            
            # Insert formatted JSON if valid
            if json_str:
                try:
                    # Parse and reformat JSON
                    json_data = json.loads(json_str)
                    formatted_json = json.dumps(json_data, indent=4, ensure_ascii=False)
                    self.apply_highlighting(formatted_json)
                except json.JSONDecodeError:
                    text_widget = self.json_view.text_widget
                    text_widget.configure(state='normal')
                    text_widget.delete("1.0", "end-1c")
                    text_widget.insert("1.0", "Invalid JSON")
                    text_widget.configure(state='disabled')
            
        except Exception as e:
            self.logger.log_step(f"Error updating JSON view: {str(e)}")