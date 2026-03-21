// frontend/src/services/characterImageService.ts

/**
 * Character Image metadata returned by the API
 */
export interface CharacterImage {
  id: number;
  filename: string;
  display_order: number;
  is_default: boolean;
  created_at: string;
  file_size: number;
  file_path: string;
}

/**
 * Character Image Service - Handles character-specific image gallery
 */
export class CharacterImageService {
  /**
   * List all images for a character
   * @param characterUuid The character UUID
   * @returns List of character images ordered by display_order
   */
  static async listImages(characterUuid: string): Promise<CharacterImage[]> {
    try {
      const response = await fetch(`/api/character/${encodeURIComponent(characterUuid)}/images`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to list character images:', response.status, errorText);
        return [];
      }

      const data = await response.json();
      // Backend returns ListResponse where the array is in 'data' property
      return data.success && Array.isArray(data.data) ? data.data : [];
    } catch (error) {
      console.error('Error listing character images:', error);
      return [];
    }
  }

  /**
   * Upload a new image for a character
   * @param characterUuid The character UUID
   * @param file The image file to upload
   * @returns The created character image metadata or null if failed
   */
  static async uploadImage(characterUuid: string, file: File): Promise<CharacterImage | null> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/character/${encodeURIComponent(characterUuid)}/images`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to upload character image:', response.status, errorText);
        return null;
      }

      const data = await response.json();
      // Backend returns DataResponse where the object is in 'data' property
      return data.success ? data.data : null;
    } catch (error) {
      console.error('Error uploading character image:', error);
      return null;
    }
  }

  /**
   * Delete a character image
   * @param characterUuid The character UUID
   * @param filename The filename of the image to delete
   * @returns True if deletion was successful
   */
  static async deleteImage(characterUuid: string, filename: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/character/${encodeURIComponent(characterUuid)}/images/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to delete character image:', response.status, errorText);
        return false;
      }

      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('Error deleting character image:', error);
      return false;
    }
  }

  /**
   * Reorder character images
   * @param characterUuid The character UUID
   * @param filenames Array of filenames in desired display order
   * @returns True if reordering was successful
   */
  static async reorderImages(characterUuid: string, filenames: string[]): Promise<boolean> {
    try {
      const response = await fetch(`/api/character/${encodeURIComponent(characterUuid)}/images/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filenames }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to reorder character images:', response.status, errorText);
        return false;
      }

      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('Error reordering character images:', error);
      return false;
    }
  }

  /**
   * Set an image as the default (starred) image for a character
   * @param characterUuid The character UUID
   * @param filename The filename of the image to set as default
   * @returns True if successful
   */
  static async setDefaultImage(characterUuid: string, filename: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/character/${encodeURIComponent(characterUuid)}/images/${encodeURIComponent(filename)}/set-default`, {
        method: 'PUT',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to set default image:', response.status, errorText);
        return false;
      }

      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('Error setting default image:', error);
      return false;
    }
  }

  /**
   * Clear the default image for a character (revert to main portrait)
   * @param characterUuid The character UUID
   * @returns True if successful
   */
  static async clearDefaultImage(characterUuid: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/character/${encodeURIComponent(characterUuid)}/images/default`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to clear default image:', response.status, errorText);
        return false;
      }

      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('Error clearing default image:', error);
      return false;
    }
  }

  /**
   * Get the URL for a character image
   * @param characterUuid The character UUID
   * @param filename The image filename
   * @returns The full URL to access the image
   */
  static getImageUrl(characterUuid: string, filename: string): string {
    return `/api/character-images/${encodeURIComponent(characterUuid)}/${encodeURIComponent(filename)}`;
  }
}
