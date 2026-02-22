import React from 'react';
import { X, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import Button from './Button';

export type ErrorSeverity = 'error' | 'warning' | 'info';

interface ErrorMessageProps {
  message: string | null;
  severity?: ErrorSeverity;
  onDismiss?: () => void;
  className?: string;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  severity = 'error',
  onDismiss,
  className = ''
}) => {
  if (!message) return null;

  const getStyles = () => {
    switch (severity) {
      case 'error':
        return 'bg-red-900/50 border-red-700/60 text-red-200';
      case 'warning':
        return 'bg-orange-900/50 border-orange-700/60 text-orange-200';
      case 'info':
        return 'bg-blue-900/50 border-blue-700/60 text-blue-200';
      default:
        return 'bg-red-900/50 border-red-700/60 text-red-200';
    }
  };

  const getIcon = () => {
    switch (severity) {
      case 'error':
        return <AlertCircle size={18} />;
      case 'warning':
        return <AlertTriangle size={18} />;
      case 'info':
        return <Info size={18} />;
      default:
        return <AlertCircle size={18} />;
    }
  };

  return (
    <div className={`px-4 py-3 border rounded-md flex justify-between items-center text-sm ${getStyles()} ${className}`} role="alert">
      <div className="flex items-center gap-2">
        {getIcon()}
        <span>{message}</span>
      </div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="sm"
          pill
          icon={<X size={16} />}
          onClick={onDismiss}
          aria-label="Dismiss"
        />
      )}
    </div>
  );
};

export default ErrorMessage;
