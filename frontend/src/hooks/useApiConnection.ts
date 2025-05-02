import { useState, useEffect, useCallback } from 'react';

/**
 * Options for configuring the API connection
 */
export interface ApiConnectionOptions<T> {
  /**
   * The API endpoint to fetch from
   */
  endpoint: string;
  
  /**
   * Optional initial data
   */
  initialData?: T | null;
  
  /**
   * Number of retry attempts before giving up
   * @default 3
   */
  retryCount?: number;
  
  /**
   * Delay between retry attempts in milliseconds
   * @default 1500
   */
  retryDelay?: number;
  
  /**
   * Optional callback when fetch is successful
   */
  onSuccess?: (data: T) => void;
  
  /**
   * Optional callback when fetch fails after all retries
   */
  onError?: (error: Error) => void;
  
  /**
   * Whether to fetch data automatically on mount
   * @default true
   */
  autoFetch?: boolean;
  
  /**
   * Optional fetch options to be passed to the fetch API
   */
  fetchOptions?: RequestInit;
  
  /**
   * Optional function to transform the response data
   */
  transform?: (data: any) => T;
}

/**
 * Return type for the useApiConnection hook
 */
export interface ApiConnectionResult<T> {
  /**
   * The fetched data
   */
  data: T | null;
  
  /**
   * Whether the data is currently being loaded
   */
  loading: boolean;
  
  /**
   * Any error that occurred during fetching
   */
  error: Error | null;
  
  /**
   * Function to manually trigger a retry
   */
  retry: () => void;
  
  /**
   * Function to manually fetch the data
   */
  fetchData: () => Promise<void>;
}

/**
 * A hook that handles API connections with automatic retries
 * and provides loading/error states.
 */
const useApiConnection = <T>({
  endpoint,
  initialData = null,
  retryCount = 3,
  retryDelay = 1500,
  onSuccess,
  onError,
  autoFetch = true,
  fetchOptions,
  transform
}: ApiConnectionOptions<T>): ApiConnectionResult<T> => {
  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState<boolean>(autoFetch);
  const [error, setError] = useState<Error | null>(null);
  const [retries, setRetries] = useState<number>(0);
  const [shouldFetch, setShouldFetch] = useState<boolean>(autoFetch);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(endpoint, fetchOptions);
      
      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      const transformedData = transform ? transform(result) : result;
      
      setData(transformedData);
      setLoading(false);
      onSuccess?.(transformedData);
    } catch (err) {
      console.error(`API connection error (${endpoint}):`, err);
      
      if (retries < retryCount) {
        console.log(`Connection failed to ${endpoint}, retrying (${retries + 1}/${retryCount}) in ${retryDelay}ms...`);
        
        // Schedule retry
        setTimeout(() => {
          setRetries(prev => prev + 1);
          setShouldFetch(true);
        }, retryDelay);
      } else {
        const error = err instanceof Error ? err : new Error('Unknown error occurred');
        setError(error);
        setLoading(false);
        onError?.(error);
        
        // Reset retries so we can try again manually
        setRetries(0);
      }
    }
  }, [endpoint, retries, retryCount, retryDelay, onSuccess, onError, fetchOptions, transform]);

  useEffect(() => {
    if (shouldFetch) {
      setShouldFetch(false);
      fetchData();
    }
  }, [fetchData, shouldFetch]);

  const retry = useCallback(() => {
    setRetries(0);
    setShouldFetch(true);
  }, []);

  return {
    data,
    loading,
    error,
    retry,
    fetchData: () => {
      setShouldFetch(true);
      return Promise.resolve();
    }
  };
};

export default useApiConnection;