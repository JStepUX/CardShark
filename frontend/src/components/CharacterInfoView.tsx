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

  // Download handler function
  async function handleDownloadImages() {
    if (!characterData?.data?.imported_images?.length) return;

    try {
      for (const url of characterData.data.imported_images) {
        if (!url.trim()) continue;
        
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          
          const blob = await response.blob();
          const filename = url.split('/').pop() || 'image.png';
          
          // Create temporary download link
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(a.href);
          
        } catch (err) {
          console.error(`Failed to download image: ${url}`, err);
        }
      }
      
      alert('Images downloaded successfully!');
    } catch (err) {
      alert('Failed to download images. Please try again.');
    }
  }

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
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
                placeholder="Character name"
                value={getFieldValue('name')}
                onChange={(e) => handleFieldChange('name', e.target.value)}
              />
            </div>

            {/* Description Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <HighlightedTextArea
                className="bg-slate-800 border border-slate-700 font-light tracking-wide rounded-lg h-64"
                placeholder="Character description"
                value={getFieldValue('description')}
                onChange={(value) => handleFieldChange('description', value)}
              />
            </div>

            {/* Scenario Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Scenario</label>
              <HighlightedTextArea
                className="w-full bg-slate-800 border border-slate-700 font-light tracking-wide rounded-lg px-3 py-2 h-32 resize-y"
                placeholder="Current situation or context"
                value={getFieldValue('scenario')}
                onChange={(value) => handleFieldChange('scenario', value)}
              />
            </div>

            {/* Personality Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Personality</label>
              <HighlightedTextArea
                className="w-full bg-slate-800 border border-slate-700 font-light tracking-wide rounded-lg px-3 py-2 h-32 resize-y"
                placeholder="Key personality traits"
                value={getFieldValue('personality')}
                onChange={(value) => handleFieldChange('personality', value)}
              />
            </div>

            {/* Example Dialogue Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Example Dialogue</label>
              <HighlightedTextArea
                className="w-full bg-slate-800 border font-light tracking-wide border-slate-700 rounded-lg px-3 py-2 h-64 resize-y overflow-auto"
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
                  className="w-full h-64 bg-slate-800 border border-slate-700 font-light tracking-wide rounded-lg px-3 py-2 resize-y overflow-auto text-base leading-relaxed"
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
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
                placeholder="Character tags (comma-separated)"
                value={characterData?.data?.tags?.join(', ') || ''}
                onChange={(e) => handleFieldChange('tags', e.target.value.split(',').map(tag => tag.trim()))}
              />
            </div>

            {/* Imported Images Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Imported Images</label>
              <textarea
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 h-32 resize-none"
                value={characterData?.data?.imported_images?.join('\n') || ''}
                onChange={(e) => handleFieldChange('imported_images', e.target.value.split('\n').map(url => url.trim()))}
                placeholder="One image URL per line"
              />
              {characterData?.data?.imported_images?.length > 0 && (
                <button
                  onClick={handleDownloadImages}
                  className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Imported Images
                </button>
              )}
            </div>

            <div className="h-8" /> {/* Bottom spacing */}
          </div>
        </div>
      </div>
    </>
  );
};

export default CharacterInfoView;