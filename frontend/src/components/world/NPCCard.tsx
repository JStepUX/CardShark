import { ImageWithFallback } from '../shared/ImageWithFallback';
import { DisplayNPC } from '../../utils/worldStateApi';
import { Skull } from 'lucide-react';

interface NPCCardProps {
  npc: DisplayNPC & { hostile?: boolean; monster_level?: number };
  isActive: boolean;
  onClick: () => void;
}

export function NPCCard({ npc, isActive, onClick }: NPCCardProps) {
  const isHostile = npc.hostile || false;

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-2 p-2 rounded-lg transition-all hover:bg-[#2a2a2a] ${isActive
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

      <span className={`text-xs truncate max-w-[80px] ${isHostile ? 'text-red-400 font-medium' : 'text-gray-300'
        }`} title={npc.name}>
        {npc.name}
      </span>
    </button>
  );
}
