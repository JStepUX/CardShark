// frontend/src/components/CharacterCard.tsx
import React from "react";

interface CharacterCardProps {
  character: {
    name: string;
    path: string;
    size: number;
    modified: number;
  };
  onClick?: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
  confirmDelete?: boolean;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ character, onClick, onDelete, isDeleting, confirmDelete }) => {
  return (
    <div
      className={`rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-stone-900 p-4 flex flex-col gap-2 shadow hover:shadow-md transition cursor-pointer ${isDeleting ? 'opacity-50' : ''}`}
      onClick={onClick}
    >
      <div className="w-full h-32 bg-slate-200 dark:bg-stone-800 rounded mb-2 flex items-center justify-center text-slate-400 text-4xl">
        {/* You can replace with image preview logic if available */}
        <span role="img" aria-label="character">🧑‍🎤</span>
      </div>
      <div className="font-semibold text-lg text-slate-800 dark:text-slate-100">
        {character.name}
      </div>
      <div className="text-slate-600 dark:text-slate-300 text-xs">
        Size: {Math.round(character.size / 1024)} KB
      </div>
      <div className="text-slate-500 dark:text-slate-400 text-xs">
        Modified: {new Date(character.modified).toLocaleString()}
      </div>
      {onDelete && (
        <button
          className="btn btn-sm btn-error mt-2"
          onClick={e => { e.stopPropagation(); onDelete(); }}
        >
          {confirmDelete ? "Confirm Delete" : "Delete"}
        </button>
      )}
    </div>
  );
};

export default CharacterCard;
