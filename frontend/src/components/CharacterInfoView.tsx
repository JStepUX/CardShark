import React, { useState, useEffect, useRef } from 'react';
import { Search, FileJson, SplitSquareVertical, AlertTriangle, Save } from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';
import { useComparison } from '../contexts/ComparisonContext';
import { CharacterCard } from '../types/schema';
import RichTextEditor from './RichTextEditor';
import { FindReplaceDialog } from './FindReplaceDialog';
import { Dialog } from './Dialog';
import MessagesView from './MessagesView';
import { saveCharacterCardToPng } from '../handlers/exportHandlers';

// Dedicated modal version of JsonViewer without redundant title
const JsonViewerModal: React.FC<{
  characterData: CharacterCard | null;
  setCharacterData: React.Dispatch<React.SetStateAction<CharacterCard | null>>;
}> = ({ characterData, setCharacterData }) => {
  const [editableJson, setEditableJson] = useState(() => {
    try {
      return characterData ? JSON.stringify(characterData, null, 2) : 'No character data loaded';
    } catch (e) {
      return 'Invalid JSON data';
    }
  });
  const [error, setError] = useState<string | null>(null);

  // Update content when character data changes
  React.useEffect(() => {
    if (characterData) {
      try {
        setEditableJson(JSON.stringify(characterData, null, 2));
        setError(null);
      } catch (e) {
        setEditableJson('Invalid JSON data');
        setError('Invalid JSON data');
      }
    } else {
      setEditableJson('No character data loaded');
      setError('No character data loaded');
    }
  }, [characterData]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditableJson(e.target.value);
  };

  const handleSave = () => {
    try {
      const parsedData = JSON.parse(editableJson);
      setCharacterData(parsedData);
      setError(null);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
    }
  };

  return (
    <div className="h-full w-full flex flex-col">
      {error && <div className="text-red-500 mb-2">{error}</div>}
      <textarea
        className="w-full flex-1 bg-stone-900 text-white font-mono text-sm
                  rounded-lg p-4 overflow-auto
                  whitespace-pre-wrap break-words resize-none"
        value={editableJson}
        onChange={handleChange}
      />
      <button
        className="mt-4 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded"
        onClick={handleSave}
      >
        Save Changes
      </button>
    </div>
  );
};

interface CharacterInfoViewProps {
  isSecondary?: boolean;
}

