import { useCallback, useState } from 'react';
import useApiConnection from './useApiConnection';

interface SettingsData {
  [key: string]: any;
}

interface UseSettingsOptions {
  /**
   * Path to the settings endpoint
   * @default '/api/settings'
   */
  settingsEndpoint?: string;
  
  /**
   * Number of retry attempts
   * @default 3
   */
  retryCount?: number;
  
  /**
   * Delay between retries in milliseconds
   * @default 2000
   */
  retryDelay?: number;
  
  /**
   * Callback when settings are successfully loaded
   */
  onSettingsLoaded?: (settings: SettingsData) => void;
  
  /**
   * Callback when settings fail to load after all retries
   */
  onSettingsError?: (error: Error) => void;
}

/**
 * A hook for fetching and managing settings with automatic retry functionality
 */
const useSettings = ({
  settingsEndpoint = '/api/settings',
  retryCount = 3,
  retryDelay = 2000,
  onSettingsLoaded,
  onSettingsError
}: UseSettingsOptions = {}) => {
  // Track if we should skip auto-refresh
  const [skipNextRefresh, setSkipNextRefresh] = useState(false);
  
  const { 
    data: settings, 
    loading, 
    error, 
    retry,
    fetchData
  } = useApiConnection<SettingsData>({
    endpoint: settingsEndpoint,
    retryCount,
    retryDelay,
    onSuccess: onSettingsLoaded,
    onError: onSettingsError
  });

  /**
   * Update settings by sending a PUT request to the server
   * @param updatedSettings - Partial settings to update
   * @param options - Additional options
   * @param options.skipRefresh - Skip automatic refresh after update (useful for batch updates)
   */
  const updateSettings = useCallback(async (
    updatedSettings: Partial<SettingsData>, 
    options: { skipRefresh?: boolean } = {}
  ) => {
    try {
      const response = await fetch(settingsEndpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedSettings),
      });

      if (!response.ok) {
        throw new Error(`Failed to update settings: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      // Only refresh if not explicitly skipped
      if (!options.skipRefresh && !skipNextRefresh) {
        fetchData();
      }
      
      // Reset skip flag after use
      if (skipNextRefresh) {
        setSkipNextRefresh(false);
      }
      
      return { success: true, data: result };
    } catch (err) {
      console.error('Error updating settings:', err);
      return { 
        success: false, 
        error: err instanceof Error ? err : new Error('Unknown error occurred') 
      };
    }
  }, [settingsEndpoint, fetchData, skipNextRefresh]);

  /**
   * Utility to skip the next auto-refresh when performing multiple updates
   */
  const skipRefresh = useCallback(() => {
    setSkipNextRefresh(true);
  }, []);

  return {
    settings,
    loading,
    error,
    retry,
    updateSettings,
    skipRefresh
  };
};

export default useSettings;