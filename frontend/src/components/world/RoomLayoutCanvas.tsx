/**
 * @file RoomLayoutCanvas.tsx
 * @description DOM-based grid editor for room layout configuration.
 * Uses CSS Grid (not PixiJS) to display room image with grid overlay.
 * Supports NPC spawn placement via drag-and-drop.
 * Supports dead zone painting via click.
 */
import { useState, useCallback, useMemo, useRef } from 'react';
import { Users, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import type { RoomLayoutData, SpawnPoint, CellPosition, ZoneType, ExitDirection } from '../../types/localMap';
import { DEFAULT_LAYOUT_GRID_SIZE } from '../../types/localMap';
import { getExitPosition } from '../../utils/localMapUtils';

interface NPCInfo {
  id: string;
  name: string;
  imageUrl?: string;
}

interface RoomLayoutCanvasProps {
  roomImageUrl?: string | null;
  layoutData: RoomLayoutData;
  npcs: NPCInfo[];
  selectedNpcId: string | null;
  activeZoneType?: ZoneType;  // When set, clicking paints zones instead of placing NPCs
  onCellClick: (col: number, row: number) => void;
  onCellDrop?: (col: number, row: number, entityId: string) => void;
  onSpawnDragStart?: (spawn: SpawnPoint) => void;
  onZoneUnpaint?: (col: number, row: number) => void;  // Called when clicking a painted zone cell
  exitDirections?: ExitDirection[];  // Directions where exits exist (prevents zone painting)
}

// Arrow icons for exit directions
const EXIT_ARROWS: Record<ExitDirection, typeof ArrowUp> = {
  north: ArrowUp,
  south: ArrowDown,
  east: ArrowRight,
  west: ArrowLeft,
};

// Zone type colors for visual feedback
const ZONE_COLORS: Record<string, string> = {
  water: 'bg-blue-500/40',
  wall: 'bg-gray-600/60',
  hazard: 'bg-orange-500/40',
  'no-spawn': 'bg-purple-500/30',
};

export function RoomLayoutCanvas({
  roomImageUrl,
  layoutData,
  npcs,
  selectedNpcId,
  activeZoneType,
  onCellClick,
  onCellDrop,
  onSpawnDragStart,
  onZoneUnpaint,
  exitDirections = [],
}: RoomLayoutCanvasProps) {
  const [hoveredCell, setHoveredCell] = useState<CellPosition | null>(null);
  const [dragOverCell, setDragOverCell] = useState<CellPosition | null>(null);
  const [isPainting, setIsPainting] = useState(false);  // Track mouse-drag painting
  const gridRef = useRef<HTMLDivElement>(null);

  const isZoneMode = !!activeZoneType;

  const { cols, rows } = layoutData.gridSize || DEFAULT_LAYOUT_GRID_SIZE;

  // Build a map of spawns by cell position for quick lookup
  const spawnsByCell = useMemo(() => {
    const map = new Map<string, SpawnPoint>();
    for (const spawn of layoutData.spawns) {
      map.set(`${spawn.col},${spawn.row}`, spawn);
    }
    return map;
  }, [layoutData.spawns]);

  // Build a map of zones by cell position
  const zonesByCell = useMemo(() => {
    const map = new Map<string, string>();
    for (const zone of layoutData.deadZones) {
      for (const cell of zone.cells) {
        map.set(`${cell.col},${cell.row}`, zone.type);
      }
    }
    return map;
  }, [layoutData.deadZones]);

  // Build a map of exit cells - these are protected from zone painting
  const exitCellsMap = useMemo(() => {
    const map = new Map<string, ExitDirection>();
    // tileSize is unused by getExitPosition, but required by the type
    const config = { gridWidth: cols, gridHeight: rows, tileSize: 1 };
    for (const dir of exitDirections) {
      const pos = getExitPosition(dir, config);
      // getExitPosition returns {x, y} but our grid uses {col, row}
      map.set(`${pos.x},${pos.y}`, dir);
    }
    return map;
  }, [exitDirections, cols, rows]);

  // Get NPC info by ID
  const getNpcInfo = useCallback((entityId: string): NPCInfo | undefined => {
    return npcs.find(n => n.id === entityId);
  }, [npcs]);

  // Handle cell click - in zone mode, check if we should paint or unpaint
  const handleCellClick = useCallback((col: number, row: number) => {
    const cellKey = `${col},${row}`;

    // Block zone painting on exit cells
    if (isZoneMode && exitCellsMap.has(cellKey)) {
      return; // Exit cells are protected
    }

    if (isZoneMode) {
      const existingZone = zonesByCell.get(cellKey);

      if (existingZone) {
        // Cell is already painted - unpaint it
        onZoneUnpaint?.(col, row);
      } else {
        // Cell is empty - paint it
        onCellClick(col, row);
      }
    } else {
      onCellClick(col, row);
    }
  }, [isZoneMode, zonesByCell, exitCellsMap, onCellClick, onZoneUnpaint]);

  // Handle mouse down for drag painting
  const handleMouseDown = useCallback((col: number, row: number) => {
    if (isZoneMode) {
      setIsPainting(true);
      handleCellClick(col, row);
    }
  }, [isZoneMode, handleCellClick]);

  // Handle mouse enter while painting
  const handleMouseEnter = useCallback((col: number, row: number) => {
    setHoveredCell({ col, row });
    if (isZoneMode && isPainting) {
      const cellKey = `${col},${row}`;
      // Skip exit cells and already-painted cells
      if (!zonesByCell.has(cellKey) && !exitCellsMap.has(cellKey)) {
        onCellClick(col, row);  // Paint while dragging
      }
    }
  }, [isZoneMode, isPainting, zonesByCell, exitCellsMap, onCellClick]);

  // Handle mouse up to stop painting
  const handleMouseUp = useCallback(() => {
    setIsPainting(false);
  }, []);

  // Handle drag over cell
  const handleDragOver = useCallback((e: React.DragEvent, col: number, row: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCell({ col, row });
  }, []);

  // Handle drag leave
  const handleDragLeave = useCallback(() => {
    setDragOverCell(null);
  }, []);

  // Handle drop on cell
  const handleDrop = useCallback((e: React.DragEvent, col: number, row: number) => {
    e.preventDefault();
    setDragOverCell(null);
    const entityId = e.dataTransfer.getData('entityId');
    if (entityId && onCellDrop) {
      onCellDrop(col, row, entityId);
    }
  }, [onCellDrop]);

  // Handle spawn drag start (for repositioning existing spawns)
  const handleSpawnDragStart = useCallback((e: React.DragEvent, spawn: SpawnPoint) => {
    e.dataTransfer.setData('entityId', spawn.entityId);
    e.dataTransfer.effectAllowed = 'move';
    onSpawnDragStart?.(spawn);
  }, [onSpawnDragStart]);

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

        // Determine cell background
        let cellBgClass = 'bg-transparent';
        if (zoneType) {
          cellBgClass = ZONE_COLORS[zoneType] || 'bg-gray-500/30';
        }

        // Build tooltip
        let tooltip = `Cell (${col}, ${row})`;
        if (isExit) tooltip = `Exit ${exitDir} (protected)`;
        else if (spawn) tooltip = `${npcInfo?.name || spawn.entityId} at (${col}, ${row})`;
        else if (zoneType) tooltip = `${zoneType} zone at (${col}, ${row})`;

        // Get exit arrow icon if this is an exit cell
        const ExitArrow = exitDir ? EXIT_ARROWS[exitDir] : null;

        cellElements.push(
          <div
            key={cellKey}
            className={`
              relative border transition-all select-none
              ${isExit ? 'border-blue-400/60' : 'border-white/20'}
              ${isZoneMode && isExit ? 'cursor-not-allowed' : 'cursor-pointer'}
              ${cellBgClass}
              ${isHovered && !spawn && !zoneType && !isExit ? 'bg-blue-500/20' : ''}
              ${isHovered && isZoneMode && !zoneType && !isExit ? 'bg-blue-500/30' : ''}
              ${isDragOver ? 'bg-green-500/30 border-green-400' : ''}
              ${isSelectedNpc ? 'ring-2 ring-yellow-400' : ''}
            `}
            onMouseDown={() => handleMouseDown(col, row)}
            onMouseEnter={() => handleMouseEnter(col, row)}
            onMouseLeave={() => setHoveredCell(null)}
            onMouseUp={handleMouseUp}
            onClick={() => !isZoneMode && handleCellClick(col, row)}
            onDragOver={(e) => handleDragOver(e, col, row)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col, row)}
            title={tooltip}
          >
            {/* Exit indicator */}
            {isExit && ExitArrow && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-500/30 pointer-events-none">
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
                  absolute inset-1 rounded-md overflow-hidden
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

            {/* Cell position indicator (debug/subtle) */}
            {isHovered && !spawn && (
              <span className="absolute bottom-0.5 right-1 text-[8px] text-white/40">
                {col},{row}
              </span>
            )}
          </div>
        );
      }
    }

    return cellElements;
  }, [
    cols, rows, spawnsByCell, zonesByCell, exitCellsMap, hoveredCell, dragOverCell,
    selectedNpcId, isZoneMode, getNpcInfo, handleCellClick, handleMouseDown,
    handleMouseEnter, handleMouseUp, handleDragOver, handleDragLeave,
    handleDrop, handleSpawnDragStart
  ]);

  return (
    <div
      className="relative w-full"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Container with aspect ratio matching 5:8 grid */}
      <div
        className="relative w-full"
        style={{ paddingBottom: `${(rows / cols) * 100}%` }}
      >
        {/* Background image */}
        {roomImageUrl && (
          <img
            src={roomImageUrl}
            alt="Room background"
            className="absolute inset-0 w-full h-full object-cover rounded-lg"
            draggable={false}
          />
        )}

        {/* Dark overlay for better grid visibility */}
        <div className="absolute inset-0 bg-black/30 rounded-lg" />

        {/* Grid overlay */}
        <div
          ref={gridRef}
          className="absolute inset-0 rounded-lg overflow-hidden"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {cells}
        </div>

        {/* No image placeholder */}
        {!roomImageUrl && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-gray-600 text-sm">No room image</span>
          </div>
        )}
      </div>
    </div>
  );
}
