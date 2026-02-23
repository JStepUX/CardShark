// frontend/src/components/ComparisonPanel.tsx
import React, { useState } from 'react';
import { X, ArrowLeft, Save } from 'lucide-react';
import { useComparison } from '../contexts/ComparisonContext';
import Button from './common/Button';
import CharacterInfoView from './character/CharacterInfoView';
import CharacterGallery from './character/CharacterGallery';

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
    <div className="h-full flex flex-col bg-stone-900 overflow-hidden">
      {/* Header */}
      <div className="p-4 flex justify-between items-center border-b border-stone-800">
        <div className="flex items-center">
          {!showGallery && secondaryCharacterData && (
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft size={18} />}
              onClick={handleBackToGallery}
              title="Back to gallery"
              pill
              className="mr-3"
            />
          )}
          <h2 className="heading-primary">
            {showGallery 
              ? "Select Character to Compare" 
              : `Compare: ${secondaryCharacterData?.data?.name || 'Character'}`}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {!showGallery && secondaryCharacterData && (
            <Button
              variant="primary"
              size="sm"
              icon={<Save size={16} />}
              title="Save changes to compared character"
            >
              Save
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={<X size={18} />}
            onClick={handleCloseComparison}
            title="Close comparison"
            pill
          />
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