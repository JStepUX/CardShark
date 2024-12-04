import os
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from datetime import datetime, timezone
import json
import csv
from constants import *
import ttkbootstrap as ttk_boot
from text_manager import text_manager

class LoreEntryWidget:
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
                
                # Define icon paths
                icon_paths = {
                    'settings': 'icon_edit.png',
                    'delete': 'icon_delete.png'
                }
                
                # Try multiple possible paths
                possible_base_paths = [
                    os.path.dirname(os.path.abspath(__file__)),
                    os.path.dirname(sys.executable),
                    '.'
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
                        if cls._logger:
                            cls._logger.log_step(f"Creating fallback icon for {icon_name}")
                        fallback = tk.PhotoImage(width=16, height=16)
                        color = "#ff4444" if icon_name == 'delete' else "#4444ff"
                        fallback.put(color, to=(0, 0, 15, 15))
                        cls._icon_cache[icon_name] = fallback

            except Exception as e:
                if cls._logger:
                    cls._logger.log_step(f"Error initializing icons: {str(e)}")
                # Create simple colored rectangles as fallback
                cls._icon_cache = {
                    'settings': tk.PhotoImage(width=16, height=16),
                    'delete': tk.PhotoImage(width=16, height=16)
                }
                cls._icon_cache['settings'].put("#4444ff", to=(0, 0, 15, 15))
                cls._icon_cache['delete'].put("#ff4444", to=(0, 0, 15, 15))

    def __init__(self, parent, entry_data, index, on_delete=None):
        """Initialize a single lore entry widget."""
        style = ttk.Style()
        style.configure('dark.TFrame', background=COLORS['PANEL_BACKGROUND'])
        style.configure('dark.TLabel', 
            background=COLORS['PANEL_BACKGROUND'],
            foreground=COLORS['FOREGROUND']
        )

        # Create main frame for this entry
        self.frame = ttk_boot.Frame(parent, style='dark.TFrame')
        self.frame.pack(fill=tk.X, padx=10, pady=5)

        # Create inner frame with padding
        inner_frame = ttk_boot.Frame(
            self.frame,
            style='dark.TFrame',
            padding=8
        )
        inner_frame.pack(fill=tk.X, padx=0, pady=0)
        
        # Top row with key input and controls
        top_row = ttk_boot.Frame(inner_frame, style='dark.TFrame')
        top_row.pack(fill=tk.X, padx=5, pady=5)
        
        # Key frame and label
        key_frame = ttk_boot.Frame(top_row, style='dark.TFrame')
        key_frame.pack(side=tk.LEFT, fill=tk.X, expand=True)

        key_label = ttk_boot.Label(
            key_frame,
            text="Key",
            width=8,
            style='dark.TLabel',
            font=FONTS['DEFAULT']
        )
        key_label.pack(side=tk.LEFT)
        
        # Key entry field
        self.key_var = tk.StringVar(value=', '.join(entry_data.get('keys', [])))
        self.key_entry = ttk_boot.Entry(
            key_frame,
            textvariable=self.key_var,
            font=FONTS['DEFAULT']
        )
        self.key_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(5, 10))
        
        # Control frame
        control_frame = ttk_boot.Frame(top_row, style='dark.TFrame')
        control_frame.pack(side=tk.RIGHT, padx=(0, 5))
        
        # Order label
        order_label = ttk_boot.Label(
            control_frame,
            text="Order",
            style='dark.TLabel',
            font=FONTS['DEFAULT']
        )
        order_label.pack(side=tk.LEFT, padx=(0, 5))

        # Store the order variable
        self.order_var = tk.StringVar(value=str(index + 1))
        self.order_entry = ttk_boot.Entry(
            control_frame,
            textvariable=self.order_var,
            width=8,
            state='readonly',
            font=FONTS['DEFAULT']
        )
        self.order_entry.pack(side=tk.LEFT, padx=(0, 5))

        # Settings button
        settings_btn = ttk_boot.Button(
            control_frame,
            image=LoreEntryWidget._icon_cache['settings'],
            bootstyle="secondary-outline",
            command=self.show_settings,
            width=3
        )
        settings_btn.pack(side=tk.LEFT, padx=(0, 5))
        
        # Store index and create delete button with index reference
        self.index = index
        if on_delete:
            delete_btn = ttk_boot.Button(
                control_frame,
                image=LoreEntryWidget._icon_cache['delete'],
                bootstyle="danger-outline",
                command=lambda: on_delete(self.index),
                width=3
            )
            delete_btn.pack(side=tk.LEFT)

        # Value section
        value_frame = ttk_boot.Frame(inner_frame, style='dark.TFrame')
        value_frame.pack(fill=tk.BOTH, padx=5, pady=(0, 5))

        value_label = ttk_boot.Label(
            value_frame,
            text="Value",
            width=8,
            style='dark.TLabel',
            font=FONTS['DEFAULT']
        )
        value_label.pack(side=tk.LEFT)
        
        # Content text area
        text_frame = ttk_boot.Frame(value_frame)
        text_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.content_text = text_manager.create_text_widget(
            text_frame,
            height=4,
            bg=COLORS['BACKGROUND'],
            fg=COLORS['FOREGROUND'],
            insertbackground=COLORS['FOREGROUND']
        )
        self.content_text.insert('1.0', entry_data.get('content', ''))
        self.content_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # Scrollbar
        scrollbar = ttk_boot.Scrollbar(
            text_frame,
            bootstyle="secondary-round",
            command=self.content_text.yview
        )
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.content_text.config(yscrollcommand=scrollbar.set)

    def update_index(self, new_index):
        """Update the widget's index and order display."""
        self.index = new_index
        self.order_var.set(str(new_index + 1))

    def show_settings(self):
        """Show settings dialog for this entry."""
        pass  # Placeholder for settings functionality
        
    def get_data(self):
        """Get the current data from this entry widget."""
        return {
            'keys': [k.strip() for k in self.key_var.get().split(',') if k.strip()],
            'content': self.content_text.get('1.0', 'end-1c')
        }
        
        # Value frame and label
        value_frame = ttk_boot.Frame(inner_frame, style='dark.TFrame')
        value_frame.pack(fill=tk.BOTH, padx=5, pady=(0, 5))

        value_label = ttk_boot.Label(
            value_frame,
            text="Value",
            width=8,
            style='dark.TLabel',  # Remove bootstyle and use custom style
            font=FONTS['DEFAULT']
        )
        value_label.pack(side=tk.LEFT)
        
        # Content text area with its own frame
        text_frame = ttk_boot.Frame(value_frame)
        text_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.content_text = text_manager.create_text_widget(
            text_frame,
            height=4,
            bg=COLORS['BACKGROUND'],
            fg=COLORS['FOREGROUND'],
            insertbackground=COLORS['FOREGROUND']
        )
        self.content_text.insert('1.0', entry_data.get('content', ''))
        self.content_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # Scrollbar for text
        scrollbar = ttk_boot.Scrollbar(
            text_frame,
            bootstyle="secondary-round",
            command=self.content_text.yview
        )
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.content_text.config(yscrollcommand=scrollbar.set)
        
        # Store the index for reference
        self.index = index

    def show_settings(self):
        """Show settings dialog for this entry."""
        pass  # Placeholder for settings functionality
        
    def get_data(self):
        """Get the current data from this entry widget."""
        return {
            'keys': [k.strip() for k in self.key_var.get().split(',') if k.strip()],
            'content': self.content_text.get('1.0', 'end-1c')
        }

