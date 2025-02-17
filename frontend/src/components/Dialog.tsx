import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DialogButton {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  buttons?: DialogButton[];
  showCloseButton?: boolean;
}

export function Dialog({ 
  isOpen, 
  onClose, 
  children, 
  title,
  buttons = [],
  showCloseButton = true 
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'dialog-title' : undefined}
    >
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="min-h-screen px-4 text-center">
        <div className="fixed inset-0" aria-hidden="true">
          <div className="inline-block h-screen align-middle" aria-hidden="true">
            &#8203;
          </div>
        </div>
        <div
          ref={dialogRef}
          className="inline-block w-full max-w-md p-6 my-8 text-left align-middle transition-all transform bg-gray-800 shadow-xl rounded-lg"
        >
          {title && (
            <h2 id="dialog-title" className="text-lg font-semibold text-white mb-4">
              {title}
            </h2>
          )}
          {children}
          
          {(buttons.length > 0 || showCloseButton) && (
            <div className="mt-6 flex justify-end gap-2">
              {buttons.map((button, index) => (
                <button
                  key={index}
                  onClick={button.onClick}
                  disabled={button.disabled}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    button.variant === 'primary'
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'text-gray-300 hover:text-white hover:bg-gray-700'
                  } ${button.disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                >
                  {button.label}
                </button>
              ))}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}