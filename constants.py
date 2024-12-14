# GUI Constants
WINDOW_SIZE = "1920x1080"

# Padding and Spacing Constants
PADDING = {
    # Frame Padding
    'CONTAINER': 5,
    'FRAME': 10,
    'CONTENT': 15,
    'BUTTON_FRAME': 5,
    
    # Notebook Padding
    'NOTEBOOK': 2,
    'TAB': (10, 5),
    'TAB_CONTENT': 5,
    
    # Button and Widget Padding
    'BUTTON': (5, 2),
    'BUTTON_SPACING': 2,
    'LABEL': 5,
    
    # General Layout Padding
    'WIDGET': 5,
    'SECTION': 10,
    'DIALOG': 15,
}

# Button Sizes
BUTTON_SIZES = {
    'STANDARD': 10,
    'LORE': 12,
    'TOOLBAR': 15,
}

# Panel Sizes
PANEL_SIZES = {
    'IMAGE_PREVIEW_WIDTH': 400,
    'NAV_TREE_WIDTH': 420,
    'CONTENT_MIN_WIDTH': 800,
}

# Font Sizes
FONT_SIZES = {
    'NORMAL': 14,
    'HEADER': 14,
    'TREE': 14,
    'DEBUG': 9,
    'STATUS': 10
}

# Color Scheme
COLORS = {
    'BACKGROUND': '#2B3E50',
    'FOREGROUND': '#FFFFFF',
    'SELECT_BG': '#486B8C',
    'SELECT_FG': '#FFFFFF',
    'BUTTON_NORMAL': '#0078D4',
    'BUTTON_HOVER': '#106EBE',
    'BUTTON_PRESSED': '#005A9E',
    'TREE_DUPLICATE_BG': '#4a3636',
    'IMAGE_PANEL_BACKGROUND': '#111719',
    'BUTTON_HOVER': '#3A4D63',
    'SELECT_BG': '#486B8C',
    'SELECT_FG': '#FFFFFF',
    'PANEL_BACKGROUND': '#1a1a1a',     # For main panels
    'PANEL_BACKGROUND_DARK': '#141414', # For inner/nested panels
    'PANEL_BORDER': '#2a2a2a',         # For panel borders if needed
    # New text styling colors
    'QUOTED_TEXT': '#FFA500',     # Orange
    'EMPHASIZED_TEXT': '#1E90FF',  # Dodger Blue
    'VARIABLE_TEXT': '#90EE90',    # Light Green
    'CODE_BACKGROUND': '#2A2A2A',  # Dark background for code
    'CODE_TEXT': '#E0E0E0',       # Light gray for code text
}

# Font Configuration
FONTS = {
    'DEFAULT': ('Segoe UI', FONT_SIZES['NORMAL']),
    'HEADER': ('Segoe UI', FONT_SIZES['HEADER'], 'bold'),
    'TREE': ('Segoe UI', FONT_SIZES['TREE']),
    'DEBUG': ('Segoe UI', FONT_SIZES['DEBUG']),
    'STATUS': ('Segoe UI', FONT_SIZES['STATUS'])
}

# Text Widget Configuration
TEXT_CONFIG = {
    'bg': COLORS['BACKGROUND'],
    'fg': COLORS['FOREGROUND'],
    'insertbackground': COLORS['FOREGROUND'],
    'selectbackground': COLORS['SELECT_BG'],
    'selectforeground': COLORS['SELECT_FG'],
    'font': FONTS['DEFAULT']
}

# Tree View Configuration
TREE_CONFIG = {
    'ROW_HEIGHT': 64,
    'PADDING': 16,
    'KEY_COLUMN_WIDTH': 400,
    'KEY_COLUMN_MIN_WIDTH': 300,
    'VALUE_COLUMN_WIDTH': 900,
    'VALUE_COLUMN_MIN_WIDTH': 500,
}

