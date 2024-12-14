import tkinter as tk
from tkinter import ttk
import ttkbootstrap as ttk_boot
import json
from constants import *
from text_manager import text_manager
import os
from PIL import Image, ImageTk
import urllib.request
import ssl
from io import BytesIO
from json_handler import JsonUpdateMixin

class MessageEntryWidget:
    # Class variables for icon cache
    _icon_cache = None
    _logger = None

    @classmethod
    def _init_icons(cls):
        """Initialize icons with error handling and fallback."""
        if cls._icon_cache is None:
            cls._icon_cache = {}
            try:
                import os
                import sys
                
                # Define all icon paths
                icon_paths = {
                    'delete': 'icon_delete.png',
                    'up': 'icon_up.png',
                    'down': 'icon_down.png'
                }
                
                # Try multiple possible paths
                possible_base_paths = [
                    os.path.dirname(os.path.abspath(__file__)),  # Script directory
                    os.path.dirname(sys.executable),  # Executable directory
                    '.',  # Current directory
                ]

                for icon_name, icon_file in icon_paths.items():
                    icon_loaded = False
                    for base_path in possible_base_paths:
                        try:
                            full_path = os.path.join(base_path, icon_file)
                            if os.path.exists(full_path):
                                cls._icon_cache[icon_name] = tk.PhotoImage(file=full_path)
                                icon_loaded = True
                                if cls._logger:
                                    cls._logger.log_step(f"Loaded icon {icon_name} from {full_path}")
                                break
                        except Exception as e:
                            if cls._logger:
                                cls._logger.log_step(f"Failed to load icon from {full_path}: {str(e)}")
                            continue
                    
                    if not icon_loaded:
                        # Create fallback colored rectangles
                        if cls._logger:
                            cls._logger.log_step(f"Creating fallback icon for {icon_name}")
                        fallback = tk.PhotoImage(width=16, height=16)
                        # Different colors for different actions
                        color = {
                            'delete': "#ff4444",  # Red for delete
                            'up': "#44ff44",      # Green for up
                            'down': "#4444ff"     # Blue for down
                        }.get(icon_name, "#888888")  # Gray for unknown
                        fallback.put(color, to=(0, 0, 15, 15))
                        cls._icon_cache[icon_name] = fallback

            except Exception as e:
                if cls._logger:
                    cls._logger.log_step(f"Error initializing icons: {str(e)}")
                # Create simple colored rectangles as fallback
                cls._icon_cache = {
                    'delete': tk.PhotoImage(width=16, height=16),
                    'up': tk.PhotoImage(width=16, height=16),
                    'down': tk.PhotoImage(width=16, height=16)
                }
                cls._icon_cache['delete'].put("#ff4444", to=(0, 0, 15, 15))
                cls._icon_cache['up'].put("#44ff44", to=(0, 0, 15, 15))
                cls._icon_cache['down'].put("#4444ff", to=(0, 0, 15, 15))

    def __init__(self, parent, message_text="", index=0, is_first=False, 
                 on_delete=None, on_move_up=None, on_move_down=None, 
                 on_set_first=None, total_widgets=0):
        """Initialize a single message entry widget."""
        style = ttk.Style()
        style.configure('MessageCard.TFrame', 
            background=COLORS['PANEL_BACKGROUND'],
            padding=8
        )

        # Create main frame for this entry with visible border
        self.frame = ttk_boot.Frame(parent, style='MessageCard.TFrame')
        self.frame.pack(fill=tk.X, padx=10, pady=5)
        
        # Store the index and create first message toggle
        self.index = index
        self.first_var = tk.BooleanVar(value=is_first)
        self.is_first = is_first
        
        # Top row with order label and controls
        top_row = ttk_boot.Frame(self.frame, style='MessageCard.TFrame')
        top_row.pack(fill=tk.X, pady=(0, 5))
        
        # Order label (left side)
        self.order_label = ttk_boot.Label(
            top_row,
            text=f"Message #{index + 1}",
            bootstyle="secondary"
        )
        self.order_label.pack(side=tk.LEFT)
        
        # Control frame for buttons (right side)
        control_frame = ttk_boot.Frame(top_row, style='MessageCard.TFrame')
        control_frame.pack(side=tk.RIGHT)

        # First message toggle
        if on_set_first:
            first_check = ttk_boot.Checkbutton(
                control_frame,
                text="First Message",
                variable=self.first_var,
                command=lambda: on_set_first(index),
                bootstyle="warning-round-toggle"
            )
            first_check.pack(side=tk.LEFT, padx=(0, 5))
        
        # Move up button
        if on_move_up and index > 0:
            up_btn = ttk_boot.Button(
                control_frame,
                image=MessageEntryWidget._icon_cache['up'],
                bootstyle="secondary-outline",
                command=lambda: on_move_up(index),
                width=3
            )
            up_btn.pack(side=tk.LEFT, padx=(0, 5))

        # Move down button
        if on_move_down and index < total_widgets - 1:
            down_btn = ttk_boot.Button(
                control_frame,
                image=MessageEntryWidget._icon_cache['down'],
                bootstyle="secondary-outline",
                command=lambda: on_move_down(index),
                width=3
            )
            down_btn.pack(side=tk.LEFT, padx=(0, 5))
        
        # Delete button
        if on_delete:
            delete_btn = ttk_boot.Button(
                control_frame,
                image=MessageEntryWidget._icon_cache['delete'],
                bootstyle="danger-outline",
                command=lambda: on_delete(index),
                width=3
            )
            delete_btn.pack(side=tk.LEFT)

        # Create content area with image preview (main content section)
        content_frame = ttk_boot.Frame(self.frame, style='MessageCard.TFrame')
        content_frame.pack(fill=tk.X, expand=True)

        # Image preview panel (left side)
        self.preview_frame = ttk_boot.Frame(
            content_frame,
            width=200,  # Fixed width for image preview
            style='MessageCard.TFrame',
        )
        self.preview_frame.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 8))
        self.preview_frame.pack_propagate(False)  # Maintain fixed width

        print(f"Preview frame dimensions - Width: {self.preview_frame.winfo_reqwidth()}, Height: {self.preview_frame.winfo_reqheight()}")

        # Create canvas for image display
        self.image_canvas = tk.Canvas(
            self.preview_frame,
            width=200,
            height=280,  # Match text area height
            bg='red',  # Debug color
            highlightthickness=1,
            highlightbackground='yellow'  # Debug border
        )
        self.image_canvas.pack(fill=tk.BOTH, expand=True)

        # Message text area (right side)
        text_frame = ttk_boot.Frame(content_frame, style='MessageCard.TFrame')
        text_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.message_text = text_manager.create_text_widget(
            text_frame,
            height=12,
            wrap=tk.WORD
        )
        self.message_text.pack(fill=tk.BOTH, expand=True)
        
        if message_text:
            self.message_text.insert('1.0', message_text)

        # Bind text changes to URL checker
        self.message_text.bind('<FocusOut>', self.on_text_change)  # Only check when leaving the fiel

        # Load initial placeholder
        self.current_image = None
        self.load_placeholder()
        
    def bind_real_time_updates(self, message_manager):
        """Bind widgets to update JSON in real-time."""
        def update_callback(event=None):
            message_manager.bind_json_update(self.message_text, field_type='messages')
        
        # Bind to both the text widget and first message toggle
        self.message_text.bind('<KeyRelease>', update_callback)
        self.message_text.bind('<FocusOut>', update_callback)
        self.first_var.trace_add('write', lambda *args: update_callback())

    def load_placeholder(self):
        """Load and display the placeholder logo."""
        try:
            logo_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logo.png')
            print(f"Attempting to load logo from: {logo_path}")
            
            if os.path.exists(logo_path):
                logo = Image.open(logo_path)
                
                # Calculate scaling to fit preview area
                canvas_width = self.image_canvas.winfo_width()
                canvas_height = self.image_canvas.winfo_height()
                print(f"Canvas dimensions: {canvas_width}x{canvas_height}")
                
                scale = min(canvas_width/logo.width, canvas_height/logo.height)
                new_width = int(logo.width * scale)
                new_height = int(logo.height * scale)
                logo = logo.resize((new_width, new_height), Image.Resampling.LANCZOS)
                
                # Convert to PhotoImage and store reference
                self.current_image = ImageTk.PhotoImage(logo)
                
                # Calculate position to center logo
                x = canvas_width // 2
                y = canvas_height // 2
                
                # Clear canvas and display logo
                self.image_canvas.delete("all")
                self.image_canvas.create_image(x, y, anchor=tk.CENTER, image=self.current_image)
                print("Logo loaded and displayed successfully")
            else:
                print(f"Logo file not found at: {logo_path}")
                self.show_no_image_text()
        except Exception as e:
            print(f"Error loading placeholder: {str(e)}")
            self.show_no_image_text()

    def show_no_image_text(self):
        """Display 'No image' text when no image is available."""
        self.image_canvas.delete("all")
        self.image_canvas.create_text(
            100,  # Center horizontally
            140,  # Center vertically
            text="No image",
            fill="white",
            font=FONTS['DEFAULT'],
            anchor=tk.CENTER
        )

    def check_for_image_url(self, text):
        """Check text for image URLs and update preview if found."""
        # First try markdown image syntax
        markdown_pattern = r'!\[.*?\]\((https?://[^\s<>")]+?\.(?:jpg|jpeg|gif|png|webp))\)'
        # Fallback to direct URL pattern
        url_pattern = r'https?://[^\s<>"]+?\.(?:jpg|jpeg|gif|png|webp)'
        import re
        
        # Try markdown pattern first
        match = re.search(markdown_pattern, text, re.IGNORECASE)
        if match:
            print(f"Found markdown image URL: {match.group(1)}")  # group(1) gets just the URL
            self.load_image_from_url(match.group(1))
            return

        # Try direct URL pattern as fallback
        match = re.search(url_pattern, text, re.IGNORECASE)
        if match:
            print(f"Found direct image URL: {match.group(0)}")
            self.load_image_from_url(match.group(0))
        else:
            print("No image URL found, loading placeholder")
            self.load_placeholder()

    def load_image_from_url(self, url):
        """Load and display an image from a URL."""
        try:
            print(f"Attempting to load image from URL: {url}")
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            request = urllib.request.Request(url, headers=headers)
            
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE

            with urllib.request.urlopen(request, context=ssl_context) as response:
                image_data = response.read()
                print("Image data downloaded successfully")
                
            # Convert to PIL Image
            image = Image.open(BytesIO(image_data))
            
            # Calculate scaling to fit preview area
            canvas_width = self.image_canvas.winfo_width()
            canvas_height = self.image_canvas.winfo_height()
            scale = min(canvas_width/image.width, canvas_height/image.height)
            new_width = int(image.width * scale)
            new_height = int(image.height * scale)
            image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Convert to PhotoImage and store reference
            self.current_image = ImageTk.PhotoImage(image)
            
            # Calculate position to center image
            x = canvas_width // 2
            y = canvas_height // 2
            
            # Clear canvas and display image
            self.image_canvas.delete("all")
            self.image_canvas.create_image(x, y, anchor=tk.CENTER, image=self.current_image)
            print("Image loaded and displayed successfully")
            
        except Exception as e:
            print(f"Error loading image from URL: {str(e)}")
            self.show_no_image_text()

    def on_text_change(self, event=None):
        """Handle text changes and check for URLs."""
        text = self.message_text.get('1.0', 'end-1c')
        self.check_for_image_url(text)

    def update_index(self, new_index):
        """Update the widget's index and order display."""
        self.index = new_index
        self.order_label.configure(text=f"Message #{new_index + 1}")

    def get_message(self):
        """Get the current message text."""
        return self.message_text.get('1.0', 'end-1c')
        
    def set_as_first(self, is_first):
        """Set this message's first message status."""
        self.is_first = is_first
        self.first_var.set(is_first)

    def auto_resize(self, event=None):
        """Automatically resize text widget based on content."""
        text = self.message_text.get('1.0', 'end-1c')
        num_lines = len(text.split('\n'))
        
        # Set minimum and maximum heights
        min_height = 4
        max_height = 12
        
        # Calculate new height
        new_height = max(min_height, min(num_lines, max_height))
        
        # Update text widget height
        self.message_text.configure(height=new_height)


