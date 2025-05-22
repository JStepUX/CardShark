import json
import traceback
import re # Import re for sanitization
import os
import uuid
from pathlib import Path
from typing import Dict, Any, Optional, Union, List

class WorldStateManager:
    def __init__(self, logger):
        self.logger = logger
        self.worlds_base_dir = Path(__file__).parent.parent / "worlds" # Base directory for all worlds
        
    def _get_world_dir(self, world_name: str) -> Path:
        """Gets the directory for a specific world with path sanitization."""
        # Basic sanitization to prevent path traversal
        safe_world_name = re.sub(r'[^\w\-]+', '_', world_name)
        if not safe_world_name:
            raise ValueError("Invalid world name provided.")
        return self.worlds_base_dir / safe_world_name

    def _get_world_state_path(self, world_name: str) -> Path:
        """Constructs the path to the world state JSON file."""
        world_dir = self._get_world_dir(world_name)
        return world_dir / "world_state.json"

    def _get_world_metadata_path(self, world_name: str) -> Path:
        """Constructs the path to the world metadata JSON file."""
        world_dir = self._get_world_dir(world_name)
        return world_dir / "metadata.json"

    def _validate_world_state(self, state: Dict[str, Any]) -> bool:
        """Validates that the world state contains required fields."""
        # Basic validation - can be expanded based on schema requirements
        required_fields = ["metadata"]
        for field in required_fields:
            if field not in state:
                self.logger.log_error(f"World state validation failed: missing required field '{field}'")
                return False
        return True

    def _validate_world_state_file(self, file_path: Path) -> bool:
        """Validates that a world state file contains valid JSON and required fields."""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                state = json.load(f)
            return self._validate_world_state(state)
        except json.JSONDecodeError:
            self.logger.log_error(f"World state file validation failed: invalid JSON in {file_path}")
            return False
        except Exception as e:
            self.logger.log_error(f"World state file validation failed: {str(e)}")
            return False

    def save_world_state(self, world_name: str, state: Dict[str, Any]) -> bool:
        """Saves the state for a specific world using atomic file operations."""
        try:
            # Ensure the world directory exists
            world_dir = self._get_world_dir(world_name)
            world_dir.mkdir(parents=True, exist_ok=True)
            
            # Create subdirectories according to the specified structure
            (world_dir / "images" / "backgrounds").mkdir(parents=True, exist_ok=True)
            (world_dir / "images" / "objects").mkdir(parents=True, exist_ok=True)
            (world_dir / "chats").mkdir(parents=True, exist_ok=True)
            (world_dir / "events").mkdir(parents=True, exist_ok=True)
            
            # Path to world state file
            state_file = self._get_world_state_path(world_name)
            
            # Create temporary file with unique name
            temp_file = world_dir / f"world_state.{uuid.uuid4()}.tmp"
            
            # Add version information if not present
            if "metadata" not in state:
                state["metadata"] = {}
            if "version" not in state["metadata"]:
                state["metadata"]["version"] = "1.0"
            state["metadata"]["last_modified"] = int(__import__("time").time())
            
            try:
                # Write state to temporary file
                with open(temp_file, 'w', encoding='utf-8') as f:
                    json.dump(state, f, indent=2)
                
                # Validate the temporary file
                if not self._validate_world_state_file(temp_file):
                    raise ValueError("World state validation failed")
                
                # Create backup of existing file if it exists
                if state_file.exists():
                    backup_file = world_dir / f"world_state.backup.{uuid.uuid4()}.json"
                    os.replace(state_file, backup_file)
                    self.logger.log_step(f"Created backup of world state at {backup_file}")
                
                # Atomic replace (os.replace is atomic within the same filesystem)
                os.replace(temp_file, state_file)
                self.logger.log_step(f"World state for '{world_name}' saved to {state_file}")
                
                return True
            except Exception as e:
                self.logger.log_error(f"Failed to save world state: {str(e)}")
                # Clean up temporary file if it exists
                if temp_file.exists():
                    temp_file.unlink()
                return False
        except Exception as e:
            self.logger.log_error(f"Error saving world state for '{world_name}': {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False

    def load_world_state(self, world_name: str) -> Dict[str, Any]:
        """Loads the state for a specific world with validation."""
        try:
            file_path = self._get_world_state_path(world_name)
            if not file_path.exists():
                self.logger.log_warning(f"World state file not found for '{world_name}' at {file_path}")
                return {} # Return empty dict if world state doesn't exist yet
            
            with open(file_path, "r", encoding="utf-8") as f:
                state = json.load(f)
            
            # Validate the loaded state
            if not self._validate_world_state(state):
                self.logger.log_warning(f"World state validation failed for '{world_name}', attempting to recover")
                return self._recover_world_state(world_name)
            
            self.logger.log_step(f"World state for '{world_name}' loaded successfully from {file_path}")
            return state
        except json.JSONDecodeError:
            self.logger.log_error(f"Invalid JSON in world state file for '{world_name}'")
            return self._recover_world_state(world_name)
        except Exception as e:
            self.logger.log_error(f"Error loading world state for '{world_name}': {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return {}

    def _recover_world_state(self, world_name: str) -> Dict[str, Any]:
        """Attempts to recover world state from the most recent backup."""
        try:
            world_dir = self._get_world_dir(world_name)
            backup_files = list(world_dir.glob("world_state.backup.*.json"))
            
            if not backup_files:
                self.logger.log_warning(f"No backup files found for '{world_name}'")
                return {}
            
            # Sort by modification time, newest first
            backup_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            
            # Try to load from each backup until one succeeds
            for backup_file in backup_files:
                try:
                    with open(backup_file, "r", encoding="utf-8") as f:
                        state = json.load(f)
                    if self._validate_world_state(state):
                        self.logger.log_step(f"Successfully recovered world state for '{world_name}' from {backup_file}")
                        return state
                except Exception:
                    continue
            
            self.logger.log_error(f"Failed to recover world state for '{world_name}' from any backup")
            return {}
        except Exception as e:
            self.logger.log_error(f"Error recovering world state for '{world_name}': {str(e)}")
            return {}

    def save_world_metadata(self, world_name: str, metadata: Dict[str, Any]) -> bool:
        """Saves metadata for a specific world using atomic file operations."""
        try:
            world_dir = self._get_world_dir(world_name)
            world_dir.mkdir(parents=True, exist_ok=True)
            
            metadata_file = self._get_world_metadata_path(world_name)
            temp_file = world_dir / f"metadata.{uuid.uuid4()}.tmp"
            
            # Add version and timestamp
            if "version" not in metadata:
                metadata["version"] = "1.0"
            metadata["last_modified"] = int(__import__("time").time())
            
            try:
                # Write metadata to temporary file
                with open(temp_file, 'w', encoding='utf-8') as f:
                    json.dump(metadata, f, indent=2)
                
                # Create backup of existing file if it exists
                if metadata_file.exists():
                    backup_file = world_dir / f"metadata.backup.{uuid.uuid4()}.json"
                    os.replace(metadata_file, backup_file)
                
                # Atomic replace
                os.replace(temp_file, metadata_file)
                self.logger.log_step(f"World metadata for '{world_name}' saved to {metadata_file}")
                
                return True
            except Exception as e:
                self.logger.log_error(f"Failed to save world metadata: {str(e)}")
                if temp_file.exists():
                    temp_file.unlink()
                return False
        except Exception as e:
            self.logger.log_error(f"Error saving world metadata for '{world_name}': {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False

    def load_world_metadata(self, world_name: str) -> Dict[str, Any]:
        """Loads metadata for a specific world."""
        try:
            file_path = self._get_world_metadata_path(world_name)
            if not file_path.exists():
                self.logger.log_warning(f"World metadata file not found for '{world_name}' at {file_path}")
                return {}
            
            with open(file_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)
            
            self.logger.log_step(f"World metadata for '{world_name}' loaded successfully")
            return metadata
        except Exception as e:
            self.logger.log_error(f"Error loading world metadata for '{world_name}': {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return {}

    def get_world_list(self) -> List[Dict[str, Any]]:
        """Returns a list of all available worlds with their metadata."""
        try:
            worlds = []
            
            # Ensure worlds directory exists
            self.worlds_base_dir.mkdir(parents=True, exist_ok=True)
            
            # Get all directories in the worlds base directory
            for world_dir in self.worlds_base_dir.iterdir():
                if not world_dir.is_dir():
                    continue
                    
                world_name = world_dir.name
                metadata_path = world_dir / "metadata.json"
                state_path = world_dir / "world_state.json"
                
                # Basic world info
                world_info = {"name": world_name}
                
                # Add metadata if available
                if metadata_path.exists():
                    try:
                        with open(metadata_path, "r", encoding="utf-8") as f:
                            metadata = json.load(f)
                        world_info.update(metadata)
                    except Exception:
                        pass
                
                # Add state info if available
                if state_path.exists():
                    try:
                        with open(state_path, "r", encoding="utf-8") as f:
                            state = json.load(f)
                        if "metadata" in state:
                            # Allow state metadata to overwrite metadata.json metadata
                            world_info.update(state["metadata"])
                    except Exception:
                        pass
                
                worlds.append(world_info)
            
            return worlds
        except Exception as e:
            self.logger.log_error(f"Error getting world list: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return []

    def delete_world(self, world_name: str) -> bool:
        """Deletes a world directory and all its contents."""
        try:
            world_dir = self._get_world_dir(world_name)
            
            # Check if the directory exists
            if not world_dir.exists() or not world_dir.is_dir():
                self.logger.log_warning(f"World directory not found for '{world_name}' at {world_dir}")
                return False
            
            # Recursively delete the directory and all its contents
            import shutil
            shutil.rmtree(world_dir)
            
            self.logger.log_step(f"World '{world_name}' deleted successfully from {world_dir}")
            return True
        except Exception as e:
            self.logger.log_error(f"Error deleting world '{world_name}': {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return False
