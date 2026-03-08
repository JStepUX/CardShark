import { useEffect, useState } from 'react';
import type { Message } from '../types/messages';
import type { WorldCard } from '../types/worldCard';
import type { CombatDisplayNPC, GridRoom, GridWorldState } from '../types/worldGrid';
import type { AdventureContext } from '../types/adventureLog';
import type { WorldLoadResult } from './useWorldLoader';

interface UseWorldPlayHydrationOptions {
  result: WorldLoadResult | null;
  setWorldCard: (card: WorldCard | null) => void;
  setWorldState: (state: GridWorldState | null) => void;
  setCurrentRoom: (room: GridRoom | null) => void;
  setRoomNpcs: (npcs: CombatDisplayNPC[]) => void;
  setAdventureContext: (context: AdventureContext | null) => void;
  hydrateRuntimeState: (result: WorldLoadResult) => void;
  setMessages: (messages: Message[]) => void;
}

interface UseWorldPlayHydrationReturn {
  missingRoomCount: number;
  showMissingRoomWarning: boolean;
  dismissMissingRoomWarning: () => void;
}

export function useWorldPlayHydration({
  result,
  setWorldCard,
  setWorldState,
  setCurrentRoom,
  setRoomNpcs,
  setAdventureContext,
  hydrateRuntimeState,
  setMessages,
}: UseWorldPlayHydrationOptions): UseWorldPlayHydrationReturn {
  const [missingRoomCount, setMissingRoomCount] = useState(0);
  const [showMissingRoomWarning, setShowMissingRoomWarning] = useState(false);

  useEffect(() => {
    if (!result) {
      return;
    }

    setWorldCard(result.worldCard);
    setWorldState(result.worldState);
    setCurrentRoom(result.currentRoom);
    setRoomNpcs(result.roomNpcs);
    hydrateRuntimeState(result);
    setAdventureContext(result.adventureContext);

    setMissingRoomCount(result.missingRoomCount);
    setShowMissingRoomWarning(result.missingRoomCount > 0);

    if (result.introductionText) {
      setMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.introductionText,
        timestamp: Date.now(),
        metadata: {
          type: 'room_introduction',
          roomId: result.introductionRoomId,
        },
      }]);
    }
  }, [
    result,
    setAdventureContext,
    setCurrentRoom,
    hydrateRuntimeState,
    setMessages,
    setRoomNpcs,
    setWorldCard,
    setWorldState,
  ]);

  return {
    missingRoomCount,
    showMissingRoomWarning,
    dismissMissingRoomWarning: () => setShowMissingRoomWarning(false),
  };
}
