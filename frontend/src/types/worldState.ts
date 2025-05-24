// frontend/src/types/worldState.ts
// Import necessary types from world.ts based on plan_WorldCards2.md
// Export using proper syntax for isolatedModules
export type { WorldState, WorldMetadata, Location, EventDefinition } from './world';

// Import EventInfo explicitly to ensure it's recognized by TypeScript
import { Location, EventInfo } from './world';
export type { EventInfo };

// Create a type alias for Location to be used as WorldLocation for backward compatibility
export type WorldLocation = Location;

// Define the missing types
// Removed local WorldLocation definition, will use Location from ./world

export type UnconnectedLocation = {
  id: string;
  name: string;
  description: string;
};

export type PlayerState = {
  currentRoomId: string;
  coordinates: [number, number];
  inventory: string[];
};

export type Room = {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  exits: Record<string, string>;
};

// Removed local EventInfo definition, will use EventInfo from ./world

// Type for an NPC (assuming this structure, might need adjustment based on actual usage)
export interface NpcGridItem {
  character_id: any;
  name: string;
  path: string; // Path to character file/data
  // Add other relevant NPC properties if needed for the grid display
}

// Type for the full world state data fetched from the API, mirroring backend/models/world_state.py
export interface FullWorldState {
  name: string;
  version: string;
  current_position: string; // Coordinate string "0,0,0"
  visited_positions: string[];
  locations: Record<string, Location>; // Use Location type from ./world
  unconnected_locations: Record<string, UnconnectedLocation>; // Key is location_id
  player: PlayerState;
  base_character_id?: string; // ID of character card this world is based on
  // Additional fields needed for WorldBuilderView
  description?: string;
  id?: string;
  cardImageUrl?: string;
  rooms?: Record<string, Room>;
  // World items for character book entries
  worldItems?: Array<{ name: string; description: string; }>; 
  // Runtime-only fields added by frontend context if needed (like pending_event)
  pending_event?: EventInfo; // Use EventInfo from ./world
}

// The rest of your worldState.ts content...
export interface WorldStateModifications {
  locationsByCoordinates: Record<string, Location>; // Use Location type from ./world
  unconnectedLocations: Record<string, UnconnectedLocation>;
  player: PlayerState;
  gameStateVersion: number;
}

export interface RoomWorld {
  name: string;
  description: string;
  rooms: Record<string, Room>;
  posToId: Record<string, string>;
  events: Record<string, EventInfo>; // Use EventInfo from ./world
  version: number;
}