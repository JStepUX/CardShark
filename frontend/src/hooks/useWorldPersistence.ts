/**
 * @file useWorldPersistence.ts
 * @description Handles auto-saving world runtime state to the backend.
 * Extracted from WorldPlayView.tsx to reduce its size.
 */
import { useCallback, useEffect, useRef } from 'react';
import { worldApi } from '../api/worldApi';
import type { RoomInstanceState, WorldUserProgressUpdate } from '../types/worldCard';
import type { GridRoom, CombatDisplayNPC } from '../types/worldGrid';
import type { NPCRelationship, TimeState } from '../types/worldRuntime';
import type { CharacterInventory } from '../types/inventory';
import type { PlayerProgression } from '../utils/progressionUtils';

export interface UseWorldPersistenceOptions {
  worldId: string;
  userUuid: string | undefined;
  currentRoom: GridRoom | null;
  roomNpcs: CombatDisplayNPC[];
  roomStatesRef: React.MutableRefObject<Record<string, RoomInstanceState>>;
  playerProgression: PlayerProgression;
  activeNpcId: string | undefined;
  timeState: TimeState;
  npcRelationships: Record<string, NPCRelationship>;
  playerInventory: CharacterInventory;
  allyInventory: CharacterInventory | null;
}

export interface UseWorldPersistenceReturn {
  saveWorldRuntimeState: (opts?: { skipRoomState?: boolean }) => Promise<void>;
  debouncedSaveRuntimeState: () => void;
}

export function useWorldPersistence({
  worldId,
  userUuid,
  currentRoom,
  roomNpcs,
  roomStatesRef,
  playerProgression,
  activeNpcId,
  timeState,
  npcRelationships,
  playerInventory,
  allyInventory,
}: UseWorldPersistenceOptions): UseWorldPersistenceReturn {
  // Debounce timer ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Build RoomInstanceState from the current room's NPC list.
   * Only records non-alive NPCs to keep data compact.
   */
  const buildCurrentRoomState = useCallback((): RoomInstanceState => {
    const npcStates: Record<string, { status: 'alive' | 'incapacitated' | 'dead' }> = {};
    for (const npc of roomNpcs) {
      if (npc.isDead) {
        npcStates[npc.id] = { status: 'dead' };
      } else if (npc.isIncapacitated) {
        npcStates[npc.id] = { status: 'incapacitated' };
      }
      // Alive NPCs omitted (default state)
    }
    return { npc_states: npcStates };
  }, [roomNpcs]);

  /**
   * Save all world runtime state to the backend via the per-user progress API.
   * Merges current room's NPC states into the accumulated room_states ref
   * before saving.
   */
  const saveWorldRuntimeState = useCallback(async (opts?: { skipRoomState?: boolean }) => {
    if (!worldId || !userUuid) {
      console.warn('[RuntimeState] Cannot save - missing worldId or userUuid');
      return;
    }

    // Snapshot current room state into the ref (unless told to skip)
    if (!opts?.skipRoomState && currentRoom) {
      roomStatesRef.current[currentRoom.id] = buildCurrentRoomState();
    }

    try {
      // Save to per-user progress API instead of world card
      const progressUpdate: WorldUserProgressUpdate = {
        player_xp: playerProgression.xp,
        player_level: playerProgression.level,
        player_gold: playerProgression.gold,
        current_room_uuid: currentRoom?.id,
        bonded_ally_uuid: activeNpcId ?? '',  // Empty string = clear on backend
        time_state: timeState,
        npc_relationships: npcRelationships,
        player_inventory: playerInventory,
        ally_inventory: allyInventory ?? undefined,
        room_states: roomStatesRef.current,
      };

      await worldApi.saveProgress(worldId, userUuid, progressUpdate);
      console.log('[RuntimeState] Saved to backend (per-user progress)');
    } catch (err) {
      console.error('[RuntimeState] Failed to save:', err);
    }
  }, [worldId, userUuid, currentRoom, buildCurrentRoomState, playerProgression, activeNpcId, timeState, npcRelationships, playerInventory, allyInventory, roomStatesRef]);

  /**
   * Debounced save - batches frequent state changes (affinity, time, inventory)
   * into a single API call after 2 seconds of inactivity.
   */
  const debouncedSaveRuntimeState = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveWorldRuntimeState();
    }, 2000);
  }, [saveWorldRuntimeState]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Auto-save on relationship changes (debounced)
  const prevRelationshipsRef = useRef(npcRelationships);
  useEffect(() => {
    if (prevRelationshipsRef.current !== npcRelationships && Object.keys(npcRelationships).length > 0) {
      prevRelationshipsRef.current = npcRelationships;
      debouncedSaveRuntimeState();
    }
  }, [npcRelationships, debouncedSaveRuntimeState]);

  // Auto-save on time state changes (debounced)
  const prevTimeRef = useRef(timeState);
  useEffect(() => {
    if (prevTimeRef.current !== timeState && timeState.totalMessages > 0) {
      prevTimeRef.current = timeState;
      debouncedSaveRuntimeState();
    }
  }, [timeState, debouncedSaveRuntimeState]);

  // Auto-save on inventory changes (debounced)
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

  // Auto-save on bonded ally changes (debounced)
  const prevAllyIdRef = useRef(activeNpcId);
  useEffect(() => {
    if (prevAllyIdRef.current !== activeNpcId) {
      prevAllyIdRef.current = activeNpcId;
      debouncedSaveRuntimeState();
    }
  }, [activeNpcId, debouncedSaveRuntimeState]);

  // Auto-save on progression changes (debounced) - catches combat rewards
  const prevProgressionRef = useRef(playerProgression);
  useEffect(() => {
    if (prevProgressionRef.current !== playerProgression && playerProgression.xp > 0) {
      prevProgressionRef.current = playerProgression;
      debouncedSaveRuntimeState();
    }
  }, [playerProgression, debouncedSaveRuntimeState]);

  return { saveWorldRuntimeState, debouncedSaveRuntimeState };
}
