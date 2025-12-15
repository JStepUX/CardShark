// src/components/APISettingsView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Save } from 'lucide-react';
import { toast } from 'sonner'; // Import toast
import DirectoryPicker from '../DirectoryPicker';
import { APICard } from '../APICard';
import {
  APIProvider,
  APIConfig,
  createAPIConfig
} from '../../types/api';
import { useScrollToBottom } from '../../hooks/useScrollToBottom';
import { Settings, SyntaxHighlightSettings, DEFAULT_SYNTAX_HIGHLIGHT_SETTINGS } from '../../types/settings'; // Import Settings type
import { SettingsTabs, SettingsTab } from '../SettingsTabs';
import TemplateManager from '../TemplateManager';
import { TemplateProvider } from '../../contexts/TemplateContext';
import { useAPIConfig } from '../../contexts/APIConfigContext';
import { useSettings } from '../../contexts/SettingsContext';
import PromptSettings from './PromptSettings';
import HighlightingSettings from '../HighlightingSettings';
import { ContentFilteringTab } from './ContentFilteringTab';

import { WordSwapRule } from '../../utils/contentProcessing';
// import KoboldCPPManager from './KoboldCPPManager'; // Removed
import ModelDirectorySettings from './ModelDirectorySettings';

interface APISettingsViewProps {}

