from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

class NpcCombatStats(BaseModel):
    """Defines the combat statistics for an NPC."""
    health: int = Field(default=10, description="Maximum health points.")
    attack_damage_min: int = Field(default=1, description="Minimum damage per attack.")
    attack_damage_max: int = Field(default=3, description="Maximum damage per attack.")
    attack_speed: float = Field(default=1.0, description="Attacks per second.")
    damage_reduction: float = Field(default=0.0, ge=0.0, le=1.0, description="Percentage damage reduction (0.0 to 1.0).")
    armor: int = Field(default=0, description="Flat damage reduction applied after percentage reduction.")
    crit_chance: float = Field(default=0.05, ge=0.0, le=1.0, description="Chance to land a critical hit (0.0 to 1.0).")
    crit_multiplier: float = Field(default=1.5, ge=1.0, description="Damage multiplier for critical hits (e.g., 1.5 for 150%).")
    # Add other relevant stats as needed, e.g., resistances, special abilities triggers

class CharacterCoreData(BaseModel):
    """Represents the core data fields within the character metadata."""
    name: str = Field(..., description="The character's name.")
    description: Optional[str] = Field(default=None, description="A brief description of the character.")
    personality: Optional[str] = Field(default=None, description="Character's personality traits.")
    scenario: Optional[str] = Field(default=None, description="Scenario or context for the character.")
    first_mes: Optional[str] = Field(default=None, description="Character's introductory message.")
    mes_example: Optional[str] = Field(default=None, description="Example messages from the character.")
    creator_notes: Optional[str] = Field(default=None, description="Notes from the character creator.")
    system_prompt: Optional[str] = Field(default=None, description="System prompt for AI interaction.")
    post_history_instructions: Optional[str] = Field(default=None, description="Instructions for post-history processing.")
    alternate_greetings: Optional[List[str]] = Field(default=None, description="Alternative greetings.")
    character_book: Optional[Dict[str, Any]] = Field(default=None, description="Lore book associated with the character.")
    tags: Optional[List[str]] = Field(default=None, description="Tags associated with the character.")
    creator: Optional[str] = Field(default=None, description="Creator of the character card.")
    character_version: Optional[str] = Field(default=None, description="Version of the character card.")
    extensions: Dict[str, Any] = Field(default_factory=dict, description="Extension data, including card_type and world_data.")
    # World Card Specific Additions
    combat_stats: Optional[NpcCombatStats] = Field(default=None, description="Combat statistics for use in World Cards.")

class CharacterData(BaseModel):
    """Represents the full structure of the character metadata stored in PNG files."""
    spec: str = Field(default="chara_card_v2", description="Specification standard for the character card.")
    spec_version: Optional[str] = Field(default="1.0", description="Version of the specification.") # Making optional as it might not always be present
    data: CharacterCoreData = Field(..., description="The core character data.")
