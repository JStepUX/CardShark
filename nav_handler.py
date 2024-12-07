import tkinter as tk
from tkinter import ttk
import ttkbootstrap as ttk_boot
from constants import *

class NotebookNav:
    def __init__(self, parent, app):
        """Initialize the notebook navigation."""
        self.app = app
        
        # Create main container with image preview width
        self.container = ttk.Frame(parent, width=PANEL_SIZES['IMAGE_PREVIEW_WIDTH'])
        self.container.pack(fill=tk.X)  # Fill X to match image preview width
        
        # Create notebook - using ttk.Notebook for custom vertical styling
        self.notebook = ttk.Notebook(self.container)
        
        # Configure style for vertical tabs (keeping all original styling)
        style = ttk.Style()
        
        # Layout for vertical tabs (unchanged)
        style.layout('Nav.TNotebook', [
            ('Notebook.client', {'sticky': 'nswe'})
        ])
        style.layout('Nav.TNotebook.Tab', [
            ('Notebook.tab', {
                'sticky': 'nswe',
                'children': [
                    ('Notebook.padding', {
                        'side': 'left',
                        'sticky': 'nswe',
                        'children': [
                            ('Notebook.label', {'side': 'left', 'sticky': ''})
                        ]
                    })
                ]
            })
        ])
        
        # Configure the notebook style (unchanged)
        style.configure(
            'Nav.TNotebook',
            tabposition='wn',  # west, normal
            background=COLORS['BACKGROUND']
        )
        
        style.configure(
            'Nav.TNotebook.Tab',
            padding=[20, 15],
            font=FONTS['HEADER'],
            background=COLORS['BACKGROUND'],
            foreground=COLORS['FOREGROUND'],
            width=PANEL_SIZES['IMAGE_PREVIEW_WIDTH'] - 4  # Original width calculation
        )
        
        # Apply the style to notebook
        self.notebook.configure(style='Nav.TNotebook')
        
        # Pack the notebook
        self.notebook.pack(fill=tk.BOTH, expand=True)
        
        # Create frames (unchanged)
        self._create_tab_frames()
        
        # Add tabs (unchanged)
        self._add_tabs()
        
        # Bind tab change event (unchanged)
        self.notebook.bind('<<NotebookTabChanged>>', self.on_tab_changed)

    def _create_tab_frames(self):
        """Create frames for each tab with proper styling."""
        # Content frames in the content area
        self.frames = {
            'basic_info': ttk_boot.Frame(self.app.content_frame),
            'prompt': ttk_boot.Frame(self.app.content_frame),
            'personality_scenario': ttk_boot.Frame(self.app.content_frame),  # Added personality/scenario frame
            'messages': ttk_boot.Frame(self.app.content_frame),
            'worldbook': ttk_boot.Frame(self.app.content_frame),
            'lore': ttk_boot.Frame(self.app.content_frame),
            'json_output': ttk_boot.Frame(self.app.content_frame)
        }
        
        # Placeholder frames for notebook
        self.tab_frames = {
            'basic_info': ttk.Frame(self.notebook),
            'prompt': ttk.Frame(self.notebook),
            'personality_scenario': ttk.Frame(self.notebook),  
            'messages': ttk.Frame(self.notebook),
            'worldbook': ttk.Frame(self.notebook),
            'lore': ttk.Frame(self.notebook),
            'json_output': ttk.Frame(self.notebook)
        }
        
        # Keep track of current visible frame
        self.current_frame = None

    def _add_tabs(self):
        """Add tabs with proper text and tags."""
        tab_data = [
            ('basic_info', "Basic Info"),
            ('prompt', "Base Prompt"),
            ('personality_scenario', "Personality / Scenario"),  
            ('messages', "First / Alt Greetings"),
            ('worldbook', "Worldbook Settings"),
            ('lore', "Lore Manager"),
            ('json_output', "Final JSON")
        ]
        
        for tag, text in tab_data:
            self.notebook.add(self.tab_frames[tag], text=text)
            self.tab_frames[tag]._content_tag = tag

    def on_tab_changed(self, event):
        """Handle tab change events."""
        current_tab = self.notebook.select()
        if not current_tab:
            return
            
        tab_frame = self.notebook.nametowidget(current_tab)
        if not hasattr(tab_frame, '_content_tag'):
            return
            
        content_tag = tab_frame._content_tag
        
        # Hide current content frame
        if self.current_frame:
            self.current_frame.pack_forget()
        
        # Show new content frame
        if content_tag in self.frames:
            self.frames[content_tag].pack(fill=tk.BOTH, expand=True)
            self.current_frame = self.frames[content_tag]
            
            # Refresh content if needed
            if content_tag == 'json_output':
                self.app.json_handler.refresh_viewer()
            elif content_tag == 'lore' and hasattr(self.app, 'lore_manager'):
                try:
                    self.app.lore_manager.refresh_lore_table()
                except Exception as e:
                    print(f"Error refreshing lore table: {str(e)}")

    def setup_lore_buttons(self):
        """Set up the lore management buttons."""
        if not hasattr(self.app, 'lore_manager'):
            return
        
        # Only keep the count label
        ttk_boot.Label(
            self.frames['lore'],
            textvariable=self.app.lore_count_var,
            bootstyle="info"
        ).pack(side=tk.RIGHT, padx=5)