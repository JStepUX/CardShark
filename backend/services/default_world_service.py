"""
backend/services/default_world_service.py
Service to ensure a default demo world exists on first run or after DB wipe.

Creates a small demo world with 4 rooms and 4 NPCs to showcase world-play features.
Follows the same pattern as the built-in CardShark assistant (cardshark-general-assistant-v1).
"""

import sys
from io import BytesIO
from pathlib import Path
from typing import List, Optional

from PIL import Image

from backend.log_manager import LogManager
from backend.png_metadata_handler import PngMetadataHandler
from backend.services.character_service import CharacterService
from backend.services.world_card_service import WorldCardService
from backend.settings_manager import SettingsManager

from backend.models.world_card import (
    WorldCard, WorldCardData, WorldCardExtensions, WorldData,
    WorldRoomPlacement, create_empty_world_card,
)
from backend.models.world_state import GridSize, Position
from backend.models.room_card import (
    RoomCard, RoomCardData, RoomCardExtensions, RoomData,
    RoomNPC, create_empty_room_card,
)

# ---------------------------------------------------------------------------
# Known UUIDs — deterministic so we can detect our own assets
# ---------------------------------------------------------------------------
DEMO_WORLD_UUID  = "cardshark-demo-world-v1"
DEMO_ROOM_TAVERN = "cardshark-demo-room-tavern-v1"
DEMO_ROOM_SQUARE = "cardshark-demo-room-square-v1"
DEMO_ROOM_FOREST = "cardshark-demo-room-forest-v1"
DEMO_ROOM_CAVE   = "cardshark-demo-room-cave-v1"

# ---------------------------------------------------------------------------
# NPC definitions — bundled character PNGs from backend/assets/defaults/
# Each entry maps a key to a filename stem.  UUIDs are read from the PNG
# metadata at deploy time (no hardcoded UUIDs needed).
# ---------------------------------------------------------------------------
_NPC_DEFS = [
    {"key": "angry-prostitute",    "filename": "Angry Prostitute"},
    {"key": "berserker-huntress",  "filename": "Berserker Huntress"},
    {"key": "corrupted-knight",    "filename": "Corrupted Knight"},
    {"key": "death-priestess",     "filename": "Death Priestess"},
    {"key": "evil-goblin",         "filename": "Evil Goblin"},
    {"key": "goblin-flamecaller",  "filename": "Goblin Flamecaller"},
    {"key": "orcish-bruiser",      "filename": "Orcish Bruiser"},
]

