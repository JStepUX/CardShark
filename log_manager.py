import os
import base64
import json
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from PIL import Image, PngImagePlugin
import re
from datetime import datetime, timezone
import random
import string
import time

class LogManager:
    def __init__(self, debug_text_widget):
        self.debug_text = debug_text_widget
        self.current_operation = None
        self.operation_start_time = None
        self.last_loaded_base64 = None  # Store the last loaded BASE64
        
        if not os.path.exists('logs'):
            os.makedirs('logs')
            
        # Clean up old log files
        self.cleanup_old_logs()
            
        self.log_filename = f"logs/cardshark_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        
        with open(self.log_filename, 'w', encoding='utf-8') as f:
            f.write(f"=== CardShark Log Started at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ===\n\n")
    
    def cleanup_old_logs(self):
        """Delete all but the most recent log file."""
        try:
            # Get list of all log files
            log_files = []
            for filename in os.listdir('logs'):
                if filename.startswith('cardshark_log_') and filename.endswith('.txt'):
                    filepath = os.path.join('logs', filename)
                    creation_time = os.path.getctime(filepath)
                    log_files.append((creation_time, filepath))
            
            # Sort by creation time (newest first)
            log_files.sort(reverse=True)
            
            # Keep the most recent file, delete the rest
            for _, filepath in log_files[1:]:
                try:
                    os.remove(filepath)
                except Exception as e:
                    print(f"Error deleting log file {filepath}: {e}")
                    
        except Exception as e:
            print(f"Error during log cleanup: {e}")

    def _write_to_file(self, message):
        """Write message to log file."""
        try:
            with open(self.log_filename, 'a', encoding='utf-8') as f:
                f.write(message)
        except Exception as e:
            self.debug_text.delete(1.0, tk.END)
            self.debug_text.insert(tk.END, f"Error writing to log file: {str(e)}")
    
    def start_operation(self, operation_name):
        """Start a new logging operation."""
        self.current_operation = operation_name
        self.operation_start_time = datetime.now()
        separator = "=" * 50
        message = f"\n{separator}\n{operation_name} - Started at {self.operation_start_time.strftime('%H:%M:%S')}\n{separator}\n"
        self._write_to_file(message)
        
        # Update debug window with current operation
        self.debug_text.delete(1.0, tk.END)
        self.debug_text.insert(tk.END, f"Current Operation: {operation_name}\nSee {self.log_filename} for details")
        
    def end_operation(self):
        """End the current logging operation."""
        if self.operation_start_time:
            duration = datetime.now() - self.operation_start_time
            separator = "-" * 50
            message = f"\n{separator}\n{self.current_operation} - Completed at {datetime.now().strftime('%H:%M:%S')}\n"
            message += f"Duration: {duration.total_seconds():.2f}s\n{separator}\n\n"
            self._write_to_file(message)
        
        self.current_operation = None
        self.operation_start_time = None
        
    def log_step(self, message, data=None):
        """Log a step in the current operation."""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        operation_prefix = f"[{self.current_operation}] " if self.current_operation else ""
        
        # Format the log message
        log_message = f"[{timestamp}] {operation_prefix}{message}\n"
        
        # Add data if provided
        if data is not None:
            if isinstance(data, (dict, list)):
                # Format JSON data with indentation
                formatted_data = json.dumps(data, indent=2, ensure_ascii=False)
                log_message += f"Data:\n{formatted_data}\n\n"
            else:
                # For non-JSON data, just convert to string
                log_message += f"Data: {str(data)}\n\n"
        
        # Write to file
        self._write_to_file(log_message)
        
        # Update debug window with current step
        self.debug_text.delete(1.0, tk.END)
        self.debug_text.insert(tk.END, f"Current Step: {message}\nSee {self.log_filename} for details")
        
    def log_json_comparison(self, title, before, after):
        """Log a before/after comparison of JSON data."""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        separator = "-" * 30
        
        message = f"\n{separator}\n[{timestamp}] {title}\n{separator}\n\n"
        message += "BEFORE:\n"
        message += json.dumps(before, indent=2, ensure_ascii=False)
        message += "\n\nAFTER:\n"
        message += json.dumps(after, indent=2, ensure_ascii=False)
        message += f"\n\n{separator}\n"
        
        self._write_to_file(message)
        
        # Update debug window
        self.debug_text.delete(1.0, tk.END)
        self.debug_text.insert(tk.END, f"Logged comparison: {title}\nSee {self.log_filename} for details")

    def log_data_state(self, label, data, encoding=None):
        """Log the current state of data during processing."""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        separator = "-" * 40
        
        message = f"\n{separator}\n[{timestamp}] Data State: {label}\n{separator}\n"
        
        if encoding == "base64":
            message += f"Encoding: {encoding}\n"
            message += f"First 100 chars: {data[:100]}...\n"
            message += f"Length: {len(data)} characters\n\n"
        else:
            if isinstance(data, str):
                message += data
            else:
                message += json.dumps(data, indent=4, ensure_ascii=False)
        message += f"\n{separator}\n"
        
        self._write_to_file(message)
    
    def log_data_comparison(self, title, before, after, context=None):
        """Log a detailed comparison of data states."""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        separator = "=" * 40
        
        message = f"\n{separator}\n[{timestamp}] Data Comparison: {title}\n"
        if context:
            message += f"Context: {context}\n"
        message += f"{separator}\n\n"
        
        message += "BEFORE:\n"
        message += json.dumps(before, indent=2, ensure_ascii=False)
        message += "\n\nAFTER:\n"
        message += json.dumps(after, indent=2, ensure_ascii=False)
        message += f"\n\n{separator}\n"
        
        self._write_to_file(message)