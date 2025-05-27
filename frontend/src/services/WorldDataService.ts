import { FullWorldState, WorldLocation, NpcGridItem } from '../types/worldState';
import worldStateApi from '../utils/worldStateApi';

/**
 * Service for handling world data operations with proper error handling
 * and data validation
 */
class WorldDataService {  loadCharacter(_character_id: any) {
    throw new Error('Method not implemented.');
  }
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

    // Ensure current_position is set and valid
    const locationKeys = Object.keys(worldData.locations);
    if (!worldData.current_position && locationKeys.length > 0) {
      // If no current position but we have locations, use the first one
      worldData.current_position = locationKeys[0];
      console.log('Setting default current_position to', worldData.current_position);
    } else if (worldData.current_position && !worldData.locations[worldData.current_position] && locationKeys.length > 0) {
      // If current position is invalid (doesn't exist in locations), reset it to a valid one
      worldData.current_position = locationKeys[0];
      console.log('Resetting invalid current_position to', worldData.current_position);
    }

    return worldData;
  }

  /**
   * Gets the current room with proper error handling
   */
  getCurrentRoom(worldData: FullWorldState): { room: WorldLocation | null, position: string | null } {
    if (!worldData || !worldData.locations) {
      console.warn('getCurrentRoom: No world data or locations');
      return { room: null, position: null };
    }

    const locationKeys = Object.keys(worldData.locations);
    if (locationKeys.length === 0) {
      console.warn('getCurrentRoom: No locations in world data');
      return { room: null, position: null };
    }

    // Try to get room from current position
    const currentPosition = worldData.current_position;
    if (currentPosition && worldData.locations[currentPosition]) {
      console.log('getCurrentRoom: Using current_position', currentPosition);
      return { room: worldData.locations[currentPosition], position: currentPosition };
    }

    // Try common position formats
    const commonPositions = ["0,0,0", "0,0", "1,0", "start"];
    for (const pos of commonPositions) {
      if (worldData.locations[pos]) {
        console.log('getCurrentRoom: Using common position', pos);
        return { room: worldData.locations[pos], position: pos };
      }
    }

    // Fall back to the first available location
    const firstPosition = locationKeys[0];
    console.log('getCurrentRoom: Falling back to first available location', firstPosition);
    return { room: worldData.locations[firstPosition], position: firstPosition };
  }

  /**
   * Safely processes NPC data from a room
   */
  processNpcs(room: WorldLocation | null): NpcGridItem[] {
    if (!room || !room.npcs) {
      return [];
    }    return room.npcs.map((npc: any) => {
      // If npc is already a valid object with name and path, return it
      if (typeof npc === 'object' && npc !== null && typeof npc.name === 'string' && typeof npc.path === 'string') {
        return {
          ...npc,
          character_id: npc.character_id || npc.path // Use existing character_id or fallback to path
        } as NpcGridItem;
      }
      
      // If npc is a string (path), create an object with path and derived name
      if (typeof npc === 'string') {
        const pathParts = npc.split(/[\/\\]/);
        const fileName = pathParts[pathParts.length - 1];
        const name = fileName.replace(/\.\w+$/, '') || 'Unknown NPC';
        
        return {
          character_id: npc, // Use the path as character_id for string NPCs
          name,
          path: npc
        };
      }
      
      // Default fallback for unknown formats
      return {
        character_id: typeof npc === 'string' ? npc : 'unknown',
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