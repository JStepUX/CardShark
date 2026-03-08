import { worldApi } from '../api/worldApi';
import { roomApi } from '../api/roomApi';
import { adventureLogApi } from '../api/adventureLogApi';
import type { AdventureContext } from '../types/adventureLog';
import type { CharacterInventory } from '../types/inventory';
import type { ExitDirection, LocalMapConfig, TilePosition } from '../types/localMap';
import type { CharacterCard } from '../types/schema';
import { isValidThinFrame } from '../types/schema';
import type { WorldCard, RoomInstanceState } from '../types/worldCard';
import type { CombatDisplayNPC, GridRoom, GridWorldState } from '../types/worldGrid';
import type { NPCRelationship, TimeState } from '../types/worldRuntime';
import type { WorldPlayApiConfig, WorldPlayCurrentUser } from './contracts';
import { WORLD_PLAY_DEFAULT_PLAYER_TILE } from './config';
import { applySavedRoomState, findRoomGridPosition, type GridCoordinates } from './roomTransition';
import type { PlayerProgression } from '../utils/progressionUtils';
import { resolveNpcDisplayData } from '../utils/worldStateApi';
import { roomCardToGridRoom } from '../utils/roomCardAdapter';
import { getSpawnPosition } from '../utils/localMapUtils';
import { preloadRoomTextures } from '../utils/texturePreloader';
import { generateThinFrame, mergeThinFrameIntoCard } from '../services/thinFrameService';

export interface PreparedTransitionRoom {
  room: GridRoom;
  roomGridPosition: GridCoordinates;
  roomNpcs: CombatDisplayNPC[];
  spawnPosition: TilePosition;
}

export function getPlayerImagePath(currentUser: WorldPlayCurrentUser): string | null {
  return currentUser?.filename
    ? `/api/user-image/${encodeURIComponent(currentUser.filename)}`
    : null;
}

export async function fetchCharacterMetadata(characterId: string): Promise<CharacterCard | null> {
  try {
    const response = await fetch(`/api/character/${characterId}/metadata`);
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return (payload.data || payload) as CharacterCard;
  } catch {
    return null;
  }
}

export async function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), timeoutMs);
    }),
  ]);
}

export async function prepareTargetRoom(options: {
  worldState: GridWorldState;
  worldCard: WorldCard;
  targetRoomStub: GridRoom;
  entryDir: ExitDirection | null;
  localMapConfig: LocalMapConfig;
  roomStates: Record<string, RoomInstanceState>;
}): Promise<PreparedTransitionRoom | null> {
  const {
    worldState,
    worldCard,
    targetRoomStub,
    entryDir,
    localMapConfig,
    roomStates,
  } = options;

  const roomGridPosition = findRoomGridPosition(worldState, targetRoomStub.id);
  if (!roomGridPosition) {
    return null;
  }

  const worldData = worldCard.data.extensions.world_data;
  const placement = worldData.rooms.find((room) => room.room_uuid === targetRoomStub.id);

  let targetRoom = targetRoomStub;
  if (placement) {
    try {
      const roomCard = await roomApi.getRoom(placement.room_uuid);
      targetRoom = roomCardToGridRoom(roomCard, roomGridPosition, placement);
    } catch {
      targetRoom = targetRoomStub;
    }
  }

  const resolvedNpcs = await resolveNpcDisplayData(
    targetRoom.npcs.map((npc) => npc.character_uuid)
  );
  const mergedNpcs = resolvedNpcs.map((npc) => {
    const roomNpc = targetRoom.npcs.find((candidate) => candidate.character_uuid === npc.id);
    return {
      ...npc,
      hostile: roomNpc?.hostile,
      monster_level: roomNpc?.monster_level,
    };
  });

  return {
    room: targetRoom,
    roomGridPosition,
    roomNpcs: applySavedRoomState(mergedNpcs, roomStates[targetRoom.id]),
    spawnPosition: entryDir
      ? getSpawnPosition(entryDir, localMapConfig)
      : { x: WORLD_PLAY_DEFAULT_PLAYER_TILE.x, y: WORLD_PLAY_DEFAULT_PLAYER_TILE.y },
  };
}

