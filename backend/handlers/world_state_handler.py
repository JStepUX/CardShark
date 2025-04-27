# backend/handlers/world_state_handler.py
# Description: Handles loading, saving, and manipulation of World Card states.

import json
import os
import sys
import traceback
from pathlib import Path
from typing import Dict, Any, Optional, List

# Assuming SettingsManager is available or passed appropriately
# from ..settings_manager import SettingsManager
from ..models.world_state import WorldState, Location, UnconnectedLocation, PlayerState
from ..png_metadata_handler import PngMetadataHandler # Reuse PNG handler for character reading
from ..errors import CardSharkError, ErrorType, ErrorMessages

# Placeholder for LocationExtractor - will be implemented in Phase 1.5
# from ..utils.location_extractor import LocationExtractor

class WorldStateHandler:
    def __init__(self, logger, settings_manager, worlds_path=None):
        """
        Initializes the WorldStateHandler.

        Args:
            logger: The logger instance.
            settings_manager: The settings manager instance.
            worlds_path: Optional explicit path to the worlds directory
        """
        self.logger = logger
        self.settings_manager = settings_manager
        self.png_handler = PngMetadataHandler(logger) # For reading character cards
        from backend.utils.location_extractor import LocationExtractor # Use absolute import
        self.location_extractor = LocationExtractor(logger) # Now implemented
        self._worldcards_base_dir = worlds_path if worlds_path else self._get_worldcards_dir()
        self.logger.log_step(f"WorldStateHandler initialized. Base directory: {self._worldcards_base_dir}")
        
        # Ensure the worlds directory exists
        if self._worldcards_base_dir:
            Path(self._worldcards_base_dir).mkdir(parents=True, exist_ok=True)

    def _get_worldcards_dir(self) -> Path:
        """Gets the base directory for storing world card data."""
        try:
            # Use setting, default to './worlds' if not set
            relative_path = self.settings_manager.get_setting("worldcards_directory") or "worlds"

            if getattr(sys, 'frozen', False):
                # If running as PyInstaller bundle
                base_dir = Path(sys.executable).parent
            else:
                # If running from source (assuming script is run from project root)
                base_dir = Path.cwd()

            worldcards_dir = (base_dir / relative_path).resolve()
            worldcards_dir.mkdir(parents=True, exist_ok=True)
            self.logger.log_step(f"Resolved worldcards directory: {worldcards_dir}")
            return worldcards_dir
        except Exception as e:
            self.logger.log_error(f"Error determining worldcards directory: {e}")
            self.logger.log_error(traceback.format_exc())
            # Fallback to a default relative path in case of error
            fallback_dir = Path.cwd() / "worlds"
            fallback_dir.mkdir(parents=True, exist_ok=True)
            return fallback_dir

    def _sanitize_world_name(self, world_name: str) -> str:
        """Sanitizes a world name to be safe for directory/file names."""
        # Basic sanitization: remove potentially problematic characters
        # Allow letters, numbers, underscores, hyphens, spaces
        sanitized = "".join(c for c in world_name if c.isalnum() or c in ('-', '_', ' '))
        # Replace spaces with underscores for better compatibility
        sanitized = sanitized.replace(' ', '_').strip()
        # Prevent empty names
        return sanitized if sanitized else "unnamed_world"

    def _get_world_path(self, world_name: str) -> Path:
        """Gets the path to a specific world's directory."""
        sanitized_name = self._sanitize_world_name(world_name)
        world_dir = self._worldcards_base_dir / sanitized_name
        world_dir.mkdir(parents=True, exist_ok=True)
        return world_dir

    def _get_world_state_file_path(self, world_name: str) -> Path:
        """Gets the path to the world_state.json file for a specific world."""
        world_dir = self._get_world_path(world_name)
        return world_dir / "world_state.json"

    def list_worlds(self) -> List[Dict[str, Any]]:
        """Lists available worlds by checking subdirectories."""
        worlds = []
        if not self._worldcards_base_dir or not self._worldcards_base_dir.exists():
            self.logger.log_warning("Worldcards base directory does not exist.")
            return []

        for item in self._worldcards_base_dir.iterdir():
            if item.is_dir():
                state_file = item / "world_state.json"
                if state_file.exists():
                    try:
                        # Basic metadata - enhance later if needed
                        metadata = {
                            "name": item.name, # Use directory name as world name
                            "last_modified": datetime.fromtimestamp(state_file.stat().st_mtime).isoformat()
                        }
                        # Try to load more metadata from the state file itself
                        with open(state_file, 'r', encoding='utf-8') as f:
                            state_data = json.load(f)
                            metadata["base_character_id"] = state_data.get("base_character_id")
                            metadata["location_count"] = len(state_data.get("locations", {}))
                            metadata["unconnected_location_count"] = len(state_data.get("unconnected_locations", {}))
                            # Add base character name if possible (requires reading character)
                            # metadata["base_character_name"] = self._get_char_name(state_data.get("base_character_id"))

                        worlds.append(metadata)
                    except Exception as e:
                        self.logger.log_error(f"Error reading metadata for world '{item.name}': {e}")
        return worlds

    def load_world_state(self, world_name: str) -> WorldState:
        """Loads the WorldState from its JSON file."""
        state_file = self._get_world_state_file_path(world_name)
        if not state_file.exists():
            self.logger.log_error(f"World state file not found for: {world_name}")
            raise CardSharkError(ErrorMessages.WORLD_NOT_FOUND.format(world_name=world_name), ErrorType.WORLD_NOT_FOUND)

        try:
            with open(state_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            # Validate and parse with Pydantic
            world_state = WorldState(**data)
            self.logger.log_step(f"Successfully loaded world state for: {world_name}")
            return world_state
        except json.JSONDecodeError as e:
            self.logger.log_error(f"Invalid JSON in world state file for {world_name}: {e}")
            raise CardSharkError(ErrorMessages.WORLD_STATE_INVALID.format(error=f"Invalid JSON: {e}"), ErrorType.WORLD_STATE_INVALID)
        except Exception as e: # Catch Pydantic validation errors too
            self.logger.log_error(f"Error loading or validating world state for {world_name}: {e}")
            self.logger.log_error(traceback.format_exc())
            raise CardSharkError(ErrorMessages.WORLD_STATE_INVALID.format(error=str(e)), ErrorType.WORLD_STATE_INVALID)

    def save_world_state(self, world_name: str, state: WorldState) -> bool:
        """Saves the WorldState to its JSON file."""
        state_file = self._get_world_state_file_path(world_name)
        try:
            # Validate state with Pydantic before saving (implicitly done by converting to dict)
            state_dict = state.dict()

            # Ensure necessary directories exist
            state_file.parent.mkdir(parents=True, exist_ok=True)

            with open(state_file, 'w', encoding='utf-8') as f:
                json.dump(state_dict, f, indent=2)

            self.logger.log_step(f"Successfully saved world state for: {world_name}")
            return True
        except Exception as e: # Catch Pydantic validation errors and file errors
            self.logger.log_error(f"Error saving world state for {world_name}: {e}")
            self.logger.log_error(traceback.format_exc())
            # Potentially raise a specific error or return False
            return False

    def initialize_empty_world_state(self, world_name: str, creator_name: str = "User") -> WorldState:
        """Creates and saves an initial world_state.json with a starting location."""
        self.logger.log_step(f"Initializing empty world state for: {world_name}")
        sanitized_name = self._sanitize_world_name(world_name)

        # Define the starting location
        start_location = Location(
            name="Origin Point",
            coordinates=[0, 0, 0],
            location_id="origin_0_0_0", # Unique ID for the starting location
            description="A neutral starting point in the void. The world unfolds from here.",
            introduction="You find yourself in a featureless void. The only point of reference is the spot where you stand.", # Added default introduction
            connected=True
        )

        # Create the initial WorldState
        initial_state = WorldState(
            name=sanitized_name, # Use sanitized name internally
            current_position="0,0,0",
            locations={"0,0,0": start_location},
            visited_positions=["0,0,0"]
            # player state uses default factory
            # unconnected_locations uses default factory
        )

        # Save the initial state
        if self.save_world_state(sanitized_name, initial_state):
             self.logger.log_step(f"Successfully initialized and saved empty world: {sanitized_name}")
             return initial_state
        else:
             self.logger.log_error(f"Failed to save initial empty world state for: {sanitized_name}")
             # Decide on error handling: raise exception or return None?
             raise CardSharkError(f"Failed to initialize world {sanitized_name}", ErrorType.PROCESSING_ERROR)


    def initialize_from_character(self, world_name: str, character_file_path: str) -> WorldState:
        """Creates a world state based on a character card, extracting lore locations."""
        self.logger.log_step(f"Initializing world '{world_name}' from character: {character_file_path}")
        sanitized_name = self._sanitize_world_name(world_name)

        try:
            # 1. Read character data from PNG - handling possible paths
            char_path = Path(character_file_path)
            
            # Try multiple approaches to find the character file
            possible_paths = [
                char_path,  # Try as-is first (might be absolute)
                Path.cwd() / character_file_path,  # Relative to current working directory
            ]
            
            # Try character directory from settings if available
            char_dir_setting = self.settings_manager.get_setting("character_directory")
            if char_dir_setting:
                char_dir = Path(char_dir_setting)
                # Try both direct path and just the filename
                possible_paths.append(char_dir / character_file_path)
                if "/" in character_file_path or "\\" in character_file_path:
                    # Also try just the filename portion if path contains slashes
                    filename = Path(character_file_path).name
                    possible_paths.append(char_dir / filename)
            
            # Check all possible paths
            found = False
            for path in possible_paths:
                if path.exists():
                    self.logger.log_step(f"Found character file at: {path}")
                    char_path = path
                    found = True
                    break
                    
            if not found:
                # If we get here, the file couldn't be found in any expected location
                self.logger.log_error(f"Character file not found: {character_file_path}")
                self.logger.log_error(f"Tried paths: {', '.join(str(p) for p in possible_paths)}")
                raise CardSharkError(f"Character file not found: {character_file_path}", ErrorType.FILE_NOT_FOUND)

            # 2. Use PngMetadataHandler to read character data
            self.logger.log_step(f"Reading metadata from character file: {char_path}")
            character_metadata = self.png_handler.read_metadata(str(char_path))
            if not character_metadata or 'data' not in character_metadata:
                self.logger.log_error(f"Failed to read metadata from character file: {char_path}")
                raise CardSharkError(f"Failed to read metadata from character: {character_file_path}", ErrorType.METADATA_ERROR)

            character_data = character_metadata['data']
            char_actual_name = character_data.get("name", "Unnamed Character")
            char_description = character_data.get("description", "No description provided.")
            # Get character UUID if available
            char_uuid = character_metadata.get('uuid', '')

            # Create starter location at [0,0,0] based on character
            start_location = Location(
                name=f"{char_actual_name}'s Starting Point",
                coordinates=[0, 0, 0],
                location_id=f"origin_{char_uuid if char_uuid else 'char'}_0_0_0",
                description=f"The journey begins, inspired by {char_actual_name}. {char_description}",
                introduction=f"You are at the starting point associated with {char_actual_name}. {char_description}",
                connected=True,
                npcs=[str(char_path)]  # Add character file path as NPC reference
            )

            # 3. Extract potential locations from character lore
            unconnected_locations_list = self.extract_locations_from_lore(character_metadata)
            unconnected_locations_dict = {loc.location_id: loc for loc in unconnected_locations_list}

            # 4. Create the initial WorldState
            initial_state = WorldState(
                name=sanitized_name,
                current_position="0,0,0",
                locations={"0,0,0": start_location},
                visited_positions=["0,0,0"],
                unconnected_locations=unconnected_locations_dict,
                base_character_id=str(char_path)  # Store character file path as reference
                # player state uses default factory
            )

            # 5. Save the initial state
            world_success = self.save_world_state(sanitized_name, initial_state)
            if not world_success:
                raise CardSharkError(f"Failed to save initial world state for '{sanitized_name}' from character", ErrorType.PROCESSING_ERROR)
            
            # 6. Copy the character PNG to world_card.png in the world directory
            world_dir = self._get_world_path(sanitized_name)
            world_card_path = world_dir / "world_card.png"
            
            try:
                import shutil
                self.logger.log_step(f"Copying character image to world card: {world_card_path}")
                shutil.copy2(str(char_path), str(world_card_path))
                self.logger.log_step(f"Successfully copied character image to world card")
            except Exception as copy_error:
                self.logger.log_error(f"Error copying character image to world card: {copy_error}")
                self.logger.log_error(traceback.format_exc())
                # Continue execution - this is not fatal, we'll fall back to a default image
            
            self.logger.log_step(f"Successfully initialized world '{sanitized_name}' from character '{char_actual_name}'")
            return initial_state

        except CardSharkError as cse:
            self.logger.log_error(f"CardSharkError initializing from character: {cse}")
            raise cse  # Re-raise specific errors
        except Exception as e:
            self.logger.log_error(f"Unexpected error initializing world '{world_name}' from character: {e}")
            self.logger.log_error(traceback.format_exc())
            raise CardSharkError(f"Failed to initialize world from character: {e}", ErrorType.PROCESSING_ERROR)


    def extract_locations_from_lore(self, character_data: Dict) -> List[UnconnectedLocation]:
        """Extracts potential locations from character lore entries."""
        self.logger.log_step("Extracting locations from character lore...")
        try:
            # Use the LocationExtractor utility to extract locations
            locations = self.location_extractor.extract_from_lore(character_data)
            self.logger.log_step(f"Successfully extracted {len(locations)} potential locations from lore.")
            return locations
        except Exception as e:
            self.logger.log_error(f"Error extracting locations from lore: {e}")
            self.logger.log_error(traceback.format_exc())
            # Raise specific error for location extraction failure
            raise CardSharkError(ErrorMessages.LOCATION_EXTRACTION_FAILED.format(error=str(e)), ErrorType.LOCATION_EXTRACTION_FAILED)


    def connect_location(self, world_name: str, location_id: str, coordinates: List[int]) -> bool:
        """Moves a location from unconnected_locations to locations, assigning coordinates."""
        self.logger.log_step(f"Attempting to connect location '{location_id}' at coordinates {coordinates} in world '{world_name}'")
        try:
            state = self.load_world_state(world_name)

            if location_id not in state.unconnected_locations:
                self.logger.log_warning(f"Location ID '{location_id}' not found in unconnected locations for world '{world_name}'.")
                return False # Or raise error?

            unconnected_loc = state.unconnected_locations.pop(location_id)

            # Convert coordinates list to string key "x,y,z"
            coord_str = ",".join(map(str, coordinates))

            if coord_str in state.locations:
                # Coordinate conflict - cannot connect here
                self.logger.log_warning(f"Coordinate conflict: Location already exists at {coord_str} in world '{world_name}'. Cannot connect '{location_id}'.")
                # Put the location back into unconnected
                state.unconnected_locations[location_id] = unconnected_loc
                # Maybe raise a specific error? For now, return False
                return False

            # Create a new Location object from the UnconnectedLocation data
            new_location = Location(
                name=unconnected_loc.name,
                coordinates=coordinates,
                location_id=unconnected_loc.location_id, # Keep the same ID
                description=unconnected_loc.description,
                introduction=unconnected_loc.description, # Default introduction to description
                lore_source=unconnected_loc.lore_source,
                connected=True,
                # Copy other relevant fields if they existed or add defaults
                zone_id=None,
                room_type=None,
                notes=None,
                background=None,
                events=[],
                npcs=[],
                explicit_exits={}
            )

            # Add to the main locations dictionary
            state.locations[coord_str] = new_location

            # Save the updated state
            success = self.save_world_state(world_name, state)
            if success:
                self.logger.log_step(f"Successfully connected location '{location_id}' at {coord_str} in world '{world_name}'.")
            else:
                self.logger.log_error(f"Failed to save state after connecting location '{location_id}' in world '{world_name}'.")
                # Attempt to revert? Complex. For now, log error.

            return success

        except CardSharkError as cse:
             self.logger.log_error(f"CardSharkError connecting location: {cse}")
             # Re-raise or handle appropriately
             return False
        except Exception as e:
            self.logger.log_error(f"Unexpected error connecting location '{location_id}' in world '{world_name}': {e}")
            self.logger.log_error(traceback.format_exc())
            return False

    def delete_world(self, world_name: str) -> bool:
        """Deletes a world directory and all its contents."""
        try:
            # Sanitize world name for security
            sanitized_name = self._sanitize_world_name(world_name)
            if not sanitized_name:
                raise ValueError("Invalid world name provided.")
            
            world_dir = self._get_world_path(sanitized_name)
            
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

# Helper function (consider moving to utils if used elsewhere)
from datetime import datetime