/**
 * @file useRoomTransition.ts
 * @description Manages room transition logic for world navigation.
 *
 * Transition policy:
 * - Critical path: snapshot room state, clear combat/conversation, resolve room data,
 *   preload assets, calculate spawn, swap visible state.
 * - Best effort: summarization, thin-frame generation, progress persistence, adventure
 *   context refresh. These never block gameplay on failure.
 */
import { useCallback, useState } from 'react';
import type { MutableRefObject } from 'react';
import { adventureLogApi } from '../api/adventureLogApi';
import type { WorldCard, RoomInstanceState } from '../types/worldCard';
import type { GridWorldState, GridRoom, CombatDisplayNPC } from '../types/worldGrid';
import type { ExitDirection, TilePosition, LocalMapConfig, LocalMapState } from '../types/localMap';
import { DEFAULT_LAYOUT_GRID_SIZE, LOCAL_MAP_TILE_SIZE } from '../types/localMap';
import type { ProgressStatus, TransitionState } from '../types/transition';
import {
  createIdleTransitionState,
  THIN_FRAME_TIMEOUT_MS,
  SUMMARIZATION_TIMEOUT_MS,
  TRANSITION_TIMEOUT_MS,
} from '../types/transition';
import { WORLD_PLAY_TRANSITION } from '../worldplay/config';
import type {
  WorldPlayApiConfig,
  WorldPlayCurrentUser,
  WorldPlayMessage,
  WorldPlayMessageAppender,
  WorldPlayMessageSetter,
} from '../worldplay/contracts';
import {
  pruneTravelMessages,
  snapshotRoomState,
  toSummarizeMessages,
  toSummarizeNpcs,
} from '../worldplay/roomTransition';
import type { NPCRelationship, TimeState } from '../types/worldRuntime';
import type { CharacterInventory } from '../types/inventory';
import type { CharacterCard } from '../types/schema';
import type { AdventureContext } from '../types/adventureLog';
import type { PlayerProgression } from '../utils/progressionUtils';
import {
  fetchAdventureContext,
  generateMissingThinFrames,
  preloadTransitionAssets as preloadTransitionAssetsRuntime,
  prepareTargetRoom as prepareTargetRoomRuntime,
  persistRuntimeState,
  raceWithTimeout,
  type PreparedTransitionRoom,
} from '../worldplay/transitionRuntime';

const LOCAL_MAP_CONFIG: LocalMapConfig = {
  gridWidth: DEFAULT_LAYOUT_GRID_SIZE.cols,
  gridHeight: DEFAULT_LAYOUT_GRID_SIZE.rows,
  tileSize: LOCAL_MAP_TILE_SIZE,
};

const OPPOSITE_DIRECTIONS: Record<ExitDirection, ExitDirection> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

interface UseRoomTransitionOptions {
  worldCard: WorldCard | null;
  worldState: GridWorldState | null;
  worldId: string | undefined;
  currentRoom: GridRoom | null;
  setCurrentRoom: (room: GridRoom | null) => void;
  roomNpcs: CombatDisplayNPC[];
  setRoomNpcs: (npcs: CombatDisplayNPC[]) => void;
  roomStatesRef: MutableRefObject<Record<string, RoomInstanceState>>;
  messages: WorldPlayMessage[];
  setMessages: WorldPlayMessageSetter;
  addMessage: WorldPlayMessageAppender;
  activeNpcId: string | undefined;
  activeNpcName: string;
  setActiveNpcId: (id: string | undefined) => void;
  setActiveNpcName: (name: string) => void;
  setActiveNpcCard: (card: CharacterCard | null) => void;
  clearBondedAlly: () => void;
  clearConversationTarget: () => void;
  isInCombat: boolean;
  setIsInCombat: (inCombat: boolean) => void;
  gridCombat: { endCombat: () => void };
  setLocalMapStateCache: (state: LocalMapState | null) => void;
  setPlayerTilePosition: (position: TilePosition) => void;
  setWorldState: (state: GridWorldState | null | ((prev: GridWorldState | null) => GridWorldState | null)) => void;
  setAdventureContext: (context: AdventureContext | null) => void;
  playerProgression: PlayerProgression;
  timeState: TimeState;
  npcRelationships: Record<string, NPCRelationship>;
  playerInventory: CharacterInventory;
  allyInventory: CharacterInventory | null;
  currentUser: WorldPlayCurrentUser;
  apiConfig: WorldPlayApiConfig;
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
    setActiveNpcId,
    setActiveNpcName,
    setActiveNpcCard,
    clearBondedAlly,
    clearConversationTarget,
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

