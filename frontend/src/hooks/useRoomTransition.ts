/**
 * @file useRoomTransition.ts
 * @description Hook for managing room transitions in world play.
 *
 * Extracted from WorldPlayView to separate concerns:
 * - Transition state machine (initiating -> summarizing -> loading -> generating -> ready)
 * - Room loading and NPC resolution
 * - Asset preloading (textures)
 * - Thin frame generation
 * - Message pruning on travel
 *
 * This hook manages the complex multi-phase process of moving between rooms.
 */

import { useState, useCallback } from 'react';
import { roomApi } from '../api/roomApi';
import { adventureLogApi } from '../api/adventureLogApi';
import { worldApi } from '../api/worldApi';
import type { WorldCard, RoomInstanceState } from '../types/worldCard';
import type { GridWorldState, GridRoom } from '../types/worldGrid';
import type { ExitDirection, LocalMapConfig, TilePosition } from '../types/localMap';
import type { TransitionState } from '../types/transition';
import type { CharacterCard } from '../types/schema';
import type { NPCRelationship, TimeState } from '../types/worldRuntime';
import type { CharacterInventory } from '../types/inventory';
import type { SummarizeMessage, SummarizeNPC } from '../types/adventureLog';
import type { PlayerProgression } from '../utils/progressionUtils';
import type { Message } from '../services/chat/chatTypes';
import { createIdleTransitionState, TRANSITION_TIMEOUT_MS, THIN_FRAME_TIMEOUT_MS, SUMMARIZATION_TIMEOUT_MS } from '../types/transition';
import { roomCardToGridRoom, placementToGridRoomStub } from '../utils/roomCardAdapter';
import { resolveNpcDisplayData } from '../utils/worldStateApi';
import { preloadRoomTextures } from '../utils/texturePreloader';
import { getSpawnPosition } from '../utils/localMapUtils';
import { generateThinFrame, mergeThinFrameIntoCard } from '../services/thinFrameService';
import { isValidThinFrame } from '../types/schema';

// =============================================================================
// Types
// =============================================================================

/** Extended DisplayNPC with combat info */
export interface CombatDisplayNPC {
  id: string;
  name: string;
  imageUrl: string;
  personality?: string;
  hostile?: boolean;
  monster_level?: number;
  isIncapacitated?: boolean;
  isDead?: boolean;
}

export interface RoomTransitionState {
  transitionState: TransitionState;
  currentRoom: GridRoom | null;
  roomNpcs: CombatDisplayNPC[];
  playerTilePosition: TilePosition;
  entryDirection: ExitDirection | null;
}

export interface RoomTransitionDependencies {
  // World session data
  worldId: string;
  userUuid: string | undefined;
  worldCard: WorldCard | null;
  worldState: GridWorldState | null;
  setWorldState: React.Dispatch<React.SetStateAction<GridWorldState | null>>;

  // Room state ref
  roomStatesRef: React.MutableRefObject<Record<string, RoomInstanceState>>;

  // Runtime state for saving
  playerProgression: PlayerProgression;
  timeState: TimeState;
  npcRelationships: Record<string, NPCRelationship>;
  playerInventory: CharacterInventory;
  allyInventory: CharacterInventory | null;

  // Active NPC state
  activeNpcId: string | undefined;
  activeNpcName: string;

  // User info
  currentUser: { id?: string; name?: string; filename?: string; user_uuid?: string } | null;

  // API config for thin frame generation
  apiConfig: Record<string, unknown> | null;

  // Message management
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;

  // Combat cleanup
  isInCombat: boolean;
  endCombat: () => void;
  setIsInCombat: (value: boolean) => void;

  // Conversation cleanup
  clearConversationTarget: () => void;

  // Local map config
  localMapConfig: LocalMapConfig;
}

export interface UseRoomTransitionResult {
  // State
  transitionState: TransitionState;
  currentRoom: GridRoom | null;
  roomNpcs: CombatDisplayNPC[];
  playerTilePosition: TilePosition;
  entryDirection: ExitDirection | null;
  isTransitioning: boolean;

