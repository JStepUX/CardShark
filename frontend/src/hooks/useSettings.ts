import { useCallback } from 'react';
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
   */
  const updateSettings = useCallback(async (updatedSettings: Partial<SettingsData>) => {
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
      
      // Refresh settings from the server to ensure we have the latest
      fetchData();
      
      return { success: true, data: result };
    } catch (err) {
      console.error('Error updating settings:', err);
      return { 
        success: false, 
        error: err instanceof Error ? err : new Error('Unknown error occurred') 
      };
    }
  }, [settingsEndpoint, fetchData]);

  return {
    settings,
    loading,
    error,
    retry,
    updateSettings
  };
};

export default useSettings;