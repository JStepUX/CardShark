/**
 * @file useRoomTransition.ts
 * @description Manages room transition logic for world navigation.
 * Extracted from WorldPlayView.tsx to reduce complexity and improve testability.
 *
 * Handles:
 * - Transition state machine (initiating -> summarizing -> loading_assets -> generating_frames -> ready -> idle)
 * - Room summarization via adventure log API
 * - Asset preloading (textures for player, companion, NPCs)
 * - Thin frame generation for NPCs missing identity context
 * - Room state persistence (NPC dead/incapacitated status)
 * - Player spawn position calculation based on entry direction
 * - Message pruning on travel (keeps last 8 messages)
 * - Combat cleanup on room exit (flee behavior)
 * - Adventure context refresh after summarization
 */
import { useState, useCallback } from 'react';
import { worldApi } from '../api/worldApi';
import { roomApi } from '../api/roomApi';
import { adventureLogApi } from '../api/adventureLogApi';
import type { WorldCard, RoomInstanceState } from '../types/worldCard';
import type { GridWorldState, GridRoom, CombatDisplayNPC } from '../types/worldGrid';
import type { ExitDirection, TilePosition, LocalMapConfig, LocalMapState } from '../types/localMap';
import { DEFAULT_LAYOUT_GRID_SIZE } from '../types/localMap';
import type { TransitionState, ProgressStatus } from '../types/transition';
import { createIdleTransitionState, TRANSITION_TIMEOUT_MS, THIN_FRAME_TIMEOUT_MS, SUMMARIZATION_TIMEOUT_MS } from '../types/transition';
import type { NPCRelationship, TimeState } from '../types/worldRuntime';
import type { CharacterInventory } from '../types/inventory';
import type { CharacterCard } from '../types/schema';
import { isValidThinFrame } from '../types/schema';
import type { SummarizeMessage, SummarizeNPC, AdventureContext } from '../types/adventureLog';
import type { PlayerProgression } from '../utils/progressionUtils';
import { resolveNpcDisplayData } from '../utils/worldStateApi';
import { roomCardToGridRoom } from '../utils/roomCardAdapter';
import { getSpawnPosition } from '../utils/localMapUtils';
import { preloadRoomTextures } from '../utils/texturePreloader';
import { generateThinFrame, mergeThinFrameIntoCard } from '../services/thinFrameService';

const LOCAL_MAP_CONFIG: LocalMapConfig = { gridWidth: DEFAULT_LAYOUT_GRID_SIZE.cols, gridHeight: DEFAULT_LAYOUT_GRID_SIZE.rows, tileSize: 100 };


interface UseRoomTransitionOptions {
  worldCard: WorldCard | null;
  worldState: GridWorldState | null;
  worldId: string | undefined;
  currentRoom: GridRoom | null;
  setCurrentRoom: (room: GridRoom | null) => void;
  roomNpcs: CombatDisplayNPC[];
  setRoomNpcs: (npcs: CombatDisplayNPC[]) => void;
  roomStatesRef: React.MutableRefObject<Record<string, RoomInstanceState>>;
  messages: any[];
  setMessages: (messages: any) => void;
  addMessage: (message: any) => void;
  activeNpcId: string | undefined;
  activeNpcName: string;
  activeNpcCard: CharacterCard | null;
  clearConversationTarget: () => void;
  setActiveNpcId: (id: string | undefined) => void;
  setActiveNpcName: (name: string) => void;
  setActiveNpcCard: (card: CharacterCard | null) => void;
  isInCombat: boolean;
  setIsInCombat: (inCombat: boolean) => void;
  gridCombat: { endCombat: () => void };
  setLocalMapStateCache: (state: LocalMapState | null) => void;
  setPlayerTilePosition: (position: TilePosition) => void;
  setWorldState: (state: GridWorldState | null | ((prev: GridWorldState | null) => GridWorldState | null)) => void;
  setAdventureContext: (context: AdventureContext) => void;
  playerProgression: PlayerProgression;
  timeState: TimeState;
  npcRelationships: Record<string, NPCRelationship>;
  playerInventory: CharacterInventory;
  allyInventory: CharacterInventory | null;
  currentUser: { id?: string; name?: string; user_uuid?: string; filename?: string } | null;
  apiConfig: any;
  setShowMap: (show: boolean) => void;
}

