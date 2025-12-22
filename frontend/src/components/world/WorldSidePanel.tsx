import { Map, ChevronLeft, ChevronRight, Swords, Package, BookOpen, Scroll } from 'lucide-react';
import { NPCShowcase } from './NPCShowcase';
import { GridRoom, DisplayNPC } from '../../utils/worldStateApi';

interface WorldSidePanelProps {
  currentRoom: GridRoom | null;
  npcs: DisplayNPC[];
  activeNpcId?: string;
  onSelectNpc: (id: string) => void;
  onOpenMap: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  worldId: string;
}

export function WorldSidePanel({
  currentRoom,
  npcs,
  activeNpcId,
  onSelectNpc,
  onOpenMap,
  isCollapsed,
  onToggleCollapse,
  worldId,
}: WorldSidePanelProps) {
  if (isCollapsed) {
    return (
      <div className="w-12 bg-[#1a1a1a] border-l border-gray-800 flex flex-col items-center py-4">
        <button
          onClick={onToggleCollapse}
          className="text-gray-500 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-[#1a1a1a] border-l border-gray-800 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-4 py-4 flex items-start justify-between">
        <button
          onClick={onToggleCollapse}
          className="text-gray-500 hover:text-white transition-colors mr-2 flex-shrink-0"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-white truncate">
            {currentRoom ? currentRoom.name : 'No Room Selected'}
          </h2>
        </div>
      </div>

      {/* Room Image */}
      {currentRoom && (
        <div className="border-b border-gray-800 overflow-hidden">
          <div className="relative w-full aspect-video bg-[#0a0a0a]">
            {currentRoom.image_path ? (
              <img
                src={`/api/world-assets/${worldId}/${currentRoom.image_path.split('/').pop()}`}
                alt={currentRoom.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = '<div class="w-full h-full flex items-center justify-center text-gray-600 text-sm">No image available</div>';
                  }
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
                No image available
              </div>
            )}
          </div>
        </div>
      )}

      {/* NPC Showcase */}
      <NPCShowcase
        npcs={npcs}
        activeNpcId={activeNpcId}
        onSelectNpc={onSelectNpc}
      />

      {/* Map Button */}
      <div className="px-4 py-4 border-b border-gray-800">
        <button
          onClick={onOpenMap}
          className="w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3 transition-colors"
        >
          <Map className="w-5 h-5 text-blue-400" />
          <div className="text-left flex-1">
            <div className="text-sm text-white">World Map</div>
            <div className="text-xs text-gray-500">Navigate between rooms</div>
          </div>
        </button>
      </div>

      {/* Future Features - Placeholder */}
      <div className="px-4 py-4 flex-1">
        <h3 className="text-xs text-gray-600 uppercase tracking-wide mb-3">Coming Soon</h3>
        <div className="grid grid-cols-2 gap-2">
          <PlaceholderButton icon={Swords} label="Combat" />
          <PlaceholderButton icon={Package} label="Inventory" />
          <PlaceholderButton icon={BookOpen} label="Journal" />
          <PlaceholderButton icon={Scroll} label="Quests" />
        </div>
      </div>
    </div>
  );
}

function PlaceholderButton({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <button
      disabled
      className="bg-[#0a0a0a] border border-gray-800 rounded-lg px-3 py-3 flex flex-col items-center gap-2 opacity-50 cursor-not-allowed group"
      title="Coming Soon"
    >
      <Icon className="w-5 h-5 text-gray-600" />
      <span className="text-xs text-gray-600">{label}</span>
    </button>
  );
}