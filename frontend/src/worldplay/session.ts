import type { CharacterInventory } from '../types/inventory';
import type { CharacterCard } from '../types/schema';
import type { NPCRelationship, TimeState } from '../types/worldRuntime';
import type { PlayerProgression } from '../utils/progressionUtils';
import type { SetStateAction } from 'react';

export interface WorldPlayBondedAllyState {
  id: string;
  name: string;
  card: CharacterCard | null;
}

export interface WorldPlaySessionState {
  playerProgression: PlayerProgression;
  timeState: TimeState;
  npcRelationships: Record<string, NPCRelationship>;
  playerInventory: CharacterInventory;
  allyInventory: CharacterInventory | null;
  bondedAlly: WorldPlayBondedAllyState | null;
}

type HydratedWorldPlaySession = Partial<WorldPlaySessionState> & {
  bondedAlly?: (WorldPlayBondedAllyState & { inventory?: CharacterInventory | null }) | null;
};

type SessionAction =
  | { type: 'hydrate'; payload: HydratedWorldPlaySession }
  | { type: 'set_player_progression'; payload: SetStateAction<PlayerProgression> }
  | { type: 'set_time_state'; payload: SetStateAction<TimeState> }
  | { type: 'set_npc_relationships'; payload: SetStateAction<Record<string, NPCRelationship>> }
  | { type: 'set_player_inventory'; payload: SetStateAction<CharacterInventory> }
  | { type: 'set_ally_inventory'; payload: SetStateAction<CharacterInventory | null> }
  | { type: 'set_bonded_ally'; payload: { ally: WorldPlayBondedAllyState | null; inventory?: CharacterInventory | null } }
  | { type: 'clear_bonded_ally' }
  | { type: 'reset_runtime'; payload: { timeState: TimeState; playerInventory: CharacterInventory } };

export function createWorldPlaySessionState(
  defaults: Pick<WorldPlaySessionState, 'playerProgression' | 'timeState' | 'playerInventory'>
): WorldPlaySessionState {
  return {
    playerProgression: defaults.playerProgression,
    timeState: defaults.timeState,
    npcRelationships: {},
    playerInventory: defaults.playerInventory,
    allyInventory: null,
    bondedAlly: null,
  };
}

function resolveStateUpdate<T>(previous: T, next: SetStateAction<T>): T {
  return typeof next === 'function'
    ? (next as (value: T) => T)(previous)
    : next;
}

export function worldPlaySessionReducer(
  state: WorldPlaySessionState,
  action: SessionAction
): WorldPlaySessionState {
  switch (action.type) {
    case 'hydrate': {
      const nextState: WorldPlaySessionState = {
        ...state,
        ...action.payload,
      };

      if (action.payload.bondedAlly === undefined) {
        return nextState;
      }

      return {
        ...nextState,
        bondedAlly: action.payload.bondedAlly
          ? {
            id: action.payload.bondedAlly.id,
            name: action.payload.bondedAlly.name,
            card: action.payload.bondedAlly.card,
          }
          : null,
        allyInventory: action.payload.bondedAlly?.inventory ?? null,
      };
    }
    case 'set_player_progression':
      return {
        ...state,
        playerProgression: resolveStateUpdate(state.playerProgression, action.payload),
      };
    case 'set_time_state':
      return {
        ...state,
        timeState: resolveStateUpdate(state.timeState, action.payload),
      };
    case 'set_npc_relationships':
      return {
        ...state,
        npcRelationships: resolveStateUpdate(state.npcRelationships, action.payload),
      };
    case 'set_player_inventory':
      return {
        ...state,
        playerInventory: resolveStateUpdate(state.playerInventory, action.payload),
      };
    case 'set_ally_inventory':
      return {
        ...state,
        allyInventory: resolveStateUpdate(state.allyInventory, action.payload),
      };
    case 'set_bonded_ally':
      return {
        ...state,
        bondedAlly: action.payload.ally,
        allyInventory: action.payload.inventory ?? state.allyInventory,
      };
    case 'clear_bonded_ally':
      return {
        ...state,
        bondedAlly: null,
        allyInventory: null,
      };
    case 'reset_runtime':
      return {
        ...state,
        timeState: action.payload.timeState,
        npcRelationships: {},
        playerInventory: action.payload.playerInventory,
        allyInventory: null,
        bondedAlly: null,
      };
    default:
      return state;
  }
}
