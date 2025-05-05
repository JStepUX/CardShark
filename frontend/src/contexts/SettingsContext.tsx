import React, { createContext, useContext, useState, useEffect } from "react";
import { Settings, DEFAULT_SETTINGS } from "../types/settings";
// Rename the imported hook to avoid naming conflicts
import useSettingsHook from "../hooks/useSettings";
import { useResilientApi } from "../context/ResilientApiContext";

interface SettingsContextType {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
}

const defaultContext: SettingsContextType = {
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
  isLoading: true,
  error: null,
  retry: () => {},
};

const SettingsContext = createContext<SettingsContextType>(defaultContext);

// Export only one hook name for consistency
export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { retryAllConnections } = useResilientApi();
  const [refreshKey, setRefreshKey] = useState(0);

  // Use our resilient settings hook (renamed to avoid conflict)
  const { 
    settings: fetchedSettings, 
    loading, 
    error, 
    retry: retryFetch, 
    updateSettings: updateSettingsApi
  } = useSettingsHook({
    retryCount: 5,
    retryDelay: 2000,
    onSettingsLoaded: (settingsData) => {
      console.log("Settings loaded:", {
        character_directory: settingsData.character_directory,
        models_directory: settingsData.models_directory,
        model_directory: settingsData.model_directory
      });
    },
    onSettingsError: (err) => {
      console.error("Failed to load settings after retries:", err);
    }
  });

  // Use a more careful merging approach for settings
  const mergedSettings = React.useMemo(() => {
    if (!fetchedSettings) return DEFAULT_SETTINGS;
    
    // Create a deep merged object
    const result = { ...DEFAULT_SETTINGS };
    
    // Explicitly handle each important top-level property to avoid null/undefined issues
    Object.keys(fetchedSettings).forEach(key => {
      // Type-safe approach to dynamic property access
      if (fetchedSettings[key as keyof typeof fetchedSettings] !== undefined && 
          fetchedSettings[key as keyof typeof fetchedSettings] !== null) {
        // Use type assertion to safely assign properties
        (result as any)[key] = fetchedSettings[key as keyof typeof fetchedSettings];
      }
    });
    
    return result;
  }, [fetchedSettings]);

  // Log merged settings for debugging
  useEffect(() => {
    if (!loading && fetchedSettings) {
      console.log("Merged settings:", {
        character_directory: mergedSettings.character_directory,
        models_directory: mergedSettings.models_directory, 
        model_directory: mergedSettings.model_directory
      });
    }
  }, [loading, fetchedSettings, mergedSettings]);

  // Update settings handler with error handling and retries
  const updateSettings = async (updates: Partial<Settings>) => {
    try {
      await updateSettingsApi(updates);
      
      // Refresh context for components that depend on settings
      setRefreshKey(prev => prev + 1);

      return;
    } catch (err) {
      console.error("Failed to save settings:", err);
      throw err;
    }
  };

  // Combined retry handler that retries both settings and other API connections
  const handleRetry = () => {
    retryFetch();
    retryAllConnections();
  };

  return (
    <SettingsContext.Provider 
      key={`settings-context-${refreshKey}`}
      value={{ 
        settings: mergedSettings, 
        updateSettings, 
        isLoading: loading,
        error,
        retry: handleRetry
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsContext;