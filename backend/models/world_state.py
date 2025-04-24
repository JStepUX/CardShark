# backend/models/world_state.py
# Description: Pydantic models for representing the state of a World Card.

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class ExitDefinition(BaseModel):
    target_coordinates: Optional[str] = None
    target_location_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    locked: bool = False
    key_item_id: Optional[str] = None

class EventDefinition(BaseModel):
    id: str
    trigger: str  # 'enter', 'look', 'timer', 'interact', etc.
    description: str
    conditions: Optional[List[str]] = None
    cooldown: Optional[int] = None
    # Add fields for potential actions/outcomes later if needed

class Location(BaseModel):
    name: str
    coordinates: Optional[List[int]] = None  # [x,y,z] - Optional for unconnected locations
    location_id: str = Field(..., description="Unique identifier for the location")
    description: str
    introduction: Optional[str] = None # Added introduction field
    zone_id: Optional[str] = None
    room_type: Optional[str] = None
    notes: Optional[str] = None
    background: Optional[str] = None # Filename for background image
    events: List[EventDefinition] = []
    npcs: List[str] = []  # List of character UUIDs/filenames
    explicit_exits: Optional[Dict[str, ExitDefinition]] = Field(default_factory=dict) # e.g., {"north": ExitDefinition(...)}
    lore_source: Optional[str] = None  # Reference to lore entry if extracted from character
    connected: bool = True  # Whether this location is connected to the navigable map

class PlayerState(BaseModel):
    health: int = 100
    stamina: int = 100
    level: int = 1
    experience: int = 0
    # Add inventory, status effects etc. later

class UnconnectedLocation(BaseModel):
    location_id: str
    name: str
    description: str
    lore_source: str  # Lore entry key or description that referenced this location

class WorldState(BaseModel):
    name: str
    version: str = "1.0" # For schema migration support
    current_position: str = "0,0,0" # Coordinate string "x,y,z"
    visited_positions: List[str] = Field(default_factory=list)
    locations: Dict[str, Location] = Field(default_factory=dict) # Key is coordinate string for connected locations
    unconnected_locations: Dict[str, UnconnectedLocation] = Field(default_factory=dict) # Key is location_id
    player: PlayerState = Field(default_factory=PlayerState)
    base_character_id: Optional[str] = None  # ID/filename of character card this world is based on
    # Add world-level variables, time, weather etc. later