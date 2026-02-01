/**
 * @file TransitionProgress.tsx
 * @description Progress indicator for individual transition phases.
 *
 * Shows different states: pending, in_progress (with spinner), complete (checkmark),
 * or failed (error icon).
 */

import React from 'react';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import type { ProgressStatus } from '../../types/transition';

interface TransitionProgressProps {
  /** Label describing this progress step */
  label: string;
  /** Current status of this step */
  status: ProgressStatus;
  /** Whether this step is currently active */
  active?: boolean;
}

export const TransitionProgress: React.FC<TransitionProgressProps> = ({
  label,
  status,
  active = false,
}) => {
  const getStatusIcon = () => {
    switch (status.status) {
      case 'complete':
        return (
          <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
        );
      case 'failed':
        return (
          <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center">
            <AlertCircle className="w-3 h-3 text-white" />
          </div>
        );
      case 'in_progress':
        return (
          <div className="w-5 h-5 flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          </div>
        );
      case 'pending':
      default:
        return (
          <div className="w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-gray-400" />
          </div>
        );
    }
  };

  const getTextColor = () => {
    if (status.status === 'complete') return 'text-green-400';
    if (status.status === 'failed') return 'text-red-400';
    if (active || status.status === 'in_progress') return 'text-white';
    return 'text-gray-500';
  };

  return (
    <div className="flex items-center gap-3">
      {getStatusIcon()}
      <div className="flex-1">
        <div className={`text-sm font-medium ${getTextColor()}`}>
          {label}
        </div>
        {status.status === 'in_progress' && (
          <div className="mt-1">
            <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${status.percent}%` }}
              />
            </div>
          </div>
        )}
        {status.status === 'failed' && (
          <div className="text-xs text-red-400 mt-0.5">
            {status.error}
          </div>
        )}
      </div>
    </div>
  );
};