# ---------------------------------------------------------------------------
# Room definitions — NPCs reference keys from _NPC_DEFS above.
# hostile / monster_level are per-room-assignment (same NPC could be
# friendly in one room and hostile in another).
# ---------------------------------------------------------------------------
_ROOM_DEFS = [
    {
        "uuid": DEMO_ROOM_TAVERN,
        "name": "Rusty Tankard Tavern",
        "description": "A cozy two-story tavern with creaking floorboards, a crackling stone fireplace, and the ever-present smell of roasted meat and spiced ale.",
        "first_mes": "You push open the heavy oak door and step into the warmth of the Rusty Tankard. A fire crackles in the hearth, casting dancing shadows across rough-hewn tables where a handful of patrons nurse their drinks.",
        "system_prompt": "This is the Rusty Tankard, a friendly tavern. The atmosphere is warm and inviting. Patrons chat quietly over ale.",
        "color": (120, 70, 30),
        "grid_pos": (2, 2),
        "npcs": [
            {"key": "angry-prostitute",   "role": "entertainer", "hostile": False},
            {"key": "berserker-huntress", "role": "mercenary",   "hostile": False},
        ],
    },
    {
        "uuid": DEMO_ROOM_SQUARE,
        "name": "Town Square",
        "description": "A bustling cobblestone plaza at the heart of a small frontier town. Market stalls ring a weathered stone fountain.",
        "first_mes": "Sunlight washes over the cobblestone square. Merchants hawk their wares, children dart between market stalls, and the gentle splash of the old fountain provides a soothing backdrop to the daily bustle.",
        "system_prompt": "This is the town square — the social hub of a small frontier settlement. It's daytime and the market is busy.",
        "color": (160, 150, 130),
        "grid_pos": (4, 2),
        "npcs": [
            {"key": "death-priestess",   "role": "mystic", "hostile": False},
            {"key": "corrupted-knight",  "role": "guard",  "hostile": False},
        ],
    },
    {
        "uuid": DEMO_ROOM_FOREST,
        "name": "Whispering Woods",
        "description": "A dense, ancient forest where shafts of pale light filter through a high canopy. Strange sounds echo between the gnarled trunks.",
        "first_mes": "The trail narrows as ancient oaks close in around you. Leaves whisper overhead in a language almost understood, and somewhere in the undergrowth, something is watching.",
        "system_prompt": "This is the Whispering Woods — a dangerous forest outside town. Wildlife is hostile. The atmosphere is tense and foreboding.",
        "color": (30, 80, 30),
        "grid_pos": (6, 2),
        "npcs": [
            {"key": "orcish-bruiser", "role": "predator", "hostile": True, "monster_level": 5},
        ],
    },
    {
        "uuid": DEMO_ROOM_CAVE,
        "name": "Goblin Cave",
        "description": "A damp, winding cave reeking of smoke and rot. Crude torches flicker on the walls, and scratching sounds echo from deeper within.",
        "first_mes": "The cave mouth gapes before you like a dark maw. A foul breeze carries the stench of smoke and something worse. Crude goblin totems mark the entrance — a warning to the wise.",
        "system_prompt": "This is a goblin-infested cave. It's dark, dangerous, and the goblins are hostile. Torchlight flickers on damp stone walls.",
        "color": (50, 45, 40),
        "grid_pos": (4, 4),
        "npcs": [
            {"key": "evil-goblin",        "role": "raider", "hostile": True, "monster_level": 3},
            {"key": "goblin-flamecaller",  "role": "raider", "hostile": True, "monster_level": 7},
        ],
    },
]


