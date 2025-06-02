import React, { useState, useEffect } from 'react';
import { FolderOpen } from 'lucide-react';

interface DirectoryPickerProps {
  currentDirectory: string | null;
  onDirectoryChange: (directory: string) => void;
}

const DirectoryPicker: React.FC<DirectoryPickerProps> = ({ 
  currentDirectory,
  onDirectoryChange 
}) => {
  // Initialize with the currentDirectory prop value or empty string if null
  const [inputValue, setInputValue] = useState<string>(currentDirectory || '');
  const [error, setError] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Update input when currentDirectory changes from parent component
  useEffect(() => {
    console.log("DirectoryPicker received currentDirectory:", currentDirectory);
    // Only update if we have a non-null, non-undefined value
    if (currentDirectory !== null && currentDirectory !== undefined) {
      setInputValue(currentDirectory);
    }
  }, [currentDirectory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) {
      setError('Please enter a directory path');
      return;
    }

    try {
      // Show loading state
      setIsLoading(true);
      
      // Validate directory exists and contains PNGs
      const response = await fetch('/api/validate-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ directory: inputValue.trim() })
      });      const result = await response.json();
      
      // Handle standardized response format: {success: true, data: {exists: true, path: "..."}}
      // or legacy direct format: {exists: true, message: "..."}
      const data = result.success ? result.data : result;
      
      if (data.exists) {
        setError(null);
        setValidationMessage(data.message || 'Directory validated successfully');
        // Call the parent's change handler to update settings
        onDirectoryChange(inputValue.trim());
      } else {
        setError(data.message || 'Invalid directory');
        setValidationMessage(null);
      }
    } catch (err) {
      console.error('Directory validation error:', err);
      setError('Failed to validate directory');
      setValidationMessage(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full space-y-2">
      <form onSubmit={handleSubmit} className="flex space-x-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError(null);
            setValidationMessage(null);
          }}
          className="flex-grow px-3 py-2 bg-stone-950 border border-slate-700 
                   rounded-lg focus:ring-1 focus:ring-blue-500"
          placeholder="Enter full directory path"
        />
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          className="px-4 py-2 bg-purple-800 text-white rounded-lg hover:bg-purple-700 
                   transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <FolderOpen size={18} />
          )}
          <span>Set</span>
        </button>
      </form>
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
      {validationMessage && (
        <p className="text-sm text-green-500">{validationMessage}</p>
      )}
    </div>
  );
};

export default DirectoryPicker;