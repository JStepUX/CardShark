// src/components/APISettingsView.tsx
import React, { useState, useEffect } from 'react';
import { Plus, Save } from 'lucide-react';
import DirectoryPicker from './DirectoryPicker';
import { APICard } from './APICard';
import {
  APIProvider,
  APIConfig,
  createAPIConfig
} from '../types/api';
import { SyntaxHighlightSettings, DEFAULT_SYNTAX_HIGHLIGHT_SETTINGS } from '../types/settings';
import { SettingsTabs, SettingsTab } from './SettingsTabs';
import TemplateManager from './TemplateManager';
import { TemplateProvider } from '../contexts/TemplateContext';
import { useAPIConfig } from '../contexts/APIConfigContext';
import { useSettings } from '../contexts/SettingsContext';
import PromptSettings from './PromptSettings';
import HighlightingSettings from './HighlightingSettings';
import KoboldCPPManager from './KoboldCPPManager';
import ModelDirectorySettings from './settings/ModelDirectorySettings';

interface APISettingsViewProps {}

export const APISettingsView: React.FC<APISettingsViewProps> = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'api' | 'templates' | 'prompts' | 'highlighting'>('general');
  const { setAPIConfig } = useAPIConfig();
  const { settings, updateSettings, isLoading } = useSettings();
  const [isRefetching, setIsRefetching] = useState(false);

  // Get the effective model directory from either field
  const effectiveModelDirectory = settings.models_directory || settings.model_directory || '';
  const characterDirectory = settings.character_directory || '';

  // Debug log to verify we're getting the correct settings
  useEffect(() => {
    console.log("Settings in APISettingsView:", {
      characterDirectory: settings.character_directory,
      modelsDirectory: settings.models_directory,
      modelDirectory: settings.model_directory,
      effectiveModelDirectory,
      isLoading
    });
  }, [settings, effectiveModelDirectory, isLoading]);

  const handleAPIUpdate = (id: string, updates: Partial<APIConfig>) => {
    // Disable update button while refetching
    if (isRefetching) {
      console.log("API update already in progress, please wait...");
      return;
    }
    
    updateSettings({
        apis: {
            ...settings.apis,
            [id]: {
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
        } finally {
            setIsRefetching(false);
        }
    };

    refetchSettingsAndUpdateContext();
};

  const handleAddAPI = () => {
    const newConfig = createAPIConfig(APIProvider.KOBOLD);
    const configId: string = newConfig.id || `api-${Date.now()}`;
    updateSettings({
      apis: {
        ...settings.apis,
        [configId]: newConfig
      }
    });
  };

  const handleRemoveAPI = (id: string) => {
    const newApis: Record<string, APIConfig> = { ...settings.apis };
    delete newApis[id];
    updateSettings({ apis: newApis });
  };

  const handleProviderChange = (id: string, provider: APIProvider) => {
    const newConfig = createAPIConfig(provider);
    newConfig.id = id;
    handleAPIUpdate(id, newConfig);
  };

  const handleDirectoryChange = (directory: string) => {
    console.log("Setting character directory to:", directory);
    updateSettings({
      character_directory: directory,
      save_to_character_directory: true
    });
  };

  const handleModelDirectoryChange = (directory: string) => {
    // Update both models_directory and model_directory fields for compatibility
    console.log("Setting model directory to:", directory);
    updateSettings({
      models_directory: directory,
      model_directory: directory
    });
  };

  const handleHighlightingUpdate = (highlightSettings: SyntaxHighlightSettings) => {
    const saveHighlightSettings = async () => {
      try {
        const response = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ syntaxHighlighting: highlightSettings })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error("Failed to save syntax highlighting settings:", errorData);
          throw new Error(`Failed to save settings: ${errorData.message || response.statusText}`);
        }
        
        const data = await response.json();
        if (data.success) {
          console.log("Successfully saved syntax highlighting settings to disk");
          updateSettings({ syntaxHighlighting: highlightSettings });
        } else {
          throw new Error("Server returned failure status");
        }
      } catch (err) {
        console.error("Error saving syntax highlighting settings:", err);
        updateSettings({ syntaxHighlighting: highlightSettings });
      }
    };
    
    saveHighlightSettings();
  };

  // If still loading settings, show a loading indicator
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto"></div>
          <p className="text-gray-400">Loading settings...</p>
        </div>
      </div>
    );
  }

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
                currentDirectory={characterDirectory}
                onDirectoryChange={handleDirectoryChange}
              />
              
              {characterDirectory && (
                <div className="mt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.save_to_character_directory}
                      onChange={(e) => updateSettings({ save_to_character_directory: e.target.checked })}
                      className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-300">
                      Save characters to this directory
                    </span>
                  </label>
                </div>
              )}
            </div>
            
            {/* Model Directory Settings */}
            <div className="mb-8">
              <ModelDirectorySettings
                directory={effectiveModelDirectory}
                onDirectoryChange={handleModelDirectoryChange}
              />
            </div>

            {/* KoboldCPP Settings */}
            <div className="mb-8">
              <h3 className="text-md font-medium mb-4">KoboldCPP Settings</h3>
              <div className="mt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.show_koboldcpp_launcher || false}
                    onChange={(e) => updateSettings({ show_koboldcpp_launcher: e.target.checked })}
                    className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-300">
                    Show KoboldCPP launcher on startup
                  </span>
                </label>
                <p className="mt-2 text-xs text-gray-400">
                  When enabled, the KoboldCPP launcher will appear in the Character Gallery if KoboldCPP is installed but not running.
                  Disable this option if you don't use KoboldCPP or if Character Gallery is running slowly.
                </p>
              </div>
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
            
            {/* KoboldCPP Manager */}
            <div className="mb-8">
              <KoboldCPPManager />
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

        <SettingsTab id="highlighting">
          <div className="h-full overflow-y-auto">
            <div className="sticky top-0 z-10 bg-zinc-950 p-4 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="text-lg font-semibold">Syntax Highlighting Settings</h2>
              <button
                onClick={() => {/* Auto-saves when changed */}}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                disabled={true}
              >
                <Save size={18} />
                Auto-saved
              </button>
            </div>
            <HighlightingSettings
              settings={settings.syntaxHighlighting || DEFAULT_SYNTAX_HIGHLIGHT_SETTINGS}
              onUpdate={handleHighlightingUpdate}
            />
          </div>
        </SettingsTab>
      </SettingsTabs>
    </div>
  );
};

export default APISettingsView;