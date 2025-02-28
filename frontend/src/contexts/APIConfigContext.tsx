import React, { createContext, useState, useContext, useEffect } from 'react';
import { APIConfig } from '../types/api';
import { DEFAULT_SETTINGS } from '../types/settings';

interface APIConfigContextProps {
  apiConfig: APIConfig | null;
  setAPIConfig: (config: APIConfig | null) => void;
}

const APIConfigContext = createContext<APIConfigContextProps>({
  apiConfig: null,
  setAPIConfig: () => {}
});

export const APIConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

  // Load the API config from settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/settings");
        if (!response.ok) throw new Error("Failed to load settings");
        
        const data = await response.json();
        if (data.success && data.settings && data.settings.apis) {
          // Get the first API from the loaded settings
          const apiId = Object.keys(data.settings.apis)[0];
          
          if (apiId) {
            const loadedConfig = data.settings.apis[apiId];
            
            // Always ensure enabled is true for better user experience
            loadedConfig.enabled = true;
            
            // Ensure templateId exists
            if (!loadedConfig.templateId && loadedConfig.template) {
              loadedConfig.templateId = loadedConfig.template;
            } else if (!loadedConfig.templateId) {
              loadedConfig.templateId = 'mistral';
            }
            
            console.log("Loaded API config from settings:", {
              ...loadedConfig,
              apiKey: loadedConfig.apiKey ? '[REDACTED]' : undefined
            });
            
            setAPIConfig(loadedConfig);
          }
        }
      } catch (err) {
        console.error("Failed to load API settings:", err);
      }
    };
    
    loadSettings();
  }, []);

  return (
    <APIConfigContext.Provider value={{ apiConfig, setAPIConfig }}>
      {children}
    </APIConfigContext.Provider>
  );
};

export const useAPIConfig = () => useContext(APIConfigContext);

export { APIConfigContext };