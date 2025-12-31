/**
 * @file WorldEditor.tsx
 * @description World Builder interface for creating and editing world maps.
 * @dependencies worldApi (V2), roomApi, GridCanvas, ToolPalette, RoomPropertiesPanel, NPCPickerModal
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { ToolPalette, type Tool } from '../components/world/ToolPalette';
import { GridCanvas } from '../components/world/GridCanvas';
import { RoomPropertiesPanel } from '../components/world/RoomPropertiesPanel';
import { NPCPickerModal } from '../components/world/NPCPickerModal';
import { CellActionMenu } from '../components/world/CellActionMenu';
import { RoomGalleryPicker } from '../components/world/RoomGalleryPicker';
import { worldApi } from '../api/worldApi';
import { roomApi } from '../api/roomApi';
import type { WorldCard, WorldRoomPlacement } from '../types/worldCard';
import type { RoomCardSummary } from '../types/room';
import type { GridRoom } from '../types/worldGrid';
import { roomCardToGridRoom } from '../utils/roomCardAdapter';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { WorldLoadError } from '../components/world/WorldLoadError';

interface WorldEditorProps {
  worldId?: string;
  onBack?: () => void;
}

export function WorldEditor({ worldId: propWorldId, onBack }: WorldEditorProps) {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();

  const worldId = propWorldId || uuid || '';

  const [worldCard, setWorldCard] = useState<WorldCard | null>(null);
  const [rooms, setRooms] = useState<GridRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<GridRoom | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>('edit'); // default to unified edit tool
  const [isDirty, setIsDirty] = useState(false);
  const [showNPCPicker, setShowNPCPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableCharacters, setAvailableCharacters] = useState<any[]>([]);
  const [missingRoomCount, setMissingRoomCount] = useState(0);
  const [showMissingRoomWarning, setShowMissingRoomWarning] = useState(false);

  // Responsive panel states
  const [isToolPanelCollapsed, setIsToolPanelCollapsed] = useState(false);

  // Grid size state - from world card
  const [gridSize, setGridSize] = useState({ width: 10, height: 10 });

  // Cell action menu state
  const [showCellMenu, setShowCellMenu] = useState(false);
  const [cellMenuPosition, setCellMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);

  // Room gallery picker state
  const [showRoomPicker, setShowRoomPicker] = useState(false);

  // Load world data and available characters
  useEffect(() => {
    async function loadData() {
      if (!worldId) {
        setError('No world ID provided');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        // Load world card (V2)
        const world = await worldApi.getWorld(worldId);
        setWorldCard(world);

        // Set grid size from world data
        const worldData = world.data.extensions.world_data;
        setGridSize(worldData.grid_size);

        // Load room cards for all placed rooms, tracking any that are missing
        const loadedRooms: GridRoom[] = [];
        let missingRooms = 0;
        for (const placement of worldData.rooms) {
          try {
            const roomCard = await roomApi.getRoom(placement.room_uuid);

            // Convert RoomCard to GridRoom format using adapter
            // Pass placement data so instance NPCs/images override room card defaults
            const gridRoom = roomCardToGridRoom(roomCard, placement.grid_position, placement);
            loadedRooms.push(gridRoom);
          } catch (err) {
            console.warn(`Failed to load room ${placement.room_uuid}:`, err);
            missingRooms++;
            // Continue loading other rooms
          }
        }
        setRooms(loadedRooms);

        // Show warning if any rooms were not found (may have been deleted)
        if (missingRooms > 0) {
          setMissingRoomCount(missingRooms);
          setShowMissingRoomWarning(true);
        }

        // Load available characters for NPC picker (same approach as CharacterGallery)
        const charResponse = await fetch('/api/characters');
        if (charResponse.ok) {
          const charData = await charResponse.json();
          // Handle both API response shapes
          const charList = charData.characters || charData.data || charData || [];
          const characters = charList
            .filter((c: any) => {
              const cardType = c.extensions_json?.card_type || c.card_type;
              return cardType !== 'world' && cardType !== 'room'; // Only character cards as NPCs
            })
            .map((c: any) => {
              const uuid = c.character_uuid;
              const timestamp = c.updated_at ? new Date(c.updated_at).getTime() : Date.now();
              return {
                id: uuid,
                name: c.name,
                imageUrl: uuid ? `/api/character-image/${uuid}?t=${timestamp}` : '/pngPlaceholder.png',
                tags: c.tags || [],
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'e':
          setActiveTool('edit');
          break;
        case 'm':
          setActiveTool('move');
          break;
        case 'c':
          setActiveTool('connection');
          break;
        case 'd':
          setActiveTool('eraser');
          break;
        case 'escape':
          setSelectedRoom(null);
          break;
        case 'delete':
        case 'backspace':
          if (selectedRoom && !e.repeat) {
            handleRoomDelete(selectedRoom.id);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRoom, rooms]);

  const handleCellClick = useCallback((position: { x: number; y: number }, event: React.MouseEvent) => {
    // Show cell action menu at click position
    setSelectedCell(position);
    setCellMenuPosition({ x: event.clientX, y: event.clientY });
    setShowCellMenu(true);
  }, []);

  const handleCreateNewRoom = useCallback(async () => {
    if (!selectedCell) return;

    try {
      // Create a new room card via API
      const roomSummary = await roomApi.createRoom({
        name: 'New Room',
        description: '',
      });

      // Add room to grid at selected position
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
      setSelectedRoom(newRoom);
      setIsDirty(true);
    } catch (err) {
      console.error('Failed to create room:', err);
      setError(err instanceof Error ? err.message : 'Failed to create room');
    }
  }, [selectedCell]);

  const handleImportFromGallery = useCallback(() => {
    setShowRoomPicker(true);
  }, []);

  const handleRoomImport = useCallback((roomSummary: RoomCardSummary) => {
    if (!selectedCell) return;

    // Load full room card to get all details
    roomApi.getRoom(roomSummary.uuid).then(roomCard => {
      // Use adapter to create GridRoom with deep-copied NPCs
      // No placement data yet since this is a fresh import
      const newRoom = roomCardToGridRoom(roomCard, selectedCell);

      setRooms(prev => [...prev, newRoom]);
      setIsDirty(true);
      setShowRoomPicker(false);
    }).catch(err => {
      console.error('Failed to import room:', err);
      setError(err instanceof Error ? err.message : 'Failed to import room');
    });
  }, [selectedCell]);

  const handleRoomCreate = useCallback((position: { x: number; y: number }) => {
    // Legacy handler - now redirects to cell click
    const mockEvent = { clientX: 0, clientY: 0 } as React.MouseEvent;
    handleCellClick(position, mockEvent);
  }, [handleCellClick]);

  const handleEditRoom = useCallback(() => {
    if (!selectedCell) return;

    const room = rooms.find(r => r.position.x === selectedCell.x && r.position.y === selectedCell.y);
    if (room) {
      setSelectedRoom(room);
    }
  }, [selectedCell, rooms]);

  const handleRemoveRoom = useCallback(() => {
    if (!selectedCell) return;

    const room = rooms.find(r => r.position.x === selectedCell.x && r.position.y === selectedCell.y);
    if (room) {
      setRooms(prev => prev.filter(r => r.id !== room.id));
      if (selectedRoom?.id === room.id) {
        setSelectedRoom(null);
      }
      setIsDirty(true);
    }
  }, [selectedCell, rooms, selectedRoom?.id]);

  const handleRoomDelete = useCallback((roomId: string) => {
    setRooms(prev => prev.filter(r => r.id !== roomId));
    if (selectedRoom?.id === roomId) {
      setSelectedRoom(null);
    }
    setIsDirty(true);
  }, [selectedRoom?.id]);

  const handleRoomUpdate = useCallback(async (updatedRoom: GridRoom) => {
    // Update local state
    setRooms(prev => prev.map(r => r.id === updatedRoom.id ? updatedRoom : r));
    setSelectedRoom(updatedRoom);
    setIsDirty(true);

    // Persist room card updates via roomApi
    try {
      await roomApi.updateRoom(updatedRoom.id, {
        name: updatedRoom.name,
        description: updatedRoom.description,
        first_mes: updatedRoom.introduction_text || undefined,
      });
      console.log('Room card updated successfully');
    } catch (err) {
      console.error('Failed to update room card:', err);
      // Continue anyway - changes are still in local state and will be saved with world
    }
  }, []);

  const handleRoomMove = useCallback((roomId: string, newPosition: { x: number; y: number }) => {
    // Check if target position is occupied
    const isOccupied = rooms.some(r => r.position.x === newPosition.x && r.position.y === newPosition.y && r.id !== roomId);
    if (isOccupied) return;

    setRooms(prev => prev.map(r => {
      if (r.id === roomId) {
        return { ...r, position: newPosition };
      }
      return r;
    }));
    setIsDirty(true);
  }, [rooms]);

  const handleNPCsConfirm = useCallback((npcs: import('../types/room').RoomNPC[]) => {
    if (selectedRoom) {
      const updatedRoom = { ...selectedRoom, npcs };
      handleRoomUpdate(updatedRoom);
    }
    setShowNPCPicker(false);
  }, [selectedRoom, handleRoomUpdate]);

  const handleSave = useCallback(async () => {
    if (!worldCard || !worldId) return;

    try {
      // Convert GridRoom[] to WorldRoomPlacement[]
      // CRITICAL: Persist instance data (NPCs, images) to world card
      const roomPlacements: WorldRoomPlacement[] = rooms.map(room => ({
        room_uuid: room.id,
        grid_position: room.position,
        instance_npcs: room.npcs.length > 0 ? room.npcs : undefined, // Full RoomNPC[] objects
        instance_image_path: room.image_path || undefined, // Custom image override
        // instance_state: undefined, // Future: loot, doors, enemy HP, etc.
      }));

      // Calculate required grid size based on room positions
      let maxX = gridSize.width - 1;
      let maxY = gridSize.height - 1;

      rooms.forEach(room => {
        maxX = Math.max(maxX, room.position.x);
        maxY = Math.max(maxY, room.position.y);
      });

      const saveWidth = maxX + 1;
      const saveHeight = maxY + 1;

      // Update world card
      await worldApi.updateWorld(worldId, {
        rooms: roomPlacements,
        grid_size: { width: saveWidth, height: saveHeight },
      });

      setIsDirty(false);

      // Update local grid size if it expanded
      if (saveWidth > gridSize.width || saveHeight > gridSize.height) {
        setGridSize({ width: saveWidth, height: saveHeight });
      }

      console.log('World saved successfully');
    } catch (err) {
      console.error('Error saving world:', err);
      setError(err instanceof Error ? err.message : 'Failed to save world');
    }
  }, [worldCard, worldId, rooms, gridSize]);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  }, [onBack, navigate]);

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
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg"
          >
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
      {/* Missing Rooms Warning Banner */}
      {showMissingRoomWarning && missingRoomCount > 0 && (
        <div className="bg-amber-900/90 border-b border-amber-700 px-4 py-2 flex items-center justify-between z-50">
          <span className="text-amber-200 text-sm">
            ⚠️ {missingRoomCount} room{missingRoomCount !== 1 ? 's were' : ' was'} not found and {missingRoomCount !== 1 ? 'have' : 'has'} been removed from the grid. Save to update the world.
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
      <div className="bg-[#141414] border-b border-[#2a2a2a] px-3 md:px-6 py-3 md:py-4 flex items-center justify-between gap-2 shrink-0 z-30 relative">
        <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors shrink-0"
            title="Go back"
          >
            <ArrowLeft size={20} className="text-gray-400" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm md:text-base font-medium truncate">{worldCard.data.name}</h1>
            <p className="text-xs md:text-sm text-gray-500 truncate hidden sm:block">{worldCard.data.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isDirty && (
            <span className="text-xs text-yellow-500 mr-2">Unsaved</span>
          )}

          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Save size={16} />
            <span className="text-sm">Save</span>
          </button>
        </div>
      </div>

      {/* Main Body (Tools + Canvas + Properties) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel - Tools (Absolute Overlay) */}
        <div className={`absolute top-0 left-0 bottom-0 z-20 transition-transform duration-200 ${isToolPanelCollapsed ? '-translate-x-full' : 'translate-x-0'}`}>
          <ToolPalette
            activeTool={activeTool}
            onToolChange={setActiveTool}
            isCollapsed={false}
            onToggleCollapse={() => setIsToolPanelCollapsed(!isToolPanelCollapsed)}
          />
        </div>

        {/* Center - Content (Full Width) */}
        <div className="flex-1 flex flex-col">
          {/* Grid Canvas */}
          <GridCanvas
            rooms={rooms}
            selectedRoom={selectedRoom}
            activeTool={activeTool}
            gridSize={gridSize}
            onRoomSelect={setSelectedRoom}
            onRoomCreate={handleRoomCreate}
            onRoomDelete={handleRoomDelete}
            onRoomMove={handleRoomMove}
            onCellClick={handleCellClick}
          />
        </div>

        {/* Right Panel - Properties Overlay */}
        <RoomPropertiesPanel
          room={selectedRoom}
          worldId={worldId}
          availableCharacters={availableCharacters}
          onUpdate={handleRoomUpdate}
          onClose={() => setSelectedRoom(null)}
          onOpenNPCPicker={() => setShowNPCPicker(true)}
          isVisible={!!selectedRoom}
        />
      </div>

      {/* NPC Picker Modal */}
      {showNPCPicker && selectedRoom && (
        <NPCPickerModal
          availableCharacters={availableCharacters}
          selectedNPCs={selectedRoom.npcs}
          onConfirm={handleNPCsConfirm}
          onClose={() => setShowNPCPicker(false)}
        />
      )}

      {/* Cell Action Menu */}
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

/**
 * WorldEditor wrapped with ErrorBoundary to catch rendering errors.
 * Uses WorldLoadError as fallback for user-friendly error display.
 */
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