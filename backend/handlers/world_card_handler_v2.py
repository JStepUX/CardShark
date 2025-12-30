"""
backend/handlers/world_card_handler_v2.py
Business logic for World Card PNG files (V2).

World cards are character cards with card_type="world" stored as PNG files.
This handler manages CRUD operations for world card PNG files.
"""

import json
import uuid as uuid_module
from typing import Dict, Any, Optional, List
from pathlib import Path
from datetime import datetime, timezone

from backend.models.world_card import (
    WorldCard, WorldCardData, WorldCardExtensions, WorldData,
    WorldCardSummary, CreateWorldRequest, UpdateWorldRequest,
    WorldRoomPlacement, create_empty_world_card
)
from backend.models.world_state import GridSize, Position
from backend.services.character_service import CharacterService
from backend.png_metadata_handler import PngMetadataHandler
from backend.settings_manager import SettingsManager
from backend.log_manager import LogManager


class WorldCardHandlerV2:
    """
    Business logic for World Card PNG files (V2).
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
            self.character_service.sync_character_directories()
        except Exception as e:
            self.logger.log_warning(f"Failed to sync character directory after world creation: {e}")

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
        with self.character_service.db_session_generator() as db:
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

        # Get PNG file path
        with self.character_service.db_session_generator() as db:
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
            self.character_service.sync_character_directories()
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
        with self.character_service.db_session_generator() as db:
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
