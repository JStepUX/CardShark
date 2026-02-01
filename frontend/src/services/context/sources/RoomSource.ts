/**
 * @file RoomSource.ts
 * @description Context source for room card data.
 *
 * Provides cached access to room cards by UUID.
 * Implements the ContextSource interface for consistent data access.
 */

import type { ContextSource, RoomContext, RoomNPCContext } from '../../../types/context';
import type { RoomCard, RoomNPC } from '../../../types/room';
import type { GridRoom } from '../../../types/worldGrid';
import type { RoomInstanceState } from '../../../types/worldCard';
import { roomApi } from '../../../api/roomApi';
import { ContextCache, CachePresets, compositeKey } from '../ContextCache';
import { getCharacterSource } from './CharacterSource';

/**
 * Source for room card data with caching.
 *
 * Rooms can be accessed by:
 * - UUID only (for standalone room access)
 * - World UUID + Room UUID (for world-contextualized access)
 *
 * @example
 * ```typescript
 * const source = new RoomSource();
 * const context = await source.get('room-uuid');
 * // Or with world context
 * const context = await source.getInWorld('world-uuid', 'room-uuid');
 * ```
 */
export class RoomSource implements ContextSource<RoomContext> {
  private cache: ContextCache<RoomContext>;
  private roomStateCache: Map<string, RoomInstanceState> = new Map();

  constructor() {
    // Rooms are fetched per-transition, use standard cache
    this.cache = new ContextCache<RoomContext>(CachePresets.standard());
  }

  /**
   * Get room context by UUID.
   * Returns cached data if available, otherwise fetches from API.
   */
  async get(uuid: string): Promise<RoomContext | null> {
    // Check cache first
    const cached = this.cache.get(uuid);
    if (cached) {
      return cached;
    }

    // Fetch from API
    return this.fetchAndCache(uuid);
  }

  /**
   * Get room context with world-specific state.
   * Uses composite key for caching world-specific room state.
   */
  async getInWorld(worldUuid: string, roomUuid: string): Promise<RoomContext | null> {
    const key = compositeKey(worldUuid, roomUuid);

    // Check cache with composite key
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    // Fetch room and apply world-specific state
    const roomContext = await this.fetchAndCache(roomUuid);
    if (!roomContext) {
      return null;
    }

    // Apply room instance state if available
    const instanceState = this.roomStateCache.get(key);
    if (instanceState) {
      const contextWithState = this.applyInstanceState(roomContext, instanceState);
      this.cache.set(key, contextWithState);
      return contextWithState;
    }

    // Cache with composite key
    this.cache.set(key, roomContext);
    return roomContext;
  }

  /**
   * Force refresh room data, bypassing cache.
   */
  async refresh(uuid: string): Promise<RoomContext | null> {
    this.cache.invalidate(uuid);
    return this.fetchAndCache(uuid);
  }

  /**
   * Invalidate cached data for a room.
   */
  invalidate(uuid: string): void {
    this.cache.invalidate(uuid);
    // Also invalidate any world-contextualized versions
    this.cache.invalidateWhere((key) => key.includes(uuid));
  }

  /**
   * Invalidate room in a specific world context.
   */
  invalidateInWorld(worldUuid: string, roomUuid: string): void {
    const key = compositeKey(worldUuid, roomUuid);
    this.cache.invalidate(key);
  }

  /**
   * Check if room data is cached.
   */
  has(uuid: string): boolean {
    return this.cache.has(uuid);
  }

  /**
   * Clear all cached room data.
   */
  clear(): void {
    this.cache.clear();
    this.roomStateCache.clear();
  }

  /**
   * Get the raw room card (without RoomContext wrapper).
   */
  async getCard(uuid: string): Promise<RoomCard | null> {
    try {
      return await roomApi.getRoom(uuid);
    } catch (error) {
      console.error(`[RoomSource] Error fetching room card ${uuid}:`, error);
      return null;
    }
  }

  /**
   * Set room instance state for a world context.
   * This state (NPC alive/dead/incapacitated) is applied when fetching the room.
   */
  setRoomState(worldUuid: string, roomUuid: string, state: RoomInstanceState): void {
    const key = compositeKey(worldUuid, roomUuid);
    this.roomStateCache.set(key, state);

    // If room is cached, update it with the new state
    const cached = this.cache.get(key);
    if (cached) {
      const updatedContext = this.applyInstanceState(cached, state);
      this.cache.set(key, updatedContext);
    }
  }

