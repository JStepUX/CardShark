"""
backend/models/room_card.py
Pydantic models for Room Card V2 specification

Room cards are character cards with:
- card_type: "room"
- room-specific extension data in extensions.room_data
"""

from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field
import uuid as uuid_module


class RoomNPC(BaseModel):
    """NPC assignment within a room"""
    character_uuid: str = Field(..., description="UUID of the character assigned to this room")
    role: Optional[str] = Field(None, description="Role of the NPC in the room (e.g., shopkeeper, guard)")
    hostile: Optional[bool] = Field(False, description="Whether the NPC is hostile to the player")


class RoomData(BaseModel):
    """
    Room-specific extension data
    Stored in extensions.room_data of the character card
    """
    uuid: str = Field(..., description="Unique identifier for the room")
    npcs: List[RoomNPC] = Field(default_factory=list, description="NPCs assigned to this room")

    # Future fields for expansion:
    # connections: List[RoomConnection] = Field(default_factory=list)
    # items: List[str] = Field(default_factory=list)
    # events: List[EventDefinition] = Field(default_factory=list)


class RoomCardExtensions(BaseModel):
    """Extensions section for room cards"""
    card_type: Literal["room"] = Field("room", description="Card type identifier")
    room_data: RoomData = Field(..., description="Room-specific data")

    class Config:
        extra = "allow"  # Allow additional extension fields


class RoomCardData(BaseModel):
    """
    Core data section for room cards
    Based on CharacterCardV2 spec with room-specific usage
    """
    name: str = Field(..., description="Room name")
    description: str = Field(default="", description="Room description")
    first_mes: Optional[str] = Field(None, description="Introduction text when entering the room")
    system_prompt: Optional[str] = Field(None, description="Room-specific system prompt/atmosphere")
    character_book: Optional[Dict[str, Any]] = Field(None, description="Lore entries for room-specific knowledge")
    character_uuid: Optional[str] = Field(None, description="Room UUID (matches room_data.uuid)")
    tags: Optional[List[str]] = Field(default_factory=list, description="Tags for categorization")
    extensions: RoomCardExtensions = Field(..., description="Room card extensions")

    # Standard character fields (mostly unused for rooms but required by spec)
    personality: Optional[str] = Field(None, description="Unused for rooms")
    scenario: Optional[str] = Field(None, description="Unused for rooms")
    mes_example: Optional[str] = Field(None, description="Unused for rooms")
    creator_notes: Optional[str] = Field(None, description="Notes from the room creator")
    post_history_instructions: Optional[str] = Field(None, description="Unused for rooms")
    alternate_greetings: Optional[List[str]] = Field(None, description="Alternative introduction texts")
    creator: Optional[str] = Field(None, description="Room creator name")
    character_version: Optional[str] = Field(None, description="Room version")


class RoomCard(BaseModel):
    """
    Complete room card structure
    Character Card V2 with card_type="room"
    """
    spec: Literal["chara_card_v2"] = Field("chara_card_v2", description="Character card specification version")
    spec_version: str = Field("2.0", description="Specification version")
    data: RoomCardData = Field(..., description="Room card data")


class RoomCardSummary(BaseModel):
    """Simplified room card for API responses"""
    uuid: str = Field(..., description="Room UUID")
    name: str = Field(..., description="Room name")
    description: str = Field(default="", description="Room description")
    image_path: Optional[str] = Field(None, description="Path to room image PNG")
    assigned_worlds: Optional[List[str]] = Field(default_factory=list, description="World UUIDs this room is assigned to")
    npc_count: Optional[int] = Field(0, description="Number of NPCs in the room")
    created_at: Optional[str] = Field(None, description="ISO8601 creation timestamp")
    updated_at: Optional[str] = Field(None, description="ISO8601 last update timestamp")


class CreateRoomRequest(BaseModel):
    """Room creation request"""
    name: str = Field(..., min_length=1, description="Room name")
    description: Optional[str] = Field("", description="Room description")
    first_mes: Optional[str] = Field(None, description="Introduction text")
    system_prompt: Optional[str] = Field(None, description="Room atmosphere/system prompt")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Tavern Common Room",
                "description": "A cozy tavern with wooden tables and a crackling fireplace",
                "first_mes": "You enter the warm, bustling tavern. The smell of ale and roasted meat fills the air.",
                "system_prompt": "This is a friendly tavern where adventurers gather."
            }
        }


class UpdateRoomRequest(BaseModel):
    """Room update request - all fields optional"""
    name: Optional[str] = Field(None, min_length=1, description="Room name")
    description: Optional[str] = Field(None, description="Room description")
    first_mes: Optional[str] = Field(None, description="Introduction text")
    system_prompt: Optional[str] = Field(None, description="Room atmosphere/system prompt")
    character_book: Optional[Dict[str, Any]] = Field(None, description="Lore entries")
    npcs: Optional[List[RoomNPC]] = Field(None, description="NPC assignments")
    tags: Optional[List[str]] = Field(None, description="Room tags")

    class Config:
        extra = "forbid"


def create_empty_room_card(name: str, room_uuid: Optional[str] = None) -> RoomCard:
    """
    Helper function to create an empty room card

    Args:
        name: Room name
        room_uuid: Optional UUID (generates one if not provided)

    Returns:
        RoomCard with minimal data
    """
    if room_uuid is None:
        room_uuid = str(uuid_module.uuid4())

    room_data = RoomData(uuid=room_uuid, npcs=[])
    extensions = RoomCardExtensions(card_type="room", room_data=room_data)

    card_data = RoomCardData(
        name=name,
        description="",
        character_uuid=room_uuid,
        extensions=extensions
    )

    return RoomCard(
        spec="chara_card_v2",
        spec_version="2.0",
        data=card_data
    )
