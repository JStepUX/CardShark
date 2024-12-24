import React, { createContext, useContext, useState } from 'react';

// Simple interface - we just accept what the backend sends us
interface CharacterData {
  character_book: any;
  data: Record<string, any>;  // Accepts any data structure from backend
  spec: string;
  spec_version: string;
}

interface CharacterContextType {
  characterData: CharacterData | null;
  setCharacterData: (data: CharacterData | null) => void;
  imageUrl: string | undefined;  // Changed from string | null
  setImageUrl: (url: string | undefined) => void;  // Changed from string | null
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  createNewCharacter: (name: string) => void;  // Add this line
}

const CharacterContext = createContext<CharacterContextType | null>(null);

export const CharacterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [characterData, setCharacterData] = useState<CharacterData | null>(null);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);  // Changed from string | null
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createNewCharacter = (name: string) => {
    const newCharacter: CharacterData = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: name,
        description: "",
        personality: "",
        first_mes: "",
        mes_example: "",
        scenario: "",
        creator_notes: "",
        system_prompt: "",
        post_history_instructions: "",
        alternate_greetings: [],
        tags: [],
        creator: "",
        character_version: "",
        character_book: {
          entries: []
        }
      },
      character_book: undefined
    };
    setCharacterData(newCharacter);
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
    createNewCharacter  // Add this line
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

export type { CharacterData };
export default CharacterContext;