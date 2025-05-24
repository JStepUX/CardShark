import React from 'react';
import useApiConnection from '../../hooks/useApiConnection';
import LoadingSpinner from './LoadingSpinner'; // Added

interface ServerHealthResponse {
  status: string;
  version: string;
}

interface ServerHealthCheckProps {
  /**
   * Optional callback when server becomes available
   */
  onServerAvailable?: () => void;
  
  /**
   * Optional callback when server becomes unavailable after repeated failures
   */
  onServerUnavailable?: (error: Error) => void;
  
  /**
   * Path for the health check endpoint
   * @default '/api/health'
   */
  healthEndpoint?: string;
  
  /**
   * Number of retry attempts
   * @default 5
   */
  retryCount?: number;
  
  /**
   * Delay between retries in milliseconds
   * @default 2000
   */
  retryDelay?: number;
}

/**
 * Component that monitors the backend server health and shows appropriate status banners
 */
const ServerHealthCheck: React.FC<ServerHealthCheckProps> = ({
  onServerAvailable,
  onServerUnavailable,
  healthEndpoint = '/api/health',
  retryCount = 5,
  retryDelay = 2000
}) => {
  const { data, loading, error, retry } = useApiConnection<ServerHealthResponse>({
    endpoint: healthEndpoint,
    retryCount,
    retryDelay,
    onSuccess: () => {
      onServerAvailable?.();
    },
    onError: (err) => {
      onServerUnavailable?.(err);
    }
  });

  if (loading && !data) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-blue-600 text-white p-2 text-center z-50">
        <div className="flex items-center justify-center">
          <LoadingSpinner size="sm" className="mr-3 -ml-1" />
          Connecting to server...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-red-600 text-white p-3 text-center z-50">
        <div className="flex items-center justify-center">
          <svg className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Server connection error: {error.message}
          <button 
            onClick={retry}
            className="ml-4 px-3 py-1 bg-white text-red-600 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Retry connection"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    data?.status !== 'ok' ? (
      <div className="fixed bottom-0 left-0 right-0 bg-orange-500 text-white p-2 text-center z-50">
        <div className="flex items-center justify-center">
          <svg className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Server reported abnormal status
          <button 
            onClick={retry}
            className="ml-4 px-3 py-1 bg-white text-orange-600 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Check server status again"
          >
            Check Again
          </button>
        </div>
      </div>
    ) : null
  );
};

export default ServerHealthCheck;