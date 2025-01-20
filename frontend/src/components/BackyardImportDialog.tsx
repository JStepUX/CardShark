import { useState } from 'react';
import { Dialog } from './Dialog';
import { Link } from 'lucide-react';

interface BackyardImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (url: string) => Promise<void>;
}

export function BackyardImportDialog({ isOpen, onClose, onImport }: BackyardImportDialogProps) {
  const [url, setUrl] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleImport = async () => {
    if (!url.trim()) {
      setValidationError('Please enter a URL');
      return;
    }

    if (!url.startsWith('https://backyard.ai/hub/character/')) {
      setValidationError('Please enter a valid Backyard.ai character URL');
      return;
    }

    setValidationError('');
    setIsValidating(true);

    try {
      await onImport(url);
      setUrl('');
      onClose();
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Import from Backyard.ai"
      buttons={[
        {
          label: 'Cancel',
          onClick: onClose,
        },
        {
          label: isValidating ? 'Importing...' : 'Import',
          onClick: handleImport,
          variant: 'primary'
        }        
      ]}
      showCloseButton={false}
    >
      <div className="w-full space-y-4">
        {/* Main input container */}
        <div className="flex items-start w-full gap-2">
          <Link className="w-5 h-5 mt-1.5 flex-shrink-0" />
          <div className="flex-grow min-w-0"> {/* Add min-w-0 to prevent flex item from overflowing */}
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Backyard.ai Character URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setValidationError('');
              }}
              className="w-full px-3 py-2 bg-stone-950 border border-slate-700 
                       rounded-lg focus:ring-1 focus:ring-blue-500"
              placeholder="https://backyard.ai/hub/character/..."
              disabled={isValidating}
              autoFocus
            />
          </div>
        </div>

        {validationError && (
          <p className="text-red-500 text-sm">{validationError}</p>
        )}

        <p className="text-sm text-gray-400">
          Enter the URL of a Backyard.ai character to import their data and configuration.
        </p>
      </div>
    </Dialog>
  );
}