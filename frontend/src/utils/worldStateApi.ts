// frontend/src/utils/worldStateApi.ts
import { FullWorldState } from '../types/worldState';

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
        throw new Error(`Failed to list worlds: ${
          errorData.detail || errorData.message || response.statusText
        }`);
      }
      
      const data = await response.json();
      return data.worlds || [];
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
        throw new Error(`Failed to create world: ${
          errorData.detail || errorData.message || response.statusText
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
        throw new Error(`Failed to load world: ${
          errorData.detail || errorData.message || response.statusText
        }`);
      }
      
      const data = await response.json();
      if (data && data.success && data.state) {
        console.log(`Successfully loaded world state with ${Object.keys(data.state.locations || {}).length} locations`);
        return data.state;
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
   * Move the player in a specific direction
   */
  movePlayer: async (worldName: string, direction: string): Promise<FullWorldState> => {
    const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ direction }),
    });

    if (!response.ok) {
      throw new Error(`Failed to move player: ${response.statusText}`);
    }

    return await response.json();
  },

  /**
   * Create a new location adjacent to the current one
   */
  createLocation: async (
    worldName: string,
    originCoordinates: string,
    direction: string
  ): Promise<FullWorldState> => {
    const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/location/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        origin_coordinates: originCoordinates,
        direction,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create location: ${response.statusText}`);
    }

    return await response.json();
  },

  /**
   * Connect an unconnected location to the map
   */
  connectLocation: async (
    worldName: string,
    locationId: string,
    coordinates: number[]
  ): Promise<FullWorldState> => {
    const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/connect-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location_id: locationId,
        coordinates,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to connect location: ${response.statusText}`);
    }

    return await response.json();
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
        throw new Error(`Failed to load latest chat: ${
          errorData.detail || errorData.message || response.statusText
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
  appendMessage: async (worldName: string, chatId: string, message: any) => {
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
      return data.success === true;
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
   * Update a location in the world
   */
  updateLocation: async (worldName: string, coordinates: string, locationData: any): Promise<FullWorldState> => {
    try {
      // First get the current world state
      const worldState = await worldStateApi.getWorldState(worldName);
      
      // Update the specific location
      if (worldState.locations && worldState.locations[coordinates]) {
        worldState.locations[coordinates] = {
          ...worldState.locations[coordinates],
          ...locationData
        };
        
        // Save the updated state
        const success = await worldStateApi.saveWorldState(worldName, worldState);
        if (success) {
          return worldState;
        } else {
          throw new Error('Failed to save updated location');
        }
      } else {
        throw new Error(`Location not found at coordinates: ${coordinates}`);
      }
    } catch (err) {
      console.error('Error updating location:', err);
      throw err;
    }
  }
};

export default worldStateApi;