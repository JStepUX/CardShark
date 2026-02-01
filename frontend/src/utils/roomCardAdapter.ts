// frontend/src/utils/roomCardAdapter.ts
// ============================================================================
// ROOM CARD ADAPTER
// ============================================================================
// Converts between RoomCard (storage format) and GridRoom (UI format).
// Use this when loading room cards for display in the grid-based UI.
// ============================================================================

import type { RoomCard } from '../types/room';
import type { GridRoom } from '../types/worldGrid';
import type { WorldRoomPlacement } from '../types/worldCard';

/**
 * Converts a RoomCard to a GridRoom for display in the grid-based UI.
 *
 * This is the primary adapter for loading room cards into WorldEditor
 * and WorldPlayView. It extracts the relevant fields and formats them
 * for the grid UI components.
 *
 * IMPORTANT: Instance data (NPCs, images) from WorldRoomPlacement takes precedence
 * over room card defaults. This ensures world-specific assignments are preserved.
 *
 * @param roomCard - The RoomCard loaded from the API (the template)
 * @param position - Grid position where the room should be placed
 * @param placement - Optional WorldRoomPlacement with instance-specific data (NPCs, images, state)
 * @returns GridRoom suitable for grid-based UI components
 *
 * @example
 * // Loading from world card with instance data
 * for (const placement of worldData.rooms) {
 *   const roomCard = await roomApi.getRoom(placement.room_uuid);
 *   const gridRoom = roomCardToGridRoom(roomCard, placement.grid_position, placement);
 *   loadedRooms.push(gridRoom);
 * }
 *
 * @example
 * // Importing from gallery (no instance data yet)
 * const roomCard = await roomApi.getRoom(uuid);
 * const gridRoom = roomCardToGridRoom(roomCard, selectedCell);
 * // gridRoom.npcs will be deep copy of room card NPCs
 *
 * @note Instance NPCs override room card's default NPCs
 * @note Instance image_path overrides room card's default image
 * @note Events and connections are not currently populated
 */
export function roomCardToGridRoom(
    roomCard: RoomCard,
    position: { x: number; y: number },
    placement?: WorldRoomPlacement
): GridRoom {
    // Use instance data if available, else fall back to room card defaults
    const npcs = placement?.instance_npcs
        ? [...placement.instance_npcs] // Use instance assignments (already full RoomNPC[])
        : [...(roomCard.data.extensions.room_data.npcs || [])]; // Deep copy room NPCs

    const image_path = placement?.instance_image_path
        || undefined; // Image accessed via roomApi.getRoomImageUrl() if not overridden

    return {
        id: roomCard.data.character_uuid || roomCard.data.extensions.room_data.uuid,
        name: roomCard.data.name,
        description: roomCard.data.description,
        introduction_text: roomCard.data.first_mes || '',
        npcs, // Full RoomNPC[] objects
        events: [], // Future: could populate from room_data.events if added
        connections: { north: null, south: null, east: null, west: null }, // Future: room connections
        position,
        image_path,
        layout_data: roomCard.data.extensions.room_data.layout_data, // Spatial layout configuration
    };
}

/**
 * Converts a GridRoom back to partial RoomCard update data.
 *
 * Use this when saving grid UI state back to the server.
 * Returns an object suitable for roomApi.updateRoom().
 *
 * @param gridRoom - The GridRoom from the UI
 * @returns Partial room data for update API call
 *
 * @example
 * const updateData = gridRoomToRoomUpdate(gridRoom);
 * await roomApi.updateRoom(gridRoom.id, updateData);
 *
 * @note Only includes fields that can be updated via the API
 * @note NPC updates require separate handling
 */
export function gridRoomToRoomUpdate(gridRoom: GridRoom): {
    name: string;
    description: string;
    first_mes?: string;
} {
    return {
        name: gridRoom.name,
        description: gridRoom.description,
        first_mes: gridRoom.introduction_text || undefined,
    };
}

/**
 * Creates a lightweight GridRoom "stub" from WorldRoomPlacement data only.
 *
 * This enables "lazy loading" - the map can render room names and NPC indicators
 * without fetching each room card individually. The full room data is only
 * fetched when the player enters that room.
 *
 * @param placement - WorldRoomPlacement from the world card
 * @returns GridRoom stub with enough data for map display
 *
 * @example
 * // Build map grid without fetching rooms
 * const gridRooms = worldData.rooms.map(placement =>
 *   placementToGridRoomStub(placement)
 * );
 *
 * @note Returns a "stub" - some fields are empty/defaults
 * @note Full room data (description, lore, etc.) requires fetching the room card
 * @note Falls back to "Unknown Room" if instance_name is not populated (legacy worlds)
 */
export function placementToGridRoomStub(placement: WorldRoomPlacement): GridRoom {
    return {
        id: placement.room_uuid,
        name: placement.instance_name || 'Unknown Room', // Fallback for legacy worlds
        description: placement.instance_description || '', // Brief description if cached
        introduction_text: '', // Not included in placement - fetch on room entry
        npcs: placement.instance_npcs ? [...placement.instance_npcs] : [], // Full RoomNPC[] for NPC count/hostile display
        events: [], // Not populated in stubs
        connections: { north: null, south: null, east: null, west: null }, // Not populated in stubs
        position: placement.grid_position,
        image_path: placement.instance_image_path,
    };
}
