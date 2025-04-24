/**
 * API client for world card-related operations
 */

import { WorldState, WorldMetadata } from '../types/world';

export const worldCardApi = {
  // World state management
  getWorldState: async (worldName: string): Promise<WorldState> => {
    const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/state`);
    if (!response.ok) {
      throw new Error(`Failed to get world state: ${response.status}`);
    }
    const data = await response.json();
    return data.state;
  },
  
  saveWorldState: async (worldName: string, state: WorldState): Promise<boolean> => {
    const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state }),
    });
    if (!response.ok) {
      throw new Error(`Failed to save world state: ${response.status}`);
    }
    const data = await response.json();
    return data.success;
  },
  
  // World creation and listing
  createWorld: async (worldName: string, characterFilePath?: string): Promise<{success: boolean, world_name: string}> => {
    const response = await fetch('/api/world-cards/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ world_name: worldName, character_file_path: characterFilePath }),
    });
    if (!response.ok) {
      throw new Error(`Failed to create world: ${response.status}`);
    }
    const data = await response.json();
    return data;
  },
  
  listWorlds: async (): Promise<WorldMetadata[]> => {
    const response = await fetch('/api/world-cards');
    if (!response.ok) {
      throw new Error(`Failed to list worlds: ${response.status}`);
    }
    const data = await response.json();
    return data.worlds || [];
  },
  
  // Navigation and location management
  movePlayer: async (worldName: string, direction: string): Promise<WorldState> => {
    const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ direction }),
    });
    if (!response.ok) {
      throw new Error(`Failed to move player: ${response.status}`);
    }
    const data = await response.json();
    return data.state;
  },
  
  createLocation: async (worldName: string, originCoordinates: string, direction: string): Promise<WorldState> => {
    const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/location/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ origin_coordinates: originCoordinates, direction }),
    });
    if (!response.ok) {
      throw new Error(`Failed to create location: ${response.status}`);
    }
    const data = await response.json();
    return data.state;
  },
  
  connectLocation: async (worldName: string, locationId: string, coordinates: number[]): Promise<WorldState> => {
    const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/connect-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ location_id: locationId, coordinates }),
    });
    if (!response.ok) {
      throw new Error(`Failed to connect location: ${response.status}`);
    }
    const data = await response.json();
    return data.state;
  },

  // Chat-related operations for world cards
  loadLatestChat: async (worldName: string): Promise<any> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/chat/latest`);
      
      if (response.status === 404) {
        console.log('No chat found for this world, will create a new one');
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`Failed to load chat: ${response.status}`);
      }
      
      const data = await response.json();
      return data.chat;
    } catch (err) {
      console.error('Error loading latest world chat:', err);
      return null;
    }
  },
  
  saveChat: async (worldName: string, chatData: any): Promise<boolean> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/chat/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chatData),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save chat: ${response.status}`);
      }
      
      const data = await response.json();
      return data.success;
    } catch (err) {
      console.error('Error saving world chat:', err);
      return false;
    }
  },
  
  appendMessage: async (worldName: string, chatId: string, message: any): Promise<boolean> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/chat/${encodeURIComponent(chatId)}/append`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to append message: ${response.status}`);
      }
      
      const data = await response.json();
      return data.success;
    } catch (err) {
      console.error('Error appending message to world chat:', err);
      return false;
    }
  },
  
  // Events
  resolveEvent: async (worldName: string, eventId: string, choiceId: string = "acknowledge"): Promise<WorldState> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/event/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event_id: eventId, choice_id: choiceId }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to resolve event: ${response.status}`);
      }
      
      const data = await response.json();
      return data.state;
    } catch (err) {
      console.error('Error resolving event:', err);
      throw err;
    }
  },

  /**
   * Adds a new NPC to a world
   * @param worldId The ID of the world to add the NPC to 
   * @param characterCard The character card data for the NPC
   * @param roomId Optional room ID to specifically place the NPC
   */
  async addNpcToWorld(worldId: string, characterCard: any, roomId?: string) {
    try {
      const response = await fetch(`/api/worlds/${encodeURIComponent(worldId)}/npcs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_data: characterCard,
          room_id: roomId
        })
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Failed to add NPC to world (${response.status})`);
      }
      
      return await response.json();
    } catch (err) {
      console.error('Failed to add NPC to world:', err);
      throw err;
    }
  },
};

export default worldCardApi;