class MessageManager(JsonUpdateMixin):
    def __init__(self, parent_frame, json_text, status_var, logger, json_handler):  # Added json_handler
        self.parent_frame = parent_frame
        self.json_text = json_text
        self.status_var = status_var
        self.logger = logger
        self.json_handler = json_handler  # Required for JsonUpdateMixin
        
        # Initialize MessageEntryWidget's logger and icons
        MessageEntryWidget._logger = logger
        MessageEntryWidget._init_icons()
        
        # Create button frame at the top
        button_frame = ttk_boot.Frame(parent_frame)
        button_frame.pack(side=tk.TOP, fill=tk.X, padx=5, pady=5)
        
        # Add message button at top
        ttk_boot.Button(
            button_frame,
            text="Add New Message",
            command=self.add_message,
            bootstyle="success",
            width=16
        ).pack(side=tk.LEFT, padx=2)
        
        # Create scrollable container
        self.setup_scrollable_container()
        
        # List to keep track of message widgets
        self.message_widgets = []
    
    def setup_scrollable_container(self):
        """Set up the scrollable container for messages."""
        # Create canvas with proper background and no border
        self.canvas = tk.Canvas(
            self.parent_frame,
            bg=COLORS['PANEL_BACKGROUND'],
            highlightthickness=0
        )
        
        # Create scrollbar with rounded style
        self.scrollbar = ttk_boot.Scrollbar(
            self.parent_frame,
            bootstyle="rounded",
            command=self.canvas.yview
        )
        
        # Create frame for content
        self.scrollable_frame = ttk_boot.Frame(self.canvas)
        
        # Create window in canvas that will hold our frame
        self.window_id = self.canvas.create_window(
            (0, 0),
            window=self.scrollable_frame,
            anchor="nw",
            width=self.canvas.winfo_width()
        )
        
        # Pack the components
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Configure scrolling
        self.canvas.configure(yscrollcommand=self.scrollbar.set)
        
        # Update scroll region when frame size changes
        def update_scroll_region(event=None):
            # Get the frame's required size
            self.scrollable_frame.update_idletasks()
            bbox = self.canvas.bbox("all")
            if bbox:
                # Set scroll region to exactly match content
                self.canvas.configure(scrollregion=bbox)
                # Prevent scrolling above content
                if self.canvas.yview()[0] < 0:
                    self.canvas.yview_moveto(0)
        
        self.scrollable_frame.bind("<Configure>", update_scroll_region)
        self.canvas.bind("<Configure>", update_scroll_region)
        
        # Mouse wheel scrolling
        def _on_mousewheel(event):
            # Get current scroll position
            current_pos = self.canvas.yview()
            # Only scroll down if not at bottom, up if not at top
            if (event.delta > 0 and current_pos[0] > 0) or \
            (event.delta < 0 and current_pos[1] < 1):
                self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        
        # Bind mouse wheel events
        self.scrollable_frame.bind(
            "<Enter>",
            lambda e: self.canvas.bind_all("<MouseWheel>", _on_mousewheel)
        )
        self.scrollable_frame.bind(
            "<Leave>",
            lambda e: self.canvas.unbind_all("<MouseWheel>")
        )
        
        # Update canvas width when parent resizes
        def on_canvas_configure(event):
            width = event.width - self.scrollbar.winfo_reqwidth()
            self.canvas.itemconfig(self.window_id, width=width)
        
        self.canvas.bind('<Configure>', on_canvas_configure)

    def trigger_image_loading(self):
        """Trigger image loading for all visible messages."""
        for widget in self.message_widgets:
            text = widget.message_text.get('1.0', 'end-1c')
            widget.check_for_image_url(text)
    
    def refresh_messages(self, json_data):
        """Refresh all message widgets with new data."""
        try:
            self.logger.log_step("Starting refresh_messages")
            self.logger.log_step("Incoming JSON data:", json_data)
            
            # Clear existing messages
            for widget in self.message_widgets:
                widget.frame.destroy()
            self.message_widgets.clear()
            
            # Check if json_data is a dict before proceeding
            if not isinstance(json_data, dict):
                self.logger.log_step("Invalid JSON data format, creating empty structure")
                json_data = {
                    'spec': 'chara_card_v2',
                    'data': {
                        'first_mes': '',
                        'alternate_greetings': []
                    }
                }
            
            if json_data.get('spec') == 'chara_card_v2':
                char_data = json_data.get('data', {})
                self.logger.log_step("Character data:", char_data)
                
                # Get first message and alternates
                first_mes = char_data.get('first_mes', '')
                alternates = char_data.get('alternate_greetings', [])
                
                self.logger.log_step(f"Found first_mes: {first_mes}")
                self.logger.log_step(f"Found alternates: {alternates}")
                
                # Add first_mes as first entry with toggle on
                if first_mes:
                    self.logger.log_step("Adding first message widget")
                    self.add_message_widget(first_mes, 0, True)
                
                # Add alternate greetings
                for i, message in enumerate(alternates, start=(1 if first_mes else 0)):
                    self.logger.log_step(f"Adding alternate message {i}")
                    self.add_message_widget(message, i, False)
                
            self.logger.log_step(f"Finished refresh_messages. Total widgets: {len(self.message_widgets)}")
                
        except Exception as e:
            self.logger.log_step(f"Error refreshing messages: {str(e)}")
            raise
    
    def add_message_widget(self, message_text, index, is_first):
        """Add a new message widget to the interface."""
        widget = MessageEntryWidget(
            self.scrollable_frame,
            message_text,
            index,
            is_first,
            self.delete_message,
            self.move_message_up,
            self.move_message_down,
            self.set_as_first_message,
            total_widgets=len(self.message_widgets) + 1
        )
        self.message_widgets.append(widget)
        
        # Add real-time update bindings
        widget.bind_real_time_updates(self)
    
    def add_message(self):
        """Add a new empty message."""
        index = len(self.message_widgets)
        self.add_message_widget('', index, False)
        self.status_var.set("Added new message")
    
    def add_message_widget(self, message_text, index, is_first):
        """Add a new message widget to the interface."""
        widget = MessageEntryWidget(
            self.scrollable_frame,
            message_text,
            index,
            is_first,
            self.delete_message,
            self.move_message_up,
            self.move_message_down,
            self.set_as_first_message
        )
        self.message_widgets.append(widget)
    
    def set_as_first_message(self, index):
        """Set a message as the first message and ensure all others are not first."""
        # Update all widgets' first message status
        for i, widget in enumerate(self.message_widgets):
            widget.set_as_first(i == index)
        
        # Update JSON
        self.update_json()
        self.status_var.set(f"Message #{index + 1} set as First Message")
    
    def delete_message(self, index):
        """Delete a message widget."""
        if 0 <= index < len(self.message_widgets):
            was_first = self.message_widgets[index].is_first
            
            # Remove the widget
            self.message_widgets[index].frame.destroy()
            del self.message_widgets[index]
            
            # Update remaining indices
            for i, widget in enumerate(self.message_widgets):
                widget.update_index(i)
            
            # If we deleted the first message and have remaining messages,
            # set the first widget as first
            if was_first and self.message_widgets:
                self.set_as_first_message(0)
            elif not self.message_widgets:
                # If we deleted the last message, update JSON to clear messages
                try:
                    json_str = self.json_text.get('1.0', 'end-1c').strip()
                    json_data = json.loads(json_str)
                    if json_data.get('spec') == 'chara_card_v2':
                        json_data['data']['first_mes'] = ""
                        json_data['data']['alternate_greetings'] = []
                        formatted_json = json.dumps(json_data, indent=4, ensure_ascii=False)
                        self.json_text.delete('1.0', 'end-1c')
                        self.json_text.insert('1.0', formatted_json)
                except Exception as e:
                    self.logger.log_step(f"Error clearing messages in JSON: {str(e)}")
            
            # Update JSON
            self.update_json()
    
    def move_message_up(self, index):
        """Move a message up in the order."""
        if 0 < index < len(self.message_widgets):
            # Swap widgets in list
            self.message_widgets[index], self.message_widgets[index-1] = \
                self.message_widgets[index-1], self.message_widgets[index]
            
            # Update indices and repack
            for i, widget in enumerate(self.message_widgets):
                widget.update_index(i)
                widget.frame.pack_forget()
                widget.frame.pack(fill=tk.X, padx=10, pady=5)
            
            # Update JSON
            self.update_json()
    
    def move_message_down(self, index):
        """Move a message down in the order."""
        if 0 <= index < len(self.message_widgets) - 1:
            # Swap widgets in list
            self.message_widgets[index], self.message_widgets[index+1] = \
                self.message_widgets[index+1], self.message_widgets[index]
            
            # Update indices
            for i, widget in enumerate(self.message_widgets):
                widget.index = i
                widget.update_index(i)
            
            # Repack all widgets in new order
            self.repack_widgets()
            
            # Update JSON with new order
            self.update_json()

    def repack_widgets(self):
        """Repack all widgets in current order."""
        for widget in self.message_widgets:
            widget.frame.pack_forget()
        for widget in self.message_widgets:
            widget.frame.pack(fill=tk.X, padx=10, pady=5)

    def get_first_message(self):
        """Get the current first message."""
        for widget in self.message_widgets:
            if widget.first_var.get():
                return widget.get_message().strip()
        # If no message is marked as first, use the first widget
        return self.message_widgets[0].get_message().strip() if self.message_widgets else ""

    def get_alternate_greetings(self):
        """Get all alternate greetings as a list."""
        first_widget = None
        for widget in self.message_widgets:
            if widget.first_var.get():
                first_widget = widget
                break
        
        # If no widget is marked as first, use the first widget
        if not first_widget and self.message_widgets:
            first_widget = self.message_widgets[0]
        
        # Return all non-empty messages except the first message
        return [
            widget.get_message() for widget in self.message_widgets
            if widget != first_widget and widget.get_message().strip()
        ]

    def get_messages_data(self):
        """Get both first message and alternate greetings."""
        return {
            'first_message': self.get_first_message(),
            'alternate_greetings': self.get_alternate_greetings()
        }

    def update_json(self):
        """Update the main JSON with current message data."""
        try:
            json_str = self.json_text.get('1.0', 'end-1c').strip()
            json_data = json.loads(json_str)
            
            if json_data.get('spec') == 'chara_card_v2':
                # Get messages using existing methods
                messages_data = self.get_messages_data()
                
                # Update the JSON structure
                json_data['data']['first_mes'] = messages_data['first_message']
                json_data['data']['alternate_greetings'] = messages_data['alternate_greetings']
                
                # Update the display
                formatted_json = json.dumps(json_data, indent=4, ensure_ascii=False)
                self.json_text.delete('1.0', 'end-1c')
                self.json_text.insert('1.0', formatted_json)
                
                self.status_var.set("Messages updated successfully")
                
        except Exception as e:
            self.logger.log_step(f"Error updating JSON with messages: {str(e)}")
            self.status_var.set(f"Error updating messages: {str(e)}")
            raise