import tkinter as tk
from tkinter import ttk
import ttkbootstrap as ttk_boot
from PIL import Image, ImageTk
import os

class TooltipLabel:
    _icon_cache = None
    _logger = None

    @classmethod
    def _init_icons(cls):
        """Initialize info icon with error handling and fallback."""
        if cls._icon_cache is None:
            cls._icon_cache = {}
            try:
                import os
                import sys
                
                # Try multiple possible paths for icon
                possible_base_paths = [
                    os.path.dirname(os.path.abspath(__file__)),
                    os.path.dirname(sys.executable),
                    '.'
                ]

                icon_loaded = False
                for base_path in possible_base_paths:
                    try:
                        full_path = os.path.join(base_path, 'icon_tooltip.png')
                        if os.path.exists(full_path):
                            cls._icon_cache['info'] = tk.PhotoImage(file=full_path)
                            icon_loaded = True
                            if cls._logger:
                                cls._logger.log_step(f"Loaded tooltip icon from {full_path}")
                            break
                    except Exception as e:
                        if cls._logger:
                            cls._logger.log_step(f"Failed to load icon from {full_path}: {str(e)}")
                        continue
                
                if not icon_loaded:
                    # Create simple colored circle as fallback
                    if cls._logger:
                        cls._logger.log_step("Creating fallback tooltip icon")
                    fallback = tk.PhotoImage(width=16, height=16)
                    fallback.put("#4444ff", to=(4, 4, 11, 11))  # Blue circle
                    cls._icon_cache['info'] = fallback

            except Exception as e:
                if cls._logger:
                    cls._logger.log_step(f"Error initializing tooltip icon: {str(e)}")
                # Ultimate fallback
                fallback = tk.PhotoImage(width=16, height=16)
                fallback.put("#4444ff", to=(4, 4, 11, 11))
                cls._icon_cache['info'] = fallback

    def __init__(self, parent, text, tooltip="", show_tooltip=True, **kwargs):
        """Create a label with optional tooltip icon."""
        # Initialize icons if needed
        if self._icon_cache is None:
            self._init_icons()

        # Create container frame
        self.frame = ttk_boot.Frame(parent)
        self.frame.pack(**kwargs) if 'pack' in kwargs else self.frame.grid(**kwargs)

        # Create label
        self.label = ttk_boot.Label(self.frame, text=text)
        self.label.pack(side=tk.LEFT, padx=(0, 2))

        if show_tooltip and tooltip:
            # Create tooltip icon
            self.icon_label = ttk_boot.Label(
                self.frame,
                image=self._icon_cache['info'],
                cursor="question_arrow"
            )
            self.icon_label.pack(side=tk.LEFT)

            # Create tooltip window (hidden initially)
            self.tooltip_window = None
            self.tooltip_text = tooltip

            # Bind mouse events
            self.icon_label.bind('<Enter>', self.show_tooltip)
            self.icon_label.bind('<Leave>', self.hide_tooltip)

    def show_tooltip(self, event=None):
        """Display the tooltip."""
        x, y, _, _ = self.icon_label.bbox("insert")
        x += self.icon_label.winfo_rootx() + 25
        y += self.icon_label.winfo_rooty() + 25

        # Destroy existing tooltip if any
        self.hide_tooltip()

        # Create new tooltip window
        self.tooltip_window = tk.Toplevel(self.frame)
        self.tooltip_window.wm_overrideredirect(True)
        self.tooltip_window.wm_geometry(f"+{x}+{y}")

        # Create tooltip label
        tooltip_label = ttk_boot.Label(
            self.tooltip_window,
            text=self.tooltip_text,
            justify=tk.LEFT,
            bootstyle="secondary",
            padding=5
        )
        tooltip_label.pack()

        # Add border
        self.tooltip_window.configure(background='gray70')
        
    def hide_tooltip(self, event=None):
        """Hide the tooltip."""
        if self.tooltip_window:
            self.tooltip_window.destroy()
            self.tooltip_window = None

# Example usage:
# tooltip_label = TooltipLabel(
#     parent,
#     text="Label Text",
#     tooltip="This is helpful information",
#     show_tooltip=True
# )