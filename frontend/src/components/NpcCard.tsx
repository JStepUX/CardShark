import React, { useState } from 'react';
import { NpcGridItem } from '../types/worldState';
import { User } from 'lucide-react'; // Placeholder icon

interface NpcCardProps {
  npc: NpcGridItem;
  onClick: (npc: NpcGridItem) => void;
}

const NpcCard: React.FC<NpcCardProps> = ({ npc, onClick }) => {
  const [imageError, setImageError] = useState(false);
  
  // Generate image URL based on the character path
  // The path is expected to be the full path to the character PNG file
  const imageUrl = npc.path ? `/api/character-image/${encodeURIComponent(npc.path)}` : null;

  return (
    <div
      className="relative group cursor-pointer rounded-lg overflow-hidden shadow-lg bg-stone-800 aspect-[3/5] transition-all duration-200 ease-in-out hover:shadow-xl hover:scale-[1.02]"
      onClick={() => onClick(npc)}
      role="button"
      tabIndex={0}
      aria-label={`Select NPC ${npc.name}`}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(npc); }}
    >
      {/* Image Area */}
      <div className="w-full h-full bg-stone-950 flex items-center justify-center">
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={npc.name}
            className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center">
            <User className="w-1/3 h-1/3 text-stone-600" />
            <span className="text-stone-500 text-xs text-center px-2 mt-2">{npc.name}</span>
          </div>
        )}
      </div>

      {/* Name Overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-2 pt-6 text-white text-sm font-medium truncate rounded-b-lg">
        {npc.name}
      </div>
    </div>
  );
};

export default NpcCard;