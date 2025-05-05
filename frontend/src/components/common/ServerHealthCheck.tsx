import React from 'react';
import useApiConnection from '../../hooks/useApiConnection';

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
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
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