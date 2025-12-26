import { WorldState, Room, Position, RoomConnection, PlayerState, DisplayNPC } from '../types/world';

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
  };
}

// ============================================================================
// Adapter Functions
// Convert between unified WorldState and Grid UI format
// ============================================================================

/**
 * Convert unified Room to GridRoom
 */
export function toGridRoom(room: Room): GridRoom {
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
 * Convert GridRoom back to unified Room
 */
export function fromGridRoom(gridRoom: GridRoom): Room {
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
    visited: false, // Will be updated from actual state
  };
}

/**
 * Convert unified WorldState to grid-compatible format
 */
export function toGridWorldState(worldState: WorldState): GridWorldState {
  const { grid_size, rooms, player } = worldState;

  // Create grid based on grid_size
  const grid: (GridRoom | null)[][] = Array(grid_size.height)
    .fill(null)
    .map(() => Array(grid_size.width).fill(null));

  // Calculate offset to center grid (support negative coordinates)
  const offsetX = Math.floor(grid_size.width / 2);
  const offsetY = Math.floor(grid_size.height / 2);

  // Place rooms on grid
  for (const room of rooms) {
    const gridX = room.position.x + offsetX;
    const gridY = room.position.y + offsetY;

    if (gridY >= 0 && gridY < grid_size.height && gridX >= 0 && gridX < grid_size.width) {
      grid[gridY][gridX] = toGridRoom(room);
    }
  }

  // Find player position
  const currentRoom = rooms.find((r) => r.id === player.current_room);
  const playerPos = currentRoom
    ? {
        x: currentRoom.position.x + offsetX,
        y: currentRoom.position.y + offsetY,
      }
    : { x: offsetX, y: offsetY };

  return {
    grid,
    player_position: playerPos,
    metadata: {
      name: worldState.metadata.name,
      description: worldState.metadata.description,
    },
  };
}

/**
 * Convert GridWorldState back to unified WorldState
 */
