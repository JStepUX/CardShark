import React, { useState } from 'react';
import DirectoryPicker from './DirectoryPicker';
import { Settings } from '../types/settings';
import SettingsTabs, { TabId } from './SettingsTabs';
import APISettingsPanel from './APISettingsPanel';

interface ViewProps {
  settings: Settings;
  onUpdate: (updates: Partial<Settings>) => void;
}

const SettingsView: React.FC<ViewProps> = ({ settings, onUpdate }) => {
  const [currentTab, setCurrentTab] = useState<TabId>('general');

  const renderTabContent = () => {
    switch (currentTab) {
      case 'general':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-4">Character Directory</h2>
              <DirectoryPicker
                currentDirectory={settings.character_directory}
                onDirectoryChange={(directory) => onUpdate({ 
                  character_directory: directory,
                  save_to_character_directory: true 
                })}
              />
              
              {settings.character_directory && (
                <div className="mt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.save_to_character_directory}
                      onChange={(e) => onUpdate({ save_to_character_directory: e.target.checked })}
                      className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-300">
                      Save characters to this directory
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>
        );
        
      case 'api':
        return (
          <APISettingsPanel 
            settings={settings}
            onUpdate={onUpdate}
          />
        );
        
      case 'prompts':
        return (
          <div className="p-4">
            <h2 className="text-lg font-semibold">Prompt Templates</h2>
            <p className="text-gray-400">Prompt configuration coming soon...</p>
          </div>
        );
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-8 pb-0">
        <h2 className="text-2xl font-semibold mb-6">Settings</h2>
        <SettingsTabs
          currentTab={currentTab}
          onTabChange={setCurrentTab}
        />
      </div>
      
      <div className="flex-1 overflow-y-auto p-8">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default SettingsView;