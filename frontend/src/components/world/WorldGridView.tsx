// frontend/src/components/world/WorldGridView.tsx
// CSS Grid world map with adjacency connectors and isolation indicators.
// Renamed from GridCanvas.tsx; toolbar removed (now in EditorToolbar).

import React, { useMemo } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import type { GridRoom } from '../../types/worldGrid';
import { useGridViewport, type GridViewportState, type GridViewportHandlers } from '../../hooks/useGridViewport';

export type Tool = 'edit' | 'move' | 'eraser';

type Direction = 'north' | 'south' | 'east' | 'west';

/** Compute which directions each room has an adjacent occupied cell */
function computeRoomAdjacency(rooms: GridRoom[]): Map<string, Set<Direction>> {
    const posMap = new Map<string, string>(); // "x,y" -> roomId
    for (const r of rooms) {
        posMap.set(`${r.position.x},${r.position.y}`, r.id);
    }

    const result = new Map<string, Set<Direction>>();
    for (const r of rooms) {
        const dirs = new Set<Direction>();
        const { x, y } = r.position;
        if (posMap.has(`${x},${y - 1}`)) dirs.add('north');
        if (posMap.has(`${x},${y + 1}`)) dirs.add('south');
        if (posMap.has(`${x + 1},${y}`)) dirs.add('east');
        if (posMap.has(`${x - 1},${y}`)) dirs.add('west');
        result.set(r.id, dirs);
    }
    return result;
}

interface WorldGridViewProps {
    rooms: GridRoom[];
    selectedRoom: GridRoom | null;
    activeTool: Tool;
    gridSize: { width: number; height: number };
    onRoomSelect: (room: GridRoom | null) => void;
    onRoomCreate: (position: { x: number; y: number }) => void;
    onRoomDelete: (roomId: string) => void;
    onRoomMove: (roomId: string, newPosition: { x: number; y: number }) => void;
    onCellClick?: (position: { x: number; y: number }, event: React.MouseEvent) => void;
    viewport?: GridViewportState;
    viewportHandlers?: GridViewportHandlers;
}

export function WorldGridView({
    rooms,
    selectedRoom,
    activeTool,
    gridSize,
    onRoomSelect,
    onRoomCreate,
    onRoomDelete,
    onRoomMove,
    onCellClick,
    viewport: externalViewport,
    viewportHandlers: externalHandlers,
}: WorldGridViewProps) {
    const [internalViewport, internalHandlers] = useGridViewport();
    const viewport = externalViewport || internalViewport;
    const vpHandlers = externalHandlers || internalHandlers;

    const { cellSize, gap, pan, zoom } = viewport;

    // Compute adjacency whenever rooms change
    const adjacencyMap = useMemo(() => computeRoomAdjacency(rooms), [rooms]);

    const handleCellClick = (x: number, y: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const room = rooms.find(r => r.position.x === x && r.position.y === y);

        if (activeTool === 'edit') {
            if (onCellClick) {
                onCellClick({ x, y }, e);
            } else {
                if (room) onRoomSelect(room);
                else onRoomCreate({ x, y });
            }
        } else if (activeTool === 'move') {
            return;
        } else if (activeTool === 'eraser' && room) {
            onRoomDelete(room.id);
            onRoomSelect(null);
        }
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const isInsideCell = target.closest('[data-cell="true"]');
        if (activeTool === 'move' && !isInsideCell) return;
        vpHandlers.handleMouseDown(e);
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
        if (roomId) onRoomMove(roomId, { x, y });
    };

    return (
        <div className="flex-1 bg-[#0a0a0a] relative overflow-hidden flex flex-col">
            <div
                className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onMouseMove={vpHandlers.handleMouseMove}
                onMouseUp={vpHandlers.handleMouseUp}
                onMouseLeave={vpHandlers.handleMouseUp}
                onWheel={vpHandlers.handleWheel}
            >
                <div
                    className="relative"
                    style={{
                        transform: `translate(${pan.x}px, ${pan.y}px)`,
                        padding: '100px',
                    }}
                >
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
                                const adj = room ? adjacencyMap.get(room.id) : undefined;
                                const isIsolated = room && adj && adj.size === 0;

                                return (
                                    <div
                                        key={`${x}-${y}`}
                                        data-cell="true"
                                        onClick={(e) => handleCellClick(x, y, e)}
                                        onDragOver={activeTool === 'move' ? handleDragOver : undefined}
                                        onDrop={activeTool === 'move' ? (e) => handleDrop(e, x, y) : undefined}
                                        className={`relative rounded-lg border-2 transition-all ${room
                                            ? isIsolated
                                                ? isSelected
                                                    ? 'bg-[#2a2a2a] border-amber-500 shadow-lg shadow-amber-500/20'
                                                    : 'bg-[#1a1a1a] border-amber-600/60 hover:border-amber-500 cursor-pointer'
                                                : isSelected
                                                    ? 'bg-[#2a2a2a] border-blue-500 shadow-lg shadow-blue-500/20'
                                                    : 'bg-[#1a1a1a] border-[#2a2a2a] hover:border-[#3a3a3a] cursor-pointer'
                                            : 'bg-transparent border-dashed border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#1a1a1a]/30 cursor-pointer'
                                        }`}
                                        style={{ width: cellSize, height: cellSize }}
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

                                        {/* Adjacency connectors — blue bars between neighboring rooms */}
                                        {room && adj && (
                                            <>
                                                {adj.has('north') && (
                                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-3 bg-blue-500 rounded-full pointer-events-none" />
                                                )}
                                                {adj.has('south') && (
                                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1.5 h-3 bg-blue-500 rounded-full pointer-events-none" />
                                                )}
                                                {adj.has('east') && (
                                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-1.5 bg-blue-500 rounded-full pointer-events-none" />
                                                )}
                                                {adj.has('west') && (
                                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-1.5 bg-blue-500 rounded-full pointer-events-none" />
                                                )}
                                            </>
                                        )}

                                        {/* Isolation warning */}
                                        {isIsolated && (
                                            <div
                                                className="absolute top-1 right-1 pointer-events-none"
                                                title="This room has no adjacent rooms and won't be reachable during gameplay."
                                            >
                                                <AlertTriangle size={14} className="text-amber-400" />
                                            </div>
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
