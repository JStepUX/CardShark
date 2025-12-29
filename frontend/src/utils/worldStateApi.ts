import { WorldData, Room, RoomNPC, RoomConnection, NarratorVoice, TimeSystem } from '../types/world';

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
 * Convert backend WorldState to grid-compatible WorldState
 * Handles both WorldState (world_state.py) and legacy WorldData (world_data.py) formats
 */
export function toGridWorldState(worldData: any, worldName: string): GridWorldState {
  const rooms: any[] = [];

  // Handle WorldState schema (world_state.py) - current backend format
  if (worldData.rooms && Array.isArray(worldData.rooms)) {
    worldData.rooms.forEach((room: any, index: number) => {
      // Extract position - could be {x, y} object or separate fields
      const x = room.position?.x ?? room.x ?? index % 8;
      const y = room.position?.y ?? room.y ?? Math.floor(index / 8);

      // Extract NPCs - could be string array or RoomNPC array
      let npcIds: string[] = [];
      if (Array.isArray(room.npcs)) {
        npcIds = room.npcs.map((npc: any) =>
          typeof npc === 'string' ? npc : npc.character_id
        );
      }

      // Extract connections - could be {north, south, east, west} object or RoomConnection array
      let connections: Record<string, string | null> = {
        north: null,
        south: null,
        east: null,
        west: null,
      };

      if (room.connections) {
        if (Array.isArray(room.connections)) {
          // Legacy format: array of {target_room_id, direction}
          room.connections.forEach((conn: any) => {
            if (conn.direction && conn.target_room_id) {
              connections[conn.direction.toLowerCase()] = conn.target_room_id;
            }
          });
        } else {
          // Current format: {north, south, east, west}
          connections = {
            north: room.connections.north || null,
            south: room.connections.south || null,
            east: room.connections.east || null,
            west: room.connections.west || null,
          };
        }
      }

      rooms.push({
        id: room.id,
        name: room.name,
        description: room.description || '',
        introduction_text: room.introduction_text || room.introduction || room.description || '',
        npcs: npcIds,
        connections,
        x,
        y,
        visited: room.visited || false,
        image_path: room.image_path || null,
      });
    });
  }
  // Handle legacy 'locations' format (if still in use)
  else if (worldData.locations) {
    const locationEntries = Object.entries(worldData.locations || {});
    locationEntries.forEach(([name, loc]: [string, any], index) => {
      rooms.push({
        id: loc.id || name,
        name: loc.name || name,
        description: loc.description || '',
        introduction_text: loc.description || '',
        npcs: (loc.npcs || []).map((n: any) =>
          typeof n === 'string' ? n : n.character_id
        ),
        connections: {
          north: null,
          south: null,
          east: null,
          west: null,
        },
        x: loc.grid_x ?? loc.x ?? index % 8,
        y: loc.grid_y ?? loc.y ?? Math.floor(index / 8),
        visited: loc.visited || false,
        image_path: loc.image_path || null,
      });
    });
  }

  // Determine grid dimensions by finding max x and y
  let maxX = 0;
  let maxY = 0;

  rooms.forEach((room) => {
    if (room.x !== undefined && room.x > maxX) maxX = room.x;
    if (room.y !== undefined && room.y > maxY) maxY = room.y;
  });

  // Initialize grid with nulls (at least 8x6 for good visibility)
  const gridWidth = Math.max(maxX + 1, worldData.grid_size?.width || 8);
  const gridHeight = Math.max(maxY + 1, worldData.grid_size?.height || 6);
  const grid: (GridRoom | null)[][] = Array(gridHeight)
    .fill(null)
    .map(() => Array(gridWidth).fill(null));

  // Place rooms on grid
  rooms.forEach((room) => {
    const x = room.x;
    const y = room.y;
    if (y < gridHeight && x < gridWidth) {
      grid[y][x] = {
        id: room.id,
        name: room.name,
        description: room.description,
        introduction_text: room.introduction_text,
        npcs: room.npcs,
        events: room.events || [],
        connections: room.connections,
        position: { x, y },
        image_path: room.image_path,
      };
    }
  });

  // Determine player position
  let playerX = 0;
  let playerY = 0;

  // Try WorldState format first (player.current_room)
  const currentRoomId = worldData.player?.current_room ||
    worldData.player_state?.current_room_id ||
    worldData.current_location;

  if (currentRoomId) {
    const currentRoom = rooms.find((r) => r.id === currentRoomId || r.name === currentRoomId);
    if (currentRoom) {
      playerX = currentRoom.x ?? 0;
      playerY = currentRoom.y ?? 0;
    }
  }

  return {
    grid,
    player_position: { x: playerX, y: playerY },
    metadata: {
      name: worldData.metadata?.name || worldData.name || worldName || 'Unknown World',
      description: worldData.metadata?.description || '',
      author: worldData.metadata?.author || null,
      uuid: worldData.metadata?.uuid || '',
      created_at: worldData.metadata?.created_at || new Date().toISOString(),
      last_modified: worldData.metadata?.last_modified || new Date().toISOString(),
      cover_image: worldData.metadata?.cover_image || null,
    },
    grid_size: worldData.grid_size || { width: gridWidth, height: gridHeight },
  };
}

/**
 * Convert Grid WorldState back to backend WorldState schema
 * Note: Backend expects WorldState (from world_state.py), not WorldData (from world_data.py)
 */
