/**
 * @file CharacterContext.tsx
 * @description Global context for currently selected character data and state.
 * @dependencies characterService, thinFrameService
 * @consumers App wide
 */
import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { CharacterCard, CharacterFile } from '../types/schema';
import { generateUUID } from '../utils/uuidUtils';
import {
  generateThinFrame,
  hasThinFrame,
  mergeThinFrameIntoCard,
} from '../services/thinFrameService';


// Add character gallery cache interface
interface CharacterGalleryCache {
  characters: CharacterFile[];
  directory: string;
  timestamp: number;
  isValid: boolean;
}

/** Snapshot of character content for change detection */
interface CharacterContentSnapshot {
  description: string;
  personality: string;
}

interface CharacterContextType {
  characterData: CharacterCard | null;
  setCharacterData: React.Dispatch<React.SetStateAction<CharacterCard | null>>;
  imageUrl: string | undefined;
  setImageUrl: React.Dispatch<React.SetStateAction<string | undefined>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  createNewCharacter: (name: string) => void;
  saveCharacter: (apiConfig?: Record<string, unknown>) => Promise<void>;
  handleImageChange: (newImageData: string | File) => Promise<void>;
  isNewlyCreated: boolean;
  setIsNewlyCreated: React.Dispatch<React.SetStateAction<boolean>>;

  // Unsaved changes tracking
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;

  // Thin frame generation state
  isGeneratingThinFrame: boolean;

  // New gallery cache properties
  characterCache: CharacterGalleryCache | null;
  setCharacterCache: React.Dispatch<React.SetStateAction<CharacterGalleryCache | null>>;
  invalidateCharacterCache: () => void;

  // Snapshot management for thin frame regeneration
  setContentSnapshot: (snapshot: CharacterContentSnapshot) => void;
}

const CharacterContext = createContext<CharacterContextType | null>(null);

