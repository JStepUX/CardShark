import { useCallback } from 'react';
import type { CombatDisplayNPC } from '../types/worldGrid';
import type { LocalMapState, TilePosition } from '../types/localMap';

interface UseWorldPlayLocalMapOptions {
  currentUserId?: string;
  activeNpcId: string | undefined;
  isInCombat: boolean;
  roomNpcs: CombatDisplayNPC[];
  onSelectNpc: (npcId: string) => Promise<void>;
  onOpenInventory: (target: 'player' | 'ally') => void;
  setPlayerTilePosition: (position: TilePosition) => void;
  setLocalMapStateCache: (state: LocalMapState) => void;
}

interface UseWorldPlayLocalMapReturn {
  handleLocalMapTileClick: (position: TilePosition) => void;
  handleLocalMapEntityClick: (entityId: string) => void;
  handleLocalMapStateChange: (mapState: LocalMapState) => void;
}

export function useWorldPlayLocalMap({
  currentUserId,
  activeNpcId,
  isInCombat,
  roomNpcs,
  onSelectNpc,
  onOpenInventory,
  setPlayerTilePosition,
  setLocalMapStateCache,
}: UseWorldPlayLocalMapOptions): UseWorldPlayLocalMapReturn {
  const handleLocalMapTileClick = useCallback((position: TilePosition) => {
    setPlayerTilePosition(position);
  }, [setPlayerTilePosition]);

  const handleLocalMapEntityClick = useCallback((entityId: string) => {
    const playerId = currentUserId || 'player';
    if (entityId === playerId && !isInCombat) {
      onOpenInventory('player');
      return;
    }

    if (entityId === activeNpcId && !isInCombat) {
      onOpenInventory('ally');
      return;
    }

    const npc = roomNpcs.find((candidate) => candidate.id === entityId);
    if (npc && !npc.hostile) {
      void onSelectNpc(entityId);
    }
  }, [activeNpcId, currentUserId, isInCombat, onOpenInventory, onSelectNpc, roomNpcs]);

  const handleLocalMapStateChange = useCallback((mapState: LocalMapState) => {
    setLocalMapStateCache(mapState);
  }, [setLocalMapStateCache]);

  return {
    handleLocalMapTileClick,
    handleLocalMapEntityClick,
    handleLocalMapStateChange,
  };
}