  const isTransitioning = transitionState.phase !== 'idle';

  const setTransitionProgress = useCallback((
    key: keyof TransitionState['progress'],
    status: ProgressStatus
  ) => {
    setTransitionState((previous) => ({
      ...previous,
      progress: {
        ...previous.progress,
        [key]: status,
      },
    }));
  }, []);

  const setTransitionPhase = useCallback((phase: TransitionState['phase']) => {
    setTransitionState((previous) => ({
      ...previous,
      phase,
    }));
  }, []);

  const snapshotDepartingRoomState = useCallback(() => {
    if (!currentRoom) {
      return;
    }

    roomStatesRef.current[currentRoom.id] = snapshotRoomState(roomNpcs);
  }, [currentRoom, roomNpcs, roomStatesRef]);

  const clearTravelRuntimeState = useCallback(() => {
    if (isInCombat) {
      gridCombat.endCombat();
      setIsInCombat(false);
      setLocalMapStateCache(null);
    }

    clearConversationTarget();
  }, [clearConversationTarget, gridCombat, isInCombat, setIsInCombat, setLocalMapStateCache]);

  const runBestEffortSummarization = useCallback(async (transitionStartTime: number) => {
    if (!currentRoom || !worldId || !currentUser?.user_uuid || messages.length <= 2) {
      setTransitionProgress('summarization', { status: 'complete' });
      return;
    }

    setTransitionPhase('summarizing');
    setTransitionProgress('summarization', { status: 'in_progress', percent: 0 });

    try {
      await raceWithTimeout(
        adventureLogApi.summarizeRoom({
          worldUuid: worldId,
          userUuid: currentUser.user_uuid,
          roomUuid: currentRoom.id,
          roomName: currentRoom.name,
          visitedAt: transitionStartTime - (messages.length * 30000),
          messages: toSummarizeMessages(messages),
          npcs: toSummarizeNpcs(roomNpcs),
        }),
        SUMMARIZATION_TIMEOUT_MS
      );
    } catch {
      // Summarization is non-blocking and intentionally silent on failure.
    } finally {
      setTransitionProgress('summarization', { status: 'complete' });
    }
  }, [currentRoom, currentUser, messages, roomNpcs, setTransitionPhase, setTransitionProgress, worldId]);

  const pruneMessagesAfterTravel = useCallback(() => {
    const prunedMessages = pruneTravelMessages(messages, WORLD_PLAY_TRANSITION.maxMessagesOnTravel);
    if (prunedMessages !== messages) {
      setMessages(prunedMessages);
    }
  }, [messages, setMessages]);

  const prepareTransitionTargetRoom = useCallback(async (
    targetRoomStub: GridRoom,
    entryDir: ExitDirection | null
  ): Promise<PreparedTransitionRoom | null> => {
    if (!worldState || !worldCard) {
      return null;
    }

    return prepareTargetRoomRuntime({
      worldState,
      worldCard,
      targetRoomStub,
      entryDir,
      localMapConfig: LOCAL_MAP_CONFIG,
      roomStates: roomStatesRef.current,
    });
  }, [roomStatesRef, worldCard, worldState]);

