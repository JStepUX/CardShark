import { FullWorldState, WorldLocation, NpcGridItem } from '../types/worldState';
import worldStateApi from '../utils/worldStateApi';

/**
 * Service for handling world data operations with proper error handling
 * and data validation
 */
class WorldDataService {
  /**
   * Loads a world with validation and error handling
   */
  async loadWorld(worldId: string): Promise<FullWorldState> {
    try {
      const worldData = await worldStateApi.getWorldState(worldId);
      return this.validateWorldData(worldData);
    } catch (error) {
      console.error('Error loading world:', error);
      throw new Error(`Failed to load world: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validates world data and ensures required properties are present
   */
  validateWorldData(worldData: any): FullWorldState {
    if (!worldData) {
      throw new Error('World data is empty');
    }

    // Ensure locations is an object
    if (!worldData.locations) {
      worldData.locations = {};
    }

    // Ensure visited_positions is an array
    if (!Array.isArray(worldData.visited_positions)) {
      worldData.visited_positions = [];
    }

    // Ensure worldItems is an array if it exists
    if (worldData.worldItems && !Array.isArray(worldData.worldItems)) {
      worldData.worldItems = [];
    }

    // Ensure current_position is set
    if (!worldData.current_position && Object.keys(worldData.locations).length > 0) {
      worldData.current_position = Object.keys(worldData.locations)[0];
    }

    return worldData;
  }

  /**
   * Gets the current room with proper error handling
   */
  getCurrentRoom(worldData: FullWorldState): { room: WorldLocation | null, position: string | null } {
    if (!worldData || !worldData.locations) {
      return { room: null, position: null };
    }

    // Try to get room from current position
    const currentPosition = worldData.current_position;
    if (currentPosition && worldData.locations[currentPosition]) {
      return { room: worldData.locations[currentPosition], position: currentPosition };
    }

    // Try default position "0,0,0"
    const defaultPosition = "0,0,0";
    if (worldData.locations[defaultPosition]) {
      return { room: worldData.locations[defaultPosition], position: defaultPosition };
    }

    // Fall back to the first available location
    const locationKeys = Object.keys(worldData.locations);
    if (locationKeys.length > 0) {
      const firstPosition = locationKeys[0];
      return { room: worldData.locations[firstPosition], position: firstPosition };
    }

    // No rooms found
    return { room: null, position: null };
  }

  /**
   * Safely processes NPC data from a room
   */
  processNpcs(room: WorldLocation | null): NpcGridItem[] {
    if (!room || !room.npcs) {
      return [];
    }

    return room.npcs.map((npc: any) => {
      // If npc is already a valid object with name and path, return it
      if (typeof npc === 'object' && npc !== null && typeof npc.name === 'string' && typeof npc.path === 'string') {
        return npc as NpcGridItem;
      }
      
      // If npc is a string (path), create an object with path and derived name
      if (typeof npc === 'string') {
        const pathParts = npc.split(/[\/\\]/);
        const fileName = pathParts[pathParts.length - 1];
        const name = fileName.replace(/\.\w+$/, '') || 'Unknown NPC';
        
        return {
          name,
          path: npc
        };
      }
      
      // Default fallback for unknown formats
      return {
        name: 'Unknown NPC',
        path: typeof npc === 'string' ? npc : ''
      };
    });
  }
  
  /**
   * Process world items into character book entries
   */
  processWorldItems(worldData: FullWorldState): Array<{keys: string[], content: string}> {
    const worldItems = worldData?.worldItems || [];
    
    if (!Array.isArray(worldItems)) {
      return [];
    }
    
    return worldItems.map(item => {
      if (item && typeof item === 'object') {
        return {
          keys: [item.name || "Unknown Item"],
          content: item.description || ""
        };
      }
      return { keys: ["Unknown Item"], content: "" };
    });
  }
  
  /**
   * Save updated world state with error handling
   */
  async saveWorldState(worldId: string, worldData: FullWorldState): Promise<boolean> {
    try {
      // Make sure we're saving valid data
      const validatedData = this.validateWorldData(worldData);
      
      return await worldStateApi.saveWorldState(worldId, validatedData);
    } catch (error) {
      console.error('Error saving world state:', error);
      throw new Error(`Failed to save world: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Export as a singleton
export const worldDataService = new WorldDataService();