interface UseRoomTransitionReturn {
  transitionState: TransitionState;
  isTransitioning: boolean;
  entryDirection: ExitDirection | null;
  handleNavigate: (roomId: string, entryDir?: ExitDirection | null) => Promise<void>;
  handleLocalMapExitClick: (exit: { direction: ExitDirection; targetRoomId: string }) => Promise<void>;
  performRoomTransition: (targetRoomStub: GridRoom, keepActiveNpc?: boolean, entryDir?: ExitDirection | null) => Promise<void>;
}

export function useRoomTransition(options: UseRoomTransitionOptions): UseRoomTransitionReturn {
  const {
    worldCard,
    worldState,
    worldId,
    currentRoom,
    setCurrentRoom,
    roomNpcs,
    setRoomNpcs,
    roomStatesRef,
    messages,
    setMessages,
    addMessage,
    activeNpcId,
    activeNpcName,
    activeNpcCard,
    clearConversationTarget,
    setActiveNpcId,
    setActiveNpcName,
    setActiveNpcCard,
    isInCombat,
    setIsInCombat,
    gridCombat,
    setLocalMapStateCache,
    setPlayerTilePosition,
    setWorldState,
    setAdventureContext,
    playerProgression,
    timeState,
    npcRelationships,
    playerInventory,
    allyInventory,
    currentUser,
    apiConfig,
    setShowMap,
  } = options;

  const [transitionState, setTransitionState] = useState<TransitionState>(createIdleTransitionState());
  const [entryDirection, setEntryDirection] = useState<ExitDirection | null>(null);

  /**
   * Update transition progress for a specific operation.
   * Note: Used for Phase 2/3 when progress callbacks are enabled.
   */
  const _updateTransitionProgress = useCallback((
    key: keyof TransitionState['progress'],
    status: ProgressStatus
  ) => {
    setTransitionState(prev => ({
      ...prev,
      progress: {
        ...prev.progress,
        [key]: status,
      },
    }));
  }, []);

  /**
   * Check if transition has timed out.
   * Note: Used for Phase 2/3 timeout handling.
   */
  const _isTransitionTimedOut = useCallback((startedAt: number | null): boolean => {
    if (!startedAt) return false;
    return Date.now() - startedAt > TRANSITION_TIMEOUT_MS;
  }, []);

  // Suppress unused variable warnings for future-use helpers
  void _updateTransitionProgress;
  void _isTransitionTimedOut;

  /**
   * Helper to check if currently transitioning (for gating UI).
   */
  const isTransitioning = transitionState.phase !== 'idle';

  const performRoomTransition = useCallback(async (
    targetRoomStub: GridRoom,
    keepActiveNpc: boolean = false,
    entryDir: ExitDirection | null = null
  ) => {
    if (!worldState || !worldId || !worldCard) return;

    // ========================================
    // PHASE: INITIATING
    // ========================================
    const transitionStartTime = Date.now();
    setTransitionState({
      phase: 'initiating',
      sourceRoomName: currentRoom?.name || null,
      targetRoomName: targetRoomStub.name,
      targetRoomId: targetRoomStub.id,
      progress: {
        summarization: { status: 'pending' },
        assetPreload: { status: 'pending' },
        thinFrameGeneration: { status: 'pending' },
      },
      error: null,
      startedAt: transitionStartTime,
    });

    console.log(`[RoomTransition] Starting transition to: ${targetRoomStub.name}`);

    // Snapshot the CURRENT room's NPC states before we leave
    if (currentRoom) {
      const departingRoomState: RoomInstanceState = { npc_states: {} };
      for (const npc of roomNpcs) {
        if (npc.isDead) {
          departingRoomState.npc_states[npc.id] = { status: 'dead' };
        } else if (npc.isIncapacitated) {
          departingRoomState.npc_states[npc.id] = { status: 'incapacitated' };
        }
      }
      roomStatesRef.current[currentRoom.id] = departingRoomState;
    }

    // End any active combat (flee)
    if (isInCombat) {
      gridCombat.endCombat();
      setIsInCombat(false);
      setLocalMapStateCache(null);
    }

    // Always clear conversation target when leaving a room
    // (Conversations with non-bonded NPCs don't persist across rooms)
    clearConversationTarget();

    // ========================================
    // PHASE: SUMMARIZING (Phase 3)
    // ========================================
    // Summarize the current room visit before moving to the new room
    if (currentRoom && worldId && currentUser?.user_uuid && messages.length > 2) {
      setTransitionState(prev => ({
        ...prev,
        phase: 'summarizing',
        progress: {
          ...prev.progress,
          summarization: { status: 'in_progress', percent: 0 },
        },
      }));

      try {
        // Prepare messages for summarization (strip to role + content only)
        const summarizeMessages: SummarizeMessage[] = messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

        // Prepare NPC list for matching
        const summarizeNpcs: SummarizeNPC[] = roomNpcs.map(npc => ({
          id: npc.id,
          name: npc.name,
        }));

        // Get visitedAt from room entry tracking (use transitionStartTime as approximation if not tracked)
        // In a full implementation, this would be tracked when entering the room
        const visitedAt = transitionStartTime - (messages.length * 30000); // Rough estimate: ~30s per message

        console.log(`[RoomTransition] Summarizing ${summarizeMessages.length} messages from ${currentRoom.name}`);

        // Call summarization API with timeout
        const summarizationPromise = adventureLogApi.summarizeRoom({
          worldUuid: worldId,
          userUuid: currentUser.user_uuid,
          roomUuid: currentRoom.id,
          roomName: currentRoom.name,
          visitedAt,
          messages: summarizeMessages,
          npcs: summarizeNpcs,
        });

        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Summarization timeout')), SUMMARIZATION_TIMEOUT_MS)
        );

        const result = await Promise.race([summarizationPromise, timeoutPromise]);

        if (result) {
          console.log(`[RoomTransition] Summarization completed (${result.method}): ${result.summary.keyEvents.length} events`);
          setTransitionState(prev => ({
            ...prev,
            progress: {
              ...prev.progress,
              summarization: { status: 'complete' },
            },
          }));
        }
      } catch (error) {
        console.warn('[RoomTransition] Summarization failed or timed out:', error);
        setTransitionState(prev => ({
          ...prev,
          progress: {
            ...prev.progress,
            summarization: { status: 'failed', error: 'Summarization failed' },
          },
        }));
        // Continue with transition - summarization failure is non-blocking
      }
    } else {
      // Skip summarization if no room, no user, or too few messages
      setTransitionState(prev => ({
        ...prev,
        progress: {
          ...prev.progress,
          summarization: { status: 'complete' },
        },
      }));
    }

    // PRUNE MESSAGES: Keep last 8 messages for continuity when traveling between rooms
    const MAX_MESSAGES_ON_TRAVEL = 8;
    if (messages.length > MAX_MESSAGES_ON_TRAVEL) {
      const recentMessages = messages.slice(-MAX_MESSAGES_ON_TRAVEL);
      setMessages(recentMessages);
      console.log(`[Travel] Pruned messages: kept last ${recentMessages.length} of ${messages.length}`);
    }

    // Find coordinates for the target room
    let foundY = 0;
    let foundX = 0;
    for (let y = 0; y < worldState.grid.length; y++) {
      for (let x = 0; x < worldState.grid[y].length; x++) {
        if (worldState.grid[y][x]?.id === targetRoomStub.id) {
          foundY = y;
          foundX = x;
          break;
        }
      }
    }

    // LAZY LOADING: Fetch full room data if this is just a stub
    let targetRoom = targetRoomStub;
    const worldData = worldCard.data.extensions.world_data;
    const placement = worldData.rooms.find(r => r.room_uuid === targetRoomStub.id);

    if (placement) {
      try {
        // Always fetch full room data for the destination
        const roomCard = await roomApi.getRoom(placement.room_uuid);
        targetRoom = roomCardToGridRoom(roomCard, { x: foundX, y: foundY }, placement);
        console.log(`[RoomTransition] Lazy loaded room data: ${targetRoom.name}`);
      } catch (err) {
        console.error(`[RoomTransition] Failed to fetch room ${targetRoomStub.id}:`, err);
        // Fall back to stub data
      }
    }

    // Resolve NPCs in the new room BEFORE updating state
    const npcUuids = targetRoom.npcs.map(npc => npc.character_uuid);
    const resolvedNpcs = await resolveNpcDisplayData(npcUuids);

    // Merge hostile/monster_level from room NPCs
    let npcsWithCombatData: CombatDisplayNPC[] = resolvedNpcs.map(npc => {
      const roomNpc = targetRoom.npcs.find(rn => rn.character_uuid === npc.id);
      return {
        ...npc,
        hostile: roomNpc?.hostile,
        monster_level: roomNpc?.monster_level,
      };
    });

    // Apply persisted room state: filter dead NPCs, mark incapacitated
    const targetRoomState = roomStatesRef.current[targetRoom.id];
    if (targetRoomState?.npc_states) {
      npcsWithCombatData = npcsWithCombatData
        .filter(npc => targetRoomState.npc_states[npc.id]?.status !== 'dead')
        .map(npc => {
          const npcState = targetRoomState.npc_states[npc.id];
          if (npcState?.status === 'incapacitated') {
            return { ...npc, isIncapacitated: true };
          }
          return npc;
        });
      console.log('[RuntimeState] Applied saved room state for:', targetRoom.name);
    }

    // ========================================
    // PHASE: LOADING_ASSETS
    // ========================================
    setTransitionState(prev => ({
      ...prev,
      phase: 'loading_assets',
      progress: {
        ...prev.progress,
        assetPreload: { status: 'in_progress', percent: 0 },
      },
    }));

    // Preload textures for player, companion, and NPCs
    // Use the same URL patterns as the LocalMapView rendering
    const playerImgPath = currentUser?.filename
      ? `/api/user-image/${encodeURIComponent(currentUser.filename)}`
      : null;
    const companionImgPath = keepActiveNpc && activeNpcId
      ? `/api/character-image/${activeNpcId}.png`
      : null;
    const npcImageUrls = npcsWithCombatData.map(n => n.imageUrl).filter(Boolean) as string[];

    console.log(`[RoomTransition] Preloading ${npcImageUrls.length + (playerImgPath ? 1 : 0) + (companionImgPath ? 1 : 0)} textures`);

    const preloadResult = await preloadRoomTextures(
      {
        playerImagePath: playerImgPath,
        companionImagePath: companionImgPath,
        npcImageUrls,
      },
      {
        timeout: TRANSITION_TIMEOUT_MS,
        onProgress: (percent) => {
          setTransitionState(prev => ({
            ...prev,
            progress: {
              ...prev.progress,
              assetPreload: { status: 'in_progress', percent },
            },
          }));
        },
      }
    );

    if (preloadResult.timedOut) {
      console.warn('[RoomTransition] Texture preload timed out, continuing with fallbacks');
      setTransitionState(prev => ({
        ...prev,
        progress: {
          ...prev.progress,
          assetPreload: { status: 'failed', error: 'Timed out' },
        },
      }));
    } else if (preloadResult.failedCount > 0) {
      console.warn(`[RoomTransition] ${preloadResult.failedCount} textures failed to load`);
    }

    // Mark asset preload complete
    setTransitionState(prev => ({
      ...prev,
      progress: {
        ...prev.progress,
        assetPreload: preloadResult.success
          ? { status: 'complete' }
          : { status: 'failed', error: preloadResult.error || 'Some textures failed' },
      },
    }));

    // ========================================
    // PHASE: GENERATING_FRAMES - Generate thin frames for NPCs missing them
    // ========================================
    // Only proceed if we have API config and there are NPCs to process
    if (apiConfig && npcsWithCombatData.length > 0) {
      setTransitionState(prev => ({
        ...prev,
        phase: 'generating_frames',
        progress: {
          ...prev.progress,
          thinFrameGeneration: { status: 'in_progress', percent: 0 },
        },
      }));

      // Check which NPCs need thin frames
      const npcsNeedingFrames: string[] = [];
      for (const npc of npcsWithCombatData) {
        try {
          const npcCardResponse = await fetch(`/api/character/${npc.id}/metadata`);
          if (npcCardResponse.ok) {
            const npcCardData = await npcCardResponse.json();
            const npcCard = npcCardData.data || npcCardData;
            if (!isValidThinFrame(npcCard?.data?.extensions?.cardshark_thin_frame)) {
              npcsNeedingFrames.push(npc.id);
            }
          }
        } catch (err) {
          console.warn(`[ThinFrame] Failed to check NPC ${npc.id} for thin frame:`, err);
        }
      }

      if (npcsNeedingFrames.length > 0) {
        console.log(`[ThinFrame] Generating thin frames for ${npcsNeedingFrames.length} NPCs`);

        let generatedCount = 0;
        for (const npcId of npcsNeedingFrames) {
          try {
            // Fetch full character data
            const npcCardResponse = await fetch(`/api/character/${npcId}/metadata`);
            if (!npcCardResponse.ok) continue;

            const npcCardData = await npcCardResponse.json();
            const npcCard = npcCardData.data || npcCardData as CharacterCard;

            // Generate thin frame with timeout
            const thinFrame = await generateThinFrame(npcCard, apiConfig, { timeout: THIN_FRAME_TIMEOUT_MS });

            // Update the NPC card with thin frame and save
            const updatedCard = mergeThinFrameIntoCard(npcCard, thinFrame);

            // Fetch the image to save with metadata
            const imageResponse = await fetch(`/api/character-image/${npcId}.png`);
            if (imageResponse.ok) {
              const imageBlob = await imageResponse.blob();
              const formData = new FormData();
              formData.append('file', new File([imageBlob], 'character.png', { type: 'image/png' }));
              formData.append('metadata_json', JSON.stringify(updatedCard));

              await fetch('/api/characters/save-card', {
                method: 'POST',
                body: formData,
              });

              console.log(`[ThinFrame] Generated and saved thin frame for NPC ${npcId}`);
            }

            generatedCount++;
            setTransitionState(prev => ({
              ...prev,
              progress: {
                ...prev.progress,
                thinFrameGeneration: {
                  status: 'in_progress',
                  percent: Math.round((generatedCount / npcsNeedingFrames.length) * 100),
                },
              },
            }));
          } catch (err) {
            console.warn(`[ThinFrame] Failed to generate thin frame for NPC ${npcId}:`, err);
          }
        }
      }

      // Mark thin frame generation complete
      setTransitionState(prev => ({
        ...prev,
        progress: {
          ...prev.progress,
          thinFrameGeneration: { status: 'complete' },
        },
      }));
    } else {
      // No NPCs or no API config - skip thin frame generation
      setTransitionState(prev => ({
        ...prev,
        progress: {
          ...prev.progress,
          thinFrameGeneration: { status: 'complete' },
        },
      }));
    }

    // ========================================
    // PHASE: READY - Update all state atomically
    // ========================================
    setTransitionState(prev => ({
      ...prev,
      phase: 'ready',
    }));

    // Calculate spawn position
    const spawnPos = entryDir
      ? getSpawnPosition(entryDir, LOCAL_MAP_CONFIG)
      : { x: 2, y: 2 };

    console.log(`[RoomTransition] Spawning at ${entryDir || 'center'}:`, spawnPos);

    // Update grid with full room data
    const newGrid = [...worldState.grid.map(row => [...row])];
    if (foundY >= 0 && foundY < newGrid.length && foundX >= 0 && foundX < newGrid[0].length) {
      newGrid[foundY][foundX] = targetRoom;
    }

    // ATOMIC STATE UPDATES - these should batch in React 18
    // All visible room state updates together
    setWorldState(prev => prev ? {
      ...prev,
      grid: newGrid,
      player_position: { x: foundX, y: foundY },
    } : null);
    setCurrentRoom(targetRoom);
    setRoomNpcs(npcsWithCombatData);
    setPlayerTilePosition(spawnPos);
    setEntryDirection(null);

    // Clear active NPC unless explicitly keeping them
    if (!keepActiveNpc) {
      setActiveNpcId(undefined);
      setActiveNpcName('');
      setActiveNpcCard(null);
    }

    // Persist position + full runtime state to backend (single API call)
    try {
      await worldApi.updateWorld(worldId, {
        player_position: { x: foundX, y: foundY },
        player_xp: playerProgression.xp,
        player_level: playerProgression.level,
        player_gold: playerProgression.gold,
        bonded_ally_uuid: (keepActiveNpc ? activeNpcId : undefined) ?? '',
        time_state: timeState,
        npc_relationships: npcRelationships,
        player_inventory: playerInventory,
        ally_inventory: (keepActiveNpc ? allyInventory : null) ?? undefined,
        room_states: roomStatesRef.current,
      });
      console.log('[RuntimeState] Saved on room transition');
    } catch (err) {
      console.error('[RuntimeState] Failed to save on room transition:', err);
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

    // Refresh adventure context after summarization (for next transition)
    if (worldId && currentUser?.user_uuid) {
      try {
        const updatedContext = await adventureLogApi.getAdventureContext(worldId, currentUser.user_uuid);
        setAdventureContext(updatedContext);
        console.log(`[AdventureLog] Refreshed context: ${updatedContext.entries.length} entries`);
      } catch (err) {
        console.warn('[AdventureLog] Failed to refresh adventure context:', err);
      }
    }

    // ========================================
    // PHASE: IDLE - Transition complete
    // ========================================
    setTransitionState(createIdleTransitionState());

    const transitionDuration = Date.now() - transitionStartTime;
    console.log(`[RoomTransition] Completed in ${transitionDuration}ms`);
  }, [worldCard, worldState, worldId, messages, setMessages, addMessage, activeNpcName, activeNpcId, activeNpcCard, isInCombat, gridCombat, currentRoom, roomNpcs, playerProgression, timeState, npcRelationships, playerInventory, allyInventory, currentUser, apiConfig, setShowMap, clearConversationTarget, setActiveNpcCard, setActiveNpcId, setActiveNpcName, setCurrentRoom, setEntryDirection, setIsInCombat, setLocalMapStateCache, setPlayerTilePosition, setRoomNpcs, setWorldState, roomStatesRef, setAdventureContext]);


  // Handle room navigation - persists position to backend
  // entryDir: The direction the player is entering FROM (passed from exit click)
  const handleNavigate = useCallback(async (roomId: string, entryDir: ExitDirection | null = null) => {
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

    // Navigate immediately - bring bonded ally along automatically if present
    const keepAlly = !!(activeNpcId && activeNpcName);
    await performRoomTransition(targetRoom, keepAlly, entryDir);
  }, [worldState, worldId, performRoomTransition, activeNpcId, activeNpcName]);

  const handleLocalMapExitClick = useCallback(async (exit: { direction: ExitDirection; targetRoomId: string }) => {
    console.log('Local map exit clicked:', exit);

    // Find the target room
    if (!worldState) return;

    let foundRoom: GridRoom | undefined;
    for (const row of worldState.grid) {
      for (const room of row) {
        if (room?.id === exit.targetRoomId) {
          foundRoom = room;
          break;
        }
      }
      if (foundRoom) break;
    }

    if (!foundRoom) {
      console.error('Target room not found:', exit.targetRoomId);
      return;
    }

    // Calculate entry direction (opposite of exit direction)
    // If you exit via east (>|), you enter the next room from the west (|<)
    const oppositeDirections: Record<ExitDirection, ExitDirection> = {
      north: 'south',
      south: 'north',
      east: 'west',
      west: 'east',
    };
    const entryDir = oppositeDirections[exit.direction];
    console.log(`[Exit] Exiting ${exit.direction}, will enter from ${entryDir}`);

    // Pass entry direction directly to avoid stale closure issues
    await handleNavigate(exit.targetRoomId, entryDir);
  }, [worldState, handleNavigate]);

  return {
    transitionState,
    isTransitioning,
    entryDirection,
    handleNavigate,
    handleLocalMapExitClick,
    performRoomTransition,
  };
}
