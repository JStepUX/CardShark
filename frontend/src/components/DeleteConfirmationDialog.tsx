import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Dialog } from './Dialog'; // Import the generic Dialog component

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
  // If Dialog's button `label` prop only accepts string, we need to adjust.
  // Let's construct the delete button label with the loader if needed.
  const deleteButtonLabel = isDeleting ? (
    <span className="flex items-center gap-2">
      <Loader2 className="animate-spin h-4 w-4" />
      Deleting...
    </span>
  ) : (
    'Delete'
  );
  
  const buttons = [
    {
      label: 'Cancel',
      onClick: onCancel,
      variant: 'secondary' as 'secondary',
      disabled: isDeleting,
    },
    {
      label: deleteButtonLabel, // DialogButton.label now accepts React.ReactNode
      onClick: onConfirm,
      variant: 'primary' as 'primary', // Or a new 'danger' variant if added to Dialog
      disabled: isDeleting,
      className: "bg-red-700 hover:bg-red-600 text-white disabled:bg-red-700/50 disabled:text-white/70", // Apply custom styling
    },
  ];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      buttons={buttons} // Pass the buttons array directly
      className="max-w-md" // Retain similar width
    >
      <div className="flex items-start gap-4">
        <div className="p-2 bg-red-900/30 rounded-full">
          <AlertTriangle className="text-red-500 h-6 w-6" />
        </div>
        <div className="flex-1">
          {/* Title is handled by Dialog's title prop */}
          <p className="text-stone-300 mb-3">{description}</p>
          
          {itemName && (
            <div className="p-3 bg-stone-800 rounded mb-4 border border-stone-700 text-stone-300 overflow-hidden text-ellipsis">
              {itemName}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
};

export default DeleteConfirmationDialog;