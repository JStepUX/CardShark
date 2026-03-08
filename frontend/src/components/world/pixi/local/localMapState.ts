import type { RoomNPC } from '../../../../types/room';
import type {
  ExitDirection,
  LocalMapConfig,
  LocalMapEntity,
  LocalMapState,
  LocalMapTileData,
  TilePosition,
} from '../../../../types/localMap';
import { getCellZoneType } from '../../../../types/localMap';
import type { CombatDisplayNPC, GridRoom, GridWorldState } from '../../../../types/worldGrid';
import {
  autoPlaceEntities,
  calculateThreatZones,
  deriveExitsFromWorld,
  getSpawnPosition,
} from '../../../../utils/localMapUtils';

interface LocalMapActor {
  id: string;
  name: string;
  level: number;
  imagePath: string | null;
  currentHp?: number;
  maxHp?: number;
}

type RoomNpcLike = CombatDisplayNPC | RoomNPC;

interface BuildLocalMapStateOptions {
  currentRoom: GridRoom;
  worldState: GridWorldState | null;
  config: LocalMapConfig;
  player: LocalMapActor;
  companion?: LocalMapActor | null;
  playerPosition: TilePosition;
  placedNpcEntities: LocalMapEntity[];
  inCombat: boolean;
  combatMapState?: LocalMapState | null;
}

function isResolvedNpc(npc: RoomNpcLike): npc is CombatDisplayNPC {
  return 'id' in npc;
}

function buildLocalMapTiles(currentRoom: GridRoom, config: LocalMapConfig): LocalMapTileData[][] {
  const tiles: LocalMapTileData[][] = [];

  for (let y = 0; y < config.gridHeight; y++) {
    tiles[y] = [];
    for (let x = 0; x < config.gridWidth; x++) {
      const zoneType = getCellZoneType(currentRoom.layout_data, x, y);
      let traversable = true;
      let terrainType: 'normal' | 'difficult' | 'impassable' | 'hazard' | 'water' = 'normal';
      let blocksVision = false;

      if (zoneType) {
        switch (zoneType) {
          case 'water':
            terrainType = 'water';
            break;
          case 'wall':
            traversable = false;
            terrainType = 'impassable';
            blocksVision = true;
            break;
          case 'hazard':
            terrainType = 'hazard';
            break;
          case 'no-spawn':
            break;
        }
      }

      tiles[y][x] = {
        position: { x, y },
        traversable,
        terrainType,
        highlight: 'none',
        isExit: false,
        blocksVision,
        zoneType: zoneType ?? undefined,
      };
    }
  }

  return tiles;
}

export function getLocalMapEntryPosition(
  initialPlayerPosition: TilePosition | undefined,
  entryDirection: ExitDirection | null | undefined,
  config: LocalMapConfig
): TilePosition {
  if (initialPlayerPosition) {
    return initialPlayerPosition;
  }

  if (entryDirection) {
    return getSpawnPosition(entryDirection, config);
  }

  return { x: 0, y: Math.floor(config.gridHeight / 2) };
}

export function createPlacedNpcEntities(options: {
  currentRoom: GridRoom;
  roomNpcs?: RoomNpcLike[];
  playerId: string;
  config: LocalMapConfig;
  initialPlayerPosition?: TilePosition;
  entryDirection?: ExitDirection | null;
}): LocalMapEntity[] {
  const {
    currentRoom,
    roomNpcs,
    playerId,
    config,
    initialPlayerPosition,
    entryDirection,
  } = options;

  const initialPosition = getLocalMapEntryPosition(initialPlayerPosition, entryDirection, config);
  const sourceNpcs = (roomNpcs && roomNpcs.length > 0 ? roomNpcs : currentRoom.npcs)
    .filter((npc) => (isResolvedNpc(npc) ? npc.id : npc.character_uuid) !== playerId);

  if (sourceNpcs.length === 0) {
    return [];
  }

  return autoPlaceEntities(
    sourceNpcs.map((npc) => {
      if (isResolvedNpc(npc)) {
        return {
          id: npc.id,
          name: npc.name,
          hostile: npc.hostile ?? false,
          imagePath: npc.imageUrl,
          level: npc.monster_level ?? 1,
          isIncapacitated: npc.isIncapacitated ?? false,
          isDead: npc.isDead ?? false,
        };
      }

      return {
        id: npc.character_uuid,
        name: npc.character_uuid,
        hostile: npc.hostile ?? false,
        imagePath: undefined,
        level: npc.monster_level ?? 1,
        isIncapacitated: false,
        isDead: false,
      };
    }),
    initialPosition,
    config,
    currentRoom.layout_data
  );
}

