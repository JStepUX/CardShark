// frontend/src/types/world.ts
// TypeScript interfaces matching the Pydantic models in backend/models/world_state.py

export interface ExitDefinition {
  target_coordinates?: string;
  target_location_id?: string;
  name: string;
  description?: string;
  locked: boolean;
  key_item_id?: string;
}

export interface EventDefinition {
  id: string;
  trigger: string;
  description: string;
  conditions?: string[];
  cooldown?: number;
}

export interface Location {
  name: string;
  coordinates?: number[];  // Optional for unconnected locations
  location_id: string;
  description: string;
  introduction?: string;  // Added field for room introduction message
  zone_id?: string;
  room_type?: string;
  notes?: string;
  background?: string;
  events: EventDefinition[];
  npcs: string[];
  explicit_exits?: Record<string, ExitDefinition>;
  lore_source?: string;  // Reference to lore entry if extracted from character
  connected: boolean;
}

// Room interface for the builder view - simplified version of Location for the grid-based editor
export interface Room {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  neighbors: Record<string, string>;
  npcs: any[]; // Array of NPC objects with name and path
}

export interface PlayerState {
  health: number;
  stamina: number;
  level: number;
  experience: number;
}

export interface UnconnectedLocation {
  location_id: string;
  name: string;
  description: string;
  lore_source: string;  // Lore entry that referenced this location
}

export interface WorldState {
  name: string;
  version: string;
  current_position: string;
  visited_positions: string[];
  locations: Record<string, Location>;
  unconnected_locations: Record<string, UnconnectedLocation>;
  player: PlayerState;
  base_character_id?: string;
  pending_event?: EventInfo; // Runtime-only field
  description?: string;
  id?: string;
  cardImageUrl?: string;
  rooms?: Record<string, Room>; // Added for WorldBuilderView
}

export interface EventInfo {
  id: string;
  description: string;
}

export interface WorldMetadata {
  name: string;
  created_date?: string;
  last_modified_date: string;
  base_character_name?: string;
  location_count: number;
  unconnected_location_count: number;
}