export async function preloadTransitionAssets(options: {
  roomNpcs: CombatDisplayNPC[];
  keepActiveNpc: boolean;
  activeNpcId: string | undefined;
  currentUser: WorldPlayCurrentUser;
  timeoutMs: number;
  onProgress: (percent: number) => void;
}): Promise<void> {
  const {
    roomNpcs,
    keepActiveNpc,
    activeNpcId,
    currentUser,
    timeoutMs,
    onProgress,
  } = options;

  await preloadRoomTextures(
    {
      playerImagePath: getPlayerImagePath(currentUser),
      companionImagePath: keepActiveNpc && activeNpcId
        ? `/api/character-image/${activeNpcId}.png`
        : null,
      npcImageUrls: roomNpcs
        .map((npc) => npc.imageUrl)
        .filter((imageUrl): imageUrl is string => Boolean(imageUrl)),
    },
    {
      timeout: timeoutMs,
      onProgress,
    }
  );
}

export async function generateMissingThinFrames(options: {
  roomNpcs: CombatDisplayNPC[];
  apiConfig: WorldPlayApiConfig;
  thinFrameTimeoutMs: number;
  onProgress: (percent: number) => void;
}): Promise<void> {
  const {
    roomNpcs,
    apiConfig,
    thinFrameTimeoutMs,
    onProgress,
  } = options;

  if (!apiConfig || roomNpcs.length === 0) {
    return;
  }

  const npcCards = await Promise.all(
    roomNpcs.map(async (npc) => ({
      id: npc.id,
      card: await fetchCharacterMetadata(npc.id),
    }))
  );

  const pendingCards = npcCards.filter((entry) => (
    entry.card && !isValidThinFrame(entry.card.data?.extensions?.cardshark_thin_frame)
  ));

  if (pendingCards.length === 0) {
    return;
  }

  let completed = 0;
  for (const pendingCard of pendingCards) {
    try {
      const thinFrame = await generateThinFrame(pendingCard.card!, apiConfig, { timeout: thinFrameTimeoutMs });
      const updatedCard = mergeThinFrameIntoCard(pendingCard.card!, thinFrame);
      const imageResponse = await fetch(`/api/character-image/${pendingCard.id}.png`);
      if (imageResponse.ok) {
        const imageBlob = await imageResponse.blob();
        const formData = new FormData();
        formData.append('file', new File([imageBlob], 'character.png', { type: 'image/png' }));
        formData.append('metadata_json', JSON.stringify(updatedCard));

        await fetch('/api/characters/save-card', {
          method: 'POST',
          body: formData,
        });
      }
    } catch {
      // Best effort. Caller decides whether to surface errors.
    } finally {
      completed += 1;
      onProgress(Math.round((completed / pendingCards.length) * 100));
    }
  }
}

export async function persistRuntimeState(options: {
  worldId: string;
  roomGridPosition: GridCoordinates;
  playerProgression: PlayerProgression;
  keepActiveNpc: boolean;
  activeNpcId: string | undefined;
  timeState: TimeState;
  npcRelationships: Record<string, NPCRelationship>;
  playerInventory: CharacterInventory;
  allyInventory: CharacterInventory | null;
  roomStates: Record<string, RoomInstanceState>;
}): Promise<void> {
  const {
    worldId,
    roomGridPosition,
    playerProgression,
    keepActiveNpc,
    activeNpcId,
    timeState,
    npcRelationships,
    playerInventory,
    allyInventory,
    roomStates,
  } = options;

  await worldApi.updateWorld(worldId, {
    player_position: roomGridPosition,
    player_xp: playerProgression.xp,
    player_level: playerProgression.level,
    player_gold: playerProgression.gold,
    bonded_ally_uuid: (keepActiveNpc ? activeNpcId : undefined) ?? '',
    time_state: timeState,
    npc_relationships: npcRelationships,
    player_inventory: playerInventory,
    ally_inventory: (keepActiveNpc ? allyInventory : null) ?? undefined,
    room_states: roomStates,
  });
}

export async function fetchAdventureContext(worldId: string, userUuid: string): Promise<AdventureContext> {
  return adventureLogApi.getAdventureContext(worldId, userUuid);
}
