/**
 * @file useWorldLoader.ts
 * @description Loads world data, progress, and starting room from backend APIs.
 * Returns a WorldLoadResult that the view destructures to populate its state.
 * Extracted from WorldPlayView.tsx.
 */
import { useState, useEffect } from 'react';
import { worldApi } from '../api/worldApi';
import { roomApi } from '../api/roomApi';
import { adventureLogApi } from '../api/adventureLogApi';
import type { WorldCard, RoomInstanceState, WorldUserProgress } from '../types/worldCard';
import type { GridWorldState, GridRoom, CombatDisplayNPC } from '../types/worldGrid';
import type { NPCRelationship, TimeState } from '../types/worldRuntime';
import type { CharacterInventory } from '../types/inventory';
import type { CharacterCard } from '../types/schema';
import type { PlayerProgression } from '../utils/progressionUtils';
import type { AdventureContext } from '../types/adventureLog';
import { resolveNpcDisplayData } from '../utils/worldStateApi';
import { roomCardToGridRoom, placementToGridRoomStub } from '../utils/roomCardAdapter';
import { calculateLevelFromXP } from '../utils/progressionUtils';


/** Data returned once load completes. The view populates its own state from this. */
export interface WorldLoadResult {
  worldCard: WorldCard;
  worldState: GridWorldState;
  currentRoom: GridRoom;
  roomNpcs: CombatDisplayNPC[];
  playerProgression: PlayerProgression;
  timeState: TimeState | null;
  npcRelationships: Record<string, NPCRelationship>;
  playerInventory: CharacterInventory | null;
  roomStates: Record<string, RoomInstanceState>;
  bondedAlly: {
    id: string;
    name: string;
    card: CharacterCard;
    inventory: CharacterInventory | null;
  } | null;
  adventureContext: AdventureContext | null;
  introductionText: string | null;
  introductionRoomId: string;
  missingRoomCount: number;
}

export interface UseWorldLoaderOptions {
  worldId: string;
  userUuid: string | undefined;
  onNoUser: () => void; // Navigate back when no user selected
}

export interface UseWorldLoaderReturn {
  isLoading: boolean;
  error: string | null;
  result: WorldLoadResult | null;
}

