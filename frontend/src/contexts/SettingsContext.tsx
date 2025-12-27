import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Settings, DEFAULT_SETTINGS } from "../types/settings";
import { useResilientApi } from "./ResilientApiContext"; // Keep for retryAllConnections
import { ContentFilterClient } from "../services/contentFilterClient";
// Removed unused import: WordSwapRule

interface SettingsContextType {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => Promise<void>; // Simpler update signature
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

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { retryAllConnections } = useResilientApi();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    console.log("[SettingsContext] Fetching settings...");
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        throw new Error(`Failed to fetch settings: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();      if (data.success && data.data && data.data.settings) {        // Merge fetched settings with defaults to ensure all keys exist
        // Use deep merge for nested objects like 'apis' and 'syntaxHighlighting'
        const deepMerge = (target: any, source: any): any => {
          Object.keys(source).forEach(key => {
            const targetValue = target[key];
            const sourceValue = source[key];            if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
              // Ensure target node exists and is an object
              if (!targetValue || typeof targetValue !== 'object' || Array.isArray(targetValue)) {
                target[key] = {};
              }
              deepMerge(target[key], sourceValue);            } else {
              // Assign non-object values directly (including null/undefined from source)
              target[key] = sourceValue;
            }
          });
          return target;
        };        // Start with a deep copy of defaults, then merge fetched settings onto it
        const merged = deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), data.data.settings);        setSettings(merged);
        console.log("[SettingsContext] Settings loaded successfully");
      } else {
        throw new Error(data.message || 'Failed to parse settings from response');
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
      setError(err instanceof Error ? err : new Error('Unknown error fetching settings'));
      setSettings(DEFAULT_SETTINGS); // Fallback to defaults on error
    } finally {
      setIsLoading(false);
    }
  }, []);
  // Fetch content filters separately from main settings
  const fetchContentFilters = useCallback(async () => {
    console.log("[SettingsContext] Fetching content filters...");
    try {
      const rules = await ContentFilterClient.getContentFilters();
      
      // Update settings with the content filters
      setSettings(prev => ({
        ...prev,
        wordSwapRules: rules
      }));
      console.log("[SettingsContext] Content filters loaded:", rules.length);
    } catch (err) {
      console.error("Error fetching content filters:", err);
      // We don't set the error state here to avoid blocking the entire settings context
      // just because content filters failed to load
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    // Also fetch content filters separately
    fetchContentFilters();
  }, [fetchSettings, fetchContentFilters]);

  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    console.log("[SettingsContext] Attempting to update settings with:", updates);
    // Note: No optimistic update here for simplicity, state updates only on success
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates), // Send only the updates
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP error ${response.status}` }));
        throw new Error(errorData.message || `Failed to update settings: ${response.statusText}`);
      }      const result = await response.json();
      if (result.success && result.data && result.data.settings) {
         // Update state with the *full* settings object returned by the backend
         // This ensures consistency if the backend modifies/merges data
         const merged = { ...DEFAULT_SETTINGS, ...result.data.settings }; // Re-merge with defaults
         setSettings(merged);
         console.log("[SettingsContext] Settings updated successfully. New models_directory:", merged.models_directory);
      } else {
        throw new Error(result.message || 'Backend reported failure updating settings');
      }
    } catch (err) {
      console.error("Error updating settings:", err);
      // Optionally re-fetch settings on error to ensure consistency
      // fetchSettings();
      throw err; // Re-throw for components to handle
    }
  }, []); // Removed fetchSettings from dependency array to avoid potential loops if fetchSettings itself changes

  const handleRetry = useCallback(() => {
    fetchSettings();
    retryAllConnections();
  }, [fetchSettings, retryAllConnections]);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        isLoading,
        error,
        retry: handleRetry
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsContext;