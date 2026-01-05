import React from "react";
import { Dialog } from "./common/Dialog";
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
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Select Character"
      showHeaderCloseButton={true}
      className="max-w-2xl w-full"
      backgroundColor="bg-stone-950"
    >
      <div
        className="max-h-[60vh] overflow-y-auto -mx-6 px-6"
        ref={containerRef}
      >
        <CharacterGallery
          onCharacterClick={onSelect}
          scrollContainerRef={containerRef}
          lazyLoad
        />
      </div>
    </Dialog>
  );
};

export default NpcSelectorModal;
