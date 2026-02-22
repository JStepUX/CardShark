import React, { ErrorInfo, ReactNode } from 'react';
import Button from './Button';

interface ApiErrorBoundaryProps {
  /**
   * Child components that might throw API errors
   */
  children: ReactNode;
  
  /**
   * Component to render when an error occurs
   */
  fallback?: ReactNode | ((error: Error, resetError: () => void) => ReactNode);
  
  /**
   * Optional callback when an error occurs
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ApiErrorBoundaryState {
  /**
   * Whether an error has occurred
   */
  hasError: boolean;
  
  /**
   * The error that occurred
   */
  error: Error | null;
}

/**
 * An error boundary specifically designed for handling API errors
 * and providing graceful fallback UI
 */
class ApiErrorBoundary extends React.Component<ApiErrorBoundaryProps, ApiErrorBoundaryState> {
  constructor(props: ApiErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ApiErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error to console
    console.error('API Error Boundary caught an error:', error, errorInfo);
    
    // Call the onError callback if provided
    this.props.onError?.(error, errorInfo);
  }

  resetError = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Render fallback UI
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          // If fallback is a function, call it with error and resetError
          return this.props.fallback(this.state.error as Error, this.resetError);
        }
        // Otherwise, just render the fallback as is
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="p-4 border border-red-300 rounded bg-red-50 text-red-800">
          <h3 className="text-lg font-semibold mb-2">Something went wrong with the API</h3>
          <p className="mb-3">{this.state.error?.message || 'Unknown error'}</p>
          <Button
            variant="destructive"
            onClick={this.resetError}
          >
            Try Again
          </Button>
        </div>
      );
    }

    // If no error, render children normally
    return this.props.children;
  }
}

export default ApiErrorBoundary;