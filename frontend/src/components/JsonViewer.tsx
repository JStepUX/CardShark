import React, { useState, useEffect } from 'react';
import { useCharacter } from '../contexts/CharacterContext';

const JsonViewer = () => {
  const { characterData, setCharacterData } = useCharacter();
  const [editableJson, setEditableJson] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
    <div className="h-full w-full p-8">
      <h2 className="text-lg font-semibold mb-4">JSON View</h2>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      <textarea
        className="w-full h-[calc(100vh-12rem)]
                  bg-gray-900 text-white font-mono text-sm
                  rounded-lg p-4 overflow-auto
                  whitespace-pre-wrap break-words resize-none"
        value={editableJson}
        onChange={handleChange}
      />
      <button
        className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        onClick={handleSave}
      >
        Save Changes
      </button>
    </div>
  );
};

export default JsonViewer;