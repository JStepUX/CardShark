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
        """Saves the state for a specific world and writes v2 Character Card PNGs for world and rooms."""
        try:
            file_path = self._get_world_state_path(world_name)
            # Ensure the directory exists
            file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=2)
            self.logger.log_step(f"World state for '{world_name}' saved to {file_path}")

            # --- Write World v2 Character Card PNG ---
            world_dir = file_path.parent
            world_png_path = world_dir / "World.png"
            world_metadata = {
                "name": state.get("name", world_name),
                "description": state.get("description", ""),
                "type": "world",
                "spec": "chara_card_v2",
                "rooms": [r.get("id") for r in state.get("rooms", [])]
            }
            world_image_path = state.get("image_path") or str(world_dir / "World.png")
            if not Path(world_image_path).exists():
                # Use a placeholder PNG if none exists
                world_image_path = str(Path(__file__).parent / "../default_room.png")
            self.png_handler.save_with_metadata(
                world_image_path,
                str(world_png_path),
                world_metadata
            )
            self.logger.log_step(f"World v2 Character Card PNG written to {world_png_path}")

            # --- Write Room v2 Character Card PNGs ---
            rooms = state.get("rooms", [])
            rooms_dir = world_dir / "rooms"
            rooms_dir.mkdir(parents=True, exist_ok=True)
            for room in rooms:
                room_id = room.get("id")
                if not room_id:
                    continue
                room_png_path = rooms_dir / f"{room_id}.png"
                room_metadata = {
                    "id": room_id,
                    "name": room.get("name", "Unnamed Room"),
                    "description": room.get("description", ""),
                    "type": "room",
                    "spec": "chara_card_v2",
                }
                room_image_path = room.get("image_path") or str(Path(__file__).parent / "../default_room.png")
                if not Path(room_image_path).exists():
                    room_image_path = str(Path(__file__).parent / "../default_room.png")
                self.png_handler.save_with_metadata(
                    room_image_path,
                    str(room_png_path),
                    room_metadata
                )
                self.logger.log_step(f"Room v2 Character Card PNG written to {room_png_path}")
            return True
        except Exception as e:
            self.logger.log_error(f"Error saving world state for '{world_name}': {str(e)}")
            self.logger.log_error(traceback.format_exc()) # Add traceback
            return False
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
