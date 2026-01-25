"""
backend/models/world_card.py
Pydantic models for World Card V2 specification

World cards are character cards with:
- card_type: "world"
- world-specific extension data in extensions.world_data
"""

from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field
import uuid as uuid_module
from backend.models.world_state import WorldState, GridSize, Position


class WorldRoomPlacement(BaseModel):
    """Room placement in world grid with instance-specific overrides"""
    room_uuid: str = Field(..., description="UUID of the room card")
    grid_position: Position = Field(..., description="Position on the world grid")
    
    # Instance-specific overrides (for lazy loading and world-specific customization)
    instance_name: Optional[str] = Field(None, description="Cached room name for map display (lazy loading)")
    instance_description: Optional[str] = Field(None, description="Cached room description for tooltips")
    instance_npcs: Optional[List[Dict[str, Any]]] = Field(None, description="Instance-specific NPC assignments (overrides room card defaults)")
    instance_image_path: Optional[str] = Field(None, description="Custom image path override for this instance")
    # instance_state: Optional[Dict[str, Any]] = Field(None, description="Future: instance state (loot, doors, enemy HP, etc.)")



class WorldData(BaseModel):
    """
    World-specific extension data
    Stored in extensions.world_data of the character card
    """
    uuid: str = Field(..., description="Unique identifier for the world")
    grid_size: GridSize = Field(default_factory=lambda: GridSize(width=10, height=10), description="World grid dimensions")
    rooms: List[WorldRoomPlacement] = Field(default_factory=list, description="Room placements on the grid")
    starting_position: Position = Field(default_factory=lambda: Position(x=0, y=0), description="Where player starts")
    player_position: Position = Field(default_factory=lambda: Position(x=0, y=0), description="Current player position")
    map_image: Optional[str] = Field(None, description="Custom map backdrop image path (relative to world assets)")
    world_state: Optional[WorldState] = Field(None, description="Full world state (optional, computed)")


class WorldCardExtensions(BaseModel):
    """Extensions section for world cards"""
    card_type: Literal["world"] = Field("world", description="Card type identifier")
    world_data: WorldData = Field(..., description="World-specific data")

    class Config:
        extra = "allow"  # Allow additional extension fields


class WorldCardData(BaseModel):
    """
    Core data section for world cards
    Based on CharacterCardV2 spec with world-specific usage
    """
    name: str = Field(..., description="World name")
    description: str = Field(default="", description="World description")
    first_mes: Optional[str] = Field(None, description="World introduction text")
    system_prompt: Optional[str] = Field(None, description="World-specific system prompt/atmosphere")
    character_book: Optional[Dict[str, Any]] = Field(None, description="Lore entries for world-specific knowledge")
    character_uuid: Optional[str] = Field(None, description="World UUID (matches world_data.uuid)")
    tags: Optional[List[str]] = Field(default_factory=list, description="Tags for categorization")
    extensions: WorldCardExtensions = Field(..., description="World card extensions")

    # Standard character fields (mostly unused for worlds but required by spec)
    personality: Optional[str] = Field(None, description="Unused for worlds")
    scenario: Optional[str] = Field(None, description="Unused for worlds")
    mes_example: Optional[str] = Field(None, description="Unused for worlds")
    creator_notes: Optional[str] = Field(None, description="Notes from the world creator")
    post_history_instructions: Optional[str] = Field(None, description="Unused for worlds")
    alternate_greetings: Optional[List[str]] = Field(None, description="Alternative introduction texts")
    creator: Optional[str] = Field(None, description="World creator name")
    character_version: Optional[str] = Field(None, description="World version")


class WorldCard(BaseModel):
    """
    Complete world card structure
    Character Card V2 with card_type="world"
    """
    spec: Literal["chara_card_v2"] = Field("chara_card_v2", description="Character card specification version")
    spec_version: str = Field("2.0", description="Specification version")
    data: WorldCardData = Field(..., description="World card data")


