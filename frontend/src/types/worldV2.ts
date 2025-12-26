// frontend/src/types/worldV2.ts
// TypeScript interfaces matching the unified world schema
// These types align exactly with backend/models/world_state.py

export interface Position {
  x: number;
  y: number;
}

export interface RoomConnection {
  north: string | null;
  south: string | null;
  east: string | null;
  west: string | null;
}

export interface EventDefinition {
  id: string;
  type: string;
  trigger: string;
  data: Record<string, any>;
}

export interface Room {
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

export interface WorldMetadata {
  name: string;
  description: string;
  author: string | null;
  uuid: string;
  created_at: string;  // ISO8601
  last_modified: string;  // ISO8601
  cover_image: string | null;
}

export interface GridSize {
  width: number;
  height: number;
}

export interface PlayerState {
  current_room: string;  // room ID
  visited_rooms: string[];  // room IDs
  inventory: string[];
  health: number;
  stamina: number;
  level: number;
  experience: number;
}

export interface WorldState {
  schema_version: number;
  metadata: WorldMetadata;
  grid_size: GridSize;
  rooms: Room[];
  player: PlayerState;
}

// Helper interface for UI components
export interface DisplayNPC {
  id: string;
  name: string;
  imageUrl: string;
  personality?: string;
}