export const APISettingsView: React.FC<APISettingsViewProps> = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'api' | 'templates' | 'prompts' | 'highlighting' | 'filtering'>('general');
  const { setAPIConfig, activeApiId, setActiveApiId } = useAPIConfig();  const { settings, updateSettings, isLoading } = useSettings();
  const [wordSwapRules, setWordSwapRules] = useState<WordSwapRule[]>(settings.wordSwapRules || []);
  
  // Update local wordSwapRules when settings are loaded or changed
  useEffect(() => {
    if (settings?.wordSwapRules) {
      setWordSwapRules(settings.wordSwapRules);
    }
  }, [settings?.wordSwapRules]);
  
  // Handle updates to word swap rules
  // This function will be passed to ContentFilteringTab
  // but the actual API call is now handled by ContentFilterClient
  const handleUpdateWordSwapRules = (rules: WordSwapRule[]) => {
    setWordSwapRules(rules); // Update local state
  };
  const [newApiProviderType, setNewApiProviderType] = useState<APIProvider>(APIProvider.KOBOLD); // State for selected provider type
  const lastAddedApiIdRef = useRef<string | null>(null);
  
  // Set up scrolling functionality
  const { containerRef, endRef, scrollToBottom } = useScrollToBottom();

  // Local state for managing API configurations displayed in the UI
  const [localApis, setLocalApis] = useState<Record<string, APIConfig>>(settings.apis || {});
  // Sync local state when global settings change (e.g., initial load or external update)
  useEffect(() => {
    if (settings?.apis && JSON.stringify(settings.apis) !== JSON.stringify(localApis)) {
       console.log("Syncing localApis with settings.apis");
       setLocalApis(settings.apis);
    }
    // Intentionally only depending on settings.apis to avoid loops if localApis is in dependency array
  }, [settings?.apis]);
    // Add listener for the global scroll-to-bottom event and API-specific event
  useEffect(() => {
    const handleScrollEvent = () => {
      // Only respond if we're on the API tab
      if (activeTab === 'api') {
        setTimeout(() => scrollToBottom(), 100);
      }
    };
    
    // Listen for both general and API-specific scroll events
    window.addEventListener('cardshark:scroll-to-bottom', handleScrollEvent);
    window.addEventListener('cardshark:scroll-to-api-card', handleScrollEvent);
    
    return () => {
      window.removeEventListener('cardshark:scroll-to-bottom', handleScrollEvent);
      window.removeEventListener('cardshark:scroll-to-api-card', handleScrollEvent);
    };
  }, [activeTab, scrollToBottom]);

  // Scroll when switching to the API tab, especially useful after adding a new API
  useEffect(() => {
    if (activeTab === 'api' && lastAddedApiIdRef.current) {
      // Scroll to bottom when switching to API tab after adding a card
      setTimeout(() => {
        scrollToBottom();
        // Clear the ref after scrolling
        lastAddedApiIdRef.current = null;
      }, 150);
    }
  }, [activeTab, scrollToBottom]);

  // Use the primary field, default to empty string
  const modelsDirectory = settings.models_directory || '';
  const characterDirectory = settings.character_directory || '';

  // Debug log to verify we're getting the correct settings
  useEffect(() => {
    console.log("Settings in APISettingsView:", {
      characterDirectory: settings.character_directory,
      modelsDirectory: settings.models_directory, // Log the raw value
      activeApiId,
      isLoading
    });
  }, [settings, activeApiId, isLoading]);

  // handleAPIUpdate now receives the full config to save from APICard
  const handleAPIUpdate = (id: string, configToSave: APIConfig) => {
    // 1. Update local state immediately for UI responsiveness
    // This ensures the UI reflects the saved state even before backend confirmation if desired,
    // though APICard now manages its own editable state.
    // For simplicity, we'll trust APICard's state and directly proceed to persist.
    console.log(`Attempting to persist API state for ID: ${id}`);

    // 2. Persist the change to the backend
    // Send the complete API config for this ID.
    updateSettings({ apis: { [id]: configToSave } }) // Removed second argument
      .then(() => {
        // Update localApis to reflect the persisted state immediately
        const updatedLocalApis = { ...(localApis || {}), [id]: configToSave };
        setLocalApis(updatedLocalApis);
        console.log(`Successfully persisted API update for ID: ${id}. LocalApis updated.`);

        let shouldMakeActive = false;
        if (configToSave.enabled) {
          const enabledApis = Object.values(updatedLocalApis).filter(api => api.enabled);
          if (enabledApis.length === 1 && enabledApis[0].id === id) {
            // This is now the only enabled API
            shouldMakeActive = true;
            console.log(`API ${id} is the only enabled API.`);
          } else if (Object.keys(updatedLocalApis).length === 1 && updatedLocalApis[id]?.id === id) {
            // This is the only API overall (and it's enabled)
            shouldMakeActive = true;
            console.log(`API ${id} is the only API overall and is enabled.`);
          }
        }

        if (shouldMakeActive && activeApiId !== id) {
          console.log(`Automatically setting API ${id} as active.`);
          handleSetActiveAPI(id); // This persists activeApiId and updates context via setActiveApiId
                                  // The context will then load this config as the global one.
        } else if (id === activeApiId) {
          // If it was already active, ensure context is updated with the latest config (e.g. new enabled state)
          console.log(`API ${id} was already active, updating context with latest config.`);
          setAPIConfig(configToSave);
        }
      })
      .catch(error => {
        console.error("Error persisting API configuration update:", error);
        toast.error(`Error saving API "${configToSave.name || id}": ${error.message || 'Unknown error'}`);
      });
  };

  const handleAddAPI = () => {
    // 1. Create the new API configuration using the selected newApiProviderType
    const newConfig = createAPIConfig(newApiProviderType);
    const configId = newConfig.id;

    if (!configId) {
      console.error("Failed to generate a valid ID for the new API config.");
      return;
    }

    // 2. Update local state immediately to show the new card
    // The new card will have its own "Save" button to persist itself.
    setLocalApis((prevApis: Record<string, APIConfig>) => ({
      ...prevApis,
      [configId]: newConfig
    }));

    // Save the ID of the newly added API card to scroll to it
    lastAddedApiIdRef.current = configId;

    // 3. Switch to the API tab
    setActiveTab('api');
    console.log(`Added new API card locally with ID: ${configId}. User needs to configure and save.`);
    // DO NOT save to backend here. APICard's "Save" button will handle it.
    
    // 4. Scroll to the bottom after a slight delay to ensure the component has rendered and tab has switched
    setTimeout(() => {
      // Check if we're still on the API tab
      if (activeTab === 'api') {
        scrollToBottom();
      }
    }, 300); // Slightly longer delay to ensure tab switch completes
  };

  const handleRemoveAPI = (id: string) => {
    const apiToRemove = localApis[id]; // Get a reference before modifying localApis
    const apiName = apiToRemove?.name || id; // Capture name for toasts

    // 1. Update local state immediately
    setLocalApis((prevApis) => {
        const newLocalApis = { ...prevApis };
        delete newLocalApis[id];
        return newLocalApis;
    });
    console.log(`Removed API locally with ID: ${id}, Name: ${apiName}`);

    // 2. Persist the removal to the backend.
    // Create the intended final state of the 'apis' map.
    // The backend should replace its entire 'apis' map with this one.
    // If the backend performs a deep merge *into* its existing 'apis' map
    // without removing keys not present in this payload, deletions will not persist.
    const remainingApis = { ...settings.apis };
    delete remainingApis[id];

    const updatePayload: Partial<Settings> = {
        apis: remainingApis,
    };

    if (id === activeApiId) { // If the active API was the one removed
        const newActiveApiIdCandidate = Object.keys(remainingApis).length > 0 ? Object.keys(remainingApis)[0] : null;
        setActiveApiId(newActiveApiIdCandidate ?? ''); // Update context's activeApiId immediately

        // Update activeApiId in the payload to be sent to the backend.
        // Send null or undefined to clear activeApiId if no suitable API is left.
        updatePayload.activeApiId = newActiveApiIdCandidate ?? undefined;
    }
    // If the removed API was not active, activeApiId in settings.json generally shouldn't change,
    // unless it becomes invalid (e.g., points to a non-existent ID after other operations).
    // The current logic correctly updates activeApiId if the *active* one is removed.

    updateSettings(updatePayload)
      .then(() => {
        console.log(`Successfully persisted API removal for ID: ${id}, Name: ${apiName}`);
        toast.success(`API "${apiName}" removed successfully.`);
        // settings.apis will update via context propagation from useSettings
      })
      .catch(error => {
        console.error(`Error persisting API removal for ID: ${id}, Name: ${apiName}:`, error);
        toast.error(`Error removing API "${apiName}": ${error.message || 'Unknown error'}`);
        // Revert localApis because persistence failed, by re-fetching from (potentially stale) context.
        // This ensures UI consistency with what's likely still in settings.json.
        setLocalApis(settings.apis);
      });
  };


  // handleProviderChange is removed as APICard now handles this internally.
  // const handleProviderChange = (id: string, provider: APIProvider) => {
  //   const newConfig = createAPIConfig(provider);
  //   newConfig.id = id;
  //   handleAPIUpdate(id, newConfig); // This would need to change if kept
  // };

  const handleSetActiveAPI = (id: string) => {
    // Update the settings with the new active API ID
    updateSettings({ activeApiId: id }); // Removed second argument
    
    // Update the APIConfigContext
    setActiveApiId(id);
  };

  const handleDirectoryChange = (directory: string) => {
    console.log("Setting character directory to:", directory);
    updateSettings({
      character_directory: directory,
      save_to_character_directory: true
    });
  };

  const handleModelDirectoryChange = async (directory: string) => {
    // Update both models_directory and model_directory fields for compatibility
    console.log("Attempting to set model directory to:", directory);
    try {
      await updateSettings({
        models_directory: directory,
        model_directory: directory
      });
      console.log("Model directory update successful via context.");
      // Success message is handled by ModelDirectorySettings component
    } catch (error) {
      console.error("Failed to update model directory via context:", error);
      // Re-throw the error so ModelDirectorySettings can display it
      throw error;
    }
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
                directory={modelsDirectory} // Pass the direct value
                onDirectoryChange={handleModelDirectoryChange}
              />
            </div>            {/* Content filtering settings have been moved to the Content Filter tab */}

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
                API Configuration ({Object.keys(localApis || {}).length} APIs)
              </h3>
              <div className="flex items-center gap-2">
                <select
                  value={newApiProviderType}
                  onChange={(e) => setNewApiProviderType(e.target.value as APIProvider)}
                  className="px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500 text-sm text-white"
                >
                  {Object.values(APIProvider).map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddAPI}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus size={18} />
                  Add API
                </button>
              </div>
            </div>
            
            {/* KoboldCPP Manager Removed */}

            {/* Info about multiple API support */}
            <div className="mb-4 p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
              <h4 className="font-medium text-blue-300 mb-2">Multiple API Support</h4>
              <p className="text-sm text-gray-300">
                You can connect to multiple AI providers simultaneously. Use the "Set Active" button to choose which API to use for chat.
                Only enabled APIs can be set as active.
              </p>
            </div>
              {/* API Cards */}
            <div ref={containerRef} className="space-y-4">
              {/* Render cards based on localApis state */}
              {Object.entries(localApis || {}).map(([id, api]: [string, APIConfig]) => ( // Added type assertion for api
                <div key={id} className="bg-gradient-to-b from-zinc-900 to-stone-950 rounded-lg p-4">
                  <APICard
                    api={api}
                    apiId={id}
                    isActive={id === activeApiId}
                    onUpdate={(apiId, configToSave) => handleAPIUpdate(apiId, configToSave)}
                    onRemove={() => handleRemoveAPI(id)}
                    // onProviderChange is no longer a prop of APICard
                    onSetActive={() => handleSetActiveAPI(id)}
                  />
                </div>
              ))}

              {/* Show message if localApis is empty */}
              {Object.keys(localApis || {}).length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  No APIs configured. Click "Add API" to get started.
                  <br />
                  <br />
                  (KoboldCPP at localhost:5001 works out of the box, no config necessary.)
                </div>
              )}
              
              {/* Invisible element at the end for scrolling */}
              <div ref={endRef} />
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
        </SettingsTab>        <SettingsTab id="highlighting">
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
        
        <SettingsTab id="filtering">
          <div className="h-full overflow-y-auto">
            <div className="sticky top-0 z-10 bg-zinc-950 p-4 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="text-lg font-semibold">Chat Settings</h2>
              <button
                onClick={() => {/* Auto-saves when changed */}}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                disabled={true}
              >
                <Save size={18} />
                Auto-saved
              </button>
            </div>
            <div className="p-4">              <ContentFilteringTab                wordSwapRules={wordSwapRules} 
                onUpdateRules={handleUpdateWordSwapRules}
                removeIncompleteSentences={settings.remove_incomplete_sentences || false}
                onUpdateRemoveIncompleteSentences={(value) => updateSettings({ remove_incomplete_sentences: value })}
              />            </div>
          </div>
        </SettingsTab>
      </SettingsTabs>
    </div>
  );
};

export default APISettingsView;