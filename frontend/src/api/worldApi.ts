// frontend/src/api/worldApi.ts
// API client for World Card operations (V2)

import {
  WorldCard,
  WorldCardSummary,
  CreateWorldRequest,
  UpdateWorldRequest,
  WorldDeletePreview,
  WorldDeleteResult,
  WorldUserProgress,
  WorldUserProgressUpdate,
  WorldUserProgressSummary
} from '../types/worldCard';
import { EDITOR_GRID_SIZE } from '../types/editorGrid';

const BASE_URL = '/api/world-cards-v2';
const PROGRESS_BASE_URL = '/api/world';

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
      formData.append('grid_width', String(EDITOR_GRID_SIZE.cols));
      formData.append('grid_height', String(EDITOR_GRID_SIZE.rows));
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
   * Get a preview of what will happen when deleting a world
   * Shows which rooms will be deleted vs kept
   */
  async getDeletePreview(uuid: string): Promise<WorldDeletePreview> {
    const response = await fetch(`${BASE_URL}/${uuid}/delete-preview`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to get delete preview' }));
      throw new Error(error.detail || 'Failed to get delete preview');
    }

    const data = await response.json();
    return data.data.preview;
  },

  /**
   * Delete a world card (simple - keeps all rooms)
   */
  async deleteWorld(uuid: string): Promise<WorldDeleteResult> {
    const response = await fetch(`${BASE_URL}/${uuid}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to delete world' }));
      throw new Error(error.detail || 'Failed to delete world');
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * Delete a world card with optional cascade deletion of auto-generated rooms
   */
  async deleteWorldWithRooms(uuid: string, deleteRooms: boolean = true): Promise<WorldDeleteResult> {
    const response = await fetch(`${BASE_URL}/${uuid}?delete_rooms=${deleteRooms}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to delete world' }));
      throw new Error(error.detail || 'Failed to delete world');
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * Replace a world card's image while preserving metadata
   */
  async updateWorldImage(uuid: string, file: File): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${BASE_URL}/${uuid}/image`, {
      method: 'PUT',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to update world image' }));
      throw new Error(error.detail || 'Failed to update world image');
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

  // =============================================================================
  // World User Progress API (Per-User Save Slots)
  // =============================================================================

  /**
   * Get progress for a world+user combination.
   * Returns null if no progress exists (fresh start).
   */
  async getProgress(worldUuid: string, userUuid: string): Promise<WorldUserProgress | null> {
    const response = await fetch(`${PROGRESS_BASE_URL}/${worldUuid}/progress/${userUuid}`);

    if (response.status === 404) {
      // No progress found - fresh start
      return null;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch progress' }));
      throw new Error(error.detail || 'Failed to fetch progress');
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * Save (upsert) progress for a world+user combination.
   */
  async saveProgress(worldUuid: string, userUuid: string, update: WorldUserProgressUpdate): Promise<void> {
    const response = await fetch(`${PROGRESS_BASE_URL}/${worldUuid}/progress/${userUuid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(update),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to save progress' }));
      throw new Error(error.detail || 'Failed to save progress');
    }
  },

  /**
   * List all users who have progress for a world (save slot display).
   */
  async listProgressSummary(worldUuid: string): Promise<WorldUserProgressSummary[]> {
    const response = await fetch(`${PROGRESS_BASE_URL}/${worldUuid}/progress-summary`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch progress summary' }));
      throw new Error(error.detail || 'Failed to fetch progress summary');
    }

    const data = await response.json();
    return data.items || [];
  },

  /**
   * Delete progress for a world+user combination.
   */
  async deleteProgress(worldUuid: string, userUuid: string): Promise<void> {
    const response = await fetch(`${PROGRESS_BASE_URL}/${worldUuid}/progress/${userUuid}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to delete progress' }));
      throw new Error(error.detail || 'Failed to delete progress');
    }
  },
};
