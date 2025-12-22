import { NPCCard } from './NPCCard';
import { Users } from 'lucide-react';
import { DisplayNPC } from '../../utils/worldStateApi';

interface NPCShowcaseProps {
  npcs: DisplayNPC[];
  activeNpcId?: string;
  onSelectNpc: (id: string) => void;
}

export function NPCShowcase({ npcs, activeNpcId, onSelectNpc }: NPCShowcaseProps) {
  if (npcs.length === 0) {
    return (
      <div className="py-8 px-4 text-center border-t border-b border-gray-800">
        <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No one else is here</p>
      </div>
    );
  }

  return (
    <div className="border-t border-b border-gray-800 bg-[#1a1a1a] py-4 px-3">
      <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-3">Present</h3>
      <div className="grid grid-cols-2 gap-3">
        {npcs.map((npc) => (
          <NPCCard
            key={npc.id}
            npc={npc}
            isActive={activeNpcId === npc.id}
            onClick={() => onSelectNpc(npc.id)}
          />
        ))}
      </div>
    </div>
  );
}