class LoreManagerWidgets:
    def __init__(self, parent_frame, json_text, status_var, logger, count_var):
        self.parent_frame = parent_frame
        self.json_text = json_text
        self.status_var = status_var
        self.logger = logger
        self.count_var = count_var
        
        # Initialize the IconManager in LoreEntryWidget
        LoreEntryWidget._logger = logger
        LoreEntryWidget._init_icons()

        
        # Create a frame that will expand to full width
        self.main_frame = ttk_boot.Frame(self.parent_frame)
        self.main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Create container for entries with scrolling
        self.canvas = tk.Canvas(
            self.main_frame,
            bg=COLORS['PANEL_BACKGROUND'],
            highlightthickness=0,
            takefocus=0,  # Prevent focus stealing
        )
        
        self.scrollbar = ttk_boot.Scrollbar(
            self.main_frame,
            bootstyle="rounded",  # Make it visible with rounded style
            command=self.canvas.yview
        )
        
        # Create frame for entries that will expand to canvas width
        self.scrollable_frame = ttk_boot.Frame(self.canvas, style='dark.TFrame')
        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )
        
        # Add mousewheel bindings
        def _on_mousewheel(event):
            self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

        self.scrollable_frame.bind("<Enter>", lambda e: self.canvas.bind_all("<MouseWheel>", _on_mousewheel))
        self.scrollable_frame.bind("<Leave>", lambda e: self.canvas.unbind_all("<MouseWheel>"))

        # Bind frame changes to update scroll region
        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )
        
        # Important: Set canvas width to match parent
        def configure_canvas(event):
            canvas_width = event.width - self.scrollbar.winfo_reqwidth()  # Adjust for scrollbar
            self.canvas.itemconfig(self.window_id, width=canvas_width)
        
        self.canvas.bind('<Configure>', configure_canvas)
        
        # Important: Set canvas width to match parent and create window
        self.window_id = self.canvas.create_window(
            (0, 0),
            window=self.scrollable_frame,
            anchor="nw",
            width=self.canvas.winfo_width()  # Make it full width
        )
        
        # Pack scrolling components with proper fill/expand
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        # Connect scrollbar to canvas
        self.canvas.configure(yscrollcommand=self.scrollbar.set)
        
        # List to keep track of entry widgets
        self.entry_widgets = []
        
        # Configure style for card-like appearance
        style = ttk.Style()
        style.configure(
            'Card.TFrame',
            background=COLORS['BACKGROUND'],
            borderwidth=1,
            relief='solid'
        )
        
    def refresh_entries(self, entries_data):
        """Refresh all entry widgets with new data."""
        # Clear existing entries
        for widget in self.entry_widgets:
            widget.frame.destroy()
        self.entry_widgets.clear()
        
        # Create new entry widgets
        for i, entry_data in enumerate(entries_data):
            entry_widget = LoreEntryWidget(
                self.scrollable_frame,
                entry_data,
                i,
                on_delete=self.delete_entry
            )
            self.entry_widgets.append(entry_widget)
        
        # Update count
        self.count_var.set(f"Total: {len(entries_data)}")
        
    def get_all_entries(self):
        """Get data from all entry widgets."""
        return [widget.get_data() for widget in self.entry_widgets]
        
    def delete_entry(self, index):
        """Delete an entry widget at the specified index."""
        if 0 <= index < len(self.entry_widgets):
            # Remove the widget
            self.entry_widgets[index].frame.destroy()
            del self.entry_widgets[index]
            
            # Update remaining indices and order numbers
            for i, widget in enumerate(self.entry_widgets):
                widget.update_index(i)  # Use the new update_index method
            
            # Update count
            self.count_var.set(f"Total: {len(self.entry_widgets)}")
            
            # Update main JSON
            self.update_json()
            
    def add_entry(self):
        """Add a new empty entry widget."""
        index = len(self.entry_widgets)
        entry_data = {
            'keys': [],
            'content': '',
            'enabled': True,
            'insertion_order': index
        }
        
        entry_widget = LoreEntryWidget(
            self.scrollable_frame,
            entry_data,
            index,
            on_delete=self.delete_entry
        )
        self.entry_widgets.append(entry_widget)
        
        # Update count
        self.count_var.set(f"Total: {len(self.entry_widgets)}")
        
    def update_json(self):
        """Update the main JSON with current entry data."""
        try:
            entries_data = self.get_all_entries()
            
            # Get current JSON
            json_str = self.json_text.get("1.0", "end-1c").strip()
            json_data = json.loads(json_str)
            
            # Update entries in character book
            if 'character_book' in json_data:
                json_data['character_book']['entries'] = []
                for i, entry_data in enumerate(entries_data):
                    full_entry = {
                        'keys': entry_data['keys'],
                        'content': entry_data['content'],
                        'enabled': True,
                        'insertion_order': i,
                        'case_sensitive': False,
                        'priority': 10,
                        'id': i,
                        'comment': '',
                        'name': '',
                        'selective': False,
                        'constant': False,
                        'position': 'after_char',
                        'extensions': {
                            'depth': 4,
                            'linked': False,
                            'weight': 10,
                            'addMemo': True,
                            'embedded': True,
                            'probability': 100,
                            'displayIndex': i,
                            'selectiveLogic': 0,
                            'useProbability': True,
                            'characterFilter': None,
                            'excludeRecursion': True
                        },
                        'probability': 100,
                        'selectiveLogic': 0
                    }
                    json_data['character_book']['entries'].append(full_entry)
            elif 'data' in json_data and 'character_book' in json_data['data']:
                json_data['data']['character_book']['entries'] = []
                for i, entry_data in enumerate(entries_data):
                    full_entry = {
                        'keys': entry_data['keys'],
                        'content': entry_data['content'],
                        'enabled': True,
                        'insertion_order': i,
                        'case_sensitive': False,
                        'priority': 10,
                        'id': i,
                        'comment': '',
                        'name': '',
                        'selective': False,
                        'constant': False,
                        'position': 'after_char',
                        'extensions': {
                            'depth': 4,
                            'linked': False,
                            'weight': 10,
                            'addMemo': True,
                            'embedded': True,
                            'probability': 100,
                            'displayIndex': i,
                            'selectiveLogic': 0,
                            'useProbability': True,
                            'characterFilter': None,
                            'excludeRecursion': True
                        },
                        'probability': 100,
                        'selectiveLogic': 0
                    }
                    json_data['data']['character_book']['entries'].append(full_entry)
            
            # Update main JSON display
            formatted_json = json.dumps(json_data, indent=4, ensure_ascii=False)
            self.json_text.delete("1.0", "end-1c")
            self.json_text.insert("1.0", formatted_json)
            
            self.status_var.set("Lore items updated successfully")
            
        except Exception as e:
            self.logger.log_step(f"Error updating JSON: {str(e)}")
            raise