export function fromGridWorldState(figmaState: GridWorldState): any {
  // Extract rooms from grid and convert to backend format
  const rooms: any[] = [];

  figmaState.grid.forEach((row) => {
    row.forEach((room) => {
      if (room) {
        // Convert to backend Room format
        rooms.push({
          id: room.id,
          name: room.name,
          description: room.description,
          introduction_text: room.introduction_text,
          image_path: room.image_path || null,
          position: {
            x: room.position.x,
            y: room.position.y,
          },
          npcs: room.npcs, // Already string array
          connections: room.connections, // Already in { north, south, east, west } format
          events: room.events || [],
          visited: false,
        });
      }
    });
  });

  // Find current room based on player position
  const currentRoom = figmaState.grid[figmaState.player_position.y]?.[figmaState.player_position.x];

  // Return backend WorldState schema
  return {
    schema_version: 2,
    metadata: {
      name: figmaState.metadata.name,
      description: figmaState.metadata.description || '',
      author: figmaState.metadata.author || null,
      uuid: figmaState.metadata.uuid || '', // Preserved from loaded state
      created_at: figmaState.metadata.created_at || new Date().toISOString(),
      last_modified: new Date().toISOString(), // Always update on save
      cover_image: figmaState.metadata.cover_image || null,
    },
    grid_size: figmaState.grid_size || {
      width: figmaState.grid[0]?.length || 8,
      height: figmaState.grid.length || 6,
    },
    rooms,
    player: {
      current_room: currentRoom?.id || (rooms[0]?.id || ''),
      visited_rooms: [],
      inventory: [],
      health: 100,
      stamina: 100,
      level: 1,
      experience: 0,
    },
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
        throw new Error(`Failed to list worlds: ${errorData.detail || errorData.message || response.statusText
          }`);
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
        throw new Error(`Failed to create world: ${errorData.detail || errorData.message || response.statusText
          }`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error in createWorld:', error);
      throw error;
    }
  },

  /**
   * Get the state for a specific world
   */
  getWorldState: async (worldId: string): Promise<any> => {
    try {
      // Send request to backed API
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldId)}/state`);

      if (!response.ok) {
        // Handle API error
        const errorData = await response.json().catch(() => ({}));
        console.error(`Error loading world state: ${response.status} - ${JSON.stringify(errorData)}`);
        throw new Error(`Failed to load world: ${errorData.detail || errorData.message || response.statusText
          }`);
      }

      const data = await response.json();
      if (data && data.success && data.data) {
        console.log(`Successfully loaded world state with ${Object.keys(data.data.locations || {}).length} locations`);
        return data.data;
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      console.error('Error in getWorldState:', error);
      throw error;
    }
  },

  /**
   * Save the state for a specific world
   */
  saveWorldState: async (worldId: string, state: any): Promise<boolean> => {
    try {
      // Make direct API call to backend
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldId)}/state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state }),
      });

      if (!response.ok) {
        // Handle API error
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
   * Load the latest chat for a world card
   */
  loadLatestChat: async (worldId: string): Promise<any> => {
    try {
      const response = await fetch(`/api/world-chat/${encodeURIComponent(worldId)}/latest`);

      if (response.status === 404) {
        // No chat yet, return null (not an error)
        return null;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to load latest chat: ${errorData.detail || errorData.message || response.statusText
          }`);
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
   * Append a message to a world card chat
   */
  appendMessage: async (worldName: string, chatId: string, message: any): Promise<boolean> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/chat/${encodeURIComponent(chatId)}/append`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to append message: ${response.statusText}`);
      }

      const data = await response.json();
      return data && data.success === true;
    } catch (error) {
      console.error(`Error appending message for world ${worldName}:`, error);
      throw new Error(`Failed to append message: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Create a new chat for a world card
   */
  createNewChat: async (worldName: string): Promise<any> => {
    try {
      // Generate a new chat ID
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

      // Save the new chat
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

  /**
   * Update a room in the world
   */
  updateRoom: async (worldName: string, roomId: string, roomData: any): Promise<WorldData> => {
    try {
      const worldState = await worldStateApi.getWorldState(worldName);
      const roomIndex = worldState.rooms?.findIndex((r: any) => r.id === roomId);

      if (roomIndex !== undefined && roomIndex !== -1) {
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
   * This is called on every room transition (Option a from implementation plan)
   */
  movePlayer: async (worldId: string, roomId: string): Promise<boolean> => {
    try {
      // First get current world state
      const worldState = await worldStateApi.getWorldState(worldId);

      if (!worldState) {
        throw new Error('World state not found');
      }

      // Update player position
      if (worldState.player_state) {
        worldState.player_state.current_room_id = roomId;
      } else {
        worldState.player_state = {
          current_room_id: roomId,
          inventory: [],
          health: 100,
          stats: {},
          flags: {},
        };
      }

      // Mark room as visited
      const room = worldState.rooms?.find((r: any) => r.id === roomId);
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
      const worldData = await worldStateApi.getWorldState(worldId);
      if (!worldData) return null;
      return toGridWorldState(worldData, worldId);
    } catch (error) {
      console.error('Error loading world state for grid view:', error);
      return null;
    }
  },

  /**
   * Save grid world state by converting back to codebase format
   */
  saveGridWorldState: async (worldId: string, figmaState: GridWorldState): Promise<boolean> => {
    try {
      const worldData = fromGridWorldState(figmaState);
      return await worldStateApi.saveWorldState(worldId, worldData);
    } catch (error) {
      console.error('Error saving grid world state:', error);
      return false;
    }
  },
};

export default worldStateApi;