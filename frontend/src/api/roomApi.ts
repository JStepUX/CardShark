// frontend/src/api/roomApi.ts
// API client for Room Card operations

import {
  RoomCard,
  RoomCardSummary,
  CreateRoomRequest,
  UpdateRoomRequest
} from '../types/room';

const BASE_URL = '/api/room-cards';

/**
 * API client for Room Card CRUD operations
 */
export const roomApi = {
  /**
   * Creates a new room card on the server.
   *
   * The room is stored as a PNG file in the rooms/ directory with metadata
   * embedded in the tEXt chunk (same format as character cards).
   *
   * @param request - Room creation parameters (name required, others optional)
   * @param image - Optional custom image file (uses default gray placeholder if not provided)
   * @returns RoomCardSummary with uuid, name, and metadata
   * @throws Error if creation fails (e.g., validation error, server error)
   *
   * @example
   * const room = await roomApi.createRoom({ name: 'Tavern', description: 'A cozy inn' });
   * // room.uuid can be used to add to a world via worldApi.updateWorld()
   */
  async createRoom(request: CreateRoomRequest, image?: File): Promise<RoomCardSummary> {
    const formData = new FormData();
    formData.append('name', request.name);
    if (request.description) formData.append('description', request.description);
    if (request.first_mes) formData.append('first_mes', request.first_mes);
    if (request.system_prompt) formData.append('system_prompt', request.system_prompt);
    if (image) formData.append('image', image);

    const response = await fetch(`${BASE_URL}/`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to create room' }));
      throw new Error(error.detail || 'Failed to create room');
    }

    const data = await response.json();
    return data.data.room;
  },

  /**
   * Lists all room cards available in the rooms/ directory.
   *
   * Returns summary information for each room, not full card data.
   * Use getRoom() to fetch complete room card data.
   *
   * @returns Array of RoomCardSummary objects
   * @throws Error if the API request fails
   *
   * @example
   * const rooms = await roomApi.listRooms();
   * const roomNames = rooms.map(r => r.name);
   */
  async listRooms(): Promise<RoomCardSummary[]> {
    const response = await fetch(`${BASE_URL}/`);

    if (!response.ok) {
      throw new Error('Failed to fetch rooms');
    }

    const data = await response.json();
    return data.items || [];
  },

  /**
   * Gets a single room card by UUID.
   *
   * Returns the full RoomCard with all metadata, including room_data extensions,
   * NPC assignments, and lore entries.
   *
   * @param uuid - The room's unique identifier
   * @returns Complete RoomCard object
   * @throws Error if room not found or request fails
   *
   * @example
   * const room = await roomApi.getRoom('abc-123');
   * console.log(room.data.name, room.data.extensions.room_data.npcs);
   */
  async getRoom(uuid: string): Promise<RoomCard> {
    const response = await fetch(`${BASE_URL}/${uuid}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Room not found' }));
      throw new Error(error.detail || 'Failed to fetch room');
    }

    const data = await response.json();
    return data.data.room;
  },

  /**
   * Updates an existing room card.
   *
   * Partial updates are supported - only include fields that should change.
   * The room's PNG file is regenerated with updated metadata.
   *
   * @param uuid - The room's unique identifier
   * @param request - Partial room data to update
   * @returns Updated RoomCardSummary
   * @throws Error if room not found or update fails
   *
   * @example
   * await roomApi.updateRoom('abc-123', { description: 'Updated description' });
   */
  async updateRoom(uuid: string, request: UpdateRoomRequest): Promise<RoomCardSummary> {
    const response = await fetch(`${BASE_URL}/${uuid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to update room' }));
      throw new Error(error.detail || 'Failed to update room');
    }

    const data = await response.json();
    return data.data.room;
  },

  /**
   * Deletes a room card from the server.
   *
   * The room's PNG file is removed from the rooms/ directory.
   * This does NOT update any worlds that reference this room.
   *
   * @param uuid - The room's unique identifier
   * @throws Error if room not found or deletion fails
   *
   * @example
   * await roomApi.deleteRoom('abc-123');
   *
   * @note Consider checking for world references before deletion (see WS-004 ticket)
   */
  async deleteRoom(uuid: string): Promise<void> {
    const response = await fetch(`${BASE_URL}/${uuid}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to delete room' }));
      throw new Error(error.detail || 'Failed to delete room');
    }
  },

  /**
   * Gets the URL for a room card's image.
   *
   * Returns a URL that can be used in img src attributes.
   * The image is extracted from the room's PNG file.
   *
   * @param uuid - The room's unique identifier
   * @returns URL string for the room's image
   *
   * @example
   * const imageUrl = roomApi.getRoomImageUrl('abc-123');
   * // <img src={imageUrl} alt="Room" />
   */
  getRoomImageUrl(uuid: string): string {
    return `${BASE_URL}/${uuid}/image`;
  },
};
