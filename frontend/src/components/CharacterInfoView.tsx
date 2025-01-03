import React from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import HighlightedTextArea from './HighlightedTextArea';

// Type definitions matching our consolidated JSON structure
interface CharacterData {
  spec: string;
  spec_version: string;
  data: {
    name?: string;
    description?: string;
    personality?: string;
    scenario?: string;
    mes_example?: string;
    system_prompt?: string;
    post_history_instructions?: string;
    tags?: string[];
    imported_images?: string[];
    [key: string]: any; // Allow other fields from V2 spec
  };
}

const CharacterInfoView: React.FC = () => {
  const { characterData, setCharacterData } = useCharacter();

  const handleFieldChange = (field: keyof CharacterData['data'], value: string | string[]): void => {
    if (!characterData) return;

    try {
      // Create new data object ensuring V2 structure
      const newData = {
        ...characterData,
        data: {
          ...characterData.data,
          [field]: value
        }
      };

      // Validate spec requirements
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
  const getFieldValue = (field: keyof CharacterData['data']): string => {
    return characterData?.data?.[field]?.toString() || '';
  };

  return (
    <>
      <div className="p-8 pb-4">
        <h2 className="text-lg font-semibold">Primary Character Info</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 pb-8">
          <div className="space-y-6">
            {/* Name Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2"
                placeholder="Character name"
                value={getFieldValue('name')}
                onChange={(e) => handleFieldChange('name', e.target.value)}
              />
            </div>

            {/* Description Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <HighlightedTextArea
                className="bg-stone-950 border border-slate-700 rounded-lg h-64"
                placeholder="Character description"
                value={getFieldValue('description')}
                onChange={(value) => handleFieldChange('description', value)}
              />
            </div>

            {/* Scenario Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Scenario</label>
              <HighlightedTextArea
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 h-32 resize-y"
                placeholder="Current situation or context"
                value={getFieldValue('scenario')}
                onChange={(value) => handleFieldChange('scenario', value)}
              />
            </div>

            {/* Personality Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Personality</label>
              <HighlightedTextArea
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 h-32 resize-y"
                placeholder="Key personality traits"
                value={getFieldValue('personality')}
                onChange={(value) => handleFieldChange('personality', value)}
              />
            </div>

            {/* Example Dialogue Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Example Dialogue</label>
              <HighlightedTextArea
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 h-64 resize-y overflow-auto"
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
                  className="w-full h-64 bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 resize-y overflow-auto font-mono text-base leading-relaxed"
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
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2"
                placeholder="Character tags (comma-separated)"
                value={characterData?.data?.tags?.join(', ') || ''}
                onChange={(e) => handleFieldChange('tags', e.target.value.split(',').map(tag => tag.trim()))}
              />
            </div>

            {/* Imported Images Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Imported Images</label>
              <textarea
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 h-32 resize-none"
                value={characterData?.data?.imported_images?.join('\n') || ''}
                onChange={(e) => handleFieldChange('imported_images', e.target.value.split('\n').map(url => url.trim()))}
                placeholder="One image URL per line"
              />
            </div>

            <div className="h-8" /> {/* Bottom spacing */}
          </div>
        </div>
      </div>
    </>
  );
};

export default CharacterInfoView;