export function useWorldLoader({ worldId, userUuid, onNoUser }: UseWorldLoaderOptions): UseWorldLoaderReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorldLoadResult | null>(null);

  useEffect(() => {
    async function loadWorld() {
      if (!worldId) {
        setError('No world ID provided');
        setIsLoading(false);
        return;
      }

      if (!userUuid) {
        console.warn('[WorldPlayView] No user selected, navigating back to launcher');
        onNoUser();
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Load world card (V2) - single API call
        const world = await worldApi.getWorld(worldId);
        const worldData = world.data.extensions.world_data;

        // =========================================
        // LOAD PER-USER PROGRESS FROM NEW API
        // =========================================
        let progress: WorldUserProgress | null = null;
        let migratedFromWorldData = false;

        try {
          progress = await worldApi.getProgress(worldId, userUuid);
          console.log('[Progress] Loaded from database:', progress ? 'found' : 'not found');
        } catch (err) {
          console.warn('[Progress] Failed to load progress:', err);
        }

        // Load adventure context for narrative continuity
        let adventureContext: AdventureContext | null = null;
        try {
          adventureContext = await adventureLogApi.getAdventureContext(worldId, userUuid);
          console.log(`[AdventureLog] Loaded ${adventureContext.entries.length} room summaries`);
        } catch (err) {
          console.warn('[AdventureLog] Failed to load adventure context:', err);
        }

        // If no progress exists, check for embedded world_data progress to migrate
        if (!progress) {
          const hasEmbeddedProgress = (
            (worldData.player_xp && worldData.player_xp > 0) ||
            (worldData.player_level && worldData.player_level > 1) ||
            (worldData.player_gold && worldData.player_gold > 0) ||
            (worldData.npc_relationships && Object.keys(worldData.npc_relationships).length > 0) ||
            worldData.time_state ||
            worldData.player_inventory
          );

          if (hasEmbeddedProgress) {
            console.log('[Progress] Migrating embedded world_data progress to database');
            migratedFromWorldData = true;

            progress = {
              world_uuid: worldId,
              user_uuid: userUuid,
              player_xp: worldData.player_xp ?? 0,
              player_level: worldData.player_level ?? 1,
              player_gold: worldData.player_gold ?? 0,
              current_room_uuid: undefined,
              bonded_ally_uuid: worldData.bonded_ally_uuid,
              time_state: worldData.time_state,
              npc_relationships: worldData.npc_relationships,
              player_inventory: worldData.player_inventory,
              ally_inventory: worldData.ally_inventory,
              room_states: worldData.room_states,
            };

            try {
              await worldApi.saveProgress(worldId, userUuid, progress);
              console.log('[Progress] Migration saved to database');
            } catch (saveErr) {
              console.error('[Progress] Failed to save migrated progress:', saveErr);
            }
          }
        }

        // Initialize progression from progress (or defaults)
        const savedProgression: PlayerProgression = {
          xp: progress?.player_xp ?? 0,
          level: progress?.player_level ?? calculateLevelFromXP(progress?.player_xp ?? 0),
          gold: progress?.player_gold ?? 0,
        };
        savedProgression.level = calculateLevelFromXP(savedProgression.xp);
        console.log('[Progression] Loaded player progression:', savedProgression, migratedFromWorldData ? '(migrated)' : '');

        // Extract runtime state from progress
        const restoredTimeState = (progress?.time_state as TimeState | undefined) ?? null;
        const restoredRelationships = (progress?.npc_relationships && Object.keys(progress.npc_relationships).length > 0)
          ? (progress.npc_relationships as Record<string, NPCRelationship>)
          : {};
        const restoredPlayerInventory = (progress?.player_inventory as CharacterInventory | undefined) ?? null;
        const restoredRoomStates = (progress?.room_states as Record<string, RoomInstanceState> | undefined) ?? {};

        const savedBondedAllyUuid = progress?.bonded_ally_uuid;
        const gridSize = worldData.grid_size;

        // Build grid from placements WITHOUT fetching each room (lazy loading)
        const grid: (GridRoom | null)[][] = Array(gridSize.height)
          .fill(null)
          .map(() => Array(gridSize.width).fill(null));

        let legacyRoomCount = 0;
        for (const placement of worldData.rooms) {
          const { x, y } = placement.grid_position;
          const gridRoom = placementToGridRoomStub(placement);
          if (y >= 0 && y < gridSize.height && x >= 0 && x < gridSize.width) {
            grid[y][x] = gridRoom;
          }
          if (!placement.instance_name) {
            legacyRoomCount++;
          }
        }

        if (legacyRoomCount > 0) {
          console.warn(`${legacyRoomCount} rooms have no cached name. Open in World Editor and save to update.`);
        }

        // Create GridWorldState
        const gridWorldState: GridWorldState = {
          uuid: world.data.character_uuid || worldId,
          metadata: {
            name: world.data.name,
            description: world.data.description,
          },
          grid,
          player_position: worldData.player_position,
          starting_position: worldData.starting_position,
        };

        // Fetch the CURRENT room's full data
        const playerPos = worldData.player_position;
        console.log(`[WorldPlayView] Player position: (${playerPos.x}, ${playerPos.y})`);

        const currentPlacement = worldData.rooms.find(
          r => r.grid_position.x === playerPos.x && r.grid_position.y === playerPos.y
        );

        let currentRoom: GridRoom;
        let roomNpcs: CombatDisplayNPC[] = [];
        let introductionText: string | null = null;
        let introductionRoomId = '';
        let missingRoomCount = 0;

        if (currentPlacement) {
          try {
            const roomCard = await roomApi.getRoom(currentPlacement.room_uuid);
            const fullCurrentRoom = roomCardToGridRoom(roomCard, playerPos, currentPlacement);

            // Update grid with full room data
            if (playerPos.y >= 0 && playerPos.y < gridSize.height &&
              playerPos.x >= 0 && playerPos.x < gridSize.width) {
              grid[playerPos.y][playerPos.x] = fullCurrentRoom;
            }

            currentRoom = fullCurrentRoom;

            // Resolve NPCs in the room and merge with combat data
            const npcUuids = fullCurrentRoom.npcs.map(npc => npc.character_uuid);
            const resolvedNpcs = await resolveNpcDisplayData(npcUuids);

            let npcsWithCombatData: CombatDisplayNPC[] = resolvedNpcs.map(npc => {
              const roomNpc = fullCurrentRoom.npcs.find(rn => rn.character_uuid === npc.id);
              return {
                ...npc,
                hostile: roomNpc?.hostile,
                monster_level: roomNpc?.monster_level,
              };
            });

            // Apply persisted room state
            const savedRoomState = restoredRoomStates[fullCurrentRoom.id];
            if (savedRoomState?.npc_states) {
              npcsWithCombatData = npcsWithCombatData
                .filter(npc => savedRoomState.npc_states[npc.id]?.status !== 'dead')
                .map(npc => {
                  const npcState = savedRoomState.npc_states[npc.id];
                  if (npcState?.status === 'incapacitated') {
                    return { ...npc, isIncapacitated: true };
                  }
                  return npc;
                });
              console.log('[RuntimeState] Applied saved room state: filtered dead, marked incapacitated');
            }
            roomNpcs = npcsWithCombatData;

            console.log('Initial room NPCs loaded:', npcsWithCombatData);

            // Update grid in gridWorldState
            gridWorldState.grid = grid;

            if (fullCurrentRoom.introduction_text) {
              introductionText = fullCurrentRoom.introduction_text;
              introductionRoomId = fullCurrentRoom.id;
            }

            console.log(`World loaded: ${worldData.rooms.length} rooms on map, 1 room fetched (lazy loading)`);
          } catch (err) {
            console.warn(`Failed to load starting room ${currentPlacement.room_uuid}:`, err);
            missingRoomCount = 1;
            currentRoom = placementToGridRoomStub(currentPlacement);
          }
        } else {
          // No placement found at player position - create a minimal stub
          currentRoom = {
            id: 'unknown',
            name: 'Unknown Room',
            description: '',
            npcs: [],
            events: [],
            exits: [],
          } as unknown as GridRoom;
        }

        // Restore bonded ally if one was saved
        let bondedAlly: WorldLoadResult['bondedAlly'] = null;
        if (savedBondedAllyUuid) {
          try {
            const allyResponse = await fetch(`/api/character/${savedBondedAllyUuid}`);
            if (allyResponse.ok) {
              const allyCharData = await allyResponse.json();
              const allyDisplayName = allyCharData.data?.name || allyCharData.name || 'Ally';
              bondedAlly = {
                id: savedBondedAllyUuid,
                name: allyDisplayName,
                card: allyCharData,
                inventory: (progress?.ally_inventory as CharacterInventory | undefined) ?? null,
              };
              console.log('[RuntimeState] Restored bonded ally:', allyDisplayName);
            }
          } catch (allyErr) {
            console.warn('[RuntimeState] Failed to restore bonded ally:', allyErr);
          }
        }

        setResult({
          worldCard: world,
          worldState: gridWorldState,
          currentRoom,
          roomNpcs,
          playerProgression: savedProgression,
          timeState: restoredTimeState,
          npcRelationships: restoredRelationships,
          playerInventory: restoredPlayerInventory,
          roomStates: restoredRoomStates,
          bondedAlly,
          adventureContext,
          introductionText,
          introductionRoomId,
          missingRoomCount,
        });
      } catch (err) {
        console.error('Error loading world:', err);
        setError(err instanceof Error ? err.message : 'Failed to load world');
      } finally {
        setIsLoading(false);
      }
    }

    loadWorld();
  // onNoUser is a callback - stable if the consumer wraps it in useCallback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, userUuid]);

  return { isLoading, error, result };
}
