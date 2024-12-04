import tkinter as tk
from tkinter import ttk
import ttkbootstrap as ttk_boot
from constants import *
from text_manager import text_manager

class PersonalityManager:
    def __init__(self, parent_frame, text_config, logger):
        """Initialize Personality Manager with required UI elements and logger."""
        self.parent_frame = parent_frame
        self.text_config = text_config
        self.logger = logger
        
        # Create container for fields
        self.fields_container = ttk.Frame(self.parent_frame)
        self.fields_container.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        # Create personality text area
        personality_frame = ttk.Frame(self.fields_container)
        personality_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        
        ttk.Label(
            personality_frame,
            text="Character Personality:",
            font=FONTS['DEFAULT']
        ).pack(anchor=tk.W, pady=(0, 5))
        
        self.personality_text = text_manager.create_text_widget(
            personality_frame,
            height=8,
        )
        self.personality_text.pack(fill=tk.BOTH, expand=True)
        
        # Create scenario text area
        scenario_frame = ttk.Frame(self.fields_container)
        scenario_frame.pack(fill=tk.BOTH, expand=True)
        
        ttk.Label(
            scenario_frame,
            text="Scenario:",
            font=FONTS['DEFAULT']
        ).pack(anchor=tk.W, pady=(0, 5))
        
        self.scenario_text = text_manager.create_text_widget(
            scenario_frame,
            height=8,
        )
        self.scenario_text.pack(fill=tk.BOTH, expand=True)

    def update_fields(self, json_data):
        """Update fields from JSON data."""
        try:
            # Clear existing fields
            self.personality_text.delete('1.0', tk.END)
            self.scenario_text.delete('1.0', tk.END)
            
            if json_data.get('spec') == 'chara_card_v2':
                char_data = json_data.get('data', {})
                
                # Update personality and scenario
                self.personality_text.insert('1.0', char_data.get('personality', ''))
                self.scenario_text.insert('1.0', char_data.get('scenario', ''))
                
        except Exception as e:
            self.logger.log_step(f"Error updating personality fields: {str(e)}")
            raise

    def get_field_data(self):
        """Get data from all fields."""
        try:
            return {
                'personality': self.personality_text.get('1.0', 'end-1c').strip(),
                'scenario': self.scenario_text.get('1.0', 'end-1c').strip()
            }
            
        except Exception as e:
            self.logger.log_step(f"Error getting personality data: {str(e)}")
            raise