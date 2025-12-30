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
   * Create a new room card
   */
  async createRoom(request: CreateRoomRequest, image?: File): Promise<RoomCardSummary> {
    const formData = new FormData();
    formData.append('name', request.name);
    if (request.description) formData.append('description', request.description);
    if (request.first_mes) formData.append('first_mes', request.first_mes);
    if (request.system_prompt) formData.append('system_prompt', request.system_prompt);
    if (image) formData.append('image', image);

    const response = await fetch(BASE_URL, {
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
   * List all room cards
   */
  async listRooms(): Promise<RoomCardSummary[]> {
    const response = await fetch(BASE_URL);

    if (!response.ok) {
      throw new Error('Failed to fetch rooms');
    }

    const data = await response.json();
    return data.items || [];
  },

  /**
   * Get a single room card by UUID
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
   * Update an existing room card
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
   * Delete a room card
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
   * Get room card image URL
   */
  getRoomImageUrl(uuid: string): string {
    return `${BASE_URL}/${uuid}/image`;
  },
};
