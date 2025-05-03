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
        # Basic sanitization to prevent path traversal and ensure safe filenames
        import re
        sanitized = re.sub(r'[^\w\-]', '_', world_name)
        if not sanitized:
            self.logger.log_warning(f"Invalid world name provided: {world_name}")
            sanitized = "unnamed_world"
        return sanitized

    def _get_world_path(self, world_name: str) -> Path:
        """Gets the path to a specific world's directory."""
        return self._worldcards_base_dir / self._sanitize_world_name(world_name)

    def _get_world_state_file_path(self, world_name: str) -> Path:
        """Gets the path to the world_state.json file for a specific world."""
        world_dir = self._get_world_path(world_name)
        return world_dir / "world_state.json"

    def _check_alternate_paths(self, world_name: str) -> Optional[Path]:
        """Checks for alternate paths where the world state might be stored.
        This handles cases where frontend and backend might use different paths."""
        sanitized_name = self._sanitize_world_name(world_name)
        
        # List of potential alternative locations
        alternate_paths = [
            # Frontend worlds directory (common in development)
            Path.cwd() / "frontend" / "worlds" / sanitized_name / "world_state.json",
            # Backend worlds in development
            Path.cwd() / "backend" / "worlds" / sanitized_name / "world_state.json",
            # Root directory worlds (relative path)
            Path.cwd() / "worlds" / sanitized_name / "world_state.json"
        ]
        
        # Add additional path patterns here if needed
        
        for path in alternate_paths:
            if path.exists() and path.is_file():
                self.logger.log_step(f"Found world state at alternate path: {path}")
                return path
                
        return None

    def list_worlds(self) -> List[Dict[str, Any]]:
        """Lists available worlds by checking subdirectories."""
        worlds = []
        
        # Ensure world directory exists
        self._worldcards_base_dir.mkdir(parents=True, exist_ok=True)
        
        # Also check frontend worlds directory if it exists
        alt_paths = [
            Path.cwd() / "frontend" / "worlds",
            Path.cwd() / "backend" / "worlds",
            Path.cwd() / "worlds"
        ]
        
        paths_to_check = [self._worldcards_base_dir] + [p for p in alt_paths if p.exists()]
        self.logger.log_step(f"Checking for worlds in {len(paths_to_check)} directories")
        
        # Get all world directories from all potential locations
        for base_dir in paths_to_check:
            try:
                for world_dir in base_dir.iterdir():
                    if world_dir.is_dir():
                        world_name = world_dir.name
                        state_file = world_dir / "world_state.json"
                        
                        if state_file.exists():
                            # Load basic world info
                            try:
                                with open(state_file, 'r', encoding='utf-8') as f:
                                    state = json.load(f)
                                    
                                # Get counts of connected and unconnected locations
                                location_count = len(state.get("locations", {}))
                                unconnected_count = len(state.get("unconnected_locations", {}))
                                
                                # Construct world info
                                world_info = {
                                    "name": state.get("name", world_name),
                                    "location_count": location_count,
                                    "unconnected_location_count": unconnected_count,
                                    "base_character_id": state.get("base_character_id"),
                                    # You might want to extract base_character_name from actual character file later
                                    "base_character_name": os.path.basename(state.get("base_character_id", "")) if state.get("base_character_id") else None,
                                    "last_modified_date": os.path.getmtime(state_file),
                                    "path": str(world_dir),
                                }
                                
                                # Skip duplicates
                                if not any(w["name"] == world_info["name"] for w in worlds):
                                    worlds.append(world_info)
                                    self.logger.log_step(f"Found world: {world_name} with {location_count} locations")
                            except Exception as e:
                                self.logger.log_warning(f"Error loading world state for '{world_name}': {e}")
            except Exception as e:
                self.logger.log_error(f"Error listing worlds in {base_dir}: {e}")
        
        return worlds

    def load_world_state(self, world_name: str) -> WorldState:
        """Loads the WorldState from its JSON file."""
        state_file = self._get_world_state_file_path(world_name)
        
        # If the file doesn't exist in the primary location, check alternative paths
        if not state_file.exists():
            self.logger.log_warning(f"World state file not found at primary path: {state_file}")
            alt_path = self._check_alternate_paths(world_name)
            
            if alt_path:
                self.logger.log_step(f"Found world state at alternate path: {alt_path}")
                state_file = alt_path
            else:
                self.logger.log_error(f"World state file not found for: {world_name}")
                raise CardSharkError(ErrorMessages.WORLD_NOT_FOUND.format(world_name=world_name), ErrorType.WORLD_NOT_FOUND)

        try:
            with open(state_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Ensure connected=true is properly set on all locations
            if 'locations' in data:
                for key, loc in data['locations'].items():
                    # If connected is not explicitly false, ensure it's true
                    if loc.get('connected') != False:
                        loc['connected'] = True
            
            # Log the number of locations found (for debugging)
            location_count = len(data.get('locations', {}))
            self.logger.log_step(f"Loaded world state with {location_count} locations")
                
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
                
            # Also save to frontend worlds directory if it exists (for development environments)
            frontend_worlds_dir = Path.cwd() / "frontend" / "worlds"
            if frontend_worlds_dir.exists():
                frontend_world_dir = frontend_worlds_dir / self._sanitize_world_name(world_name)
                frontend_world_dir.mkdir(parents=True, exist_ok=True)
                frontend_state_file = frontend_world_dir / "world_state.json"
                
                with open(frontend_state_file, 'w', encoding='utf-8') as f:
                    json.dump(state_dict, f, indent=2)
                self.logger.log_step(f"Also saved world state to frontend path: {frontend_state_file}")

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
            self.logger.log_step(f"Extracting locations from character lore...")
            unconnected_locations_list = self.extract_locations_from_lore(character_metadata)
            self.logger.log_step(f"Found {len(unconnected_locations_list)} locations in character lore")
            
            # 4. Place all locations on map in a grid pattern around the starting location
            # Initialize with starting room at origin
            locations_dict = {"0,0,0": start_location}
            
            # Use fixed grid positioning to place locations around the origin
            # Create a grid (adjusting size based on number of locations)
            grid_size = max(5, int(1 + (len(unconnected_locations_list) / 4) ** 0.5 * 2))  # Dynamic grid size
            self.logger.log_step(f"Using grid size {grid_size}x{grid_size} for {len(unconnected_locations_list)} locations")
            
            grid_positions = []
            
            # Generate a grid with origin at center
            for x in range(-grid_size//2, grid_size//2 + 1):
                for y in range(-grid_size//2, grid_size//2 + 1):
                    # Skip the origin (0,0,0) which is already occupied
                    if not (x == 0 and y == 0):
                        grid_positions.append((x, y, 0))
            
            # Sort positions by distance from origin for more logical placement
            grid_positions.sort(key=lambda pos: abs(pos[0]) + abs(pos[1]))
            
            # Place each extracted location on the grid - ENSURING they are all connected/active
            self.logger.log_step(f"Placing {len(unconnected_locations_list)} locations on a {grid_size}x{grid_size} grid")
            
            for i, loc in enumerate(unconnected_locations_list):
                if i < len(grid_positions):
                    # Get coordinates from our pre-calculated grid
                    x, y, z = grid_positions[i]
                    coord_str = f"{x},{y},{z}"
                    
                    # Create a fully connected location - EXPLICITLY setting connected=True
                    new_location = Location(
                        name=loc.name,
                        coordinates=[x, y, z],
                        location_id=loc.location_id,
                        description=loc.description or f"A location associated with {char_actual_name}.",
                        introduction=f"You have arrived at {loc.name}. {loc.description}" if loc.description else f"You have arrived at {loc.name}, a location associated with {char_actual_name}.",
                        lore_source=loc.lore_source,
                        connected=True,  # CRITICAL: This must be True for active locations!
                        zone_id=None,
                        room_type=None,
                        notes=None,
                        background=None,
                        events=[],
                        npcs=[]
                    )
                    
                    # Add to the locations dictionary
                    locations_dict[coord_str] = new_location
                    self.logger.log_step(f"Placed location '{loc.name}' at coordinates {coord_str} (connected=True)")
                else:
                    # If we run out of grid positions, log a warning
                    self.logger.log_warning(f"No more grid positions available for location '{loc.name}'")
                    # Could implement a secondary grid or extension mechanism here if needed
            
            # 5. Create the initial WorldState with all locations properly placed and connected
            initial_state = WorldState(
                name=sanitized_name,
                version="1.0",  # Add explicit version for future compatibility
                current_position="0,0,0",
                locations=locations_dict,
                visited_positions=["0,0,0"],
                unconnected_locations={},  # No unconnected locations - all are placed on the map
                player=PlayerState(),
                base_character_id=str(char_path)  # Store character file path as reference
            )
            
            self.logger.log_step(f"Created world state with {len(locations_dict)} active locations")
            self.logger.log_step(f"Sanity check - all locations connected: {all(loc.connected for loc in locations_dict.values())}")

            # 6. Save the initial state
            world_success = self.save_world_state(sanitized_name, initial_state)
            if not world_success:
                raise CardSharkError(f"Failed to save initial world state for '{sanitized_name}' from character", ErrorType.PROCESSING_ERROR)
            
            # 7. Copy the character PNG to world_card.png in the world directory
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

    def _auto_place_locations(self, location_list: List[UnconnectedLocation], existing_locations: Dict[str, Location] = None) -> Dict[str, Location]:
        """
        Automatically places extracted lore locations on the coordinate grid in a structured pattern.
        Uses a grid-based placement strategy, starting from the origin and moving outward.
        
        Args:
            location_list: List of UnconnectedLocation objects to place
            existing_locations: Dictionary of already placed locations (coordinate string -> Location)
            
        Returns:
            Updated dictionary with all locations placed
        """
        if existing_locations is None:
            existing_locations = {}
        
        # Import math module for grid calculations
        import math
        
        result_locations = dict(existing_locations)  # Create a copy to avoid modifying the original
        
        self.logger.log_step(f"DEBUG: Auto-placing {len(location_list)} locations in a spiral pattern")
        
        # Define a spiral pattern - we'll place locations in concentric rings around the origin
        # Start with a simple ring pattern to ensure reasonable spacing
        
        # Precalculated coordinates in a spiral pattern around the origin
        # Order from closest to origin outward, skipping (0,0,0) which is already occupied
        spiral_coords = [
            # Inner ring
            (1, 0, 0), (1, 1, 0), (0, 1, 0), (-1, 1, 0), (-1, 0, 0), (-1, -1, 0), (0, -1, 0), (1, -1, 0),
            # Second ring
            (2, 0, 0), (2, 1, 0), (2, 2, 0), (1, 2, 0), (0, 2, 0), (-1, 2, 0), (-2, 2, 0), (-2, 1, 0),
            (-2, 0, 0), (-2, -1, 0), (-2, -2, 0), (-1, -2, 0), (0, -2, 0), (1, -2, 0), (2, -2, 0), (2, -1, 0),
            # Extend to third ring if needed
            (3, 0, 0), (3, 1, 0), (3, 2, 0), (3, 3, 0), (2, 3, 0), (1, 3, 0), (0, 3, 0), (-1, 3, 0), 
            (-2, 3, 0), (-3, 3, 0), (-3, 2, 0), (-3, 1, 0), (-3, 0, 0), (-3, -1, 0), (-3, -2, 0), (-3, -3, 0),
            (-2, -3, 0), (-1, -3, 0), (0, -3, 0), (1, -3, 0), (2, -3, 0), (3, -3, 0), (3, -2, 0), (3, -1, 0),
        ]
        
        # If we have more locations than precalculated coordinates, generate additional ones
        extra_coords = []
        if len(location_list) > len(spiral_coords):
            # Generate coordinates on the 4th and 5th rings
            for r in range(4, 6):  # 4th and 5th rings
                # Top and bottom edges
                for x in range(-r, r+1):
                    extra_coords.append((x, r, 0))    # Top edge
                    extra_coords.append((x, -r, 0))   # Bottom edge
                # Left and right edges (excluding corners already added)
                for y in range(-(r-1), r):
                    extra_coords.append((r, y, 0))    # Right edge
                    extra_coords.append((-r, y, 0))   # Left edge
            
            # Append to spiral coordinates
            spiral_coords.extend(extra_coords)
        
        # Ensure we have enough coordinates for all locations
        if len(location_list) > len(spiral_coords):
            # Fall back to simple grid-based positioning if we need even more
            self.logger.log_warning(f"More locations ({len(location_list)}) than predefined coordinates ({len(spiral_coords)}). Adding grid positions.")
            grid_size = int(math.ceil(math.sqrt(len(location_list))))
            for x in range(-grid_size, grid_size+1):
                for y in range(-grid_size, grid_size+1):
                    if (x, y, 0) not in spiral_coords and (x != 0 or y != 0):
                        spiral_coords.append((x, y, 0))
        
        # Track which coordinates have been used
        used_coords = {coord_str: True for coord_str in result_locations.keys()}
        
        # Place each location at the next available position in our spiral
        for i, loc in enumerate(location_list):
            coord_idx = 0
            while coord_idx < len(spiral_coords):
                coordinates = list(spiral_coords[coord_idx])
                coord_str = ",".join(map(str, coordinates))
                
                # Check if this position is already occupied
                if coord_str not in used_coords:
                    break  # Found an available position
                
                coord_idx += 1
                
            if coord_idx >= len(spiral_coords):
                # We ran out of predefined positions, generate a random one
                self.logger.log_warning(f"Ran out of predefined positions for location {loc.name}, using random coordinates")
                import random
                while True:
                    random_x = random.randint(-5, 5)
                    random_y = random.randint(-5, 5)
                    random_z = 0
                    coord_str = f"{random_x},{random_y},{random_z}"
                    if coord_str not in used_coords and (random_x != 0 or random_y != 0):
                        coordinates = [random_x, random_y, random_z]
                        break
            
            # Mark this position as used
            used_coords[coord_str] = True
            
            # Convert UnconnectedLocation to proper Location
            new_location = Location(
                name=loc.name,
                coordinates=coordinates,
                location_id=loc.location_id,
                description=loc.description,
                introduction=f"You have arrived at {loc.name}. {loc.description}",
                lore_source=loc.lore_source,
                connected=True,
                zone_id=None,
                room_type=None,
                notes=None,
                background=None,
                events=[],
                npcs=[]
            )
            
            # Add to the locations dictionary
            result_locations[coord_str] = new_location
            self.logger.log_step(f"Placed location '{loc.name}' at coordinates {coord_str}")
        
        self.logger.log_step(f"Successfully placed {len(location_list)} locations on the map")
        return result_locations

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