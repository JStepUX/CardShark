// frontend/src/utils/worldStateApi.ts
import { FullWorldState } from '../types/worldState';

/**
 * API client for interacting with the World Card system
 */
export const worldStateApi = {
  /**
   * Get a list of all available worlds
   */
  listWorlds: async () => {
    const response = await fetch('/api/world-cards');
    if (!response.ok) {
      throw new Error(`Failed to list worlds: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to list worlds');
    }
    return data.worlds;
  },

  /**
   * Create a new world, either empty or based on a character
   */
  createWorld: async (worldName: string, characterFilePath?: string) => {
    const response = await fetch('/api/world-cards/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        world_name: worldName,
        character_file_path: characterFilePath,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create world: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to create world');
    }

    return {
      success: true,
      world_name: data.world_name,
    };
  },

  /**
   * Get the state for a specific world
   */
  getWorldState: async (worldName: string): Promise<FullWorldState> => {
    const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/state`);
    if (!response.ok) {
      throw new Error(`Failed to get world state: ${response.statusText}`);
    }
    return await response.json();
  },

  /**
   * Save the state for a specific world
   */
  saveWorldState: async (worldName: string, state: FullWorldState): Promise<boolean> => {
    const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state),
    });

    if (!response.ok) {
      throw new Error(`Failed to save world state: ${response.statusText}`);
    }

    const data = await response.json();
    return data.success === true;
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
  loadLatestChat: async (worldName: string) => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/chat/latest`);
      
      if (response.status === 404) {
        console.log('No chat found for this world, will create a new one');
        return null;
      }
      
      if (!response.ok) {
        console.warn(`Failed to load latest chat for world ${worldName}: ${response.status} ${response.statusText}`);
        return null;
      }
      
      const data = await response.json();
      return data.chat;
    } catch (error) {
      console.error(`Error loading latest chat for world ${worldName}:`, error);
      throw new Error(`Failed to load latest chat: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Save a chat for a world card
   */
  saveChat: async (worldName: string, chatId: string, chatData: any) => {
    try {
      // Include the chatId in the request body to ensure it's used by the backend
      const dataWithChatId = {
        ...chatData,
        metadata: {
          ...chatData.metadata,
          chat_id: chatId // Ensure chatId is explicitly set in metadata
        }
      };
      
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/chat/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataWithChatId),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save chat: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error(`Error saving chat for world ${worldName}:`, error);
      throw new Error(`Failed to save chat: ${error instanceof Error ? error.message : String(error)}`);
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