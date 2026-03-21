import { useCallback, useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import { worldApi } from '../api/worldApi';
import type { RoomInstanceState } from '../types/worldCard';
import type { CombatDisplayNPC, GridRoom, GridWorldState } from '../types/worldGrid';
import type { LocalMapState } from '../types/localMap';
import type { CharacterInventory } from '../types/inventory';
import { createDefaultInventory } from '../types/inventory';
import { createDefaultTimeState } from '../utils/timeUtils';
import { resolveNpcDisplayData } from '../utils/worldStateApi';
import type { WorldPlayMessageAppender } from '../worldplay/contracts';

interface UseWorldPlayDevToolsOptions {
  currentRoom: GridRoom | null;
  worldState: GridWorldState | null;
  worldId: string;
  roomStatesRef: MutableRefObject<Record<string, RoomInstanceState>>;
  setRoomNpcs: (npcs: CombatDisplayNPC[]) => void;
  setLocalMapStateCache: (state: LocalMapState | null) => void;
  resetRuntimeState: (options: { timeState: ReturnType<typeof createDefaultTimeState>; playerInventory: CharacterInventory }) => void;
  addMessage: WorldPlayMessageAppender;
}

interface UseWorldPlayDevToolsReturn {
  showDevTools: boolean;
  handleDevResetEnemies: () => Promise<void>;
}

export function useWorldPlayDevTools({
  currentRoom,
  worldState,
  worldId,
  roomStatesRef,
  setRoomNpcs,
  setLocalMapStateCache,
  resetRuntimeState,
  addMessage,
}: UseWorldPlayDevToolsOptions): UseWorldPlayDevToolsReturn {
  const [showDevTools, setShowDevTools] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setShowDevTools((previous) => !previous);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleDevResetEnemies = useCallback(async () => {
    if (!currentRoom || !worldState || !worldId) {
      return;
    }

    let originalRoom: GridRoom | null = null;
    for (const row of worldState.grid) {
      const match = row.find((room) => room?.id === currentRoom.id);
      if (match) {
        originalRoom = match;
        break;
      }
    }

    if (!originalRoom) {
      return;
    }

    const originalNpcs = originalRoom.npcs || [];
    const resolvedNpcs = await resolveNpcDisplayData(originalNpcs.map((npc) => npc.character_uuid));
    const freshNpcs: CombatDisplayNPC[] = resolvedNpcs.map((npc) => {
      const roomNpc = originalNpcs.find((candidate) => candidate.character_uuid === npc.id);
      return {
        ...npc,
        hostile: roomNpc?.hostile,
        monster_level: roomNpc?.monster_level,
        isIncapacitated: false,
        isDead: false,
      };
    });

    const defaultTimeState = createDefaultTimeState();
    const defaultPlayerInventory = createDefaultInventory();

    setRoomNpcs(freshNpcs);
    setLocalMapStateCache(null);
    roomStatesRef.current = {};
    resetRuntimeState({
      timeState: defaultTimeState,
      playerInventory: defaultPlayerInventory,
    });

    try {
      await worldApi.updateWorld(worldId, {
        bonded_ally_uuid: '',
        time_state: defaultTimeState,
        npc_relationships: {},
        player_inventory: defaultPlayerInventory,
        ally_inventory: undefined,
        room_states: {},
      });
    } catch (error) {
      console.error('[DEV] Failed to persist factory reset:', error);
    }

    addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '*[DEV] Factory reset complete. All rooms restored, allies dismissed, relationships cleared. Player progression preserved.*',
      timestamp: Date.now(),
      metadata: {
        type: 'system',
        isDevReset: true,
        speakerName: 'System',
      },
    });
  }, [
    addMessage,
    currentRoom,
    roomStatesRef,
    setLocalMapStateCache,
    setRoomNpcs,
    resetRuntimeState,
    worldId,
    worldState,
  ]);

  return {
    showDevTools,
    handleDevResetEnemies,
  };
}
