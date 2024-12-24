import React from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import HighlightedTextArea from './HighlightedTextArea';

const CharacterInfoView: React.FC = () => {
  const { characterData, setCharacterData } = useCharacter();
  const localData = characterData; // We can use characterData directly now

  const handleFieldChange = (field: string, value: string | string[]): void => {
    if (!characterData) return;

    const newData = {
      ...characterData,
      data: {
        ...characterData.data,
        [field]: value
      }
    };
    setCharacterData(newData);
  };

  return (
    <>
      <div className="p-8 pb-4">
        <h2 className="text-lg font-semibold">Primary Character Info</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 pb-8">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2"
                placeholder="Character name"
                value={localData?.data?.name || ''}
                onChange={(e) => handleFieldChange('name', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <HighlightedTextArea
                className="bg-stone-950 border border-slate-700 rounded-lg h-64"
                placeholder="Character description"
                value={localData?.data?.description || ''}
                onChange={(value) => handleFieldChange('description', value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Scenario</label>
              <HighlightedTextArea
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 h-32 resize-y"
                placeholder="Current situation or context"
                value={localData?.data?.scenario || ''}
                onChange={(value) => handleFieldChange('scenario', value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Personality</label>
              <HighlightedTextArea
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 h-32 resize-none"
                placeholder="Key personality traits"
                value={localData?.data?.personality || ''}
                onChange={(value) => handleFieldChange('personality', value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Example Dialogue</label>
              <HighlightedTextArea
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 h-64 resize-y overflow-auto"
                placeholder="Examples of character dialogue and interactions"
                value={localData?.data?.mes_example || ''}
                onChange={(value) => handleFieldChange('mes_example', value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">System Prompt</label>
              <div className="relative w-full">
                <HighlightedTextArea
                  className="w-full h-64 bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 resize-y overflow-auto font-mono text-base leading-relaxed"
                  placeholder="AI instructions"
                  value={localData?.data?.system_prompt || ''}
                  onChange={(value) => handleFieldChange('system_prompt', value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Tags</label>
              <input
                type="text"
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2"
                placeholder="Character tags"
                value={localData?.data?.tags?.join(', ') || ''}
                onChange={(e) => handleFieldChange('tags', e.target.value.split(',').map(tag => tag.trim()))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Imported Images</label>
              <textarea
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 h-32 resize-none"
                value={localData?.data?.imported_images?.join('\n') || ''}
                onChange={(e) => handleFieldChange('imported_images', e.target.value.split('\n').map(url => url.trim()))}
              />
            </div>
            <div className="h-8" />
          </div>
        </div>
      </div>
    </>
  );
};

export default CharacterInfoView;