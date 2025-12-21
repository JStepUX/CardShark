// frontend/src/types/world.ts
// TypeScript interfaces matching the V2 Spec in backend/models/world_data.py

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

export interface RoomConnection {
  target_room_id: string;
  direction: string;
  description?: string | null;
  is_locked: boolean;
  key_id?: string | null;
}

export interface RoomNPC {
  character_id: string;
  spawn_chance: number;
  initial_dialogue?: string | null;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  introduction?: string | null;
  image_path?: string | null;
  connections: RoomConnection[];
  npcs: RoomNPC[];
  items: string[];
  visited: boolean;
  // UI Helpers (not persisted)
  x?: number;
  y?: number;
}

export interface PlayerState {
  current_room_id?: string | null;
  inventory: string[];
  health: number;
  stats: Record<string, any>;
  flags: Record<string, boolean>;
}

export interface WorldSettings {
  narrator_voice: NarratorVoice;
  time_system: TimeSystem;
  entry_room_id?: string | null;
  global_scripts: string[];
}

export interface WorldData {
  rooms: Room[];
  settings: WorldSettings;
  player_state: PlayerState;
  name?: string; // Informational
}

// Helper interface for UI components that need NPC display info
export interface NpcGridItem {
  character_id: string;
  name: string;
  path: string;
}