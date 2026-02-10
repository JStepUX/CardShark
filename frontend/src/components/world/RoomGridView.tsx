// frontend/src/components/world/RoomGridView.tsx
// Full-viewport CSS grid editor for room layout: NPC placement, zone painting, exit indicators.

import { useState, useCallback, useMemo } from 'react';
import { Users, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import type { GridRoom } from '../../types/worldGrid';
import type { RoomLayoutData, SpawnPoint, CellPosition, ZoneType, ExitDirection } from '../../types/localMap';
import { DEFAULT_LAYOUT_GRID_SIZE } from '../../types/localMap';
import { ZONE_CELL_COLORS } from '../../types/editorGrid';
import type { RoomEditorTool } from '../../types/editorGrid';
import type { GridViewportState } from '../../hooks/useGridViewport';
import { getExitPosition } from '../../utils/localMapUtils';

interface NPCInfo {
    id: string;
    name: string;
    imageUrl?: string;
}

const EXIT_ARROWS: Record<ExitDirection, typeof ArrowUp> = {
    north: ArrowUp,
    south: ArrowDown,
    east: ArrowRight,
    west: ArrowLeft,
};

interface RoomGridViewProps {
    room: GridRoom;
    layoutData: RoomLayoutData;
    npcs: NPCInfo[];
    activeTool: RoomEditorTool;
    selectedNpcId: string | null;
    selectedZoneType: ZoneType;
    exitDirections: ExitDirection[];
    viewport: GridViewportState;
    worldId: string;
    onLayoutChange: (layoutData: RoomLayoutData) => void;
    onSelectNpc: (npcId: string | null) => void;
}

export function RoomGridView({
    room,
    layoutData,
    npcs,
    activeTool,
    selectedNpcId,
    selectedZoneType,
    exitDirections,
    viewport,
    worldId,
    onLayoutChange,
    onSelectNpc,
}: RoomGridViewProps) {
    const [hoveredCell, setHoveredCell] = useState<CellPosition | null>(null);
    const [dragOverCell, setDragOverCell] = useState<CellPosition | null>(null);
    const [isPainting, setIsPainting] = useState(false);

    const { cellSize, gap, pan } = viewport;
    const { cols, rows } = layoutData.gridSize || DEFAULT_LAYOUT_GRID_SIZE;

    const isZoneMode = activeTool === 'tile-paint';
    const isEraseMode = activeTool === 'eraser';
    const isNpcMode = activeTool === 'npc-place';

    // Room image URL
    const roomImageUrl = useMemo(() => {
        if (!room?.image_path) return null;
        if (room.image_path.startsWith('/api/')) return room.image_path;
        return `/api/world-assets/${worldId}/${room.image_path.split('/').pop()}`;
    }, [room?.image_path, worldId]);

    // Spawn lookup by cell
    const spawnsByCell = useMemo(() => {
        const map = new Map<string, SpawnPoint>();
        for (const spawn of layoutData.spawns) {
            map.set(`${spawn.col},${spawn.row}`, spawn);
        }
        return map;
    }, [layoutData.spawns]);

    // Zone lookup by cell
    const zonesByCell = useMemo(() => {
        const map = new Map<string, string>();
        for (const zone of layoutData.deadZones) {
            for (const cell of zone.cells) {
                map.set(`${cell.col},${cell.row}`, zone.type);
            }
        }
        return map;
    }, [layoutData.deadZones]);

    // Exit cells map
    const exitCellsMap = useMemo(() => {
        const map = new Map<string, ExitDirection>();
        const config = { gridWidth: cols, gridHeight: rows, tileSize: 1 };
        for (const dir of exitDirections) {
            const pos = getExitPosition(dir, config);
            map.set(`${pos.x},${pos.y}`, dir);
        }
        return map;
    }, [exitDirections, cols, rows]);

    const getNpcInfo = useCallback((entityId: string): NPCInfo | undefined => {
        return npcs.find(n => n.id === entityId);
    }, [npcs]);

    // --- Zone painting ---
    const paintZone = useCallback((col: number, row: number) => {
        const cellKey = `${col},${row}`;
        if (exitCellsMap.has(cellKey)) return;
        if (zonesByCell.get(cellKey) === selectedZoneType) return;

        // Remove from any existing zone
        const cleanedZones = layoutData.deadZones.map(zone => ({
            ...zone,
            cells: zone.cells.filter(c => !(c.col === col && c.row === row)),
        })).filter(zone => zone.cells.length > 0);

        const newCell: CellPosition = { col, row };
        const zoneIndex = cleanedZones.findIndex(z => z.type === selectedZoneType);
        if (zoneIndex >= 0) {
            cleanedZones[zoneIndex] = {
                ...cleanedZones[zoneIndex],
                cells: [...cleanedZones[zoneIndex].cells, newCell],
            };
        } else {
            cleanedZones.push({ type: selectedZoneType, cells: [newCell] });
        }

        onLayoutChange({ ...layoutData, deadZones: cleanedZones });
    }, [layoutData, selectedZoneType, exitCellsMap, zonesByCell, onLayoutChange]);

    const unpaintZone = useCallback((col: number, row: number) => {
        const cleanedZones = layoutData.deadZones.map(zone => ({
            ...zone,
            cells: zone.cells.filter(c => !(c.col === col && c.row === row)),
        })).filter(zone => zone.cells.length > 0);
        onLayoutChange({ ...layoutData, deadZones: cleanedZones });
    }, [layoutData, onLayoutChange]);

    // --- NPC placement ---
    const placeNpc = useCallback((col: number, row: number, entityId: string) => {
        const filteredSpawns = layoutData.spawns.filter(s => s.entityId !== entityId);
        const newSpawn: SpawnPoint = { entityId, col, row };
        onLayoutChange({ ...layoutData, spawns: [...filteredSpawns, newSpawn] });
        onSelectNpc(entityId);
    }, [layoutData, onLayoutChange, onSelectNpc]);

    const removeSpawn = useCallback((col: number, row: number) => {
        const spawn = spawnsByCell.get(`${col},${row}`);
        if (!spawn) return;
        onLayoutChange({
            ...layoutData,
            spawns: layoutData.spawns.filter(s => !(s.col === col && s.row === row)),
        });
    }, [layoutData, spawnsByCell, onLayoutChange]);

    // --- Cell interaction ---
    const handleCellClick = useCallback((col: number, row: number) => {
        const cellKey = `${col},${row}`;

        if (isEraseMode) {
            // Erase whatever is on this cell
            const hasSpawn = spawnsByCell.has(cellKey);
            const hasZone = zonesByCell.has(cellKey);
            if (hasSpawn) removeSpawn(col, row);
            if (hasZone) unpaintZone(col, row);
            return;
        }

        if (isZoneMode) {
            if (exitCellsMap.has(cellKey)) return;
            const existingZone = zonesByCell.get(cellKey);
            if (existingZone) {
                unpaintZone(col, row);
            } else {
                paintZone(col, row);
            }
            return;
        }

        if (isNpcMode) {
            const spawn = spawnsByCell.get(cellKey);
            if (spawn) {
                onSelectNpc(spawn.entityId);
            } else if (selectedNpcId) {
                placeNpc(col, row, selectedNpcId);
            }
        }
    }, [isEraseMode, isZoneMode, isNpcMode, selectedNpcId, spawnsByCell, zonesByCell, exitCellsMap,
        removeSpawn, unpaintZone, paintZone, placeNpc, onSelectNpc]);

    const handleMouseDown = useCallback((col: number, row: number) => {
        if (isZoneMode || isEraseMode) {
            setIsPainting(true);
            handleCellClick(col, row);
        }
    }, [isZoneMode, isEraseMode, handleCellClick]);

    const handleMouseEnter = useCallback((col: number, row: number) => {
        setHoveredCell({ col, row });
        if (isPainting) {
            const cellKey = `${col},${row}`;
            if (isEraseMode) {
                if (zonesByCell.has(cellKey)) unpaintZone(col, row);
            } else if (isZoneMode && !zonesByCell.has(cellKey) && !exitCellsMap.has(cellKey)) {
                paintZone(col, row);
            }
        }
    }, [isPainting, isZoneMode, isEraseMode, zonesByCell, exitCellsMap, paintZone, unpaintZone]);

    const handleMouseUp = useCallback(() => {
        setIsPainting(false);
    }, []);

    // --- Drag-and-drop for NPC placement ---
    const handleDragOver = useCallback((e: React.DragEvent, _col: number, _row: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverCell({ col: _col, row: _row });
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragOverCell(null);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, col: number, row: number) => {
        e.preventDefault();
        setDragOverCell(null);
        const entityId = e.dataTransfer.getData('entityId');
        if (entityId) {
            placeNpc(col, row, entityId);
        }
    }, [placeNpc]);

    const handleSpawnDragStart = useCallback((e: React.DragEvent, spawn: SpawnPoint) => {
        e.dataTransfer.setData('entityId', spawn.entityId);
        e.dataTransfer.effectAllowed = 'move';
    }, []);

    // Total grid pixel size
    const gridPixelWidth = cols * cellSize + (cols - 1) * gap;
    const gridPixelHeight = rows * cellSize + (rows - 1) * gap;

    // Render cells
    const cells = useMemo(() => {
        const cellElements: React.ReactNode[] = [];

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cellKey = `${col},${row}`;
                const spawn = spawnsByCell.get(cellKey);
                const zoneType = zonesByCell.get(cellKey);
                const exitDir = exitCellsMap.get(cellKey);
                const isExit = !!exitDir;
                const isHovered = hoveredCell?.col === col && hoveredCell?.row === row;
                const isDragOver = dragOverCell?.col === col && dragOverCell?.row === row;
                const npcInfo = spawn ? getNpcInfo(spawn.entityId) : undefined;
                const isSelectedNpc = spawn && spawn.entityId === selectedNpcId;

                let cellBgClass = 'bg-transparent';
                if (zoneType) {
                    cellBgClass = ZONE_CELL_COLORS[zoneType] || 'bg-gray-500/30';
                }

                let tooltip = `Cell (${col}, ${row})`;
                if (isExit) tooltip = `Exit ${exitDir} (protected)`;
                else if (spawn) tooltip = `${npcInfo?.name || spawn.entityId} at (${col}, ${row})`;
                else if (zoneType) tooltip = `${zoneType} zone at (${col}, ${row})`;

                const ExitArrow = exitDir ? EXIT_ARROWS[exitDir] : null;

                cellElements.push(
                    <div
                        key={cellKey}
                        data-cell="true"
                        className={`
                            relative border transition-all select-none
                            ${isExit ? 'border-blue-400/60' : 'border-white/10'}
                            ${(isZoneMode || isEraseMode) && isExit ? 'cursor-not-allowed' : 'cursor-pointer'}
                            ${cellBgClass}
                            ${isHovered && !spawn && !zoneType && !isExit ? 'bg-blue-500/20' : ''}
                            ${isDragOver ? 'bg-green-500/30 border-green-400' : ''}
                            ${isSelectedNpc ? 'ring-2 ring-yellow-400' : ''}
                        `}
                        style={{ width: cellSize, height: cellSize }}
                        onMouseDown={() => handleMouseDown(col, row)}
                        onMouseEnter={() => handleMouseEnter(col, row)}
                        onMouseLeave={() => setHoveredCell(null)}
                        onMouseUp={handleMouseUp}
                        onClick={() => !(isZoneMode || isEraseMode) && handleCellClick(col, row)}
                        onDragOver={(e) => handleDragOver(e, col, row)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, col, row)}
                        title={tooltip}
                    >
                        {/* Exit indicator */}
                        {isExit && ExitArrow && (
                            <div className="absolute inset-0 flex items-center justify-center bg-blue-500/30 pointer-events-none z-10">
                                <div className="bg-blue-500/70 rounded-full p-1.5 shadow-lg">
                                    <ExitArrow size={14} className="text-white" />
                                </div>
                            </div>
                        )}

                        {/* Spawn marker */}
                        {spawn && (
                            <div
                                draggable
                                onDragStart={(e) => handleSpawnDragStart(e, spawn)}
                                className={`
                                    absolute inset-1 rounded-md overflow-hidden z-20
                                    flex items-center justify-center
                                    bg-gradient-to-br from-gray-800 to-gray-900
                                    border-2 ${isSelectedNpc ? 'border-yellow-400' : 'border-blue-500/50'}
                                    cursor-move shadow-lg
                                `}
                            >
                                {npcInfo?.imageUrl ? (
                                    <img
                                        src={npcInfo.imageUrl}
                                        alt={npcInfo.name}
                                        className="w-full h-full object-cover"
                                        draggable={false}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center p-1">
                                        <Users size={16} className="text-blue-400 mb-1" />
                                        <span className="text-[8px] text-white truncate max-w-full text-center">
                                            {npcInfo?.name || 'NPC'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Cell coordinate on hover */}
                        {isHovered && !spawn && (
                            <span className="absolute bottom-0.5 right-1 text-[8px] text-white/40 pointer-events-none">
                                {col},{row}
                            </span>
                        )}
                    </div>
                );
            }
        }

        return cellElements;
    }, [
        cols, rows, cellSize, spawnsByCell, zonesByCell, exitCellsMap, hoveredCell, dragOverCell,
        selectedNpcId, isZoneMode, isEraseMode, getNpcInfo, handleCellClick, handleMouseDown,
        handleMouseEnter, handleMouseUp, handleDragOver, handleDragLeave,
        handleDrop, handleSpawnDragStart,
    ]);

    return (
        <div
            className="flex-1 bg-[#0a0a0a] relative overflow-hidden"
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* Scrollable/pannable container */}
            <div className="w-full h-full overflow-hidden">
                <div
                    className="relative"
                    style={{
                        transform: `translate(${pan.x}px, ${pan.y}px)`,
                        padding: '40px',
                    }}
                >
                    {/* Background image behind the grid */}
                    <div
                        className="relative"
                        style={{ width: gridPixelWidth, height: gridPixelHeight }}
                    >
                        {roomImageUrl && (
                            <img
                                src={roomImageUrl}
                                alt="Room background"
                                className="absolute inset-0 w-full h-full object-cover rounded-lg"
                                draggable={false}
                            />
                        )}
                        {/* Dark overlay */}
                        <div className="absolute inset-0 bg-black/40 rounded-lg" />

                        {/* No image placeholder */}
                        {!roomImageUrl && (
                            <div className="absolute inset-0 bg-[#111] rounded-lg flex items-center justify-center pointer-events-none">
                                <span className="text-gray-600 text-sm">No room image</span>
                            </div>
                        )}

                        {/* Grid overlay */}
                        <div
                            className="absolute inset-0 rounded-lg overflow-hidden"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
                                gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
                                gap: `${gap}px`,
                            }}
                        >
                            {cells}
                        </div>
                    </div>
                </div>
            </div>

            {/* Tool hint overlay */}
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 pointer-events-none">
                <p className="text-xs text-gray-300">
                    {isNpcMode
                        ? (selectedNpcId
                            ? 'Click a cell to place selected NPC, or drag NPCs from the panel'
                            : 'Select an NPC from the panel, then click a cell to place')
                        : isZoneMode
                            ? `Click to paint ${selectedZoneType} zones. Click painted cells to remove.`
                            : 'Click to erase spawns or zones from cells.'
                    }
                </p>
            </div>
        </div>
    );
}
