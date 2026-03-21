import type { TimeConfig } from '../types/worldRuntime';
import type { TilePosition } from '../types/localMap';
import type { CharacterCard } from '../types/schema';
import type { CombatDisplayNPC } from '../types/worldGrid';
import type { PlayerProgression } from '../utils/progressionUtils';
import { getXPProgress } from '../utils/progressionUtils';
import { deriveGridCombatStats } from '../types/combat';
import { WORLD_PLAY_DEFAULT_PLAYER_TILE, WORLD_PLAY_TIME } from './config';

export function createWorldPlayTimeConfig(): TimeConfig {
  return {
    messagesPerDay: WORLD_PLAY_TIME.messagesPerDay,
    enableDayNightCycle: WORLD_PLAY_TIME.enableDayNightCycle,
  };
}

export function createWorldPlayPlayerTile(): TilePosition {
  return {
    x: WORLD_PLAY_DEFAULT_PLAYER_TILE.x,
    y: WORLD_PLAY_DEFAULT_PLAYER_TILE.y,
  };
}

export function buildLocalMapPlayer(
  currentUser: { id?: string; name?: string } | null,
  imagePath: string | null,
  level: number
) {
  const stats = deriveGridCombatStats(level);

  return {
    id: currentUser?.id || 'player',
    name: currentUser?.name || 'Player',
    level,
    imagePath,
    currentHp: stats.maxHp,
    maxHp: stats.maxHp,
  };
}

export function buildLocalMapCompanion(
  activeNpcId: string | undefined,
  activeNpcName: string,
  activeNpcCard: CharacterCard | null,
  roomNpcs: CombatDisplayNPC[],
  fallbackImagePath: string | null,
  playerLevel: number
) {
  if (!activeNpcId || !activeNpcCard) {
    return null;
  }

  const companionNpc = roomNpcs.find((npc) => npc.id === activeNpcId);
  const imagePath = companionNpc?.imageUrl || fallbackImagePath;
  const stats = deriveGridCombatStats(playerLevel);

  return {
    id: activeNpcId,
    name: activeNpcName,
    level: playerLevel,
    imagePath,
    currentHp: stats.maxHp,
    maxHp: stats.maxHp,
  };
}

export function buildWorldPlayHudProgress(playerProgression: PlayerProgression) {
  const progress = getXPProgress(playerProgression.xp, playerProgression.level);

  return {
    level: playerProgression.level,
    xpCurrent: progress.current,
    xpNeeded: progress.needed,
    gold: playerProgression.gold,
  };
}