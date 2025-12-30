/**
 * @file WorldPlayView.tsx
 * @description Main orchestrator for World Card gameplay. Integrates the existing ChatView
 *              with SidePanel (in world mode) and MapModal for navigation.
 * @dependencies worldApi (V2), roomApi, ChatView, SidePanel, MapModal
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChat } from '../contexts/ChatContext';
import { useCharacter } from '../contexts/CharacterContext';
import ChatView from '../components/chat/ChatView';
import { SidePanel } from '../components/SidePanel';
import { PartyGatherModal } from '../components/world/PartyGatherModal';
import { MapModal } from '../components/world/MapModal';
import { worldApi } from '../api/worldApi';
import { roomApi } from '../api/roomApi';
import type { WorldCard } from '../types/worldCard';
import type { CharacterCard } from '../types/schema';
import type { GridWorldState, GridRoom, DisplayNPC } from '../types/worldGrid';
import { resolveNpcDisplayData } from '../utils/worldStateApi';
import { roomCardToGridRoom } from '../utils/roomCardAdapter';
import { injectRoomContext, injectNPCContext } from '../utils/worldCardAdapter';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { WorldLoadError } from '../components/world/WorldLoadError';

interface WorldPlayViewProps {
  worldId?: string;
}

export function WorldPlayView({ worldId: propWorldId }: WorldPlayViewProps) {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const {
    isGenerating,
    messages,
    setMessages,
    addMessage,
    setCharacterDataOverride
  } = useChat();
  const { characterData } = useCharacter();

  const worldId = propWorldId || uuid || '';

  // State
  const [worldCard, setWorldCard] = useState<WorldCard | null>(null);
  const [worldState, setWorldState] = useState<GridWorldState | null>(null);
  const [currentRoom, setCurrentRoom] = useState<GridRoom | null>(null);
  const [roomNpcs, setRoomNpcs] = useState<DisplayNPC[]>([]);
  const [activeNpcId, setActiveNpcId] = useState<string | undefined>(); // Active responder, NOT session
  const [activeNpcName, setActiveNpcName] = useState<string>(''); // For PartyGatherModal display
  const [activeNpcCard, setActiveNpcCard] = useState<CharacterCard | null>(null); // Active NPC's character card
  const [showMap, setShowMap] = useState(false);
  const [showPartyGatherModal, setShowPartyGatherModal] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<GridRoom | null>(null);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingRoomCount, setMissingRoomCount] = useState(0);
  const [showMissingRoomWarning, setShowMissingRoomWarning] = useState(false);

  // Load world data from API (V2)
  useEffect(() => {
    async function loadWorld() {
      if (!worldId) {
        setError('No world ID provided');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Load world card (V2)
        const world = await worldApi.getWorld(worldId);
        setWorldCard(world);

        const worldData = world.data.extensions.world_data;

        // Load all room cards, tracking any that are missing
        const loadedRooms: GridRoom[] = [];
        let missingRooms = 0;
        for (const placement of worldData.rooms) {
          try {
            const roomCard = await roomApi.getRoom(placement.room_uuid);

            // Convert RoomCard to GridRoom format using adapter
            const gridRoom = roomCardToGridRoom(roomCard, placement.grid_position);
            loadedRooms.push(gridRoom);
          } catch (err) {
            console.warn(`Failed to load room ${placement.room_uuid}:`, err);
            missingRooms++;
          }
        }

        // Show warning if any rooms were not found (may have been deleted)
        if (missingRooms > 0) {
          setMissingRoomCount(missingRooms);
          setShowMissingRoomWarning(true);
        }

        // Build grid for MapModal
        const gridSize = worldData.grid_size;
        const grid: (GridRoom | null)[][] = Array(gridSize.height)
          .fill(null)
          .map(() => Array(gridSize.width).fill(null));

        loadedRooms.forEach(room => {
          const { x, y } = room.position;
          if (y >= 0 && y < gridSize.height && x >= 0 && x < gridSize.width) {
            grid[y][x] = room;
          }
        });

        // Create GridWorldState for backward compatibility with MapModal
        const gridWorldState: GridWorldState = {
          uuid: world.data.character_uuid || worldId,
          metadata: {
            name: world.data.name,
            description: world.data.description,
          },
          grid,
          player_position: worldData.player_position,
          starting_position: worldData.starting_position,
        };
        setWorldState(gridWorldState);

        // Find current room based on player position
        const playerPos = worldData.player_position;
        const currentRoom = loadedRooms.find(r => r.position.x === playerPos.x && r.position.y === playerPos.y);

        if (currentRoom) {
          setCurrentRoom(currentRoom);

          // Resolve NPCs in the room
          const npcs = await resolveNpcDisplayData(currentRoom.npcs);
          setRoomNpcs(npcs);

          // Add introduction message
          if (currentRoom.introduction_text && !isGenerating) {
            // Let ChatView handle the introduction through the narrator
          }
        }
      } catch (err) {
        console.error('Error loading world:', err);
        setError(err instanceof Error ? err.message : 'Failed to load world');
      } finally {
        setIsLoading(false);
      }
    }

    loadWorld();
  }, [worldId]);

  // Inject context into character data for LLM generation
  // Two modes: Room mode (world narrator) or NPC mode (specific NPC)
  useEffect(() => {
    if (activeNpcCard && currentRoom) {
      // NPC conversation mode - use NPC's character card with world+room context
      const worldCharCard = characterData; // World card loaded as base character
      const modifiedNpcCard = injectNPCContext(activeNpcCard, worldCharCard, currentRoom);
      setCharacterDataOverride(modifiedNpcCard);
    } else if (characterData && currentRoom) {
      // Room mode - use world card with room context
      const modifiedCharacterData = injectRoomContext(characterData, currentRoom);
      setCharacterDataOverride(modifiedCharacterData);
    } else {
      // Clear override if no room is set
      setCharacterDataOverride(null);
    }
  }, [characterData, currentRoom, activeNpcCard, setCharacterDataOverride]);

  // Handle NPC selection - sets active responder (does NOT change session)
  const handleSelectNpc = useCallback(async (npcId: string) => {
    if (!currentRoom) return;

    const npc = roomNpcs.find(n => n.id === npcId);
    if (!npc) {
      console.error(`NPC not found: ${npcId}`);
      return;
    }

    // Set active NPC (changes who responds, NOT the session)
    setActiveNpcId(npcId);
    setActiveNpcName(npc.name);

    try {
      // Fetch full character card data for the NPC
      const response = await fetch(`/api/character/${npcId}`);
      if (!response.ok) {
        console.error('Failed to load NPC character data');
        return;
      }

      const npcCharacterData = await response.json();

      // Store the NPC's character card for context injection
      setActiveNpcCard(npcCharacterData);

      // CRITICAL: Do NOT call setCharacterDataInContext here
      // That would trigger a new session load
      // The context injection effect will handle using the NPC's card

      // Use the /api/generate-greeting endpoint with NPC character data
      const greetingResponse = await fetch('/api/generate-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_data: npcCharacterData,
          api_config: null // Use default API config
        })
      });

      if (!greetingResponse.ok) {
        console.error('Failed to generate NPC introduction');
        return;
      }

      // Stream the response
      const reader = greetingResponse.body?.getReader();
      const decoder = new TextDecoder();
      let generatedIntro = '';

      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.token) {
                  generatedIntro += parsed.token;
                }
              } catch (e) {
                // Ignore parsing errors for partial chunks
              }
            }
          }
        }
      }

      // Add the generated entrance to the SAME session (not a new one)
      const introMessage = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: generatedIntro.trim() || `*${npc.name} enters the scene*`,
        timestamp: Date.now(),
        metadata: {
          type: 'npc_introduction',
          npcId: npcId,
          roomId: currentRoom.id,
          characterId: npcCharacterData.data?.character_uuid,
          generated: true
        }
      };

      addMessage(introMessage);

      console.log(`Summoned NPC: ${npc.name} (active responder, same session)`);
    } catch (err) {
      console.error('Error summoning NPC:', err);
    }
  }, [roomNpcs, currentRoom, addMessage]);

  // Extracted room transition logic - shared by direct navigate and Party Gather modal
  const performRoomTransition = useCallback(async (
    targetRoom: GridRoom,
    keepActiveNpc: boolean = false
  ) => {
    if (!worldState || !worldId) return;

    // PRUNE MESSAGES: Keep only the last 2 messages for continuity
    if (messages.length > 0) {
      const lastTwoMessages = messages.slice(-2);
      setMessages(lastTwoMessages);
      console.log(`Pruned messages: kept last ${lastTwoMessages.length} messages for continuity`);
    }

    // Find coordinates for the target room
    let foundY = 0;
    let foundX = 0;
    for (let y = 0; y < worldState.grid.length; y++) {
      for (let x = 0; x < worldState.grid[y].length; x++) {
        if (worldState.grid[y][x]?.id === targetRoom.id) {
          foundY = y;
          foundX = x;
          break;
        }
      }
    }

    // Update local state
    setCurrentRoom(targetRoom);
    setWorldState({
      ...worldState,
      player_position: { x: foundX, y: foundY },
    });

    // Clear active NPC unless explicitly keeping them
    if (!keepActiveNpc) {
      setActiveNpcId(undefined);
      setActiveNpcName('');
      setActiveNpcCard(null);
    }

    // Resolve NPCs in the new room
    const npcs = await resolveNpcDisplayData(targetRoom.npcs);
    setRoomNpcs(npcs);

    // Persist position to backend (V2)
    try {
      if (worldCard) {
        await worldApi.updateWorld(worldId, {
          player_position: { x: foundX, y: foundY },
        });
      }
    } catch (err) {
      console.error('Failed to persist player position:', err);
    }

    // Add room introduction as assistant message
    if (targetRoom.introduction_text) {
      const roomIntroMessage = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: targetRoom.introduction_text,
        timestamp: Date.now(),
        metadata: {
          type: 'room_introduction',
          roomId: targetRoom.id
        }
      };

      addMessage(roomIntroMessage);
    }

    // If keeping NPC, add a message about them following
    if (keepActiveNpc && activeNpcName) {
      const followMessage = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: `*${activeNpcName} follows you into ${targetRoom.name}*`,
        timestamp: Date.now(),
        metadata: {
          type: 'npc_travel',
          npcId: activeNpcId,
          roomId: targetRoom.id
        }
      };

      addMessage(followMessage);
    }

    // Close map modal after navigation
    setShowMap(false);
  }, [worldCard, worldState, worldId, messages, setMessages, addMessage, activeNpcName, activeNpcId]);


  // Handle room navigation - persists position to backend
  const handleNavigate = useCallback(async (roomId: string) => {
    if (!worldState || !worldId) return;

    // Find the target room in the grid
    let foundRoom: GridRoom | undefined;

    for (let y = 0; y < worldState.grid.length; y++) {
      for (let x = 0; x < worldState.grid[y].length; x++) {
        const room = worldState.grid[y][x];
        if (room?.id === roomId) {
          foundRoom = room;
          break;
        }
      }
      if (foundRoom) break;
    }

    if (!foundRoom) {
      console.error(`Room not found: ${roomId}`);
      return;
    }

    const targetRoom = foundRoom;

    // Check if we have an active NPC - if so, show Party Gather modal
    if (activeNpcId && activeNpcName) {
      setPendingDestination(targetRoom);
      setShowPartyGatherModal(true);
      return; // Don't navigate immediately, wait for user choice
    }

    // No active NPC - navigate immediately
    await performRoomTransition(targetRoom);
  }, [worldState, worldId, performRoomTransition, activeNpcId, activeNpcName]);

  const handleOpenMap = useCallback(() => {
    setShowMap(true);
  }, []);

  const handleCloseMap = useCallback(() => {
    setShowMap(false);
  }, []);

  // Party Gather Modal Handlers
  const handleBringNpcAlong = useCallback(async () => {
    if (!pendingDestination) return;

    setShowPartyGatherModal(false);
    await performRoomTransition(pendingDestination, true); // keepActiveNpc = true
    setPendingDestination(null);
  }, [pendingDestination, performRoomTransition]);

  const handleLeaveNpcHere = useCallback(async () => {
    if (!pendingDestination) return;

    setShowPartyGatherModal(false);
    // Add farewell message before clearing NPC
    if (activeNpcName) {
      const farewellMessage = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: `*${activeNpcName} stays behind*`,
        timestamp: Date.now(),
        metadata: {
          type: 'npc_farewell',
          npcId: activeNpcId
        }
      };
      addMessage(farewellMessage);
    }

    // Clear active NPC before transition
    setActiveNpcId(undefined);
    setActiveNpcName('');
    setActiveNpcCard(null);

    await performRoomTransition(pendingDestination, false); // keepActiveNpc = false
    setPendingDestination(null);
  }, [pendingDestination, activeNpcName, activeNpcId, addMessage, performRoomTransition]);

  const handleClosePartyGatherModal = useCallback(() => {
    setShowPartyGatherModal(false);
    setPendingDestination(null);
  }, []);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Note: activeCharacter could be used here for displaying NPC-specific UI
  // const activeCharacter = activeNpcId ? roomNpcs.find(n => n.id === activeNpcId) : null;

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading world...</p>
        </div>
      </div>
    );
  }

  // Error state
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

  // No world loaded
  if (!worldState || !currentRoom) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-white">
        <div className="text-center">
          <p className="text-gray-500">World not found</p>
          <button
            onClick={handleBack}
            className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* Missing Rooms Warning Banner */}
      {showMissingRoomWarning && missingRoomCount > 0 && (
        <div className="absolute top-0 left-0 right-0 bg-amber-900/90 border-b border-amber-700 px-4 py-2 flex items-center justify-between z-50">
          <span className="text-amber-200 text-sm">
            ⚠️ {missingRoomCount} room{missingRoomCount !== 1 ? 's' : ''} could not be loaded (may have been deleted).
          </span>
          <button
            onClick={() => setShowMissingRoomWarning(false)}
            className="text-amber-200 hover:text-white px-2 py-1 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Chat View (Main Content) - Uses existing ChatView component */}
      <div className="flex-1 overflow-hidden">
        <ChatView disableSidePanel={true} />
      </div>

      {/* World Side Panel */}
      <SidePanel
        mode="world"
        currentRoom={currentRoom}
        npcs={roomNpcs}
        activeNpcId={activeNpcId}
        onSelectNpc={handleSelectNpc}
        onOpenMap={handleOpenMap}
        isCollapsed={isPanelCollapsed}
        onToggleCollapse={() => setIsPanelCollapsed(!isPanelCollapsed)}
        worldId={worldId}
      />

      {/* Map Modal */}
      {showMap && (
        <MapModal
          worldData={worldState}
          currentRoomId={currentRoom.id}
          onNavigate={handleNavigate}
          onClose={handleCloseMap}
        />
      )}

      {/* Party Gather Modal */}
      {showPartyGatherModal && pendingDestination && (
        <PartyGatherModal
          npcName={activeNpcName}
          destinationRoomName={pendingDestination.name}
          onBringAlong={handleBringNpcAlong}
          onLeaveHere={handleLeaveNpcHere}
          onClose={handleClosePartyGatherModal}
        />
      )}
    </div>
  );
}

/**
 * WorldPlayView wrapped with ErrorBoundary to catch rendering errors.
 * Uses WorldLoadError as fallback for user-friendly error display.
 */
function WorldPlayViewWithErrorBoundary(props: WorldPlayViewProps) {
  return (
    <ErrorBoundary
      fallback={
        <WorldLoadError
          title="World Play Error"
          message="Something went wrong while playing this world. Please try again or go back to select a different world."
          onRetry={() => window.location.reload()}
          onBack={() => window.history.back()}
        />
      }
      onError={(error) => console.error('WorldPlayView error:', error)}
    >
      <WorldPlayView {...props} />
    </ErrorBoundary>
  );
}

export default WorldPlayViewWithErrorBoundary;