import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
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
  icon?: React.ReactNode; // Optional icon to display next to title
  buttons?: DialogButton[];
  showCloseButton?: boolean; // Show close button in footer
  showHeaderCloseButton?: boolean; // Show X button in header
  className?: string; // Added className prop
  backgroundColor?: string; // Custom background color (default: bg-stone-800)
  borderColor?: string; // Custom border color (default: border-stone-700)
  backdropClassName?: string; // Custom backdrop styling (default: bg-black/50)
  zIndex?: string; // Custom z-index (default: z-50)
}

export function Dialog({
  isOpen,
  onClose,
  children,
  title,
  icon,
  buttons = [],
  showCloseButton = false,
  showHeaderCloseButton = false,
  className = "max-w-md", // Default max width
  backgroundColor = "bg-stone-800",
  borderColor = "border-stone-700",
  backdropClassName = "bg-black/50",
  zIndex = "z-50"
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
      className={`fixed inset-0 ${zIndex} overflow-y-auto`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'dialog-title' : undefined}
    >
      <div className={`fixed inset-0 ${backdropClassName}`} onClick={onClose} />
      <div className="min-h-screen px-4 flex items-center justify-center">
        {/* The flex container now handles centering */}
        <div
          ref={dialogRef}
          // Changed to flex layout to allow fixed footer
          className={`${className} my-8 text-left transition-all transform ${backgroundColor} shadow-xl rounded-lg flex flex-col max-h-[calc(100vh-4rem)] performance-contain performance-transform`}
        >
          {/* Header */}
          {title && (
            <div className={`px-6 py-4 border-b ${borderColor} performance-contain flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                {icon}
                <h2 id="dialog-title" className="text-lg font-medium text-white">
                  {title}
                </h2>
              </div>
              {showHeaderCloseButton && (
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-stone-800 transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
          {/* Scrollable Content Area */}
          <div className="px-6 py-4 flex-grow overflow-y-auto performance-contain">
            {children}
          </div>

          {/* Footer with Buttons */}
          {(buttons.length > 0 || showCloseButton) && (
            <div className={`px-6 py-4 border-t ${borderColor} flex justify-end gap-2 performance-contain performance-transform`}>
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