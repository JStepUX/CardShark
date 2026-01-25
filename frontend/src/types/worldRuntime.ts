// frontend/src/types/worldRuntime.ts
// Runtime types for world state during gameplay.
// These types align with backend/models/world_state.py

// =============================================================================
// Position and Grid Types
// =============================================================================

export interface Position {
    x: number;
    y: number;
}

export interface GridSize {
    width: number;
    height: number;
}

// =============================================================================
// Room Connection Types
// =============================================================================

/**
 * Cardinal direction connections for a room.
 * Each direction holds the ID of the connected room, or null if no connection.
 */
export interface RoomConnection {
    north: string | null;
    south: string | null;
    east: string | null;
    west: string | null;
}

// =============================================================================
// Event System Types
// =============================================================================

export interface EventDefinition {
    id: string;
    type: string;
    trigger: string;
    data: Record<string, any>;
}

// =============================================================================
// Narrator and Time System Enums
// =============================================================================

export enum NarratorVoice {
    DEFAULT = "default",
    OMNISCIENT = "omniscient",
    UNRELIABLE = "unreliable",
    SARCASTIC = "sarcastic",
    HORROR = "horror"
}

export enum TimeSystem {
    REALTIME = "realtime",
    TURN_BASED = "turn_based",
    EVENT_BASED = "event_based",
    CINEMATIC = "cinematic"
}

// =============================================================================
// Room Runtime Type
// =============================================================================

/**
 * Runtime representation of a room during gameplay.
 * This is the processed form of room data, not the storage format.
 */
export interface RuntimeRoom {
    id: string;
    name: string;
    description: string;
    introduction_text: string;
    image_path: string | null;
    position: Position;
    npcs: string[];  // character UUIDs
    connections: RoomConnection;
    events: EventDefinition[];
    visited: boolean;
}

// =============================================================================
// Affinity and Relationship Types
// =============================================================================

/**
 * Affinity tier levels for NPC relationships.
 * Determines dialogue options, combat assistance, and unlockable content.
 */
export enum AffinityTier {
    HOSTILE = 'hostile',           // 0-19: NPC is antagonistic
    STRANGER = 'stranger',         // 20-39: Default state, neutral
    ACQUAINTANCE = 'acquaintance', // 40-59: Friendly, basic trust
    FRIEND = 'friend',             // 60-79: Close relationship
    BEST_FRIEND = 'best_friend'    // 80-100: Maximum affinity
}

/**
 * Individual NPC relationship data.
 * Tracks affinity level, interaction history, and special flags.
 */
export interface NPCRelationship {
    npc_uuid: string;
    affinity: number;              // 0-100 scale
    tier: AffinityTier;
    last_interaction: string;      // ISO8601 timestamp
    total_interactions: number;
    flags: string[];               // Special states: 'romanced', 'rival', 'quest_giver', etc.

    // Sentiment tracking for conversation-based affinity
    sentiment_history: number[];   // Last N valence scores from conversations
    messages_since_last_gain: number;  // Cooldown tracker
    last_sentiment_gain: string;   // ISO8601 timestamp of last sentiment-based affinity gain

    // Daily affinity tracking (prevents farming)
    affinity_gained_today: number; // Affinity gained in current day
    affinity_day_started: number;  // Day number when tracking started
}

// =============================================================================
// Time System Types
// =============================================================================

/**
 * Time state for day/night cycle progression.
 * Time advances based on message count, not real-time.
 */
export interface TimeState {
    currentDay: number;           // Day counter (starts at 1)
    messagesInDay: number;        // Messages since day started (0-messagesPerDay)
    totalMessages: number;        // Total messages in world session
    timeOfDay: number;            // 0.0-1.0 (0=dawn, 0.5=noon, 1.0=midnight)
    lastMessageTimestamp: string; // ISO8601
}

/**
 * Configuration for time system behavior.
 */
export interface TimeConfig {
    messagesPerDay: number;       // Messages required for full day cycle (default: 50)
    enableDayNightCycle: boolean; // Feature flag to enable/disable time system
}

// =============================================================================
// Player State Type
// =============================================================================

export interface PlayerState {
    current_room: string;  // room ID
    visited_rooms: string[];  // room IDs
    inventory: string[];
    health: number;
    stamina: number;
    level: number;
    experience: number;
    relationships: Record<string, NPCRelationship>;  // npc_uuid -> relationship data
    time_state: TimeState;  // Current time/day information
}

// =============================================================================
// World Metadata Type
// =============================================================================

export interface WorldMetadata {
    name: string;
    description: string;
    author: string | null;
    uuid: string;
    created_at: string;  // ISO8601
    last_modified: string;  // ISO8601
    cover_image: string | null;
}

// =============================================================================
// World State Type (Primary Runtime Type)
// =============================================================================

/**
 * Complete world state for runtime/gameplay.
 * This is the canonical format for world data during active play.
 */
export interface WorldState {
    schema_version: number;
    metadata: WorldMetadata;
    grid_size: GridSize;
    rooms: RuntimeRoom[];
    player: PlayerState;
}

// =============================================================================
// Backward Compatibility Aliases
// =============================================================================

/**
 * @deprecated Use RuntimeRoom instead
 */
export type Room = RuntimeRoom;
