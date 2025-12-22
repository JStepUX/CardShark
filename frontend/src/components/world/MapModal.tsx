import { X } from 'lucide-react';
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
    if (!currentRoom) return false;
    if (room.id === currentRoomId) return false;

    // Check if rooms are adjacent
    const currentPos = currentRoom.position;
    const targetPos = room.position;

    const isAdjacent =
      (Math.abs(currentPos.x - targetPos.x) === 1 && currentPos.y === targetPos.y) ||
      (Math.abs(currentPos.y - targetPos.y) === 1 && currentPos.x === targetPos.x);

    return isAdjacent;
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a1a] rounded-lg border border-gray-800 max-w-5xl w-full max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <div>
            <h2 className="text-lg text-white">{worldData.metadata.name} - Map</h2>
            <p className="text-sm text-gray-500">{worldData.metadata.description}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Grid */}
        <div className="p-8">
          <div className="inline-block border border-gray-800 bg-[#0a0a0a]">
            {Array.from({ length: gridSize.height }).map((_, y) => (
              <div key={y} className="flex">
                {Array.from({ length: gridSize.width }).map((_, x) => {
                  const room = roomsByPosition.get(`${x},${y}`);
                  const isCurrentRoom = room?.id === currentRoomId;
                  const isAccessible = room ? isRoomAccessible(room) : false;

                  return (
                    <div
                      key={`${x},${y}`}
                      className={`w-24 h-24 border border-gray-800 flex items-center justify-center relative transition-all ${room
                        ? isCurrentRoom
                          ? 'bg-blue-600/20 border-blue-500 animate-pulse'
                          : isAccessible
                            ? 'bg-[#2a2a2a] hover:bg-[#3a3a3a] cursor-pointer'
                            : 'bg-[#1a1a1a]'
                        : 'bg-[#0a0a0a]'
                        }`}
                      onClick={() => {
                        if (room && isAccessible) {
                          onNavigate(room.id);
                          onClose();
                        }
                      }}
                    >
                      {room && (
                        <>
                          <div className="text-center px-2">
                            <p className="text-xs text-white truncate">{room.name}</p>
                            {isCurrentRoom && (
                              <p className="text-xs text-blue-400 mt-1">You are here</p>
                            )}
                          </div>
                          {isCurrentRoom && (
                            <div className="absolute inset-0 border-2 border-blue-500 rounded-sm animate-pulse" />
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
        <div className="border-t border-gray-800 px-6 py-4 flex gap-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-600/20 border border-blue-500 rounded" />
            <span className="text-gray-400">Current Room</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#2a2a2a] border border-gray-800 rounded" />
            <span className="text-gray-400">Adjacent Room (clickable)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#1a1a1a] border border-gray-800 rounded" />
            <span className="text-gray-400">Other Room</span>
          </div>
        </div>
      </div>
    </div>
  );
}
