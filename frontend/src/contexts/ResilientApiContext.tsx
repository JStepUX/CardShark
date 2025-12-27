import React, { createContext, useContext, ReactNode } from 'react';

interface ResilientApiContextType {
  retryAllConnections: () => Promise<void>;
}

const ResilientApiContext = createContext<ResilientApiContextType | undefined>(undefined);

export const useResilientApi = (): ResilientApiContextType => {
  const context = useContext(ResilientApiContext);
  if (!context) {
    throw new Error('useResilientApi must be used within a ResilientApiProvider');
  }
  return context;
};

interface ResilientApiProviderProps {
  children: ReactNode;
  retryCount?: number;
  retryDelay?: number;
}

const ResilientApiProvider: React.FC<ResilientApiProviderProps> = ({
  children,
  retryCount = 5,
  retryDelay = 2000
}) => {
  // Placeholder function for retrying all connections
  const retryAllConnections = async () => {
    console.log(`Retry all connections (retryCount: ${retryCount}, retryDelay: ${retryDelay}ms)`);
    // This is a stub - actual retry logic can be implemented here if needed
    return Promise.resolve();
  };

  return (
    <ResilientApiContext.Provider value={{ retryAllConnections }}>
      {children}
    </ResilientApiContext.Provider>
  );
};

export default ResilientApiProvider;
