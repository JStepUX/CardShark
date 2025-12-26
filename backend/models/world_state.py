# backend/models/world_state.py
# Description: Pydantic models for representing the state of a World Card (V2 Schema)
# This is the unified schema that aligns frontend and backend

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# ============================================================================
# V2 Schema Models (Canonical Format)
# ============================================================================

class Position(BaseModel):
    """2D grid position"""
    x: int
    y: int

class RoomConnection(BaseModel):
    """Directional connection to another room"""
    north: Optional[str] = None  # room ID or null
    south: Optional[str] = None
    east: Optional[str] = None
    west: Optional[str] = None

class EventDefinition(BaseModel):
    """Event that can occur in a room"""
    id: str
    type: str
    trigger: str
    data: Dict[str, Any] = Field(default_factory=dict)

class Room(BaseModel):
    """A location in the world (V2 format)"""
    id: str
    name: str
    description: str = ""
    introduction_text: str = ""
    image_path: Optional[str] = None
    position: Position
    npcs: List[str] = Field(default_factory=list)  # character UUIDs
    connections: RoomConnection = Field(default_factory=RoomConnection)
    events: List[EventDefinition] = Field(default_factory=list)
    visited: bool = False

class WorldMetadata(BaseModel):
    """Metadata about the world"""
    name: str
    description: str = ""
    author: Optional[str] = None
    uuid: str
    created_at: datetime
    last_modified: datetime
    cover_image: Optional[str] = None

class GridSize(BaseModel):
    """Grid dimensions"""
    width: int = 8
    height: int = 6

class PlayerState(BaseModel):
    """Player state in the world"""
    current_room: str  # room ID (not coordinates)
    visited_rooms: List[str] = Field(default_factory=list)  # room IDs
    inventory: List[str] = Field(default_factory=list)
    health: int = 100
    stamina: int = 100
    level: int = 1
    experience: int = 0

class WorldState(BaseModel):
    """
    Unified World State (V2 Schema)
    This format is used by both frontend and backend.
    """
    schema_version: int = 2
    metadata: WorldMetadata
    grid_size: GridSize = Field(default_factory=GridSize)
    rooms: List[Room]
    player: PlayerState

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

# ============================================================================
# V1 Schema Models (Legacy - for migration only)
# ============================================================================

class ExitDefinitionV1(BaseModel):
    """V1 exit definition"""
    target_coordinates: Optional[str] = None
    target_location_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    locked: bool = False
    key_item_id: Optional[str] = None

class EventDefinitionV1(BaseModel):
    """V1 event definition"""
    id: str
    trigger: str
    description: str
    conditions: Optional[List[str]] = None
    cooldown: Optional[int] = None

class LocationV1(BaseModel):
    """V1 Location (backend format)"""
    name: str
    coordinates: Optional[List[int]] = None
    location_id: str = Field(..., description="Unique identifier for the location")
    description: str
    introduction: Optional[str] = None
    zone_id: Optional[str] = None
    room_type: Optional[str] = None
    notes: Optional[str] = None
    background: Optional[str] = None
    events: List[EventDefinitionV1] = Field(default_factory=list)
    npcs: List[str] = Field(default_factory=list)
    explicit_exits: Optional[Dict[str, ExitDefinitionV1]] = Field(default_factory=dict)
    lore_source: Optional[str] = None
    connected: bool = True

class PlayerStateV1(BaseModel):
    """V1 player state"""
    health: int = 100
    stamina: int = 100
    level: int = 1
    experience: int = 0

class UnconnectedLocation(BaseModel):
    """V1 unconnected location"""
    location_id: str
    name: str
    description: str
    lore_source: str

class WorldStateV1(BaseModel):
    """V1 World State (backend format with locations dict)"""
    name: str
    version: str = "1.0"
    current_position: str = "0,0,0"
    visited_positions: List[str] = Field(default_factory=list)
    locations: Dict[str, LocationV1] = Field(default_factory=dict)
    unconnected_locations: Dict[str, UnconnectedLocation] = Field(default_factory=dict)
    player: PlayerStateV1 = Field(default_factory=PlayerStateV1)
    base_character_id: Optional[str] = None

# Legacy exports for backward compatibility
Location = LocationV1
ExitDefinition = ExitDefinitionV1
