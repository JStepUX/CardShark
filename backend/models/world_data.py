from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class NarratorVoice(str, Enum):
    """The persona/style of the narrator."""
    DEFAULT = "default"
    OMNISCIENT = "omniscient"
    UNRELIABLE = "unreliable"
    SARCASTIC = "sarcastic"
    HORROR = "horror"

class TimeSystem(str, Enum):
    """How time passes in the world."""
    REALTIME = "realtime"
    TURN_BASED = "turn_based"
    EVENT_BASED = "event_based"
    CINEMATIC = "cinematic"

class RoomConnection(BaseModel):
    """A connection between two rooms."""
    target_room_id: str = Field(..., description="ID of the connected room.")
    direction: str = Field(..., description="Direction of the connection (e.g., 'north', 'up').")
    description: Optional[str] = Field(default=None, description="Description of the path/connection.")
    is_locked: bool = Field(default=False, description="Whether the connection is locked.")
    key_id: Optional[str] = Field(default=None, description="ID of the item required to unlock.")

class RoomNPC(BaseModel):
    """An NPC present in a room."""
    character_id: str = Field(..., description="UUID or reference to the character card.")
    spawn_chance: float = Field(default=1.0, ge=0.0, le=1.0, description="Probability of the NPC appearing (0.0 to 1.0).")
    initial_dialogue: Optional[str] = Field(default=None, description="Specific opening line for this room.")

class Room(BaseModel):
    """A location within the world."""
    id: str = Field(..., description="Unique identifier for the room.")
    name: str = Field(..., description="Name of the room.")
    description: str = Field(..., description="Description of the room.")
    image_path: Optional[str] = Field(default=None, description="Path to the room's background image.")
    connections: List[RoomConnection] = Field(default_factory=list, description="Connections to other rooms.")
    npcs: List[RoomNPC] = Field(default_factory=list, description="NPCs that can be found here.")
    items: List[str] = Field(default_factory=list, description="List of item IDs available in the room.")
    visited: bool = Field(default=False, description="Whether the player has visited this room.")

class PlayerState(BaseModel):
    """State of the player in the world."""
    current_room_id: Optional[str] = Field(default=None, description="ID of the room the player is currently in.")
    inventory: List[str] = Field(default_factory=list, description="List of item IDs carried by the player.")
    health: int = Field(default=100, description="Current health of the player.")
    stats: Dict[str, Any] = Field(default_factory=dict, description="Arbitrary player stats.")
    flags: Dict[str, bool] = Field(default_factory=dict, description="Game flags/switches.")

class WorldSettings(BaseModel):
    """Configuration for the world mechanics."""
    narrator_voice: NarratorVoice = Field(default=NarratorVoice.DEFAULT, description="The voice style of the narrator.")
    time_system: TimeSystem = Field(default=TimeSystem.TURN_BASED, description="The time progression system.")
    entry_room_id: Optional[str] = Field(default=None, description="ID of the starting room.")
    global_scripts: List[str] = Field(default_factory=list, description="Global scripts or events active in the world.")

class WorldData(BaseModel):
    """Root model for World Card extension data."""
    rooms: List[Room] = Field(default_factory=list, description="All rooms in the world.")
    settings: WorldSettings = Field(default_factory=WorldSettings, description="World configuration.")
    player_state: PlayerState = Field(default_factory=PlayerState, description="Current state of the player.")


