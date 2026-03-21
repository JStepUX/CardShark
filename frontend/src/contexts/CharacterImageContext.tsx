/**
 * @file CharacterImageContext.tsx
 * @description Shared state for character secondary images (gallery).
 *
 * Solves two problems:
 * 1. SidePanel and CharacterImageGallery maintained independent image lists
 *    that drifted out of sync when one uploaded/deleted an image.
 * 2. The "starred" (default) image ID was ephemeral useState that reset on
 *    every mount -- now backed by the DB is_default column.
 *
 * Both consumers import useCharacterImages() and get the same list + default.
 * Mutations (upload, delete, setDefault) update shared state and hit the backend.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { CharacterImageService, CharacterImage } from '../services/characterImageService';
import { useCharacter } from './CharacterContext';

interface CharacterImageContextType {
  /** All secondary images for the current character, ordered by display_order */
  images: CharacterImage[];
  /** Whether the image list is currently loading */
  isLoading: boolean;
  /** The database ID of the default (starred) image, or null if portrait is default */
  defaultImageId: number | null;
  /** Reload images from the backend */
  refreshImages: () => Promise<void>;
  /** Called after a successful upload -- refreshes the list */
  onImageUploaded: () => Promise<void>;
  /** Called after a successful delete -- removes from local state */
  onImageDeleted: (imageId: number) => void;
  /** Set an image as the default (star it) and persist to backend */
  setDefaultImage: (image: CharacterImage) => Promise<boolean>;
  /** Clear the default image (revert star to portrait) and persist to backend */
  clearDefaultImage: () => Promise<boolean>;
}

const CharacterImageContext = createContext<CharacterImageContextType | null>(null);

export const CharacterImageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { characterData } = useCharacter();
  const characterUuid = characterData?.data?.character_uuid;

  const [images, setImages] = useState<CharacterImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [defaultImageId, setDefaultImageId] = useState<number | null>(null);

  // Track which character we last loaded for, to avoid stale data
  const loadedForUuid = useRef<string | undefined>(undefined);

  const loadImages = useCallback(async () => {
    if (!characterUuid) {
      setImages([]);
      setDefaultImageId(null);
      loadedForUuid.current = undefined;
      return;
    }

    setIsLoading(true);
    try {
      const fetched = await CharacterImageService.listImages(characterUuid);
      setImages(fetched);

      // Derive default from the is_default flag returned by the backend
      const defaultImg = fetched.find(img => img.is_default);
      setDefaultImageId(defaultImg ? defaultImg.id : null);
      loadedForUuid.current = characterUuid;
    } catch (error) {
      console.error('[CharacterImageContext] Error loading images:', error);
    } finally {
      setIsLoading(false);
    }
  }, [characterUuid]);

  // Reload when character changes
  useEffect(() => {
    if (characterUuid !== loadedForUuid.current) {
      loadImages();
    }
  }, [characterUuid, loadImages]);

  const refreshImages = useCallback(async () => {
    await loadImages();
  }, [loadImages]);

  const onImageUploaded = useCallback(async () => {
    await loadImages();
  }, [loadImages]);

  const onImageDeleted = useCallback((imageId: number) => {
    setImages(prev => prev.filter(img => img.id !== imageId));
    if (defaultImageId === imageId) {
      setDefaultImageId(null);
    }
  }, [defaultImageId]);

  const setDefaultImageFn = useCallback(async (image: CharacterImage): Promise<boolean> => {
    if (!characterUuid) return false;

    try {
      const success = await CharacterImageService.setDefaultImage(characterUuid, image.filename);
      if (success) {
        // Update local state immediately
        setDefaultImageId(image.id);
        setImages(prev => prev.map(img => ({
          ...img,
          is_default: img.id === image.id,
        })));
      }
      return success;
    } catch (error) {
      console.error('[CharacterImageContext] Error setting default image:', error);
      return false;
    }
  }, [characterUuid]);

  const clearDefaultImageFn = useCallback(async (): Promise<boolean> => {
    if (!characterUuid) return false;

    try {
      const success = await CharacterImageService.clearDefaultImage(characterUuid);
      if (success) {
        setDefaultImageId(null);
        setImages(prev => prev.map(img => ({
          ...img,
          is_default: false,
        })));
      }
      return success;
    } catch (error) {
      console.error('[CharacterImageContext] Error clearing default image:', error);
      return false;
    }
  }, [characterUuid]);

  const value: CharacterImageContextType = {
    images,
    isLoading,
    defaultImageId,
    refreshImages,
    onImageUploaded,
    onImageDeleted,
    setDefaultImage: setDefaultImageFn,
    clearDefaultImage: clearDefaultImageFn,
  };

  return (
    <CharacterImageContext.Provider value={value}>
      {children}
    </CharacterImageContext.Provider>
  );
};

export const useCharacterImages = (): CharacterImageContextType => {
  const context = useContext(CharacterImageContext);
  if (!context) {
    throw new Error('useCharacterImages must be used within a CharacterImageProvider');
  }
  return context;
};

export default CharacterImageContext;
