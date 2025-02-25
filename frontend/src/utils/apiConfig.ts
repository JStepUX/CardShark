// utils/apiConfig.ts
/**
 * Returns the base URL for API requests, handling both development and production environments
 */
export function getApiBaseUrl(): string {
  // Check if we're in development or production
  const isDevelopment = window.location.port === '6969';
  
  if (isDevelopment) {
    // In development, the backend is on port 9696
    return 'http://localhost:9696';
  }
  
  // In production (PyInstaller), everything is on the same origin
  return '';
}