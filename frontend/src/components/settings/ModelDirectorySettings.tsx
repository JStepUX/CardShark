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
  // Initialize with the directory prop value or empty string if null
  const [modelsDirectory, setModelsDirectory] = useState<string>(directory || '');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Update local state when the directory prop changes
  useEffect(() => {
    console.log("ModelDirectorySettings received directory:", directory);
    // Only update if we have a non-null, non-undefined value
    if (directory !== null && directory !== undefined) {
      setModelsDirectory(directory);
    }
  }, [directory]);

  const saveModelsDirectory = async () => {
    if (!modelsDirectory.trim()) {
      setErrorMessage('Please enter a directory path');
      return;
    }

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
          onChange={(e) => {
            setModelsDirectory(e.target.value);
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          placeholder="Path to AI models directory"
          className="flex-grow px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500"
          disabled={isLoading}
        />
        <button 
          onClick={saveModelsDirectory} 
          disabled={isLoading || !modelsDirectory.trim()}
          className="px-4 py-2 bg-purple-800 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <FolderOpen size={18} />
          )}
          <span>Set</span>
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