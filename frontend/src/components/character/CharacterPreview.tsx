import React from 'react';

interface CharacterData {
  data?: {
    name?: string;
    description?: string;
    personality?: string;
    scenario?: string;
  };
}

interface CharacterPreviewProps {
  data: CharacterData | null;
  imageFile?: File | null;
}

const CharacterPreview: React.FC<CharacterPreviewProps> = ({ data, imageFile }) => {
  if (!data || !data.data) {
    return null;
  }

  const { name, description, personality, scenario } = data.data;

  return (
    <div className="mt-6 p-4 bg-white rounded-lg shadow">
      <h2 className="heading-primary mb-4">Character Preview</h2>
      
      {imageFile && (
        <div className="mb-4">
          <h3 className="font-semibold text-gray-700">Image</h3>
          <img 
            src={URL.createObjectURL(imageFile)} 
            alt="Character"
            className="max-w-xs max-h-48 object-cover rounded-lg border"
          />
        </div>
      )}
      
      {name && (
        <div className="mb-4">
          <h3 className="font-semibold text-gray-700">Name</h3>
          <p className="text-gray-600">{name}</p>
        </div>
      )}

      {description && (
        <div className="mb-4">
          <h3 className="font-semibold text-gray-700">Description</h3>
          <p className="text-gray-600">{description}</p>
        </div>
      )}

      {personality && (
        <div className="mb-4">
          <h3 className="font-semibold text-gray-700">Personality</h3>
          <p className="text-gray-600">{personality}</p>
        </div>
      )}

      {scenario && (
        <div className="mb-4">
          <h3 className="font-semibold text-gray-700">Scenario</h3>
          <p className="text-gray-600">{scenario}</p>
        </div>
      )}
    </div>
  );
};

export default CharacterPreview;