/**
 * @file WorldPlayView.tsx
 * @description Main orchestrator for World Card gameplay. Integrates the existing ChatView
 *              with WorldSidePanel and MapModal for navigation.
 * @dependencies worldStateApi, ChatView, WorldSidePanel, MapModal
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCharacter } from '../contexts/CharacterContext';
import { useChat } from '../contexts/ChatContext';
import ChatView from '../components/chat/ChatView';
import { WorldSidePanel } from '../components/world/WorldSidePanel';
import { PartyGatherModal } from '../components/world/PartyGatherModal';
import { MapModal } from '../components/world/MapModal';
import {
  worldStateApi,
  GridWorldState,
  GridRoom,
  DisplayNPC,
  resolveNpcDisplayData,
} from '../utils/worldStateApi';

interface WorldPlayViewProps {
  worldId?: string;
}

export function WorldPlayView({ worldId: propWorldId }: WorldPlayViewProps) {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { setCharacterData: setCharacterDataInContext } = useCharacter(); // For loading NPC data
  const {
    generateResponse,
    isGenerating,
    messages,
    setMessages,
    addMessage
  } = useChat();

  const worldId = propWorldId || uuid || '';

  // State
  const [worldState, setWorldState] = useState<GridWorldState | null>(null);
  const [currentRoom, setCurrentRoom] = useState<GridRoom | null>(null);
  const [roomNpcs, setRoomNpcs] = useState<DisplayNPC[]>([]);
  const [activeNpcId, setActiveNpcId] = useState<string | undefined>(); // Active responder, NOT session
  const [activeNpcName, setActiveNpcName] = useState<string>(''); // For PartyGatherModal display
  const [showMap, setShowMap] = useState(false);
  const [showPartyGatherModal, setShowPartyGatherModal] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<GridRoom | null>(null);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load world data from API
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

        // Load world state using the grid adapter
        const figmaState = await worldStateApi.getGridWorldState(worldId);

        if (!figmaState) {
          setError('Failed to load world state');
          setIsLoading(false);
          return;
        }

        setWorldState(figmaState);

        // Find current room based on player position
        const room = figmaState.grid[figmaState.player_position.y]?.[figmaState.player_position.x];
        if (room) {
          setCurrentRoom(room);

          // Resolve NPCs in the room
          const npcs = await resolveNpcDisplayData(room.npcs);
          setRoomNpcs(npcs);

          // Add introduction message via AI
          if (room.introduction_text && !isGenerating) {
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

      // CRITICAL: Do NOT call setCharacterDataInContext here
      // That would trigger a new session load
      // Instead, we track activeNpcId and use it to resolve {{char}} in prompts

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
    }

    // Resolve NPCs in the new room
    const npcs = await resolveNpcDisplayData(targetRoom.npcs);
    setRoomNpcs(npcs);

    // Persist position to backend
    try {
      await worldStateApi.movePlayer(worldId, targetRoom.id);
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
  }, [worldState, worldId, messages, setMessages, addMessage, activeNpcName, activeNpcId]);


  // Handle room navigation - persists position to backend
  const handleNavigate = useCallback(async (roomId: string) => {
    if (!worldState || !worldId) return;

    // Find the target room in the grid
    let foundRoom: GridRoom | undefined;
    let foundY = 0;
    let foundX = 0;

    for (let y = 0; y < worldState.grid.length; y++) {
      for (let x = 0; x < worldState.grid[y].length; x++) {
        const room = worldState.grid[y][x];
        if (room?.id === roomId) {
          foundRoom = room;
          foundY = y;
          foundX = x;
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
      {/* Chat View (Main Content) - Uses existing ChatView component */}
      <div className="flex-1 overflow-hidden">
        <ChatView disableSidePanel={true} />
      </div>

      {/* World Side Panel */}
      <WorldSidePanel
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

export default WorldPlayView;