// frontend/src/api/worldApi.ts
import { WorldState, WorldMetadata } from '../types/world';

// Cache to track active world session
let activeWorldSession: {
  worldName: string | null;
  lastAccessed: number;
  hasPendingChanges: boolean;
} = {
  worldName: null,
  lastAccessed: 0,
  hasPendingChanges: false
};

/**
 * API client for World Card system
 * Handles communication with the backend for world-related operations
 */
export const worldApi = {
  // Session management
  getActiveWorldSession: (): { worldName: string | null; lastAccessed: number } => {
    return { 
      worldName: activeWorldSession.worldName, 
      lastAccessed: activeWorldSession.lastAccessed 
    };
  },

  setActiveWorldSession: (worldName: string | null): void => {
    activeWorldSession = {
      worldName,
      lastAccessed: Date.now(),
      hasPendingChanges: false
    };
    console.log(`Active world session set to: ${worldName || 'None'}`);
  },

  markPendingChanges: (hasPending: boolean = true): void => {
    activeWorldSession.hasPendingChanges = hasPending;
  },

  // World state management with debouncing
  getWorldState: async (worldName: string): Promise<WorldState> => {
    try {
      // Update session when accessing world
      if (activeWorldSession.worldName !== worldName) {
        worldApi.setActiveWorldSession(worldName);
      } else {
        activeWorldSession.lastAccessed = Date.now();
      }
      
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/state`);
      
      if (!response.ok) {
        throw new Error(`Failed to get world state: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to get world state');
      }
      
      return data.state;
    } catch (error) {
      console.error(`Error getting world state for '${worldName}':`, error);
      throw error;
    }
  },
  
  saveWorldState: async (worldName: string, state: WorldState): Promise<boolean> => {
    try {
      // Update session data
      activeWorldSession.lastAccessed = Date.now();
      activeWorldSession.hasPendingChanges = false;
      
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(state)
      });
      
      if (!response.ok) {
        activeWorldSession.hasPendingChanges = true; // Mark that we still have pending changes
        throw new Error(`Failed to save world state: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        activeWorldSession.hasPendingChanges = true; // Mark that we still have pending changes
        throw new Error(result.message || 'Failed to save world state');
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving world state for '${worldName}':`, error);
      throw error;
    }
  },
  
  // World metadata management
  getWorldMetadata: async (worldName: string): Promise<WorldMetadata> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/metadata`);
      
      if (!response.ok) {
        throw new Error(`Failed to get world metadata: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to get world metadata');
      }
      
      return data.metadata;
    } catch (error) {
      console.error(`Error getting metadata for world '${worldName}':`, error);
      throw error;
    }
  },
  
  saveWorldMetadata: async (worldName: string, metadata: Partial<WorldMetadata>): Promise<boolean> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save world metadata: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to save world metadata');
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving metadata for world '${worldName}':`, error);
      throw error;
    }
  },
  
  // World creation
  createWorld: async (worldName: string, characterFilePath?: string): Promise<{success: boolean, world_name: string}> => {
    try {
      // Clear any existing session when creating a new world
      if (activeWorldSession.worldName) {
        worldApi.setActiveWorldSession(null);
      }
      
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
        throw new Error(`Failed to create world: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to create world');
      }
      
      // Set the new world as active
      worldApi.setActiveWorldSession(data.world_name);
      
      return data;
    } catch (error) {
      console.error(`Error creating world '${worldName}':`, error);
      throw error;
    }
  },
  
  listWorlds: async (): Promise<WorldMetadata[]> => {
    try {
      const response = await fetch('/api/world-cards');
      
      if (!response.ok) {
        throw new Error(`Failed to list worlds: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to list worlds');
      }
      
      return result.worlds || [];
    } catch (error) {
      console.error('Error listing worlds:', error);
      throw error;
    }
  },
  
  deleteWorld: async (worldName: string): Promise<boolean> => {
    try {
      // If deleting the active world, clear the session
      if (activeWorldSession.worldName === worldName) {
        worldApi.setActiveWorldSession(null);
      }
      
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete world: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      return result.success === true;
    } catch (error) {
      console.error(`Error deleting world '${worldName}':`, error);
      throw error;
    }
  },
  
  // Navigation and location management
  movePlayer: async (worldName: string, direction: string): Promise<WorldState> => {
    try {
      // Update session data
      activeWorldSession.lastAccessed = Date.now();
      activeWorldSession.hasPendingChanges = true;
      
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ direction })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to move player: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to move player');
      }
      
      return data.state;
    } catch (error) {
      console.error(`Error moving player in world '${worldName}':`, error);
      throw error;
    }
  },
  
  createLocation: async (worldName: string, originCoordinates: string, direction: string): Promise<WorldState> => {
    try {
      // Update session data
      activeWorldSession.lastAccessed = Date.now();
      activeWorldSession.hasPendingChanges = true;
      
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
        throw new Error(`Failed to create location: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to create location');
      }
      
      return data.state;
    } catch (error) {
      console.error(`Error creating location in world '${worldName}':`, error);
      throw error;
    }
  },
  
  connectLocation: async (worldName: string, locationId: string, coordinates: number[]): Promise<WorldState> => {
    try {
      // Update session data
      activeWorldSession.lastAccessed = Date.now();
      activeWorldSession.hasPendingChanges = true;
      
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
        throw new Error(`Failed to connect location: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to connect location');
      }
      
      return data.state;
    } catch (error) {
      console.error(`Error connecting location in world '${worldName}':`, error);
      throw error;
    }
  },
  
  // Events
  resolveEvent: async (worldName: string, eventId: string, choiceId: string = "acknowledge"): Promise<WorldState> => {
    try {
      // Update session data
      activeWorldSession.lastAccessed = Date.now();
      activeWorldSession.hasPendingChanges = true;
      
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
        throw new Error(`Failed to resolve event: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to resolve event');
      }
      
      return data.state;
    } catch (error) {
      console.error(`Error resolving event in world '${worldName}':`, error);
      throw error;
    }
  },
  
  // World session management
  switchWorldSession: async (worldName: string | null): Promise<boolean> => {
    try {
      // Check if we have pending changes in the current world session
      if (activeWorldSession.worldName && activeWorldSession.hasPendingChanges) {
        console.warn(`Switching from world '${activeWorldSession.worldName}' with unsaved changes`);
        // In a real implementation, we might want to prompt the user to save
      }
      
      // Set the new active world
      worldApi.setActiveWorldSession(worldName);
      
      return true;
    } catch (error) {
      console.error(`Error switching to world '${worldName}':`, error);
      return false;
    }
  },
  
  checkForWorldUpdates: async (worldName: string, lastModifiedTimestamp: number): Promise<{hasUpdates: boolean, newState?: WorldState}> => {
    try {
      const response = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/check-updates?timestamp=${lastModifiedTimestamp}`);
      
      if (!response.ok) {
        throw new Error(`Failed to check for world updates: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to check for world updates');
      }
      
      return {
        hasUpdates: data.has_updates,
        newState: data.has_updates ? data.state : undefined
      };
    } catch (error) {
      console.error(`Error checking for updates to world '${worldName}':`, error);
      throw error;
    }
  }
};