class WorldCardSummary(BaseModel):
    """Simplified world card for API responses"""
    uuid: str = Field(..., description="World UUID")
    name: str = Field(..., description="World name")
    description: str = Field(default="", description="World description")
    image_path: Optional[str] = Field(None, description="Path to world image PNG")
    grid_size: GridSize = Field(default_factory=lambda: GridSize(width=10, height=10), description="World grid size")
    room_count: int = Field(0, description="Number of rooms placed in the world")
    created_at: Optional[str] = Field(None, description="ISO8601 creation timestamp")
    updated_at: Optional[str] = Field(None, description="ISO8601 last update timestamp")


class CreateWorldRequest(BaseModel):
    """World creation request"""
    name: str = Field(..., min_length=1, description="World name")
    description: Optional[str] = Field("", description="World description")
    grid_size: Optional[GridSize] = Field(None, description="Grid size (defaults to 10x10)")
    first_mes: Optional[str] = Field(None, description="World introduction text")
    system_prompt: Optional[str] = Field(None, description="World atmosphere/system prompt")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Fantasy Kingdom",
                "description": "A medieval fantasy world with castles, forests, and dragons",
                "grid_size": {"width": 15, "height": 15},
                "first_mes": "You arrive at the gates of a grand kingdom...",
                "system_prompt": "This is a high-fantasy medieval setting."
            }
        }


class ConvertWorldRequest(BaseModel):
    """Request to convert a character card into a world card"""
    name: str = Field(..., min_length=1, description="New world name")
    character_path: str = Field(..., description="UUID or path of the character to convert")


class UpdateWorldRequest(BaseModel):
    """World update request - all fields optional"""
    name: Optional[str] = Field(None, min_length=1, description="World name")
    description: Optional[str] = Field(None, description="World description")
    first_mes: Optional[str] = Field(None, description="World introduction text")
    system_prompt: Optional[str] = Field(None, description="World atmosphere/system prompt")
    character_book: Optional[Dict[str, Any]] = Field(None, description="Lore entries")
    grid_size: Optional[GridSize] = Field(None, description="World grid size")
    rooms: Optional[List[WorldRoomPlacement]] = Field(None, description="Room placements")
    starting_position: Optional[Position] = Field(None, description="Starting position")
    player_position: Optional[Position] = Field(None, description="Player position")
    tags: Optional[List[str]] = Field(None, description="World tags")

    class Config:
        extra = "forbid"


class RoomDeleteInfo(BaseModel):
    """Information about a room for delete preview"""
    uuid: str = Field(..., description="Room UUID")
    name: str = Field(..., description="Room name")
    reason: str = Field(..., description="Why this room will/won't be deleted")


class WorldDeletePreview(BaseModel):
    """Preview of what will happen when a world is deleted"""
    world_uuid: str = Field(..., description="UUID of the world to be deleted")
    world_name: str = Field(..., description="Name of the world to be deleted")
    rooms_to_delete: List[RoomDeleteInfo] = Field(default_factory=list, description="Rooms that will be deleted (auto-generated and orphaned)")
    rooms_to_keep: List[RoomDeleteInfo] = Field(default_factory=list, description="Rooms that will be kept (manually created or used by other worlds)")
    total_rooms: int = Field(0, description="Total number of rooms in this world")


def create_empty_world_card(name: str, world_uuid: Optional[str] = None, grid_size: Optional[GridSize] = None) -> WorldCard:
    """
    Helper function to create an empty world card

    Args:
        name: World name
        world_uuid: Optional UUID (generates one if not provided)
        grid_size: Optional grid size (defaults to 10x10)

    Returns:
        WorldCard with minimal data
    """
    if world_uuid is None:
        world_uuid = str(uuid_module.uuid4())

    if grid_size is None:
        grid_size = GridSize(width=10, height=10)

    world_data = WorldData(
        uuid=world_uuid,
        grid_size=grid_size,
        rooms=[],
        starting_position=Position(x=0, y=0),
        player_position=Position(x=0, y=0)
    )

    extensions = WorldCardExtensions(card_type="world", world_data=world_data)

    card_data = WorldCardData(
        name=name,
        description="",
        character_uuid=world_uuid,
        extensions=extensions
    )

    return WorldCard(
        spec="chara_card_v2",
        spec_version="2.0",
        data=card_data
    )