class DefaultWorldService:
    """Creates and deploys the built-in demo world on first run."""

    def __init__(
        self,
        character_service: CharacterService,
        world_card_service: WorldCardService,
        png_handler: PngMetadataHandler,
        settings_manager: SettingsManager,
        logger: LogManager,
    ):
        self.character_service = character_service
        self.world_card_service = world_card_service
        self.png_handler = png_handler
        self.settings_manager = settings_manager
        self.logger = logger

    # ------------------------------------------------------------------
    # Directory helpers
    # ------------------------------------------------------------------

    def _get_characters_dir(self) -> Path:
        from backend.utils.path_utils import get_application_base_path

        character_dir = self.settings_manager.get_setting("character_directory")
        if character_dir:
            p = Path(character_dir)
            if p.is_absolute():
                p.mkdir(parents=True, exist_ok=True)
                return p
            p = get_application_base_path() / character_dir
            p.mkdir(parents=True, exist_ok=True)
            return p

        default_dir = get_application_base_path() / "characters"
        default_dir.mkdir(parents=True, exist_ok=True)
        return default_dir

    def _get_assets_dir(self) -> Path:
        """Resolve bundled default assets (handles PyInstaller frozen builds)."""
        if getattr(sys, "frozen", False):
            return Path(sys._MEIPASS) / "backend" / "assets" / "defaults"
        return Path(__file__).resolve().parent.parent / "assets" / "defaults"

    # ------------------------------------------------------------------
    # Image helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _make_solid_png(color: tuple, size: tuple = (512, 512)) -> bytes:
        """Generate a solid-color PNG image in memory."""
        img = Image.new("RGB", size, color=color)
        buf = BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def _get_defaults_dir(self) -> Path:
        """Get the defaults/ directory at the application base for demo/test content."""
        from backend.utils.path_utils import get_application_base_path
        defaults_dir = get_application_base_path() / "defaults"
        defaults_dir.mkdir(parents=True, exist_ok=True)
        return defaults_dir

    def deploy_bundled_characters(self) -> None:
        """
        Populate defaults/ from backend/assets/defaults/.
        Any PNG in the bundled assets that isn't already in defaults/ gets
        copied over.  No manifest — just files in a directory.  Works with
        PyInstaller (assets resolve via sys._MEIPASS).
        """
        assets_dir = self._get_assets_dir()
        if not assets_dir.exists():
            return

        defaults_dir = self._get_defaults_dir()

        deployed = 0
        for src in assets_dir.glob("*.png"):
            dest = defaults_dir / src.name
            if dest.exists():
                continue
            dest.write_bytes(src.read_bytes())
            deployed += 1

        if deployed:
            self.logger.log_step(f"Deployed {deployed} bundled character(s) to defaults/.")

    def ensure_default_world(self) -> None:
        """
        Idempotent provisioning — creates the demo world only if it doesn't exist on disk.
        All demo content goes to defaults/ to keep the player's characters dir clean.
        """
        defaults_dir = self._get_defaults_dir()
        world_png = defaults_dir / f"{DEMO_WORLD_UUID}.png"

        if world_png.exists():
            self.logger.log_step("Default demo world already exists, skipping.")
            return

        self.logger.log_step("Provisioning default demo world...")

        # 1. Resolve NPC UUIDs from bundled PNGs in defaults/
        npc_uuids = self._resolve_npc_uuids(defaults_dir)

        # 2. Create room PNGs (returns placement list for the world)
        placements = self._create_demo_rooms(defaults_dir, npc_uuids)

        # 3. Create the world PNG
        self._create_demo_world(defaults_dir, placements)

        self.logger.log_step("Default demo world provisioned successfully.")

    # ------------------------------------------------------------------
    # NPC deployment
    # ------------------------------------------------------------------

    def _resolve_npc_uuids(self, defaults_dir: Path) -> dict:
        """
        Read character_uuid from each bundled NPC PNG in defaults/.
        deploy_bundled_characters() has already copied them there; if a file
        is missing we fall back to assets/defaults/ directly.

        Returns a dict mapping NPC key → character_uuid.
        """
        assets_dir = self._get_assets_dir()
        uuid_map: dict = {}

        for npc_def in _NPC_DEFS:
            key = npc_def["key"]
            filename = f"{npc_def['filename']}.png"
            dest_path = defaults_dir / filename

            # If not in defaults/, try copying from bundled assets
            if not dest_path.exists():
                bundled = assets_dir / filename if assets_dir.exists() else None
                if bundled and bundled.exists():
                    dest_path.write_bytes(bundled.read_bytes())
                    self.logger.log_step(f"Deployed bundled NPC: {npc_def['filename']}")
                else:
                    self.logger.log_warning(
                        f"NPC asset not found for '{npc_def['filename']}' — skipping"
                    )
                    continue

            # Read UUID from the PNG metadata
            try:
                meta = self.png_handler.read_character_data(dest_path)
                data_sec = (meta or {}).get("data", meta or {})
                uuid_map[key] = data_sec.get("character_uuid", key)
            except Exception as e:
                self.logger.log_warning(f"Could not read UUID from {filename}: {e}")
                uuid_map[key] = key  # use key as fallback UUID

        return uuid_map

    # ------------------------------------------------------------------
    # Room creation
    # ------------------------------------------------------------------

    def _create_demo_rooms(self, defaults_dir: Path, npc_uuids: dict) -> List[WorldRoomPlacement]:
        """Create 4 demo room PNGs and return WorldRoomPlacements for the world card."""
        placements: List[WorldRoomPlacement] = []

        for room_def in _ROOM_DEFS:
            room_uuid = room_def["uuid"]
            file_path = defaults_dir / f"{room_uuid}.png"

            # Build resolved NPC list for this room (used by both room card and placement)
            resolved_npcs = []
            for npc_ref in room_def.get("npcs", []):
                actual_uuid = npc_uuids.get(npc_ref["key"])
                if not actual_uuid:
                    continue
                resolved_npcs.append({
                    "character_uuid": actual_uuid,
                    "role": npc_ref.get("role"),
                    "hostile": npc_ref.get("hostile", False),
                    "monster_level": npc_ref.get("monster_level"),
                })

            if not file_path.exists():
                # Build room card
                room_card = create_empty_room_card(
                    name=room_def["name"],
                    room_uuid=room_uuid,
                    created_by_world_uuid=DEMO_WORLD_UUID,
                )
                room_card.data.description = room_def["description"]
                room_card.data.first_mes = room_def["first_mes"]
                room_card.data.system_prompt = room_def["system_prompt"]

                # Assign NPCs to the room card
                room_card.data.extensions.room_data.npcs = [
                    RoomNPC(
                        character_uuid=n["character_uuid"],
                        role=n.get("role"),
                        hostile=n.get("hostile", False),
                        monster_level=n.get("monster_level"),
                    )
                    for n in resolved_npcs
                ]

                # Generate image + embed metadata
                image_bytes = self._make_solid_png(room_def["color"])
                card_dict = room_card.model_dump(mode="json", exclude_none=True)
                stamped = self.png_handler.write_metadata(image_bytes, card_dict)
                file_path.write_bytes(stamped)
                self.logger.log_step(f"Created demo room: {room_def['name']}")

                # Sync into DB
                self.character_service.sync_character_file(str(file_path))

            # Add placement for world grid (instance_npcs feeds the splash screen count)
            gx, gy = room_def["grid_pos"]
            placements.append(WorldRoomPlacement(
                room_uuid=room_uuid,
                grid_position=Position(x=gx, y=gy),
                instance_name=room_def["name"],
                instance_description=room_def["description"],
                instance_npcs=resolved_npcs if resolved_npcs else None,
            ))

        return placements

    # ------------------------------------------------------------------
    # World creation
    # ------------------------------------------------------------------

    def _create_demo_world(self, defaults_dir: Path, placements: List[WorldRoomPlacement]) -> None:
        """Create the demo world PNG with room placements."""
        file_path = defaults_dir / f"{DEMO_WORLD_UUID}.png"

        world_card = create_empty_world_card(
            name="CardShark Demo World",
            world_uuid=DEMO_WORLD_UUID,
            grid_size=GridSize(width=10, height=10),
        )
        world_card.data.description = (
            "A small frontier settlement on the edge of wild lands. "
            "Explore the tavern, browse the market, venture into the woods, "
            "or dare the goblin cave."
        )
        world_card.data.first_mes = (
            "You arrive at a modest frontier town as the afternoon sun warms the cobblestones. "
            "Ahead lies the town square with its bubbling fountain, and to one side the welcoming glow "
            "of the Rusty Tankard tavern. Beyond the palisade walls, dark woods stretch to the horizon."
        )
        world_card.data.extensions.world_data.rooms = placements
        world_card.data.extensions.world_data.starting_position = Position(x=2, y=2)
        world_card.data.extensions.world_data.player_position = Position(x=2, y=2)

        # Generate image + embed metadata
        image_bytes = self._make_solid_png((32, 96, 32))  # dark green, matches WorldCardService default
        card_dict = world_card.model_dump(mode="json", exclude_none=True)
        stamped = self.png_handler.write_metadata(image_bytes, card_dict)
        file_path.write_bytes(stamped)
        self.logger.log_step("Created demo world: CardShark Demo World")

        # Sync into DB
        self.character_service.sync_character_file(str(file_path))