class LoreManager:
    def __init__(self, json_text, parent_frame, status_var, logger, count_var):
        """Initialize LoreManager with required UI elements and logger."""
        self.json_text = json_text
        self.status_var = status_var
        self.logger = logger
        self.last_deleted_items = None
        self.last_deleted_json = None
        self.count_var = count_var

        # Create button frame at the top
        button_frame = ttk_boot.Frame(parent_frame)
        button_frame.pack(side=tk.TOP, fill=tk.X, padx=5, pady=5)
        
        # Create buttons using ttkbootstrap
        ttk_boot.Button(
            button_frame,
            text="Add Item",
            command=self.add_lore_item,
            bootstyle="success",
            width=12
        ).pack(side=tk.LEFT, padx=2)
        
        ttk_boot.Button(
            button_frame,
            text="Import TSV",
            command=self.import_csv,
            bootstyle="secondary",
            width=12
        ).pack(side=tk.LEFT, padx=2)
        
        # Count label
        ttk_boot.Label(
            button_frame,
            textvariable=self.count_var,
            bootstyle="info"
        ).pack(side=tk.RIGHT, padx=5)

        # Initialize widget manager after buttons
        content_frame = ttk_boot.Frame(parent_frame)
        content_frame.pack(fill=tk.BOTH, expand=True)
        
        self.widget_manager = LoreManagerWidgets(
            content_frame,
            json_text,
            status_var,
            logger,
            count_var
        )

    # Add at the top of the LoreManager class:
    def register_tree_view(self, tree_manager):
        """Register LoreTreeManager to be notified of updates."""
        self.tree_manager = tree_manager
        self.logger.log_step("Registered LoreTreeManager")

    # Modify the refresh_lore_table method:
    def refresh_lore_table(self):
        """Refresh the lore table with current JSON data."""
        try:
            self.logger.log_step("Starting lore table refresh")
            
            json_str = self.json_text.get(1.0, tk.END).strip()
            self.logger.log_step("Got JSON string", json_str[:200] + "...")  # Log first 200 chars
            
            if json_str:
                json_data = json.loads(json_str)
                self.logger.log_step("Parsed JSON data successfully")
                self.update_lore_table(json_data)
                
                # Notify tree view if registered
                if hasattr(self, 'tree_manager'):
                    self.tree_manager.refresh_view(json_data)
            else:
                self.logger.log_step("No JSON data to refresh")
                
        except Exception as e:
            self.logger.log_step(f"Error refreshing lore table: {str(e)}")
            # Add traceback for more detail
            import traceback
            self.logger.log_step("Full error traceback:", traceback.format_exc())
            raise  # Re-raise to see full error
    
    def refresh_lore_table(self):
        """Refresh the lore table with current JSON data."""
        try:
            self.logger.log_step("Starting lore table refresh")
            
            json_str = self.json_text.get(1.0, tk.END).strip()
            self.logger.log_step("Got JSON string", json_str[:200] + "...")  # Log first 200 chars
            
            if json_str:
                json_data = json.loads(json_str)
                self.logger.log_step("Parsed JSON data successfully")
                self.update_lore_table(json_data)
            else:
                self.logger.log_step("No JSON data to refresh")
                
        except Exception as e:
            self.logger.log_step(f"Error refreshing lore table: {str(e)}")
            # Add traceback for more detail
            import traceback
            self.logger.log_step("Full error traceback:", traceback.format_exc())
            raise  # Re-raise to see full error

    def get_character_book(self, json_data, create_if_missing=True):
        """Helper method to get character book from either V1 or V2 structure."""
        # Check root level first (V2)
        character_book = json_data.get('character_book')
        
        # If not found, check under data (V2 alternate)
        if not character_book and 'data' in json_data:
            character_book = json_data.get('data', {}).get('character_book')
        
        # If still not found and create_if_missing is True, create empty structure
        if not character_book and create_if_missing:
            character_book = {
                'entries': [],
                'name': '',
                'description': '',
                'scan_depth': 2,
                'token_budget': 512,
                'recursive_scanning': False,
                'extensions': {}
            }
            # Place it in the correct location based on existing structure
            if 'data' in json_data:
                json_data['data']['character_book'] = character_book
            else:
                json_data['character_book'] = character_book
        
        return character_book, json_data
    
    def find_duplicate_keys(self, entries):
        """Find entries that contain duplicate keywords."""
        keyword_count = {}
        duplicate_entries = set()
        
        # Count all keywords across entries
        for entry in entries:
            keywords = [k.strip().lower() for k in entry.get('keys', [])]
            for keyword in keywords:
                if keyword:
                    keyword_count[keyword] = keyword_count.get(keyword, 0) + 1
        
        # Mark entries containing duplicate keywords
        for entry in entries:
            keywords = [k.strip().lower() for k in entry.get('keys', [])]
            for keyword in keywords:
                if keyword and keyword_count[keyword] > 1:
                    duplicate_entries.add(', '.join(entry.get('keys', [])))
                    break
                    
        return duplicate_entries

    def add_lore_item(self):
        """Add a new empty lore item."""
        self.widget_manager.add_entry()
        self.status_var.set("Added new lore item")
    
    def update_lore_table(self, json_data):
        """Update the lore table display with current entries."""
        try:
            self.logger.log_step("Starting update_lore_table")
            
            if not isinstance(json_data, dict):
                self.logger.log_step(f"Invalid JSON data format: {type(json_data)}")
                return

            # Get character book from either location
            character_book = json_data.get('character_book')
            if not character_book:
                character_book = json_data.get('data', {}).get('character_book')
            
            self.logger.log_step("Found character book:", character_book)
            
            if not character_book:
                self.logger.log_step("No character book found")
                return

            entries = character_book.get('entries', [])
            self.logger.log_step(f"Found {len(entries)} entries")
            
            # Sort entries by insertion order
            entries.sort(key=lambda x: x.get('insertion_order', 0))
            
            # Update the widget display
            self.widget_manager.refresh_entries(entries)

            # Update the count
            total_entries = len(entries)
            self.count_var.set(f"Total: {total_entries}")
            
            if hasattr(self, 'tree_manager'):
                self.tree_manager.refresh_view(json_data)
            
            self.logger.log_step("Completed update_lore_table successfully")
            
        except Exception as e:
            self.logger.log_step(f"Error in update_lore_table: {str(e)}")
            import traceback
            self.logger.log_step("Full error traceback:", traceback.format_exc())
            raise

    def import_csv(self):
        """Import lore items from a TSV file."""
        file_path = filedialog.askopenfilename(
            title="Select TSV file",
            filetypes=FILE_TYPES['TSV'],
            initialdir=os.path.expanduser("~")
        )
        
        if not file_path:
            return
            
        try:
            imported_count = 0
            skipped_count = 0
            
            # Read current JSON data
            json_str = self.json_text.get(1.0, tk.END).strip()
            json_data = json.loads(json_str)
            
            # Get character book, creating if necessary
            character_book, json_data = self.get_character_book(json_data)
            
            # Get current entries and find last insertion order
            entries = character_book.get('entries', [])
            next_order = len(entries)  # Simple sequential numbering
            
            new_entries = []
            
            # Read TSV file
            with open(file_path, 'r', encoding='utf-8') as file:
                reader = csv.reader(file, delimiter='\t')
                header = next(reader, None)
                
                if not header or len(header) < 2:
                    raise ValueError(MESSAGES['TSV_INVALID'])
                
                # Process each row
                for row in reader:
                    self.logger.log_step(f"Processing row: {row}")
                    if len(row) < 2 or not row[0].strip() or not row[1].strip():
                        skipped_count += 1
                        continue
                    
                    # Create entry with V2 structure
                    new_entry = {
                        'keys': [k.strip() for k in row[0].strip().split(',') if k.strip()],
                        'content': row[1].strip(),
                        'enabled': True,
                        'insertion_order': next_order + imported_count,
                        'case_sensitive': False,
                        'priority': 10,
                        'id': next_order + imported_count,
                        'comment': '',
                        'name': '',
                        'selective': False,
                        'constant': False,
                        'position': 'after_char',
                        'extensions': {
                            'depth': 4,
                            'linked': False,
                            'weight': 10,
                            'addMemo': True,
                            'embedded': True,
                            'probability': 100,
                            'displayIndex': next_order + imported_count,
                            'selectiveLogic': 0,
                            'useProbability': True,
                            'characterFilter': None,
                            'excludeRecursion': True
                        },
                        'probability': 100,
                        'selectiveLogic': 0
                    }
                    
                    new_entries.append(new_entry)
                    imported_count += 1
            
            if new_entries:
                # Add new entries to the existing ones
                character_book['entries'].extend(new_entries)
                
                # Update JSON display
                formatted_json = json.dumps(json_data, indent=4, ensure_ascii=False)
                self.json_text.delete(1.0, tk.END)
                self.json_text.insert(1.0, formatted_json)
                
                # Update lore table
                self.update_lore_table(json_data)
                
                # Show success message
                message = f"{MESSAGES['IMPORT_SUCCESS']} {imported_count}"
                if skipped_count > 0:
                    message += f" ({MESSAGES['ROWS_SKIPPED']} {skipped_count})"
                self.status_var.set(message)
                messagebox.showinfo("Import Complete", message)
                
            else:
                messagebox.showwarning("Import Failed", MESSAGES['NO_VALID_ITEMS'])
                
        except Exception as e:
            self.logger.log_step(f"Error importing TSV: {str(e)}")
            messagebox.showerror("Import Error", f"{MESSAGES['IMPORT_ERROR']}: {str(e)}")
    
    def add_lore_item(self):
        """Add a new lore item."""
        dialog = tk.Toplevel()
        dialog.title("Add Lore Item")
        dialog.geometry("420x420")
        dialog.transient()
        dialog.grab_set()

        ttk.Label(dialog, text="Key(s) - separate multiple keys with commas:").pack(pady=5)
        key_entry = ttk.Entry(dialog, width=40)
        key_entry.pack(pady=5)

        ttk.Label(dialog, text="Content:").pack(pady=5)
        value_text = tk.Text(dialog, width=40, height=8)
        value_text.pack(pady=5)

        def save_item():
            try:
                json_str = self.json_text.get(1.0, tk.END).strip()
                json_data = json.loads(json_str)

                # Get character book, creating if necessary
                character_book, json_data = self.get_character_book(json_data)
                entries = character_book.get('entries', [])
                
                # Split keys and create new entry
                keys = [k.strip() for k in key_entry.get().strip().split(',') if k.strip()]
                content = value_text.get(1.0, tk.END).strip()

                new_entry = {
                    'keys': keys,
                    'content': content,
                    'enabled': True,
                    'insertion_order': len(entries),
                    'case_sensitive': False,
                    'priority': 10,
                    'id': len(entries),
                    'comment': '',
                    'name': '',
                    'selective': False,
                    'constant': False,
                    'position': 'after_char',
                    'extensions': {
                        'depth': 4,
                        'linked': False,
                        'weight': 10,
                        'addMemo': True,
                        'embedded': True,
                        'probability': 100,
                        'displayIndex': len(entries),
                        'selectiveLogic': 0,
                        'useProbability': True,
                        'characterFilter': None,
                        'excludeRecursion': True
                    },
                    'probability': 100,
                    'selectiveLogic': 0
                }

                entries.append(new_entry)

                # Update display
                formatted_json = json.dumps(json_data, indent=4, ensure_ascii=False)
                self.json_text.delete(1.0, tk.END)
                self.json_text.insert(1.0, formatted_json)
                self.update_lore_table(json_data)

                dialog.destroy()
                self.status_var.set("Lore item added successfully")

            except Exception as e:
                self.logger.log_step(f"Error adding lore item: {str(e)}")
                messagebox.showerror("Error", f"Failed to add lore item: {str(e)}")

        ttk.Button(
            dialog,
            text=BUTTON_TEXT['ADD'],
            command=save_item,
            bootstyle="info",
            width=10
        ).pack(pady=10)

    def edit_lore_item(self):
        """Edit selected lore item."""
        selected = self.lore_tree.selection()
        if not selected:
            messagebox.showwarning("Warning", "Please select a lore item to edit")
            return

        values = self.lore_tree.item(selected[0])['values']
        if not values or len(values) < 2:
            messagebox.showerror("Error", "Invalid item selected")
            return

        current_key = values[0]
        current_value = values[1]

        dialog = tk.Toplevel()
        dialog.title("Edit Lore Item")
        dialog.geometry("420x420")
        dialog.transient()
        dialog.grab_set()

        ttk.Label(dialog, text="Key(s) - separate multiple keys with commas:").pack(pady=5)
        key_entry = ttk.Entry(dialog, width=40)
        key_entry.insert(0, current_key)
        key_entry.pack(pady=5)

        ttk.Label(dialog, text="Content:").pack(pady=5)
        value_text = tk.Text(dialog, width=40, height=8)
        value_text.insert(1.0, current_value)
        value_text.pack(pady=5)

        def save_edit():
            try:
                json_str = self.json_text.get(1.0, tk.END).strip()
                json_data = json.loads(json_str)

                # Get character book without creating (we know it exists)
                character_book, json_data = self.get_character_book(json_data, create_if_missing=False)
                if not character_book:
                    raise ValueError("No character book found")

                new_keys = [k.strip() for k in key_entry.get().strip().split(',') if k.strip()]
                new_content = value_text.get(1.0, tk.END).strip()

                # Find and update the matching entry
                for entry in character_book['entries']:
                    if ', '.join(entry.get('keys', [])) == current_key:
                        entry['keys'] = new_keys
                        entry['content'] = new_content
                        break

                formatted_json = json.dumps(json_data, indent=4, ensure_ascii=False)
                self.json_text.delete(1.0, tk.END)
                self.json_text.insert(1.0, formatted_json)
                self.update_lore_table(json_data)

                dialog.destroy()
                self.status_var.set("Lore item updated successfully")

            except Exception as e:
                self.logger.log_step(f"Error updating lore item: {str(e)}")
                messagebox.showerror("Error", f"Failed to update lore item: {str(e)}")

        ttk.Button(
            dialog,
            text=BUTTON_TEXT['EDIT'],
            command=save_edit,
            bootstyle="success",
            width=10
        ).pack(pady=10)

    def delete_lore_item(self):
        """Delete selected lore items with undo capability."""
        selected = self.lore_tree.selection()
        if not selected:
            messagebox.showwarning("Warning", "Please select at least one lore item to delete")
            return

        item_count = len(selected)
        confirm_message = f"Are you sure you want to delete {item_count} item{'s' if item_count > 1 else ''}?"
        
        if messagebox.askyesno("Confirm Delete", confirm_message):
            try:
                # Store current state for undo
                json_str = self.json_text.get(1.0, "end-1c").strip()
                self.last_deleted_json = json.loads(json_str)
                json_data = json.loads(json_str)
                
                # Get all selected items
                self.last_deleted_items = [
                    self.lore_tree.item(item_id)['values']
                    for item_id in selected
                ]
                
                # Check both possible locations for character book
                if 'character_book' in json_data:
                    entries = json_data['character_book'].get('entries', [])
                    filtered_entries = [
                        entry for entry in entries
                        if not any(
                            ', '.join(entry.get('keys', [])) == selected_item[0] and 
                            entry.get('content', '') == selected_item[1]
                            for selected_item in self.last_deleted_items
                        )
                    ]
                    json_data['character_book']['entries'] = filtered_entries
                elif 'data' in json_data and 'character_book' in json_data['data']:
                    entries = json_data['data']['character_book'].get('entries', [])
                    filtered_entries = [
                        entry for entry in entries
                        if not any(
                            ', '.join(entry.get('keys', [])) == selected_item[0] and 
                            entry.get('content', '') == selected_item[1]
                            for selected_item in self.last_deleted_items
                        )
                    ]
                    json_data['data']['character_book']['entries'] = filtered_entries
                else:
                    raise ValueError("No character book found in JSON data")

                # Update the display
                formatted_json = json.dumps(json_data, indent=4, ensure_ascii=False)
                self.json_text.delete(1.0, "end-1c")
                self.json_text.insert(1.0, formatted_json)
                self.update_lore_table(json_data)
                
                # Only hide the folder button, don't affect other state
                if hasattr(self, 'hide_folder_button'):
                    self.hide_folder_button()
                
                # Update status with undo button
                self.status_var.set(f"Successfully deleted {item_count} item{'s' if item_count > 1 else ''}")
                if hasattr(self, 'show_undo_button'):
                    self.show_undo_button()

            except Exception as e:
                self.logger.log_step(f"Error deleting lore items: {str(e)}")
                messagebox.showerror("Error", f"Failed to delete lore items: {str(e)}")