  // Setters (for external updates like combat)
  setCurrentRoom: React.Dispatch<React.SetStateAction<GridRoom | null>>;
  setRoomNpcs: React.Dispatch<React.SetStateAction<CombatDisplayNPC[]>>;
  setPlayerTilePosition: React.Dispatch<React.SetStateAction<TilePosition>>;
  setEntryDirection: React.Dispatch<React.SetStateAction<ExitDirection | null>>;

  // Actions
  performRoomTransition: (
    targetRoomStub: GridRoom,
    keepActiveNpc?: boolean,
    entryDir?: ExitDirection | null
  ) => Promise<void>;
  handleNavigate: (targetRoomId: string, entryDir?: ExitDirection | null) => Promise<void>;
  loadInitialRoom: (placement: { room_uuid: string; grid_position: { x: number; y: number }; instance_name?: string; instance_npcs?: unknown[] }, gridSize: { width: number; height: number }) => Promise<GridRoom | null>;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useRoomTransition(deps: RoomTransitionDependencies): UseRoomTransitionResult {
  const {
    worldId,
    userUuid: _userUuid,
    worldCard,
    worldState,
    setWorldState,
    roomStatesRef,
    playerProgression,
    timeState,
    npcRelationships,
    playerInventory,
    allyInventory,
    activeNpcId,
    activeNpcName,
    currentUser,
    apiConfig,
    messages,
    setMessages,
    addMessage,
    isInCombat,
    endCombat,
    setIsInCombat,
    clearConversationTarget,
    localMapConfig,
  } = deps;

  // Room transition state
  const [transitionState, setTransitionState] = useState<TransitionState>(createIdleTransitionState);
  const [currentRoom, setCurrentRoom] = useState<GridRoom | null>(null);
  const [roomNpcs, setRoomNpcs] = useState<CombatDisplayNPC[]>([]);
  const [playerTilePosition, setPlayerTilePosition] = useState<TilePosition>({ x: 2, y: 2 });
  const [entryDirection, setEntryDirection] = useState<ExitDirection | null>(null);

  // Computed
  const isTransitioning = transitionState.phase !== 'idle';

  // ==========================================================================
  // Room Loading Helper
  // ==========================================================================

  /**
   * Load the initial room when the world first loads.
   */
  const loadInitialRoom = useCallback(async (
    placement: { room_uuid: string; grid_position: { x: number; y: number }; instance_name?: string; instance_npcs?: unknown[] },
    _gridSize: { width: number; height: number }
  ): Promise<GridRoom | null> => {
    try {
      const roomCard = await roomApi.getRoom(placement.room_uuid);
      const fullRoom = roomCardToGridRoom(roomCard, placement.grid_position, placement as any);

      // Resolve NPCs
      const npcUuids = fullRoom.npcs.map(npc => npc.character_uuid);
      const resolvedNpcs = await resolveNpcDisplayData(npcUuids);

      // Merge with combat data
      let npcsWithCombatData: CombatDisplayNPC[] = resolvedNpcs.map(npc => {
        const roomNpc = fullRoom.npcs.find(rn => rn.character_uuid === npc.id);
        return {
          ...npc,
          hostile: roomNpc?.hostile,
          monster_level: roomNpc?.monster_level,
        };
      });

      // Apply saved room state
      const savedRoomState = roomStatesRef.current[fullRoom.id];
      if (savedRoomState?.npc_states) {
        npcsWithCombatData = npcsWithCombatData
          .filter(npc => savedRoomState.npc_states[npc.id]?.status !== 'dead')
          .map(npc => {
            const npcState = savedRoomState.npc_states[npc.id];
            if (npcState?.status === 'incapacitated') {
              return { ...npc, isIncapacitated: true };
            }
            return npc;
          });
      }

      setCurrentRoom(fullRoom);
      setRoomNpcs(npcsWithCombatData);

      return fullRoom;
    } catch (err) {
      console.error(`[useRoomTransition] Failed to load room ${placement.room_uuid}:`, err);
      const stubRoom = placementToGridRoomStub(placement as any);
      setCurrentRoom(stubRoom);
      return stubRoom;
    }
  }, [roomStatesRef]);

  // ==========================================================================
  // Room Transition
  // ==========================================================================

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

    console.log(`[useRoomTransition] Starting transition to: ${targetRoomStub.name}`);

    // Snapshot departing room's NPC states
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

    // End combat if active
    if (isInCombat) {
      endCombat();
      setIsInCombat(false);
    }

    // Clear conversation target
    clearConversationTarget();

    // ========================================
    // PHASE: SUMMARIZING
    // ========================================
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
        const summarizeMessages: SummarizeMessage[] = messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        const summarizeNpcs: SummarizeNPC[] = roomNpcs.map(npc => ({
          id: npc.id,
          name: npc.name,
        }));

        const visitedAt = transitionStartTime - (messages.length * 30000);

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
          console.log(`[useRoomTransition] Summarization completed: ${result.summary.keyEvents.length} events`);
        }

