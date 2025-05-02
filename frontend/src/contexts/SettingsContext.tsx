import React, { createContext, useContext, useState } from "react";
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
    onSettingsError: (err) => {
      console.error("Failed to load settings after retries:", err);
    }
  });

  // Combine the fetched settings with defaults
  const settings = fetchedSettings ? { ...DEFAULT_SETTINGS, ...fetchedSettings } : DEFAULT_SETTINGS;

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
        settings, 
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