// frontend/src/contexts/ComparisonContext.tsx
import React, { createContext, useContext, useState } from 'react';
import { CharacterCard } from '../types/schema';

// Panel mode type - supports comparison panel
type PanelMode = 'comparison' | null;

interface ComparisonContextType {
  // Panel mode control
  panelMode: PanelMode;
  setPanelMode: (mode: PanelMode) => void;

  // Comparison mode
  isCompareMode: boolean;
  setCompareMode: (active: boolean) => void;

  // Comparison panel state
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
  // Unified panel mode state - only one panel can be open at a time
  const [panelMode, setPanelMode] = useState<PanelMode>(null);

  // Comparison panel state
  const [secondaryCharacterData, setSecondaryCharacterData] = useState<CharacterCard | null>(null);
  const [secondaryImageUrl, setSecondaryImageUrl] = useState<string | undefined>(undefined);
  const [secondaryIsLoading, setSecondaryIsLoading] = useState(false);
  const [secondaryError, setSecondaryError] = useState<string | null>(null);

  // Derived states
  const isCompareMode = panelMode === 'comparison';

  const setCompareMode = (active: boolean) => {
    setPanelMode(active ? 'comparison' : null);
  };

  const value = {
    panelMode,
    setPanelMode,
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