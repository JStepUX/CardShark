import { X, BookOpen } from 'lucide-react';
import { SessionNotes } from './SessionNotes';

interface JournalModalProps {
  sessionNotes: string;
  setSessionNotes: (notes: string) => void;
  onClose: () => void;
}

export function JournalModal({ sessionNotes, setSessionNotes, onClose }: JournalModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[100] p-8"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a1a] rounded-xl border border-gray-700 shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-medium text-white">Journal</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-stone-800 transition-colors"
            title="Close journal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
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
        </div>
      </div>
    </div>
  );
}
