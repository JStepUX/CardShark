import React, { useState, useEffect } from 'react';
import { FolderOpen } from 'lucide-react';

interface ModelDirectorySettingsProps {
  directory: string | null;
  onDirectoryChange: (directory: string) => void;
}

const ModelDirectorySettings: React.FC<ModelDirectorySettingsProps> = ({
  directory,
  onDirectoryChange
}) => {
  const [modelsDirectory, setModelsDirectory] = useState(directory || '');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setModelsDirectory(directory || '');
  }, [directory]);

  const saveModelsDirectory = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      
      const response = await fetch('/api/koboldcpp/models-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ directory: modelsDirectory }),
      });

      if (!response.ok) {
        throw new Error('Failed to save models directory');
      }

      onDirectoryChange(modelsDirectory);
      setSuccessMessage('Models directory saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setErrorMessage(`Error saving directory: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-md font-medium mb-2">Models Directory</h3>
      <div className="flex space-x-2">
        <input
          type="text"
          value={modelsDirectory}
          onChange={(e) => setModelsDirectory(e.target.value)}
          placeholder="Path to AI models directory"
          className="flex-grow px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
          disabled={isLoading}
        />
        <button 
          onClick={saveModelsDirectory} 
          disabled={isLoading || !modelsDirectory}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Saving...</span>
            </>
          ) : (
            <>
              <FolderOpen className="h-4 w-4" />
              <span>Save</span>
            </>
          )}
        </button>
      </div>

      {successMessage && (
        <div className="text-sm text-green-500 bg-green-950/50 p-2 rounded">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="text-sm text-red-500 bg-red-950/50 p-2 rounded">
          {errorMessage}
        </div>
      )}
      
      <p className="text-sm text-gray-400">
        This directory will be scanned for AI models when configuring APIs.
      </p>
    </div>
  );
};

export default ModelDirectorySettings;