// frontend/src/components/ComparisonPanel.tsx
import React, { useState } from 'react';
import { X, ArrowLeft, Save } from 'lucide-react';
import { useComparison } from '../contexts/ComparisonContext';
import CharacterInfoView from './CharacterInfoView';
import CharacterGallery from './CharacterGallery';

interface ComparisonPanelProps {
  settingsChangeCount: number;
}

const ComparisonPanel: React.FC<ComparisonPanelProps> = ({ settingsChangeCount }) => {
  const {
    setCompareMode,
    secondaryCharacterData,
    secondaryIsLoading,
    secondaryError,
  } = useComparison();
  
  const [showGallery, setShowGallery] = useState(!secondaryCharacterData);

  const handleCloseComparison = () => {
    setCompareMode(false);
  };

  const handleBackToGallery = () => {
    setShowGallery(true);
  };

  const handleCharacterSelected = () => {
    setShowGallery(false);
  };

  return (
    <div className="h-full flex flex-col border-l border-stone-800 bg-stone-900">
      {/* Header */}
      <div className="p-4 flex justify-between items-center border-b border-stone-800">
        <div className="flex items-center">
          {!showGallery && secondaryCharacterData && (
            <button
              onClick={handleBackToGallery}
              className="mr-3 p-1 rounded-full hover:bg-stone-800 transition-colors"
              title="Back to gallery"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <h2 className="text-lg font-semibold">
            {showGallery 
              ? "Select Character to Compare" 
              : `Compare: ${secondaryCharacterData?.data?.name || 'Character'}`}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {!showGallery && secondaryCharacterData && (
            <button
              className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              title="Save changes to compared character"
            >
              <Save size={16} />
              <span className="text-sm">Save</span>
            </button>
          )}
          <button
            onClick={handleCloseComparison}
            className="p-1 rounded-full hover:bg-stone-800 transition-colors"
            title="Close comparison"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {showGallery ? (
          // Show the character gallery for selection
          <CharacterGallery 
            settingsChangeCount={settingsChangeCount}
            isSecondarySelector={true}
            onCharacterSelected={handleCharacterSelected}
          />
        ) : (
          // Show the character info for comparison
          <div className="h-full overflow-auto">
            {secondaryError && (
              <div className="px-4 py-2 bg-red-900/50 text-red-200">
                {secondaryError}
              </div>
            )}
            {secondaryIsLoading && (
              <div className="px-4 py-2 bg-blue-900/50 text-blue-200">
                Loading character data...
              </div>
            )}
            {secondaryCharacterData && (
              <CharacterInfoView isSecondary={true} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ComparisonPanel;