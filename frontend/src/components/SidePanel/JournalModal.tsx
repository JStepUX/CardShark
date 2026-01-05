import { BookOpen } from 'lucide-react';
import { Dialog } from '../common/Dialog';
import { SessionNotes } from './SessionNotes';

interface JournalModalProps {
  sessionNotes: string;
  setSessionNotes: (notes: string) => void;
  onClose: () => void;
}

export function JournalModal({ sessionNotes, setSessionNotes, onClose }: JournalModalProps) {
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
        <h3 className="text-sm font-medium text-gray-300 mb-2">Session Notes</h3>
        <p className="text-xs text-gray-500 mb-4">
          These notes are injected into the AI's context and persist for this session.
          Use them to remind the AI of important details, preferences, or ongoing plot points.
        </p>
      </div>

      <SessionNotes
        value={sessionNotes}
        onChange={setSessionNotes}
      />
    </Dialog>
  );
}