# Canvas Sizes
CANVAS = {
    'DEFAULT_WIDTH': PANEL_SIZES['IMAGE_PREVIEW_WIDTH'],
    'DEFAULT_HEIGHT': 600,
}

# File Types
FILE_TYPES = {
    'PNG': [("PNG files", "*.png")],
    'TSV': [("TSV files", "*.tsv")],
}

# Messages
MESSAGES = {
    'NO_IMAGE': "No image loaded",
    'LOAD_SUCCESS': "Character data loaded successfully",
    'NO_CHAR_DATA': "No valid character data found in PNG",
    'JSON_INVALID': "The JSON data is not properly formatted",
    'SAVE_SUCCESS': "Character data saved successfully to {}",
    'TSV_INVALID': "TSV file must have at least 2 columns",
    'IMPORT_SUCCESS': "Successfully imported",
    'ROWS_SKIPPED': "skipped",
    'NO_VALID_ITEMS': "No valid lore items found in TSV file",
    'IMPORT_ERROR': "Failed to import TSV",
    'EDIT_SELECT': "Please select a lore item to edit",
    'DELETE_SELECT': "Please select at least one lore item to delete",
    'INVALID_ITEM': "Invalid item selected",
    'DELETE_CONFIRM': "Are you sure you want to delete {} item{}?",
    'DELETE_SUCCESS': "Successfully deleted {} item{}",
    'RESTORE_SUCCESS': "Successfully restored deleted items",
    'ITEM_ADD_SUCCESS': "Lore item added successfully",
    'ITEM_UPDATE_SUCCESS': "Lore item updated successfully"
}

# Button Text
BUTTON_TEXT = {
    'LOAD': "Load PNG",
    'IMPORTURL': "Import BY URL",
    'SAVE': "Save PNG",
    'UPDATE': "Update Main JSON",
    'ADD': "Add Item",
    'EDIT': "Edit Item",
    'DELETE': "Delete Item",
    'IMPORT': "Import TSV",
    'UNDO': "Undo",
    'VIEW_FOLDER': "View Folder",
    'CLEAR': "Start Fresh",
}

# Tab Names
TAB_NAMES = {
    'PROMPT': "Prompt",
    'LORE': "Lore Items",
}

# Frame Labels
FRAME_LABELS = {
    'BASE_PROMPT': "Base Prompt",
    'FIRST_MESSAGE': "First Message",
    'CUSTOM_DIALOGUE': "Custom Dialogue",
    'COMPLETE_JSON': "Complete JSON",
    'DEBUG': "Debug Info",
    'IMAGE_PREVIEW': "Image Preview",
}

# Widget Sizes
WIDGET_SIZES = {
    'BASE_PROMPT_HEIGHT': 8,
    'FIRST_MESSAGE_HEIGHT': 4,
    'CUSTOM_DIALOGUE_HEIGHT': 8,
    'JSON_WIDTH': 80,
    'JSON_HEIGHT': 40,
    'DEBUG_HEIGHT': 3,
}

from ttkbootstrap.dialogs import Messagebox

class MessageDialog:
    """Wrapper for ttkbootstrap message dialogs to provide consistent styling."""
    
    @staticmethod
    def error(message, title="Error"):
        """Show error dialog."""
        return Messagebox.show_error(message, title)
    
    @staticmethod
    def info(message, title="Information"):
        """Show info dialog."""
        return Messagebox.show_info(message, title)
    
    @staticmethod
    def warning(message, title="Warning"):
        """Show warning dialog."""
        return Messagebox.show_warning(message, title)
    
    @staticmethod
    def ask_yes_no(message, title="Question"):
        """Show yes/no dialog."""
        return Messagebox.show_question(message, title) == "Yes"

    @staticmethod
    def ask_ok_cancel(message, title="Confirm"):
        """Show OK/Cancel dialog."""
        return Messagebox.show_question(message, title, buttons=["OK", "Cancel"]) == "OK"