export const CharacterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [characterData, setCharacterData] = useState<CharacterCard | null>(null);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);  // Changed from string | null
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNewlyCreated, setIsNewlyCreated] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [characterCache, setCharacterCache] = useState<CharacterGalleryCache | null>(null);
  const [isGeneratingThinFrame, setIsGeneratingThinFrame] = useState(false);

  // Snapshot of character content at load time for thin frame regeneration detection
  const contentSnapshotRef = useRef<CharacterContentSnapshot>({ description: '', personality: '' });

  const setContentSnapshot = useCallback((snapshot: CharacterContentSnapshot) => {
    contentSnapshotRef.current = snapshot;
  }, []);

  const createNewCharacter = (name: string) => {
    const newCharacter: CharacterCard = {
      name: "",
      description: "",
      personality: "",
      scenario: "",
      first_mes: "",
      mes_example: "",
      creatorcomment: "",
      avatar: "none",
      chat: "",
      talkativeness: "0.5",
      fav: false,
      tags: [],
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: name,
        description: "",
        personality: "",
        scenario: "",
        first_mes: "",
        mes_example: "",
        creator_notes: "",
        system_prompt: "",
        post_history_instructions: "",
        tags: [],
        creator: "",
        character_version: "",
        alternate_greetings: [],
        character_uuid: generateUUID(), // Generate UUID for new character
        extensions: {
          talkativeness: "0.5",
          fav: false,
          world: "Fresh",
          depth_prompt: {
            prompt: "",
            depth: 4,
            role: "system"
          }
        },
        group_only_greetings: [],
        character_book: {
          entries: [],
          name: ""
        },
        spec: ''
      },
      create_date: ""
    };
    setCharacterData(newCharacter);
    setIsNewlyCreated(true); // Mark as newly created
  };

  // Save character card to backend
  // apiConfig is optional - if provided and content changed, will generate thin frame
  const saveCharacter = async (apiConfig?: Record<string, unknown>): Promise<void> => {
    if (!characterData) {
      setError("No character data available to save");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Check if description/personality changed for thin frame regeneration
      const currentDesc = characterData.data?.description || '';
      const currentPers = characterData.data?.personality || '';
      const originalDesc = contentSnapshotRef.current.description;
      const originalPers = contentSnapshotRef.current.personality;

      const contentChanged = currentDesc !== originalDesc || currentPers !== originalPers;
      const needsThinFrame = !hasThinFrame(characterData) || contentChanged;

      // Generate thin frame if API config provided and content changed
      let cardToSave = characterData;
      if (apiConfig && needsThinFrame && (currentDesc || currentPers)) {
        try {
          setIsGeneratingThinFrame(true);
          console.log('[ThinFrame] Generating thin frame for character:', characterData.data?.name);

          const thinFrame = await generateThinFrame(characterData, apiConfig, { timeout: 30000 });
          cardToSave = mergeThinFrameIntoCard(characterData, thinFrame);

          console.log('[ThinFrame] Thin frame generated successfully');
        } catch (thinFrameError) {
          // Log but don't fail the save - thin frame is optional
          console.warn('[ThinFrame] Failed to generate thin frame:', thinFrameError);
        } finally {
          setIsGeneratingThinFrame(false);
        }
      }

      // Prepare the file - use imageUrl from context
      let fileToSave: File | null = null;

      if (imageUrl) {
        // Fetch the current image from context
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          fileToSave = new File([blob], "character.png", { type: "image/png" });
        } catch (fetchError) {
          console.error("Error fetching current image:", fetchError);
          throw new Error("Failed to access the current image");
        }
      }

      // Final check - if we still don't have a valid image, throw an error
      if (!fileToSave) {
        throw new Error("No valid image available to save");
      }

      // Create form data
      const formData = new FormData();
      formData.append("file", fileToSave);
      formData.append("metadata_json", JSON.stringify(cardToSave));

      // Save the file
      const saveResponse = await fetch("/api/characters/save-card", {
        method: "POST",
        body: formData,
      });

      if (!saveResponse.ok) {
        const errorText = await saveResponse.text();
        throw new Error(`Save failed: ${errorText}`);
      }

      // Handle successful save
      const saveResult = await saveResponse.json();

      if (saveResult.success) {
        console.log("Character saved successfully:", saveResult);

        // Update local state with saved card (including thin frame)
        setCharacterData(cardToSave);

        // Update snapshot to current content
        contentSnapshotRef.current = { description: currentDesc, personality: currentPers };

        // Reset unsaved changes flag
        setHasUnsavedChanges(false);

        // IMPORTANT: Invalidate character gallery cache to ensure immediate refresh
        invalidateCharacterCache();
      } else {
        throw new Error(saveResult.message || "Unknown error during save");
      }

    } catch (error) {
      console.error("Save error:", error);
      setError(error instanceof Error ? error.message : "Failed to save character");
    } finally {
      setIsLoading(false);
      setIsGeneratingThinFrame(false);
    }
  };

  // Handle image replacement - saves character with new image
  const handleImageChange = async (newImageData: string | File): Promise<void> => {
    if (!characterData?.data?.character_uuid) {
      console.error('Cannot save image: No character data or UUID');
      setError('Cannot save image: Character not properly loaded');
      return;
    }

    try {
      console.log('Saving character image change for UUID:', characterData.data.character_uuid);

      // Convert to blob
      let imageBlob: Blob;
      if (newImageData instanceof File) {
        imageBlob = newImageData;
      } else {
        // Data URL - convert to blob
        const response = await fetch(newImageData);
        imageBlob = await response.blob();
      }

      // Prepare form data
      const formData = new FormData();
      formData.append("file", new File([imageBlob], "character.png", { type: "image/png" }));
      formData.append("metadata_json", JSON.stringify(characterData));

      // Save the character with new image
      const saveResponse = await fetch("/api/characters/save-card", {
        method: "POST",
        body: formData,
      });

      if (!saveResponse.ok) {
        throw new Error(`Failed to save image (${saveResponse.status})`);
      }

      console.log('Character image saved successfully, reloading from backend...');

      // Reload the image from the backend to verify save
      const timestamp = Date.now();
      const imageUrlPath = `/api/character-image/${characterData.data.character_uuid}?t=${timestamp}`;

      const imageResponse = await fetch(imageUrlPath);
      if (!imageResponse.ok) {
        throw new Error(`Failed to reload image (${imageResponse.status})`);
      }

      const blob = await imageResponse.blob();
      const newImageUrl = URL.createObjectURL(blob);

      // Update image URL in context
      setImageUrl(newImageUrl);

      console.log('Character image updated and reloaded successfully');

    } catch (error) {
      console.error('Failed to save character image:', error);
      setError(`Failed to save image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const invalidateCharacterCache = () => {
    setCharacterCache(null);
  };

  const value = {
    characterData,
    setCharacterData,
    imageUrl,
    setImageUrl,
    isLoading,
    setIsLoading,
    error,
    setError,
    createNewCharacter,
    saveCharacter,
    handleImageChange,
    isNewlyCreated,
    setIsNewlyCreated,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    isGeneratingThinFrame,
    characterCache,
    setCharacterCache,
    invalidateCharacterCache,
    setContentSnapshot,
  };

  return (
    <CharacterContext.Provider value={value}>
      {children}
    </CharacterContext.Provider>
  );
};

export const useCharacter = () => {
  const context = useContext(CharacterContext);
  if (!context) {
    throw new Error('useCharacter must be used within a CharacterProvider');
  }
  return context;
};

export type { CharacterCard as CharacterData };
export default CharacterContext;