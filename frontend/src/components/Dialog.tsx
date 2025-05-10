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
  className?: string; // Added className prop
}

export function Dialog({ 
  isOpen, 
  onClose, 
  children, 
  title,
  buttons = [],
  showCloseButton = false,
  className = "max-w-md" // Default max width
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
          // Changed to flex layout to allow fixed footer
          className={`inline-block w-full ${className} my-8 text-left align-middle transition-all transform bg-stone-800 shadow-xl rounded-lg flex flex-col max-h-[calc(100vh-4rem)]`}
        >
          {/* Header */}
          {title && (
            <div className="px-6 py-4 border-b border-stone-700">
              <h2 id="dialog-title" className="text-lg font-semibold text-white">
                {title}
              </h2>
            </div>
          )}
          {/* Scrollable Content Area */}
          <div className="px-6 py-4 flex-grow overflow-y-auto">
            {children}
          </div>
          
          {/* Footer with Buttons */}
          {(buttons.length > 0 || showCloseButton) && (
            <div className="px-6 py-4 border-t border-stone-700 flex justify-end gap-2">
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
                  className="px-4 py-2 text-stone-300 hover:text-white hover:bg-stone-900 rounded-lg transition-colors"
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