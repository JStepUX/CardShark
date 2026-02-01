/**
 * @file WorldSource.ts
 * @description Context source for world card data.
 *
 * Provides cached access to world cards by UUID.
 * Implements the ContextSource interface for consistent data access.
 */

import type { ContextSource, WorldContext } from '../../../types/context';
import type { WorldCard, WorldData } from '../../../types/worldCard';
import { worldApi } from '../../../api/worldApi';
import { ContextCache, CachePresets } from '../ContextCache';

/**
 * Source for world card data with caching.
 *
 * @example
 * ```typescript
 * const source = new WorldSource();
 * const context = await source.get('world-uuid');
 * if (context) {
 *   console.log(context.name, context.playerPosition);
 * }
 * ```
 */
export class WorldSource implements ContextSource<WorldContext> {
  private cache: ContextCache<WorldContext>;

  constructor() {
    // Worlds are stable during gameplay, use standard cache
    this.cache = new ContextCache<WorldContext>(CachePresets.standard());
  }

  /**
   * Get world context by UUID.
   * Returns cached data if available, otherwise fetches from API.
   */
  async get(uuid: string): Promise<WorldContext | null> {
    // Check cache first
    const cached = this.cache.get(uuid);
    if (cached) {
      return cached;
    }

    // Fetch from API
    return this.fetchAndCache(uuid);
  }

  /**
   * Force refresh world data, bypassing cache.
   */
  async refresh(uuid: string): Promise<WorldContext | null> {
    this.cache.invalidate(uuid);
    return this.fetchAndCache(uuid);
  }

  /**
   * Invalidate cached data for a world.
   */
  invalidate(uuid: string): void {
    this.cache.invalidate(uuid);
  }

  /**
   * Check if world data is cached.
   */
  has(uuid: string): boolean {
    return this.cache.has(uuid);
  }

  /**
   * Clear all cached world data.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the raw world card (without WorldContext wrapper).
   */
  async getCard(uuid: string): Promise<WorldCard | null> {
    const context = await this.get(uuid);
    return context?.card ?? null;
  }

  /**
   * Get world data extensions.
   */
  async getWorldData(uuid: string): Promise<WorldData | null> {
    const context = await this.get(uuid);
    return context?.worldData ?? null;
  }

  /**
   * Update the cached world context with new progression data.
   * This is used to update the cache without re-fetching from the API.
   */
  updateProgression(
    uuid: string,
    progression: Partial<WorldContext['progression']>
  ): void {
    const cached = this.cache.get(uuid);
    if (cached) {
      this.cache.set(uuid, {
        ...cached,
        progression: {
          ...cached.progression,
          ...progression,
        },
      });
    }
  }

  /**
   * Update the cached world context with new player position.
   */
  updatePlayerPosition(uuid: string, position: { x: number; y: number }): void {
    const cached = this.cache.get(uuid);
    if (cached) {
      this.cache.set(uuid, {
        ...cached,
        playerPosition: position,
      });
    }
  }

  /**
   * Fetch world data from API and cache it.
   */
  private async fetchAndCache(uuid: string): Promise<WorldContext | null> {
    try {
      const card = await worldApi.getWorld(uuid);
      const context = this.buildContext(card);
      this.cache.set(uuid, context);
      return context;
    } catch (error) {
      console.error(`[WorldSource] Error fetching world ${uuid}:`, error);
      return null;
    }
  }

  /**
   * Build WorldContext from a WorldCard.
   */
  private buildContext(card: WorldCard): WorldContext {
    const worldData = card.data.extensions.world_data;

    return {
      card,
      uuid: card.data.character_uuid || worldData.uuid,
      name: card.data.name,
      description: card.data.description,
      worldData,
      playerPosition: worldData.player_position,
      progression: {
        xp: worldData.player_xp ?? 0,
        level: worldData.player_level ?? 1,
        gold: worldData.player_gold ?? 0,
      },
    };
  }

  /**
   * Dispose of the source and clean up resources.
   */
  dispose(): void {
    this.cache.dispose();
  }
}

// Singleton instance for shared use
let sharedInstance: WorldSource | null = null;

/**
 * Get the shared WorldSource instance.
 */
export function getWorldSource(): WorldSource {
  if (!sharedInstance) {
    sharedInstance = new WorldSource();
  }
  return sharedInstance;
}

/**
 * Reset the shared instance (for testing).
 */
export function resetWorldSource(): void {
  if (sharedInstance) {
    sharedInstance.dispose();
    sharedInstance = null;
  }
}
