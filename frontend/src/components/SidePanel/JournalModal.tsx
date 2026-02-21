import { BookOpen, RotateCcw } from 'lucide-react';
import { Dialog } from '../common/Dialog';
import { SessionNotes } from './SessionNotes';
import { DEFAULT_JOURNAL_ENTRY } from '../../contexts/ChatSessionContext';
import { useSettings } from '../../contexts/SettingsContext';

interface JournalModalProps {
  sessionNotes: string;
  setSessionNotes: (notes: string) => void;
  onClose: () => void;
}

export function JournalModal({ sessionNotes, setSessionNotes, onClose }: JournalModalProps) {
  const { settings } = useSettings();
  const effectiveDefault = settings.default_journal_entry ?? DEFAULT_JOURNAL_ENTRY;
  const isDefault = sessionNotes === effectiveDefault;

  return (
    <Dialog
      isOpen={true}
      onClose={onClose}
      title="Journal"
      icon={<BookOpen className="w-5 h-5 text-blue-400" />}
      showHeaderCloseButton={true}
      className="max-w-2xl w-full"
      backgroundColor="bg-[#1a1a1a]"
      borderColor="border-gray-800"
      backdropClassName="bg-black/85 backdrop-blur-sm"
      zIndex="z-[100]"
    >
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-300">Session Notes</h3>
          {!isDefault && (
            <button
              onClick={() => setSessionNotes(effectiveDefault)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              title="Reset to default instructions"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to default
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-4">
          These notes are injected into the AI's context and persist for this session.
          Use them to remind the AI of important details, preferences, or ongoing plot points.
          Supports <code className="text-gray-400">{`{{char}}`}</code> and <code className="text-gray-400">{`{{user}}`}</code> tokens.
        </p>
      </div>

      <SessionNotes
        value={sessionNotes}
        onChange={setSessionNotes}
      />
    </Dialog>
  );
}
