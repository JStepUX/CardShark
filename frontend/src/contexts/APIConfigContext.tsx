import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { APIConfig, APIProvider } from '../types/api';
import { useSettings } from './SettingsContext';

interface APIConfigContextType {
  apiConfig: APIConfig | null;
  allAPIConfigs: Record<string, APIConfig>;
  activeApiId: string | null;
  setAPIConfig: (config: APIConfig) => void;
  setActiveApiId: (id: string) => void;
  isLoading: boolean;
}

// Export the context so it can be imported directly in other files
export const APIConfigContext = createContext<APIConfigContextType | undefined>(undefined);

export const useAPIConfig = (): APIConfigContextType => {
  const context = useContext(APIConfigContext);
  if (!context) {
    throw new Error('useAPIConfig must be used within an APIConfigProvider');
  }
  return context;
};

interface APIConfigProviderProps {
  children: ReactNode;
}

/**
 * Converts a legacy API config to the new format
 */
const convertLegacyApi = (legacyApi: any): APIConfig => {
  return {
    provider: APIProvider.KOBOLD, // Default to KOBOLD as fallback
    enabled: legacyApi.enabled,
    url: legacyApi.url,
    apiKey: legacyApi.apiKey || undefined, // Convert null to undefined
    templateId: legacyApi.templateId,
    lastConnectionStatus: legacyApi.lastConnectionStatus,
    model_info: legacyApi.model_info,
    name: 'Legacy API'
  };
};

export const APIConfigProvider: React.FC<APIConfigProviderProps> = ({ children }) => {
  const [apiConfig, setAPIConfig] = useState<APIConfig | null>(null);
  const [activeApiId, setActiveApiId] = useState<string | null>(null);
  const { settings, isLoading } = useSettings();
  
  // Get all available API configs, memoized to prevent unnecessary re-renders
  const allAPIConfigs = useMemo(() => {
    return (settings && settings.apis) || {};
  }, [settings?.apis]);

  // Load the api configuration from settings
  useEffect(() => {
    if (isLoading || !settings) return;
    
    try {
      console.log("Loading API configuration from settings");
      
      let foundActiveConfig: APIConfig | null = null;
      let foundActiveId: string | null = null;
      
      // First approach: Use the activeApiId from settings if it exists and is enabled
      if (settings.activeApiId && settings.apis?.[settings.activeApiId]?.enabled) {
        foundActiveConfig = settings.apis[settings.activeApiId];
        foundActiveId = settings.activeApiId;
        console.log(`Using active API from settings: ${settings.activeApiId}`);
      } 
      // Second approach: Find the first enabled API
      else if (settings.apis && Object.keys(settings.apis).length > 0) {
        for (const [id, api] of Object.entries(settings.apis)) {
          if (api.enabled) {
            foundActiveConfig = api;
            foundActiveId = id;
            console.log(`No active API specified, using first enabled API: ${id}`);
            break;
          }
        }
      }
      // Third approach: Fall back to legacy 'api' config
      else if (settings.api?.enabled) {
        foundActiveConfig = convertLegacyApi(settings.api);
        foundActiveId = 'legacy';
        console.log("Using legacy API configuration");
      }
      
      // Set the active API
      setAPIConfig(foundActiveConfig);
      setActiveApiId(foundActiveId);
    } catch (error) {
      console.error("Error loading API configuration:", error);
      // Reset to a safe state on error
      setAPIConfig(null);
      setActiveApiId(null);
    }
  }, [settings, isLoading]);

  return (
    <APIConfigContext.Provider 
      value={{ 
        apiConfig, 
        allAPIConfigs, 
        activeApiId, 
        setAPIConfig, 
        setActiveApiId,
        isLoading 
      }}
    >
      {children}
    </APIConfigContext.Provider>
  );
};