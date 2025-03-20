// src/components/APISettingsView.tsx
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import DirectoryPicker from './DirectoryPicker';
import { APICard } from './APICard';
import { 
  APIProvider, 
  APIConfig, 
  createAPIConfig 
} from '../types/api';
import { Settings } from '../types/settings';
import { SettingsTabs, SettingsTab } from './SettingsTabs';
import TemplateManager from './TemplateManager';
import { TemplateProvider } from '../contexts/TemplateContext';
import { useAPIConfig } from '../contexts/APIConfigContext';
import PromptSettings from './PromptSettings'; // Add this import

interface APISettingsViewProps {
  settings: Settings; // Use the Settings type directly
  onUpdate: (update: Partial<Settings>) => void; // Match the type from Layout
}

export const APISettingsView: React.FC<APISettingsViewProps> = ({ settings, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'api' | 'templates' | 'prompts'>('general');
  const { setAPIConfig } = useAPIConfig();
  // Remove or use the isRefetching state
  const [isRefetching, setIsRefetching] = useState(false);

  const handleAPIUpdate = (id: string, updates: Partial<APIConfig>) => {
    // Disable update button while refetching
    if (isRefetching) {
      console.log("API update already in progress, please wait...");
      return;
    }
    
    onUpdate({ 
        apis: {
            ...settings.apis,
            [id]: { // No need for the 'as string' type assertion since id is already a string
                ...settings.apis[id],
                ...updates
            }
        }
    });

    const refetchSettingsAndUpdateContext = async () => {
        try {
            setIsRefetching(true);
            const response = await fetch("/api/settings"); // Re-fetch ALL settings
            if (!response.ok) throw new Error("Failed to load settings after update");
            const data = await response.json();
            if (data.success && data.settings && data.settings.apis) {
                const updatedApiConfig = data.settings.apis[id]; // Get updated API config by ID

                if (updatedApiConfig) {
                    // **Update APIConfigContext using setAPIConfig (now in scope)**
                    setAPIConfig(updatedApiConfig); 
                    console.log("APISettingsView - APIConfigContext updated with re-fetched API config:", {
                        ...updatedApiConfig,
                        apiKey: updatedApiConfig.apiKey ? '[REDACTED]' : undefined
                    });
                } else {
                    console.warn(`Updated API config with ID "${id}" not found in re-fetched settings`);
                }
            }
        } catch (error) {
            console.error("Error re-fetching settings after API update:", error);
            // No user notification of the error
        } finally {
            setIsRefetching(false);
        }
    };

    refetchSettingsAndUpdateContext();
};

  const handleAddAPI = () => {
    const newConfig = createAPIConfig(APIProvider.KOBOLD);
    const configId: string = newConfig.id || `api-${Date.now()}`;
    onUpdate({
      apis: {
        ...settings.apis,
        [configId]: newConfig
      }
    });
  };

  const handleRemoveAPI = (id: string) => {
    const newApis: Record<string, APIConfig> = { ...settings.apis };
    delete newApis[id];
    onUpdate({ apis: newApis });
  };

  const handleProviderChange = (id: string, provider: APIProvider) => {
    const newConfig = createAPIConfig(provider);
    newConfig.id = id;
    handleAPIUpdate(id, newConfig);
  };

  const handleDirectoryChange = (directory: string | null) => {
    onUpdate({
      character_directory: directory,
      save_to_character_directory: true
    });
  };

  // Add visual indicator when API settings are being refetched
  return (
    <div className="h-full flex flex-col">
      {isRefetching && (
        <div className="fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          Refreshing API settings...
        </div>
      )}
      <SettingsTabs defaultTab={activeTab} onTabChange={setActiveTab}>
        <SettingsTab id="general">
          <div className="p-8">
            <h2 className="text-lg font-semibold mb-6">General Settings</h2>
            
            {/* Directory Settings */}
            <div className="mb-8">
              <h3 className="text-md font-medium mb-4">Character Directory</h3>
              <DirectoryPicker
                currentDirectory={settings.character_directory}
                onDirectoryChange={handleDirectoryChange}
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
        </SettingsTab>
        
        <SettingsTab id="api">
          <div className="p-8 pb-16 flex-shrink-0">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">
                API Configuration ({Object.keys(settings.apis || {}).length} APIs)
              </h3>
              <button
                onClick={handleAddAPI}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={18} />
                Add API
              </button>
            </div>
            
            {/* API Cards */}
            <div className="space-y-4">
              {Object.entries(settings.apis || {}).map(([id, api]) => (
                <div key={id} className="bg-gradient-to-b from-zinc-900 to-stone-950 rounded-lg p-4">
                  <APICard
                    api={api}
                    onUpdate={(updates) => handleAPIUpdate(id, updates)}
                    onRemove={() => handleRemoveAPI(id)}
                    onProviderChange={(provider) => handleProviderChange(id, provider)}
                  />
                </div>
              ))}

              {Object.keys(settings.apis || {}).length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  No APIs configured. Click "Add API" to add one.
                  <br />
                  <br />
                  (KoboldCPP at localhost:5001 works out of the box, no config necessary.)
                </div>
              )}
            </div>
          </div>
        </SettingsTab>
        
        <SettingsTab id="templates">
          <TemplateProvider>
            <TemplateManager />
          </TemplateProvider>
        </SettingsTab>
        
        <SettingsTab id="prompts">
          <div className="h-full overflow-y-auto">
            <PromptSettings />
          </div>
        </SettingsTab>
      </SettingsTabs>
    </div>
  );
};

export default APISettingsView;