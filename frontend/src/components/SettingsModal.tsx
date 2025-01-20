import React, { useState, useEffect } from 'react';
import { Dialog } from './Dialog';
import DirectoryPicker from './DirectoryPicker';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: () => void;  // Add callback prop
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose,
  onSettingsChange 
}) => {
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings when modal opens
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) throw new Error('Failed to load settings');
        
        const data = await response.json();
        if (data.success && data.settings.character_directory) {
          setCurrentDirectory(data.settings.character_directory);
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
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to save settings');
      }

      onSettingsChange?.();  // Notify parent of settings change
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
      buttons={[
        {
          label: isSaving ? 'Saving...' : 'Save',
          onClick: handleSaveSettings,
          variant: 'primary'
        },
        {
          label: 'Cancel',
          onClick: onClose,
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
            <div className="mt-2">
              <p className="text-sm text-gray-400 break-all">
                Current: {currentDirectory}
              </p>
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