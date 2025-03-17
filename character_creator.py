import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from PIL import Image, ImageTk
import json
import re
import shutil
from pathlib import Path

class CharacterCreator:
    def __init__(self, root):
        self.root = root
        self.root.title("Character Creator")
        self.root.geometry("1200x800")
        
        # Set base directory
        self.base_dir = Path("Characters")
        self.current_character = None
        self.layer_items = {}  # Dictionary to hold layer items by category
        self.selected_layers = {}  # Dictionary to hold selected layer for each category
        self.active_layers = []  # List to store active layer paths in order
        self.base_image = None
        self.current_composite = None
        
        # Layout
        self.setup_ui()
        
        # Initialize
        self.refresh_character_list()
    
    def setup_ui(self):
        # Main frame layout
        main_frame = ttk.Frame(self.root)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Left panel (character selection and layer categories)
        left_panel = ttk.Frame(main_frame, width=250)
        left_panel.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 10))
        left_panel.pack_propagate(False)
        
        # Character selection
        char_frame = ttk.LabelFrame(left_panel, text="Character Selection")
        char_frame.pack(fill=tk.X, pady=(0, 10))
        
        self.character_listbox = tk.Listbox(char_frame, height=6)
        self.character_listbox.pack(fill=tk.BOTH, padx=5, pady=5)
        self.character_listbox.bind('<<ListboxSelect>>', self.on_character_select)
        
        button_frame = ttk.Frame(char_frame)
        button_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(button_frame, text="New Character", command=self.create_new_character).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(button_frame, text="Refresh", command=self.refresh_character_list).pack(side=tk.LEFT)
        
        # Layer categories
        self.layers_frame = ttk.LabelFrame(left_panel, text="Layer Categories")
        self.layers_frame.pack(fill=tk.BOTH, expand=True)
        
        self.category_listbox = tk.Listbox(self.layers_frame, height=15)
        self.category_listbox.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        self.category_listbox.bind('<<ListboxSelect>>', self.on_category_select)
        
        # Add/Remove buttons for categories
        cat_button_frame = ttk.Frame(self.layers_frame)
        cat_button_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(cat_button_frame, text="Add Category", command=self.add_category).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(cat_button_frame, text="Remove", command=self.remove_category).pack(side=tk.LEFT)
        
        # Center panel (layer items)
        center_panel = ttk.Frame(main_frame)
        center_panel.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10))
        
        self.layer_items_frame = ttk.LabelFrame(center_panel, text="Layer Items")
        self.layer_items_frame.pack(fill=tk.BOTH, expand=True)
        
        # Create a canvas with scrollbar for layer items
        self.canvas_frame = ttk.Frame(self.layer_items_frame)
        self.canvas_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.canvas = tk.Canvas(self.canvas_frame)
        scrollbar = ttk.Scrollbar(self.canvas_frame, orient="vertical", command=self.canvas.yview)
        self.scrollable_frame = ttk.Frame(self.canvas)
        
        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )
        
        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=scrollbar.set)
        
        self.canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # Add/Import buttons for layer items
        layer_button_frame = ttk.Frame(center_panel)
        layer_button_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(layer_button_frame, text="Add Layer Item", command=self.add_layer_item).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(layer_button_frame, text="Import PNG", command=self.import_layer_png).pack(side=tk.LEFT)
        
        # Right panel (character preview)
        right_panel = ttk.Frame(main_frame, width=350)
        right_panel.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        preview_frame = ttk.LabelFrame(right_panel, text="Character Preview")
        preview_frame.pack(fill=tk.BOTH, expand=True)
        
        self.preview_canvas = tk.Canvas(preview_frame, bg='white')
        self.preview_canvas.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Save button
        save_frame = ttk.Frame(right_panel)
        save_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(save_frame, text="Save Character", command=self.save_character).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(save_frame, text="Export PNG", command=self.export_png).pack(side=tk.LEFT)
        
        # Active layers listbox (to see all currently active layers)
        active_frame = ttk.LabelFrame(right_panel, text="Active Layers")
        active_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.active_layers_listbox = tk.Listbox(active_frame, height=6)
        self.active_layers_listbox.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Buttons for adjusting layer order
        order_frame = ttk.Frame(active_frame)
        order_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(order_frame, text="Move Up", command=self.move_layer_up).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(order_frame, text="Move Down", command=self.move_layer_down).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(order_frame, text="Remove", command=self.remove_active_layer).pack(side=tk.LEFT)
    
    def refresh_character_list(self):
        """Refresh the character list by scanning the Characters directory"""
        self.character_listbox.delete(0, tk.END)
        
        if not os.path.exists(self.base_dir):
            os.makedirs(self.base_dir)
        
        characters = [d for d in os.listdir(self.base_dir) if os.path.isdir(os.path.join(self.base_dir, d))]
        for character in sorted(characters):
            self.character_listbox.insert(tk.END, character)
    
    def create_new_character(self):
        """Create a new character directory"""
        name = tk.simpledialog.askstring("New Character", "Enter character name:")
        if not name:
            return
        
        # Sanitize the name for use as a directory name
        safe_name = re.sub(r'[^\w\s-]', '', name).strip()
        if not safe_name:
            messagebox.showerror("Error", "Invalid character name")
            return
        
        char_dir = os.path.join(self.base_dir, safe_name)
        if os.path.exists(char_dir):
            messagebox.showerror("Error", f"Character '{safe_name}' already exists")
            return
        
        # Create character directory and base subdirectories
        os.makedirs(char_dir)
        os.makedirs(os.path.join(char_dir, "Base"))
        
        # Create character configuration file
        config = {
            "name": name,
            "categories": ["Base"],
            "default_layers": {}
        }
        
        with open(os.path.join(char_dir, "character.json"), 'w') as f:
            json.dump(config, f, indent=4)
        
        messagebox.showinfo("Success", f"Character '{name}' created successfully")
        self.refresh_character_list()
        
        # Select the new character
        for i in range(self.character_listbox.size()):
            if self.character_listbox.get(i) == safe_name:
                self.character_listbox.selection_set(i)
                self.character_listbox.see(i)
                self.on_character_select(None)
                break
    
    def on_character_select(self, event):
        """Handle character selection from the listbox"""
        selection = self.character_listbox.curselection()
        if not selection:
            return
        
        character_name = self.character_listbox.get(selection[0])
        self.load_character(character_name)
    
    def load_character(self, character_name):
        """Load the selected character and its layers"""
        self.current_character = character_name
        char_dir = os.path.join(self.base_dir, character_name)
        
        # Load character config
        config_path = os.path.join(char_dir, "character.json")
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                self.config = json.load(f)
        else:
            # Create default config if none exists
            self.config = {
                "name": character_name,
                "categories": ["Base"],
                "default_layers": {}
            }
            with open(config_path, 'w') as f:
                json.dump(self.config, f, indent=4)
        
        # Populate category listbox
        self.category_listbox.delete(0, tk.END)
        for category in self.config.get("categories", []):
            self.category_listbox.insert(tk.END, category)
        
        # Reset selected and active layers
        self.selected_layers = {}
        self.active_layers = []
        self.active_layers_listbox.delete(0, tk.END)
        
        # Check if we need to apply default layers
        if self.config.get("default_layers"):
            for category, layer in self.config["default_layers"].items():
                layer_path = os.path.join(char_dir, category, layer)
                if os.path.exists(layer_path):
                    self.active_layers.append(layer_path)
                    self.active_layers_listbox.insert(tk.END, f"{category}: {layer}")
        
        # Load base image if available
        base_dir = os.path.join(char_dir, "Base")
        base_pngs = [f for f in os.listdir(base_dir) if f.lower().endswith('.png')] if os.path.exists(base_dir) else []
        
        if base_pngs:
            # Use the first base PNG found
            self.base_image = Image.open(os.path.join(base_dir, base_pngs[0]))
            self.update_preview()
        else:
            self.base_image = None
            self.preview_canvas.delete("all")
            self.preview_canvas.create_text(175, 200, text="No base image found", fill="gray")
    
    def on_category_select(self, event):
        """Handle category selection from the listbox"""
        selection = self.category_listbox.curselection()
        if not selection:
            return
        
        category = self.category_listbox.get(selection[0])
        self.populate_layer_items(category)
    
    def populate_layer_items(self, category):
        """Populate the layer items area with thumbnails for the selected category"""
        # Clear previous items
        for widget in self.scrollable_frame.winfo_children():
            widget.destroy()
        
        if not self.current_character:
            return
        
        # Get layer items for the category
        category_dir = os.path.join(self.base_dir, self.current_character, category)
        if not os.path.exists(category_dir):
            os.makedirs(category_dir)
        
        layer_files = [f for f in os.listdir(category_dir) if f.lower().endswith('.png')]
        
        # Create a grid of thumbnails
        row, col = 0, 0
        max_cols = 3
        
        for layer_file in sorted(layer_files):
            frame = ttk.Frame(self.scrollable_frame, width=100, height=120)
            frame.grid(row=row, column=col, padx=10, pady=10)
            frame.grid_propagate(False)
            
            layer_path = os.path.join(category_dir, layer_file)
            
            try:
                # Create thumbnail
                img = Image.open(layer_path)
                img.thumbnail((80, 80))
                photo = ImageTk.PhotoImage(img)
                
                # Keep a reference to the photo to prevent garbage collection
                frame.photo = photo
                
                # Create image label and text label
                lbl_img = ttk.Label(frame, image=photo)
                lbl_img.pack(pady=(5, 0))
                
                lbl_text = ttk.Label(frame, text=layer_file, wraplength=90)
                lbl_text.pack(pady=(5, 0))
                
                # Make the whole frame clickable
                frame.bind("<Button-1>", lambda e, path=layer_path, cat=category, name=layer_file: 
                           self.select_layer(path, cat, name))
                lbl_img.bind("<Button-1>", lambda e, path=layer_path, cat=category, name=layer_file: 
                             self.select_layer(path, cat, name))
                lbl_text.bind("<Button-1>", lambda e, path=layer_path, cat=category, name=layer_file: 
                              self.select_layer(path, cat, name))
                
            except Exception as e:
                ttk.Label(frame, text=f"Error: {e}").pack()
            
            # Update grid position
            col += 1
            if col >= max_cols:
                col = 0
                row += 1
    
    def select_layer(self, layer_path, category, layer_name):
        """Select a layer for the current category"""
        # Update selected layers dictionary
        self.selected_layers[category] = layer_path
        
        # Check if this category already has an active layer
        found = False
        for i, path in enumerate(self.active_layers):
            if os.path.dirname(path).endswith(category):
                # Replace the layer
                self.active_layers[i] = layer_path
                found = True
                break
        
        if not found:
            # Add as a new layer
            self.active_layers.append(layer_path)
        
        # Update active layers listbox
        self.update_active_layers_listbox()
        
        # Update the preview
        self.update_preview()
    
    def update_active_layers_listbox(self):
        """Update the active layers listbox"""
        self.active_layers_listbox.delete(0, tk.END)
        
        for layer_path in self.active_layers:
            category = os.path.basename(os.path.dirname(layer_path))
            layer_name = os.path.basename(layer_path)
            self.active_layers_listbox.insert(tk.END, f"{category}: {layer_name}")
    
    def update_preview(self):
        """Update the character preview by compositing all active layers"""
        if not self.base_image:
            return
        
        # Start with a copy of the base image
        composite = self.base_image.copy()
        
        # Composite all active layers in order
        for layer_path in self.active_layers:
            try:
                layer = Image.open(layer_path)
                # Ensure layer has the same size as base image
                if layer.size != composite.size:
                    layer = layer.resize(composite.size)
                
                # Use alpha compositing to overlay the layer
                if layer.mode == 'RGBA':
                    composite = Image.alpha_composite(composite.convert("RGBA"), layer)
                else:
                    # If the layer doesn't have an alpha channel, convert it
                    composite.paste(layer, (0, 0), layer.convert("RGBA"))
            except Exception as e:
                print(f"Error compositing layer {layer_path}: {e}")
        
        # Store the current composite for saving/exporting
        self.current_composite = composite
        
        # Resize for display if needed
        display_size = (350, 350)
        aspect_ratio = composite.width / composite.height
        
        if aspect_ratio > 1:  # Wider than tall
            display_width = min(composite.width, display_size[0])
            display_height = int(display_width / aspect_ratio)
        else:  # Taller than wide
            display_height = min(composite.height, display_size[1])
            display_width = int(display_height * aspect_ratio)
        
        display_image = composite.resize((display_width, display_height), Image.LANCZOS)
        
        # Convert to PhotoImage and display
        photo = ImageTk.PhotoImage(display_image)
        self.preview_canvas.delete("all")
        self.preview_canvas.create_image(display_size[0]//2, display_size[1]//2, image=photo)
        self.preview_canvas.photo = photo  # Keep a reference to prevent garbage collection
    
    def add_category(self):
        """Add a new layer category"""
        if not self.current_character:
            messagebox.showerror("Error", "No character selected")
            return
        
        category = tk.simpledialog.askstring("Add Category", "Enter category name:")
        if not category:
            return
        
        # Sanitize category name
        safe_category = re.sub(r'[^\w\s-]', '', category).strip()
        if not safe_category:
            messagebox.showerror("Error", "Invalid category name")
            return
        
        # Check if category already exists
        if safe_category in self.config.get("categories", []):
            messagebox.showerror("Error", f"Category '{safe_category}' already exists")
            return
        
        # Create category directory
        category_dir = os.path.join(self.base_dir, self.current_character, safe_category)
        os.makedirs(category_dir, exist_ok=True)
        
        # Update config
        if "categories" not in self.config:
            self.config["categories"] = []
        self.config["categories"].append(safe_category)
        
        config_path = os.path.join(self.base_dir, self.current_character, "character.json")
        with open(config_path, 'w') as f:
            json.dump(self.config, f, indent=4)
        
        # Update category listbox
        self.category_listbox.insert(tk.END, safe_category)
    
    def remove_category(self):
        """Remove the selected category"""
        selection = self.category_listbox.curselection()
        if not selection:
            messagebox.showerror("Error", "No category selected")
            return
        
        category = self.category_listbox.get(selection[0])
        
        # Don't allow removing the Base category
        if category == "Base":
            messagebox.showerror("Error", "Cannot remove the Base category")
            return
        
        # Confirm deletion
        if not messagebox.askyesno("Confirm", f"Are you sure you want to delete the '{category}' category and all its layers?"):
            return
        
        # Remove category directory
        category_dir = os.path.join(self.base_dir, self.current_character, category)
        if os.path.exists(category_dir):
            shutil.rmtree(category_dir)
        
        # Update config
        self.config["categories"].remove(category)
        if category in self.config.get("default_layers", {}):
            del self.config["default_layers"][category]
        
        config_path = os.path.join(self.base_dir, self.current_character, "character.json")
        with open(config_path, 'w') as f:
            json.dump(self.config, f, indent=4)
        
        # Update category listbox
        self.category_listbox.delete(selection[0])
        
        # Remove from active layers if present
        updated_active_layers = []
        for layer_path in self.active_layers:
            if not os.path.dirname(layer_path).endswith(category):
                updated_active_layers.append(layer_path)
        
        self.active_layers = updated_active_layers
        self.update_active_layers_listbox()
        self.update_preview()
    
    def add_layer_item(self):
        """Add a new layer item by importing a PNG"""
        selection = self.category_listbox.curselection()
        if not selection:
            messagebox.showerror("Error", "No category selected")
            return
        
        category = self.category_listbox.get(selection[0])
        self.import_layer_png(category)
    
    def import_layer_png(self, category=None):
        """Import a PNG as a new layer"""
        if not self.current_character:
            messagebox.showerror("Error", "No character selected")
            return
        
        if not category:
            selection = self.category_listbox.curselection()
            if not selection:
                messagebox.showerror("Error", "No category selected")
                return
            category = self.category_listbox.get(selection[0])
        
        file_path = filedialog.askopenfilename(
            title="Select PNG Image",
            filetypes=[("PNG files", "*.png"), ("All files", "*.*")]
        )
        
        if not file_path:
            return
        
        # Check if it's a valid PNG
        try:
            img = Image.open(file_path)
            if img.format != "PNG":
                messagebox.showerror("Error", "Selected file is not a valid PNG image")
                return
            
            # If this is a base image, check dimensions or prompt to resize
            if category == "Base" and self.base_image is not None:
                if img.size != self.base_image.size:
                    if messagebox.askyesno("Size Mismatch", 
                                        f"The image size ({img.width}x{img.height}) doesn't match the base image size " +
                                        f"({self.base_image.width}x{self.base_image.height}). Resize to match?"):
                        img = img.resize(self.base_image.size)
            
            # Copy the file to the category directory
            dest_dir = os.path.join(self.base_dir, self.current_character, category)
            os.makedirs(dest_dir, exist_ok=True)
            
            # Get a name for the layer
            filename = os.path.basename(file_path)
            layer_name = tk.simpledialog.askstring("Layer Name", "Enter layer name (without extension):", 
                                                initialvalue=os.path.splitext(filename)[0])
            
            if not layer_name:
                return
            
            # Sanitize filename
            safe_name = re.sub(r'[^\w\s-]', '', layer_name).strip() + ".png"
            
            # Save the image
            dest_path = os.path.join(dest_dir, safe_name)
            img.save(dest_path)
            
            # If this is the first base image, set it as our base
            if category == "Base" and self.base_image is None:
                self.base_image = img
                self.update_preview()
            
            # Refresh layer items view
            self.populate_layer_items(category)
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to import image: {str(e)}")
    
    def move_layer_up(self):
        """Move the selected layer up in the order"""
        selection = self.active_layers_listbox.curselection()
        if not selection or selection[0] == 0:
            return
        
        idx = selection[0]
        self.active_layers[idx], self.active_layers[idx-1] = self.active_layers[idx-1], self.active_layers[idx]
        self.update_active_layers_listbox()
        self.active_layers_listbox.selection_set(idx-1)
        self.update_preview()
    
    def move_layer_down(self):
        """Move the selected layer down in the order"""
        selection = self.active_layers_listbox.curselection()
        if not selection or selection[0] == len(self.active_layers) - 1:
            return
        
        idx = selection[0]
        self.active_layers[idx], self.active_layers[idx+1] = self.active_layers[idx+1], self.active_layers[idx]
        self.update_active_layers_listbox()
        self.active_layers_listbox.selection_set(idx+1)
        self.update_preview()
    
    def remove_active_layer(self):
        """Remove the selected layer from active layers"""
        selection = self.active_layers_listbox.curselection()
        if not selection:
            return
        
        # Remove the layer
        idx = selection[0]
        del self.active_layers[idx]
        
        # Update the listbox
        self.update_active_layers_listbox()
        
        # Update the preview
        self.update_preview()
    
    def save_character(self):
        """Save the current character configuration with active layers"""
        if not self.current_character:
            messagebox.showerror("Error", "No character selected")
            return
        
        # Update default layers in config
        self.config["default_layers"] = {}
        
        for layer_path in self.active_layers:
            category = os.path.basename(os.path.dirname(layer_path))
            layer_name = os.path.basename(layer_path)
            self.config["default_layers"][category] = layer_name
        
        # Save config
        config_path = os.path.join(self.base_dir, self.current_character, "character.json")
        with open(config_path, 'w') as f:
            json.dump(self.config, f, indent=4)
        
        messagebox.showinfo("Success", "Character configuration saved successfully")
    
    def export_png(self):
        """Export the current composite as a PNG file"""
        if not self.current_composite:
            messagebox.showerror("Error", "No character to export")
            return
        
        file_path = filedialog.asksaveasfilename(
            title="Export Character",
            defaultextension=".png",
            filetypes=[("PNG files", "*.png")]
        )
        
        if not file_path:
            return
        
        try:
            self.current_composite.save(file_path)
            messagebox.showinfo("Success", f"Character exported successfully to {file_path}")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to export character: {str(e)}")

if __name__ == "__main__":
    root = tk.Tk()
    app = CharacterCreator(root)
    root.mainloop()