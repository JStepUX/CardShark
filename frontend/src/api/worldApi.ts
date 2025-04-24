// frontend/src/api/worldApi.ts
import { WorldState, WorldMetadata } from '../types/world';

/**
 * API client for World Card system
 * Handles communication with the backend for world-related operations
 */
export const worldApi = {
  // World state management
  getWorldState: async (worldName: string): Promise<WorldState> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/state`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get world state: ${response.status} - ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error getting world state for '${worldName}':`, error);
      throw error;
    }
  },
  
  saveWorldState: async (worldName: string, state: WorldState): Promise<boolean> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(state)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save world state: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error(`Error saving world state for '${worldName}':`, error);
      throw error;
    }
  },
  
  // World creation
  createWorld: async (worldName: string, characterFilePath?: string): Promise<{success: boolean, world_name: string}> => {
    try {
      const response = await fetch('/api/world-cards/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          world_name: worldName,
          character_file_path: characterFilePath
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create world: ${response.status} - ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error creating world '${worldName}':`, error);
      throw error;
    }
  },
  
  listWorlds: async (): Promise<WorldMetadata[]> => {
    try {
      const response = await fetch('/api/world-cards');
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list worlds: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      return result.worlds || [];
    } catch (error) {
      console.error('Error listing worlds:', error);
      throw error;
    }
  },
  
  // Navigation and location management
  movePlayer: async (worldName: string, direction: string): Promise<WorldState> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ direction })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to move player: ${response.status} - ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error moving player in world '${worldName}':`, error);
      throw error;
    }
  },
  
  createLocation: async (worldName: string, originCoordinates: string, direction: string): Promise<WorldState> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/location/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          origin_coordinates: originCoordinates,
          direction
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create location: ${response.status} - ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error creating location in world '${worldName}':`, error);
      throw error;
    }
  },
  
  connectLocation: async (worldName: string, locationId: string, coordinates: number[]): Promise<WorldState> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/connect-location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          location_id: locationId,
          coordinates
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to connect location: ${response.status} - ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error connecting location in world '${worldName}':`, error);
      throw error;
    }
  },
  
  // Events
  resolveEvent: async (worldName: string, eventId: string, choiceId: string = "acknowledge"): Promise<WorldState> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/event/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_id: eventId,
          choice_id: choiceId
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to resolve event: ${response.status} - ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error resolving event in world '${worldName}':`, error);
      throw error;
    }
  }
};