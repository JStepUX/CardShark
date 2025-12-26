# backend/utils/world_state_migration.py
# Description: Migration functions for converting V1 world state formats to V2

from typing import Dict, Any, List
from datetime import datetime
import uuid as uuid_module

from backend.models.world_state import (
    WorldState, Room, RoomConnection, Position, PlayerState,
    WorldMetadata, GridSize, EventDefinition,
    WorldStateV1, LocationV1
)


def generate_uuid() -> str:
    """Generate a new UUID"""
    return str(uuid_module.uuid4())


def generate_short_uuid() -> str:
    """Generate a short UUID for room IDs"""
    return uuid_module.uuid4().hex[:12]


def parse_date(date_str: Any) -> datetime:
    """Parse various date formats to datetime"""
    if isinstance(date_str, datetime):
        return date_str
    if isinstance(date_str, (int, float)):
        return datetime.fromtimestamp(date_str)
    if isinstance(date_str, str):
        try:
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        except:
            pass
    return datetime.now()


def detect_schema_version(raw_data: dict) -> int:
    """
    Detect the schema version of world state data
    Returns: 1 for v1 formats, 2 for v2 format
    """
    # Explicit v2
    if raw_data.get("schema_version") == 2:
        return 2

    # V1 backend format (has locations dict)
    if "locations" in raw_data and isinstance(raw_data["locations"], dict):
        return 1

    # V1 frontend format (has rooms array without schema_version)
    if "rooms" in raw_data and isinstance(raw_data["rooms"], list):
        return 1

    # Default to v1
    return 1


def migrate_v1_to_v2(v1_data: dict) -> WorldState:
    """
    Main migration function - routes to appropriate sub-migrator
    """
    # Detect which v1 variant
    if "locations" in v1_data and isinstance(v1_data["locations"], dict):
        return migrate_v1_backend_format(v1_data)
    elif "rooms" in v1_data and isinstance(v1_data["rooms"], list):
        return migrate_v1_frontend_format(v1_data)
    else:
        raise ValueError("Unrecognized world state format")


def migrate_v1_frontend_format(v1: dict) -> WorldState:
    """
    Migrate V1 frontend format to V2
    Frontend format already has rooms array, just needs restructuring
    """
    rooms = []

    # Process each room
    for room_data in v1.get("rooms", []):
        # Handle connections - can be array or dict
        connections_raw = room_data.get("connections", {})

        if isinstance(connections_raw, list):
            # Convert array of {direction, target_room_id} to dict
            connections_dict = {}
            for conn in connections_raw:
                direction = conn.get("direction", "").lower()
                target = conn.get("target_room_id")
                if direction and target:
                    connections_dict[direction] = target
            connections = RoomConnection(**connections_dict)
        else:
            # Already a dict
            connections = RoomConnection(**connections_raw)

        # Handle NPCs - can be array of objects or strings
        npcs_raw = room_data.get("npcs", [])
        npcs = []
        for npc in npcs_raw:
            if isinstance(npc, dict):
                npcs.append(npc.get("character_id", ""))
            else:
                npcs.append(str(npc))

        # Handle position
        position_raw = room_data.get("position", {})
        if isinstance(position_raw, dict):
            position = Position(
                x=position_raw.get("x", room_data.get("x", 0)),
                y=position_raw.get("y", room_data.get("y", 0))
            )
        else:
            position = Position(
                x=room_data.get("x", 0),
                y=room_data.get("y", 0)
            )

        # Handle events
        events = []
        for event_data in room_data.get("events", []):
            if isinstance(event_data, dict):
                events.append(EventDefinition(
                    id=event_data.get("id", f"event-{generate_short_uuid()}"),
                    type=event_data.get("type", "generic"),
                    trigger=event_data.get("trigger", "enter"),
                    data=event_data.get("data", {})
                ))

        room = Room(
            id=room_data.get("id", f"room-{generate_short_uuid()}"),
            name=room_data.get("name", "Unnamed Room"),
            description=room_data.get("description", ""),
            introduction_text=room_data.get("introduction_text", room_data.get("introduction", "")),
            image_path=room_data.get("image_path"),
            position=position,
            npcs=npcs,
            connections=connections,
            events=events,
            visited=room_data.get("visited", False)
        )
        rooms.append(room)

    # Build metadata
    metadata_raw = v1.get("metadata", {})

    # Extract metadata fields from either nested metadata or top-level
    name = metadata_raw.get("name") or v1.get("name", "Unknown World")
    description = metadata_raw.get("description") or v1.get("description", "")
    uuid_str = metadata_raw.get("uuid") or v1.get("uuid", generate_uuid())

    created_at = parse_date(
        metadata_raw.get("created_at") or
        metadata_raw.get("created_date") or
        v1.get("created_date") or
        v1.get("created_at")
    )

    last_modified = parse_date(
        metadata_raw.get("last_modified") or
        v1.get("last_modified")
    )

    metadata = WorldMetadata(
        name=name,
        description=description,
        author=metadata_raw.get("author"),
        uuid=uuid_str,
        created_at=created_at,
        last_modified=last_modified,
        cover_image=metadata_raw.get("cover_image")
    )

    # Determine grid size from room positions
    max_x = 0
    max_y = 0
    for room in rooms:
        if room.position.x > max_x:
            max_x = room.position.x
        if room.position.y > max_y:
            max_y = room.position.y

    grid_size = GridSize(
        width=max(max_x + 1, 8),
        height=max(max_y + 1, 6)
    )

    # Determine current room
    player_state_raw = v1.get("player_state", {})
    current_room_id = player_state_raw.get("current_room_id") or v1.get("current_position", "")

    # If current_position is a coordinate string, try to find the room
    if not current_room_id.startswith("room-") and rooms:
        current_room_id = rooms[0].id
    elif not current_room_id and rooms:
        current_room_id = rooms[0].id
    elif not rooms:
        current_room_id = ""

    # Build player state
    player = PlayerState(
        current_room=current_room_id,
        visited_rooms=player_state_raw.get("visited_rooms", []),
        inventory=player_state_raw.get("inventory", []),
        health=player_state_raw.get("health", 100),
        stamina=player_state_raw.get("stamina", 100),
        level=player_state_raw.get("level", 1),
        experience=player_state_raw.get("experience", 0)
    )

    return WorldState(
        schema_version=2,
        metadata=metadata,
        grid_size=grid_size,
        rooms=rooms,
        player=player
    )