        setTransitionState(prev => ({
          ...prev,
          progress: {
            ...prev.progress,
            summarization: { status: 'complete' },
          },
        }));
      } catch (error) {
        console.warn('[useRoomTransition] Summarization failed:', error);
        setTransitionState(prev => ({
          ...prev,
          progress: {
            ...prev.progress,
            summarization: { status: 'failed', error: 'Summarization failed' },
          },
        }));
      }
    } else {
      setTransitionState(prev => ({
        ...prev,
        progress: {
          ...prev.progress,
          summarization: { status: 'complete' },
        },
      }));
    }

    // Prune messages
    const MAX_MESSAGES_ON_TRAVEL = 8;
    if (messages.length > MAX_MESSAGES_ON_TRAVEL) {
      const recentMessages = messages.slice(-MAX_MESSAGES_ON_TRAVEL);
      setMessages(recentMessages);
    }

    // Find target room coordinates
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

    // Fetch full room data
    let targetRoom = targetRoomStub;
    const worldData = worldCard.data.extensions.world_data;
    const placement = worldData.rooms.find(r => r.room_uuid === targetRoomStub.id);

    if (placement) {
      try {
        const roomCard = await roomApi.getRoom(placement.room_uuid);
        targetRoom = roomCardToGridRoom(roomCard, { x: foundX, y: foundY }, placement);
      } catch (err) {
        console.error(`[useRoomTransition] Failed to fetch room:`, err);
      }
    }

    // Resolve NPCs
    const npcUuids = targetRoom.npcs.map(npc => npc.character_uuid);
    const resolvedNpcs = await resolveNpcDisplayData(npcUuids);

    let npcsWithCombatData: CombatDisplayNPC[] = resolvedNpcs.map(npc => {
      const roomNpc = targetRoom.npcs.find(rn => rn.character_uuid === npc.id);
      return {
        ...npc,
        hostile: roomNpc?.hostile,
        monster_level: roomNpc?.monster_level,
      };
    });

    // Apply saved room state
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

    const playerImgPath = currentUser?.filename
      ? `/api/user-image/${encodeURIComponent(currentUser.filename)}`
      : null;
    const companionImgPath = keepActiveNpc && activeNpcId
      ? `/api/character-image/${activeNpcId}.png`
      : null;
    const npcImageUrls = npcsWithCombatData.map(n => n.imageUrl).filter(Boolean) as string[];

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
    // PHASE: GENERATING_FRAMES
    // ========================================
    if (apiConfig && npcsWithCombatData.length > 0) {
      setTransitionState(prev => ({
        ...prev,
        phase: 'generating_frames',
        progress: {
          ...prev.progress,
          thinFrameGeneration: { status: 'in_progress', percent: 0 },
        },
      }));

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
          console.warn(`[useRoomTransition] Failed to check NPC ${npc.id}:`, err);
        }
      }

      if (npcsNeedingFrames.length > 0) {
        let generatedCount = 0;
        for (const npcId of npcsNeedingFrames) {
          try {
            const npcCardResponse = await fetch(`/api/character/${npcId}/metadata`);
            if (!npcCardResponse.ok) continue;

            const npcCardData = await npcCardResponse.json();
            const npcCard = npcCardData.data || npcCardData as CharacterCard;

            const thinFrame = await generateThinFrame(npcCard, apiConfig, { timeout: THIN_FRAME_TIMEOUT_MS });
            const updatedCard = mergeThinFrameIntoCard(npcCard, thinFrame);

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
            console.warn(`[useRoomTransition] Failed to generate thin frame:`, err);
          }
        }
      }

      setTransitionState(prev => ({
        ...prev,
        progress: {
          ...prev.progress,
          thinFrameGeneration: { status: 'complete' },
        },
      }));
    } else {
      setTransitionState(prev => ({
        ...prev,
        progress: {
          ...prev.progress,
          thinFrameGeneration: { status: 'complete' },
        },
      }));
    }

    // ========================================
    // PHASE: READY - Atomic state updates
    // ========================================
    setTransitionState(prev => ({ ...prev, phase: 'ready' }));

    const spawnPos = entryDir
      ? getSpawnPosition(entryDir, localMapConfig)
      : { x: 2, y: 2 };

    const newGrid = [...worldState.grid.map(row => [...row])];
    if (foundY >= 0 && foundY < newGrid.length && foundX >= 0 && foundX < newGrid[0].length) {
      newGrid[foundY][foundX] = targetRoom;
    }

    // Atomic updates
    setWorldState(prev => prev ? {
      ...prev,
      grid: newGrid,
      player_position: { x: foundX, y: foundY },
    } : null);
    setCurrentRoom(targetRoom);
    setRoomNpcs(npcsWithCombatData);
    setPlayerTilePosition(spawnPos);
    setEntryDirection(null);

    // Persist to backend
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
    } catch (err) {
      console.error('[useRoomTransition] Failed to save:', err);
    }

    // Add room introduction
    if (targetRoom.introduction_text) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: targetRoom.introduction_text,
        timestamp: Date.now(),
        metadata: {
          type: 'room_introduction',
          roomId: targetRoom.id,
        },
      });
    }

    // Reset transition state after short delay
    setTimeout(() => {
      setTransitionState(createIdleTransitionState);
    }, 500);
  }, [
    worldState, worldId, worldCard, currentRoom, roomNpcs, roomStatesRef,
    isInCombat, endCombat, setIsInCombat, clearConversationTarget,
    messages, setMessages, addMessage, currentUser, apiConfig,
    activeNpcId, activeNpcName, playerProgression, timeState,
    npcRelationships, playerInventory, allyInventory, setWorldState, localMapConfig
  ]);

  // ==========================================================================
  // Navigation Handler
  // ==========================================================================

  const handleNavigate = useCallback(async (targetRoomId: string, entryDir: ExitDirection | null = null) => {
    if (!worldState) return;

    let foundRoom: GridRoom | undefined;
    for (const row of worldState.grid) {
      for (const room of row) {
        if (room?.id === targetRoomId) {
          foundRoom = room;
          break;
        }
      }
      if (foundRoom) break;
    }

    if (!foundRoom) {
      console.error('[useRoomTransition] Target room not found:', targetRoomId);
      return;
    }

    // If bonded ally, defer to caller for party gather modal
    // Otherwise, transition directly
    await performRoomTransition(foundRoom, !!activeNpcId, entryDir);
  }, [worldState, activeNpcId, performRoomTransition]);

  // ==========================================================================
  // Return
  // ==========================================================================

  return {
    transitionState,
    currentRoom,
    roomNpcs,
    playerTilePosition,
    entryDirection,
    isTransitioning,
    setCurrentRoom,
    setRoomNpcs,
    setPlayerTilePosition,
    setEntryDirection,
    performRoomTransition,
    handleNavigate,
    loadInitialRoom,
  };
}
