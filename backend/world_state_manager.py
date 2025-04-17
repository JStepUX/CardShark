import json
import traceback
import re # Import re for sanitization
from pathlib import Path
from typing import Dict, Any

class WorldStateManager:
    def __init__(self, logger):
        self.logger = logger
        self.worlds_base_dir = Path(__file__).parent.parent / "worlds" # Base directory for all worlds

    def _get_world_state_path(self, world_name: str) -> Path:
        """Constructs the path to the world state JSON file."""
        # Basic sanitization to prevent path traversal
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise ValueError("Invalid world name provided.")
        world_dir = self.worlds_base_dir / safe_world_name
        return world_dir / "world_state.json"
    def save_world_state(self, world_name: str, state: Dict[str, Any]) -> bool:
        """Saves the state for a specific world."""
        try:
            file_path = self._get_world_state_path(world_name)
            # Ensure the directory exists
            file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=2)
            self.logger.log_step(f"World state for '{world_name}' saved to {file_path}")
            return True
        except Exception as e:
            self.logger.log_error(f"Error saving world state for '{world_name}': {str(e)}")
            self.logger.log_error(traceback.format_exc()) # Add traceback
            return False

    def load_world_state(self, world_name: str) -> Dict[str, Any]:
        """Loads the state for a specific world."""
        try:
            file_path = self._get_world_state_path(world_name)
            if not file_path.exists():
                self.logger.log_warning(f"World state file not found for '{world_name}' at {file_path}")
                return {} # Return empty dict if world state doesn't exist yet
            with open(file_path, "r", encoding="utf-8") as f:
                self.logger.log_step(f"World state for '{world_name}' loaded from {file_path}")
                return json.load(f)
        except Exception as e:
            self.logger.log_error(f"Error loading world state for '{world_name}': {str(e)}")
            self.logger.log_error(traceback.format_exc()) # Add traceback
            return {}
