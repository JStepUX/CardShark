import { Dialog } from '../common/Dialog';
import { FileQuestion, Plus } from 'lucide-react';

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
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onDiscard}
      title="No Character Data Found"
      icon={<FileQuestion className="w-6 h-6 text-orange-400" />}
      buttons={[
        {
          label: 'Cancel',
          onClick: onDiscard,
        },
        {
          label: (
            <span className="flex items-center gap-2">
              <Plus size={16} />
              Create New Character
            </span>
          ),
          onClick: onNewCharacter,
          variant: 'primary',
          className: 'bg-orange-600 hover:bg-orange-700 focus:ring-orange-500'
        }
      ]}
      showCloseButton={false}
      className="max-w-lg"
    >
      <div className="space-y-4">
        <div className="text-gray-300 space-y-3">
          <p>
            This image doesn't contain any character metadata. Would you like to create a new character using this image?
          </p>
          <div className="bg-stone-900/50 border border-stone-700 rounded-lg p-4">
            <p className="text-sm text-gray-400">
              <span className="font-semibold text-orange-400">What happens next:</span>
            </p>
            <ul className="mt-2 text-sm text-gray-400 space-y-1 list-disc list-inside">
              <li>A new character template will be created</li>
              <li>Your image will be used as the character portrait</li>
              <li>You'll be taken to the editor to fill in character details</li>
            </ul>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
