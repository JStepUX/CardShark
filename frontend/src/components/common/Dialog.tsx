import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';

interface DialogButton {
  label: React.ReactNode; // Changed from string to React.ReactNode
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  className?: string; // Added optional className for custom button styling
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
      <div className="min-h-screen px-4 flex items-center justify-center">
        {/* The flex container now handles centering */}
        <div
          ref={dialogRef}
          // Changed to flex layout to allow fixed footer
          className={`${className} my-8 text-left transition-all transform bg-stone-800 shadow-xl rounded-lg flex flex-col max-h-[calc(100vh-4rem)] performance-contain performance-transform`}
        >
          {/* Header */}
          {title && (
            <div className="px-6 py-4 border-b border-stone-700 performance-contain">
              <h2 id="dialog-title" className="text-lg font-semibold text-white">
                {title}
              </h2>
            </div>
          )}
          {/* Scrollable Content Area */}
          <div className="px-6 py-4 flex-grow overflow-y-auto performance-contain">
            {children}
          </div>

          {/* Footer with Buttons */}
          {(buttons.length > 0 || showCloseButton) && (
            <div className="px-6 py-4 border-t border-stone-700 flex justify-end gap-2 performance-contain performance-transform">
              {buttons.map((button, index) => {
                let buttonPropsVariant: 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost' = 'primary';
                let buttonPropsClassName = button.className || '';

                if (button.variant === 'primary') {
                  if (button.className && (button.className.includes('bg-red-500') || button.className.includes('bg-red-600'))) {
                    buttonPropsVariant = 'destructive';
                    buttonPropsClassName = buttonPropsClassName
                      .replace(/bg-red-\d00\s?/g, '')
                      .replace(/hover:bg-red-\d00\s?/g, '')
                      .trim();
                  } else {
                    buttonPropsVariant = 'primary';
                  }
                } else { // Handles 'secondary' or undefined from DialogButton interface
                  buttonPropsVariant = 'ghost';
                  buttonPropsClassName = `text-gray-300 hover:text-white hover:bg-stone-700 ${buttonPropsClassName}`.trim();
                }

                return (
                  <Button
                    key={index}
                    onClick={button.onClick}
                    disabled={button.disabled}
                    variant={buttonPropsVariant}
                    size="md"
                    className={buttonPropsClassName}
                  >
                    {button.label}
                  </Button>
                );
              })}
              {showCloseButton && (
                <Button
                  onClick={onClose}
                  variant="ghost"
                  size="md"
                  className="text-stone-300 hover:text-white hover:bg-stone-900"
                >
                  Close
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}