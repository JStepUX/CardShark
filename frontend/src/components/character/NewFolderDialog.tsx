/**
 * @file NewFolderDialog.tsx
 * @description Dialog for creating a new gallery folder.
 */
import React, { useState } from 'react';
import { Dialog } from '../common/Dialog';
import { FolderPlus } from 'lucide-react';

interface NewFolderDialogProps {
  isOpen: boolean;
  existingNames: string[];
  onClose: () => void;
  onCreate: (name: string) => void;
}

const NewFolderDialog: React.FC<NewFolderDialogProps> = ({
  isOpen,
  existingNames,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');

  const trimmed = name.trim();
  const isDuplicate = existingNames.some(n => n.toLowerCase() === trimmed.toLowerCase());
  const isTooLong = trimmed.length > 50;
  const isValid = trimmed.length > 0 && !isDuplicate && !isTooLong;

  const handleSubmit = () => {
    if (!isValid) return;
    onCreate(trimmed);
    setName('');
    onClose();
  };

  const handleClose = () => {
    setName('');
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="New Folder"
      icon={<FolderPlus className="text-blue-400" size={20} />}
      buttons={[
        { label: 'Cancel', onClick: handleClose, variant: 'secondary' },
        { label: 'Create', onClick: handleSubmit, variant: 'primary', disabled: !isValid },
      ]}
    >
      <div className="flex flex-col gap-3">
        <label className="text-sm text-slate-300">Folder name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="My Custom Folder"
          maxLength={50}
          autoFocus
          className="w-full px-4 py-2 bg-stone-900 border border-stone-600 rounded-lg text-white
                     placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {isDuplicate && (
          <p className="text-xs text-red-400">A folder with this name already exists.</p>
        )}
        {isTooLong && (
          <p className="text-xs text-red-400">Folder name must be 50 characters or fewer.</p>
        )}
        <p className="text-xs text-slate-500">{trimmed.length}/50 characters</p>
      </div>
    </Dialog>
  );
};

export default NewFolderDialog;
