"""
backend/models/world_progress.py
Pydantic models for World User Progress API.

These models define the schema for storing and transferring world playthrough
progress per-user. Progress is keyed by (world_uuid, user_uuid) composite key.

Inventory data is stored as JSON blobs in SQLite. The Pydantic models here
must accept the frontend's shape (camelCase fields, full item objects in
equipped slots). We use model_config extra="allow" to be permissive with
new item fields added on the frontend (e.g. weaponProperties, consumableSubtype).
"""
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from datetime import datetime


class TimeState(BaseModel):
    """Time state for day/night cycle progression."""
    currentDay: int = 1
    messagesInDay: int = 0
    totalMessages: int = 0
    timeOfDay: float = 0.0  # 0.0-1.0 (0=dawn, 0.5=noon, 1.0=midnight)
    lastMessageTimestamp: Optional[str] = None


class NPCRelationship(BaseModel):
    """Individual NPC relationship data."""
    npc_uuid: str
    affinity: int = 20  # 0-100 scale
    tier: str = "stranger"  # hostile, stranger, acquaintance, friend, best_friend
    last_interaction: Optional[str] = None
    total_interactions: int = 0
    flags: List[str] = Field(default_factory=list)
    sentiment_history: List[float] = Field(default_factory=list)
    messages_since_last_gain: int = 0
    last_sentiment_gain: Optional[str] = None
    affinity_gained_today: int = 0
    affinity_day_started: int = 1


class NpcInstanceState(BaseModel):
    """Status of an individual NPC within a room instance."""
    status: str = "alive"  # alive, incapacitated, dead


class RoomInstanceState(BaseModel):
    """Runtime state for a specific room instance."""
    npc_states: Dict[str, NpcInstanceState] = Field(default_factory=dict)


class ItemStats(BaseModel):
    """Combat stat modifiers for an item."""
    model_config = {"extra": "allow"}

    damage: Optional[int] = None
    defense: Optional[int] = None
    armor: Optional[int] = None
    healPercent: Optional[float] = None
    healMin: Optional[int] = None
    attackBonus: Optional[int] = None
    damageBonus: Optional[int] = None
    defenseBonus: Optional[int] = None
    buffDuration: Optional[int] = None
    aoeDamage: Optional[int] = None
    sellValue: Optional[int] = None


class WeaponProperties(BaseModel):
    """Special weapon behavior properties."""
    model_config = {"extra": "allow"}

    cleave: Optional[bool] = None
    armorPenPercent: Optional[float] = None
    noLOSRequired: Optional[bool] = None
    aimedShot: Optional[bool] = None
    reload: Optional[bool] = None
    blastPattern: Optional[str] = None  # radius_3x3, cross
    friendlyFire: Optional[bool] = None
    friendlyFireMultiplier: Optional[float] = None


class InventoryItem(BaseModel):
    """
    Single inventory item. Matches frontend InventoryItem interface.

    Supports all item types: weapon, armor, consumable, loot.
    Uses extra="allow" for forward compatibility with new fields.
    """
    model_config = {"extra": "allow"}

    id: str
    name: str
    type: str  # weapon, armor, consumable, loot
    # Weapon fields
    subtype: Optional[str] = None  # heavy_melee, light_melee, heavy_ranged, etc.
    weaponCategory: Optional[str] = None  # melee, ranged
    stats: Optional[ItemStats] = None
    weaponProperties: Optional[WeaponProperties] = None
    apCost: Optional[int] = None
    endsTurn: Optional[bool] = None
    attackRange: Optional[int] = None
    minRange: Optional[int] = None
    # Consumable fields
    consumableSubtype: Optional[str] = None  # med, buff, bomb
    # Loot fields
    lootSubtype: Optional[str] = None  # vendor_trash, quest_item, crafting_material
    # Stacking
    stackCount: Optional[int] = None
    maxStack: Optional[int] = None
    # Display
    imagePath: Optional[str] = None
    description: Optional[str] = None
    canSell: Optional[bool] = None
    canDrop: Optional[bool] = None
    # Legacy fields (kept for backward compatibility with old saves)
    equipped: Optional[bool] = None
    damage_bonus: Optional[int] = None
    defense_bonus: Optional[int] = None
    weapon_type: Optional[str] = None  # Legacy: melee, ranged
    attack_range: Optional[int] = None  # Legacy: snake_case version


class CharacterInventory(BaseModel):
    """
    Character inventory with equipment slots.

    Matches frontend CharacterInventory interface:
    - equippedWeapon: full item object (not just an ID)
    - equippedArmor: full item object (not just an ID)
    - items: list of item objects

    Also accepts legacy format with equipped_weapon_id for migration.
    """
    model_config = {"extra": "allow"}

    # Current frontend format (camelCase, full objects)
    equippedWeapon: Optional[InventoryItem] = None
    equippedArmor: Optional[InventoryItem] = None
    items: List[InventoryItem] = Field(default_factory=list)
    # Legacy format (snake_case, ID references) - accepted for migration
    equipped_weapon_id: Optional[str] = None
    equipped_armor_id: Optional[str] = None


class WorldUserProgress(BaseModel):
    """
    Complete world playthrough progress for a user.
    Stored in SQLite keyed by (world_uuid, user_uuid).
    """
    world_uuid: str
    user_uuid: str

    # Progression
    player_xp: int = 0
    player_level: int = 1
    player_gold: int = 0

    # State
    current_room_uuid: Optional[str] = None
    bonded_ally_uuid: Optional[str] = None
    time_state: Optional[TimeState] = None
    npc_relationships: Optional[Dict[str, NPCRelationship]] = None
    player_inventory: Optional[CharacterInventory] = None
    ally_inventory: Optional[CharacterInventory] = None
    room_states: Optional[Dict[str, RoomInstanceState]] = None

    # Metadata
    last_played_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class WorldUserProgressUpdate(BaseModel):
    """
    Partial update for world user progress.
    All fields are optional for PATCH-style updates.
    """
    player_xp: Optional[int] = None
    player_level: Optional[int] = None
    player_gold: Optional[int] = None
    current_room_uuid: Optional[str] = None
    bonded_ally_uuid: Optional[str] = None  # Empty string "" clears the ally
    time_state: Optional[TimeState] = None
    npc_relationships: Optional[Dict[str, NPCRelationship]] = None
    player_inventory: Optional[CharacterInventory] = None
    ally_inventory: Optional[CharacterInventory] = None
    room_states: Optional[Dict[str, RoomInstanceState]] = None


class WorldUserProgressSummary(BaseModel):
    """
    Summary of a user's progress for list endpoints.
    Used in progress-summary to show save slots.
    """
    user_uuid: str
    user_name: Optional[str] = None  # Resolved from user profile
    player_level: int = 1
    player_xp: int = 0
    player_gold: int = 0
    current_room_uuid: Optional[str] = None
    last_played_at: Optional[str] = None
