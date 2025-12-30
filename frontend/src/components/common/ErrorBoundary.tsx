import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Props for the ErrorBoundary component
 */
interface ErrorBoundaryProps {
    /** The children to render when there's no error */
    children: ReactNode;
    /** Optional custom fallback UI to render when an error occurs */
    fallback?: ReactNode;
    /** Optional callback when an error is caught */
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    /** Optional callback to reset the error state from parent */
    onReset?: () => void;
}

/**
 * State for the ErrorBoundary component
 */
interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

/**
 * A reusable React Error Boundary component that catches JavaScript errors
 * anywhere in the child component tree and displays a fallback UI.
 *
 * @example
 * // Basic usage with default fallback
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * @example
 * // With custom fallback UI
 * <ErrorBoundary fallback={<CustomErrorDisplay />}>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * @example
 * // With error callback for logging
 * <ErrorBoundary
 *   onError={(error) => logErrorToService(error)}
 *   fallback={<ErrorDisplay />}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
        };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return {
            hasError: true,
            error,
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.props.onError?.(error, errorInfo);
    }

    /**
     * Reset the error state to allow retrying
     */
    handleReset = (): void => {
        this.setState({ hasError: false, error: null });
        this.props.onReset?.();
    };

    render(): ReactNode {
        const { hasError, error } = this.state;
        const { children, fallback } = this.props;

        if (hasError) {
            // Use custom fallback if provided
            if (fallback) {
                return fallback;
            }

            // Default fallback UI
            return (
                <div className="flex items-center justify-center min-h-[300px] bg-red-900/20 rounded-lg m-4">
                    <div className="text-center p-6 max-w-md">
                        <div className="flex items-center justify-center mb-4 text-red-400">
                            <AlertTriangle size={48} />
                        </div>
                        <h3 className="text-lg font-medium text-red-400 mb-2">Something went wrong</h3>
                        {error && (
                            <p className="text-sm text-gray-400 mb-4 break-words">{error.message}</p>
                        )}
                        <button
                            onClick={this.handleReset}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white flex items-center gap-2 mx-auto transition-colors"
                        >
                            <RefreshCw size={16} />
                            <span>Try Again</span>
                        </button>
                    </div>
                </div>
            );
        }

        return children;
    }
}

export default ErrorBoundary;
