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
  debugMode = true // Enable debug mode by default to help troubleshoot
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
    console.log("No rooms to display");
    return (
      <div className="flex items-center justify-center h-60 w-full text-stone-400 bg-stone-900/50 rounded border border-stone-800 p-4">
        <div>
          <p>No rooms available to display.</p>
          <button 
            onClick={() => onCreateRoom(0, 0)} 
            className="mt-4 px-4 py-2 bg-green-700 text-white rounded hover:bg-green-600"
          >
            Create First Room
          </button>
        </div>
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
    console.log("Created coordinate lookup:", coordToRoom);
  }

  // Compute grid bounds (min/max X/Y)
  const allXs = Object.values(roomsById).map(r => r.x);
  const allYs = Object.values(roomsById).map(r => r.y);
  
  // Safe calculation of min/max that handles single room case
  let minX = Math.min(...allXs);
  let maxX = Math.max(...allXs);
  let minY = Math.min(...allYs);
  let maxY = Math.max(...allYs);
  
  // Don't expand bounds in play mode - only show actual rooms
  const minXFull = minX - (playMode ? 0 : 1);
  const maxXFull = maxX + (playMode ? 0 : 1);
  const minYFull = minY - (playMode ? 0 : 1);
  const maxYFull = maxY + (playMode ? 0 : 1);

  // Calculate grid dimensions - ensure at least 3x3
  const gridRows = Math.max(3, maxYFull - minYFull + 1);
  const gridCols = Math.max(3, maxXFull - minXFull + 1);
  
  // When there's only a single room, ensure it's properly displayed
  if (roomCount === 1) {
    const singleRoom = Object.values(roomsById)[0];
    const isSelected = singleRoom.id === selectedRoomId;
    
    return (
      <div className="p-6 flex flex-col items-center bg-stone-900/90 rounded-lg min-h-[180px] relative">
        <div className="mb-4 text-white">Room Map</div>
        <div
          className={`w-28 h-28 rounded flex items-center justify-center border-4 transition cursor-pointer ${
            isSelected 
              ? 'border-white bg-blue-800 text-white shadow-lg' 
              : 'border-stone-400 bg-stone-700 text-white hover:border-stone-100'
          }`}
          onClick={() => onSelectRoom(singleRoom.id)}
          title={singleRoom.name}
        >
          <span className="text-2xl font-bold">{singleRoom.name.charAt(0) || '■'}</span>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          {/* Top row */}
          <div 
            className="w-16 h-16 rounded border-2 border-dashed border-stone-600 bg-stone-900/60 opacity-70 cursor-pointer hover:border-white hover:opacity-100 transition"
            onClick={() => onCreateRoom(singleRoom.x, singleRoom.y - 1)}
            title="Add new room above"
          >
            <div className="flex items-center justify-center h-full">
              <span className="text-xl text-stone-400">+</span>
            </div>
          </div>
          <div className="w-16 h-16"></div>
          <div 
            className="w-16 h-16 rounded border-2 border-dashed border-stone-600 bg-stone-900/60 opacity-70 cursor-pointer hover:border-white hover:opacity-100 transition"
            onClick={() => onCreateRoom(singleRoom.x + 1, singleRoom.y - 1)} 
            title="Add new room top right"
          >
            <div className="flex items-center justify-center h-full">
              <span className="text-xl text-stone-400">+</span>
            </div>
          </div>
          {/* Middle row */}
          <div 
            className="w-16 h-16 rounded border-2 border-dashed border-stone-600 bg-stone-900/60 opacity-70 cursor-pointer hover:border-white hover:opacity-100 transition"
            onClick={() => onCreateRoom(singleRoom.x - 1, singleRoom.y)}
            title="Add new room left"
          >
            <div className="flex items-center justify-center h-full">
              <span className="text-xl text-stone-400">+</span>
            </div>
          </div>
          <div className="w-16 h-16 flex items-center justify-center">
            <span className="text-xs text-stone-500">{singleRoom.x},{singleRoom.y}</span>
          </div>
          <div 
            className="w-16 h-16 rounded border-2 border-dashed border-stone-600 bg-stone-900/60 opacity-70 cursor-pointer hover:border-white hover:opacity-100 transition"
            onClick={() => onCreateRoom(singleRoom.x + 1, singleRoom.y)}
            title="Add new room right"
          >
            <div className="flex items-center justify-center h-full">
              <span className="text-xl text-stone-400">+</span>
            </div>
          </div>
          {/* Bottom row */}
          <div 
            className="w-16 h-16 rounded border-2 border-dashed border-stone-600 bg-stone-900/60 opacity-70 cursor-pointer hover:border-white hover:opacity-100 transition"
            onClick={() => onCreateRoom(singleRoom.x - 1, singleRoom.y + 1)}
            title="Add new room bottom left"
          >
            <div className="flex items-center justify-center h-full">
              <span className="text-xl text-stone-400">+</span>
            </div>
          </div>
          <div 
            className="w-16 h-16 rounded border-2 border-dashed border-stone-600 bg-stone-900/60 opacity-70 cursor-pointer hover:border-white hover:opacity-100 transition"
            onClick={() => onCreateRoom(singleRoom.x, singleRoom.y + 1)}
            title="Add new room below"
          >
            <div className="flex items-center justify-center h-full">
              <span className="text-xl text-stone-400">+</span>
            </div>
          </div>
          <div 
            className="w-16 h-16 rounded border-2 border-dashed border-stone-600 bg-stone-900/60 opacity-70 cursor-pointer hover:border-white hover:opacity-100 transition"
            onClick={() => onCreateRoom(singleRoom.x + 1, singleRoom.y + 1)}
            title="Add new room bottom right"
          >
            <div className="flex items-center justify-center h-full">
              <span className="text-xl text-stone-400">+</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // For multiple rooms, render the grid
  return (
    <div className="relative bg-stone-900/90 rounded-lg p-4">
      {debugMode && (
        <div className="absolute top-2 right-2 text-xs text-amber-400 bg-black/70 p-1 rounded z-20">
          Grid: {gridRows}x{gridCols} | Bounds: ({minXFull},{minYFull}) to ({maxXFull},{maxYFull})
        </div>
      )}
      
      <div className="mb-4 text-center text-white text-lg">Room Map</div>
      
      <div
        className="grid bg-stone-950 border-2 border-stone-700 rounded-lg p-4 relative z-10 overflow-auto"
        style={{
          gridTemplateRows: `repeat(${gridRows}, 7rem)`,
          gridTemplateColumns: `repeat(${gridCols}, 7rem)`,
          gap: '1rem',
          minHeight: '300px',
          maxHeight: '75vh'
        }}
      >
        {Array.from({ length: gridRows }).map((_, rowIdx) => {
          const y = minYFull + rowIdx;
          
          return Array.from({ length: gridCols }).map((_, colIdx) => {
            const x = minXFull + colIdx;
            const coordKey = `${x},${y}`;
            
            // Check if we have a room at this coordinate
            const room = coordToRoom[coordKey];
            
            if (room) {
              // We found a room at this coordinate
              const isSelected = room.id === selectedRoomId;
              
              return (
                <div
                  key={`room-${coordKey}`}
                  className={`flex items-center justify-center border-4 transition cursor-pointer rounded ${
                    isSelected 
                      ? 'border-white bg-blue-800 text-white shadow-lg' 
                      : 'border-stone-400 bg-stone-700 text-white hover:border-stone-100'
                  }`}
                  onClick={() => onSelectRoom(room.id)}
                  title={room.name}
                  style={{ gridColumn: colIdx + 1, gridRow: rowIdx + 1 }}
                >
                  <div className="text-center p-2">
                    <span className="text-2xl font-bold block">{room.name.charAt(0) || '■'}</span>
                    <span className="text-xs block mt-1">{room.name}</span>
                    {debugMode && (
                      <div className="mt-1 text-xs text-stone-300">
                        ({x},{y})
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
                  className="flex items-center justify-center border-2 border-dashed border-stone-600 bg-stone-900/60 opacity-70 cursor-pointer hover:border-white hover:opacity-100 transition rounded"
                  onClick={() => onCreateRoom(x, y)}
                  title="Add new room here"
                  style={{ gridColumn: colIdx + 1, gridRow: rowIdx + 1 }}
                >
                  <div className="flex items-center justify-center h-full">
                    <span className="text-2xl text-stone-400">+</span>
                    {debugMode && (
                      <span className="text-xs text-stone-500 absolute bottom-2">({x},{y})</span>
                    )}
                  </div>
                </div>
              );
            }
            
            // In play mode, just return empty space
            return (
              <div 
                key={`empty-${coordKey}`} 
                className="bg-stone-900/30"
                style={{ gridColumn: colIdx + 1, gridRow: rowIdx + 1 }}
              />
            );
          });
        })}
      </div>
    </div>
  );
};

export default RoomMap;
