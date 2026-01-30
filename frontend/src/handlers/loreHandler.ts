// frontend/src/handlers/loreHandler.ts

import { LoreEntry } from '../types/schema';
import { getApiBaseUrl } from '../utils/apiConfig';


// I. Frontend Development - Chat & PNG Preview
// 1. Lore Handler Modifications

// Data Structure for triggered lore images
export interface TriggeredLoreImage {
  entryId: string; // or number, consistent with LoreEntry ID type
  imageUuid: string;
  imagePath: string; // full path for <img> src, derived from imageUuid and character UUID
  timestamp: number; // To sort by trigger time
}

// Array to track triggered images during a chat session
// This would typically be managed within a state management solution (Context, Zustand, Redux, etc.)
// For now, we'll define the structure and functions.
// In a real app, this array would not be a global export but part of a class or store.
// Use a Map for efficient O(1) deduplication and updates. Key is entryId.
let triggeredLoreImages: Map<string, TriggeredLoreImage> = new Map();

/**
 * Processes lore entries when they are matched in the chat.
 * If a matched entry has an image, its details are added to triggeredLoreImages.
 * 
 * @param matchedEntries - An array of LoreEntry objects that were matched.
 * @param characterUuid - The UUID of the current character (needed to construct imagePath).
 */
export const processLoreEntriesForImageTracking = (
  matchedEntries: LoreEntry[],
  characterUuid: string 
): void => {
  if (!characterUuid) {
    console.warn('processLoreEntriesForImageTracking: characterUuid is missing, cannot track images.');
    return;
  }

  const apiBaseUrl = getApiBaseUrl();

  matchedEntries.forEach(entry => {
    if (entry.has_image && entry.image_uuid) {
      const entryIdStr = entry.id.toString();
      // Construct full image path with API base URL
      const relativePath = `/uploads/lore_images/${characterUuid}/${entry.image_uuid}`;
      const imagePath = `${apiBaseUrl}${relativePath}`;

      const existingImage = triggeredLoreImages.get(entryIdStr);

      if (existingImage) {
        // Update timestamp if re-triggered
        existingImage.timestamp = Date.now();
        existingImage.imagePath = imagePath; // Update path in case it could change
        triggeredLoreImages.set(entryIdStr, existingImage); // Re-set to ensure Map updates if object was copied
      } else {
        triggeredLoreImages.set(entryIdStr, {
          entryId: entryIdStr,
          imageUuid: entry.image_uuid,
          imagePath: imagePath,
          timestamp: Date.now(),
        });
      }
    }
  });

  // Sorting will now be done when the images are retrieved, e.g., in getAvailableImagesForPreview
};

/**
 * Provides an array of available images for the PNG preview, including the character image.
 * 
 * @param characterImagePath - The path to the main character image.
 * @returns An array of objects, each representing an image available for preview.
 */
export interface AvailablePreviewImage {
  type: 'character' | 'lore';
  src: string;
  entryId?: string; // Optional: only for lore images
  imageUuid?: string; // Optional: only for lore images, if needed by UI
}

export const getAvailableImagesForPreview = (characterImagePath: string): AvailablePreviewImage[] => {
  const availableImages: AvailablePreviewImage[] = [];

  // Add character image first
  if (characterImagePath) {
    availableImages.push({ type: 'character', src: characterImagePath });
  }

  // Get lore images from the Map, convert to array, and sort by timestamp (newest first)
  const loreImagesArray = Array.from(triggeredLoreImages.values());
  loreImagesArray.sort((a, b) => b.timestamp - a.timestamp);
  
  loreImagesArray.forEach(loreImg => {
    availableImages.push({
      type: 'lore',
      src: loreImg.imagePath,
      entryId: loreImg.entryId,
      imageUuid: loreImg.imageUuid,
    });
  });
  
  return availableImages;
};

/**
 * Resets the list of triggered lore images.
 * Typically called when a new chat session starts.
 */
export const resetTriggeredImages = (): void => {
  // Clear the Map
  triggeredLoreImages.clear();
};

/**
 * Returns a copy of the current globally tracked triggered lore images.
 * @returns A new array containing the triggered lore images.
 */
export const getGlobalTriggeredLoreImages = (): TriggeredLoreImage[] => {
  // Return a new array created from the Map values
  // This provides a sorted list by timestamp (newest first)
  const imagesArray = Array.from(triggeredLoreImages.values());
  imagesArray.sort((a, b) => b.timestamp - a.timestamp);
  return imagesArray;
};

// Placeholder for where these functions would be integrated.
// This file primarily defines the structures and utility functions.
// The actual state management of `triggeredLoreImages` and invocation of these functions
// would happen within the chat context, ChatView.tsx, or a dedicated chat/lore state manager.