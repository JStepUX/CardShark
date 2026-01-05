import { Map as MapIcon, Users, Skull } from 'lucide-react';
import { Dialog } from '../common/Dialog';
import { GridWorldState, GridRoom } from '../../utils/worldStateApi';

interface MapModalProps {
  worldData: GridWorldState;
  currentRoomId: string | null;
  onNavigate: (roomId: string) => void;
  onClose: () => void;
}

export function MapModal({ worldData, currentRoomId, onNavigate, onClose }: MapModalProps) {
  const gridSize = { width: 8, height: 6 };

  // Build a lookup for rooms by position
  const roomsByPosition = new Map<string, GridRoom>();
  worldData.grid.forEach((row, y) => {
    row.forEach((room, x) => {
      if (room) {
        roomsByPosition.set(`${x},${y}`, room);
      }
    });
  });

  const currentRoom = currentRoomId
    ? Array.from(roomsByPosition.values()).find(r => r.id === currentRoomId)
    : null;

  const isRoomAccessible = (room: GridRoom) => {
    if (!currentRoom) return true; // Allow travel if no current room
    if (room.id === currentRoomId) return false; // Can't travel to current room

    // Fast travel mode: all rooms are accessible!
    return true;
  };

  // Helper to count NPCs and check for hostiles
  const getRoomNpcInfo = (room: GridRoom) => {
    const npcs = room.npcs || [];
    const totalCount = npcs.length;
    const hostileCount = npcs.filter(npc => npc.hostile).length;
    return { totalCount, hostileCount, hasHostile: hostileCount > 0 };
  };

  return (
    <Dialog
      isOpen={true}
      onClose={onClose}
      title={worldData.metadata.name}
      icon={<MapIcon className="w-5 h-5 text-blue-400" />}
      showHeaderCloseButton={true}
      className="max-w-5xl w-full"
      backgroundColor="bg-[#1a1a1a]"
      borderColor="border-gray-800"
      backdropClassName="bg-black/85 backdrop-blur-sm"
      zIndex="z-[100]"
    >
      {/* Grid */}
      <div className="p-2">
          <div className="inline-block border border-gray-800 bg-[#0a0a0a]">
            {Array.from({ length: gridSize.height }).map((_, y) => (
              <div key={y} className="flex">
                {Array.from({ length: gridSize.width }).map((_, x) => {
                  const room = roomsByPosition.get(`${x},${y}`);
                  const isCurrentRoom = room?.id === currentRoomId;
                  const isAccessible = room ? isRoomAccessible(room) : false;
                  const npcInfo = room ? getRoomNpcInfo(room) : null;

                  return (
                    <div
                      key={`${x},${y}`}
                      className={`w-24 h-24 border border-gray-800 flex flex-col items-center justify-center relative transition-all ${room
                        ? isCurrentRoom
                          ? 'bg-blue-600/20 border-blue-500'
                          : isAccessible
                            ? 'bg-[#2a2a2a] hover:bg-[#3a3a3a] hover:scale-105 cursor-pointer hover:border-gray-600'
                            : 'bg-[#1a1a1a]'
                        : 'bg-[#0a0a0a]'
                        }`}
                      onClick={() => {
                        if (room && isAccessible) {
                          onNavigate(room.id);
                          onClose();
                        }
                      }}
                      title={room ? `${room.name}${npcInfo?.totalCount ? ` - ${npcInfo.totalCount} NPC(s)` : ''}${npcInfo?.hasHostile ? ' (Hostile!)' : ''}` : ''}
                    >
                      {room && (
                        <>
                          {/* Room Name */}
                          <p className="text-xs text-white truncate text-center px-1 max-w-full">{room.name}</p>

                          {/* Current Room Indicator */}
                          {isCurrentRoom && (
                            <p className="text-[10px] text-blue-400 mt-0.5">You are here</p>
                          )}

                          {/* NPC Indicators */}
                          {npcInfo && npcInfo.totalCount > 0 && (
                            <div className="flex items-center gap-1.5 mt-1">
                              {/* Friendly NPCs (non-hostile) */}
                              {npcInfo.totalCount - npcInfo.hostileCount > 0 && (
                                <div className="flex items-center gap-0.5" title={`${npcInfo.totalCount - npcInfo.hostileCount} friendly NPC(s)`}>
                                  <Users className="w-3 h-3 text-blue-400" />
                                  <span className="text-[10px] text-blue-400">{npcInfo.totalCount - npcInfo.hostileCount}</span>
                                </div>
                              )}
                              {/* Hostile NPCs */}
                              {npcInfo.hasHostile && (
                                <div className="flex items-center gap-0.5" title={`${npcInfo.hostileCount} hostile NPC(s)`}>
                                  <Skull className="w-3 h-3 text-red-500" />
                                  <span className="text-[10px] text-red-500">{npcInfo.hostileCount}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Current Room Border Animation */}
                          {isCurrentRoom && (
                            <div className="absolute inset-0 border-2 border-blue-500 rounded-sm animate-pulse pointer-events-none" />
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
      </div>

      {/* Legend */}
      <div className="border-t border-gray-800 px-6 py-4 flex flex-wrap gap-x-6 gap-y-2 text-xs mt-2">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-600/20 border border-blue-500 rounded" />
          <span className="text-gray-400">Current Room</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#2a2a2a] border border-gray-600 rounded" />
          <span className="text-gray-400">Click to Travel</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-400" />
          <span className="text-gray-400">Friendly NPCs</span>
        </div>
        <div className="flex items-center gap-2">
          <Skull className="w-4 h-4 text-red-500" />
          <span className="text-gray-400">Hostile NPCs</span>
        </div>
      </div>
    </Dialog>
  );
}
