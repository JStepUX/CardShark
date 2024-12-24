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
              <textarea
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 h-64 resize-y"
                placeholder="Detailed character description"
                value={localData?.data?.description || ''}
                onChange={(e) => handleFieldChange('description', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Scenario</label>
              <textarea
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 h-32 resize-y"
                placeholder="Current situation or context"
                value={localData?.data?.scenario || ''}
                onChange={(e) => handleFieldChange('scenario', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Personality</label>
              <textarea
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 h-32 resize-none"
                placeholder="Key personality traits"
                value={localData?.data?.personality || ''}
                onChange={(e) => handleFieldChange('personality', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Example Dialogue</label>
              <textarea
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 h-64 resize-y overflow-auto"
                placeholder="Examples of character dialogue and interactions"
                value={localData?.data?.mes_example || ''}
                onChange={(e) => handleFieldChange('mes_example', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">System Prompt</label>
              <HighlightedTextArea
                className="w-full bg-stone-950 border border-slate-700 rounded-lg px-3 py-2 h-64 resize-y overflow-auto"
                placeholder="AI instructions"
                value={localData?.data?.system_prompt || ''}
                onChange={(value) => handleFieldChange('system_prompt', value)}
                style={{ position: 'relative' }}
              />
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