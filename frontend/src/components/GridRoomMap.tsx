import React from 'react';
import { Room } from '../types/room';

interface GridRoomMapProps {
  roomsById: Record<string, Room>;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  onCreateRoom: (x: number, y: number) => void;
  gridSize?: number; // Now defaults to 5
  playMode?: boolean;
  debugMode?: boolean;
}

const GridRoomMap: React.FC<GridRoomMapProps> = ({
  roomsById,
  selectedRoomId,
  onSelectRoom,
  onCreateRoom,
  gridSize = 5, // Changed default from 6 to 5
  playMode = false,
  debugMode = false,
}) => {
  // Calculate grid center
  const center = Math.floor(gridSize / 2);
  
  // Find existing rooms by coordinates
  const roomByCoords: Record<string, Room> = {};
  Object.values(roomsById).forEach(room => {
    const key = `${room.x},${room.y}`;
    roomByCoords[key] = room;
  });
  
  // Check if we have any rooms at all
  const roomCount = Object.keys(roomsById).length;
  
  // If no rooms at all, we'll create a different starting state
  // with just the center cell ready to be initialized
  if (roomCount === 0 && !playMode) {
    return (
      <div className="relative bg-stone-900/90 rounded-lg p-4">
        <div className="mb-4 text-center text-white text-lg">Room Map</div>
        <div className="grid grid-cols-[repeat(5,_1fr)] gap-2">
          {Array.from({ length: gridSize * gridSize }).map((_, index) => {
            const x = index % gridSize - center;
            const y = Math.floor(index / gridSize) - center;
            const isCenter = x === 0 && y === 0;
            const coordKey = `${x},${y}`;
            
            return (
              <div
                key={`cell-${coordKey}`}
                className={`aspect-square flex items-center justify-center 
                  ${isCenter ? 
                    'border-2 border-green-400 bg-green-800/40 cursor-pointer hover:bg-green-700/60' : 
                    'border-2 border-dashed border-stone-700 bg-stone-900/60 opacity-50'
                  } rounded`}
                onClick={isCenter ? () => onCreateRoom(x, y) : undefined}
                title={isCenter ? "Create starting room" : ""}
              >
                <div className="flex flex-col items-center justify-center">
                  <span className={`text-2xl ${isCenter ? 'text-white' : 'text-stone-600'}`}>
                    {isCenter ? "S" : ""}
                  </span>
                  {isCenter && <span className="text-xs text-white mt-1">Start Here</span>}
                  {debugMode && (
                    <span className="text-xs text-stone-500 absolute bottom-2">
                      ({x},{y})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  
  // Create grid for rooms
  return (
    <div className="relative bg-stone-900/90 rounded-lg p-4">
      {debugMode && (
        <div className="absolute top-2 right-2 text-xs text-amber-400 bg-black/70 p-1 rounded z-20">
          Grid: {gridSize}x{gridSize} | Center: ({center},{center})
        </div>
      )}
      
      <div className="mb-4 text-center text-white text-lg">Room Map</div>
      
      <div className="grid gap-2" style={{ 
        gridTemplateColumns: `repeat(${gridSize}, minmax(5rem, 1fr))`,
        gridTemplateRows: `repeat(${gridSize}, minmax(5rem, 1fr))` 
      }}>
        {Array.from({ length: gridSize * gridSize }).map((_, index) => {
          const x = index % gridSize - center;
          const y = Math.floor(index / gridSize) - center;
          const coordKey = `${x},${y}`;
          const room = roomByCoords[coordKey];
          const isCenter = x === 0 && y === 0;
          
          if (room) {
            // This cell has a room
            const isSelected = room.id === selectedRoomId;
            
            return (
              <div
                key={`room-${coordKey}`}
                className={`aspect-square flex items-center justify-center border-2 transition cursor-pointer rounded relative
                  ${isSelected 
                    ? 'border-white bg-blue-800 text-white shadow-lg' 
                    : isCenter
                      ? 'border-green-400 bg-green-800 text-white'
                      : 'border-stone-400 bg-stone-700 text-white hover:border-stone-100'
                  }`}
                onClick={() => onSelectRoom(room.id)}
                title={room.name}
              >
                <div className="text-center p-2 overflow-hidden">
                  <span className="text-xl font-bold block">
                    {isCenter ? 'S' : room.name.charAt(0) || '■'}
                  </span>
                  <span className="text-xs block mt-1 truncate max-w-full px-1">
                    {room.name}
                  </span>
                  {debugMode && (
                    <div className="mt-1 text-xs text-stone-300">
                      ({x},{y})
                    </div>
                  )}
                </div>
              </div>
            );
          } else {
            // Empty cell - show as placeholders with "+" unless in play mode
            if (!playMode) {
              return (
                <div
                  key={`placeholder-${coordKey}`}
                  className={`aspect-square flex items-center justify-center border-2 border-dashed 
                    ${isCenter ? 'border-green-400 bg-green-900/20' : 'border-stone-600 bg-stone-900/60'} 
                    opacity-70 cursor-pointer hover:border-white hover:opacity-100 transition rounded relative`}
                  onClick={() => onCreateRoom(x, y)}
                  title={`Add new room at (${x},${y})`}
                >
                  <div className="flex items-center justify-center h-full">
                    <span className="text-2xl text-stone-400">+</span>
                    {debugMode && (
                      <span className="text-xs text-stone-500 absolute bottom-2">
                        ({x},{y})
                      </span>
                    )}
                  </div>
                </div>
              );
            } else {
              // In play mode, just show empty space
              return (
                <div 
                  key={`empty-${coordKey}`} 
                  className="aspect-square bg-stone-900/30"
                />
              );
            }
          }
        })}
      </div>
    </div>
  );
};

export default GridRoomMap;