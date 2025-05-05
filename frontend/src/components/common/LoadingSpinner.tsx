import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

/**
 * A reusable loading spinner component to display during async operations
 * Used as a fallback for React.lazy() component loading
 */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  message = 'Loading...' 
}) => {
  // Size mapping
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-4',
    lg: 'w-12 h-12 border-4'
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div 
        className={`${sizeClasses[size]} border-stone-600 border-t-orange-500 rounded-full animate-spin`} 
        role="status"
        aria-label="Loading content"
      />
      {message && (
        <span className="mt-2 text-stone-400">{message}</span>
      )}
    </div>
  );
};

export default LoadingSpinner;