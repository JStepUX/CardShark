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