  const preloadRoomTransitionAssets = useCallback(async (roomNpcsToLoad: CombatDisplayNPC[], keepActiveNpc: boolean) => {
    setTransitionPhase('loading_assets');
    setTransitionProgress('assetPreload', { status: 'in_progress', percent: 0 });

    try {
      await preloadTransitionAssetsRuntime({
        roomNpcs: roomNpcsToLoad,
        keepActiveNpc,
        activeNpcId,
        currentUser,
        timeoutMs: TRANSITION_TIMEOUT_MS,
        onProgress: (percent: number) => {
          setTransitionProgress('assetPreload', { status: 'in_progress', percent });
        },
      });
    } catch {
      // Asset loading falls back to default textures if any individual request fails.
    } finally {
      setTransitionProgress('assetPreload', { status: 'complete' });
    }
  }, [activeNpcId, currentUser, setTransitionPhase, setTransitionProgress]);

  const generateMissingThinFramesSilently = useCallback(async (roomNpcsToProcess: CombatDisplayNPC[]) => {
    setTransitionPhase('generating_frames');
    setTransitionProgress('thinFrameGeneration', { status: 'in_progress', percent: 0 });

    if (!apiConfig || roomNpcsToProcess.length === 0) {
      setTransitionProgress('thinFrameGeneration', { status: 'complete' });
      return;
    }

    try {
      await generateMissingThinFrames({
        roomNpcs: roomNpcsToProcess,
        apiConfig,
        thinFrameTimeoutMs: THIN_FRAME_TIMEOUT_MS,
        onProgress: (percent) => {
          setTransitionProgress('thinFrameGeneration', {
            status: 'in_progress',
            percent,
          });
        },
      });
    } finally {
      setTransitionProgress('thinFrameGeneration', { status: 'complete' });
    }
  }, [apiConfig, setTransitionPhase, setTransitionProgress]);

