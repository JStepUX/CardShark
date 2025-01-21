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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) {
      setError('Please enter a directory path');
      return;
    }

    try {
      // Validate directory exists and contains PNGs
      const response = await fetch('/api/validate-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ directory: inputValue.trim() })
      });

      const data = await response.json();
      
      if (data.success) {
        setError(null);
        onDirectoryChange(inputValue.trim());
      } else {
        setError(data.message || 'Invalid directory');
      }
    } catch (err) {
      console.error('Directory validation error:', err);
      setError('Failed to validate directory');
    }
  };

  return (
    <div className="w-full space-y-2">
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError(null);
          }}
          className="w-full px-3 py-2 bg-stone-950 border border-slate-700 
                   rounded-lg focus:ring-1 focus:ring-blue-500"
          placeholder="Enter full directory path"
        />
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 px-4 py-2 
                   bg-purple-800 text-white rounded-lg hover:bg-blue-700 
                   transition-colors"
        >
          <FolderOpen size={18} />
          Set Directory
        </button>
      </form>
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  );
};

export default DirectoryPicker;