export function fromGridWorldState(gridState: GridWorldState, existingState?: WorldState): WorldState {
  const rooms: Room[] = [];

  // Calculate offset
  const offsetX = Math.floor(gridState.grid[0]?.length / 2) || 0;
  const offsetY = Math.floor(gridState.grid.length / 2) || 0;

  // Extract rooms from grid
  gridState.grid.forEach((row, y) => {
    row.forEach((gridRoom, x) => {
      if (gridRoom) {
        const room = fromGridRoom(gridRoom);
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
    player: {
      current_room: currentRoomId,
      visited_rooms: existingState?.player.visited_rooms || (currentRoomId ? [currentRoomId] : []),
      inventory: existingState?.player.inventory || [],
      health: existingState?.player.health || 100,
      stamina: existingState?.player.stamina || 100,
      level: existingState?.player.level || 1,
      experience: existingState?.player.experience || 0,
    },
  };
}

/**
 * Resolve NPC IDs to full character info for display
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
// API Client
// ============================================================================

/**
 * API client for interacting with the World Card system
 */
export const worldStateApi = {
  /**
   * Get a list of all available worlds
   */
  listWorlds: async (): Promise<any[]> => {
    try {
      const response = await fetch('/api/world-cards');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to list worlds: ${errorData.detail || errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Error in listWorlds:', error);
      throw error;
    }
  },

  /**
   * Create a new world, either empty or based on a character
   */
  createWorld: async (name: string, characterPath?: string): Promise<any> => {
    try {
      const payload: any = { name };
      if (characterPath) {
        payload.character_path = characterPath;
      }

      const response = await fetch('/api/world-cards/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to create world: ${errorData.detail || errorData.message || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error in createWorld:', error);
      throw error;
    }
  },

  /**
   * Get the state for a specific world (unified format)
   */
  getWorldState: async (worldId: string): Promise<WorldState> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldId)}/state`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`Error loading world state: ${response.status} - ${JSON.stringify(errorData)}`);
        throw new Error(`Failed to load world: ${errorData.detail || errorData.message || response.statusText}`);
      }

      const data = await response.json();
      if (data && data.success && data.data) {
        console.log(`Successfully loaded world state with ${data.data.rooms.length} rooms`);
        return data.data as WorldState;
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      console.error('Error in getWorldState:', error);
      throw error;
    }
  },

  /**
   * Save the state for a specific world (unified format)
   */
  saveWorldState: async (worldId: string, state: WorldState): Promise<boolean> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldId)}/state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`Error saving world state: ${response.status} - ${JSON.stringify(errorData)}`);
        return false;
      }

      const data = await response.json();
      return data && data.success === true;
    } catch (error) {
      console.error('Error in saveWorldState:', error);
      return false;
    }
  },

  /**
   * Update a room in the world
   */
  updateRoom: async (worldName: string, roomId: string, roomData: Partial<Room>): Promise<WorldState> => {
    try {
      const worldState = await worldStateApi.getWorldState(worldName);
      const roomIndex = worldState.rooms.findIndex((r) => r.id === roomId);

      if (roomIndex !== -1) {
        worldState.rooms[roomIndex] = {
          ...worldState.rooms[roomIndex],
          ...roomData
        };

        const success = await worldStateApi.saveWorldState(worldName, worldState);
        if (success) return worldState;
        throw new Error('Failed to save updated room');
      } else {
        throw new Error(`Room not found: ${roomId}`);
      }
    } catch (err) {
      console.error('Error updating room:', err);
      throw err;
    }
  },

  /**
   * Move player to a new room and persist the position
   */
  movePlayer: async (worldId: string, roomId: string): Promise<boolean> => {
    try {
      const worldState = await worldStateApi.getWorldState(worldId);

      if (!worldState) {
        throw new Error('World state not found');
      }

      // Update player position
      worldState.player.current_room = roomId;

      // Add to visited rooms if not already there
      if (!worldState.player.visited_rooms.includes(roomId)) {
        worldState.player.visited_rooms.push(roomId);
      }

      // Mark room as visited
      const room = worldState.rooms.find((r) => r.id === roomId);
      if (room) {
        room.visited = true;
      }

      // Save updated state
      return await worldStateApi.saveWorldState(worldId, worldState);
    } catch (error) {
      console.error('Error moving player:', error);
      return false;
    }
  },

  /**
   * Load world state and convert to grid-compatible format
   */
  getGridWorldState: async (worldId: string): Promise<GridWorldState | null> => {
    try {
      const worldState = await worldStateApi.getWorldState(worldId);
      if (!worldState) return null;
      return toGridWorldState(worldState);
    } catch (error) {
      console.error('Error loading world state for grid view:', error);
      return null;
    }
  },

  /**
   * Save grid world state by converting back to unified format
   */
  saveGridWorldState: async (worldId: string, gridState: GridWorldState): Promise<boolean> => {
    try {
      // Get existing state to preserve metadata and player stats
      const existingState = await worldStateApi.getWorldState(worldId);
      const worldState = fromGridWorldState(gridState, existingState);
      return await worldStateApi.saveWorldState(worldId, worldState);
    } catch (error) {
      console.error('Error saving grid world state:', error);
      return false;
    }
  },

  /**
   * Load the latest chat for a world card
   */
  loadLatestChat: async (worldId: string): Promise<any> => {
    try {
      const response = await fetch(`/api/world-chat/${encodeURIComponent(worldId)}/latest`);

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to load latest chat: ${errorData.detail || errorData.message || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error in loadLatestChat:', error);
      throw error;
    }
  },

  /**
   * Save a chat for a world card
   */
  saveChat: async (worldId: string, chatId: string, chatData: any): Promise<boolean> => {
    try {
      const response = await fetch(`/api/world-chat/${encodeURIComponent(worldId)}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          data: chatData
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`Error saving chat: ${response.status} - ${JSON.stringify(errorData)}`);
        return false;
      }

      const data = await response.json();
      return data && data.success === true;
    } catch (error) {
      console.error('Error in saveChat:', error);
      return false;
    }
  },

  /**
   * Create a new chat for a world card
   */
  createNewChat: async (worldName: string): Promise<any> => {
    try {
      const chatId = `${worldName}-${Math.random().toString(36).substring(2, 10)}`;
      const chatData = {
        messages: [],
        metadata: {
          chat_id: chatId,
          world_name: worldName,
          created_at: Date.now(),
          updated_at: Date.now()
        }
      };

      const success = await worldStateApi.saveChat(worldName, chatId, chatData);
      if (success) {
        return chatData;
      } else {
        throw new Error('Failed to create new chat');
      }
    } catch (err) {
      console.error('Error creating new chat:', err);
      return null;
    }
  },
};

export default worldStateApi;
