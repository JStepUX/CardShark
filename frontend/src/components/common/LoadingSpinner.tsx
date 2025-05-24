import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | number;
  text?: string;
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md', // Default size
  text,
  className,
}) => {
  let iconSizeClasses = '';
  let textSizeClasses = '';
  let style: React.CSSProperties = {};

  if (typeof size === 'number') {
    style = { height: `${size}px`, width: `${size}px` };
    // Default text size if icon size is numeric, can be adjusted
    textSizeClasses = 'text-sm'; 
  } else {
    switch (size) {
      case 'sm':
        iconSizeClasses = 'h-4 w-4';
        textSizeClasses = 'text-xs';
        break;
      case 'lg':
        iconSizeClasses = 'h-8 w-8';
        textSizeClasses = 'text-base';
        break;
      case 'md':
      default:
        iconSizeClasses = 'h-6 w-6';
        textSizeClasses = 'text-sm';
        break;
    }
  }

  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center ${className || ''}`}
      aria-live="polite"
      aria-label={text ? undefined : "Loading"}
    >
      <Loader2
        className={`animate-spin ${iconSizeClasses}`}
        style={style}
        aria-hidden="true"
      />
      {text && (
        <span className={`mt-2 ${textSizeClasses}`} aria-atomic="true">
          {text}
        </span>
      )}
    </div>
  );
};

export default LoadingSpinner;

/*
Example Usage:

// Default size
<LoadingSpinner />

// Small size with text
<LoadingSpinner size="sm" text="Loading data..." />

// Large size
<LoadingSpinner size="lg" />

// Custom pixel size
<LoadingSpinner size={32} text="Processing..." />

// With additional custom classes
<LoadingSpinner className="text-blue-500" text="Please wait" />
*/