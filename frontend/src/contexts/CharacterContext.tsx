import React, { createContext, useContext, useState } from 'react';
import { CharacterCard } from '../types/schema';
import { generateUUID } from '../utils/uuidUtils';

// Add character file interface for gallery
interface CharacterFile {
  name: string;
  path: string;
  size: number;
  modified: number;
  is_incomplete?: boolean; // True if character has no valid metadata (needs editing)
  character_uuid?: string;
  description?: string;
}

// Add character gallery cache interface
interface CharacterGalleryCache {
  characters: CharacterFile[];
  directory: string;
  timestamp: number;
  isValid: boolean;
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
  isNewlyCreated: boolean;
  setIsNewlyCreated: React.Dispatch<React.SetStateAction<boolean>>;
  
  // New gallery cache properties
  characterCache: CharacterGalleryCache | null;
  setCharacterCache: React.Dispatch<React.SetStateAction<CharacterGalleryCache | null>>;
  invalidateCharacterCache: () => void;
}

const CharacterContext = createContext<CharacterContextType | null>(null);

export const CharacterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [characterData, setCharacterData] = useState<CharacterCard | null>(null);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);  // Changed from string | null
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNewlyCreated, setIsNewlyCreated] = useState(false);
  const [characterCache, setCharacterCache] = useState<CharacterGalleryCache | null>(null);
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
    isNewlyCreated,
    setIsNewlyCreated,
    characterCache,
    setCharacterCache,
    invalidateCharacterCache
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