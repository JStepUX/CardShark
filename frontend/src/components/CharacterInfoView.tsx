import React, { useState } from 'react';
import { Search, FileJson } from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';
import { CharacterCard } from '../types/schema';
import HighlightedTextArea from './HighlightedTextArea';
import { FindReplaceDialog } from './FindReplaceDialog';
import { Dialog } from './Dialog';

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

const CharacterInfoView: React.FC = () => {
  const { characterData, setCharacterData } = useCharacter();
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false); // New state for JSON modal

  const handleFieldChange = (field: keyof CharacterCard['data'], value: string | string[]): void => {
    try {
      if (!characterData?.data) {
        console.error("Character data is missing.");
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

  return (
    <>
      <div className="p-8 pb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold">Primary Character Info</h2>
        <div className="flex items-center gap-3">
          {/* JSON Viewer Button */}
          <button
            onClick={() => setShowFindReplace(true)}
            className="flex items-center gap-2 px-4 py-2 bg-transparent hover:bg-stone-800 text-white rounded-lg transition-colors"
          >
            <Search className="w-4 h-4" />
            Find & Replace
          </button>
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
          <div className="space-y-6">
            {/* Name Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2"
                placeholder="Character name"
                value={getFieldValue('name')}
                onChange={(e) => handleFieldChange('name', e.target.value)}
              />
            </div>

            {/* Description Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <HighlightedTextArea
                className="bg-stone-800 border border-stone-700 font-light tracking-wide rounded-lg h-64"
                placeholder="Character description"
                value={getFieldValue('description')}
                onChange={(value) => handleFieldChange('description', value)}
              />
            </div>

            {/* Scenario Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Scenario</label>
              <HighlightedTextArea
                className="w-full bg-stone-800 border border-stone-700 font-light tracking-wide rounded-lg px-3 py-2 h-32 resize-y"
                placeholder="Current situation or context"
                value={getFieldValue('scenario')}
                onChange={(value) => handleFieldChange('scenario', value)}
              />
            </div>

            {/* Personality Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Personality</label>
              <HighlightedTextArea
                className="w-full bg-stone-800 border border-stone-700 font-light tracking-wide rounded-lg px-3 py-2 h-32 resize-y"
                placeholder="Key personality traits"
                value={getFieldValue('personality')}
                onChange={(value) => handleFieldChange('personality', value)}
              />
            </div>

            {/* Example Dialogue Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Example Dialogue</label>
              <HighlightedTextArea
                className="w-full bg-stone-800 border font-light tracking-wide border-stone-700 rounded-lg px-3 py-2 h-64 resize-y overflow-auto"
                placeholder="Examples of character dialogue and interactions"
                value={getFieldValue('mes_example')}
                onChange={(value) => handleFieldChange('mes_example', value)}
              />
            </div>

            {/* System Prompt Field */}
            <div>
              <label className="block text-sm font-medium mb-2">System Prompt</label>
              <div className="relative w-full">
                <HighlightedTextArea
                  className="w-full h-64 bg-stone-800 border border-stone-700 font-light tracking-wide rounded-lg px-3 py-2 resize-y overflow-auto text-base leading-relaxed"
                  placeholder="AI instructions"
                  value={getFieldValue('system_prompt')}
                  onChange={(value) => handleFieldChange('system_prompt', value)}
                />
              </div>
            </div>

            {/* Tags Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Tags</label>
              <input
                type="text"
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2"
                placeholder="Character tags (comma-separated)"
                value={characterData?.data?.tags?.join(', ') || ''}
                onChange={(e) => handleFieldChange('tags', e.target.value.split(',').map(tag => tag.trim()))}
              />
            </div>

            <div className="h-8" /> {/* Bottom spacing */}
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