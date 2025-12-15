import json
import re
import math
import random
import uuid
from typing import Dict, Any, Optional, List, Tuple, Union
from pathlib import Path

from backend.models.character_data import CharacterData
from backend.models.world_state import WorldState, Location, UnconnectedLocation, PlayerState
from backend.services.character_service import CharacterService
from backend.log_manager import LogManager
from backend.world_asset_handler import WorldAssetHandler
from backend.utils.location_extractor import LocationExtractor
from backend.errors import CardSharkError, ErrorType, ErrorMessages

class WorldCardHandler:
    """
    Business logic for World Cards.
    Wraps CharacterService to handle World-specific extensions and assets.
    """
    
    def __init__(self, character_service: CharacterService, asset_handler: WorldAssetHandler, logger: LogManager):
        self.character_service = character_service
        self.asset_handler = asset_handler
        self.logger = logger
        self.location_extractor = LocationExtractor(logger)

    def _get_character_by_identifier(self, identifier: str) -> Optional[Any]:
        """Helper to find character by UUID or Name (World Name)."""
        # 1. Try UUID
        try:
            with self.character_service.db_session_generator() as db:
                char = self.character_service.get_character_by_uuid(identifier, db)
                if char: return char
        except Exception:
            pass

        # 2. Try Name (World Name in extension or Character Name)
        # This is expensive as we iterate. Ideally we rely on UUIDs.
        chars = self.character_service.get_all_characters()
        for char in chars:
            # Check character name
            if char.name == identifier:
                return char
            
            # Check world_data name
            try:
                extensions = json.loads(char.extensions_json) if char.extensions_json else {}
                world_data = extensions.get("world_data")
                if world_data and world_data.get("name") == identifier:
                    return char
            except:
                continue
        return None

    def list_worlds(self) -> List[Dict[str, Any]]:
        """Lists available world cards."""
        characters = self.character_service.get_all_characters()
        worlds = []
        for char in characters:
            try:
                extensions = json.loads(char.extensions_json) if char.extensions_json else {}
                # Check if it's a world card
                if extensions.get("card_type") == "world" or "world_data" in extensions:
                    world_data = extensions.get("world_data", {})
                    world_name = world_data.get("name", char.name)
                    
                    # Count locations
                    locs = world_data.get("locations", {})
                    loc_count = len(locs) if isinstance(locs, dict) else 0
                    
                    # Count unconnected locations
                    unconnected = world_data.get("unconnected_locations", {})
                    unconnected_count = len(unconnected) if isinstance(unconnected, dict) else 0
                    
                    # Base character info
                    base_char_name = world_data.get("base_character_name")
                    if not base_char_name and world_data.get("base_character_id"):
                        # Try to extract name from ID if it's a path or filename
                        base_char_name = Path(world_data.get("base_character_id")).stem

                    world_info = {
                        "name": world_name,
                        "character_uuid": char.character_uuid,
                        "location_count": loc_count,
                        "unconnected_location_count": unconnected_count,
                        "base_character_name": base_char_name,
                        "path": char.png_file_path,
                        "last_modified_date": char.updated_at.timestamp() if char.updated_at else 0
                    }
                    worlds.append(world_info)
            except Exception as e:
                # self.logger.log_error(f"Error parsing world card {char.name}: {e}")
                continue
        return worlds

    def get_world_state(self, world_identifier: str) -> Optional[Union[WorldState, Dict[str, Any]]]:
        """Retrieves the WorldState from a character card."""
        character = self._get_character_by_identifier(world_identifier)
        if not character:
            return None
        
        try:
            extensions = json.loads(character.extensions_json) if character.extensions_json else {}
            world_data_dict = extensions.get("world_data")
            
            if not world_data_dict:
                return None
            
            # Ensure name exists (legacy data might miss it)
            if "name" not in world_data_dict:
                world_data_dict["name"] = character.name

            # Check if it's legacy data (has 'rooms')
            if "rooms" in world_data_dict:
                # Return raw dict for legacy support
                return world_data_dict
            
            # Validate with Pydantic
            return WorldState(**world_data_dict)
        except Exception as e:
            self.logger.log_error(f"Error loading world state for {world_identifier}: {e}")
            return None

    def save_world_state(self, world_identifier: str, state: WorldState) -> bool:
        """Saves the WorldState to the character card."""
        character = self._get_character_by_identifier(world_identifier)
        if not character:
            self.logger.log_warning(f"Character not found for world: {world_identifier}")
            return False
            
        try:
            extensions = json.loads(character.extensions_json) if character.extensions_json else {}
            extensions["card_type"] = "world"
            extensions["world_data"] = state.dict()
            
            # Update character via service
            update_data = {"extensions": extensions}
            # Also update name if world name changed
            if state.name != character.name:
                update_data["name"] = state.name
                
            self.character_service.update_character(character.character_uuid, update_data)
            return True
        except Exception as e:
            self.logger.log_error(f"Failed to save world state for {world_identifier}: {e}")
            return False

    def create_world(self, world_name: str, character_path: Optional[str] = None) -> Optional[Dict]:
        """Creates a new world card (Character with world_data)."""
        self.logger.log_step(f"Creating world '{world_name}'")
        
        try:
            initial_state = None
            
            if character_path:
                # Import character logic similar to WorldStateHandler
                self.logger.log_step(f"Initializing from character: {character_path}")
                initial_state = self._initialize_from_character(world_name, character_path)
            else:
                # Empty world
                self.logger.log_step("Initializing empty world")
                initial_state = self._initialize_empty_world_state(world_name)
            
            if not initial_state:
                return None

            # Now create the actual Character Card
            # If we initialized from character, we might want to use that character's image and base data
            # But _initialize_from_character just returns WorldState object.
            
            # We need to construct the character data
            char_data = {
                "name": world_name,
                "description": f"World: {world_name}",
                "tags": ["world"],
                "extensions": {
                    "card_type": "world",
                    "world_data": initial_state.dict()
                },
                "spec_version": "2.0"
            }
            
            # Use a default image or the one from character_path
            image_bytes = None
            original_filename = f"{world_name}.png"
            
            if character_path and Path(character_path).exists():
                 with open(character_path, "rb") as f:
                     image_bytes = f.read()
                     # We should probably preserve original character metadata too if we are "converting"
                     # But for now, let's just make a world card.
            else:
                # Create default image
                from PIL import Image
                import io
                default_img = Image.new('RGB', (512, 512), color='darkblue')
                img_buffer = io.BytesIO()
                default_img.save(img_buffer, format='PNG')
                image_bytes = img_buffer.getvalue()

            # Save the new card
            saved_char = self.character_service.save_uploaded_character_card(
                raw_character_card_data={"data": char_data},
                image_bytes=image_bytes,
                original_filename=original_filename
            )
            
            if saved_char:
                return {
                    "name": saved_char.name,
                    "character_uuid": saved_char.character_uuid,
                    "path": saved_char.png_file_path
                }
            return None

        except Exception as e:
            self.logger.log_error(f"Error creating world: {e}")
            return None

    def delete_world(self, world_identifier: str) -> bool:
        """Deletes a world card."""
        character = self._get_character_by_identifier(world_identifier)
        if not character:
            return False
        return self.character_service.delete_character(character.character_uuid, delete_png_file=True)

    # --- Logic adapted from WorldStateHandler ---

    def _initialize_empty_world_state(self, world_name: str) -> WorldState:
        """Creates an initial WorldState with a starting location."""
        start_location = Location(
            name="Origin Point",
            coordinates=[0, 0, 0],
            location_id="origin_0_0_0",
            description="A neutral starting point in the void. The world unfolds from here.",
            introduction="You find yourself in a featureless void. The only point of reference is the spot where you stand.",
            connected=True
        )

        return WorldState(
            name=world_name,
            current_position="0,0,0",
            locations={"0,0,0": start_location},
            visited_positions=["0,0,0"]
        )

    def _initialize_from_character(self, world_name: str, character_identifier: str) -> Optional[WorldState]:
        """Creates a world state based on a character card, extracting lore locations."""
        try:
            # Try to resolve character first
            char_path = None
            
            # 1. Try finding character in DB by identifier (UUID or Name)
            character = self._get_character_by_identifier(character_identifier)
            if character and character.png_file_path:
                char_path = Path(character.png_file_path)
            
            # 2. If not found, check if it's a direct path
            if not char_path:
                 maybe_path = Path(character_identifier)
                 if maybe_path.exists():
                     char_path = maybe_path
                 else:
                     # Check in characters directory
                     from backend.utils.path_utils import resolve_directory_path, get_application_base_path
                     # Try relative to characters dir
                     base_char_dir = get_application_base_path() / "characters"
                     check_path = base_char_dir / character_identifier
                     if check_path.exists():
                         char_path = check_path
                     elif (base_char_dir / f"{character_identifier}.png").exists():
                         char_path = base_char_dir / f"{character_identifier}.png"

            if not char_path or not char_path.exists():
                self.logger.log_warning(f"Could not find character file for initialization: {character_identifier}")
                return None

            # Read metadata
            metadata = self.character_service.png_handler.read_metadata(str(char_path))
            if not metadata or 'data' not in metadata:
                return None

            character_data = metadata['data']
            char_actual_name = character_data.get("name", "Unnamed Character")
            char_description = character_data.get("description", "No description provided.")
            char_uuid = metadata.get('uuid', '')

            # Create starter location
            start_location = Location(
                name=f"{char_actual_name}'s Starting Point",
                coordinates=[0, 0, 0],
                location_id=f"origin_{char_uuid if char_uuid else 'char'}_0_0_0",
                description=f"The journey begins, inspired by {char_actual_name}. {char_description}",
                introduction=f"You are at the starting point associated with {char_actual_name}. {char_description}",
                connected=True,
                npcs=[str(char_path)] 
            )

            # Extract locations
            unconnected_locations_list = self.location_extractor.extract_from_lore(metadata)
            
            # Place locations on grid
            locations_dict = {"0,0,0": start_location}
            
            # (Simplified grid placement logic)
            grid_size = max(5, int(1 + (len(unconnected_locations_list) / 4) ** 0.5 * 2))
            grid_positions = []
            for x in range(-grid_size//2, grid_size//2 + 1):
                for y in range(-grid_size//2, grid_size//2 + 1):
                    if not (x == 0 and y == 0):
                        grid_positions.append((x, y, 0))
            grid_positions.sort(key=lambda pos: abs(pos[0]) + abs(pos[1]))

            for i, loc in enumerate(unconnected_locations_list):
                if i < len(grid_positions):
                    x, y, z = grid_positions[i]
                    coord_str = f"{x},{y},{z}"
                    new_location = Location(
                        name=loc.name,
                        coordinates=[x, y, z],
                        location_id=loc.location_id,
                        description=loc.description or f"A location associated with {char_actual_name}.",
                        introduction=f"You have arrived at {loc.name}. {loc.description}" if loc.description else f"You have arrived at {loc.name}, a location associated with {char_actual_name}.",
                        lore_source=loc.lore_source,
                        connected=True
                    )
                    locations_dict[coord_str] = new_location

            return WorldState(
                name=world_name,
                current_position="0,0,0",
                locations=locations_dict,
                visited_positions=["0,0,0"],
                unconnected_locations={},
                player=PlayerState(),
                base_character_id=str(char_path)
            )

        except Exception as e:
            self.logger.log_error(f"Error initializing world from character: {e}")
            return None

    # --- Room Management Wrappers ---

    def add_room(self, world_identifier: str, room: Location) -> bool: # Using Location instead of Room
        state = self.get_world_state(world_identifier)
        if not state: return False
        
        # Room/Location conversion if needed
        # Assuming we use Location internally
        
        coord_str = ",".join(map(str, room.coordinates)) if room.coordinates else None
        if not coord_str: return False # Must have coordinates for current system
        
        if coord_str in state.locations:
            return False
            
        state.locations[coord_str] = room
        return self.save_world_state(world_identifier, state)

    def update_room(self, world_identifier: str, room: Location) -> bool:
        state = self.get_world_state(world_identifier)
        if not state: return False
        
        # Find room by ID or coordinate
        # This is tricky because dictionary key is coordinate
        found_coord = None
        for coord, loc in state.locations.items():
            if loc.location_id == room.location_id:
                found_coord = coord
                break
        
        if found_coord:
            state.locations[found_coord] = room
            return self.save_world_state(world_identifier, state)
        return False

    def delete_room(self, world_identifier: str, room_id: str) -> bool:
        state = self.get_world_state(world_identifier)
        if not state: return False
        
        found_coord = None
        for coord, loc in state.locations.items():
            if loc.location_id == room_id:
                found_coord = coord
                break
        
        if found_coord:
            del state.locations[found_coord]
            return self.save_world_state(world_identifier, state)
        return False

    def get_world_image_path(self, world_identifier: str) -> Optional[Path]:
        """Gets the path to the world card image."""
        character = self._get_character_by_identifier(world_identifier)
        if not character or not character.png_file_path:
            return None
        return Path(character.png_file_path)

    def upload_world_image(self, world_identifier: str, image_bytes: bytes) -> bool:
        """Updates the world card image."""
        character = self._get_character_by_identifier(world_identifier)
        if not character:
            return False
        
        # Read current metadata to preserve it
        try:
            current_metadata = self.character_service.png_handler.read_metadata(character.png_file_path)
            # Update the file
            # Note: save_uploaded_character_card handles saving to disk and updating DB
            self.character_service.save_uploaded_character_card(
                raw_character_card_data=current_metadata or {"data": {}},
                image_bytes=image_bytes,
                original_filename=Path(character.png_file_path).name
            )
            return True
        except Exception as e:
            self.logger.log_error(f"Failed to upload world image: {e}")
            return False