  /**
   * Get room instance state for a world context.
   */
  getRoomState(worldUuid: string, roomUuid: string): RoomInstanceState | null {
    const key = compositeKey(worldUuid, roomUuid);
    return this.roomStateCache.get(key) ?? null;
  }

  /**
   * Build RoomContext from GridRoom data.
   * Used when transitioning between rooms with pre-loaded grid data.
   */
  async buildFromGridRoom(
    gridRoom: GridRoom,
    worldUuid: string,
    instanceState?: RoomInstanceState
  ): Promise<RoomContext> {
    const npcs = await this.resolveNPCs(gridRoom.npcs, instanceState);

    const context: RoomContext = {
      uuid: gridRoom.id,
      name: gridRoom.name,
      description: gridRoom.description,
      introductionText: gridRoom.introduction_text,
      imagePath: gridRoom.image_path ?? null,
      npcs,
      instanceState: instanceState ?? null,
      gridRoom,
    };

    // Cache with world context
    const key = compositeKey(worldUuid, gridRoom.id);
    this.cache.set(key, context);

    return context;
  }

  /**
   * Fetch room data from API and cache it.
   */
  private async fetchAndCache(uuid: string): Promise<RoomContext | null> {
    try {
      const card = await roomApi.getRoom(uuid);
      const context = await this.buildContext(card);
      this.cache.set(uuid, context);
      return context;
    } catch (error) {
      console.error(`[RoomSource] Error fetching room ${uuid}:`, error);
      return null;
    }
  }

  /**
   * Build RoomContext from a RoomCard.
   */
  private async buildContext(card: RoomCard): Promise<RoomContext> {
    const roomData = card.data.extensions?.room_data;
    const npcs = roomData?.npcs ?? [];

    const resolvedNpcs = await this.resolveNPCs(npcs);

    // Build image path from room UUID (rooms use same pattern as characters)
    const roomUuid = card.data.character_uuid || roomData?.uuid || '';
    const imagePath = roomUuid ? `/api/character-image/${encodeURIComponent(roomUuid)}.png` : null;

    return {
      uuid: roomUuid,
      name: card.data.name,
      description: card.data.description,
      introductionText: card.data.first_mes || null,
      imagePath,
      npcs: resolvedNpcs,
      instanceState: null,
      gridRoom: null,
    };
  }

  /**
   * Resolve NPCs from room data to RoomNPCContext.
   */
  private async resolveNPCs(
    npcs: RoomNPC[],
    instanceState?: RoomInstanceState
  ): Promise<RoomNPCContext[]> {
    const characterSource = getCharacterSource();
    const results: RoomNPCContext[] = [];

    for (const npc of npcs) {
      // Check instance state for NPC status
      const npcState = instanceState?.npc_states?.[npc.character_uuid];
      const status = npcState?.status ?? 'alive';

      // Skip dead NPCs
      if (status === 'dead') {
        continue;
      }

      // Try to get thin frame from character source
      const characterContext = await characterSource.get(npc.character_uuid);

      results.push({
        uuid: npc.character_uuid,
        name: characterContext?.name ?? 'Unknown NPC',
        imagePath: characterContext?.imagePath ?? null,
        isHostile: npc.hostile ?? false,
        monsterLevel: npc.monster_level ?? null,
        status,
        thinFrame: characterContext?.thinFrame ?? null,
      });
    }

    return results;
  }

  /**
   * Apply instance state to a room context.
   */
  private applyInstanceState(
    context: RoomContext,
    instanceState: RoomInstanceState
  ): RoomContext {
    // Filter out dead NPCs and update status
    const updatedNpcs = context.npcs
      .filter((npc) => instanceState.npc_states?.[npc.uuid]?.status !== 'dead')
      .map((npc) => {
        const npcState = instanceState.npc_states?.[npc.uuid];
        return {
          ...npc,
          status: npcState?.status ?? 'alive',
        };
      });

    return {
      ...context,
      npcs: updatedNpcs,
      instanceState,
    };
  }

  /**
   * Dispose of the source and clean up resources.
   */
  dispose(): void {
    this.cache.dispose();
    this.roomStateCache.clear();
  }
}

// Singleton instance for shared use
let sharedInstance: RoomSource | null = null;

/**
 * Get the shared RoomSource instance.
 */
export function getRoomSource(): RoomSource {
  if (!sharedInstance) {
    sharedInstance = new RoomSource();
  }
  return sharedInstance;
}

/**
 * Reset the shared instance (for testing).
 */
export function resetRoomSource(): void {
  if (sharedInstance) {
    sharedInstance.dispose();
    sharedInstance = null;
  }
}
