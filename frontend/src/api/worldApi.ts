// frontend/src/api/worldApi.ts
// API client for World Card operations (V2)

import {
  WorldCard,
  WorldCardSummary,
  CreateWorldRequest,
  UpdateWorldRequest
} from '../types/worldCard';
import { GridSize } from '../types/worldV2';

const BASE_URL = '/api/world-cards-v2';

/**
 * API client for World Card CRUD operations (V2 PNG-based)
 */
export const worldApi = {
  /**
   * Create a new world card
   */
  async createWorld(request: CreateWorldRequest, image?: File): Promise<WorldCardSummary> {
    const formData = new FormData();
    formData.append('name', request.name);
    if (request.description) formData.append('description', request.description);
    if (request.grid_size) {
      formData.append('grid_width', String(request.grid_size.width));
      formData.append('grid_height', String(request.grid_size.height));
    } else {
      formData.append('grid_width', '10');
      formData.append('grid_height', '10');
    }
    if (request.first_mes) formData.append('first_mes', request.first_mes);
    if (request.system_prompt) formData.append('system_prompt', request.system_prompt);
    if (image) formData.append('image', image);

    const response = await fetch(BASE_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to create world' }));
      throw new Error(error.detail || 'Failed to create world');
    }

    const data = await response.json();
    return data.data.world;
  },

  /**
   * List all world cards
   */
  async listWorlds(): Promise<WorldCardSummary[]> {
    const response = await fetch(BASE_URL);

    if (!response.ok) {
      throw new Error('Failed to fetch worlds');
    }

    const data = await response.json();
    return data.items || [];
  },

  /**
   * Get a single world card by UUID
   */
  async getWorld(uuid: string): Promise<WorldCard> {
    const response = await fetch(`${BASE_URL}/${uuid}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'World not found' }));
      throw new Error(error.detail || 'Failed to fetch world');
    }

    const data = await response.json();
    return data.data.world;
  },

  /**
   * Update an existing world card
   */
  async updateWorld(uuid: string, request: UpdateWorldRequest): Promise<WorldCardSummary> {
    const response = await fetch(`${BASE_URL}/${uuid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to update world' }));
      throw new Error(error.detail || 'Failed to update world');
    }

    const data = await response.json();
    return data.data.world;
  },

  /**
   * Delete a world card
   */
  async deleteWorld(uuid: string): Promise<void> {
    const response = await fetch(`${BASE_URL}/${uuid}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to delete world' }));
      throw new Error(error.detail || 'Failed to delete world');
    }
  },

  /**
   * Get world card image URL
   */
  getWorldImageUrl(uuid: string): string {
    return `${BASE_URL}/${uuid}/image`;
  },

  /**
   * Export a world card as a .cardshark.zip archive
   */
  async exportWorld(uuid: string): Promise<Blob> {
    const response = await fetch(`${BASE_URL}/${uuid}/export`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to export world' }));
      throw new Error(error.detail || 'Failed to export world');
    }

    return await response.blob();
  },

  /**
   * Import a world card from a .cardshark.zip archive
   */
  async importWorld(file: File): Promise<{ uuid: string; name: string; message: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${BASE_URL}/import`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to import world' }));
      throw new Error(error.detail || 'Failed to import world');
    }

    const data = await response.json();
    return {
      uuid: data.data.world.uuid,
      name: data.data.world.name,
      message: data.data.message,
    };
  },
};
