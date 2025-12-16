import React from "react";
import CharacterGallery from "./character/CharacterGallery";

interface NpcSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (character: { name: string; path: string }) => void;
}

const NpcSelectorModal: React.FC<NpcSelectorModalProps> = ({ isOpen, onClose, onSelect }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
      <div className="bg-stone-950 rounded-lg shadow-lg w-full max-w-2xl p-6 relative">
        <button
          className="absolute top-3 right-3 text-gray-400 hover:text-orange-400 text-xl font-bold"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2 className="text-xl font-bold text-white mb-4">Select Character</h2>
        <div
          className="max-h-[60vh] overflow-y-auto"
          ref={containerRef}
        >
          <CharacterGallery
            onCharacterClick={onSelect}
            scrollContainerRef={containerRef}
            lazyLoad
          />
        </div>
      </div>
    </div>
  );
};

export default NpcSelectorModal;
