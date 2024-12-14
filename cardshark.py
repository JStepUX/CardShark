import os
import sys
import ctypes
import tkinter as tk
from datetime import datetime
from ctypes import windll
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.dialogs import Messagebox

# Local imports in alphabetical order
from basic_manager import BasicManager
from constants import *
from image_preview import ImagePreview
from json_handler import JsonHandler
from log_manager import LogManager
from lore_manager import LoreManager
from loretree_manager import LoreTreeManager
from message_manager import MessageManager
from nav_handler import NotebookNav
from personality_manager import PersonalityManager
from png_handler import PngHandler
from text_manager import text_manager
from url_handler import UrlHandler

def set_window_dark_title_bar(window):
    """Set window title bar to dark theme on Windows."""
    if sys.platform == "win32":
        try:
            DWMWA_USE_IMMERSIVE_DARK_MODE = 20
            windll.dwmapi.DwmSetWindowAttribute(
                windll.user32.GetParent(window.winfo_id()),
                DWMWA_USE_IMMERSIVE_DARK_MODE,
                ctypes.byref(ctypes.c_int(2)),
                ctypes.sizeof(ctypes.c_int)
            )
        except Exception as e:
            print(f"Failed to set dark title bar: {e}")

class CardShark:
    def __init__(self, root):
        # Initialize base style theme
        self.style = ttk.Style(theme="darkly")
        
        # Configure global styles with our fonts
        self.style.configure('TLabel', font=FONTS['DEFAULT'])
        self.style.configure('TEntry', font=FONTS['DEFAULT'])
        self.style.configure('TButton', font=FONTS['DEFAULT'])
        self.style.configure('Treeview', font=FONTS['TREE'])
        self.style.configure('Treeview.Heading', font=FONTS['HEADER'])
        
        # Status bar styling
        self.style.configure('Status.TLabel', font=FONTS['STATUS'])
        
        # Debug styling
        self.style.configure('Debug.TLabel', font=FONTS['DEBUG'])
        
        # Initialize root window
        self.root = root
        self.root.title("CardShark")
        self.root.geometry(WINDOW_SIZE)
        
        self.text_config = TEXT_CONFIG
        self.lore_count_var = tk.StringVar(value="Total: 0")
        
        # Set up folder functionality before UI creation
        self.setup_folder_functionality()
        
        # Create toolbar frame for buttons
        toolbar_frame = ttk.Frame(self.root)
        toolbar_frame.pack(fill=tk.X, padx=10, pady=5)
        self.create_base_ui(toolbar_frame)
        
        # Create main content container
        content_container = ttk.Frame(self.root)
        content_container.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        # Create left panel container for nav and preview
        left_panel_container = ttk.Frame(content_container, width=PANEL_SIZES['IMAGE_PREVIEW_WIDTH'])
        left_panel_container.pack(side=tk.LEFT, fill=tk.Y)
        left_panel_container.pack_propagate(False)
        
        # Create navigation panel with original width
        nav_panel = ttk.Frame(left_panel_container, width=PANEL_SIZES['IMAGE_PREVIEW_WIDTH'])
        nav_panel.pack(side=tk.TOP, fill=tk.X, pady=(0, 5))  # Add padding below
        
        # Create image preview panel maintaining original width
        preview_panel = ttk.Frame(left_panel_container, width=PANEL_SIZES['IMAGE_PREVIEW_WIDTH'])
        preview_panel.pack(side=tk.TOP, fill=tk.BOTH, expand=True)
        
        # Create main content frame (will hold all the tab content) - MOVED EARLIER
        self.content_frame = ttk.Frame(content_container)
        self.content_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(10, 0))
        
        # Initialize image preview
        self.image_preview = ImagePreview(preview_panel)
        
        # Initialize navigation AFTER content_frame exists
        self.nav_handler = NotebookNav(nav_panel, self)
        
        # Create debug frame
        self.create_debug_frame()
        
        # Create status frame
        self.create_status_frame()
        
        # Initialize logger
        self.logger = LogManager(self.debug_text)
        
        # Initialize text widgets in their respective frames
        self.create_content_widgets()
        
        # 1. First create JsonHandler since most managers need it
        self.json_handler = JsonHandler(
            self.json_text,
            self.base_prompt_text,
            self.status_var,
            self.logger,
            self
        )

        # 2. Create JSON viewer
        json_frame = self.nav_handler.frames['json_output']
        self.json_handler.create_viewer(json_frame)

        # 3. Now create managers that depend on json_handler
        self.basic_manager = BasicManager(
            self.nav_handler.frames['basic_info'],
            self.json_handler,  # Changed from text_config
            self.logger
        )

        self.personality_manager = PersonalityManager(
            self.nav_handler.frames['personality_scenario'],
            self.json_handler,  # Changed from text_config
            self.logger
        )

        self.message_manager = MessageManager(
            self.nav_handler.frames['messages'],
            self.json_text,
            self.status_var,
            self.logger,
            self.json_handler  # Added json_handler
        )

        self.lore_manager = LoreManager(
            self.json_text,
            self.nav_handler.frames['lore'],
            self.status_var,
            self.logger,
            self.json_handler  # Added json_handler
        )

        # 4. Initialize LoreTreeManager after LoreManager
        self.lore_tree_manager = LoreTreeManager(
            self.nav_handler.frames['worldbook'],
            self.lore_manager,
            self.status_var,
            self.logger
        )

        # 5. Register tree view with lore manager
        self.lore_manager.register_tree_view(self.lore_tree_manager)

        # 6. Create handlers that need json_handler and other managers
        self.png_handler = PngHandler(
            self.json_text,
            self.json_handler,
            self.lore_manager,
            self.status_var,
            self.logger
        )

        self.url_handler = UrlHandler(
            self.json_handler,
            self.json_text,
            self.lore_manager,
            self.status_var,
            self.logger
        )

        # 7. Set up final connections
        self.json_handler.set_png_handler(self.png_handler)
        self.setup_button_commands()
        self.png_handler.set_image_loaded_callback(self.image_preview.update_image_preview)
        self.png_handler.show_folder_button = self.show_folder_button

        # 8. Setup remaining functionality
        self.setup_undo_functionality()
        self.png_handler.set_status_frame(self.status_frame, self.folder_button)
        self.nav_handler.setup_lore_buttons()

        # 9. Hide debug frame
        self.debug_frame_visible = False
        self.debug_frame.pack_forget()

    def create_base_ui(self, parent):
        """Create the basic UI structure."""
        self.btn_frame = ttk.Frame(parent)
        self.btn_frame.pack(fill=tk.X, pady=5)
        
        # Create buttons without commands (removed Update Main JSON button)
        self.load_button = ttk.Button(
            self.btn_frame,
            text=BUTTON_TEXT['LOAD'],
            bootstyle="primary"
        )
        self.load_button.pack(side=tk.LEFT, padx=5)

        self.import_url_button = ttk.Button(
            self.btn_frame,
            text="Import BY URL",
            bootstyle="primary"
        )
        self.import_url_button.pack(side=tk.LEFT, padx=5)

        self.save_button = ttk.Button(
            self.btn_frame,
            text=BUTTON_TEXT['SAVE'],
            bootstyle="info"
        )
        self.save_button.pack(side=tk.LEFT, padx=5)

        self.clear_button = ttk.Button(
            self.btn_frame,
            text=BUTTON_TEXT['CLEAR'],
            bootstyle="danger-outline"
        )
        self.clear_button.pack(side=tk.LEFT, padx=5)

    def setup_button_commands(self):
        """Set up button commands after handlers are created"""
        self.load_button.config(command=self.png_handler.load_png)
        self.import_url_button.config(command=self.show_url_import_dialog)
        self.save_button.config(command=self.png_handler.save_png)
        self.clear_button.config(command=self.clear_application_state)
    
    def clear_application_state(self):
        """Reset the application to its initial state."""
        try:
            self.logger.start_operation("Clear Application State")
            
            # Use JsonHandler to create empty structure and clear state
            empty_v2 = self.json_handler.clear_json_state()
            
            # Clear text widgets
            self.base_prompt_text.delete(1.0, tk.END)
            
            # Clear managers with empty V2 structure
            if hasattr(self, 'lore_manager'):
                if hasattr(self.lore_manager, 'widget_manager'):
                    self.lore_manager.widget_manager.refresh_entries([])

            if hasattr(self, 'personality_manager'):
                self.personality_manager.personality_text.delete(1.0, tk.END)
                self.personality_manager.scenario_text.delete(1.0, tk.END)

            if hasattr(self, 'message_manager'):
                self.message_manager.refresh_messages(empty_v2)

            # Clear basic info fields
            if hasattr(self, 'basic_manager'):
                self.basic_manager.char_name_entry.delete(0, tk.END)
                self.basic_manager.display_name_entry.delete(0, tk.END)
                self.basic_manager.tags_text.delete('1.0', tk.END)
                self.basic_manager.images_text.delete('1.0', tk.END)
            
            # Reset lore count
            self.lore_count_var.set("Total: 0")
            
            # Reset PNG handler state
            if hasattr(self, 'png_handler'):
                self.png_handler.current_file = None
                self.png_handler.original_metadata = {}
                self.png_handler.original_mode = None
                self.png_handler.last_saved_directory = None
            
            # Cleanup URL handler temp files
            if hasattr(self, 'url_handler'):
                self.url_handler.cleanup()
            
            # Hide buttons
            if hasattr(self, 'hide_folder_button'):
                self.hide_folder_button()
            if hasattr(self, 'hide_undo_button'):
                self.hide_undo_button()
            
            # Reset image preview to logo
            if hasattr(self, 'image_preview'):
                self.image_preview.load_logo()
            
            # Clear status
            self.status_var.set("")
            
            self.logger.log_step("Application state cleared successfully")
            self.logger.end_operation()
            
        except Exception as e:
            self.logger.log_step(f"Error clearing application state: {str(e)}")
            self.status_var.set(f"Error clearing application state: {str(e)}")
    
    def setup_folder_functionality(self):
        """Set up folder-related methods before UI creation."""
        def open_saved_folder():
            if self.png_handler and self.png_handler.last_saved_directory:
                os.startfile(self.png_handler.last_saved_directory)
        
        def show_folder_button():
            if hasattr(self, 'folder_button'):
                self.folder_button.pack(side=tk.LEFT, padx=(10, 0))
        
        def hide_folder_button():
            if hasattr(self, 'folder_button'):
                self.folder_button.pack_forget()
        
        # Assign methods to instance
        self.open_saved_folder = open_saved_folder
        self.show_folder_button = show_folder_button
        self.hide_folder_button = hide_folder_button
    
    def create_ui_elements(self):
        """Create and organize all UI elements."""
        # Create main frame and basic UI structure
        self.create_base_ui()
        
        # Create main content container that will hold our horizontal panels
        content_container = ttk.Frame(self.root)
        content_container.grid(row=1, column=0, columnspan=2, sticky=(tk.N, tk.S, tk.W, tk.E))
        self.root.rowconfigure(1, weight=1)
        self.root.columnconfigure(0, weight=1)
        content_container.columnconfigure(2, weight=1)  # Give weight to the content column
        content_container.rowconfigure(0, weight=1)     # Allow vertical expansion
        
        # Create left panel for image preview
        left_panel = ttk.Frame(content_container, width=PANEL_SIZES['IMAGE_PREVIEW_WIDTH'])
        left_panel.pack(side=tk.LEFT, fill=tk.Y)
        left_panel.pack_propagate(False)  # Keep fixed width

        # Create image preview
        self.image_preview = ImagePreview(left_panel)
        
        # Create navigation panel with visible padding
        nav_panel = ttk.Frame(content_container, width=PANEL_SIZES['NAV_TREE_WIDTH'])
        nav_panel.pack(side=tk.LEFT, fill=tk.Y, padx=(10, 10))
        nav_panel.pack_propagate(False)  # Keep fixed width
        
        # Create an inner frame for the tree with padding
        nav_inner_frame = ttk.Frame(nav_panel)
        nav_inner_frame.pack(fill=tk.BOTH, expand=True, padx=20)  # Add horizontal padding here
        
        # Create content panel - will expand to fill remaining space
        self.content_frame = ttk.Frame(content_container)
        self.content_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10))
        
        # Create text widgets in content frame
        self.create_content_widgets()
        
        # Create debug frame
        self.create_debug_frame()
        
        # Create status frame
        self.create_status_frame()

    def create_status_frame(self):
        """Create the status frame with status label and buttons."""
        # Create status frame
        self.status_frame = ttk.Frame(self.root)
        self.status_frame.pack(fill=tk.X, pady=5, padx=10)
        
        # Create left section for status and regular buttons
        left_section = ttk.Frame(self.status_frame)
        left_section.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        # Create right section for debug toggle
        right_section = ttk.Frame(self.status_frame)
        right_section.pack(side=tk.RIGHT, padx=(0, 10))
        
        # Status label
        self.status_var = tk.StringVar()
        status_label = ttk.Label(
            left_section, 
            textvariable=self.status_var
        )
        status_label.pack(side=tk.LEFT)
        
        # Undo button (hidden by default)
        self.undo_button = ttk.Button(
            left_section,
            text=BUTTON_TEXT['UNDO'],
            command=lambda: self.lore_manager.undo_last_deletion(),
            bootstyle="info-outline",
            width=8
        )
        
        # Create folder button (hidden by default)
        self.folder_button = ttk.Button(
            left_section,
            text=BUTTON_TEXT['VIEW_FOLDER'],
            command=self.open_saved_folder,
            bootstyle="info",
            width=10
        )
        
        # Debug toggle button on the right
        self.debug_toggle = ttk.Button(
            right_section,
            text="Show Debug",
            command=self.toggle_debug_frame,
            bootstyle="secondary-outline",
            width=10
        )
        self.debug_toggle.pack(side=tk.RIGHT)
    
    def create_debug_frame(self):
        """Create the debug information frame with toggle functionality."""
        # Create debug frame
        self.debug_frame = ttk.LabelFrame(self.root, text=FRAME_LABELS['DEBUG'], padding="5")
        
        # Create debug text widget
        self.debug_text = tk.Text(
            self.debug_frame, 
            wrap=tk.WORD, 
            width=100, 
            height=WIDGET_SIZES['DEBUG_HEIGHT'],
            **self.text_config
        )
        self.debug_text.pack(fill=tk.BOTH, expand=True)
        
        # Hide debug frame by default
        self.debug_frame_visible = False

    def toggle_debug_frame(self):
        """Toggle the visibility of the debug frame."""
        if self.debug_frame_visible:
            self.debug_frame.pack_forget()
            self.debug_toggle.configure(text="Show Debug")
        else:
            self.debug_frame.pack(fill=tk.X, padx=10, pady=5)
            self.debug_toggle.configure(text="Hide Debug")
        self.debug_frame_visible = not self.debug_frame_visible

    def create_content_widgets(self):
        """Create all content widgets in their respective frames"""
        # Base Prompt frame content
        prompt_frame = self.nav_handler.frames['prompt']
        self.base_prompt_text = text_manager.create_text_widget(
            prompt_frame,
            height=WIDGET_SIZES['BASE_PROMPT_HEIGHT']
        )
        self.base_prompt_text.pack(fill=tk.BOTH, expand=True)
        
        # Create the JSON text widget
        self.json_text = text_manager.create_text_widget(
            self.content_frame,
            width=WIDGET_SIZES['JSON_WIDTH'],
            height=WIDGET_SIZES['JSON_HEIGHT']
        )

    def create_toolbar_buttons(self):
        """Create all toolbar buttons"""
        # Load button
        ttk.Button(
            self.btn_frame,
            text=BUTTON_TEXT['LOAD'],
            command=self.png_handler.load_png,
            bootstyle="primary"
        ).pack(side=tk.LEFT, padx=5)

        # Import URL button
        ttk.Button(
            self.btn_frame,
            text="Import BY URL",
            command=self.show_url_import_dialog,
            bootstyle="primary"
        ).pack(side=tk.LEFT, padx=5)

        # Save button
        ttk.Button(
            self.btn_frame,
            text=BUTTON_TEXT['SAVE'],
            command=self.png_handler.save_png,
            bootstyle="info"
        ).pack(side=tk.LEFT, padx=5)

        # Update button
        ttk.Button(
            self.btn_frame,
            text=BUTTON_TEXT['UPDATE'],
            command=self.json_handler.update_main_json,
            bootstyle="dark"
        ).pack(side=tk.LEFT, padx=5)

        # Clear button
        ttk.Button(
            self.btn_frame,
            text=BUTTON_TEXT['CLEAR'],
            command=self.clear_application_state,
            bootstyle="danger-outline"
        ).pack(side=tk.LEFT, padx=5)

    def extend_png_handler(self):
        """Extend the PNG handler to update the image preview."""
        original_load_png = self.png_handler.load_png
        
        def new_load_png():
            result = original_load_png()
            if self.png_handler.current_file:
                # Use the new ImagePreview class's method
                self.image_preview.update_image_preview(self.png_handler.current_file)
            return result
            
        self.png_handler.load_png = new_load_png

    def setup_undo_functionality(self):
        """Set up the undo button functionality."""
        def show_undo():
            self.undo_button.pack(side=tk.LEFT, padx=(10, 0))
            
        def hide_undo():
            self.undo_button.pack_forget()
            
        self.lore_manager.show_undo_button = show_undo
        self.lore_manager.hide_undo_button = hide_undo

    def show_url_import_dialog(self):
        """Show enhanced dialog to import character from URL."""
        dialog = tk.Toplevel(self.root)
        dialog.title("Import from Backyard.ai URL")
        dialog.geometry("500x200")
        dialog.transient(self.root)
        dialog.grab_set()

        # Center the dialog on the main window
        # Wait for dialog to be ready
        dialog.update_idletasks()
        
        # Calculate position
        main_width = self.root.winfo_width()
        main_height = self.root.winfo_height()
        main_x = self.root.winfo_x()
        main_y = self.root.winfo_y()
        
        dialog_width = dialog.winfo_width()
        dialog_height = dialog.winfo_height()
        
        position_x = main_x + (main_width - dialog_width) // 2
        position_y = main_y + (main_height - dialog_height) // 2
        
        # Set the position
        dialog.geometry(f"+{position_x}+{position_y}")

        # Main container with padding
        container = ttk.Frame(dialog, padding="20 10")
        container.pack(fill=tk.BOTH, expand=True)

        # Instructions
        ttk.Label(
            container,
            text="Enter or paste a Backyard.ai character URL:",
            wraplength=450
        ).pack(pady=(0, 10))

        # URL entry frame
        entry_frame = ttk.Frame(container)
        entry_frame.pack(fill=tk.X, pady=(0, 5))

        # URL entry
        url_entry = ttk.Entry(entry_frame, width=50)
        url_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # Create right-click menu
        menu = tk.Menu(dialog, tearoff=0)
        menu.add_command(label="Paste", command=lambda: (
            url_entry.event_generate('<<Paste>>'),
            dialog.after(50, validate_url_field)  # Validate after paste
        ))

        def show_menu(event):
            menu.post(event.x_root, event.y_root)

        # Bind right-click to show menu
        url_entry.bind('<Button-3>', show_menu)

        # Status label for validation feedback
        status_label = ttk.Label(container, text="")
        status_label.pack(fill=tk.X, pady=5)

        # Import button - disabled by default until valid URL
        import_button = ttk.Button(
            container,
            text="Import",
            state="disabled",
            bootstyle="primary"
        )
        import_button.pack(pady=10)

        def validate_url_field():
            """Validate URL as user types or pastes."""
            url = url_entry.get().strip()
            cleaned_url, error = self.url_handler.clean_backyard_url(url)
            
            if error:
                url_entry.configure(bootstyle="danger")
                status_label.configure(text=error)
                import_button.configure(state="disabled")
            else:
                url_entry.delete(0, tk.END)
                url_entry.insert(0, cleaned_url)
                url_entry.configure(bootstyle="success")
                status_label.configure(text="Valid URL")
                import_button.configure(state="normal")

        def process_url():
            """Process the URL and import character."""
            url = url_entry.get().strip()
            cleaned_url, error = self.url_handler.clean_backyard_url(url)
            
            if error:
                Messagebox.showerror("Invalid URL", error)
                return

            try:
                image_path = self.url_handler.import_from_url(cleaned_url)
                if image_path:
                    self.image_preview.update_image_preview(image_path)
                    dialog.destroy()
            except Exception as e:
                Messagebox.showerror(
                    "Import Error",
                    f"Failed to import character: {str(e)}"
                )

        # Set up button command after defining process_url
        import_button.configure(command=process_url)

        # Bind validation to entry events
        url_entry.bind('<KeyRelease>', lambda e: validate_url_field())
        url_entry.bind('<FocusOut>', lambda e: validate_url_field())
        url_entry.bind('<Control-v>', lambda e: dialog.after(50, validate_url_field))
    
    def setup_ui_handlers(self):
        """Set up all UI handlers with themed buttons."""
        # Load button
        load_btn = ttk.Button(
            self.btn_frame,
            text=BUTTON_TEXT['LOAD'],
            command=self.png_handler.load_png,
            bootstyle="primary"
        )
        load_btn.pack(side=tk.LEFT, padx=5)

        # Add Import URL button after Load button
        import_url_btn = ttk.Button(
            self.btn_frame,
            text=BUTTON_TEXT['IMPORTURL'],
            command=self.show_url_import_dialog,
            bootstyle="primary"
        )
        import_url_btn.pack(side=tk.LEFT, padx=5)

        # Save button
        save_btn = ttk.Button(
            self.btn_frame,
            text=BUTTON_TEXT['SAVE'],
            command=self.png_handler.save_png,
            bootstyle="info"
        )
        save_btn.pack(side=tk.LEFT, padx=5)

        # Update button
        update_btn = ttk.Button(
            self.btn_frame,
            text=BUTTON_TEXT['UPDATE'],
            command=self.json_handler.update_main_json,
            bootstyle="dark"
        )
        update_btn.pack(side=tk.LEFT, padx=5)

        # Clear button
        clear_btn = ttk.Button(
            self.btn_frame,
            text=BUTTON_TEXT['CLEAR'],
            command=self.clear_application_state,
            bootstyle="danger-outline"
        )
        clear_btn.pack(side=tk.LEFT, padx=5)
                
        # Add show/hide folder button methods to png_handler
        def show_folder():
            if hasattr(self, 'folder_button'):
                self.folder_button.pack(side=tk.LEFT, padx=(10, 0))
            
        def hide_folder():
            if hasattr(self, 'folder_button'):
                self.folder_button.pack_forget()
        
        self.png_handler.show_folder_button = show_folder
        
        # Add method to open folder
        def open_saved_folder(self):
            if self.png_handler.last_saved_directory:
                os.startfile(self.png_handler.last_saved_directory)
        
        self.open_saved_folder = open_saved_folder

if __name__ == "__main__":
    root = ttk.Window(themename="darkly")
    
    # Set icon
    try:
        icon_path = os.path.join(os.path.dirname(__file__), 'cardshark.ico')
        if os.path.exists(icon_path):
            root.iconbitmap(icon_path)
        else:
            print(f"Icon file not found at: {icon_path}")
    except Exception as e:
        print(f"Error loading icon: {str(e)}")
    
    # Try setting the title bar dark mode BEFORE creating the app
    if sys.platform == "win32":
        root.update()
        DWMWA_USE_IMMERSIVE_DARK_MODE = 20
        windll.dwmapi.DwmSetWindowAttribute(
            windll.user32.GetParent(root.winfo_id()),
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            ctypes.byref(ctypes.c_int(True)),
            ctypes.sizeof(ctypes.c_int)
        )
    
    app = CardShark(root)
    root.mainloop()