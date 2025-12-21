import { WorldData, Room, RoomNPC, NpcGridItem } from '../types/world';
import worldStateApi from '../utils/worldStateApi';

/**
 * Service for handling world data operations with proper error handling
 * and data validation
 */
class WorldDataService {
  loadCharacter(_character_id: any) {
    throw new Error('Method not implemented.');
  }
  /**
   * Loads a world with validation and error handling
   */
  async loadWorld(worldId: string): Promise<WorldData> {
    try {
      const response = await worldStateApi.getWorldState(worldId);
      return this.validateWorldData(response);
    } catch (error) {
      console.error('Error loading world:', error);
      throw new Error(`Failed to load world: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validates world data and ensures required properties are present
   */
  validateWorldData(worldData: any): WorldData {
    if (!worldData) {
      throw new Error('World data is empty');
    }

    // Adapt legacy structure if needed (minimal support)
    if (worldData.locations && !worldData.rooms) {
      console.warn('Converting legacy world locations to rooms array (stub)');
      worldData.rooms = Object.entries(worldData.locations).map(([pos, loc]: [string, any]) => ({
        ...loc,
        id: loc.location_id || pos,
        description: loc.description || '',
        connections: [],
        npcs: [],
        items: [],
        visited: loc.visited || false
      }));
    }

    // Ensure rooms is an array
    if (!Array.isArray(worldData.rooms)) {
      worldData.rooms = [];
    }

    // Ensure settings
    if (!worldData.settings) {
      worldData.settings = {
        narrator_voice: 'default',
        time_system: 'turn_based',
        global_scripts: []
      };
    }

    // Ensure player_state
    if (!worldData.player_state) {
      worldData.player_state = {
        inventory: [],
        health: 100,
        stats: {},
        flags: {}
      };
    }

    // Set entry room if missing
    if (!worldData.player_state.current_room_id && worldData.rooms.length > 0) {
      worldData.player_state.current_room_id = worldData.rooms[0].id;
    }

    return worldData;
  }

  /**
   * Gets the current room with proper error handling
   */
  getCurrentRoom(worldData: WorldData): Room | null {
    if (!worldData || !worldData.rooms || worldData.rooms.length === 0) {
      return null;
    }

    const currentId = worldData.player_state?.current_room_id;
    if (currentId) {
      const room = worldData.rooms.find(r => r.id === currentId);
      if (room) return room;
    }

    // Fallback to first room
    return worldData.rooms[0];
  }

  /**
   * Safely processes NPC data from a room
   */
  processNpcs(room: Room | null): NpcGridItem[] {
    if (!room || !room.npcs) {
      return [];
    }

    return room.npcs.map((npc: RoomNPC) => {
      // Create a display-ready NPC item
      const name = npc.character_id.split(/[/\\]/).pop()?.replace('.png', '') || 'NPC';
      return {
        character_id: npc.character_id,
        name,
        path: npc.character_id
      };
    });
  }


  /**
   * Save updated world state with error handling
   */
  async saveWorldState(worldId: string, worldData: WorldData): Promise<boolean> {
    try {
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