import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';

// Define KoboldCPP status type
export interface KoboldStatus {
  status: 'running' | 'present' | 'missing';
  is_running: boolean;
  model_loaded?: boolean;
  model_name?: string;
  error?: string;
  last_updated?: number;
  exe_path?: string; // Added exe_path property to fix type errors
}

// Define the type for KoboldCPP status
interface KoboldCPPStatus {
  status: 'missing' | 'present' | 'running' | 'unknown';
  is_running: boolean;
  exe_path: string | null;
  version: string | null;
  error?: string;
}

// Context to store and provide the KoboldCPP status
interface KoboldCPPContextType {
  status: KoboldStatus | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastUpdated: number;
}

// Create the KoboldCPP context
const KoboldCPPContext = createContext<KoboldCPPContextType>({
  status: null,
  isLoading: false,
  error: null,
  refresh: async () => {},
  lastUpdated: 0
});

// Default polling interval (2 minutes)
const DEFAULT_POLL_INTERVAL = 120000;

// Minimum interval between forced refreshes (10 seconds)
const MIN_REFRESH_INTERVAL = 10000;

// Provider component that fetches and manages KoboldCPP status
export const KoboldCPPProvider = ({ 
  children, 
  pollInterval = DEFAULT_POLL_INTERVAL 
}: { 
  children: ReactNode;
  pollInterval?: number;
}) => {
  const [status, setStatus] = useState<KoboldStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const { settings } = useSettings();

  // Function to fetch KoboldCPP status
  const fetchStatus = async (force = false) => {
    // Skip if not using KoboldCPP or if loading and not forced
    if (!settings.show_koboldcpp_launcher || (isLoading && !force)) {
      return;
    }

    // Throttle refreshes if manually triggered
    if (force && Date.now() - lastUpdated < MIN_REFRESH_INTERVAL) {
      console.log('Throttling KoboldCPP status refresh, too frequent');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/koboldcpp/status');
      if (!response.ok) {
        throw new Error(`Error fetching KoboldCPP status: ${response.status}`);
      }
      const data = await response.json();
      
      // Add timestamp to the status
      const statusWithTimestamp = {
        ...data,
        last_updated: Date.now()
      };
      
      setStatus(statusWithTimestamp);
      setLastUpdated(Date.now());
      setError(null);
    } catch (err) {
      console.error('Failed to fetch KoboldCPP status:', err);
      setError(err instanceof Error ? err.message : 'Unknown error fetching KoboldCPP status');
    } finally {
      setIsLoading(false);
    }
  };

  // Set up polling interval
  useEffect(() => {
    // Initial fetch when component mounts
    if (settings.show_koboldcpp_launcher) {
      fetchStatus();
      
      // Set up polling
      const intervalId = setInterval(() => fetchStatus(), pollInterval);
      return () => clearInterval(intervalId);
    }
  }, [settings.show_koboldcpp_launcher, pollInterval]);

  // Manual refresh function (with throttling)
  const refresh = async () => {
    await fetchStatus(true);
  };

  const value = {
    status,
    isLoading,
    error,
    refresh,
    lastUpdated
  };

  return (
    <KoboldCPPContext.Provider value={value}>
      {children}
    </KoboldCPPContext.Provider>
  );
};

// Custom hook to use the KoboldCPP context
export const useKoboldCPPContext = () => {
  const context = useContext(KoboldCPPContext);
  if (!context) {
    throw new Error('useKoboldCPPContext must be used within a KoboldCPPProvider');
  }
  return context;
};

export default useKoboldCPPContext;

/**
 * Hook for managing KoboldCPP status
 * 
 * This hook provides centralized access to the KoboldCPP status and methods
 * for refreshing the status, launching KoboldCPP, and handling errors.
 */
export function useKoboldCPP() {
  const [status, setStatus] = useState<KoboldCPPStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Fetch status from the backend
  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/koboldcpp/status');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch KoboldCPP status: ${response.statusText}`);
      }
      
      const data = await response.json();
      setStatus(data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(`Error fetching KoboldCPP status: ${err instanceof Error ? err.message : String(err)}`);
      console.error('Error fetching KoboldCPP status:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Launch KoboldCPP
  const launch = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/koboldcpp/launch', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || errorData.message || response.statusText);
      }
      
      const data = await response.json();
      
      // Refresh status after launch attempt
      await fetchStatus();
      
      return data;
    } catch (err) {
      setError(`Error launching KoboldCPP: ${err instanceof Error ? err.message : String(err)}`);
      console.error('Error launching KoboldCPP:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      setIsLoading(false);
    }
  }, [fetchStatus]);

  // Check server connectivity
  const checkServerConnectivity = useCallback(async (port: number = 5001) => {
    try {
      const response = await fetch('/api/koboldcpp/ping-server', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ port }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to check server connectivity: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (err) {
      console.error('Error checking server connectivity:', err);
      return {
        is_responding: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, []);

  // Fetch status on component mount
  useEffect(() => {
    fetchStatus();
    
    // Refresh status every 5 minutes (increased from 30 seconds)
    const interval = setInterval(() => {
      fetchStatus();
    }, 300000); // 5 minutes
    
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return {
    status,
    isLoading,
    error,
    lastRefresh,
    refresh: fetchStatus,
    launch,
    checkServerConnectivity,
  };
}