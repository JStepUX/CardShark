import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import Button from '../common/Button';

/**
 * Props for the WorldLoadError component
 */
interface WorldLoadErrorProps {
    /** The title to display (e.g., "World Load Error", "World Play Error") */
    title: string;
    /** The error message or description to show */
    message: string;
    /** Optional callback for retry button */
    onRetry?: () => void;
    /** Optional callback for back button */
    onBack?: () => void;
}

/**
 * A full-page error display component specifically designed for World components.
 *
 * Used when world loading fails catastrophically (e.g., world not found,
 * network error, invalid data). Provides retry and navigation options.
 *
 * @example
 * <WorldLoadError
 *   title="World Not Found"
 *   message="The world you're looking for doesn't exist or has been deleted."
 *   onRetry={() => window.location.reload()}
 *   onBack={() => navigate(-1)}
 * />
 *
 * @example
 * // Used as ErrorBoundary fallback
 * <ErrorBoundary
 *   fallback={
 *     <WorldLoadError
 *       title="World Play Error"
 *       message="Something went wrong while loading the world."
 *       onBack={() => navigate(-1)}
 *     />
 *   }
 * >
 *   <WorldPlayView />
 * </ErrorBoundary>
 */
export function WorldLoadError({
    title,
    message,
    onRetry,
    onBack,
}: WorldLoadErrorProps) {
    return (
        <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-white">
            <div className="text-center max-w-md p-6">
                {/* Icon */}
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-900/50 flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                </div>

                {/* Title */}
                <h2 className="text-xl font-medium text-red-400 mb-2">{title}</h2>

                {/* Message */}
                <p className="text-gray-400 mb-6">{message}</p>

                {/* Action Buttons */}
                <div className="flex gap-3 justify-center">
                    {onRetry && (
                        <Button
                            variant="primary"
                            size="lg"
                            onClick={onRetry}
                            icon={<RefreshCw size={16} />}
                            className="!bg-purple-600 hover:!bg-purple-700"
                        >
                            Retry
                        </Button>
                    )}
                    {onBack && (
                        <Button
                            variant="secondary"
                            size="lg"
                            onClick={onBack}
                            icon={<ArrowLeft size={16} />}
                        >
                            Go Back
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default WorldLoadError;
