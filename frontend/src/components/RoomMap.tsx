import React from "react";

type Direction = 'N' | 'S' | 'E' | 'W';
interface Room {
  id: string;
  name: string;
  description?: string;
  x: number;
  y: number;
  neighbors: Partial<Record<Direction, string>>;
}

interface RoomMapProps {
  roomsById: { [id: string]: Room };
  posToId: { [key: string]: string };
  selectedRoomId: string;
  onCreateRoom: (x: number, y: number) => void;
  onRoomClick: (id: string) => void;
}

const RoomMap: React.FC<RoomMapProps> = ({ roomsById, posToId, selectedRoomId, onCreateRoom, onRoomClick }) => {

  // Build a set of all occupied positions
  const occupied = new Set(Object.values(roomsById).map(r => `${r.x},${r.y}`));

  // Compute grid bounds (min/max X/Y), expand by 1 in all directions to show available placeholders
  const allXs = Object.values(roomsById).map(r => r.x);
  const allYs = Object.values(roomsById).map(r => r.y);
  const minXFull = Math.min(...allXs) - 1;
  const maxXFull = Math.max(...allXs) + 1;
  const minYFull = Math.min(...allYs) - 1;
  const maxYFull = Math.max(...allYs) + 1;

  // Collect all empty grid positions within expanded bounds
  const placeholderSet = new Set<string>();
  for (let row = minYFull; row <= maxYFull; row++) {
    for (let col = minXFull; col <= maxXFull; col++) {
      const key = `${col},${row}`;
      if (!occupied.has(key)) {
        placeholderSet.add(key);
      }
    }
  }
  const gridRows = maxYFull - minYFull + 1;
  const gridCols = maxXFull - minXFull + 1;
  // Build the grid with placeholders (no nulls)
  const grid: (Room | 'placeholder')[][] = Array.from({ length: gridRows }, (_, row) =>
    Array.from({ length: gridCols }, (_, col) => {
      const x = minXFull + col;
      const y = minYFull + row;
      const key = `${x},${y}`;
      if (occupied.has(key)) return roomsById[posToId[key]];
      if (placeholderSet.has(key)) return 'placeholder';
      // Shouldn't happen, but fallback to placeholder for grid consistency
      return 'placeholder';
    })
  );

  // Handler for clicking a placeholder cell
  function onCreateRoomFromPlaceholder(key: string) {
    const [x, y] = key.split(",").map(Number);
    onCreateRoom(x, y);
  }

  return (
    <div className="relative">
      <div
        className="grid bg-stone-950 border-2 border-stone-700 rounded-lg p-4"
        style={{
          gridTemplateColumns: `repeat(${gridCols}, 7rem)`,
          gridTemplateRows: `repeat(${gridRows}, 7rem)`,
          gap: '2rem',
        }}
      >
        {grid.flatMap((row, y) =>
          row.map((cell, x) => {
            const key = `${minXFull + x},${minYFull + y}`;
            if (cell === 'placeholder') {
              return (
                <div
                  key={`placeholder-${key}`}
                  className="w-28 h-28 rounded flex items-center justify-center border-2 border-dashed border-stone-400 bg-stone-900/60 opacity-70 cursor-pointer hover:border-white hover:opacity-100 transition"
                  onClick={() => onCreateRoomFromPlaceholder(key)}
                  title="Add new room here"
                />
              );
            }
            if (cell && typeof cell === 'object') {
              const isSelected = cell.id === selectedRoomId;
              return (
                <div
                  key={cell.id}
                  className={`w-28 h-28 rounded flex items-center justify-center border-4 transition cursor-pointer ${isSelected ? 'border-white bg-stone-100 text-stone-900 shadow-lg' : 'border-stone-400 bg-stone-900 text-white hover:border-stone-100'}`}
                  onClick={() => onRoomClick(cell.id)}
                  title={cell.name}
                >
                  <span className="text-2xl font-bold">■</span>
                </div>
              );
            }
            // Should not happen
            return <div key={`empty-${key}`} className="w-28 h-28" />;
          })
        )}
      </div>
    </div>
  );
};

export default RoomMap;
