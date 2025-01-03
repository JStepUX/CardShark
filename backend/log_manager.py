import os
import json
from datetime import datetime

class LogManager:
    def __init__(self):
        """Initialize logging system."""
        # Create logs directory if needed
        os.makedirs('logs', exist_ok=True)
        
        # Set up log filename with timestamp
        self.log_filename = f"logs/cardshark_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        
        # Clean up old logs first
        self.cleanup_old_logs()
        
        # Initialize new log file
        self.start_new_log()
        
    def cleanup_old_logs(self):
        """Delete all but the most recent log file."""
        try:
            log_files = []
            for filename in os.listdir('logs'):
                if filename.startswith('cardshark_log_') and filename.endswith('.txt'):
                    filepath = os.path.join('logs', filename)
                    creation_time = os.path.getctime(filepath)
                    log_files.append((creation_time, filepath))
            
            # Sort by creation time (newest first)
            log_files.sort(reverse=True)
            
            # Keep most recent file, delete the rest
            for _, filepath in log_files[1:]:
                try:
                    os.remove(filepath)
                except Exception as e:
                    print(f"Error deleting log file {filepath}: {e}")
                    
        except Exception as e:
            print(f"Error during log cleanup: {e}")

    def start_new_log(self):
        """Initialize a new log file with header."""
        try:
            with open(self.log_filename, 'w', encoding='utf-8') as f:
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                f.write(f"=== CardShark Server Log Started at {timestamp} ===\n\n")
        except Exception as e:
            print(f"Error creating log file: {e}")

    def log_step(self, message, data=None):
        """Log a step with optional data."""
        try:
            # Create timestamp
            timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            
            # Format the log message
            log_message = f"[{timestamp}] {message}\n"
            
            # Add data if provided
            if data is not None:
                if isinstance(data, (dict, list)):
                    # Format JSON data with indentation
                    formatted_data = json.dumps(data, indent=2, ensure_ascii=False)
                    log_message += f"Data:\n{formatted_data}\n"
                else:
                    # For non-JSON data, just convert to string
                    log_message += f"Data: {str(data)}\n"
            
            # Write to file
            with open(self.log_filename, 'a', encoding='utf-8') as f:
                f.write(log_message)
                f.write("\n")  # Extra newline for readability
                
            # Also print to console for immediate feedback
            print(log_message.strip())
            
        except Exception as e:
            print(f"Error writing to log: {e}")

    def log_warning(self, message):
        """Log a warning message."""
        self.log_step(f"WARNING: {message}")

    def log_error(self, message, error=None):
        """Log an error with optional exception details."""
        try:
            timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            separator = "!" * 40
            
            error_message = f"\n{separator}\n"
            error_message += f"[{timestamp}] ERROR: {message}\n"
            if error:
                error_message += f"Exception: {str(error)}\n"
            error_message += f"{separator}\n"
            
            # Write to file
            with open(self.log_filename, 'a', encoding='utf-8') as f:
                f.write(error_message)
            
            # Print to console
            print(error_message)
                
        except Exception as e:
            print(f"Error logging error: {e}")