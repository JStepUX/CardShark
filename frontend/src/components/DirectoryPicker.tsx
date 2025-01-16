import React, { useState } from 'react';
import { FolderOpen } from 'lucide-react';

interface DirectoryPickerProps {
  currentDirectory: string | null;
  onDirectoryChange: (directory: string) => void;
}

const DirectoryPicker: React.FC<DirectoryPickerProps> = ({ 
  currentDirectory,
  onDirectoryChange 
}) => {
  const [inputValue, setInputValue] = useState(currentDirectory || '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      // Validate directory exists via API
      const response = await fetch('/api/validate-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ directory: inputValue })
      });

      const data = await response.json();

      if (data.success) {
        setError(null);
        // Save to settings first
        const settingsResponse = await fetch('/api/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            key: 'character_directory',
            value: inputValue
          })
        });

        if (!settingsResponse.ok) {
          setError('Failed to save directory to settings');
          return;
        }

        onDirectoryChange(inputValue);
      } else {
        setError(data.message || 'Invalid directory');
      }
    } catch (err) {
      setError('Failed to validate directory');
    }
  };

  return (
    <div className="space-y-2 w-[600px]">
      <div className="flex gap-2">
        <div className="flex-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ex: C:\Users\username\Documents\characters"
            className="w-full px-3 py-2 bg-stone-950 border border-slate-700 
                     rounded-lg focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={handleSubmit}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 
                   text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <FolderOpen size={18} />
          Set Directory
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  );
};

export default DirectoryPicker;