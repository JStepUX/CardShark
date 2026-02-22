import React, { useState, useEffect } from 'react';
import { FolderOpen } from 'lucide-react';
import Button from '../common/Button';

interface ModelDirectorySettingsProps {
  directory: string | null;
  onDirectoryChange: (directory: string) => Promise<void>; // Expect a promise
}

const ModelDirectorySettings: React.FC<ModelDirectorySettingsProps> = ({
  directory,
  onDirectoryChange
}) => {
  const [modelsDirectory, setModelsDirectory] = useState<string>(directory || '');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  useEffect(() => {
    console.log(`[ModelDirectorySettings] Received prop 'directory':`, directory); // Diagnostic log
    // Update local state whenever the directory prop changes,
    // including to an empty string if that's what the prop becomes.
    // Default to empty string if directory is null/undefined.
    setModelsDirectory(directory || '');
  }, [directory]);

  const handleSetDirectory = async () => { // Make async
    if (!modelsDirectory.trim()) {
      setErrorMessage('Please enter a directory path');
      setSuccessMessage(null);
      return;
    }
    
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    
    try {
      await onDirectoryChange(modelsDirectory); // Await the async operation
      setSuccessMessage('Models directory saved successfully.');
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
        <Button
          variant="primary"
          size="md"
          icon={isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <FolderOpen size={18} />
          )}
          onClick={handleSetDirectory}
          disabled={isLoading || !modelsDirectory.trim()}
          className="!bg-purple-800 hover:!bg-purple-700"
        >
          Set
        </Button>
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