function getExplorationCompanionPosition(playerPosition: TilePosition): TilePosition {
  return {
    x: Math.max(0, playerPosition.x - 1),
    y: playerPosition.y,
  };
}

export function buildLocalMapState({
  currentRoom,
  worldState,
  config,
  player,
  companion,
  playerPosition,
  placedNpcEntities,
  inCombat,
  combatMapState,
}: BuildLocalMapStateOptions): LocalMapState {
  const exits = worldState
    ? deriveExitsFromWorld(currentRoom.id, worldState, config)
    : [];
  const tiles = buildLocalMapTiles(currentRoom, config);

  if (inCombat && combatMapState && combatMapState.entities.length > 0) {
    return {
      roomId: currentRoom.id,
      roomName: currentRoom.name,
      config,
      tiles,
      entities: combatMapState.entities,
      playerPosition: combatMapState.playerPosition,
      threatZones: calculateThreatZones(combatMapState.entities, config),
      exits,
      inCombat: true,
    };
  }

  const entities: LocalMapEntity[] = [{
    id: player.id,
    name: player.name,
    level: player.level,
    allegiance: 'player',
    position: playerPosition,
    imagePath: player.imagePath,
    currentHp: player.currentHp ?? 100,
    maxHp: player.maxHp ?? 100,
  }];

  if (companion) {
    entities.push({
      id: companion.id,
      name: companion.name,
      level: companion.level,
      allegiance: 'bonded_ally',
      position: getExplorationCompanionPosition(playerPosition),
      imagePath: companion.imagePath,
      currentHp: companion.currentHp ?? 100,
      maxHp: companion.maxHp ?? 100,
      isBonded: true,
    });
  }

  const nonCompanionNpcs = companion
    ? placedNpcEntities.filter((npc) => npc.id !== companion.id)
    : placedNpcEntities;

  entities.push(...nonCompanionNpcs);

  return {
    roomId: currentRoom.id,
    roomName: currentRoom.name,
    config,
    tiles,
    entities,
    playerPosition,
    threatZones: calculateThreatZones(entities, config),
    exits,
    inCombat,
  };
}

export function findSafeCompanionPosition(
  playerPosition: TilePosition,
  entities: LocalMapEntity[],
  config: LocalMapConfig
): TilePosition {
  const enemyPositions = entities
    .filter((entity) => entity.allegiance === 'hostile')
    .map((entity) => entity.position);

  const adjacentOffsets: TilePosition[] = [
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: -1, y: 1 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
  ];

  for (const offset of adjacentOffsets) {
    const candidatePosition = {
      x: playerPosition.x + offset.x,
      y: playerPosition.y + offset.y,
    };

    const isOutOfBounds = candidatePosition.x < 0
      || candidatePosition.x >= config.gridWidth
      || candidatePosition.y < 0
      || candidatePosition.y >= config.gridHeight;
    if (isOutOfBounds) {
      continue;
    }

    const occupiedByEnemy = enemyPositions.some((enemyPosition) => (
      enemyPosition.x === candidatePosition.x && enemyPosition.y === candidatePosition.y
    ));

    if (!occupiedByEnemy) {
      return candidatePosition;
    }
  }

  return {
    x: Math.max(0, playerPosition.x - 1),
    y: playerPosition.y,
  };
}

export function getNonPlayerEntityAtTile(
  entities: LocalMapEntity[],
  position: TilePosition
): LocalMapEntity | undefined {
  return entities.find((entity) => (
    entity.allegiance !== 'player'
    && entity.position.x === position.x
    && entity.position.y === position.y
  ));
}

export function isTileOccupiedByNonPlayer(
  entities: LocalMapEntity[],
  position: TilePosition
): boolean {
  return Boolean(getNonPlayerEntityAtTile(entities, position));
}

export function getHostileIdsNearPosition(
  entities: LocalMapEntity[],
  position: TilePosition
): string[] {
  return entities
    .filter((entity) => entity.allegiance === 'hostile')
    .filter((entity) => {
      const dx = Math.abs(entity.position.x - position.x);
      const dy = Math.abs(entity.position.y - position.y);
      return dx <= 1 && dy <= 1;
    })
    .map((entity) => entity.id);
}
