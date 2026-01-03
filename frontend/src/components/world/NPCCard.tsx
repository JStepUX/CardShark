import { ImageWithFallback } from '../shared/ImageWithFallback';
import { DisplayNPC } from '../../utils/worldStateApi';
import { Skull, Link } from 'lucide-react';

interface NPCCardProps {
  npc: DisplayNPC & { hostile?: boolean; monster_level?: number };
  isActive: boolean;
  onClick: () => void;
  onDismiss?: () => void;
}

export function NPCCard({ npc, isActive, onClick, onDismiss }: NPCCardProps) {
  const isHostile = npc.hostile || false;
  const isBound = isActive && !isHostile;

  return (
    <button
      onClick={onClick}
      disabled={isBound} // Prevent re-clicking bound allies
      className={`relative flex flex-col items-center gap-2 p-2 rounded-lg transition-all ${isBound
          ? 'cursor-default bg-[#2a2a2a]' // Bound ally - no hover effect
          : 'hover:bg-[#2a2a2a]' // Normal hover
        } ${isActive
          ? isHostile
            ? 'ring-2 ring-red-500 bg-[#2a2a2a]'
            : 'ring-2 ring-blue-500 bg-[#2a2a2a]'
          : ''
        }`}
    >
      <div className={`w-16 h-16 rounded-full overflow-hidden border-2 transition-colors ${isHostile
        ? isActive
          ? 'border-red-500 shadow-lg shadow-red-500/50'
          : 'border-red-600 hover:border-red-500'
        : isActive
          ? 'border-blue-500'
          : 'border-gray-700 hover:border-gray-500'
        }`}>
        <ImageWithFallback
          src={npc.imageUrl}
          alt={npc.name}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Hostile indicator badge */}
      {isHostile && (
        <div className="absolute top-1 right-1 bg-red-600 rounded-full p-1" title="Hostile">
          <Skull className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Bound ally indicator badge */}
      {isBound && (
        <div className="absolute top-1 right-1 bg-blue-600 rounded-full p-1" title="Bound to you">
          <Link className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Dismiss button for bound allies */}
      {isBound && onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation(); // Prevent triggering the card's onClick
            onDismiss();
          }}
          className="absolute top-1 left-1 bg-gray-700 hover:bg-gray-600 rounded-full p-1 transition-colors"
          title="Dismiss"
        >
          <span className="text-white text-xs leading-none">×</span>
        </button>
      )}

      <span className={`text-xs truncate max-w-[80px] ${isHostile ? 'text-red-400 font-medium' : isBound ? 'text-blue-400 font-medium' : 'text-gray-300'
        }`} title={npc.name}>
        {npc.name}
      </span>
    </button>
  );
}
