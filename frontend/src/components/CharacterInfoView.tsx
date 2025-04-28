import React, { useState } from 'react';
import { Search, FileJson, SplitSquareVertical } from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';
import { useComparison } from '../contexts/ComparisonContext';
import { CharacterCard } from '../types/schema';
import RichTextEditor from './RichTextEditor';
import { FindReplaceDialog } from './FindReplaceDialog';
import { Dialog } from './Dialog';
import MessagesView from './MessagesView';

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

const CharacterInfoView: React.FC<CharacterInfoViewProps> = ({ isSecondary = false }) => {
  // Use the appropriate context based on the mode
  const primaryContext = useCharacter();
  const { isCompareMode, setCompareMode, secondaryCharacterData, setSecondaryCharacterData } = useComparison();
  
  // Determine which data to use based on isSecondary prop
  const { characterData, setCharacterData } = isSecondary 
    ? { characterData: secondaryCharacterData, setCharacterData: setSecondaryCharacterData }
    : primaryContext;
    
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);

  // State for managing name input when creating a new character
  const [nameInput, setNameInput] = useState('');
  
  // Create a stateful flag to track if we're creating a new character
  const [isCreatingNewCharacter, setIsCreatingNewCharacter] = useState(false);

  const handleFieldChange = (field: keyof CharacterCard['data'], value: string | string[]): void => {
    try {
      // Special handling for the name field when there's no character data yet
      if (field === 'name' && !characterData?.data) {
        // Just update local state without creating character
        setNameInput(value as string);
        setIsCreatingNewCharacter(true);
        return;
      } else if (field === 'name' && isCreatingNewCharacter) {
        // We already have a character in progress, just update name
        setNameInput(value as string);
      }
      
      // For other fields or when character data exists
      if (!characterData?.data) {
        console.error("Cannot update field when no character is selected");
        return;
      }

      // Create new data object preserving all existing properties
      const newData: CharacterCard = {
        ...characterData,
        data: {
          ...characterData.data,
          [field]: value
        }
      };

      if (newData.spec !== "chara_card_v2" || !newData.spec_version) {
        console.error("Invalid character data structure");
        return;
      }

      setCharacterData(newData);
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
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
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-8 pb-8">
          {/* Show Create Character button when there's a name but no character data */}
          {isCreatingNewCharacter && nameInput && !characterData && (
            <div className="mb-6 p-4 bg-stone-800 border border-stone-600 rounded-lg">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-md font-medium">New Character: {nameInput}</h3>
                  <p className="text-sm text-gray-400">Click Create to initialize this character</p>
                </div>
                <button
                  onClick={() => {
                    if (primaryContext.createNewCharacter) {
                      primaryContext.createNewCharacter(nameInput);
                      setIsCreatingNewCharacter(false);
                      setNameInput('');
                    }
                  }}
                  className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors"
                >
                  Create Character
                </button>
              </div>
            </div>
          )}
          
          <div className="space-y-6">
            {/* Name Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                className={`w-full bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} rounded-lg px-3 py-2`}
                placeholder="Character name"
                value={characterData?.data?.name || nameInput}
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
      />

      {/* JSON Modal Dialog */}
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
    </>
  );
};

export default CharacterInfoView;