"""
backend/handlers/export_handler.py
Business logic for exporting and importing worlds as ZIP archives.

Exports a world card along with all referenced room and character cards
into a portable .cardshark.zip archive.

Imports a .cardshark.zip archive, regenerating UUIDs and updating references.
"""

import io
import json
import zipfile
import uuid as uuid_module
from pathlib import Path
from typing import Set, Optional, Dict
from datetime import datetime

from backend.handlers.world_card_handler_v2 import WorldCardHandlerV2
from backend.handlers.room_card_handler import RoomCardHandler
from backend.services.character_service import CharacterService
from backend.png_metadata_handler import PngMetadataHandler
from backend.log_manager import LogManager


class ExportHandler:
    """
    Business logic for exporting and importing world cards as ZIP archives.
    """

    def __init__(
        self,
        world_handler: WorldCardHandlerV2,
        room_handler: RoomCardHandler,
        character_service: CharacterService,
        png_handler: PngMetadataHandler,
        logger: LogManager
    ):
        self.world_handler = world_handler
        self.room_handler = room_handler
        self.character_service = character_service
        self.png_handler = png_handler
        self.logger = logger

    def export_world(self, world_uuid: str) -> tuple[bytes, str]:
        """
        Export a world card and all its dependencies as a ZIP file.

        Args:
            world_uuid: UUID of the world to export

        Returns:
            Tuple of (zip_bytes, filename)

        Raises:
            Exception if world not found or export fails
        """
        self.logger.log_step(f"Exporting world: {world_uuid}")

        # Load world card
        world_card = self.world_handler.get_world_card(world_uuid)
        if not world_card:
            raise ValueError(f"World {world_uuid} not found")

        # Get world PNG path
        with self.character_service._get_session_context() as db:
            world_character = self.character_service.get_character_by_uuid(world_uuid, db)
            if not world_character:
                raise ValueError(f"World character record not found: {world_uuid}")
            world_png_path = Path(world_character.png_file_path)

        # Track collected UUIDs to avoid duplicates
        collected_character_uuids: Set[str] = set()

        # Create ZIP in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add world card (with runtime state stripped for clean export)
            self.logger.log_step(f"Adding world card: {world_png_path.name}")
            with open(world_png_path, 'rb') as f:
                world_png_bytes = f.read()

            # Strip runtime progress from world metadata so exports are clean templates
            world_metadata = self.png_handler.read_metadata(world_png_bytes)
            world_data_section = (
                world_metadata.get('data', {})
                .get('extensions', {})
                .get('world_data', {})
            )
            runtime_fields = [
                'player_xp', 'player_level', 'player_gold',
                'bonded_ally_uuid', 'time_state', 'npc_relationships',
                'player_inventory', 'ally_inventory', 'room_states',
            ]
            for field in runtime_fields:
                world_data_section.pop(field, None)
            # Reset player position to starting position
            if 'starting_position' in world_data_section:
                world_data_section['player_position'] = world_data_section['starting_position']
            # Strip per-room instance_state from placements
            for room_placement in world_data_section.get('rooms', []):
                room_placement.pop('instance_state', None)

            clean_world_png = self.png_handler.write_metadata(world_png_bytes, world_metadata)
            zip_file.writestr('world.png', clean_world_png)

            # Process rooms
            world_data = world_card.data.extensions.world_data
            for placement in world_data.rooms:
                room_uuid = placement.room_uuid

                # Load room card
                room_card = self.room_handler.get_room_card(room_uuid)
                if not room_card:
                    self.logger.log_warning(f"Room {room_uuid} not found, skipping")
                    continue

                # Get room PNG path
                with self.character_service._get_session_context() as db:
                    room_character = self.character_service.get_character_by_uuid(room_uuid, db)
                    if not room_character:
                        self.logger.log_warning(f"Room character record not found: {room_uuid}, skipping")
                        continue
                    room_png_path = Path(room_character.png_file_path)

                # Add room card
                self.logger.log_step(f"Adding room card: {room_png_path.name}")
                with open(room_png_path, 'rb') as f:
                    zip_file.writestr(f'rooms/{room_png_path.name}', f.read())

                # Process NPCs in this room
                for npc in room_card.data.extensions.room_data.npcs:
                    npc_uuid = npc.character_uuid

                    # Skip if already collected
                    if npc_uuid in collected_character_uuids:
                        continue

                    # Get NPC character PNG path
                    with self.character_service._get_session_context() as db:
                        npc_character = self.character_service.get_character_by_uuid(npc_uuid, db)
                        if not npc_character:
                            self.logger.log_warning(f"NPC character not found: {npc_uuid}, skipping")
                            continue
                        npc_png_path = Path(npc_character.png_file_path)

                    # Add character card
                    self.logger.log_step(f"Adding character card: {npc_png_path.name}")
                    with open(npc_png_path, 'rb') as f:
                        zip_file.writestr(f'characters/{npc_png_path.name}', f.read())

                    collected_character_uuids.add(npc_uuid)

        # Generate filename
        safe_name = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in world_card.data.name)
        filename = f"{safe_name}.cardshark.zip"

        self.logger.log_step(f"Export complete: {filename}")
        return zip_buffer.getvalue(), filename

    def import_world(self, zip_bytes: bytes) -> str:
        """
        Import a world card and all its dependencies from a ZIP file.
        Regenerates all UUIDs and updates references.

        Args:
            zip_bytes: ZIP file contents

        Returns:
            New world UUID

        Raises:
            Exception if import fails
        """
        self.logger.log_step("Importing world from ZIP archive")

        # UUID mapping: old_uuid -> new_uuid
        uuid_map: Dict[str, str] = {}

        try:
            with zipfile.ZipFile(io.BytesIO(zip_bytes), 'r') as zip_file:
                # Step 1: Extract and process world.png to get old world UUID
                if 'world.png' not in zip_file.namelist():
                    raise ValueError("Invalid archive: missing world.png")

                world_png_bytes = zip_file.read('world.png')
                world_metadata = self.png_handler.read_metadata(world_png_bytes)

                # Get old world UUID
                old_world_uuid = world_metadata.get('data', {}).get('character_uuid')
                if not old_world_uuid:
                    # Fallback: extract from filename or generate
                    old_world_uuid = 'world'

                # Generate new world UUID
                new_world_uuid = str(uuid_module.uuid4())
                uuid_map[old_world_uuid] = new_world_uuid
                self.logger.log_step(f"World UUID: {old_world_uuid} -> {new_world_uuid}")

                # Step 2: Process all character cards and build UUID map
                character_files = [f for f in zip_file.namelist() if f.startswith('characters/')]
                for char_file in character_files:
                    char_png_bytes = zip_file.read(char_file)
                    char_metadata = self.png_handler.read_metadata(char_png_bytes)

                    old_char_uuid = char_metadata.get('data', {}).get('character_uuid')
                    if not old_char_uuid:
                        # Extract from filename
                        old_char_uuid = Path(char_file).stem

                    new_char_uuid = str(uuid_module.uuid4())
                    uuid_map[old_char_uuid] = new_char_uuid
                    self.logger.log_step(f"Character UUID: {old_char_uuid} -> {new_char_uuid}")

                # Step 3: Process all room cards and build UUID map
                room_files = [f for f in zip_file.namelist() if f.startswith('rooms/')]
                for room_file in room_files:
                    room_png_bytes = zip_file.read(room_file)
                    room_metadata = self.png_handler.read_metadata(room_png_bytes)

                    old_room_uuid = room_metadata.get('data', {}).get('character_uuid')
                    if not old_room_uuid:
                        # Extract from filename
                        old_room_uuid = Path(room_file).stem

                    new_room_uuid = str(uuid_module.uuid4())
                    uuid_map[old_room_uuid] = new_room_uuid
                    self.logger.log_step(f"Room UUID: {old_room_uuid} -> {new_room_uuid}")

                # Step 4: Import character cards (no reference updates needed)
                for char_file in character_files:
                    char_png_bytes = zip_file.read(char_file)
                    char_metadata = self.png_handler.read_metadata(char_png_bytes)

                    old_char_uuid = char_metadata.get('data', {}).get('character_uuid', Path(char_file).stem)
                    new_char_uuid = uuid_map[old_char_uuid]

                    # Update UUID in metadata
                    char_metadata['data']['character_uuid'] = new_char_uuid

                    # Save character card
                    self._save_character_card(char_png_bytes, char_metadata, new_char_uuid)

                # Step 5: Import room cards (update NPC references)
                for room_file in room_files:
                    room_png_bytes = zip_file.read(room_file)
                    room_metadata = self.png_handler.read_metadata(room_png_bytes)

                    old_room_uuid = room_metadata.get('data', {}).get('character_uuid', Path(room_file).stem)
                    new_room_uuid = uuid_map[old_room_uuid]

                    # Update room UUID
                    room_metadata['data']['character_uuid'] = new_room_uuid

                    # Update NPC references
                    room_data = room_metadata.get('data', {}).get('extensions', {}).get('room_data', {})
                    npcs = room_data.get('npcs', [])
                    for npc in npcs:
                        old_npc_uuid = npc.get('character_uuid')
                        if old_npc_uuid and old_npc_uuid in uuid_map:
                            npc['character_uuid'] = uuid_map[old_npc_uuid]

                    # Save room card
                    self._save_room_card(room_png_bytes, room_metadata, new_room_uuid)

                # Step 6: Import world card (update room references)
                world_metadata['data']['character_uuid'] = new_world_uuid

                # Strip any runtime progress (safety net for older exports)
                import_world_data = world_metadata.get('data', {}).get('extensions', {}).get('world_data', {})
                for rt_field in [
                    'player_xp', 'player_level', 'player_gold',
                    'bonded_ally_uuid', 'time_state', 'npc_relationships',
                    'player_inventory', 'ally_inventory', 'room_states',
                ]:
                    import_world_data.pop(rt_field, None)
                if 'starting_position' in import_world_data:
                    import_world_data['player_position'] = import_world_data['starting_position']
                for rp in import_world_data.get('rooms', []):
                    rp.pop('instance_state', None)

                # Update room references
                world_data = import_world_data
                rooms = world_data.get('rooms', [])
                for room_placement in rooms:
                    old_room_uuid = room_placement.get('room_uuid')
                    if old_room_uuid and old_room_uuid in uuid_map:
                        room_placement['room_uuid'] = uuid_map[old_room_uuid]

                # Save world card
                self._save_world_card(world_png_bytes, world_metadata, new_world_uuid)

                self.logger.log_step(f"Import complete: {new_world_uuid}")
                return new_world_uuid

        except zipfile.BadZipFile:
            raise ValueError("Invalid ZIP file")
        except Exception as e:
            self.logger.log_error(f"Import failed: {e}")
            raise

    def _save_character_card(self, png_bytes: bytes, metadata: dict, character_uuid: str):
        """Save a character card PNG with updated metadata"""
        # Get character directory
        character_dir = self.world_handler.settings_manager.get_setting("character_directory")
        if not character_dir:
            character_dir = Path(__file__).resolve().parent.parent.parent / "characters"
        else:
            character_dir = Path(character_dir)

        character_dir.mkdir(parents=True, exist_ok=True)

        # Write metadata to PNG
        png_with_metadata = self.png_handler.write_metadata(png_bytes, metadata)

        # Save file
        file_path = character_dir / f"{character_uuid}.png"
        with open(file_path, 'wb') as f:
            f.write(png_with_metadata)

        self.logger.log_step(f"Saved character card: {file_path}")

        # Sync to database
        try:
            self.character_service.sync_character_file(str(file_path))
        except Exception as e:
            self.logger.log_warning(f"Failed to sync after character import: {e}")

    def _save_room_card(self, png_bytes: bytes, metadata: dict, room_uuid: str):
        """Save a room card PNG with updated metadata"""
        # Get rooms directory
        character_dir = self.world_handler.settings_manager.get_setting("character_directory")
        if not character_dir:
            character_dir = Path(__file__).resolve().parent.parent.parent / "characters"
        else:
            character_dir = Path(character_dir)

        rooms_dir = character_dir / "rooms"
        rooms_dir.mkdir(parents=True, exist_ok=True)

        # Write metadata to PNG
        png_with_metadata = self.png_handler.write_metadata(png_bytes, metadata)

        # Save file
        file_path = rooms_dir / f"{room_uuid}.png"
        with open(file_path, 'wb') as f:
            f.write(png_with_metadata)

        self.logger.log_step(f"Saved room card: {file_path}")

        # Sync to database
        try:
            self.character_service.sync_character_file(str(file_path))
        except Exception as e:
            self.logger.log_warning(f"Failed to sync after room import: {e}")

    def _save_world_card(self, png_bytes: bytes, metadata: dict, world_uuid: str):
        """Save a world card PNG with updated metadata"""
        # Get worlds directory
        character_dir = self.world_handler.settings_manager.get_setting("character_directory")
        if not character_dir:
            character_dir = Path(__file__).resolve().parent.parent.parent / "characters"
        else:
            character_dir = Path(character_dir)

        worlds_dir = character_dir / "worlds"
        worlds_dir.mkdir(parents=True, exist_ok=True)

        # Write metadata to PNG
        png_with_metadata = self.png_handler.write_metadata(png_bytes, metadata)

        # Save file
        file_path = worlds_dir / f"{world_uuid}.png"
        with open(file_path, 'wb') as f:
            f.write(png_with_metadata)

        self.logger.log_step(f"Saved world card: {file_path}")

        # Sync to database
        try:
            self.character_service.sync_character_file(str(file_path))
        except Exception as e:
            self.logger.log_warning(f"Failed to sync after world import: {e}")