const CharacterInfoView: React.FC<CharacterInfoViewProps> = ({ isSecondary = false }) => {  // Use the appropriate context based on the mode
  const primaryContext = useCharacter();
  const { isCompareMode, setCompareMode, secondaryCharacterData, setSecondaryCharacterData } = useComparison();
  
  // Determine which data to use based on isSecondary prop
  const { characterData, setCharacterData } = isSecondary 
    ? { characterData: secondaryCharacterData, setCharacterData: setSecondaryCharacterData }
    : primaryContext;
  
  // Always get imageUrl from primary context (not used in secondary/compare mode)
  const { imageUrl } = primaryContext;
    const [showFindReplace, setShowFindReplace] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);
  // Smart change tracking state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [originalCharacterData, setOriginalCharacterData] = useState<CharacterCard | null>(null);
  const changeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track original character data when it changes
  useEffect(() => {
    if (characterData && JSON.stringify(characterData) !== JSON.stringify(originalCharacterData)) {
      setOriginalCharacterData(JSON.parse(JSON.stringify(characterData)));
      setHasUnsavedChanges(false);
    }
  }, [characterData?.data?.character_uuid]); // Only reset when character actually changes

  // Debounced change detection - only detect real changes after user stops typing
  useEffect(() => {
    if (!originalCharacterData || !characterData) return;

    // Clear existing timeout
    if (changeTimeoutRef.current) {
      clearTimeout(changeTimeoutRef.current);
    }

    // Set a debounced check for changes
    changeTimeoutRef.current = setTimeout(() => {
      const hasChanges = JSON.stringify(characterData) !== JSON.stringify(originalCharacterData);
      setHasUnsavedChanges(hasChanges);
    }, 1000); // 1 second delay to avoid flagging temporary typing

    // Cleanup timeout on unmount
    return () => {
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
    };  }, [characterData, originalCharacterData]);
  // Navigation blocking using beforeunload and improved popstate handling
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    const handlePopState = (_e: PopStateEvent) => {
      if (hasUnsavedChanges) {
        // Since preventDefault() doesn't work on popstate, we need to handle this differently
        // Use setTimeout to avoid blocking the current event handling
        setTimeout(() => {
          const confirmLeave = window.confirm('You have unsaved changes. Are you sure you want to leave?');
          if (!confirmLeave) {
            // Use history.go(1) to move forward one step instead of pushState
            // This reverses the back navigation that just occurred
            window.history.go(1);
          }
        }, 0);
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [hasUnsavedChanges]);// Save function
  const handleSave = async () => {
    if (!characterData) return;
    
    try {
      // Create a simple image blob for saving (we could enhance this later with actual image)
      const response = await fetch(imageUrl || '/api/placeholder-image');
      const imageBlob = await response.blob();
      
      await saveCharacterCardToPng(characterData, imageBlob);
      setOriginalCharacterData(JSON.parse(JSON.stringify(characterData)));
      setHasUnsavedChanges(false);
      setShowUnsavedModal(false);
      
      // Execute pending navigation if any
      if (pendingNavigation) {
        pendingNavigation();
        setPendingNavigation(null);
      }
    } catch (error) {
      console.error('Failed to save character:', error);
    }
  };

  // Handle modal actions
  const handleCancelNavigation = () => {
    setShowUnsavedModal(false);
    setPendingNavigation(null);
  };

  const handleDiscardChanges = () => {
    if (originalCharacterData) {
      setCharacterData(JSON.parse(JSON.stringify(originalCharacterData)));
      setHasUnsavedChanges(false);
    }
    setShowUnsavedModal(false);
    
    // Execute pending navigation if any
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  };
  const handleFieldChange = (field: keyof CharacterCard['data'], value: string | string[]): void => {
    try {
      // If there's no character data yet, auto-create a new character
      if (!characterData?.data) {
        if (primaryContext.createNewCharacter) {
          // Create with the field value as name, or empty name if it's not the name field
          const newName = field === 'name' ? (value as string) : '';
          primaryContext.createNewCharacter(newName);
          // The useEffect will handle setting this as the original data
          // Don't return here - continue to update the field after creation
        } else {
          console.error("Cannot create character: createNewCharacter function not available");
          return;
        }
      }

      // Update the character data (this will work for both existing and newly created characters)
      setCharacterData((prev: CharacterCard | null) => {
        if (!prev?.data) return prev;

        return {
          ...prev,
          data: {
            ...prev.data,
            [field]: value,
          },
        };
      });
    } catch (error) {
      console.error("Error updating character field:", error);
    }
  };

  // Helper function to safely get field value
  const getFieldValue = (field: keyof CharacterCard['data']): string => {
    const value = characterData?.data?.[field];
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return value?.toString() || '';
  };

  // Toggle comparison mode
  const toggleCompareMode = () => {
    setCompareMode(!isCompareMode);
  };

  return (
    <>
      <div className="p-8 pb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold">
          {isSecondary ? "Comparison View" : "Primary Character Info"}
        </h2>
        <div className="flex items-center gap-3">
          {/* Compare button - only shown in primary view when not already comparing */}
          {!isSecondary && (
            <button
              onClick={toggleCompareMode}
              className={`flex items-center gap-2 px-4 py-2 ${
                isCompareMode 
                  ? 'bg-stone-700 text-white' 
                  : 'bg-transparent hover:bg-stone-800 text-white'
              } rounded-lg transition-colors`}
              title={isCompareMode ? "Close comparison" : "Compare with another character"}
            >
              <SplitSquareVertical className="w-4 h-4" />
              {isCompareMode ? "Close Compare" : "Compare"}
            </button>
          )}
          
          {/* Find & Replace button */}
          <button
            onClick={() => setShowFindReplace(true)}
            className="flex items-center gap-2 px-4 py-2 bg-transparent hover:bg-stone-800 text-white rounded-lg transition-colors"
          >
            <Search className="w-4 h-4" />
            Find & Replace
          </button>
          
          {/* JSON Viewer Button */}
          <button
            onClick={() => setShowJsonModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-transparent hover:bg-stone-800 text-white rounded-lg transition-colors"
            title="View JSON"
          >
            <FileJson className="w-5 h-5" />
          </button>
        </div>
      </div>      <div className="flex-1 overflow-y-auto">
        <div className="px-8 pb-8">
          {/* Show unsaved changes notification */}
          {hasUnsavedChanges && (
            <div className="mb-6 p-4 bg-yellow-900/50 border border-yellow-600 rounded-lg">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-300" />
                  <div>
                    <h3 className="text-md font-medium text-yellow-200">You have unsaved changes</h3>
                    <p className="text-sm text-yellow-300">Remember to save your character to a PNG file</p>
                  </div>
                </div>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save Now
                </button>
              </div>
            </div>
          )}
          
          <div className="space-y-6">
            {/* Name Field */}            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                className={`w-full bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} rounded-lg px-3 py-2`}
                placeholder="Character name"
                value={characterData?.data?.name || ''}
                onChange={(e) => handleFieldChange('name', e.target.value)}
              />
            </div>

            {/* Description Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <RichTextEditor
                className={`bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} font-light tracking-wide rounded-lg h-64`} // Apply styles to container
                placeholder="Character description (supports Markdown)"
                content={getFieldValue('description')}
                onChange={(html) => handleFieldChange('description', html)}
                preserveWhitespace={true} // Preserve newlines/whitespace
              />
            </div>

            {/* Scenario Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Scenario</label>
              <RichTextEditor
                className={`w-full bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} font-light tracking-wide rounded-lg h-32`}
                placeholder="Current situation or context (supports Markdown)"
                content={getFieldValue('scenario')}
                onChange={(html) => handleFieldChange('scenario', html)}
                preserveWhitespace={true} // Preserve newlines/whitespace
              />
            </div>

            {/* Personality Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Personality</label>
              <RichTextEditor
                className={`w-full bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} font-light tracking-wide rounded-lg h-32`} // Apply styles, manage height
                placeholder="Key personality traits (supports Markdown)"
                content={getFieldValue('personality')}
                onChange={(html) => handleFieldChange('personality', html)}
                preserveWhitespace={true}
              />
            </div>

            {/* Example Dialogue Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Example Dialogue</label>
              <RichTextEditor
                className={`w-full bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} font-light tracking-wide rounded-lg h-64`} // Apply styles, manage height
                placeholder="Examples of character dialogue and interactions (supports Markdown)"
                content={getFieldValue('mes_example')}
                onChange={(html) => handleFieldChange('mes_example', html)}
                preserveWhitespace={true} // Crucial for dialogue formatting
              />
            </div>

            {/* System Prompt Field */}
            <div>
              <label className="block text-sm font-medium mb-2">System Prompt</label>
              <div className="relative w-full">
                <RichTextEditor
                  className={`w-full h-64 bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} font-light tracking-wide rounded-lg text-base leading-relaxed`} // Apply styles, manage height
                  placeholder="AI instructions (supports Markdown)"
                  content={getFieldValue('system_prompt')}
                  onChange={(html) => handleFieldChange('system_prompt', html)}
                  preserveWhitespace={true} // Important for prompt structure
                />
              </div>
            </div>

            {/* Tags Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Tags</label>
              <input
                type="text"
                className={`w-full bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} rounded-lg px-3 py-2`}
                placeholder="Character tags (comma-separated)"
                value={characterData?.data?.tags?.join(', ') || ''}
                onChange={(e) => handleFieldChange('tags', e.target.value.split(',').map(tag => tag.trim()))}
              />
            </div>

            <div className="h-8" /> {/* Bottom spacing */}

            {/* Render the MessagesView component for greeting management */}
            <MessagesView />
          </div>
        </div>
      </div>

      {/* Find and Replace Dialog */}
      <FindReplaceDialog
        isOpen={showFindReplace}
        onClose={() => setShowFindReplace(false)}
        characterData={characterData}
        onReplace={setCharacterData}
      />      {/* JSON Modal Dialog */}
      {showJsonModal && (
        <Dialog
          isOpen={showJsonModal}
          onClose={() => setShowJsonModal(false)}
          title="JSON View"
          showCloseButton={true}
          className="max-w-4xl w-2/3" // Added width control here
        >
          <div className="w-full h-[70vh]">
            <JsonViewerModal 
              characterData={characterData} 
              setCharacterData={setCharacterData} 
            />
          </div>
        </Dialog>
      )}

      {/* Unsaved Changes Modal */}
      {showUnsavedModal && (
        <Dialog
          isOpen={showUnsavedModal}
          onClose={handleCancelNavigation}
          title="Unsaved Changes"
          showCloseButton={false}
          className="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
              <div>
                <p className="text-white">You have unsaved changes that will be lost.</p>
                <p className="text-gray-400 text-sm">Would you like to save before continuing?</p>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelNavigation}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDiscardChanges}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Discard Changes
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
};

export default CharacterInfoView;