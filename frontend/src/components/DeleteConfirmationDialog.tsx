import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  itemName?: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * A reusable confirmation dialog for delete operations
 * Displays a confirmation modal with customizable messages and loading state
 */
const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
  isOpen,
  title,
  description,
  itemName,
  isDeleting,
  onCancel,
  onConfirm
}) => {
  if (!isOpen) return null;

  // Prevent clicks on the modal from propagating to elements underneath
  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onCancel} // Close when clicking the backdrop
    >
      <div 
        className="bg-stone-900 rounded-lg shadow-lg max-w-md w-full p-6 border border-stone-700"
        onClick={handleModalClick} // Prevent clicks from reaching the backdrop
      >
        <div className="flex items-start gap-4">
          <div className="p-2 bg-red-900/30 rounded-full">
            <AlertTriangle className="text-red-500 h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
            <p className="text-stone-300 mb-3">{description}</p>
            
            {itemName && (
              <div className="p-3 bg-stone-800 rounded mb-4 border border-stone-700 text-stone-300 overflow-hidden text-ellipsis">
                {itemName}
              </div>
            )}
            
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors"
                onClick={onCancel}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg flex items-center gap-2 transition-colors"
                onClick={onConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmationDialog;