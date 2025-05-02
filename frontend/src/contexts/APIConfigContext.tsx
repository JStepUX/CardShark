import React, { createContext, useState, useContext, useCallback } from 'react';
import { APIConfig } from '../types/api';
import { DEFAULT_SETTINGS } from '../types/settings';
import useApiConnection from '../hooks/useApiConnection';
import { useResilientApi } from '../context/ResilientApiContext';
import ResilientApiService from '../services/ResilientApiService';

interface APIConfigContextProps {
  apiConfig: APIConfig | null;
  setAPIConfig: (config: APIConfig | null) => void;
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
}

interface SettingsResponse {
  success?: boolean;
  settings?: {
    apis?: Record<string, APIConfig>;
  };
  apis?: Record<string, APIConfig>;
}

const defaultContextValue: APIConfigContextProps = {
  apiConfig: null,
  setAPIConfig: () => {},
  isLoading: false,
  error: null,
  retry: () => {}
};

const APIConfigContext = createContext<APIConfigContextProps>(defaultContextValue);

/**
 * Provider component for API configuration
 * Manages loading, updating and providing API configuration throughout the application
 */
export const APIConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Get access to the resilient API context
  const { retryAllConnections } = useResilientApi();
  
  // Initialize with default API config
  const [apiConfig, setAPIConfig] = useState<APIConfig | null>(() => {
    try {
      // Get default API from settings
      const defaultApiId = Object.keys(DEFAULT_SETTINGS.apis)[0];
      
      if (defaultApiId) {
        // Create a deep copy of the config to avoid modifying the original
        const config = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.apis[defaultApiId]));
        
        // Ensure the API is enabled by default for better user experience
        config.enabled = true;
        
        // Also make sure templateId is set
        if (!config.templateId) {
          config.templateId = 'mistral';
        }
        
        console.log("Initialized API config with:", {
          ...config,
          apiKey: config.apiKey ? '[REDACTED]' : undefined
        });
        
        return config;
      }
      
      return null;
    } catch (error) {
      console.error("Error initializing API config:", error);
      return null;
    }
  });

  // Use our resilient API connection hook to load settings
  const { 
    loading, 
    error, 
    retry: retryFetch
  } = useApiConnection<SettingsResponse>({
    endpoint: "/api/settings",
    retryCount: 5,
    retryDelay: 2000,
    onSuccess: (data) => {
      if (data?.success && data?.settings?.apis) {
        // Get the first API from the loaded settings
        const apiId = Object.keys(data.settings.apis)[0];
        
        if (apiId) {
          const loadedConfig = data.settings.apis[apiId];
          
          // Always ensure enabled is true for better user experience
          loadedConfig.enabled = true;
          
          // Ensure templateId exists
          // FIXED: Removed references to non-existent 'template' property
          if (!loadedConfig.templateId) {
            loadedConfig.templateId = 'mistral';
          }
          
          console.log("Loaded API config from settings:", {
            ...loadedConfig,
            apiKey: loadedConfig.apiKey ? '[REDACTED]' : undefined
          });
          
          setAPIConfig(loadedConfig);
        }
      }
    },
    onError: (err) => {
      console.error("Failed to load API settings after retries:", err);
    }
  });

  /**
   * Save API config changes to the backend
   * @param config - The API configuration to save
   */
  const saveApiConfig = useCallback(async (config: APIConfig) => {
    try {
      // First we need to get the current settings
      const settingsResponse = await ResilientApiService.get<SettingsResponse>('/api/settings', undefined, {
        retryCount: 3,
        retryDelay: 1000
      });
      
      // Then update the API config in the settings
      if (settingsResponse?.settings?.apis) {
        const apiId = Object.keys(settingsResponse.settings.apis)[0];
        if (apiId) {
          const updatedSettings = {
            ...settingsResponse,
            settings: {
              ...settingsResponse.settings,
              apis: {
                ...settingsResponse.settings.apis,
                [apiId]: config
              }
            }
          };
          
          // Save the updated settings
          await ResilientApiService.put<SettingsResponse, SettingsResponse>('/api/settings', updatedSettings, undefined, {
            retryCount: 3,
            retryDelay: 1000
          });
        }
      }
    } catch (err) {
      console.error("Failed to save API configuration:", err);
    }
  }, []);

  /**
   * Enhanced setAPIConfig that also saves to backend
   * @param config - The API configuration to set and save
   */
  const handleSetAPIConfig = useCallback((config: APIConfig | null) => {
    setAPIConfig(config);
    if (config) {
      saveApiConfig(config).catch(console.error);
    }
  }, [saveApiConfig]);

  /**
   * Combined retry handler for both local fetching and global API connections
   */
  const handleRetry = useCallback(() => {
    retryFetch();
    retryAllConnections();
  }, [retryFetch, retryAllConnections]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = React.useMemo(() => ({
    apiConfig, 
    setAPIConfig: handleSetAPIConfig,
    isLoading: loading,
    error,
    retry: handleRetry
  }), [apiConfig, handleSetAPIConfig, loading, error, handleRetry]);

  return (
    <APIConfigContext.Provider value={contextValue}>
      {children}
    </APIConfigContext.Provider>
  );
};

/**
 * Custom hook for accessing API configuration context
 * @returns API configuration context
 */
export const useAPIConfig = (): APIConfigContextProps => {
  const context = useContext(APIConfigContext);
  
  if (!context) {
    throw new Error('useAPIConfig must be used within an APIConfigProvider');
  }
  
  return context;
};

export { APIConfigContext };