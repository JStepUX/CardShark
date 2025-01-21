import React, { useState, useEffect } from 'react';
import { Dialog } from './Dialog';
import DirectoryPicker from './DirectoryPicker';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose,
  onSettingsChange 
}) => {
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [saveToDirectory, setSaveToDirectory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings when modal opens
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) throw new Error('Failed to load settings');
        
        const data = await response.json();
        if (data.success && data.settings) {
          setCurrentDirectory(data.settings.character_directory || null);
          setSaveToDirectory(data.settings.save_to_character_directory || false);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_directory: currentDirectory,
          save_to_character_directory: saveToDirectory
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to save settings');
      }

      onSettingsChange?.();
      onClose();
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      showCloseButton={false}
      buttons={[
        {
            label: 'Cancel',
            onClick: onClose,
        },

        {
          label: isSaving ? 'Saving...' : 'Save',
          onClick: handleSaveSettings,
          variant: 'primary'
        }
      ]}
    >
      <div className="w-full max-w-2xl space-y-6 p-2">
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-300">
            Character Directory
          </h3>
          <div className="w-full">
            <DirectoryPicker
              currentDirectory={currentDirectory}
              onDirectoryChange={setCurrentDirectory}
            />
          </div>
          {currentDirectory && (
            <div className="space-y-2">
              <p className="text-sm text-gray-400 break-all">
                Current: {currentDirectory}
              </p>
              <label className="flex items-center gap-2 pt-8">
                <input
                  type="checkbox"
                  checked={saveToDirectory}
                  onChange={(e) => setSaveToDirectory(e.target.checked)}
                  disabled={!currentDirectory}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <span className="text-sm text-gray-300">
                  Save PNGs here (Default is Downloads)
                </span>
              </label>
            </div>
          )}
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>
      </div>
    </Dialog>
  );
};

export default SettingsModal;