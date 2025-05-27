import React from 'react';
import LoadingSpinner from './LoadingSpinner';

/**
 * A fallback component for lazy-loaded routes
 * Shows a centered loading spinner with appropriate dimensions
 */
const RouteLoadingFallback: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-full min-h-[50vh]">
      <LoadingSpinner size="md" text="Loading view..." />
    </div>
  );
};

export default RouteLoadingFallback;