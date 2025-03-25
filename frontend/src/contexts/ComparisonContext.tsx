// frontend/src/contexts/ComparisonContext.tsx
import React, { createContext, useContext, useState } from 'react';
import { CharacterCard } from '../types/schema';

interface ComparisonContextType {
  isCompareMode: boolean;
  setCompareMode: (active: boolean) => void;
  secondaryCharacterData: CharacterCard | null;
  setSecondaryCharacterData: React.Dispatch<React.SetStateAction<CharacterCard | null>>;
  secondaryImageUrl: string | undefined;
  setSecondaryImageUrl: React.Dispatch<React.SetStateAction<string | undefined>>;
  secondaryIsLoading: boolean;
  setSecondaryIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  secondaryError: string | null;
  setSecondaryError: React.Dispatch<React.SetStateAction<string | null>>;
}

const ComparisonContext = createContext<ComparisonContextType | null>(null);

export const ComparisonProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isCompareMode, setCompareMode] = useState(false);
  const [secondaryCharacterData, setSecondaryCharacterData] = useState<CharacterCard | null>(null);
  const [secondaryImageUrl, setSecondaryImageUrl] = useState<string | undefined>(undefined);
  const [secondaryIsLoading, setSecondaryIsLoading] = useState(false);
  const [secondaryError, setSecondaryError] = useState<string | null>(null);

  const value = {
    isCompareMode,
    setCompareMode,
    secondaryCharacterData,
    setSecondaryCharacterData,
    secondaryImageUrl,
    setSecondaryImageUrl,
    secondaryIsLoading,
    setSecondaryIsLoading,
    secondaryError,
    setSecondaryError
  };

  return (
    <ComparisonContext.Provider value={value}>
      {children}
    </ComparisonContext.Provider>
  );
};

export const useComparison = () => {
  const context = useContext(ComparisonContext);
  if (!context) {
    throw new Error('useComparison must be used within a ComparisonProvider');
  }
  return context;
};

export default ComparisonContext;