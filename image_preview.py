import os
import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk
from constants import PANEL_SIZES, CANVAS, COLORS, FONTS

class ImagePreview:
    def __init__(self, parent_frame):
        """Initialize the image preview panel."""
        self.logo_image = None
        self.current_image = None
        
        # Create frame
        self.image_frame = ttk.Frame(parent_frame)
        self.image_frame.pack(fill=tk.BOTH, expand=True)
        
        # Configure style for the image panel
        style = ttk.Style()
        style.configure('ImagePanel.TFrame', background=COLORS['IMAGE_PANEL_BACKGROUND'])
        self.image_frame.configure(style='ImagePanel.TFrame')
        
        # Create canvas for image
        self.image_canvas = tk.Canvas(
            self.image_frame, 
            width=PANEL_SIZES['IMAGE_PREVIEW_WIDTH'] - 20,  # Account for padding
            height=CANVAS['DEFAULT_HEIGHT'],
            bg=COLORS['IMAGE_PANEL_BACKGROUND'],
            highlightthickness=0  # Remove canvas border
        )
        self.image_canvas.pack(fill=tk.BOTH, expand=True)
        
        # Load the logo immediately
        self.load_logo()

    def load_logo(self):
        """Load and display the application logo as placeholder."""
        try:
            logo_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logo.png')
            if os.path.exists(logo_path):
                # Load and resize logo
                logo = Image.open(logo_path)
                
                # Get canvas size (accounting for frame padding)
                canvas_width = PANEL_SIZES['IMAGE_PREVIEW_WIDTH'] - 20
                canvas_height = CANVAS['DEFAULT_HEIGHT']
                
                # Calculate scaling to fit canvas while maintaining aspect ratio
                scale = min(canvas_width/logo.width, canvas_height/logo.height)
                new_width = int(logo.width * scale)
                new_height = int(logo.height * scale)
                logo = logo.resize((new_width, new_height), Image.Resampling.LANCZOS)
                
                # Convert to PhotoImage and store reference
                self.logo_image = ImageTk.PhotoImage(logo)
                
                # Calculate position to center logo
                x = canvas_width // 2
                y = canvas_height // 2
                
                # Clear canvas and display logo
                self.image_canvas.delete("all")
                self.image_canvas.create_image(x, y, anchor=tk.CENTER, image=self.logo_image)
            else:
                print(f"Logo file not found at: {logo_path}")
                self.show_no_image_text()
        except Exception as e:
            print(f"Error loading logo: {str(e)}")
            self.show_no_image_text()

    def show_no_image_text(self):
        """Display 'No image loaded' text when no logo or image is available."""
        self.image_canvas.delete("all")
        canvas_width = PANEL_SIZES['IMAGE_PREVIEW_WIDTH'] - 20  # Account for padding
        canvas_height = CANVAS['DEFAULT_HEIGHT']
        
        self.image_canvas.create_text(
            canvas_width // 2,  # Center horizontally
            canvas_height // 2,  # Center vertically
            text="No image loaded",
            fill="white",
            font=FONTS['DEFAULT'],
            anchor=tk.CENTER
        )

    def update_image_preview(self, image_path):
        """Update the image preview with the loaded PNG, filling width while maintaining aspect ratio."""
        try:
            # Clear previous image
            self.image_canvas.delete("all")
            
            # Load image
            image = Image.open(image_path)
            
            # Get canvas size (accounting for frame padding)
            canvas_width = PANEL_SIZES['IMAGE_PREVIEW_WIDTH'] - 20
            canvas_height = CANVAS['DEFAULT_HEIGHT']
            
            # Calculate scaling to fill width while maintaining aspect ratio
            scale = canvas_width / image.width
            
            # Calculate new dimensions
            new_width = canvas_width
            new_height = int(image.height * scale)
            
            # Resize image
            image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Convert to PhotoImage and store reference
            self.current_image = ImageTk.PhotoImage(image)
            
            # Calculate vertical position to center image
            y = canvas_height // 2
            
            # Display image centered vertically and filling width
            self.image_canvas.create_image(
                new_width // 2,  # Center horizontally
                y,               # Center vertically
                anchor=tk.CENTER,
                image=self.current_image
            )
            
        except Exception as e:
            print(f"Error updating image preview: {str(e)}")
            self.load_logo()