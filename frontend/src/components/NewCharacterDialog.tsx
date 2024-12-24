import { Dialog } from './Dialog';
import { useState } from 'react';

interface NewCharacterDialogProps {
  isOpen: boolean;
  onDiscard: () => void;
  onNewCharacter: () => void;
}

export function NewCharacterDialog({ 
  isOpen, 
  onDiscard, 
  onNewCharacter 
}: NewCharacterDialogProps) {
  const [name, setName] = useState('');

  const handleCreate = () => {
    if (name.trim()) {
      onNewCharacter();
      setName('');
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onDiscard}
      title="Create New Character"
      buttons={[
        {
          label: 'Create',
          onClick: handleCreate,
          variant: 'primary'
        },
        {
          label: 'Cancel',
          onClick: onDiscard,
        }
      ]}
      showCloseButton={false}
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-300">
            Character Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 
                     text-white focus:border-blue-500 focus:ring-blue-500"
            placeholder="Enter character name"
            autoFocus
          />
        </div>
      </div>
    </Dialog>
  );
}
