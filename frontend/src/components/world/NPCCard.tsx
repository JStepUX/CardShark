import { ImageWithFallback } from '../shared/ImageWithFallback';
import { DisplayNPC } from '../../utils/worldStateApi';

interface NPCCardProps {
  npc: DisplayNPC;
  isActive: boolean;
  onClick: () => void;
}

export function NPCCard({ npc, isActive, onClick }: NPCCardProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-2 rounded-lg transition-all hover:bg-[#2a2a2a] ${isActive ? 'ring-2 ring-blue-500 bg-[#2a2a2a]' : ''
        }`}
    >
      <div className={`w-16 h-16 rounded-full overflow-hidden border-2 transition-colors ${isActive ? 'border-blue-500' : 'border-gray-700 hover:border-gray-500'
        }`}>
        <ImageWithFallback
          src={npc.imageUrl}
          alt={npc.name}
          className="w-full h-full object-cover"
        />
      </div>
      <span className="text-xs text-gray-300 truncate max-w-[80px]" title={npc.name}>
        {npc.name}
      </span>
    </button>
  );
}
