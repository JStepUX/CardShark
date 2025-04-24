import React, { useEffect } from "react";

// Use the imported Room type
import { Room } from '../types/room';

interface RoomMapProps {
  roomsById: { [id: string]: Room };
  posToId: { [key: string]: string };
  // Allow selectedRoomId to be null
  selectedRoomId: string | null;
  onCreateRoom: (x: number, y: number) => void;
  // Rename onRoomClick to onSelectRoom for clarity
  onSelectRoom: (id: string) => void;
  // Add playMode prop to hide placeholders and only show actual rooms
  playMode?: boolean;
  // Add debug mode to troubleshoot rendering issues
  debugMode?: boolean;
}

const RoomMap: React.FC<RoomMapProps> = ({ 
  roomsById, 
  posToId, 
  selectedRoomId, 
  onCreateRoom, 
  onSelectRoom,
  playMode = false,
  debugMode = false
}) => {
  // Add explicit debugging
  useEffect(() => {
    if (debugMode) {
      console.log("RoomMap render with:", {
        roomCount: Object.keys(roomsById).length,
        rooms: roomsById,
        positions: posToId,
        selectedRoomId
      });
    }
  }, [roomsById, posToId, selectedRoomId, debugMode]);
  
  // Check if we have any rooms at all
  const roomCount = Object.keys(roomsById).length;
  
  // If no rooms, display a message instead of trying to render an empty grid
  if (roomCount === 0) {
    return (
      <div className="flex items-center justify-center h-60 text-stone-400 bg-stone-900/50 rounded border border-stone-800">
        No rooms available to display.
      </div>
    );
  }

  // Since we have rooms, create a direct mapping from x,y to room ID for easier lookup
  // This fixes the position lookup issue
  const coordToRoom: Record<string, Room> = {};
  Object.values(roomsById).forEach(room => {
    const key = `${room.x},${room.y}`;
    coordToRoom[key] = room;
  });

  if (debugMode && roomCount > 0) {
    console.log("Created direct coordinate lookup:", coordToRoom);
  }

  // Compute grid bounds (min/max X/Y)
  const allXs = Object.values(roomsById).map(r => r.x);
  const allYs = Object.values(roomsById).map(r => r.y);
  
  // Safe calculation of min/max that handles single room case
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  
  if (allXs.length > 0) {
    minX = Math.min(...allXs);
    maxX = Math.max(...allXs);
  }
  
  if (allYs.length > 0) {
    minY = Math.min(...allYs);
    maxY = Math.max(...allYs);
  }
  
  // Don't expand bounds in play mode - only show actual rooms
  const minXFull = minX - (playMode ? 0 : 1);
  const maxXFull = maxX + (playMode ? 0 : 1);
  const minYFull = minY - (playMode ? 0 : 1);
  const maxYFull = maxY + (playMode ? 0 : 1);

  // Calculate grid dimensions - ensure at least 1x1
  const gridRows = Math.max(1, maxYFull - minYFull + 1);
  const gridCols = Math.max(1, maxXFull - minXFull + 1);
  
  // When there's only a single room, ensure it's properly displayed
  if (roomCount === 1) {
    const singleRoom = Object.values(roomsById)[0];
    const isSelected = singleRoom.id === selectedRoomId;
    
    return (
      <div className="p-6 flex justify-center items-center bg-stone-900/90 rounded-lg min-h-[180px] relative">
        <div
          className={`w-28 h-28 rounded flex items-center justify-center border-4 transition cursor-pointer ${
            isSelected 
              ? 'border-white bg-stone-100 text-stone-900 shadow-lg' 
              : 'border-stone-400 bg-stone-900 text-white hover:border-stone-100'
          }`}
          onClick={() => onSelectRoom(singleRoom.id)}
          title={singleRoom.name}
        >
          <span className="text-2xl font-bold">{singleRoom.name.charAt(0) || '■'}</span>
        </div>
        {debugMode && (
          <div className="absolute bottom-2 left-2 text-xs text-amber-400 bg-black/70 p-1 rounded">
            Room ID: {singleRoom.id} | Selected: {isSelected ? 'YES' : 'NO'}
          </div>
        )}
      </div>
    );
  }

  // For multiple rooms, render the grid
  return (
    <div className="relative bg-stone-900/90 rounded-lg p-4">
      {debugMode && (
        <div className="absolute top-2 right-2 text-xs text-amber-400 bg-black/70 p-1 rounded z-20">
          Grid: {gridRows}x{gridCols} | Selected: {selectedRoomId || 'None'}
        </div>
      )}
      <div
        className="grid bg-stone-950 border-2 border-stone-700 rounded-lg p-4 relative z-10"
        style={{
          gridTemplateColumns: `repeat(${gridCols}, 7rem)`,
          gridTemplateRows: `repeat(${gridRows}, 7rem)`,
          gap: '1.5rem',
          minHeight: '200px' // Ensure minimum height
        }}
      >
        {Array.from({ length: gridRows }).map((_, rowIdx) => {
          const y = minYFull + rowIdx;
          
          return Array.from({ length: gridCols }).map((_, colIdx) => {
            const x = minXFull + colIdx;
            const coordKey = `${x},${y}`;
            
            // Look up room directly from our mapping
            const room = coordToRoom[coordKey];
            
            if (room) {
              // We found a room at this coordinate
              const isSelected = room.id === selectedRoomId;
              
              return (
                <div
                  key={`room-${coordKey}`}
                  className={`w-28 h-28 rounded flex items-center justify-center border-4 transition cursor-pointer ${
                    isSelected 
                      ? 'border-white bg-stone-100 text-stone-900 shadow-lg' 
                      : 'border-stone-400 bg-stone-900 text-white hover:border-stone-100'
                  }`}
                  onClick={() => onSelectRoom(room.id)}
                  title={room.name}
                >
                  <div className="text-center">
                    <span className="text-2xl font-bold">{room.name.charAt(0) || '■'}</span>
                    {debugMode && (
                      <div className="mt-1 text-xs">
                        {isSelected ? '(Current)' : ''}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            
            // No room at this coordinate - handle placeholders
            if (!playMode) {
              // Only show placeholder cells in builder mode
              return (
                <div
                  key={`placeholder-${coordKey}`}
                  className="w-28 h-28 rounded flex items-center justify-center border-2 border-dashed border-stone-400 bg-stone-900/60 opacity-70 cursor-pointer hover:border-white hover:opacity-100 transition"
                  onClick={() => onCreateRoom(x, y)}
                  title="Add new room here"
                >
                  {debugMode && <span className="text-xs text-stone-500">{coordKey}</span>}
                </div>
              );
            }
            
            // In play mode, just return empty space
            return <div key={`empty-${coordKey}`} className="w-28 h-28" />;
          });
        }).flat()}
      </div>
    </div>
  );
};

export default RoomMap;
