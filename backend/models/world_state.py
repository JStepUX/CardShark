# backend/models/world_state.py
# Description: Pydantic models for representing the state of a World Card
# V2 Schema - Room-based world system

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime

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
    """A location in the world"""
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
    World State V2 Schema
    Room-based world system with grid positioning.
    This is the single canonical format used by both frontend and backend.
    """
    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat()
        }
    )

    schema_version: int = 2
    metadata: WorldMetadata
    grid_size: GridSize = Field(default_factory=GridSize)
    rooms: List[Room]
    player: PlayerState
