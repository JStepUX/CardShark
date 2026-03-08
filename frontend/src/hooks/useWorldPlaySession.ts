import { useCallback, useReducer, useRef, type MutableRefObject, type SetStateAction } from 'react';
import type { CharacterInventory } from '../types/inventory';
import type { RoomInstanceState } from '../types/worldCard';
import type { CombatDisplayNPC } from '../types/worldGrid';
import type { NPCRelationship, TimeState } from '../types/worldRuntime';
import type { PlayerProgression } from '../utils/progressionUtils';
import type { WorldLoadResult } from './useWorldLoader';
import {
  createWorldPlaySessionState,
  type WorldPlayBondedAllyState,
  type WorldPlaySessionState,
  worldPlaySessionReducer,
} from '../worldplay/session';
import { snapshotRoomState } from '../worldplay/roomTransition';

interface UseWorldPlaySessionOptions {
  initialPlayerProgression: PlayerProgression;
  initialTimeState: TimeState;
  initialPlayerInventory: CharacterInventory;
}

interface UseWorldPlaySessionReturn extends WorldPlaySessionState {
  activeNpcId: string | undefined;
  activeNpcName: string;
  activeNpcCard: WorldPlayBondedAllyState['card'];
  roomStatesRef: MutableRefObject<Record<string, RoomInstanceState>>;
  hydrateFromWorldLoadResult: (result: WorldLoadResult) => void;
  setPlayerProgression: (value: SetStateAction<PlayerProgression>) => void;
  setTimeState: (value: SetStateAction<TimeState>) => void;
  setNpcRelationships: (value: SetStateAction<Record<string, NPCRelationship>>) => void;
  setPlayerInventory: (value: SetStateAction<CharacterInventory>) => void;
  setAllyInventory: (value: SetStateAction<CharacterInventory | null>) => void;
  setBondedAlly: (ally: WorldPlayBondedAllyState | null, inventory?: CharacterInventory | null) => void;
  setActiveNpcId: (id: string | undefined) => void;
  setActiveNpcName: (name: string) => void;
  setActiveNpcCard: (card: WorldPlayBondedAllyState['card']) => void;
  clearBondedAlly: () => void;
  resetRuntimeState: (options: { timeState: TimeState; playerInventory: CharacterInventory }) => void;
  replaceRoomStates: (roomStates: Record<string, RoomInstanceState>) => void;
  snapshotRoomState: (roomId: string, roomNpcs: CombatDisplayNPC[]) => void;
}

export function useWorldPlaySession({
  initialPlayerProgression,
  initialTimeState,
  initialPlayerInventory,
}: UseWorldPlaySessionOptions): UseWorldPlaySessionReturn {
  const [state, dispatch] = useReducer(worldPlaySessionReducer, createWorldPlaySessionState({
    playerProgression: initialPlayerProgression,
    timeState: initialTimeState,
    playerInventory: initialPlayerInventory,
  }));
  const roomStatesRef = useRef<Record<string, RoomInstanceState>>({});

  const hydrateFromWorldLoadResult = useCallback((result: WorldLoadResult) => {
    roomStatesRef.current = result.roomStates;
    dispatch({
      type: 'hydrate',
      payload: {
        playerProgression: result.playerProgression,
        timeState: result.timeState ?? state.timeState,
        npcRelationships: result.npcRelationships,
        playerInventory: result.playerInventory ?? state.playerInventory,
        bondedAlly: result.bondedAlly
          ? {
            ...result.bondedAlly,
            inventory: result.bondedAlly.inventory,
          }
          : null,
      },
    });
  }, [state.playerInventory, state.timeState]);

  const setPlayerProgression = useCallback((value: SetStateAction<PlayerProgression>) => {
    dispatch({
      type: 'set_player_progression',
      payload: value,
    });
  }, []);

  const setTimeState = useCallback((value: SetStateAction<TimeState>) => {
    dispatch({
      type: 'set_time_state',
      payload: value,
    });
  }, []);

  const setNpcRelationships = useCallback((value: SetStateAction<Record<string, NPCRelationship>>) => {
    dispatch({
      type: 'set_npc_relationships',
      payload: value,
    });
  }, []);

  const setPlayerInventory = useCallback((value: SetStateAction<CharacterInventory>) => {
    dispatch({
      type: 'set_player_inventory',
      payload: value,
    });
  }, []);

  const setAllyInventory = useCallback((value: SetStateAction<CharacterInventory | null>) => {
    dispatch({
      type: 'set_ally_inventory',
      payload: value,
    });
  }, []);

  const setBondedAlly = useCallback((ally: WorldPlayBondedAllyState | null, inventory?: CharacterInventory | null) => {
    dispatch({
      type: 'set_bonded_ally',
      payload: {
        ally,
        inventory,
      },
    });
  }, []);

  const clearBondedAlly = useCallback(() => {
    dispatch({ type: 'clear_bonded_ally' });
  }, []);

  const activeNpcId = state.bondedAlly?.id;
  const activeNpcName = state.bondedAlly?.name ?? '';
  const activeNpcCard = state.bondedAlly?.card ?? null;

  const setActiveNpcId = useCallback((id: string | undefined) => {
    if (!id) {
      clearBondedAlly();
      return;
    }

    setBondedAlly({
      id,
      name: state.bondedAlly?.name ?? '',
      card: state.bondedAlly?.card ?? null,
    });
  }, [clearBondedAlly, setBondedAlly, state.bondedAlly]);

  const setActiveNpcName = useCallback((name: string) => {
    if (!state.bondedAlly?.id) {
      return;
    }

    setBondedAlly({
      id: state.bondedAlly.id,
      name,
      card: state.bondedAlly.card,
    });
  }, [setBondedAlly, state.bondedAlly]);

  const setActiveNpcCard = useCallback((card: WorldPlayBondedAllyState['card']) => {
    if (!state.bondedAlly?.id) {
      if (!card) {
        clearBondedAlly();
      }
      return;
    }

    setBondedAlly({
      id: state.bondedAlly.id,
      name: state.bondedAlly.name,
      card,
    });
  }, [clearBondedAlly, setBondedAlly, state.bondedAlly]);

  const resetRuntimeState = useCallback((options: { timeState: TimeState; playerInventory: CharacterInventory }) => {
    roomStatesRef.current = {};
    dispatch({
      type: 'reset_runtime',
      payload: options,
    });
  }, []);

  const replaceRoomStates = useCallback((roomStates: Record<string, RoomInstanceState>) => {
    roomStatesRef.current = roomStates;
  }, []);

  const snapshotCurrentRoomState = useCallback((roomId: string, roomNpcs: CombatDisplayNPC[]) => {
    roomStatesRef.current[roomId] = snapshotRoomState(roomNpcs);
  }, []);

  return {
    ...state,
    activeNpcId,
    activeNpcName,
    activeNpcCard,
    roomStatesRef,
    hydrateFromWorldLoadResult,
    setPlayerProgression,
    setTimeState,
    setNpcRelationships,
    setPlayerInventory,
    setAllyInventory,
    setBondedAlly,
    setActiveNpcId,
    setActiveNpcName,
    setActiveNpcCard,
    clearBondedAlly,
    resetRuntimeState,
    replaceRoomStates,
    snapshotRoomState: snapshotCurrentRoomState,
  };
}
