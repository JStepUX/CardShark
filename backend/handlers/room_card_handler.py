"""
backend/handlers/room_card_handler.py
Business logic for Room Cards (PNG-based).

Room cards are character cards with card_type="room" stored as PNG files.
This handler manages CRUD operations for room card PNG files.
"""

import json
import uuid as uuid_module
from typing import Dict, Any, Optional, List
from pathlib import Path
from datetime import datetime, timezone

from backend.models.room_card import (
    RoomCard, RoomCardData, RoomCardExtensions, RoomData,
    RoomCardSummary, CreateRoomRequest, UpdateRoomRequest,
    create_empty_room_card
)
from backend.services.character_service import CharacterService
from backend.png_metadata_handler import PngMetadataHandler
from backend.settings_manager import SettingsManager
from backend.log_manager import LogManager


class RoomCardHandler:
    """
    Business logic for Room Card PNG files.
    Handles creation, retrieval, updates, and deletion of room cards.
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

    def _get_rooms_directory(self) -> Path:
        """Get the rooms directory, creating it if needed."""
        character_dir = self.settings_manager.get_setting("character_directory")
        if not character_dir:
            # Fallback to default characters directory
            character_dir = Path(__file__).resolve().parent.parent.parent / "characters"
        else:
            character_dir = Path(character_dir)

        rooms_dir = character_dir / "rooms"
        rooms_dir.mkdir(parents=True, exist_ok=True)
        return rooms_dir

    def _get_default_room_image(self) -> bytes:
        """Load the default room image or create a blank one."""
        # Try to load default_world.png as base
        default_path = Path(__file__).resolve().parent.parent / "assets" / "default_world.png"

        if default_path.exists():
            with open(default_path, "rb") as f:
                return f.read()

        # Create a simple blank PNG if default doesn't exist
        from PIL import Image
        from io import BytesIO

        img = Image.new('RGB', (512, 512), color=(64, 64, 64))  # Dark gray
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        return buffer.getvalue()

    def create_room_card(self, request: CreateRoomRequest, image_bytes: Optional[bytes] = None) -> RoomCardSummary:
        """
        Create a new room card PNG file.

        Args:
            request: Room creation parameters
            image_bytes: Optional custom image bytes (uses default if not provided)

        Returns:
            RoomCardSummary with the created room info

        Raises:
            Exception if creation fails
        """
        # Generate UUID for the room
        room_uuid = str(uuid_module.uuid4())

        # Create room card model (with optional world origin tracking)
        room_card = create_empty_room_card(
            name=request.name,
            room_uuid=room_uuid,
            created_by_world_uuid=request.created_by_world_uuid
        )

        # Populate fields from request
        room_card.data.description = request.description or ""
        room_card.data.first_mes = request.first_mes
        room_card.data.system_prompt = request.system_prompt

        # Get image bytes (use default if not provided)
        if image_bytes is None:
            image_bytes = self._get_default_room_image()

        # Convert to character card format for PNG embedding
        card_dict = room_card.model_dump(mode='json')

        # Embed metadata in PNG
        png_with_metadata = self.png_handler.write_metadata(image_bytes, card_dict)

        # Save PNG to rooms directory
        rooms_dir = self._get_rooms_directory()
        filename = f"{room_uuid}.png"
        file_path = rooms_dir / filename

        with open(file_path, "wb") as f:
            f.write(png_with_metadata)

        self.logger.log_step(f"Created room card: {file_path}")

        # Index in database for gallery integration
        try:
            self.character_service.sync_character_file(str(file_path))
        except Exception as e:
            self.logger.log_warning(f"Failed to sync character directory after room creation: {e}")

        # Return summary
        return RoomCardSummary(
            uuid=room_uuid,
            name=request.name,
            description=request.description or "",
            image_path=str(file_path),
            npc_count=0,
            created_at=datetime.now(timezone.utc).isoformat(),
            updated_at=datetime.now(timezone.utc).isoformat()
        )

    def list_room_cards(self) -> List[RoomCardSummary]:
        """
        List all room cards.

        Returns:
            List of RoomCardSummary objects
        """
        characters = self.character_service.get_all_characters()

        # Build a map of room_uuid → list of world_uuids that reference it
        room_to_worlds = self._build_room_to_worlds_map(characters)

        room_cards = []

        for char in characters:
            try:
                extensions = json.loads(char.extensions_json) if char.extensions_json else {}

                # Check if it's a room card
                if extensions.get("card_type") == "room":
                    room_data = extensions.get("room_data", {})
                    npc_count = len(room_data.get("npcs", [])) if room_data else 0
                    created_by_world_uuid = room_data.get("created_by_world_uuid") if room_data else None

                    # Look up which worlds reference this room
                    assigned_worlds = room_to_worlds.get(char.character_uuid, [])

                    summary = RoomCardSummary(
                        uuid=char.character_uuid,
                        name=char.name,
                        description=char.description or "",
                        image_path=char.png_file_path,
                        assigned_worlds=assigned_worlds,
                        created_by_world_uuid=created_by_world_uuid,
                        npc_count=npc_count,
                        created_at=char.created_at.isoformat() if char.created_at else None,
                        updated_at=char.updated_at.isoformat() if char.updated_at else None
                    )
                    room_cards.append(summary)
            except Exception as e:
                self.logger.log_warning(f"Error parsing room card {char.name}: {e}")
                continue

        return room_cards

    def _build_room_to_worlds_map(self, characters) -> Dict[str, List[str]]:
        """
        Build a map of room_uuid → list of world_uuids that reference it.

        Args:
            characters: List of all characters from the database

        Returns:
            Dict mapping room UUIDs to lists of world UUIDs
        """
        room_to_worlds: Dict[str, List[str]] = {}

        for char in characters:
            try:
                extensions = json.loads(char.extensions_json) if char.extensions_json else {}

                # Only process world cards
                if extensions.get("card_type") != "world":
                    continue

                world_data = extensions.get("world_data", {})
                world_uuid = char.character_uuid
                rooms = world_data.get("rooms", [])

                # Add this world to each room's list
                for room_placement in rooms:
                    room_uuid = room_placement.get("room_uuid")
                    if room_uuid:
                        if room_uuid not in room_to_worlds:
                            room_to_worlds[room_uuid] = []
                        room_to_worlds[room_uuid].append(world_uuid)

            except Exception as e:
                self.logger.log_warning(f"Error processing world {char.name} for room mapping: {e}")
                continue

        return room_to_worlds

    def get_room_card(self, room_uuid: str) -> Optional[RoomCard]:
        """
        Retrieve a room card by UUID.

        Args:
            room_uuid: Room UUID

        Returns:
            RoomCard model or None if not found
        """
        with self.character_service._get_session_context() as db:
            character = self.character_service.get_character_by_uuid(room_uuid, db)

            if not character:
                return None

            try:
                # Read metadata from PNG
                metadata = self.png_handler.read_metadata(character.png_file_path)

                # Validate it's a room card
                if metadata.get("data", {}).get("extensions", {}).get("card_type") != "room":
                    self.logger.log_warning(f"Character {room_uuid} is not a room card")
                    return None

                # Parse as RoomCard
                room_card = RoomCard(**metadata)
                return room_card

            except Exception as e:
                self.logger.log_error(f"Error loading room card {room_uuid}: {e}")
                return None

    def update_room_card(self, room_uuid: str, request: UpdateRoomRequest) -> Optional[RoomCardSummary]:
        """
        Update an existing room card.

        Args:
            room_uuid: Room UUID
            request: Update parameters

        Returns:
            Updated RoomCardSummary or None if not found
        """
        # Get existing room card
        room_card = self.get_room_card(room_uuid)
        if not room_card:
            return None

        # Update fields from request
        if request.name is not None:
            room_card.data.name = request.name
        if request.description is not None:
            room_card.data.description = request.description
        if request.first_mes is not None:
            room_card.data.first_mes = request.first_mes
        if request.system_prompt is not None:
            room_card.data.system_prompt = request.system_prompt
        if request.character_book is not None:
            room_card.data.character_book = request.character_book
        if request.npcs is not None:
            # Validate that all NPC character_uuids exist
            with self.character_service._get_session_context() as db:
                for npc in request.npcs:
                    character = self.character_service.get_character_by_uuid(npc.character_uuid, db)
                    if not character:
                        raise ValueError(f"Character {npc.character_uuid} not found")

                    # Verify it's not a world or room card
                    try:
                        extensions = json.loads(character.extensions_json) if character.extensions_json else {}
                        card_type = extensions.get("card_type", "character")
                        if card_type in ["world", "room"]:
                            raise ValueError(f"Character {npc.character_uuid} is a {card_type} card and cannot be used as an NPC")
                    except (json.JSONDecodeError, AttributeError):
                        pass  # If extensions can't be parsed, assume it's a valid character

            room_card.data.extensions.room_data.npcs = request.npcs
        if request.tags is not None:
            room_card.data.tags = request.tags

        # Get PNG file path
        with self.character_service._get_session_context() as db:
            character = self.character_service.get_character_by_uuid(room_uuid, db)
            if not character:
                return None

            png_path = Path(character.png_file_path)

        # Update PNG metadata
        card_dict = room_card.model_dump(mode='json')

        # Read existing PNG image
        with open(png_path, "rb") as f:
            image_bytes = f.read()

        # Write updated metadata
        png_with_metadata = self.png_handler.write_metadata(image_bytes, card_dict)

        # Save updated PNG
        with open(png_path, "wb") as f:
            f.write(png_with_metadata)

        self.logger.log_step(f"Updated room card: {png_path}")

        # Resync to update database
        try:
            self.character_service.sync_character_file(str(png_path))
        except Exception as e:
            self.logger.log_warning(f"Failed to sync after update: {e}")

        # Return updated summary
        return RoomCardSummary(
            uuid=room_uuid,
            name=room_card.data.name,
            description=room_card.data.description,
            image_path=str(png_path),
            npc_count=len(room_card.data.extensions.room_data.npcs),
            updated_at=datetime.now(timezone.utc).isoformat()
        )

    def delete_room_card(self, room_uuid: str) -> bool:
        """
        Delete a room card.
        Also removes references from any worlds that contain this room (cascade delete).

        Args:
            room_uuid: Room UUID

        Returns:
            True if deleted, False if not found
        """
        with self.character_service._get_session_context() as db:
            character = self.character_service.get_character_by_uuid(room_uuid, db)

            if not character:
                return False

            # Verify it's a room card
            try:
                extensions = json.loads(character.extensions_json) if character.extensions_json else {}
                if extensions.get("card_type") != "room":
                    self.logger.log_warning(f"Character {room_uuid} is not a room card")
                    return False
            except Exception:
                return False

        # Cascade: Remove room from all worlds that reference it
        self._remove_room_from_worlds(room_uuid)

        # Delete via character service (handles both DB and PNG file)
        success = self.character_service.delete_character(room_uuid, delete_png_file=True)

        if success:
            self.logger.log_step(f"Deleted room card: {room_uuid}")

        return success

    def _remove_room_from_worlds(self, room_uuid: str) -> None:
        """
        Remove a room from all worlds that reference it.
        This is called before deleting a room to prevent orphaned references.

        Args:
            room_uuid: UUID of the room being deleted
        """
        characters = self.character_service.get_all_characters()

        for char in characters:
            try:
                extensions = json.loads(char.extensions_json) if char.extensions_json else {}

                # Only process world cards
                if extensions.get("card_type") != "world":
                    continue

                world_data = extensions.get("world_data", {})
                rooms = world_data.get("rooms", [])

                # Check if this world contains the room
                original_count = len(rooms)
                updated_rooms = [r for r in rooms if r.get("room_uuid") != room_uuid]

                if len(updated_rooms) < original_count:
                    # Room was in this world - update it
                    self.logger.log_step(f"Removing room {room_uuid} from world {char.character_uuid}")
                    self._update_world_rooms(char.character_uuid, char.png_file_path, updated_rooms)

            except Exception as e:
                self.logger.log_warning(f"Error checking world {char.name} for room cascade: {e}")
                continue

    def _update_world_rooms(self, world_uuid: str, png_path: str, updated_rooms: list) -> None:
        """
        Update a world's rooms array after removing a deleted room.

        Args:
            world_uuid: UUID of the world to update
            png_path: Path to the world's PNG file
            updated_rooms: The new rooms list with the deleted room removed
        """
        try:
            # Read world PNG metadata
            metadata = self.png_handler.read_metadata(png_path)

            # Update rooms in the metadata
            if "data" in metadata and "extensions" in metadata["data"]:
                if "world_data" in metadata["data"]["extensions"]:
                    metadata["data"]["extensions"]["world_data"]["rooms"] = updated_rooms

            # Read existing PNG image bytes
            with open(png_path, "rb") as f:
                image_bytes = f.read()

            # Write updated metadata back to PNG
            png_with_metadata = self.png_handler.write_metadata(image_bytes, metadata)

            # Save updated PNG
            with open(png_path, "wb") as f:
                f.write(png_with_metadata)

            self.logger.log_step(f"Updated world {world_uuid} after room removal")

            # Resync database to reflect changes
            try:
                self.character_service.sync_character_file(png_path)
            except Exception as e:
                self.logger.log_warning(f"Failed to sync after world update: {e}")

        except Exception as e:
            self.logger.log_error(f"Error updating world {world_uuid} after room deletion: {e}")
