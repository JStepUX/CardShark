import React, { createContext, useState, useContext } from 'react';
import { APIConfig } from '../types/api';
import { DEFAULT_SETTINGS } from '../types/settings'; // Import DEFAULT_SETTINGS

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
  const [apiConfig, setAPIConfig] = useState<APIConfig | null>(() => DEFAULT_SETTINGS.apis['default_kobold']);

  return (
    <APIConfigContext.Provider value={{ apiConfig, setAPIConfig }}>
      {children}
    </APIConfigContext.Provider>
  );
};

export const useAPIConfig = () => useContext(APIConfigContext);

export { APIConfigContext };