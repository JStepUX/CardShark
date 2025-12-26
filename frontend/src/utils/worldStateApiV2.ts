// frontend/src/utils/worldStateApiV2.ts
// API client for V2 unified world state schema
// This replaces worldStateApi.ts with simpler, unified types

import { WorldState, Room, PlayerState } from '../types/worldV2';

/**
 * API client for interacting with the World Card system (V2)
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
   * Get the state for a specific world (V2 format)
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
        console.log(`Successfully loaded world state v${data.data.schema_version} with ${data.data.rooms.length} rooms`);
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
   * Save the state for a specific world (V2 format)
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
