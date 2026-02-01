// frontend/src/types/worldCard.ts
// World Card V2 specification - PNG-based storage
// World cards are character cards with card_type="world" and world-specific extensions

import { WorldState, GridSize, Position } from './worldV2';
import { RoomNPC } from './room';
import { NPCRelationship, TimeState } from './worldRuntime';
import { CharacterInventory } from './inventory';

// =============================================================================
// Per-Room Runtime State (persisted in WorldData.room_states)
// =============================================================================

/**
 * Status of an individual NPC within a room instance.
 * Tracks alive/dead/incapacitated and last known position on the local map.
 */
export interface NpcInstanceState {
  status: 'alive' | 'incapacitated' | 'dead';
  position?: Position; // Last known local map tile position
}

/**
 * Runtime state for a specific room instance.
 * Keyed by room_uuid in WorldData.room_states.
 */
export interface RoomInstanceState {
  npc_states: Record<string, NpcInstanceState>; // character_uuid -> state
}

/**
 * Room placement in world grid
 * Stores both the room template reference AND instance-specific data
 * 
 * NOTE: instance_name and instance_description enable "lazy loading" -
 * the map can render without fetching each room card individually.
 */
export interface WorldRoomPlacement {
  room_uuid: string; // References a room card UUID (the template)
  grid_position: Position; // Where this room appears on the world grid
  instance_name?: string; // Room name for map display (cached from room card) - enables lazy loading
  instance_description?: string; // Brief description for tooltips (cached from room card)
  instance_npcs?: RoomNPC[]; // Full NPC assignment objects (role, hostile, etc.) - overrides room card's default NPCs
  instance_image_path?: string; // Custom image for this instance - overrides room card's default image
  instance_state?: Record<string, any>; // Future: loot taken, doors opened, enemy HP, etc.
}

/**
 * World-specific extension data
 * Stored in extensions.world_data of the character card
 */
export interface WorldData {
  uuid: string; // World UUID
  grid_size: GridSize; // World grid dimensions
  rooms: WorldRoomPlacement[]; // Room placements on the grid
  starting_position: Position; // Where player starts
  player_position: Position; // Current player position
  map_image?: string; // Custom map backdrop image path
  // Full world state (includes rooms array with full Room objects)
  world_state?: WorldState;

  // Runtime state - persisted gameplay progress
  player_xp?: number; // Cumulative XP earned in this world
  player_level?: number; // Current player level (1-60)
  player_gold?: number; // Gold accumulated
  bonded_ally_uuid?: string; // character_uuid of currently bonded ally
  time_state?: TimeState; // Day/night cycle state
  npc_relationships?: Record<string, NPCRelationship>; // character_uuid -> relationship
  player_inventory?: CharacterInventory; // Player equipment and items
  ally_inventory?: CharacterInventory; // Bonded ally equipment and items
  room_states?: Record<string, RoomInstanceState>; // room_uuid -> per-room runtime state
}

/**
 * Complete world card structure
 * This is a character card V2 with card_type="world"
 */
export interface WorldCard {
  spec: "chara_card_v2";
  spec_version: string;
  data: {
    name: string; // World name
    description: string; // World description
    first_mes?: string; // World introduction text
    system_prompt?: string; // World-specific system prompt/atmosphere
    character_book?: {
      // Lore entries for world-specific knowledge
      entries: any[];
      name?: string;
    };
    character_uuid?: string; // World UUID (matches world_data.uuid)
    tags?: string[]; // Tags for categorization
    extensions: {
      card_type: "world";
      world_data: WorldData;
      [key: string]: any; // Allow other extensions
    };
    // Standard character fields (mostly unused for worlds but required by spec)
    personality?: string;
    scenario?: string;
    mes_example?: string;
    creator_notes?: string;
    post_history_instructions?: string;
    alternate_greetings?: string[];
    creator?: string;
    character_version?: string;
  };
}

/**
 * Simplified world card for API responses
 */
export interface WorldCardSummary {
  uuid: string;
  name: string;
  description: string;
  image_path?: string;
  grid_size: GridSize;
  room_count: number; // Number of rooms placed
  created_at?: string;
  updated_at?: string;
}

/**
 * World creation request
 */
export interface CreateWorldRequest {
  name: string;
  description?: string;
  grid_size?: GridSize; // Defaults to 10x10 if not provided
  first_mes?: string;
  system_prompt?: string;
  image?: File | null; // Optional world image
}

/**
 * World update request
 */
export interface UpdateWorldRequest {
  name?: string;
  description?: string;
  first_mes?: string;
  system_prompt?: string;
  character_book?: {
    entries: any[];
    name?: string;
  };
  grid_size?: GridSize;
  rooms?: WorldRoomPlacement[];
  starting_position?: Position;
  player_position?: Position;
  image?: File | null;
  // Runtime state fields
  player_xp?: number;
  player_level?: number;
  player_gold?: number;
  bonded_ally_uuid?: string; // Empty string "" to clear (unbond)
  time_state?: TimeState;
  npc_relationships?: Record<string, NPCRelationship>;
  player_inventory?: CharacterInventory;
  ally_inventory?: CharacterInventory;
  room_states?: Record<string, RoomInstanceState>;
}

/**
 * Information about a room for delete preview
 */
export interface RoomDeleteInfo {
  uuid: string;
  name: string;
  reason: string; // Why this room will/won't be deleted
}

/**
 * Preview of what will happen when a world is deleted
 */
export interface WorldDeletePreview {
  world_uuid: string;
  world_name: string;
  rooms_to_delete: RoomDeleteInfo[]; // Rooms that will be deleted (auto-generated and orphaned)
  rooms_to_keep: RoomDeleteInfo[]; // Rooms that will be kept (manually created or used elsewhere)
  total_rooms: number;
}

/**
 * Result of deleting a world with rooms
 */
export interface WorldDeleteResult {
  success: boolean;
  world_deleted: boolean;
  rooms_deleted: number;
  rooms_kept: number;
  message: string;
}

// =============================================================================
// Per-User World Progress Types (Save Slots)
// =============================================================================

/**
 * Complete world playthrough progress for a user.
 * Stored in SQLite keyed by (world_uuid, user_uuid).
 */
export interface WorldUserProgress {
  world_uuid: string;
  user_uuid: string;

  // Progression
  player_xp: number;
  player_level: number;
  player_gold: number;

  // State
  current_room_uuid?: string;
  bonded_ally_uuid?: string;
  time_state?: TimeState;
  npc_relationships?: Record<string, NPCRelationship>;
  player_inventory?: CharacterInventory;
  ally_inventory?: CharacterInventory;
  room_states?: Record<string, RoomInstanceState>;

  // Metadata
  last_played_at?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Partial update for world user progress.
 * All fields are optional for PATCH-style updates.
 */
export interface WorldUserProgressUpdate {
  player_xp?: number;
  player_level?: number;
  player_gold?: number;
  current_room_uuid?: string;
  bonded_ally_uuid?: string; // Empty string "" clears the ally
  time_state?: TimeState;
  npc_relationships?: Record<string, NPCRelationship>;
  player_inventory?: CharacterInventory;
  ally_inventory?: CharacterInventory;
  room_states?: Record<string, RoomInstanceState>;
}

/**
 * Summary of a user's progress for list endpoints.
 * Used in progress-summary to show save slots.
 */
export interface WorldUserProgressSummary {
  user_uuid: string;
  user_name?: string;
  player_level: number;
  player_xp: number;
  player_gold: number;
  current_room_uuid?: string;
  last_played_at?: string;
}
