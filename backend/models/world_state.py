# backend/models/world_state.py
# Description: Pydantic models for representing the state of a World Card
# Unified schema that aligns frontend and backend

from pydantic import BaseModel, Field
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
    Unified World State
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

# Backward compatibility aliases (for existing code that imports these)
class UnconnectedLocation(BaseModel):
    """Legacy unconnected location"""
    location_id: str
    name: str
    description: str
    lore_source: str
