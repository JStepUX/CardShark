/**
 * @file WorldEditor.tsx
 * @description World Builder interface for creating and editing world maps.
 * @dependencies worldStateApi, GridCanvas, ToolPalette, RoomPropertiesPanel, NPCPickerModal
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, PanelLeftClose } from 'lucide-react';
import { ToolPalette, type Tool } from '../components/world/ToolPalette';
import { GridCanvas } from '../components/world/GridCanvas';
import { RoomPropertiesPanel } from '../components/world/RoomPropertiesPanel';
import { NPCPickerModal } from '../components/world/NPCPickerModal';
import {
  worldStateApi,
  GridWorldState,
  GridRoom,
  fromGridWorldState
} from '../utils/worldStateApi';

interface WorldEditorProps {
  worldId?: string;
  onBack?: () => void;
}

export function WorldEditor({ worldId: propWorldId, onBack }: WorldEditorProps) {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();

  const worldId = propWorldId || uuid || '';

  const [worldState, setWorldState] = useState<GridWorldState | null>(null);
  const [rooms, setRooms] = useState<GridRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<GridRoom | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>('edit'); // default to unified edit tool
  const [isDirty, setIsDirty] = useState(false);
  const [showNPCPicker, setShowNPCPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableCharacters, setAvailableCharacters] = useState<any[]>([]);

  // Responsive panel states
  const [isToolPanelCollapsed, setIsToolPanelCollapsed] = useState(false);

  const gridSize = { width: 5, height: 4 };

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

        // Load world state
        const figmaState = await worldStateApi.getGridWorldState(worldId);

        if (figmaState) {
          setWorldState(figmaState);

          // Extract rooms from grid
          const extractedRooms: GridRoom[] = [];
          figmaState.grid.forEach((row) => {
            row.forEach((room) => {
              if (room) {
                extractedRooms.push(room);
              }
            });
          });
          setRooms(extractedRooms);
        }

        // Load available characters for NPC picker (same approach as CharacterGallery)
        const charResponse = await fetch('/api/characters');
        if (charResponse.ok) {
          const charData = await charResponse.json();
          // Handle both API response shapes
          const charList = charData.characters || charData.data || charData || [];
          const characters = charList
            .filter((c: any) => c.extensions_json?.card_type !== 'world') // Only non-world cards as NPCs
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
  }, [selectedRoom]);

  const handleRoomCreate = useCallback((position: { x: number; y: number }) => {
    const newRoom: GridRoom = {
      id: `room-${Date.now()}`,
      name: 'New Room',
      description: '',
      introduction_text: '',
      npcs: [],
      events: [],
      connections: { north: null, south: null, east: null, west: null },
      position,
    };

    setRooms(prev => [...prev, newRoom]);
    setSelectedRoom(newRoom);
    setIsDirty(true);
  }, [rooms.length]);

  const handleRoomDelete = useCallback((roomId: string) => {
    setRooms(prev => prev.filter(r => r.id !== roomId));
    if (selectedRoom?.id === roomId) {
      setSelectedRoom(null);
    }
    setIsDirty(true);
  }, [selectedRoom?.id]);

  const handleRoomUpdate = useCallback((updatedRoom: GridRoom) => {
    setRooms(prev => prev.map(r => r.id === updatedRoom.id ? updatedRoom : r));
    setSelectedRoom(updatedRoom);
    setIsDirty(true);
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

  const handleNPCsConfirm = useCallback((npcIds: string[]) => {
    if (selectedRoom) {
      const updatedRoom = { ...selectedRoom, npcs: npcIds };
      handleRoomUpdate(updatedRoom);
    }
    setShowNPCPicker(false);
  }, [selectedRoom, handleRoomUpdate]);

  const handleSave = useCallback(async () => {
    if (!worldState || !worldId) return;

    try {
      // Rebuild grid from rooms
      const newGrid: (GridRoom | null)[][] = Array(gridSize.height)
        .fill(null)
        .map(() => Array(gridSize.width).fill(null));

      rooms.forEach(room => {
        const { x, y } = room.position;
        if (y >= 0 && y < gridSize.height && x >= 0 && x < gridSize.width) {
          newGrid[y][x] = room;
        }
      });

      const updatedState: GridWorldState = {
        ...worldState,
        grid: newGrid,
      };

      // Convert to codebase format and save
      const worldData = fromGridWorldState(updatedState);
      const success = await worldStateApi.saveWorldState(worldId, worldData);

      if (success) {
        setIsDirty(false);
        console.log('World saved successfully');
      } else {
        setError('Failed to save world');
      }
    } catch (err) {
      console.error('Error saving world:', err);
      setError(err instanceof Error ? err.message : 'Failed to save world');
    }
  }, [worldState, worldId, rooms, gridSize]);

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

  if (!worldState) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-white">
        <div>World not found</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* Left Panel - Tools (Collapsible) */}
      <ToolPalette
        activeTool={activeTool}
        onToolChange={setActiveTool}
        isCollapsed={isToolPanelCollapsed}
        onToggleCollapse={() => setIsToolPanelCollapsed(!isToolPanelCollapsed)}
      />

      {/* Center - Grid Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-[#141414] border-b border-[#2a2a2a] px-3 md:px-6 py-3 md:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors shrink-0"
              title="Go back"
            >
              <ArrowLeft size={20} className="text-gray-400" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm md:text-base font-medium truncate">{worldState.metadata.name}</h1>
              <p className="text-xs md:text-sm text-gray-500 truncate hidden sm:block">{worldState.metadata.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            {isDirty && (
              <span className="text-xs text-yellow-500 mr-1 md:mr-2 hidden sm:inline">Unsaved</span>
            )}

            {/* Toggle collapse button for tool panel - visible on smaller screens */}
            <button
              onClick={() => setIsToolPanelCollapsed(!isToolPanelCollapsed)}
              className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors md:hidden"
              title={isToolPanelCollapsed ? "Show tools" : "Hide tools"}
            >
              <PanelLeftClose size={16} className={`text-gray-400 ${isToolPanelCollapsed ? 'rotate-180' : ''}`} />
            </button>



            <button
              onClick={handleSave}
              className="flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Save size={16} />
              <span className="text-sm hidden sm:inline">Save</span>
            </button>
          </div>
        </div>

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
        isVisible={!!selectedRoom && activeTool === 'edit'}
      />

      {/* NPC Picker Modal */}
      {showNPCPicker && selectedRoom && (
        <NPCPickerModal
          availableCharacters={availableCharacters}
          selectedNPCs={selectedRoom.npcs}
          onConfirm={handleNPCsConfirm}
          onClose={() => setShowNPCPicker(false)}
        />
      )}
    </div>
  );
}

export default WorldEditor;