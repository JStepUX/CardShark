/**
 * @file WorldEditor.tsx
 * @description World Builder with unified grid editor. World view ↔ Room view navigation.
 * @dependencies worldApi (V2), roomApi, WorldGridView, RoomGridView, EditorHeader, EditorToolbar,
 *               RoomPropertiesPanel, NPCPickerModal, CellActionMenu, RoomGalleryPicker
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WorldGridView, type Tool } from '../components/world/WorldGridView';
import { RoomGridView } from '../components/world/RoomGridView';
import { EditorHeader } from '../components/world/EditorHeader';
import { EditorToolbar } from '../components/world/EditorToolbar';
import { RoomPropertiesPanel } from '../components/world/RoomPropertiesPanel';
import { NPCPickerModal } from '../components/world/NPCPickerModal';
import { CellActionMenu } from '../components/world/CellActionMenu';
import { RoomGalleryPicker } from '../components/world/RoomGalleryPicker';
import { worldApi } from '../api/worldApi';
import { roomApi } from '../api/roomApi';
import type { WorldCard, WorldRoomPlacement } from '../types/worldCard';
import type { RoomCardSummary } from '../types/room';
import type { GridRoom } from '../types/worldGrid';
import type { RoomLayoutData, ExitDirection, ZoneType, CellPosition } from '../types/localMap';
import { cleanOrphanedSpawns, createDefaultRoomLayoutData } from '../types/localMap';
import { EDITOR_GRID_SIZE } from '../types/editorGrid';
import type { RoomEditorTool } from '../types/editorGrid';
import { roomCardToGridRoom } from '../utils/roomCardAdapter';
import { useGridViewport } from '../hooks/useGridViewport';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { WorldLoadError } from '../components/world/WorldLoadError';
import { useAPIConfig } from '../contexts/APIConfigContext';

interface WorldEditorProps {
  worldId?: string;
  onBack?: () => void;
}

export function WorldEditor({ worldId: propWorldId, onBack }: WorldEditorProps) {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { apiConfig } = useAPIConfig();

  const worldId = propWorldId || uuid || '';

  // Core state
  const [worldCard, setWorldCard] = useState<WorldCard | null>(null);
  const [rooms, setRooms] = useState<GridRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<GridRoom | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableCharacters, setAvailableCharacters] = useState<{ id: string; name: string; imageUrl: string; tags: string[] }[]>([]);
  const [missingRoomCount, setMissingRoomCount] = useState(0);
  const [showMissingRoomWarning, setShowMissingRoomWarning] = useState(false);

  // Navigation state
  const [editorView, setEditorView] = useState<'world' | 'room'>('world');

  // World-level tools
  const [activeTool, setActiveTool] = useState<Tool>('edit');

  // Room-level tools
  const [activeRoomTool, setActiveRoomTool] = useState<RoomEditorTool>('pan');
  const [selectedZoneType, setSelectedZoneType] = useState<ZoneType>('water');
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);

  // Grid size state
  const [gridSize, setGridSize] = useState<{ width: number; height: number }>({ width: EDITOR_GRID_SIZE.cols, height: EDITOR_GRID_SIZE.rows });

  // Cell action menu
  const [showCellMenu, setShowCellMenu] = useState(false);
  const [cellMenuPosition, setCellMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);

  // Modals
  const [showNPCPicker, setShowNPCPicker] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);

  // NPC placement target cell (when placing via grid click)
  const [npcPlacementCell, setNpcPlacementCell] = useState<{ col: number; row: number } | null>(null);

  // Shared viewport
  const [viewport, viewportHandlers] = useGridViewport();

  // World context for AI generation
  const worldContext = useMemo(() => {
    if (!worldCard) return undefined;
    return { name: worldCard.data.name, description: worldCard.data.description || '' };
  }, [worldCard]);

  // Current room's layout data (auto-upgrade old rooms with smaller grids)
  const currentLayoutData = useMemo(() => {
    if (!selectedRoom) return createDefaultRoomLayoutData();
    const data = (selectedRoom as GridRoom & { layout_data?: RoomLayoutData }).layout_data || createDefaultRoomLayoutData();
    if (data.gridSize.cols < EDITOR_GRID_SIZE.cols || data.gridSize.rows < EDITOR_GRID_SIZE.rows) {
      return {
        ...data,
        gridSize: {
          cols: Math.max(data.gridSize.cols, EDITOR_GRID_SIZE.cols),
          rows: Math.max(data.gridSize.rows, EDITOR_GRID_SIZE.rows),
        },
      };
    }
    return data;
  }, [selectedRoom]);

  // NPC info list for the current room
  const currentRoomNpcs = useMemo(() => {
    if (!selectedRoom) return [];
    return selectedRoom.npcs.map(npc => {
      const char = availableCharacters.find(c => c.id === npc.character_uuid);
      return {
        id: npc.character_uuid,
        name: char?.name || 'Unknown NPC',
        imageUrl: char?.imageUrl,
      };
    });
  }, [selectedRoom, availableCharacters]);

  // Exit directions for current room (computed from world grid adjacency)
  const currentExitDirections = useMemo((): ExitDirection[] => {
    if (!selectedRoom) return [];
    const { x, y } = selectedRoom.position;
    const dirs: ExitDirection[] = [];
    if (rooms.some(r => r.id !== selectedRoom.id && r.position.x === x && r.position.y === y - 1)) dirs.push('north');
    if (rooms.some(r => r.id !== selectedRoom.id && r.position.x === x && r.position.y === y + 1)) dirs.push('south');
    if (rooms.some(r => r.id !== selectedRoom.id && r.position.x === x + 1 && r.position.y === y)) dirs.push('east');
    if (rooms.some(r => r.id !== selectedRoom.id && r.position.x === x - 1 && r.position.y === y)) dirs.push('west');
    return dirs;
  }, [selectedRoom, rooms]);

  // --- Load world data ---
  useEffect(() => {
    async function loadData() {
      if (!worldId) {
        setError('No world ID provided');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const world = await worldApi.getWorld(worldId);
        setWorldCard(world);

        const worldData = world.data.extensions.world_data;
        setGridSize(worldData.grid_size);

        const loadedRooms: GridRoom[] = [];
        let missingRooms = 0;
        for (const placement of worldData.rooms) {
          try {
            const roomCard = await roomApi.getRoom(placement.room_uuid);
            const gridRoom = roomCardToGridRoom(roomCard, placement.grid_position, placement);
            loadedRooms.push(gridRoom);
          } catch (err) {
            console.warn(`Failed to load room ${placement.room_uuid}:`, err);
            missingRooms++;
          }
        }
        setRooms(loadedRooms);

        if (missingRooms > 0) {
          setMissingRoomCount(missingRooms);
          setShowMissingRoomWarning(true);
        }

        const charResponse = await fetch('/api/characters');
        if (charResponse.ok) {
          const charData = await charResponse.json();
          const charList = charData.characters || charData.data || charData || [];
          const characters = charList
            .filter((c: Record<string, unknown>) => {
              const ext = c.extensions_json as Record<string, unknown> | undefined;
              const cardType = ext?.card_type || c.card_type;
              return cardType !== 'world' && cardType !== 'room';
            })
            .map((c: Record<string, unknown>) => {
              const charUuid = c.character_uuid as string;
              const timestamp = c.updated_at ? new Date(c.updated_at as string).getTime() : Date.now();
              return {
                id: charUuid,
                name: c.name as string,
                imageUrl: charUuid ? `/api/character-image/${charUuid}?t=${timestamp}` : '/pngPlaceholder.png',
                tags: (c.tags as string[]) || [],
              };
            });
          setAvailableCharacters(characters);
        }
      } catch (err) {
        console.error('Error loading world editor data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load world');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [worldId]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (editorView === 'world') {
        switch (e.key.toLowerCase()) {
          case 'e': setActiveTool('edit'); break;
          case 'm': setActiveTool('move'); break;
          case 'd': setActiveTool('eraser'); break;
          case 'escape': setSelectedRoom(null); break;
          case 'delete':
          case 'backspace':
            if (selectedRoom && !e.repeat) handleRoomDelete(selectedRoom.id);
            break;
        }
      } else {
        if (e.key === 'Escape') {
          setActiveRoomTool('pan');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorView, selectedRoom]);

  // --- Navigation ---
  const navigateToRoom = useCallback((room: GridRoom) => {
    setSelectedRoom(room);
    setEditorView('room');
    setSelectedNpcId(null);
    viewportHandlers.resetView();
  }, [viewportHandlers]);

  const navigateToWorld = useCallback(() => {
    setEditorView('world');
    setSelectedNpcId(null);
    viewportHandlers.resetView();
  }, [viewportHandlers]);

  // --- Cell actions (world view) ---
  const handleCellClick = useCallback((position: { x: number; y: number }, event: React.MouseEvent) => {
    const room = rooms.find(r => r.position.x === position.x && r.position.y === position.y);
    if (room) {
      navigateToRoom(room);
    } else {
      setSelectedCell(position);
      setCellMenuPosition({ x: event.clientX, y: event.clientY });
      setShowCellMenu(true);
    }
  }, [rooms, navigateToRoom]);

  const handleCreateNewRoom = useCallback(async () => {
    if (!selectedCell) return;

    try {
      const roomSummary = await roomApi.createRoom({ name: 'New Room', description: '' });
      const newRoom: GridRoom = {
        id: roomSummary.uuid,
        name: roomSummary.name,
        description: roomSummary.description,
        introduction_text: '',
        npcs: [],
        events: [],
        connections: { north: null, south: null, east: null, west: null },
        position: selectedCell,
      };

      setRooms(prev => [...prev, newRoom]);
      setIsDirty(true);
      navigateToRoom(newRoom);
    } catch (err) {
      console.error('Failed to create room:', err);
      setError(err instanceof Error ? err.message : 'Failed to create room');
    }
  }, [selectedCell, navigateToRoom]);

  const handleImportFromGallery = useCallback(() => {
    setShowRoomPicker(true);
  }, []);

  const handleRoomImport = useCallback((roomSummary: RoomCardSummary) => {
    if (!selectedCell) return;

    roomApi.getRoom(roomSummary.uuid).then(roomCard => {
      const newRoom = roomCardToGridRoom(roomCard, selectedCell);
      setRooms(prev => [...prev, newRoom]);
      setIsDirty(true);
      setShowRoomPicker(false);
      navigateToRoom(newRoom);
    }).catch(err => {
      console.error('Failed to import room:', err);
      setError(err instanceof Error ? err.message : 'Failed to import room');
    });
  }, [selectedCell, navigateToRoom]);

  const handleRoomCreate = useCallback((position: { x: number; y: number }) => {
    const mockEvent = { clientX: 0, clientY: 0 } as React.MouseEvent;
    handleCellClick(position, mockEvent);
  }, [handleCellClick]);

  const handleEditRoom = useCallback(() => {
    if (!selectedCell) return;
    const room = rooms.find(r => r.position.x === selectedCell.x && r.position.y === selectedCell.y);
    if (room) navigateToRoom(room);
  }, [selectedCell, rooms, navigateToRoom]);

  const handleRemoveRoom = useCallback(() => {
    if (!selectedCell) return;
    const room = rooms.find(r => r.position.x === selectedCell.x && r.position.y === selectedCell.y);
    if (room) {
      setRooms(prev => prev.filter(r => r.id !== room.id));
      if (selectedRoom?.id === room.id) setSelectedRoom(null);
      setIsDirty(true);
    }
  }, [selectedCell, rooms, selectedRoom?.id]);

  const handleRoomDelete = useCallback((roomId: string) => {
    setRooms(prev => prev.filter(r => r.id !== roomId));
    if (selectedRoom?.id === roomId) {
      setSelectedRoom(null);
      if (editorView === 'room') setEditorView('world');
    }
    setIsDirty(true);
  }, [selectedRoom?.id, editorView]);

  const handleRemoveSelectedRoom = useCallback(() => {
    if (!selectedRoom) return;
    setRooms(prev => prev.filter(r => r.id !== selectedRoom.id));
    setSelectedRoom(null);
    setEditorView('world');
    setIsDirty(true);
  }, [selectedRoom]);

  // --- Room updates ---
  const debouncedRoomSaveRef = useRef<{ [roomId: string]: NodeJS.Timeout }>({});

  const handleRoomUpdate = useCallback(async (updatedRoom: GridRoom) => {
    setRooms(prev => prev.map(r => r.id === updatedRoom.id ? updatedRoom : r));
    setSelectedRoom(updatedRoom);
    setIsDirty(true);

    if (debouncedRoomSaveRef.current[updatedRoom.id]) {
      clearTimeout(debouncedRoomSaveRef.current[updatedRoom.id]);
    }

    debouncedRoomSaveRef.current[updatedRoom.id] = setTimeout(async () => {
      try {
        await roomApi.updateRoom(updatedRoom.id, {
          name: updatedRoom.name,
          description: updatedRoom.description,
          first_mes: updatedRoom.introduction_text || undefined,
          layout_data: (updatedRoom as GridRoom & { layout_data?: RoomLayoutData }).layout_data || undefined,
        });
      } catch (err) {
        console.error('Failed to update room card:', err);
      }
    }, 1000);
  }, []);

  const handleLayoutChange = useCallback((layoutData: RoomLayoutData) => {
    if (!selectedRoom) return;
    const updatedRoom = { ...selectedRoom, layout_data: layoutData } as GridRoom & { layout_data: RoomLayoutData };
    handleRoomUpdate(updatedRoom);
  }, [selectedRoom, handleRoomUpdate]);

  useEffect(() => {
    return () => {
      Object.values(debouncedRoomSaveRef.current).forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  const handleRoomMove = useCallback((roomId: string, newPosition: { x: number; y: number }) => {
    const isOccupied = rooms.some(r => r.position.x === newPosition.x && r.position.y === newPosition.y && r.id !== roomId);
    if (isOccupied) return;

    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, position: newPosition } : r));
    setIsDirty(true);
  }, [rooms]);

  // Handle NPC picker opened from grid cell click
  const handleRequestNpcPicker = useCallback((cell: CellPosition) => {
    setNpcPlacementCell(cell);
    setShowNPCPicker(true);
  }, []);

  const handleNPCsConfirm = useCallback((npcs: import('../types/room').RoomNPC[]) => {
    if (selectedRoom) {
      const layoutData = (selectedRoom as GridRoom & { layout_data?: RoomLayoutData }).layout_data || currentLayoutData;

      if (npcPlacementCell) {
        // Cell-click flow: merge new selections into existing room NPCs, place at target cell
        const existingNpcIds = new Set(selectedRoom.npcs.map(n => n.character_uuid));
        const newNpcs = npcs.filter(n => !existingNpcIds.has(n.character_uuid));
        const mergedNpcs = [...selectedRoom.npcs, ...newNpcs];
        const allNpcIds = mergedNpcs.map(n => n.character_uuid);
        const cleanedLayout = cleanOrphanedSpawns(layoutData, allNpcIds);

        // Create spawns for newly placed NPCs at the target cell
        const newSpawns = newNpcs.map(n => ({
          entityId: n.character_uuid,
          col: npcPlacementCell.col,
          row: npcPlacementCell.row,
        }));
        const updatedLayout = { ...cleanedLayout, spawns: [...cleanedLayout.spawns, ...newSpawns] };

        handleRoomUpdate({
          ...selectedRoom,
          npcs: mergedNpcs,
          layout_data: updatedLayout,
        });
      } else {
        // Panel flow: replace room NPC list entirely (manage mode)
        const npcIds = npcs.map(n => n.character_uuid);
        const cleanedLayout = cleanOrphanedSpawns(layoutData, npcIds);
        handleRoomUpdate({
          ...selectedRoom,
          npcs,
          layout_data: cleanedLayout,
        });
      }
    }
    setShowNPCPicker(false);
    setNpcPlacementCell(null);
  }, [selectedRoom, handleRoomUpdate, npcPlacementCell, currentLayoutData]);

  // --- Save ---
  const handleSave = useCallback(async () => {
    if (!worldCard || !worldId) return;

    try {
      const roomPlacements: WorldRoomPlacement[] = rooms.map(room => ({
        room_uuid: room.id,
        grid_position: room.position,
        instance_name: room.name,
        instance_description: room.description || undefined,
        instance_npcs: room.npcs.length > 0 ? room.npcs : undefined,
        instance_image_path: room.image_path || undefined,
      }));

      let maxX = gridSize.width - 1;
      let maxY = gridSize.height - 1;
      rooms.forEach(room => {
        maxX = Math.max(maxX, room.position.x);
        maxY = Math.max(maxY, room.position.y);
      });

      const saveWidth = maxX + 1;
      const saveHeight = maxY + 1;

      const worldData = worldCard.data.extensions.world_data;
      const currentStart = worldData.starting_position || { x: 0, y: 0 };
      const hasRoomAtStart = roomPlacements.some(
        r => r.grid_position.x === currentStart.x && r.grid_position.y === currentStart.y
      );

      let updatePayload: Parameters<typeof worldApi.updateWorld>[1] = {
        rooms: roomPlacements,
        grid_size: { width: saveWidth, height: saveHeight },
      };

      if (!hasRoomAtStart && roomPlacements.length > 0) {
        const sorted = [...roomPlacements].sort((a, b) =>
          a.grid_position.y - b.grid_position.y || a.grid_position.x - b.grid_position.x
        );
        const newStart = sorted[0].grid_position;
        updatePayload = { ...updatePayload, starting_position: newStart, player_position: newStart };
      }

      await worldApi.updateWorld(worldId, updatePayload);
      setIsDirty(false);

      if (saveWidth > gridSize.width || saveHeight > gridSize.height) {
        setGridSize({ width: saveWidth, height: saveHeight });
      }
    } catch (err) {
      console.error('Error saving world:', err);
      setError(err instanceof Error ? err.message : 'Failed to save world');
    }
  }, [worldCard, worldId, rooms, gridSize]);

  const handleBack = useCallback(() => {
    if (onBack) onBack();
    else navigate(-1);
  }, [onBack, navigate]);

  // --- Loading / error states ---
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading world editor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-white">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button onClick={handleBack} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!worldCard) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-white">
        <div>World not found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* Missing Rooms Warning */}
      {showMissingRoomWarning && missingRoomCount > 0 && (
        <div className="bg-amber-900/90 border-b border-amber-700 px-4 py-2 flex items-center justify-between z-50">
          <span className="text-amber-200 text-sm">
            {missingRoomCount} room{missingRoomCount !== 1 ? 's were' : ' was'} not found and removed from the grid. Save to update.
          </span>
          <button
            onClick={() => setShowMissingRoomWarning(false)}
            className="text-amber-200 hover:text-white px-2 py-1 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <EditorHeader
        worldName={worldCard.data.name}
        worldDescription={worldCard.data.description}
        roomName={editorView === 'room' ? selectedRoom?.name : undefined}
        editorView={editorView}
        isDirty={isDirty}
        onBack={handleBack}
        onSave={handleSave}
        onNavigateToWorld={navigateToWorld}
      />

      {/* Toolbar */}
      <EditorToolbar
        editorView={editorView}
        activeTool={activeTool}
        onToolChange={setActiveTool}
        activeRoomTool={activeRoomTool}
        onRoomToolChange={setActiveRoomTool}
        selectedZoneType={selectedZoneType}
        onZoneTypeChange={setSelectedZoneType}
        viewport={viewport}
        viewportHandlers={viewportHandlers}
      />

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Center canvas area */}
        <div className="flex-1 flex flex-col min-w-0">
          {editorView === 'world' ? (
            <WorldGridView
              rooms={rooms}
              selectedRoom={selectedRoom}
              activeTool={activeTool}
              gridSize={gridSize}
              onRoomSelect={(room) => { if (room) navigateToRoom(room); else setSelectedRoom(null); }}
              onRoomCreate={handleRoomCreate}
              onRoomDelete={handleRoomDelete}
              onRoomMove={handleRoomMove}
              onCellClick={handleCellClick}
              viewport={viewport}
              viewportHandlers={viewportHandlers}
            />
          ) : selectedRoom ? (
            <RoomGridView
              room={selectedRoom}
              layoutData={currentLayoutData}
              npcs={currentRoomNpcs}
              activeTool={activeRoomTool}
              selectedNpcId={selectedNpcId}
              selectedZoneType={selectedZoneType}
              exitDirections={currentExitDirections}
              viewport={viewport}
              viewportHandlers={viewportHandlers}
              worldId={worldId}
              onLayoutChange={handleLayoutChange}
              onSelectNpc={setSelectedNpcId}
              onRequestNpcPicker={handleRequestNpcPicker}
            />
          ) : null}
        </div>

        {/* Right panel: Room Properties (only in room view) */}
        {editorView === 'room' && (
          <div className="flex shrink-0">
            <RoomPropertiesPanel
              room={selectedRoom}
              worldId={worldId}
              availableCharacters={availableCharacters}
              onUpdate={handleRoomUpdate}
              onClose={() => {
                setSelectedRoom(null);
                setEditorView('world');
              }}
              onOpenNPCPicker={() => setShowNPCPicker(true)}
              onRemoveFromCell={handleRemoveSelectedRoom}
              isVisible={!!selectedRoom}
              apiConfig={apiConfig}
              worldContext={worldContext}
            />
          </div>
        )}
      </div>

      {/* NPC Picker Modal */}
      {showNPCPicker && selectedRoom && (
        <NPCPickerModal
          availableCharacters={availableCharacters}
          selectedNPCs={npcPlacementCell ? [] : selectedRoom.npcs}
          onConfirm={handleNPCsConfirm}
          onClose={() => { setShowNPCPicker(false); setNpcPlacementCell(null); }}
        />
      )}

      {/* Cell Action Menu (world view only) */}
      {showCellMenu && selectedCell && (
        <CellActionMenu
          position={cellMenuPosition}
          isOccupied={rooms.some(r => r.position.x === selectedCell.x && r.position.y === selectedCell.y)}
          onCreateNew={handleCreateNewRoom}
          onImportFromGallery={handleImportFromGallery}
          onEdit={handleEditRoom}
          onRemove={handleRemoveRoom}
          onClose={() => setShowCellMenu(false)}
        />
      )}

      {/* Room Gallery Picker */}
      {showRoomPicker && (
        <RoomGalleryPicker
          isOpen={showRoomPicker}
          onClose={() => setShowRoomPicker(false)}
          onSelect={handleRoomImport}
          excludeRoomIds={rooms.map(r => r.id)}
        />
      )}
    </div>
  );
}

function WorldEditorWithErrorBoundary(props: WorldEditorProps) {
  return (
    <ErrorBoundary
      fallback={
        <WorldLoadError
          title="World Editor Error"
          message="Something went wrong while editing this world. Please try again or go back to the gallery."
          onRetry={() => window.location.reload()}
          onBack={() => window.history.back()}
        />
      }
      onError={(error) => console.error('WorldEditor error:', error)}
    >
      <WorldEditor {...props} />
    </ErrorBoundary>
  );
}

export default WorldEditorWithErrorBoundary;