def migrate_v1_backend_format(v1: dict) -> WorldState:
    """
    Migrate V1 backend format to V2
    Backend format has locations dict keyed by coordinates
    """
    rooms = []
    coord_to_room_id: Dict[str, str] = {}

    # First pass: create rooms, build coord->id map
    for coord_str, location_data in v1.get("locations", {}).items():
        # Parse coordinates
        try:
            coords = list(map(int, coord_str.split(",")))
            x, y = coords[0], coords[1]  # Ignore z-axis
        except:
            x, y = 0, 0

        # Generate room ID
        room_id = location_data.get("location_id", f"room-{generate_short_uuid()}")
        coord_to_room_id[coord_str] = room_id

        # Convert events
        events = []
        for event_data in location_data.get("events", []):
            if isinstance(event_data, dict):
                events.append(EventDefinition(
                    id=event_data.get("id", f"event-{generate_short_uuid()}"),
                    type=event_data.get("trigger", "generic"),
                    trigger=event_data.get("trigger", "enter"),
                    data={}
                ))

        room = Room(
            id=room_id,
            name=location_data.get("name", f"Room ({x}, {y})"),
            description=location_data.get("description", ""),
            introduction_text=location_data.get("introduction", ""),
            image_path=location_data.get("background"),
            position=Position(x=x, y=y),
            npcs=location_data.get("npcs", []),
            connections=RoomConnection(),  # filled in second pass
            events=events,
            visited=coord_str in v1.get("visited_positions", [])
        )
        rooms.append(room)

    # Second pass: convert coordinate exits to room ID connections
    for coord_str, location_data in v1.get("locations", {}).items():
        room_id = coord_to_room_id[coord_str]
        room = next((r for r in rooms if r.id == room_id), None)
        if not room:
            continue

        # Convert explicit_exits
        for direction, exit_def in location_data.get("explicit_exits", {}).items():
            if isinstance(exit_def, dict):
                # Get destination
                dest_coord = exit_def.get("target_coordinates")
                dest_id = exit_def.get("target_location_id")

                # Prefer coordinate lookup
                if dest_coord and dest_coord in coord_to_room_id:
                    target_room_id = coord_to_room_id[dest_coord]
                elif dest_id:
                    # Try to find by location_id
                    target_room = next((r for r in rooms if r.id == dest_id), None)
                    target_room_id = target_room.id if target_room else None
                else:
                    target_room_id = None

                # Set connection
                direction_lower = direction.lower()
                if direction_lower in ["north", "south", "east", "west"]:
                    setattr(room.connections, direction_lower, target_room_id)

    # Build metadata
    metadata = WorldMetadata(
        name=v1.get("name", "Migrated World"),
        description="",
        author=None,
        uuid=generate_uuid(),
        created_at=datetime.now(),
        last_modified=datetime.now(),
        cover_image=None
    )

    # Determine grid size
    max_x = 0
    max_y = 0
    for room in rooms:
        if room.position.x > max_x:
            max_x = room.position.x
        if room.position.y > max_y:
            max_y = room.position.y

    grid_size = GridSize(
        width=max(max_x + 1, 8),
        height=max(max_y + 1, 6)
    )

    # Player state
    current_coord = v1.get("current_position", "0,0,0")
    current_room = coord_to_room_id.get(current_coord, rooms[0].id if rooms else "")

    visited_coords = v1.get("visited_positions", [])
    visited_rooms = [coord_to_room_id[c] for c in visited_coords if c in coord_to_room_id]

    # Get player stats from v1 player state if exists
    player_v1 = v1.get("player", {})

    player = PlayerState(
        current_room=current_room,
        visited_rooms=visited_rooms,
        inventory=[],
        health=player_v1.get("health", 100),
        stamina=player_v1.get("stamina", 100),
        level=player_v1.get("level", 1),
        experience=player_v1.get("experience", 0)
    )

    return WorldState(
        schema_version=2,
        metadata=metadata,
        grid_size=grid_size,
        rooms=rooms,
        player=player
    )


def load_world_state_with_migration(raw_data: dict) -> WorldState:
    """
    Load world state, applying migration if necessary
    """
    version = detect_schema_version(raw_data)

    if version == 1:
        return migrate_v1_to_v2(raw_data)
    elif version == 2:
        return WorldState(**raw_data)
    else:
        raise ValueError(f"Unsupported schema version: {version}")
