/**
 * @file FolderDeleteConfirmationDialog.tsx
 * @description Confirmation dialog for deleting a gallery folder.
 */
import React from 'react';
import { Dialog } from './Dialog';
import { Trash2, AlertTriangle } from 'lucide-react';

interface FolderDeleteConfirmationDialogProps {
  isOpen: boolean;
  folderName: string;
  cardCount: number;
  onClose: () => void;
  onDeleteContents: () => void;
  onDumpToGallery: () => void;
}

const FolderDeleteConfirmationDialog: React.FC<FolderDeleteConfirmationDialogProps> = ({
  isOpen,
  folderName,
  cardCount,
  onClose,
  onDeleteContents,
  onDumpToGallery,
}) => {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Folder"
      icon={<AlertTriangle className="text-amber-400" size={20} />}
      buttons={[
        { label: 'Cancel', onClick: onClose, variant: 'secondary' },
        {
          label: (
            <span className="flex items-center gap-1.5">
              <Trash2 size={14} /> Move to Gallery
            </span>
          ),
          onClick: onDumpToGallery,
          variant: 'primary',
        },
        {
          label: (
            <span className="flex items-center gap-1.5">
              <Trash2 size={14} /> Delete All
            </span>
          ),
          onClick: onDeleteContents,
          variant: 'primary',
          className: 'bg-red-600 hover:bg-red-700',
        },
      ]}
    >
      <div className="flex flex-col gap-3">
        <p className="text-slate-300">
          Are you sure you want to delete the folder <strong className="text-white">"{folderName}"</strong>?
        </p>
        {cardCount > 0 && (
          <p className="text-sm text-slate-400">
            This folder contains <strong className="text-amber-300">{cardCount}</strong> {cardCount === 1 ? 'card' : 'cards'}.
          </p>
        )}
        <div className="mt-2 p-3 bg-stone-900 rounded-lg border border-stone-700 text-sm text-slate-400 space-y-1.5">
          <p><strong className="text-slate-200">Move to Gallery:</strong> Cards become unfiled and remain accessible.</p>
          <p><strong className="text-red-300">Delete All:</strong> Cards are unfiled. Delete them separately if needed.</p>
        </div>
      </div>
    </Dialog>
  );
};

export default FolderDeleteConfirmationDialog;
