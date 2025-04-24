import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Dialog } from './Dialog';

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
 * A reusable deletion confirmation dialog component
 * Provides consistent UI for confirming deletions across the application
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
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      className="max-w-md"
      buttons={[
        {
          label: 'Cancel',
          onClick: onCancel,
          variant: 'secondary',
          disabled: isDeleting
        },
        {
          label: isDeleting ? 'Deleting...' : 'Delete',
          onClick: onConfirm,
          variant: 'primary',
          disabled: isDeleting
        }
      ]}
    >
      <div className="flex items-start">
        <div className="mr-4 flex-shrink-0 bg-red-900/30 p-3 rounded-full">
          <AlertCircle className="text-red-500 w-6 h-6" />
        </div>
        <div>
          <p className="text-gray-300">
            {description}
            {itemName && <span className="font-semibold"> "{itemName}"</span>}?
          </p>
          {isDeleting && (
            <div className="mt-4 flex items-center">
              <div className="animate-spin h-4 w-4 mr-2 border-t-2 border-b-2 border-white rounded-full"></div>
              <span className="text-gray-400">This may take a moment...</span>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
};

export default DeleteConfirmationDialog;