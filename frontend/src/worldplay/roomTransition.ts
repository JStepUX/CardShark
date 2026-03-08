import type { SummarizeMessage, SummarizeNPC } from '../types/adventureLog';
import type { RoomInstanceState } from '../types/worldCard';
import type { CombatDisplayNPC, GridWorldState } from '../types/worldGrid';
import type { WorldPlayMessage } from './contracts';
import { WORLD_PLAY_TRANSITION } from './config';

export interface GridCoordinates {
  x: number;
  y: number;
}

export function snapshotRoomState(roomNpcs: CombatDisplayNPC[]): RoomInstanceState {
  const state: RoomInstanceState = { npc_states: {} };

  for (const npc of roomNpcs) {
    if (npc.isDead) {
      state.npc_states[npc.id] = { status: 'dead' };
      continue;
    }

    if (npc.isIncapacitated) {
      state.npc_states[npc.id] = { status: 'incapacitated' };
    }
  }

  return state;
}

export function toSummarizeMessages(messages: WorldPlayMessage[]): SummarizeMessage[] {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));
}

export function toSummarizeNpcs(roomNpcs: CombatDisplayNPC[]): SummarizeNPC[] {
  return roomNpcs.map((npc) => ({
    id: npc.id,
    name: npc.name,
  }));
}

export function pruneTravelMessages(
  messages: WorldPlayMessage[],
  maxMessages: number = WORLD_PLAY_TRANSITION.maxMessagesOnTravel
): WorldPlayMessage[] {
  if (messages.length <= maxMessages) {
    return messages;
  }

  return messages.slice(-maxMessages);
}

export function findRoomGridPosition(worldState: GridWorldState, roomId: string): GridCoordinates | null {
  for (let y = 0; y < worldState.grid.length; y++) {
    for (let x = 0; x < worldState.grid[y].length; x++) {
      if (worldState.grid[y][x]?.id === roomId) {
        return { x, y };
      }
    }
  }

  return null;
}

export function applySavedRoomState(
  npcs: CombatDisplayNPC[],
  roomState: RoomInstanceState | undefined
): CombatDisplayNPC[] {
  if (!roomState?.npc_states) {
    return npcs;
  }

  return npcs
    .filter((npc) => roomState.npc_states[npc.id]?.status !== 'dead')
    .map((npc) => {
      const npcState = roomState.npc_states[npc.id];
      if (npcState?.status === 'incapacitated') {
        return { ...npc, isIncapacitated: true };
      }

      return npc;
    });
}
