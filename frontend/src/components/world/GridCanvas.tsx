import React, { useState, useRef } from 'react';
import { Plus, ZoomIn, ZoomOut } from 'lucide-react';
import { GridRoom } from '../../utils/worldStateApi';

// Import Tool type from ToolPalette
import type { Tool } from './ToolPalette';

interface GridCanvasProps {
  rooms: GridRoom[];
  selectedRoom: GridRoom | null;
  activeTool: Tool;
  gridSize: { width: number; height: number };
  onRoomSelect: (room: GridRoom | null) => void;
  onRoomCreate: (position: { x: number; y: number }) => void;
  onRoomDelete: (roomId: string) => void;
  onRoomMove: (roomId: string, newPosition: { x: number; y: number }) => void;
}

export function GridCanvas({
  rooms,
  selectedRoom,
  activeTool,
  gridSize,
  onRoomSelect,
  onRoomCreate,
  onRoomDelete,
  onRoomMove,
}: GridCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  const cellSize = 120 * zoom;
  const gap = 12 * zoom;

  const handleCellClick = (x: number, y: number, e: React.MouseEvent) => {
    e.stopPropagation();

    const room = rooms.find(r => r.position.x === x && r.position.y === y);

    // Unified 'edit' tool: select existing rooms OR create new ones on empty cells
    if (activeTool === 'edit') {
      if (room) {
        // Select existing room
        onRoomSelect(room);
      } else {
        // Create new room on empty cell
        onRoomCreate({ x, y });
      }
    } else if (activeTool === 'move') {
      // Do nothing on click in move mode, just allow dragging
      return;
    } else if (activeTool === 'eraser' && room) {
      onRoomDelete(room.id);
      onRoomSelect(null);
    } else if (activeTool === 'connection' && room) {
      // Select room for connection mode
      onRoomSelect(room);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isInsideCell = target.closest('[data-cell="true"]');

    // Allow panning with middle mouse button always
    // Allow panning with left mouse button ONLY if:
    // 1. We are NOT inside a cell (clicking background)
    // 2. We are NOT in 'move' mode (locking grid as requested)
    if (e.button === 1 || (e.button === 0 && !isInsideCell && activeTool !== 'move')) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 2));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.5));

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(prev => Math.max(0.5, Math.min(2, prev + delta)));
    }
  };

  const handleDragStart = (e: React.DragEvent, roomId: string) => {
    e.dataTransfer.setData('roomId', roomId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, x: number, y: number) => {
    e.preventDefault();
    const roomId = e.dataTransfer.getData('roomId');
    if (roomId) {
      onRoomMove(roomId, { x, y });
    }
  };

  return (
    <div className="flex-1 bg-[#0a0a0a] relative overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="bg-[#141414] border-b border-[#2a2a2a] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Zoom: {Math.round(zoom * 100)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={16} className="text-gray-400" />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={16} className="text-gray-400" />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="px-3 py-1.5 text-xs bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg transition-colors"
          >
            Reset View
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          className="relative"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            padding: '100px',
          }}
        >
          {/* Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${gridSize.width}, ${cellSize}px)`,
              gridTemplateRows: `repeat(${gridSize.height}, ${cellSize}px)`,
              gap: `${gap}px`,
            }}
          >
            {Array.from({ length: gridSize.height }).map((_, y) =>
              Array.from({ length: gridSize.width }).map((_, x) => {
                const room = rooms.find(r => r.position.x === x && r.position.y === y);
                const isSelected = selectedRoom?.id === room?.id;

                return (
                  <div
                    key={`${x}-${y}`}
                    data-cell="true"
                    onClick={(e) => handleCellClick(x, y, e)}
                    onDragOver={activeTool === 'move' ? handleDragOver : undefined}
                    onDrop={activeTool === 'move' ? (e) => handleDrop(e, x, y) : undefined}
                    className={`relative rounded-lg border-2 transition-all ${room
                      ? isSelected
                        ? 'bg-[#2a2a2a] border-blue-500 shadow-lg shadow-blue-500/20'
                        : 'bg-[#1a1a1a] border-[#2a2a2a] hover:border-[#3a3a3a] cursor-pointer'
                      : 'bg-transparent border-dashed border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#1a1a1a]/30 cursor-pointer'
                      }`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                    }}
                  >
                    {room ? (
                      <div
                        className={`p-3 h-full flex flex-col ${activeTool === 'move' ? 'cursor-move' : 'cursor-pointer'}`}
                        draggable={activeTool === 'move'}
                        onDragStart={(e) => handleDragStart(e, room.id)}
                      >
                        <div className="text-sm truncate mb-1 pointer-events-none">{room.name || 'Unnamed Room'}</div>
                        <div className="text-xs text-gray-500 line-clamp-2 flex-1 pointer-events-none">
                          {room.description || 'No description'}
                        </div>
                        <div className="text-xs text-gray-600 mt-2 pointer-events-none">
                          {room.npcs.length} NPC{room.npcs.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    ) : activeTool === 'edit' ? (
                      <div className="h-full flex items-center justify-center text-gray-600 hover:text-gray-400 transition-colors">
                        <Plus size={zoom < 0.8 ? 16 : 24} />
                      </div>
                    ) : null}

                    {/* Connection indicators */}
                    {room && (
                      <>
                        {room.connections.north && (
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-3 bg-blue-500 pointer-events-none" />
                        )}
                        {room.connections.south && (
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1 h-3 bg-blue-500 pointer-events-none" />
                        )}
                        {room.connections.east && (
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-1 bg-blue-500 pointer-events-none" />
                        )}
                        {room.connections.west && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-1 bg-blue-500 pointer-events-none" />
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}