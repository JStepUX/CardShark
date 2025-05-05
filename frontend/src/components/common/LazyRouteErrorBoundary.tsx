import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface LazyRouteErrorBoundaryProps {
  children: ReactNode;
  routeName?: string;
}

interface LazyRouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component specifically for handling errors in lazy-loaded routes
 * Provides a user-friendly error message with retry functionality
 */
class LazyRouteErrorBoundary extends Component<LazyRouteErrorBoundaryProps, LazyRouteErrorBoundaryState> {
  constructor(props: LazyRouteErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): LazyRouteErrorBoundaryState {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to an error reporting service
    console.error('LazyRouteErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { children, routeName } = this.props;
    const { hasError, error } = this.state;

    if (hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 min-h-[50vh] text-center">
          <div className="bg-stone-800 border border-red-700/30 rounded-lg p-6 max-w-md">
            <div className="flex items-center justify-center mb-4 text-red-400">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold mb-2 text-red-300">Failed to load {routeName || 'route'}</h2>
            <p className="text-stone-300 mb-4">
              There was a problem loading this view. This could be due to a network issue or a problem with the application.
            </p>
            {error && (
              <div className="bg-stone-900/50 p-3 rounded mb-4 text-left overflow-auto text-xs">
                <code className="text-red-400">{error.message}</code>
              </div>
            )}
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center justify-center gap-2 mx-auto"
            >
              <RefreshCw size={16} />
              <span>Retry</span>
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default LazyRouteErrorBoundary;