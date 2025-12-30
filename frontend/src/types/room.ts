// frontend/src/types/room.ts
// TypeScript types for Room Card V2 specification
// Room cards are character cards with card_type="room" and room-specific extensions

/**
 * NPC assignment within a room
 */
export interface RoomNPC {
  character_uuid: string;
  role?: string; // e.g., "shopkeeper", "guard", "quest_giver"
  hostile?: boolean; // Whether NPC is hostile to player
}

/**
 * Room-specific extension data
 * Stored in extensions.room_data of the character card
 */
export interface RoomData {
  uuid: string; // Room UUID
  npcs: RoomNPC[]; // NPCs assigned to this room
  // Future fields can be added here:
  // connections?: RoomConnection[]; // Links to other rooms
  // items?: string[]; // Item UUIDs in the room
  // events?: EventDefinition[]; // Room-specific events
}

/**
 * Complete room card structure
 * This is a character card V2 with card_type="room"
 */
export interface RoomCard {
  spec: "chara_card_v2";
  spec_version: string;
  data: {
    name: string; // Room name
    description: string; // Room description
    first_mes?: string; // Introduction text when entering room
    system_prompt?: string; // Room-specific system prompt/atmosphere
    character_book?: {
      // Lore entries for room-specific knowledge
      entries: any[];
      name?: string;
    };
    character_uuid?: string; // Room UUID (matches room_data.uuid)
    tags?: string[]; // Tags for categorization
    extensions: {
      card_type: "room";
      room_data: RoomData;
      [key: string]: any; // Allow other extensions
    };
    // Standard character fields (mostly unused for rooms but required by spec)
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
 * Simplified room card for API responses
 */
export interface RoomCardSummary {
  uuid: string;
  name: string;
  description: string;
  image_path?: string;
  assigned_worlds?: string[]; // World UUIDs this room is assigned to (computed)
  npc_count?: number; // Number of NPCs in the room
  created_at?: string;
  updated_at?: string;
}

/**
 * Room creation request
 */
export interface CreateRoomRequest {
  name: string;
  description?: string;
  first_mes?: string;
  system_prompt?: string;
  image?: File | null; // Optional room image
}

/**
 * Room update request
 */
export interface UpdateRoomRequest {
  name?: string;
  description?: string;
  first_mes?: string;
  system_prompt?: string;
  character_book?: {
    entries: any[];
    name?: string;
  };
  image?: File | null;
  npcs?: RoomNPC[];
}