  const swapVisibleRoomState = useCallback((
    preparedRoom: PreparedTransitionRoom,
    keepActiveNpc: boolean,
    entryDir: ExitDirection | null
  ) => {
    setTransitionPhase('ready');
    setEntryDirection(entryDir);

    setWorldState((previous) => {
      if (!previous) {
        return null;
      }

      const grid = previous.grid.map((row) => [...row]);
      const { x, y } = preparedRoom.roomGridPosition;
      if (y >= 0 && y < grid.length && x >= 0 && x < grid[y].length) {
        grid[y][x] = preparedRoom.room;
      }

      return {
        ...previous,
        grid,
        player_position: preparedRoom.roomGridPosition,
      };
    });

    setCurrentRoom(preparedRoom.room);
    setRoomNpcs(preparedRoom.roomNpcs);
    setPlayerTilePosition(preparedRoom.spawnPosition);

    if (!keepActiveNpc) {
      clearBondedAlly();
    }

    if (preparedRoom.room.introduction_text) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: preparedRoom.room.introduction_text,
        timestamp: Date.now(),
        metadata: {
          type: 'room_introduction',
          roomId: preparedRoom.room.id,
          speakerName: 'Narrator',
        },
      });
    }

    if (keepActiveNpc && activeNpcName) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `*${activeNpcName} follows you into ${preparedRoom.room.name}*`,
        timestamp: Date.now(),
        metadata: {
          type: 'npc_travel',
          npcId: activeNpcId,
          roomId: preparedRoom.room.id,
          speakerName: activeNpcName,
        },
      });
    }

    setShowMap(false);
  }, [
    activeNpcId,
    activeNpcName,
    addMessage,
    setActiveNpcCard,
    setActiveNpcId,
    setActiveNpcName,
    setCurrentRoom,
    setPlayerTilePosition,
    setRoomNpcs,
    setShowMap,
    setTransitionPhase,
    setWorldState,
  ]);

  const persistRuntimeStateSilently = useCallback(async (
    preparedRoom: PreparedTransitionRoom,
    keepActiveNpc: boolean
  ) => {
    if (!worldId) {
      return;
    }

    try {
      await persistRuntimeState({
        worldId,
        roomGridPosition: preparedRoom.roomGridPosition,
        playerProgression,
        keepActiveNpc,
        activeNpcId,
        timeState,
        npcRelationships,
        playerInventory,
        allyInventory,
        roomStates: roomStatesRef.current,
      });
    } catch {
      // Runtime persistence is best effort during room travel.
    }
  }, [
    activeNpcId,
    allyInventory,
    npcRelationships,
    playerInventory,
    playerProgression.gold,
    playerProgression.level,
    playerProgression.xp,
    roomStatesRef,
    timeState,
    worldId,
  ]);

  const refreshAdventureContextSilently = useCallback(async () => {
    if (!worldId || !currentUser?.user_uuid) {
      return;
    }

    try {
      const updatedContext = await fetchAdventureContext(worldId, currentUser.user_uuid);
      setAdventureContext(updatedContext);
    } catch {
      // Adventure context refresh is best effort and intentionally silent.
    }
  }, [currentUser, setAdventureContext, worldId]);

  const performRoomTransition = useCallback(async (
    targetRoomStub: GridRoom,
    keepActiveNpc: boolean = false,
    entryDir: ExitDirection | null = null
  ) => {
    if (!worldState || !worldId || !worldCard) {
      return;
    }

    const startedAt = Date.now();
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
      startedAt,
    });

    try {
      snapshotDepartingRoomState();
      clearTravelRuntimeState();
      await runBestEffortSummarization(startedAt);
      pruneMessagesAfterTravel();

      const preparedRoom = await prepareTransitionTargetRoom(targetRoomStub, entryDir);
      if (!preparedRoom) {
        return;
      }

      await preloadRoomTransitionAssets(preparedRoom.roomNpcs, keepActiveNpc);
      await generateMissingThinFramesSilently(preparedRoom.roomNpcs);
      swapVisibleRoomState(preparedRoom, keepActiveNpc, entryDir);

      void persistRuntimeStateSilently(preparedRoom, keepActiveNpc);
      void refreshAdventureContextSilently();
    } catch (error) {
      console.error('[RoomTransition] Critical transition failure:', error);
    } finally {
      setTransitionState(createIdleTransitionState());
    }
  }, [
    clearTravelRuntimeState,
    currentRoom,
    generateMissingThinFramesSilently,
    prepareTransitionTargetRoom,
    preloadRoomTransitionAssets,
    pruneMessagesAfterTravel,
    refreshAdventureContextSilently,
    runBestEffortSummarization,
    snapshotDepartingRoomState,
    swapVisibleRoomState,
    worldCard,
    worldId,
    worldState,
    persistRuntimeStateSilently,
  ]);

  const handleNavigate = useCallback(async (roomId: string, entryDir: ExitDirection | null = null) => {
    if (!worldState) {
      return;
    }

    let foundRoom: GridRoom | undefined;
    for (const row of worldState.grid) {
      for (const room of row) {
        if (room?.id === roomId) {
          foundRoom = room;
          break;
        }
      }

      if (foundRoom) {
        break;
      }
    }

    if (!foundRoom) {
      return;
    }

    const keepAlly = Boolean(activeNpcId && activeNpcName);
    await performRoomTransition(foundRoom, keepAlly, entryDir);
  }, [activeNpcId, activeNpcName, performRoomTransition, worldState]);

  const handleLocalMapExitClick = useCallback(async (exit: { direction: ExitDirection; targetRoomId: string }) => {
    await handleNavigate(exit.targetRoomId, OPPOSITE_DIRECTIONS[exit.direction]);
  }, [handleNavigate]);

  return {
    transitionState,
    isTransitioning,
    entryDirection,
    handleNavigate,
    handleLocalMapExitClick,
    performRoomTransition,
  };
}
