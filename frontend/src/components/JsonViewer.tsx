import { useCharacter } from '../contexts/CharacterContext';

// Color scheme matching our dark theme
const syntaxColors = {
  key: '#89CFF0',      // Light blue for keys
  string: '#90EE90',   // Light green for strings  
  number: '#FFB6C1',   // Light pink for numbers
  boolean: '#FFA07A',  // Light salmon for booleans
  null: '#D3D3D3',     // Light gray for null
  bracket: '#DDA0DD'   // Plum for brackets/braces
};

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
        className="w-full h-[calc(100vh-8rem)] bg-gray-900 text-white font-mono 
                   text-sm rounded-lg p-4 overflow-auto"
      >
        {characterData ? formatJSON(characterData) : 'No character data loaded'}
      </pre>
    </div>
  );
};

export default JsonViewer;