// frontend/src/utils/worldStateApi.ts
// ============================================================================
// WORLD STATE API - NPC Resolution and Type Re-exports
// ============================================================================
// This file provides:
//   1. Type re-exports from canonical sources for backward compatibility
//   2. Helper function for NPC data resolution
//
// Type sources (canonical):
//   - Grid UI types: '../types/worldGrid' (GridRoom, GridWorldState, DisplayNPC)
//   - Runtime types: '../types/worldRuntime' (WorldState, RuntimeRoom, PlayerState)
//   - Storage types: '../types/room' (RoomCard, RoomNPC)
//   - Storage types: '../types/worldCard' (WorldCard, WorldRoomPlacement)
//
// For conversions between types, see:
//   - '../utils/roomCardAdapter' - RoomCard ↔ GridRoom conversions
//   - '../utils/worldGridAdapter' - WorldState ↔ GridWorldState conversions
//
// API clients:
//   - '../api/worldApi' - World card CRUD operations
//   - '../api/roomApi' - Room card CRUD operations
// ============================================================================

// Re-export grid types from canonical source for backward compatibility
export type { GridRoom, GridWorldState, DisplayNPC } from '../types/worldGrid';
import type { DisplayNPC } from '../types/worldGrid';

/**
 * Resolves NPC character UUIDs to display information for the UI.
 *
 * Fetches character data from the API and extracts name, image URL, and personality
 * for each NPC. Used by NPCShowcase, SidePanel, and RoomPropertiesPanel to display
 * NPC information without loading full character cards.
 *
 * @param npcIds - Array of character UUIDs assigned to a room
 * @returns Array of DisplayNPC objects with resolved names and image URLs
 *
 * @example
 * const npcs = await resolveNpcDisplayData(['uuid-1', 'uuid-2']);
 * // Returns: [{ id: 'uuid-1', name: 'Alice', imageUrl: '/api/character-image/uuid-1.png' }]
 *
 * @note Returns partial results if some characters fail to resolve (no error thrown)
 * @note Makes a network request to /api/characters on each call - consider caching
 * @note Falls back to empty array on network error
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
    // Handle multiple API response formats: { characters: [...] }, { data: [...] }, or direct array
    const characters = data.characters || data.data || (Array.isArray(data) ? data : []);

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
