import React, { useState, useEffect } from 'react';
import { Dialog } from './Dialog';
import DirectoryPicker from './DirectoryPicker';
import APISettings from './APISettings';
import { APISettings as APISettingsType, DEFAULT_API_SETTINGS } from '../types/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: () => void;
}

type TabType = 'directory' | 'api';

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose,
  onSettingsChange 
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('directory');
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [saveToDirectory, setSaveToDirectory] = useState(false);
  const [apiSettings, setApiSettings] = useState<APISettingsType>(DEFAULT_API_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings when modal opens
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) throw new Error('Failed to load settings');
        
        const data = await response.json();
        if (data.success) {
          if (data.settings.character_directory) {
            setCurrentDirectory(data.settings.character_directory);
            setSaveToDirectory(data.settings.save_to_character_directory ?? false);
          }
          if (data.settings.api) {
            setApiSettings(data.settings.api);
          }
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const handleApiSettingsUpdate = (updates: Partial<APISettingsType>) => {
    setApiSettings(prev => ({ ...prev, ...updates }));
  };

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
          save_to_character_directory: saveToDirectory,
          api: apiSettings
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

  const TabContent = () => {
    switch (activeTab) {
      case 'directory':
        return (
          <div className="space-y-4">
            <DirectoryPicker
              currentDirectory={currentDirectory}
              onDirectoryChange={setCurrentDirectory}
            />
            
            {currentDirectory && (
              <>
                <div className="mt-2">
                  <p className="text-sm text-gray-400 break-all">
                    Current: {currentDirectory}
                  </p>
                </div>

                <div className="mt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveToDirectory}
                      onChange={(e) => setSaveToDirectory(e.target.checked)}
                      className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-300">
                      Save characters to this directory
                    </span>
                  </label>
                </div>
              </>
            )}
          </div>
        );
      case 'api':
        return (
          <APISettings
            settings={apiSettings}
            onUpdate={handleApiSettingsUpdate}
          />
        );
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      title="Settings"
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
      <div className="w-full max-w-2xl">
        {/* Tab Navigation */}
        <div className="flex border-b border-stone-700 mb-4">
          <button
            onClick={() => setActiveTab('directory')}
            className={`px-4 py-2 -mb-px font-medium text-sm ${
              activeTab === 'directory'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Character Directory
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`px-4 py-2 -mb-px font-medium text-sm ${
              activeTab === 'api'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            API
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-2">
          <TabContent />
          
          {error && (
            <p className="text-sm text-red-500 mt-4">{error}</p>
          )}
        </div>
      </div>
    </Dialog>
  );
};

export default SettingsModal;