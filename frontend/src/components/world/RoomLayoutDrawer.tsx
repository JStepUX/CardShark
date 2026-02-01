/**
 * @file RoomLayoutDrawer.tsx
 * @description Drawer component for configuring room spatial layout (NPC positions, dead zones, etc.)
 * Phase 2: NPC positioning with drag-and-drop
 * Phase 3: Dead zone painting
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { X, LayoutGrid, Users, GripVertical, MapPin, Trash2, Droplets, Square, AlertTriangle, Ban } from 'lucide-react';
import type { GridRoom } from '../../utils/worldStateApi';
import type { RoomLayoutData, SpawnPoint, ZoneType, CellPosition } from '../../types/localMap';
import { createDefaultRoomLayoutData } from '../../types/localMap';
import { RoomLayoutCanvas } from './RoomLayoutCanvas';

interface NPCDisplayInfo {
  id: string;
  name: string;
  imageUrl?: string;
  isPlaced: boolean;
  position?: { col: number; row: number };
}

interface RoomLayoutDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  room: GridRoom | null;
  worldId: string;
  availableCharacters: Array<{ id: string; name: string; imageUrl?: string }>;
  onLayoutChange?: (layoutData: RoomLayoutData) => void;
}

type ToolMode = 'npcs' | 'zones';

// Zone type configuration with colors and icons
const ZONE_TYPES: Array<{
  type: ZoneType;
  label: string;
  icon: typeof Droplets;
  colorClass: string;
  description: string;
}> = [
  { type: 'water', label: 'Water', icon: Droplets, colorClass: 'bg-blue-500', description: 'Impassable water' },
  { type: 'wall', label: 'Wall', icon: Square, colorClass: 'bg-gray-600', description: 'Blocks movement and vision' },
  { type: 'hazard', label: 'Hazard', icon: AlertTriangle, colorClass: 'bg-orange-500', description: 'Dangerous terrain' },
  { type: 'no-spawn', label: 'No-Spawn', icon: Ban, colorClass: 'bg-purple-500', description: 'Blocks NPC spawning' },
];

export function RoomLayoutDrawer({
  isOpen,
  onClose,
  room,
  worldId,
  availableCharacters,
  onLayoutChange,
}: RoomLayoutDrawerProps) {
  const [activeMode, setActiveMode] = useState<ToolMode>('npcs');
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [selectedZoneType, setSelectedZoneType] = useState<ZoneType>('water');
  const [localLayoutData, setLocalLayoutData] = useState<RoomLayoutData | null>(null);

  // Initialize local layout data when room changes
  useEffect(() => {
    if (room) {
      // Check if room has existing layout data (via room card extension)
      // For now, we'll use a default layout - the parent will provide real data
      const existingLayout = (room as any).layout_data as RoomLayoutData | undefined;
      setLocalLayoutData(existingLayout || createDefaultRoomLayoutData());
    } else {
      setLocalLayoutData(null);
    }
    setSelectedNpcId(null);
  }, [room?.id]);

  // Build list of NPCs with their placement status
  const npcList: NPCDisplayInfo[] = useMemo(() => {
    if (!room || !localLayoutData) return [];

    return room.npcs.map(npc => {
      const charInfo = availableCharacters.find(c => c.id === npc.character_uuid);
      const spawn = localLayoutData.spawns.find(s => s.entityId === npc.character_uuid);

      return {
        id: npc.character_uuid,
        name: charInfo?.name || 'Unknown NPC',
        imageUrl: charInfo?.imageUrl,
        isPlaced: !!spawn,
        position: spawn ? { col: spawn.col, row: spawn.row } : undefined,
      };
    });
  }, [room?.npcs, localLayoutData, availableCharacters]);

  // Room image URL
  const roomImageUrl = useMemo(() => {
    if (!room?.image_path) return null;
    // Handle both full paths and relative paths
    if (room.image_path.startsWith('/api/')) {
      return room.image_path;
    }
    return `/api/world-assets/${worldId}/${room.image_path.split('/').pop()}`;
  }, [room?.image_path, worldId]);

  // Update layout data and notify parent
  const updateLayout = useCallback((newLayout: RoomLayoutData) => {
    setLocalLayoutData(newLayout);
    onLayoutChange?.(newLayout);
  }, [onLayoutChange]);

  // Handle placing an NPC on the grid
  const handleCellDrop = useCallback((col: number, row: number, entityId: string) => {
    if (!localLayoutData) return;

    // Check if cell is already occupied by another NPC
    const existingSpawn = localLayoutData.spawns.find(s => s.col === col && s.row === row);
    if (existingSpawn && existingSpawn.entityId !== entityId) {
      // Cell is occupied by different NPC - swap positions or reject
      // For now, we'll just replace
    }

    // Remove existing spawn for this entity (if repositioning)
    const filteredSpawns = localLayoutData.spawns.filter(s => s.entityId !== entityId);

    // Add new spawn
    const newSpawn: SpawnPoint = { entityId, col, row };
    const newLayout: RoomLayoutData = {
      ...localLayoutData,
      spawns: [...filteredSpawns, newSpawn],
    };

    updateLayout(newLayout);
    setSelectedNpcId(entityId);
  }, [localLayoutData, updateLayout]);

  // Handle clicking a cell (select or place)
  const handleCellClick = useCallback((col: number, row: number) => {
    if (!localLayoutData) return;

    // Check if there's a spawn at this cell
    const spawn = localLayoutData.spawns.find(s => s.col === col && s.row === row);

    if (spawn) {
      // Select the NPC at this cell
      setSelectedNpcId(spawn.entityId);
    } else if (selectedNpcId) {
      // Place selected NPC at this cell
      handleCellDrop(col, row, selectedNpcId);
    }
  }, [localLayoutData, selectedNpcId, handleCellDrop]);

  // Handle NPC drag start from list
  const handleNpcDragStart = useCallback((e: React.DragEvent, npcId: string) => {
    e.dataTransfer.setData('entityId', npcId);
    e.dataTransfer.effectAllowed = 'move';
    setSelectedNpcId(npcId);
  }, []);

  // Handle removing an NPC from the grid
  const handleRemoveSpawn = useCallback((entityId: string) => {
    if (!localLayoutData) return;

    const newLayout: RoomLayoutData = {
      ...localLayoutData,
      spawns: localLayoutData.spawns.filter(s => s.entityId !== entityId),
    };

    updateLayout(newLayout);
    if (selectedNpcId === entityId) {
      setSelectedNpcId(null);
    }
  }, [localLayoutData, selectedNpcId, updateLayout]);

  // Handle clicking NPC in list
  const handleNpcClick = useCallback((npcId: string) => {
    setSelectedNpcId(prev => prev === npcId ? null : npcId);
  }, []);

  // Handle painting a zone cell
  const handleZonePaint = useCallback((col: number, row: number) => {
    if (!localLayoutData || activeMode !== 'zones') return;

    // Check if cell is already in this zone type
    const existingZoneIndex = localLayoutData.deadZones.findIndex(
      z => z.type === selectedZoneType && z.cells.some(c => c.col === col && c.row === row)
    );

    if (existingZoneIndex >= 0) {
      // Cell already painted with this zone type - do nothing (use handleZoneUnpaint to remove)
      return;
    }

    // Remove cell from any other zone type first
    const cleanedZones = localLayoutData.deadZones.map(zone => ({
      ...zone,
      cells: zone.cells.filter(c => !(c.col === col && c.row === row)),
    })).filter(zone => zone.cells.length > 0);

    // Find or create zone for this type
    const zoneIndex = cleanedZones.findIndex(z => z.type === selectedZoneType);
    const newCell: CellPosition = { col, row };

    if (zoneIndex >= 0) {
      // Add to existing zone
      cleanedZones[zoneIndex] = {
        ...cleanedZones[zoneIndex],
        cells: [...cleanedZones[zoneIndex].cells, newCell],
      };
    } else {
      // Create new zone
      cleanedZones.push({
        type: selectedZoneType,
        cells: [newCell],
      });
    }

    const newLayout: RoomLayoutData = {
      ...localLayoutData,
      deadZones: cleanedZones,
    };

    updateLayout(newLayout);
  }, [localLayoutData, activeMode, selectedZoneType, updateLayout]);

  // Handle removing a zone cell
  const handleZoneUnpaint = useCallback((col: number, row: number) => {
    if (!localLayoutData) return;

    const cleanedZones = localLayoutData.deadZones.map(zone => ({
      ...zone,
      cells: zone.cells.filter(c => !(c.col === col && c.row === row)),
    })).filter(zone => zone.cells.length > 0);

    const newLayout: RoomLayoutData = {
      ...localLayoutData,
      deadZones: cleanedZones,
    };

    updateLayout(newLayout);
  }, [localLayoutData, updateLayout]);

  // Count cells per zone type for display
  const zoneCounts = useMemo(() => {
    if (!localLayoutData) return {};
    const counts: Record<string, number> = {};
    for (const zone of localLayoutData.deadZones) {
      counts[zone.type] = (counts[zone.type] || 0) + zone.cells.length;
    }
    return counts;
  }, [localLayoutData]);

  return (
    <div
      className={`
        bg-[#141414] border-l border-[#2a2a2a]
        flex flex-col shadow-2xl transition-all duration-300 ease-out overflow-hidden
        ${isOpen && room ? 'w-[500px]' : 'w-0'}
      `}
    >
      {/* Header */}
      <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid size={18} className="text-blue-400" />
          <h3 className="text-sm font-medium text-white">Room Layout Editor</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-[#2a2a2a] rounded transition-colors"
        >
          <X size={16} className="text-gray-400" />
        </button>
      </div>

      {/* Tool Mode Tabs */}
      <div className="px-4 py-2 border-b border-[#2a2a2a] flex gap-2">
        <button
          onClick={() => setActiveMode('npcs')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            activeMode === 'npcs'
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white border border-transparent'
          }`}
        >
          <Users size={14} />
          NPCs
        </button>
        <button
          onClick={() => setActiveMode('zones')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            activeMode === 'zones'
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white border border-transparent'
          }`}
        >
          <MapPin size={14} />
          Dead Zones
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {room && localLayoutData ? (
          <div className="space-y-4">
            {/* Room Info */}
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3">
              <h4 className="text-sm font-medium text-white mb-1">{room.name}</h4>
              <p className="text-xs text-gray-500">
                Grid: {localLayoutData.gridSize.cols} x {localLayoutData.gridSize.rows} |
                NPCs: {room.npcs.length} ({npcList.filter(n => n.isPlaced).length} placed)
              </p>
            </div>

            {/* Zone Type Selector (only in zones mode) */}
            {activeMode === 'zones' && (
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                  Zone Type
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {ZONE_TYPES.map(zone => {
                    const Icon = zone.icon;
                    const count = zoneCounts[zone.type] || 0;
                    return (
                      <button
                        key={zone.type}
                        onClick={() => setSelectedZoneType(zone.type)}
                        className={`flex items-center gap-2 p-2 rounded-lg text-sm transition-colors ${
                          selectedZoneType === zone.type
                            ? 'bg-[#2a2a2a] ring-2 ring-blue-500'
                            : 'hover:bg-[#222]'
                        }`}
                        title={zone.description}
                      >
                        <div className={`w-4 h-4 rounded ${zone.colorClass}`} />
                        <Icon size={14} className="text-gray-400" />
                        <span className="text-white text-xs">{zone.label}</span>
                        {count > 0 && (
                          <span className="text-xs text-gray-500 ml-auto">({count})</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Grid Canvas */}
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-2">
                {activeMode === 'npcs'
                  ? (selectedNpcId
                      ? 'Click a cell to place selected NPC, or drag NPCs from the list below'
                      : 'Drag NPCs from the list below onto the grid, or click an NPC then click a cell')
                  : `Click cells to paint ${selectedZoneType} zones. Click painted cells to remove.`
                }
              </p>
              <RoomLayoutCanvas
                roomImageUrl={roomImageUrl}
                layoutData={localLayoutData}
                npcs={npcList.map(n => ({ id: n.id, name: n.name, imageUrl: n.imageUrl }))}
                selectedNpcId={activeMode === 'npcs' ? selectedNpcId : null}
                activeZoneType={activeMode === 'zones' ? selectedZoneType : undefined}
                onCellClick={activeMode === 'npcs' ? handleCellClick : handleZonePaint}
                onCellDrop={activeMode === 'npcs' ? handleCellDrop : undefined}
                onZoneUnpaint={activeMode === 'zones' ? handleZoneUnpaint : undefined}
              />
            </div>

            {/* NPC List (only in npcs mode) */}
            {activeMode === 'npcs' && (
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
                <div className="p-3 border-b border-[#2a2a2a]">
                  <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                    Room NPCs
                  </h4>
                </div>

                {npcList.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No NPCs assigned to this room
                  </div>
                ) : (
                  <div className="divide-y divide-[#2a2a2a]">
                    {npcList.map(npc => (
                      <div
                        key={npc.id}
                        draggable
                        onDragStart={(e) => handleNpcDragStart(e, npc.id)}
                        onClick={() => handleNpcClick(npc.id)}
                        className={`
                          flex items-center gap-3 p-3 cursor-pointer transition-colors
                          ${selectedNpcId === npc.id ? 'bg-blue-900/30' : 'hover:bg-[#222]'}
                        `}
                      >
                        {/* Drag handle */}
                        <GripVertical size={14} className="text-gray-600 shrink-0" />

                        {/* Portrait */}
                        <div className="w-10 h-10 rounded bg-[#0a0a0a] shrink-0 overflow-hidden">
                          {npc.imageUrl ? (
                            <img
                              src={npc.imageUrl}
                              alt={npc.name}
                              className="w-full h-full object-cover"
                              draggable={false}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Users size={16} className="text-gray-600" />
                            </div>
                          )}
                        </div>

                        {/* Name and position */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{npc.name}</p>
                          <p className="text-xs text-gray-500">
                            {npc.isPlaced && npc.position
                              ? `Position: (${npc.position.col}, ${npc.position.row})`
                              : 'Not placed'}
                          </p>
                        </div>

                        {/* Placement indicator / remove button */}
                        {npc.isPlaced ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveSpawn(npc.id);
                            }}
                            className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                            title="Remove from grid"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : (
                          <span className="text-xs text-gray-600 bg-[#0a0a0a] px-2 py-1 rounded">
                            Drag to place
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Zone Summary (only in zones mode) */}
            {activeMode === 'zones' && (
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                  Zone Summary
                </h4>
                <div className="space-y-1">
                  {ZONE_TYPES.map(zone => {
                    const count = zoneCounts[zone.type] || 0;
                    return (
                      <div key={zone.type} className="flex items-center gap-2 text-xs">
                        <div className={`w-3 h-3 rounded ${zone.colorClass}`} />
                        <span className="text-gray-400">{zone.label}:</span>
                        <span className="text-white">{count} cell{count !== 1 ? 's' : ''}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Help text */}
            <div className="text-xs text-gray-600 space-y-1">
              <p><strong>Tips:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                {activeMode === 'npcs' ? (
                  <>
                    <li>Drag NPCs from the list onto grid cells</li>
                    <li>Drag placed NPCs to reposition them</li>
                    <li>Click the trash icon to remove placement</li>
                    <li>Unplaced NPCs will spawn at default positions</li>
                  </>
                ) : (
                  <>
                    <li>Select a zone type above, then click cells to paint</li>
                    <li>Click a painted cell to remove it</li>
                    <li>Water and walls block movement</li>
                    <li>Hazards are traversable but dangerous</li>
                    <li>No-Spawn zones prevent NPC auto-placement</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center">
            <div className="text-gray-500 text-sm">
              <p>No room selected</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
