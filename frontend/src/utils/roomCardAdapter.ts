// frontend/src/utils/roomCardAdapter.ts
// ============================================================================
// ROOM CARD ADAPTER
// ============================================================================
// Converts between RoomCard (storage format) and GridRoom (UI format).
// Use this when loading room cards for display in the grid-based UI.
// ============================================================================

import type { RoomCard } from '../types/room';
import type { GridRoom } from '../types/worldGrid';

/**
 * Converts a RoomCard to a GridRoom for display in the grid-based UI.
 *
 * This is the primary adapter for loading room cards into WorldEditor
 * and WorldPlayView. It extracts the relevant fields and formats them
 * for the grid UI components.
 *
 * @param roomCard - The RoomCard loaded from the API
 * @param position - Grid position where the room should be placed
 * @returns GridRoom suitable for grid-based UI components
 *
 * @example
 * for (const placement of worldData.rooms) {
 *   const roomCard = await roomApi.getRoom(placement.room_uuid);
 *   const gridRoom = roomCardToGridRoom(roomCard, placement.grid_position);
 *   loadedRooms.push(gridRoom);
 * }
 *
 * @note NPCs are converted from RoomNPC[] to string[] (just UUIDs)
 * @note Events and connections are not currently populated from RoomCard
 */
export function roomCardToGridRoom(
    roomCard: RoomCard,
    position: { x: number; y: number }
): GridRoom {
    return {
        id: roomCard.data.character_uuid || roomCard.data.extensions.room_data.uuid,
        name: roomCard.data.name,
        description: roomCard.data.description,
        introduction_text: roomCard.data.first_mes || '',
        npcs: roomCard.data.extensions.room_data.npcs.map(npc => npc.character_uuid),
        events: [], // Future: could populate from room_data.events if added
        connections: { north: null, south: null, east: null, west: null }, // Future: room connections
        position,
        image_path: undefined, // Image is accessed via roomApi.getRoomImageUrl()
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
