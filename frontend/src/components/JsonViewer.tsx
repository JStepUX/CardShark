import { useCharacter } from '../contexts/CharacterContext';

const JsonViewer = () => {
  const { characterData } = useCharacter();

  // Format and syntax highlight the JSON
  const formatJSON = (data: any): string => {
    try {
      return JSON.stringify(data, null, 2);
    } catch (error) {
      return 'Invalid JSON data';
    }
  };

  return (
    <div className="h-full w-full p-8">
      <h2 className="text-lg font-semibold mb-4">JSON View</h2>
      <pre 
        className="w-full h-[calc(100vh-8rem)]
                  bg-gray-900 text-white font-mono text-sm
                  rounded-lg p-4 overflow-auto
                  whitespace-pre-wrap break-words"
      >
        {characterData ? formatJSON(characterData) : 'No character data loaded'}
      </pre>
    </div>
  );
};

export default JsonViewer;