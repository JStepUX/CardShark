import tkinter as tk
from tkinter import ttk
import re
from typing import Optional, Dict, Any
from constants import COLORS, FONTS, TEXT_CONFIG

class StyledText:
    def __init__(self, parent, **kwargs):
        self.text_widget = tk.Text(parent, **kwargs)
        self.setup_default_tags()
        self.text_widget.bind('<KeyRelease>', self.update_styles)
        self.text_widget.bind('<<Paste>>', self.handle_paste)
        
        # Store regex patterns
        self.patterns = {
            'quotes': (r'"[^"]*"', 'quoted'),              # Text in double quotes
            'asterisks': (r'\*[^\*]*\*', 'emphasized'),    # Text between asterisks
            'double_asterisks': (r'\*\*[^\*]*\*\*', 'emphasized'),
            'braces': (r'\{\{[^\}]*\}\}', 'variable'),     # Text in braces
            'code': (r'`[^`]+`', 'code')                   # Text in backticks
        }
    
    def setup_default_tags(self):
        """Configure default text styling tags."""
        # Configure basic tags using colors from TextManager instance
        self.text_widget.tag_configure('quoted', foreground=COLORS['QUOTED_TEXT'])
        self.text_widget.tag_configure('emphasized', foreground=COLORS['EMPHASIZED_TEXT'])
        self.text_widget.tag_configure('variable', foreground=COLORS['VARIABLE_TEXT'])
        
        # Configure code tag with background and foreground colors
        self.text_widget.tag_configure('code', 
            background='#2A2A2A',           # Darker background
            foreground='#E0E0E0',           # Light gray text
            spacing1=2,                     # Add slight padding above
            spacing3=2,                     # Add slight padding below
            font=('Consolas', 14))          # Monospace font for code
    
    def update_styles(self, event=None):
        """Update text styles based on patterns."""
        # Get all text content
        content = self.text_widget.get('1.0', 'end-1c')
        
        # Remove all existing tags
        for tag_name in ['quoted', 'emphasized', 'variable', 'code']:  # Added 'code' to cleanup
            self.text_widget.tag_remove(tag_name, '1.0', 'end')
        
        # Apply tags based on patterns
        for pattern, tag_name in self.patterns.values():
            for match in re.finditer(pattern, content):
                start, end = match.span()
                # Convert string indices to tk text indices
                start_idx = self.text_widget.index(f"1.0 + {start} chars")
                end_idx = self.text_widget.index(f"1.0 + {end} chars")
                self.text_widget.tag_add(tag_name, start_idx, end_idx)
    
    def update_styles(self, event=None):
        """Update text styles based on patterns."""
        # Get all text content
        content = self.text_widget.get('1.0', 'end-1c')
        
        # Remove all existing tags
        for tag_name in ['quoted', 'emphasized', 'variable']:
            self.text_widget.tag_remove(tag_name, '1.0', 'end')
        
        # Apply tags based on patterns
        for pattern, tag_name in self.patterns.values():
            for match in re.finditer(pattern, content):
                start, end = match.span()
                # Convert string indices to tk text indices
                start_idx = self.text_widget.index(f"1.0 + {start} chars")
                end_idx = self.text_widget.index(f"1.0 + {end} chars")
                self.text_widget.tag_add(tag_name, start_idx, end_idx)
    
    def handle_paste(self, event=None):
        """Handle paste events and update styling."""
        self.text_widget.after(10, self.update_styles)
    
    # Forward all common Text widget methods to the internal text_widget
    def get(self, start='1.0', end='end-1c') -> str:
        """Get text content."""
        return self.text_widget.get(start, end)
    
    def insert(self, index, text: str):
        """Insert text at specified index."""
        self.text_widget.insert(index, text)
        self.update_styles()
    
    def delete(self, start, end=None):
        """Delete text between start and end indices."""
        self.text_widget.delete(start, end)
        self.update_styles()
    
    def pack(self, **kwargs):
        """Pack the text widget."""
        self.text_widget.pack(**kwargs)
    
    def grid(self, **kwargs):
        """Grid the text widget."""
        self.text_widget.grid(**kwargs)
    
    def place(self, **kwargs):
        """Place the text widget."""
        self.text_widget.place(**kwargs)
        
    def bind(self, sequence=None, func=None, add=None):
        """Bind an event to the text widget."""
        return self.text_widget.bind(sequence, func, add)
        
    def unbind(self, sequence, funcid=None):
        """Unbind an event from the text widget."""
        return self.text_widget.unbind(sequence, funcid)
    
    def yview(self, *args):
        """Support scrollbar functionality."""
        return self.text_widget.yview(*args)
    
    def config(self, **kwargs):
        """Support configuration changes."""
        return self.text_widget.config(**kwargs)
        
    def configure(self, **kwargs):
        """Support configuration changes."""
        return self.text_widget.configure(**kwargs)

class TextManager:
    """
    Factory class for creating styled text widgets with consistent configuration.
    """
    def __init__(self):
        """Initialize text manager with default configuration."""
        # Use constants for configuration
        self.default_config = TEXT_CONFIG.copy()  # Base configuration from constants
    
    def create_text_widget(self, parent, **kwargs) -> StyledText:
        """
        Create a new styled text widget with default configuration.
        Additional kwargs override defaults.
        """
        # Merge default config with provided kwargs
        config = {**self.default_config, **kwargs}
        return StyledText(parent, **config)

# Global instance for easy access
text_manager = TextManager()