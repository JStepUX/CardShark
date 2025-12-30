import { WorldData, Room, RoomNPC, RoomConnection, NarratorVoice, TimeSystem } from '../types/world';

// ============================================================================
// DEPRECATED: This file contains legacy types and adapters for backward compatibility.
// New code should use the V2 PNG-based world system via worldApi.ts
// ============================================================================

// ============================================================================
// Grid-Based View Types (View Layer)
// These types match what the WorldPlayView/WorldEditor components expect
// ============================================================================

export interface GridRoom {
  id: string;
  name: string;
  description: string;
  introduction_text: string;
  npcs: string[]; // Simple string IDs
  events: any[];
  connections: Record<string, string | null>; // { north: 'room-id', south: null, ... }
  position: { x: number; y: number };
  image_path?: string;
}

export interface GridWorldState {
  grid: (GridRoom | null)[][];
  player_position: { x: number; y: number };
  metadata: {
    name: string;
    description: string;
    author?: string | null;
    uuid?: string;
    created_at?: string;
    last_modified?: string;
    cover_image?: string | null;
  };
  grid_size?: {
    width: number;
    height: number;
  };
}

export interface DisplayNPC {
  id: string;
  name: string;
  imageUrl: string;
  personality?: string;
}

// ============================================================================
// Adapter Functions
// Convert between view layer types and codebase types at the API boundary
// ============================================================================

/**
 * Convert codebase Room to grid-compatible Room
 */
export function toGridRoom(room: Room, x: number, y: number): GridRoom {
  // Convert RoomConnection[] to Record<string, string | null>
  const connections: Record<string, string | null> = {
    north: null,
    south: null,
    east: null,
    west: null,
  };

  // Defensive check: ensure connections is an array
  const roomConnections = Array.isArray(room.connections) ? room.connections : [];

  roomConnections.forEach((conn) => {
    if (conn.direction && conn.target_room_id) {
      connections[conn.direction.toLowerCase()] = conn.target_room_id;
    }
  });

  return {
    id: room.id,
    name: room.name,
    description: room.description,
    introduction_text: room.introduction || room.description,
    npcs: Array.isArray(room.npcs) ? room.npcs.map((npc) => npc.character_id) : [],
    events: [],
    connections,
    position: { x: room.x ?? x, y: room.y ?? y },
    image_path: room.image_path || undefined,
  };
}

/**
 * Convert Grid Room back to codebase Room
 */
export function fromGridRoom(figmaRoom: GridRoom): Room {
  // Convert Record<string, string | null> to RoomConnection[]
  const connections: RoomConnection[] = [];

  Object.entries(figmaRoom.connections).forEach(([direction, targetId]) => {
    if (targetId) {
      connections.push({
        target_room_id: targetId,
        direction: direction.charAt(0).toUpperCase() + direction.slice(1), // Capitalize
        is_locked: false,
      });
    }
  });

  // Convert string[] to RoomNPC[]
  const npcs: RoomNPC[] = figmaRoom.npcs.map((characterId) => ({
    character_id: characterId,
    spawn_chance: 1.0,
  }));

  return {
    id: figmaRoom.id,
    name: figmaRoom.name,
    description: figmaRoom.description,
    introduction: figmaRoom.introduction_text,
    connections,
    npcs,
    items: [],
    visited: false,
    x: figmaRoom.position.x,
    y: figmaRoom.position.y,
    image_path: figmaRoom.image_path || null,
  };
}

/**
 * Resolve NPC IDs to full character info for display
 * Fetches character data from the API
 */
export async function resolveNpcDisplayData(npcIds: string[]): Promise<DisplayNPC[]> {
  if (npcIds.length === 0) return [];

  try {
    const response = await fetch('/api/characters');
    if (!response.ok) {
      console.error('Failed to fetch characters for NPC resolution');
      return [];
    }

    const data = await response.json();
    const characters = data.data || data || [];

    const results: DisplayNPC[] = [];

    for (const id of npcIds) {
      const char = characters.find((c: any) =>
        c.character_uuid === id ||
        c.id === id ||
        c.filename === id ||
        c.name === id
      );

      if (char) {
        results.push({
          id: char.character_uuid || char.id || id,
          name: char.name || 'Unknown',
          imageUrl: `/api/character-image/${char.character_uuid || char.filename}.png`,
          personality: char.personality,
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Error resolving NPCs:', error);
    return [];
  }
}

// ============================================================================
// DEPRECATED API CLIENT - Removed
// Use worldApi.ts for V2 PNG-based world system
// ============================================================================
