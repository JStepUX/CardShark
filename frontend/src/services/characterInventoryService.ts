import { getApiBaseUrl } from '../utils/apiConfig';
import { apiService } from './apiService';

/**
 * API service utility to work with the CharacterInventory system
 */
export const characterInventoryService = {
  /**
   * Get the base URL for API calls
   */
  getBaseUrl: () => getApiBaseUrl(),
  
  /**
   * Get UUID for a character
   */
  async getCharacterUuid(characterId: string, characterName?: string): Promise<string> {
    if (!characterId) {
      throw new Error('characterId is required to get UUID');
    }
    
    try {
      const params = new URLSearchParams({
        character_id: characterId,
      });
      
      if (characterName) {
        params.append('character_name', characterName);
      }
      
      const response = await fetch(`${this.getBaseUrl()}/api/character_inventory/uuid?${params}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get character UUID: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      if (!data.uuid) {
        throw new Error('Character UUID not found in response');
      }
      return data.uuid;
    } catch (err) {
      console.error('Failed to get character UUID:', err);
      throw err; // Re-throw the error
    }
  },
  
  /**
   * Upload a lore image
   */
  async uploadLoreImage(
    characterUuid: string, // characterUuid is now required as per apiService
    loreEntryId: string,
    imageFile: File,
    characterFallbackId?: string // Made optional as apiService handles it
  ): Promise<any> { // Consider using a more specific type like LoreImageResponse from apiService
    try {
      // Delegate to apiService
      // apiService.uploadLoreImage expects characterUuid to be non-null.
      // If characterUuid might be null here, ensure logic handles it or update apiService.
      // For now, assuming characterUuid will be available or obtained before this call.
      return await apiService.uploadLoreImage(characterUuid, loreEntryId, imageFile, characterFallbackId);
    } catch (error) {
      console.error('Error uploading lore image via characterInventoryService:', error);
      throw error;
    }
  },
  
  /**
   * Import a lore image from URL
   */
  async importLoreImageFromUrl(
    characterUuid: string, // characterUuid is now required as per apiService
    loreEntryId: string,
    imageUrl: string,
    characterFallbackId?: string // Made optional as apiService handles it
  ): Promise<any> { // Consider using a more specific type like LoreImageResponse from apiService
    try {
      // Delegate to apiService
      return await apiService.importLoreImageFromUrl(characterUuid, loreEntryId, imageUrl, characterFallbackId);
    } catch (error) {
      console.error('Error importing lore image from URL via characterInventoryService:', error);
      throw error;
    }
  },

  /**
   * Delete a lore image
   */
  async deleteLoreImage(
    characterUuid: string, // characterUuid is now required as per apiService
    imageUuidOrFilename: string
    // characterFallbackId is not directly used here as apiService.deleteLoreImage
    // currently does not accept it. If backend supports it for delete, apiService needs update.
  ): Promise<any> { // Consider using a more specific type like LoreImageResponse from apiService
    try {
      // Delegate to apiService
      // Note: apiService.deleteLoreImage currently only takes characterUuid and imageUuidOrFilename.
      // If characterFallbackId is needed for deletion, apiService.deleteLoreImage must be updated.
      return await apiService.deleteLoreImage(characterUuid, imageUuidOrFilename);
    } catch (error) {
      console.error('Error deleting lore image via characterInventoryService:', error);
      throw error;
    }
  }
};
