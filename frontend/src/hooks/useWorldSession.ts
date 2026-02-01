/**
 * @file useWorldSession.ts
 * @description Hook for managing world session state and persistence.
 *
 * Extracted from WorldPlayView to separate concerns:
 * - World card loading
 * - User progress loading/saving
 * - Runtime state persistence (relationships, time, inventory)
 * - Adventure context loading
 *
 * This hook manages the "session" aspect of world play - the persistent
 * state that carries across room transitions and play sessions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { worldApi } from '../api/worldApi';
import { adventureLogApi } from '../api/adventureLogApi';
import type { WorldCard, RoomInstanceState, WorldUserProgress, WorldUserProgressUpdate } from '../types/worldCard';
import type { GridWorldState, GridRoom } from '../types/worldGrid';
import type { NPCRelationship, TimeState, TimeConfig } from '../types/worldRuntime';
import type { CharacterInventory } from '../types/inventory';
import type { AdventureContext } from '../types/adventureLog';
import type { PlayerProgression } from '../utils/progressionUtils';
import { createDefaultTimeState } from '../utils/timeUtils';
import { createDefaultInventory } from '../types/inventory';
import { createDefaultPlayerProgression, calculateLevelFromXP } from '../utils/progressionUtils';
import { placementToGridRoomStub } from '../utils/roomCardAdapter';

// =============================================================================
// Types
// =============================================================================

export interface WorldSessionState {
  // Core world data
  worldCard: WorldCard | null;
  worldState: GridWorldState | null;
  worldId: string;

  // Player progression
  playerProgression: PlayerProgression;

  // Runtime state
  timeState: TimeState;
  timeConfig: TimeConfig;
  npcRelationships: Record<string, NPCRelationship>;
  playerInventory: CharacterInventory;
  allyInventory: CharacterInventory | null;

  // Room states (NPC alive/dead/incapacitated per room)
  roomStatesRef: React.MutableRefObject<Record<string, RoomInstanceState>>;

  // Adventure context for narrative continuity
  adventureContext: AdventureContext | null;

  // Bonded ally (restored from progress)
  savedBondedAllyUuid: string | undefined;

  // Loading state
  isLoading: boolean;
  error: string | null;
}

export interface WorldSessionActions {
  // Progression updates
  setPlayerProgression: React.Dispatch<React.SetStateAction<PlayerProgression>>;

  // Runtime state updates
  setTimeState: React.Dispatch<React.SetStateAction<TimeState>>;
  setNpcRelationships: React.Dispatch<React.SetStateAction<Record<string, NPCRelationship>>>;
  setPlayerInventory: React.Dispatch<React.SetStateAction<CharacterInventory>>;
  setAllyInventory: React.Dispatch<React.SetStateAction<CharacterInventory | null>>;

  // Adventure context
  setAdventureContext: React.Dispatch<React.SetStateAction<AdventureContext | null>>;

  // World state updates
  setWorldState: React.Dispatch<React.SetStateAction<GridWorldState | null>>;

  // Persistence
  saveWorldRuntimeState: (opts?: { skipRoomState?: boolean }) => Promise<void>;
  debouncedSaveRuntimeState: () => void;
}

export interface UseWorldSessionOptions {
  worldId: string;
  userUuid: string | undefined;
  onNoUser?: () => void;
}

export interface UseWorldSessionResult {
  state: WorldSessionState;
  actions: WorldSessionActions;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useWorldSession(options: UseWorldSessionOptions): UseWorldSessionResult {
  const { worldId, userUuid, onNoUser } = options;

  // Core world data
  const [worldCard, setWorldCard] = useState<WorldCard | null>(null);
  const [worldState, setWorldState] = useState<GridWorldState | null>(null);

  // Player progression
  const [playerProgression, setPlayerProgression] = useState<PlayerProgression>(createDefaultPlayerProgression());

  // Runtime state
  const [timeState, setTimeState] = useState<TimeState>(createDefaultTimeState());
  const [timeConfig] = useState<TimeConfig>({
    messagesPerDay: 50,
    enableDayNightCycle: true,
  });
  const [npcRelationships, setNpcRelationships] = useState<Record<string, NPCRelationship>>({});
  const [playerInventory, setPlayerInventory] = useState<CharacterInventory>(() => createDefaultInventory());
  const [allyInventory, setAllyInventory] = useState<CharacterInventory | null>(null);

  // Room states ref (avoid re-renders on every combat)
  const roomStatesRef = useRef<Record<string, RoomInstanceState>>({});

  // Adventure context
  const [adventureContext, setAdventureContext] = useState<AdventureContext | null>(null);

  // Restored bonded ally UUID (fetched from progress, resolved by caller)
  const [savedBondedAllyUuid, setSavedBondedAllyUuid] = useState<string | undefined>();

  // Loading state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce timer ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ==========================================================================
  // Load World Data
  // ==========================================================================

  useEffect(() => {
    async function loadWorld() {
      if (!worldId) {
        setError('No world ID provided');
        setIsLoading(false);
        return;
      }

      // Check if user was selected
      if (!userUuid) {
        console.warn('[useWorldSession] No user selected');
        onNoUser?.();
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Load world card (V2) - single API call
        const world = await worldApi.getWorld(worldId);
        setWorldCard(world);

        const worldData = world.data.extensions.world_data;

        // Load per-user progress
        let progress: WorldUserProgress | null = null;
        let migratedFromWorldData = false;

        try {
          progress = await worldApi.getProgress(worldId, userUuid);
          console.log('[useWorldSession] Loaded progress:', progress ? 'found' : 'not found');
        } catch (err) {
          console.warn('[useWorldSession] Failed to load progress:', err);
        }

        // Load adventure context for narrative continuity
        try {
          const loadedAdventureContext = await adventureLogApi.getAdventureContext(worldId, userUuid);
          setAdventureContext(loadedAdventureContext);
          console.log(`[useWorldSession] Loaded ${loadedAdventureContext.entries.length} room summaries`);
        } catch (err) {
          console.warn('[useWorldSession] Failed to load adventure context:', err);
        }

        // Migrate embedded world_data progress if no progress exists
        if (!progress) {
          const hasEmbeddedProgress = (
            (worldData.player_xp && worldData.player_xp > 0) ||
            (worldData.player_level && worldData.player_level > 1) ||
            (worldData.player_gold && worldData.player_gold > 0) ||
            (worldData.npc_relationships && Object.keys(worldData.npc_relationships).length > 0) ||
            worldData.time_state ||
            worldData.player_inventory
          );

          if (hasEmbeddedProgress) {
            console.log('[useWorldSession] Migrating embedded progress to database');
            migratedFromWorldData = true;

            progress = {
              world_uuid: worldId,
              user_uuid: userUuid,
              player_xp: worldData.player_xp ?? 0,
              player_level: worldData.player_level ?? 1,
              player_gold: worldData.player_gold ?? 0,
              current_room_uuid: undefined,
              bonded_ally_uuid: worldData.bonded_ally_uuid,
              time_state: worldData.time_state,
              npc_relationships: worldData.npc_relationships,
              player_inventory: worldData.player_inventory,
              ally_inventory: worldData.ally_inventory,
              room_states: worldData.room_states,
            };

            try {
              await worldApi.saveProgress(worldId, userUuid, progress);
              console.log('[useWorldSession] Migration saved to database');
            } catch (saveErr) {
              console.error('[useWorldSession] Failed to save migrated progress:', saveErr);
            }
          }
        }

        // Initialize state from progress (or defaults)
        const savedProgression: PlayerProgression = {
          xp: progress?.player_xp ?? 0,
          level: progress?.player_level ?? calculateLevelFromXP(progress?.player_xp ?? 0),
          gold: progress?.player_gold ?? 0,
        };
        savedProgression.level = calculateLevelFromXP(savedProgression.xp);
        setPlayerProgression(savedProgression);
        console.log('[useWorldSession] Loaded progression:', savedProgression, migratedFromWorldData ? '(migrated)' : '');

        // Restore runtime state
        if (progress?.time_state) {
          setTimeState(progress.time_state as TimeState);
        }
        if (progress?.npc_relationships && Object.keys(progress.npc_relationships).length > 0) {
          setNpcRelationships(progress.npc_relationships as Record<string, NPCRelationship>);
        }
        if (progress?.player_inventory) {
          setPlayerInventory(progress.player_inventory as CharacterInventory);
        }
        if (progress?.ally_inventory) {
          setAllyInventory(progress.ally_inventory as CharacterInventory);
        }
        if (progress?.room_states) {
          roomStatesRef.current = progress.room_states as Record<string, RoomInstanceState>;
        }

        // Store bonded ally UUID for restoration
        setSavedBondedAllyUuid(progress?.bonded_ally_uuid);

        // Build grid from placements (lazy loading)
        const gridSize = worldData.grid_size;
        const grid: (GridRoom | null)[][] = Array(gridSize.height)
          .fill(null)
          .map(() => Array(gridSize.width).fill(null));

        for (const placement of worldData.rooms) {
          const { x, y } = placement.grid_position;
          const gridRoom = placementToGridRoomStub(placement);
          if (y >= 0 && y < gridSize.height && x >= 0 && x < gridSize.width) {
            grid[y][x] = gridRoom;
          }
        }

        // Create GridWorldState
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

        console.log(`[useWorldSession] World loaded: ${worldData.rooms.length} rooms`);
      } catch (err) {
        console.error('[useWorldSession] Error loading world:', err);
        setError(err instanceof Error ? err.message : 'Failed to load world');
      } finally {
        setIsLoading(false);
      }
    }

    loadWorld();
  }, [worldId, userUuid, onNoUser]);

  // ==========================================================================
  // Runtime State Persistence
  // ==========================================================================

  const saveWorldRuntimeState = useCallback(async (_opts?: { skipRoomState?: boolean }) => {
    if (!worldId || !userUuid) {
      console.warn('[useWorldSession] Cannot save - missing worldId or userUuid');
      return;
    }

    try {
      const progressUpdate: WorldUserProgressUpdate = {
        player_xp: playerProgression.xp,
        player_level: playerProgression.level,
        player_gold: playerProgression.gold,
        time_state: timeState,
        npc_relationships: npcRelationships,
        player_inventory: playerInventory,
        ally_inventory: allyInventory ?? undefined,
        room_states: roomStatesRef.current,
      };

      await worldApi.saveProgress(worldId, userUuid, progressUpdate);
      console.log('[useWorldSession] Saved runtime state');
    } catch (err) {
      console.error('[useWorldSession] Failed to save:', err);
    }
  }, [worldId, userUuid, playerProgression, timeState, npcRelationships, playerInventory, allyInventory]);

  const debouncedSaveRuntimeState = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveWorldRuntimeState();
    }, 2000);
  }, [saveWorldRuntimeState]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ==========================================================================
  // Auto-save Effects
  // ==========================================================================

  // Auto-save on relationship changes
  const prevRelationshipsRef = useRef(npcRelationships);
  useEffect(() => {
    if (prevRelationshipsRef.current !== npcRelationships && Object.keys(npcRelationships).length > 0) {
      prevRelationshipsRef.current = npcRelationships;
      debouncedSaveRuntimeState();
    }
  }, [npcRelationships, debouncedSaveRuntimeState]);

  // Auto-save on time state changes
  const prevTimeRef = useRef(timeState);
  useEffect(() => {
    if (prevTimeRef.current !== timeState && timeState.totalMessages > 0) {
      prevTimeRef.current = timeState;
      debouncedSaveRuntimeState();
    }
  }, [timeState, debouncedSaveRuntimeState]);

  // Auto-save on inventory changes
  const prevPlayerInvRef = useRef(playerInventory);
  const prevAllyInvRef = useRef(allyInventory);
  useEffect(() => {
    const playerChanged = prevPlayerInvRef.current !== playerInventory;
    const allyChanged = prevAllyInvRef.current !== allyInventory;
    if (playerChanged || allyChanged) {
      prevPlayerInvRef.current = playerInventory;
      prevAllyInvRef.current = allyInventory;
      debouncedSaveRuntimeState();
    }
  }, [playerInventory, allyInventory, debouncedSaveRuntimeState]);

  // Auto-save on progression changes
  const prevProgressionRef = useRef(playerProgression);
  useEffect(() => {
    if (prevProgressionRef.current !== playerProgression && playerProgression.xp > 0) {
      prevProgressionRef.current = playerProgression;
      debouncedSaveRuntimeState();
    }
  }, [playerProgression, debouncedSaveRuntimeState]);

  // ==========================================================================
  // Return
  // ==========================================================================

  return {
    state: {
      worldCard,
      worldState,
      worldId,
      playerProgression,
      timeState,
      timeConfig,
      npcRelationships,
      playerInventory,
      allyInventory,
      roomStatesRef,
      adventureContext,
      savedBondedAllyUuid,
      isLoading,
      error,
    },
    actions: {
      setPlayerProgression,
      setTimeState,
      setNpcRelationships,
      setPlayerInventory,
      setAllyInventory,
      setAdventureContext,
      setWorldState,
      saveWorldRuntimeState,
      debouncedSaveRuntimeState,
    },
  };
}
