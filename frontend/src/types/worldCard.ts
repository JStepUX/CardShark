// frontend/src/types/worldCard.ts
// World Card V2 specification - PNG-based storage
// World cards are character cards with card_type="world" and world-specific extensions

import { WorldState, GridSize, Position } from './worldV2';
import { RoomNPC } from './room';

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
  // Full world state (includes rooms array with full Room objects)
  world_state?: WorldState;
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
}
