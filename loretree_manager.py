import tkinter as tk
from tkinter import ttk
import json
import ttkbootstrap as ttk_boot
from constants import *

class LoreTreeManager:
    def __init__(self, parent_frame, lore_manager, status_var, logger):
        """Initialize Lore Tree Manager as a view component."""
        try:
            self.logger = logger
            self.logger.log_step("Starting LoreTreeManager initialization")
            
            self.parent_frame = parent_frame
            self.lore_manager = lore_manager  # Reference to the main lore manager
            self.status_var = status_var
            
            # Create main container
            self.main_frame = ttk_boot.Frame(self.parent_frame)
            self.main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
            
            # Create button frame at the top
            button_frame = ttk_boot.Frame(self.main_frame)
            button_frame.pack(side=tk.TOP, fill=tk.X, pady=5)
            
            # Create buttons using ttkbootstrap
            ttk_boot.Button(
                button_frame,
                text="Add Item",
                command=lambda: self.lore_manager.add_lore_item(),
                bootstyle="success",
                width=12
            ).pack(side=tk.LEFT, padx=2)
            
            ttk_boot.Button(
                button_frame,
                text="Import TSV",
                command=lambda: self.lore_manager.import_csv(),
                bootstyle="secondary",
                width=12
            ).pack(side=tk.LEFT, padx=2)
            
            # Create treeview with scrollbar
            tree_frame = ttk_boot.Frame(self.main_frame)
            tree_frame.pack(fill=tk.BOTH, expand=True)
            
            # Configure bootstrap style
            style = ttk_boot.Style()
            # Configure the custom style based on default treeview
            style.configure(
                "custom.Treeview",
                rowheight=80,  # Set larger row height
                padding=16,
                background=COLORS['PANEL_BACKGROUND'],
                fieldbackground=COLORS['PANEL_BACKGROUND_DARK']
            )
            
            # Configure the item style (this affects the actual rows)
            style.configure(
                "custom.Treeview.Item",
                padding=10,
                height=80
            )
            
            # Create treeview with updated styling
            self.tree = ttk_boot.Treeview(
                tree_frame,
                bootstyle="custom",  # Use our custom style
                columns=("key", "content"),
                show="headings",
                selectmode="extended"
            )
            
            # Configure columns
            self.tree.heading("key", text="Key")
            self.tree.heading("content", text="Content")
            self.tree.column("key", width=300, minwidth=200)
            self.tree.column("content", width=700, minwidth=400)
            
            # Create scrollbars
            vsb = ttk_boot.Scrollbar(
                tree_frame, 
                orient="vertical", 
                command=self.tree.yview,
                bootstyle="rounded"
            )
            hsb = ttk_boot.Scrollbar(
                tree_frame, 
                orient="horizontal", 
                command=self.tree.xview,
                bootstyle="rounded"
            )
            self.tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
            
            # Grid layout for treeview and scrollbars
            self.tree.grid(row=0, column=0, sticky="nsew")
            vsb.grid(row=0, column=1, sticky="ns")
            hsb.grid(row=1, column=0, sticky="ew")
            
            # Configure grid weights
            tree_frame.grid_rowconfigure(0, weight=1)
            tree_frame.grid_columnconfigure(0, weight=1)
            
            # Bind events
            self.tree.bind("<Delete>", self.delete_selected)
            self.tree.bind("<Double-1>", self.show_detail_modal)
            
            # Force row height after widget creation
            self.tree.configure(style="custom.Treeview")
            
        except Exception as e:
            self.logger.log_step(f"Error initializing LoreTreeManager: {str(e)}")
            raise

    def truncate_text(self, text, max_length=100):
        """Truncate text and add ellipsis if needed."""
        return text if len(text) <= max_length else text[:max_length-3] + "..."

    def refresh_view(self, json_data=None):
        """Refresh the treeview with current data from lore manager."""
        try:
            # Clear existing items
            for item in self.tree.get_children():
                self.tree.delete(item)
            
            # Get JSON data through lore manager if not provided
            if json_data is None:
                json_str = self.lore_manager.json_text.get("1.0", "end-1c").strip()
                if not json_str:  # Check for empty JSON
                    return
                    
                try:
                    json_data = json.loads(json_str)
                except json.JSONDecodeError:
                    return
            
            # Get character book entries
            character_book = json_data.get('character_book')
            if not character_book:
                character_book = json_data.get('data', {}).get('character_book')
            
            if not character_book:
                return
                
            entries = character_book.get('entries', [])
            
            # Insert entries into treeview
            for entry in entries:
                key_str = ', '.join(entry.get('keys', []))
                content = entry.get('content', '')
                
                # Insert with truncated text
                self.tree.insert(
                    "",
                    "end",
                    values=(
                        self.truncate_text(key_str),
                        self.truncate_text(content)
                    )
                )
            
            self.logger.log_step(f"Refreshed treeview with {len(entries)} entries")
            
        except Exception as e:
            self.logger.log_step(f"Error refreshing tree view: {str(e)}")
            raise

    def delete_selected(self, event=None):
        """Delete selected items through lore manager."""
        selected = self.tree.selection()
        if not selected:
            return
            
        # Confirm deletion
        count = len(selected)
        if not MessageDialog.ask_yes_no(
            f"Are you sure you want to delete {count} item{'s' if count > 1 else ''}?",
            "Confirm Delete"
        ):
            return
            
        try:
            # Get indices to delete
            indices_to_delete = []
            for item_id in selected:
                idx = self.tree.index(item_id)
                indices_to_delete.append(idx)
            
            # Delete through lore manager in reverse order
            for idx in sorted(indices_to_delete, reverse=True):
                self.lore_manager.widget_manager.delete_entry(idx)
            
            # Update the JSON in widget_manager which will trigger full refresh
            self.lore_manager.widget_manager.update_json()
            
            # Update status
            self.status_var.set(f"Deleted {count} item{'s' if count > 1 else ''}")
            
        except Exception as e:
            self.logger.log_step(f"Error deleting items: {str(e)}")
            raise

    def show_detail_modal(self, event):
        """Show detail modal for editing selected item through lore manager."""
        # Get selected item
        selection = self.tree.selection()
        if not selection:
            return
            
        # Get item data
        item = selection[0]
        idx = self.tree.index(item)
        
        # TODO: Implement detail modal using lore manager's data
        pass