// frontend/src/services/backgroundService.ts
import { CharacterCard } from '../types/schema';
import { getCharacterId } from '../utils/characterLoader';

/**
 * Background Service - Handles character-specific and global backgrounds
 */
export class BackgroundService {
  /**
   * Get all available background images
   * @returns List of background images with metadata
   */
  static async getBackgrounds(): Promise<any[]> {
    try {
      const response = await fetch('/api/backgrounds');
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to get backgrounds:', response.status, errorText);
        return [];
      }
      
      const data = await response.json();
      // Backend returns ListResponse where the array is in 'data' property
      return data.success && Array.isArray(data.data) ? data.data : [];
    } catch (error) {
      console.error('Error getting backgrounds:', error);
      return [];
    }
  }

  /**
   * Upload a new background image
   * @param file The image file to upload
   * @param aspectRatio Optional aspect ratio to associate with the image
   * @returns Response data or null if failed
   */
  static async uploadBackground(file: File, aspectRatio?: number): Promise<any> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      if (aspectRatio) {
        formData.append('aspect_ratio', aspectRatio.toString());
      }
      
      const response = await fetch('/api/backgrounds/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to upload background:', response.status, errorText);
        return null;
      }
      
      const data = await response.json();
      // Backend returns DataResponse where the object is in 'data' property
      return data.success ? data.data : null;
    } catch (error) {
      console.error('Error uploading background:', error);
      return null;
    }
  }

  /**
   * Delete a background image
   * @param filename The filename of the background to delete
   * @returns True if deletion was successful
   */
  static async deleteBackground(filename: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/backgrounds/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to delete background:', response.status, errorText);
        return false;
      }
      
      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('Error deleting background:', error);
      return false;
    }
  }

  /**
   * Set a background for a specific character
   * @param character The character to set the background for
   * @param backgroundFilename The background filename or null to remove
   * @returns True if setting was successful
   */
  static async setCharacterBackground(character: CharacterCard | null, backgroundFilename: string | null): Promise<boolean> {
    if (!character) {
      console.error('Cannot set background: No character provided');
      return false;
    }

    try {
      // Extract character ID
      const characterId = getCharacterId(character);
      if (!characterId) {
        console.error('Cannot set background: Unable to get character ID');
        return false;
      }
      
      const response = await fetch(`/api/character-background/${encodeURIComponent(characterId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          background: backgroundFilename
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to set character background:', response.status, errorText);
        return false;
      }
      
      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('Error setting character background:', error);
      return false;
    }
  }

  /**
   * Get the background for a specific character
   * @param character The character to get the background for
   * @returns The background filename or null if none is set
   */
  static async getCharacterBackground(character: CharacterCard | null): Promise<string | null> {
    if (!character) {
      console.error('Cannot get background: No character provided');
      return null;
    }

    try {
      // Extract character ID
      const characterId = getCharacterId(character);
      if (!characterId) {
        console.error('Cannot get background: Unable to get character ID');
        return null;
      }
      
      const response = await fetch(`/api/character-background/${encodeURIComponent(characterId)}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to get character background:', response.status, errorText);
        return null;
      }
      
      const data = await response.json();
      return data.success === true ? data.background : null;
    } catch (error) {
      console.error('Error getting character background:', error);
      return null;
    }
  }
}