"""
backend/services/world_card_service.py
Business logic service for World Card PNG files (V2).

World cards are character cards with card_type="world" stored as PNG files.
This service manages CRUD operations for world card PNG files.
"""

import json
import uuid as uuid_module
from typing import Optional, List
from pathlib import Path
from datetime import datetime, timezone

from backend.models.world_card import (
    WorldCard, WorldCardData, WorldCardExtensions, WorldData,
    WorldCardSummary, CreateWorldRequest, ConvertWorldRequest, UpdateWorldRequest,
    WorldRoomPlacement, create_empty_world_card
)
from backend.models.world_state import GridSize, Position
from backend.models.room_card import CreateRoomRequest
from backend.services.character_service import CharacterService
from backend.png_metadata_handler import PngMetadataHandler
from backend.settings_manager import SettingsManager
from backend.log_manager import LogManager
from backend.utils.location_extractor import LocationExtractor


class WorldCardService:
    """
    Business logic service for World Card PNG files (V2).
    Handles creation, retrieval, updates, and deletion of world cards.
    """

    def __init__(
        self,
        character_service: CharacterService,
        png_handler: PngMetadataHandler,
        settings_manager: SettingsManager,
        logger: LogManager
    ):
        self.character_service = character_service
        self.png_handler = png_handler
        self.settings_manager = settings_manager
        self.logger = logger

    def _get_worlds_directory(self) -> Path:
        """Get the worlds directory, creating it if needed."""
        character_dir = self.settings_manager.get_setting("character_directory")
        if not character_dir:
            # Fallback to default characters directory
            character_dir = Path(__file__).resolve().parent.parent.parent / "characters"
        else:
            character_dir = Path(character_dir)

        worlds_dir = character_dir / "worlds"
        worlds_dir.mkdir(parents=True, exist_ok=True)
        return worlds_dir

    def _get_default_world_image(self) -> bytes:
        """Load the default world image or create a blank one."""
        # Try to load default_world.png
        default_path = Path(__file__).resolve().parent.parent / "assets" / "default_world.png"

        if default_path.exists():
            with open(default_path, "rb") as f:
                return f.read()

        # Create a simple blank PNG if default doesn't exist
        from PIL import Image
        from io import BytesIO

        img = Image.new('RGB', (512, 512), color=(32, 96, 32))  # Dark green
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        return buffer.getvalue()

    def create_world_card(self, request: CreateWorldRequest, image_bytes: Optional[bytes] = None) -> WorldCardSummary:
        """
        Create a new world card PNG file.

        Args:
            request: World creation parameters
            image_bytes: Optional custom image bytes (uses default if not provided)

        Returns:
            WorldCardSummary with the created world info

        Raises:
            Exception if creation fails
        """
        # Generate UUID for the world
        world_uuid = str(uuid_module.uuid4())

        # Create world card model
        grid_size = request.grid_size if request.grid_size else GridSize(width=10, height=10)
        world_card = create_empty_world_card(name=request.name, world_uuid=world_uuid, grid_size=grid_size)

        # Populate fields from request
        world_card.data.description = request.description or ""
        world_card.data.first_mes = request.first_mes
        world_card.data.system_prompt = request.system_prompt

        # Get image bytes (use default if not provided)
        if image_bytes is None:
            image_bytes = self._get_default_world_image()

        # Convert to character card format for PNG embedding
        card_dict = world_card.model_dump(mode='json')

        # Embed metadata in PNG
        png_with_metadata = self.png_handler.write_metadata(image_bytes, card_dict)

        # Save PNG to worlds directory
        worlds_dir = self._get_worlds_directory()
        filename = f"{world_uuid}.png"
        file_path = worlds_dir / filename

        with open(file_path, "wb") as f:
            f.write(png_with_metadata)

        self.logger.log_step(f"Created world card: {file_path}")

        # Index in database for gallery integration
        try:
            self.character_service.sync_character_file(str(file_path))
        except Exception as e:
            self.logger.log_warning(f"Failed to sync character file after world creation: {e}")

        # Return summary
        return WorldCardSummary(
            uuid=world_uuid,
            name=request.name,
            description=request.description or "",
            image_path=str(file_path),
            grid_size=grid_size,
            room_count=0,
            created_at=datetime.now(timezone.utc).isoformat(),
            updated_at=datetime.now(timezone.utc).isoformat()
        )


    def convert_character_to_world(self, request: ConvertWorldRequest) -> Optional[WorldCardSummary]:
        """
        Convert a character card into a new world card.

        Automatically extracts locations from character_book lore entries and creates
        room cards for each detected location.

        Args:
            request: Conversion request with source character UUID and new name

        Returns:
            WorldCardSummary of the new world, or None if source not found
        """
        # Get source character
        with self.character_service._get_session_context() as db:
            char_data = self.character_service.get_character_by_uuid(request.character_path, db)

            if not char_data or not char_data.png_file_path:
                self.logger.log_warning(f"Source character {request.character_path} not found for conversion")
                return None

            source_png_path = char_data.png_file_path

        # Read source metadata
        try:
            source_meta = self.png_handler.read_metadata(source_png_path)
        except Exception as e:
            self.logger.log_error(f"Failed to read source metadata: {e}")
            return None

        data = source_meta.get("data", {})

        # Create new world request
        create_req = CreateWorldRequest(
            name=request.name,
            description=data.get("description", ""),
            first_mes=data.get("first_mes"),
            system_prompt=data.get("system_prompt")
        )

        # Read source image
        try:
            with open(source_png_path, "rb") as f:
                image_bytes = f.read()
        except Exception as e:
            self.logger.log_error(f"Failed to read source image: {e}")
            return None

        # Create world using standard creation flow
        # This creates a new UUID and embeds the world metadata
        new_world_summary = self.create_world_card(create_req, image_bytes)

        # Post-creation: Copy extra fields like character_book
        character_book = data.get("character_book")
        if character_book:
            update_req = UpdateWorldRequest(character_book=character_book)
            self.update_world_card(new_world_summary.uuid, update_req)

        # Extract locations from lore entries and create rooms
        # Pass the world UUID so rooms know which world created them
        room_placements = self._extract_and_create_rooms_from_lore(source_meta, new_world_summary.uuid)

        if room_placements:
            self.logger.log_step(f"Created {len(room_placements)} rooms from lore entries")
            # Update world with room placements
            update_req = UpdateWorldRequest(rooms=room_placements)
            self.update_world_card(new_world_summary.uuid, update_req)
            new_world_summary.room_count = len(room_placements)

        return new_world_summary

    def _extract_and_create_rooms_from_lore(self, character_data: dict, world_uuid: str) -> List[WorldRoomPlacement]:
        """
        Extract locations from character lore entries and create room cards for each.

        Args:
            character_data: The full character card metadata
            world_uuid: UUID of the world being created (for tracking room origin)

        Returns:
            List of WorldRoomPlacement objects for the created rooms
        """
        # Import here to avoid circular imports
        from backend.handlers.room_card_handler import RoomCardHandler

        # Use LocationExtractor to find potential locations
        extractor = LocationExtractor(self.logger)
        locations = extractor.extract_from_lore(character_data)

        if not locations:
            self.logger.log_step("No locations found in lore entries")
            return []

        self.logger.log_step(f"Found {len(locations)} potential locations in lore")

        # Create a RoomCardHandler to create room cards
        room_handler = RoomCardHandler(
            character_service=self.character_service,
            png_handler=self.png_handler,
            settings_manager=self.settings_manager,
            logger=self.logger
        )

        room_placements = []
        grid_width = 10  # Default grid width for positioning

        for i, location in enumerate(locations):
            try:
                # Create room request - tag with the world that created it
                room_request = CreateRoomRequest(
                    name=location.name,
                    description=location.description,
                    first_mes=f"You enter {location.name}.",
                    system_prompt=None,
                    created_by_world_uuid=world_uuid
                )

                # Create the room card
                room_summary = room_handler.create_room_card(room_request)

                # Calculate grid position (spread rooms across the grid)
                grid_x = i % grid_width
                grid_y = i // grid_width

                # Create room placement
                placement = WorldRoomPlacement(
                    room_uuid=room_summary.uuid,
                    grid_position=Position(x=grid_x, y=grid_y)
                )
                room_placements.append(placement)

                self.logger.log_step(f"Created room '{location.name}' at grid position ({grid_x}, {grid_y})")

            except Exception as e:
                self.logger.log_warning(f"Failed to create room for location '{location.name}': {e}")
                continue

        return room_placements

    def list_world_cards(self) -> List[WorldCardSummary]:
        """
        List all world cards.

        Returns:
            List of WorldCardSummary objects
        """
        characters = self.character_service.get_all_characters()
        world_cards = []

        for char in characters:
            try:
                extensions = json.loads(char.extensions_json) if char.extensions_json else {}

                # Check if it's a world card
                if extensions.get("card_type") == "world":
                    world_data = extensions.get("world_data", {})

                    grid_size = world_data.get("grid_size", {"width": 10, "height": 10})
                    room_count = len(world_data.get("rooms", [])) if world_data else 0

                    summary = WorldCardSummary(
                        uuid=char.character_uuid,
                        name=char.name,
                        description=char.description or "",
                        image_path=char.png_file_path,
                        grid_size=GridSize(**grid_size),
                        room_count=room_count,
                        created_at=char.created_at.isoformat() if char.created_at else None,
                        updated_at=char.updated_at.isoformat() if char.updated_at else None
                    )
                    world_cards.append(summary)
            except Exception as e:
                self.logger.log_warning(f"Error parsing world card {char.name}: {e}")
                continue

        return world_cards

    def get_world_card(self, world_uuid: str) -> Optional[WorldCard]:
        """
        Retrieve a world card by UUID.

        Args:
            world_uuid: World UUID

        Returns:
            WorldCard model or None if not found
        """
        with self.character_service._get_session_context() as db:
            character = self.character_service.get_character_by_uuid(world_uuid, db)

            if not character:
                return None

            try:
                # Read metadata from PNG
                metadata = self.png_handler.read_metadata(character.png_file_path)

                # Validate it's a world card
                if metadata.get("data", {}).get("extensions", {}).get("card_type") != "world":
                    self.logger.log_warning(f"Character {world_uuid} is not a world card")
                    return None

                # Parse as WorldCard
                world_card = WorldCard(**metadata)
                return world_card

            except Exception as e:
                self.logger.log_error(f"Error loading world card {world_uuid}: {e}")
                return None

    def update_world_card(self, world_uuid: str, request: UpdateWorldRequest) -> Optional[WorldCardSummary]:
        """
        Update an existing world card.

        Args:
            world_uuid: World UUID
            request: Update parameters

        Returns:
            Updated WorldCardSummary or None if not found
        """
        # Get existing world card
        world_card = self.get_world_card(world_uuid)
        if not world_card:
            return None

        # Update fields from request
        if request.name is not None:
            world_card.data.name = request.name
        if request.description is not None:
            world_card.data.description = request.description
        if request.first_mes is not None:
            world_card.data.first_mes = request.first_mes
        if request.system_prompt is not None:
            world_card.data.system_prompt = request.system_prompt
        if request.character_book is not None:
            world_card.data.character_book = request.character_book
        if request.grid_size is not None:
            world_card.data.extensions.world_data.grid_size = request.grid_size
        if request.rooms is not None:
            world_card.data.extensions.world_data.rooms = request.rooms
        if request.starting_position is not None:
            world_card.data.extensions.world_data.starting_position = request.starting_position
        if request.player_position is not None:
            world_card.data.extensions.world_data.player_position = request.player_position
        if request.tags is not None:
            world_card.data.tags = request.tags

        # Runtime state fields
        if request.player_xp is not None:
            world_card.data.extensions.world_data.player_xp = request.player_xp
        if request.player_level is not None:
            world_card.data.extensions.world_data.player_level = request.player_level
        if request.player_gold is not None:
            world_card.data.extensions.world_data.player_gold = request.player_gold
        if request.bonded_ally_uuid is not None:
            # Empty string means "clear" (unbond); any other value sets the ally
            world_card.data.extensions.world_data.bonded_ally_uuid = (
                None if request.bonded_ally_uuid == "" else request.bonded_ally_uuid
            )
        if request.time_state is not None:
            world_card.data.extensions.world_data.time_state = request.time_state
        if request.npc_relationships is not None:
            world_card.data.extensions.world_data.npc_relationships = request.npc_relationships
        if request.player_inventory is not None:
            world_card.data.extensions.world_data.player_inventory = request.player_inventory
        if request.ally_inventory is not None:
            world_card.data.extensions.world_data.ally_inventory = request.ally_inventory
        if request.room_states is not None:
            world_card.data.extensions.world_data.room_states = request.room_states

        # Get PNG file path
        with self.character_service._get_session_context() as db:
            character = self.character_service.get_character_by_uuid(world_uuid, db)
            if not character:
                return None

            png_path = Path(character.png_file_path)

        # Update PNG metadata
        card_dict = world_card.model_dump(mode='json')

        # Read existing PNG image
        with open(png_path, "rb") as f:
            image_bytes = f.read()

        # Write updated metadata
        png_with_metadata = self.png_handler.write_metadata(image_bytes, card_dict)

        # Save updated PNG
        with open(png_path, "wb") as f:
            f.write(png_with_metadata)

        self.logger.log_step(f"Updated world card: {png_path}")

        # Resync to update database
        try:
            self.character_service.sync_character_file(str(png_path))
        except Exception as e:
            self.logger.log_warning(f"Failed to sync after update: {e}")

        # Return updated summary
        return WorldCardSummary(
            uuid=world_uuid,
            name=world_card.data.name,
            description=world_card.data.description,
            image_path=str(png_path),
            grid_size=world_card.data.extensions.world_data.grid_size,
            room_count=len(world_card.data.extensions.world_data.rooms),
            updated_at=datetime.now(timezone.utc).isoformat()
        )

    def delete_world_card(self, world_uuid: str) -> bool:
        """
        Delete a world card.

        Args:
            world_uuid: World UUID

        Returns:
            True if deleted, False if not found
        """
        with self.character_service._get_session_context() as db:
            character = self.character_service.get_character_by_uuid(world_uuid, db)

            if not character:
                return False

            # Verify it's a world card
            try:
                extensions = json.loads(character.extensions_json) if character.extensions_json else {}
                if extensions.get("card_type") != "world":
                    self.logger.log_warning(f"Character {world_uuid} is not a world card")
                    return False
            except Exception:
                return False

            # Delete via character service (handles both DB and PNG file)
            success = self.character_service.delete_character(world_uuid, delete_png_file=True)

            if success:
                self.logger.log_step(f"Deleted world card: {world_uuid}")

            return success

    def get_delete_preview(self, world_uuid: str) -> Optional["WorldDeletePreview"]:
        """
        Get a preview of what will happen when deleting a world.

        Categorizes rooms into:
        - rooms_to_delete: Auto-generated rooms that will become orphaned
        - rooms_to_keep: Manually created rooms or rooms used by other worlds

        Args:
            world_uuid: UUID of the world to preview deletion for

        Returns:
            WorldDeletePreview or None if world not found
        """
        from backend.models.world_card import WorldDeletePreview, RoomDeleteInfo

        # Get the world card
        world_card = self.get_world_card(world_uuid)
        if not world_card:
            return None

        world_name = world_card.data.name
        world_data = world_card.data.extensions.world_data
        room_placements = world_data.rooms

        if not room_placements:
            return WorldDeletePreview(
                world_uuid=world_uuid,
                world_name=world_name,
                rooms_to_delete=[],
                rooms_to_keep=[],
                total_rooms=0
            )

        # Get all characters to build room info and world references
        characters = self.character_service.get_all_characters()

        # Build map of room_uuid -> room info (name, created_by_world_uuid)
        room_info_map = {}
        for char in characters:
            try:
                extensions = json.loads(char.extensions_json) if char.extensions_json else {}
                if extensions.get("card_type") == "room":
                    room_data = extensions.get("room_data", {})
                    room_info_map[char.character_uuid] = {
                        "name": char.name,
                        "created_by_world_uuid": room_data.get("created_by_world_uuid")
                    }
            except Exception:
                continue

        # Build map of room_uuid -> list of world_uuids (excluding the world being deleted)
        room_to_other_worlds = {}
        for char in characters:
            try:
                extensions = json.loads(char.extensions_json) if char.extensions_json else {}
                if extensions.get("card_type") == "world" and char.character_uuid != world_uuid:
                    other_world_data = extensions.get("world_data", {})
                    for room_placement in other_world_data.get("rooms", []):
                        room_id = room_placement.get("room_uuid")
                        if room_id:
                            if room_id not in room_to_other_worlds:
                                room_to_other_worlds[room_id] = []
                            room_to_other_worlds[room_id].append(char.character_uuid)
            except Exception:
                continue

        rooms_to_delete = []
        rooms_to_keep = []

        for placement in room_placements:
            room_uuid = placement.room_uuid
            room_info = room_info_map.get(room_uuid, {"name": "Unknown Room", "created_by_world_uuid": None})
            room_name = room_info["name"]
            created_by = room_info["created_by_world_uuid"]
            other_worlds = room_to_other_worlds.get(room_uuid, [])

            # Determine if this room should be deleted or kept
            if other_worlds:
                # Room is used by other worlds - keep it
                rooms_to_keep.append(RoomDeleteInfo(
                    uuid=room_uuid,
                    name=room_name,
                    reason=f"Used by {len(other_worlds)} other world(s)"
                ))
            elif created_by != world_uuid:
                # Room was manually created or created by a different world - keep it
                if created_by is None:
                    reason = "Manually created (not auto-generated)"
                else:
                    reason = "Created by a different world"
                rooms_to_keep.append(RoomDeleteInfo(
                    uuid=room_uuid,
                    name=room_name,
                    reason=reason
                ))
            else:
                # Room was auto-generated by this world and not used elsewhere - delete it
                rooms_to_delete.append(RoomDeleteInfo(
                    uuid=room_uuid,
                    name=room_name,
                    reason="Auto-generated by this world"
                ))

        return WorldDeletePreview(
            world_uuid=world_uuid,
            world_name=world_name,
            rooms_to_delete=rooms_to_delete,
            rooms_to_keep=rooms_to_keep,
            total_rooms=len(room_placements)
        )

    def delete_world_card_with_rooms(self, world_uuid: str, delete_generated_rooms: bool = True) -> dict:
        """
        Delete a world card with optional cascade deletion of auto-generated rooms.

        Args:
            world_uuid: UUID of the world to delete
            delete_generated_rooms: If True, also delete rooms that were auto-generated
                                   by this world and are not used by other worlds

        Returns:
            Dict with deletion results:
            - success: bool
            - world_deleted: bool
            - rooms_deleted: list of room UUIDs that were deleted
            - rooms_kept: list of room UUIDs that were kept
        """
        from backend.handlers.room_card_handler import RoomCardHandler

        result = {
            "success": False,
            "world_deleted": False,
            "rooms_deleted": [],
            "rooms_kept": []
        }

        # Get deletion preview first
        preview = self.get_delete_preview(world_uuid)
        if not preview:
            return result

        # Delete rooms if requested
        if delete_generated_rooms and preview.rooms_to_delete:
            room_handler = RoomCardHandler(
                character_service=self.character_service,
                png_handler=self.png_handler,
                settings_manager=self.settings_manager,
                logger=self.logger
            )

            for room_info in preview.rooms_to_delete:
                try:
                    if room_handler.delete_room_card(room_info.uuid):
                        result["rooms_deleted"].append(room_info.uuid)
                        self.logger.log_step(f"Deleted auto-generated room: {room_info.name}")
                    else:
                        result["rooms_kept"].append(room_info.uuid)
                except Exception as e:
                    self.logger.log_warning(f"Failed to delete room {room_info.uuid}: {e}")
                    result["rooms_kept"].append(room_info.uuid)

        # Track kept rooms
        for room_info in preview.rooms_to_keep:
            result["rooms_kept"].append(room_info.uuid)

        # Delete the world itself
        if self.delete_world_card(world_uuid):
            result["world_deleted"] = True
            result["success"] = True

        return result


# Backward compatibility alias
WorldCardHandlerV2 = WorldCardService
