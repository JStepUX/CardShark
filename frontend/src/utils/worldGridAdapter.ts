// frontend/src/utils/worldGridAdapter.ts
// Adapter between V2 WorldState and Grid UI format

import { WorldState, Room } from '../types/worldV2';

// Grid UI format (used by WorldPlayView/WorldEditor)
export interface GridRoom {
  id: string;
  name: string;
  description: string;
  introduction_text: string;
  npcs: string[];  // Simple string IDs
  events: any[];
  connections: Record<string, string | null>;  // { north: 'room-id', south: null, ... }
  position: { x: number; y: number };
  image_path?: string;
}

export interface GridWorldState {
  grid: (GridRoom | null)[][];
  player_position: { x: number; y: number };
  metadata: {
    name: string;
    description: string;
  };
}

/**
 * Convert V2 Room to GridRoom
 */
export function roomToGridRoom(room: Room): GridRoom {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    introduction_text: room.introduction_text,
    npcs: room.npcs,
    events: room.events,
    connections: {
      north: room.connections.north,
      south: room.connections.south,
      east: room.connections.east,
      west: room.connections.west,
    },
    position: { x: room.position.x, y: room.position.y },
    image_path: room.image_path || undefined,
  };
}

/**
 * Convert GridRoom back to V2 Room
 */
export function gridRoomToRoom(gridRoom: GridRoom): Room {
  return {
    id: gridRoom.id,
    name: gridRoom.name,
    description: gridRoom.description,
    introduction_text: gridRoom.introduction_text,
    image_path: gridRoom.image_path || null,
    position: {
      x: gridRoom.position.x,
      y: gridRoom.position.y,
    },
    npcs: gridRoom.npcs,
    connections: {
      north: gridRoom.connections.north || null,
      south: gridRoom.connections.south || null,
      east: gridRoom.connections.east || null,
      west: gridRoom.connections.west || null,
    },
    events: gridRoom.events,
    visited: false,  // Will be set from state
  };
}

/**
 * Convert V2 WorldState to GridWorldState
 */
export function worldStateToGrid(state: WorldState): GridWorldState {
  // Create grid based on grid_size
  const grid: (GridRoom | null)[][] = Array(state.grid_size.height)
    .fill(null)
    .map(() => Array(state.grid_size.width).fill(null));

  // Place rooms on grid
  for (const room of state.rooms) {
    const { x, y } = room.position;
    // Offset for negative coordinates
    const gridX = x + Math.floor(state.grid_size.width / 2);
    const gridY = y + Math.floor(state.grid_size.height / 2);

    if (gridY >= 0 && gridY < state.grid_size.height && gridX >= 0 && gridX < state.grid_size.width) {
      grid[gridY][gridX] = roomToGridRoom(room);
    }
  }

  // Find player position
  const currentRoom = state.rooms.find((r) => r.id === state.player.current_room);
  const playerPos = currentRoom
    ? {
      x: currentRoom.position.x + Math.floor(state.grid_size.width / 2),
      y: currentRoom.position.y + Math.floor(state.grid_size.height / 2),
    }
    : { x: 0, y: 0 };

  return {
    grid,
    player_position: playerPos,
    metadata: {
      name: state.metadata.name,
      description: state.metadata.description,
    },
  };
}

/**
 * Convert GridWorldState back to V2 WorldState
 */
export function gridToWorldState(gridState: GridWorldState, existingState?: WorldState): WorldState {
  const rooms: Room[] = [];

  // Extract rooms from grid
  const offsetX = Math.floor(gridState.grid[0]?.length / 2) || 0;
  const offsetY = Math.floor(gridState.grid.length / 2) || 0;

  gridState.grid.forEach((row, y) => {
    row.forEach((gridRoom, x) => {
      if (gridRoom) {
        const room = gridRoomToRoom(gridRoom);
        // Adjust position back to world coordinates
        room.position.x = x - offsetX;
        room.position.y = y - offsetY;

        // Restore visited status from existing state if available
        if (existingState) {
          const existingRoom = existingState.rooms.find((r) => r.id === room.id);
          if (existingRoom) {
            room.visited = existingRoom.visited;
          }
        }

        rooms.push(room);
      }
    });
  });

  // Find current room from player position
  const currentRoomAtPos = gridState.grid[gridState.player_position.y]?.[gridState.player_position.x];
  const currentRoomId = currentRoomAtPos?.id || (rooms[0]?.id || '');

  // Build WorldState
  const now = new Date().toISOString();

  return {
    schema_version: 2,
    metadata: existingState?.metadata || {
      name: gridState.metadata.name,
      description: gridState.metadata.description,
      author: null,
      uuid: crypto.randomUUID(),
      created_at: now,
      last_modified: now,
      cover_image: null,
    },
    grid_size: {
      width: gridState.grid[0]?.length || 8,
      height: gridState.grid.length || 6,
    },
    rooms,
    player: existingState?.player || {
      current_room: currentRoomId,
      visited_rooms: currentRoomId ? [currentRoomId] : [],
      inventory: [],
      health: 100,
      stamina: 100,
      level: 1,
      experience: 0,
    },
  };
}
