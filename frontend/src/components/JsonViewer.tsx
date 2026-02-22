import React, { useState, useEffect } from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import Button from './common/Button';

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
                  bg-stone-900 text-white font-mono text-sm
                  rounded-lg p-4 overflow-auto
                  whitespace-pre-wrap break-words resize-none"
        value={editableJson}
        onChange={handleChange}
      />
      <Button
        variant="primary"
        onClick={handleSave}
        className="mt-4"
      >
        Save Changes
      </Button>
    </div>
  );
};

export default JsonViewer;