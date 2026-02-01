/**
 * @file AdventureLogSource.ts
 * @description Context source for adventure log and room summaries.
 *
 * Provides access to:
 * - Adventure context (room visit history)
 * - Recent room summaries for context injection
 */

import type { ContextSource, AdventureLogContext } from '../../../types/context';
import type { AdventureContext, RoomSummary } from '../../../types/adventureLog';
import { adventureLogApi } from '../../../api/adventureLogApi';
import { ContextCache, CachePresets, compositeKey } from '../ContextCache';

/**
 * Key for adventure log source - can be string (composite key) or structured object.
 */
type AdventureLogKey = string | { worldUuid: string; userUuid: string };

/**
 * Default number of recent summaries to include in context.
 */
const DEFAULT_MAX_RECENT_SUMMARIES = 5;

/**
 * Source for adventure log context data.
 *
 * @example
 * ```typescript
 * const source = new AdventureLogSource();
 * const context = await source.getForWorld('world-uuid', 'user-uuid');
 * ```
 */
export class AdventureLogSource implements ContextSource<AdventureLogContext, AdventureLogKey> {
  private cache: ContextCache<AdventureLogContext>;
  private maxRecentSummaries: number;

  constructor(maxRecentSummaries: number = DEFAULT_MAX_RECENT_SUMMARIES) {
    // Adventure logs change per transition, use short cache
    this.cache = new ContextCache<AdventureLogContext>(CachePresets.shortLived());
    this.maxRecentSummaries = maxRecentSummaries;
  }

  /**
   * Get adventure log context by composite key.
   * Key format: "worldUuid:userUuid" or { worldUuid, userUuid }
   */
  async get(key: AdventureLogKey): Promise<AdventureLogContext | null> {
    const [worldUuid, userUuid] = this.parseKey(key);
    if (!worldUuid || !userUuid) {
      return null;
    }

    return this.getForWorld(worldUuid, userUuid);
  }

  /**
   * Get adventure log context for a specific world and user.
   */
  async getForWorld(worldUuid: string, userUuid: string): Promise<AdventureLogContext | null> {
    const key = this.buildKey(worldUuid, userUuid);

    // Check cache first
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    // Fetch from API
    return this.fetchAndCache(worldUuid, userUuid);
  }

  /**
   * Force refresh adventure log data.
   */
  async refresh(key: AdventureLogKey): Promise<AdventureLogContext | null> {
    const [worldUuid, userUuid] = this.parseKey(key);
    if (!worldUuid || !userUuid) {
      return null;
    }

    const cacheKey = this.buildKey(worldUuid, userUuid);
    this.cache.invalidate(cacheKey);
    return this.fetchAndCache(worldUuid, userUuid);
  }

  /**
   * Invalidate cached adventure log data.
   */
  invalidate(key: AdventureLogKey): void {
    const [worldUuid, userUuid] = this.parseKey(key);
    if (worldUuid && userUuid) {
      const cacheKey = this.buildKey(worldUuid, userUuid);
      this.cache.invalidate(cacheKey);
    }
  }

  /**
   * Invalidate adventure log for a specific world/user.
   */
  invalidateForWorld(worldUuid: string, userUuid: string): void {
    const key = this.buildKey(worldUuid, userUuid);
    this.cache.invalidate(key);
  }

  /**
   * Check if adventure log data is cached.
   */
  has(key: AdventureLogKey): boolean {
    const [worldUuid, userUuid] = this.parseKey(key);
    if (!worldUuid || !userUuid) {
      return false;
    }
    const cacheKey = this.buildKey(worldUuid, userUuid);
    return this.cache.has(cacheKey);
  }

  /**
   * Clear all cached adventure log data.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Set the maximum number of recent summaries to include.
   */
  setMaxRecentSummaries(max: number): void {
    this.maxRecentSummaries = max;
    // Clear cache since the context format changed
    this.cache.clear();
  }

  /**
   * Get recent summaries for context injection (excluding current room).
   */
  getRecentSummaries(
    context: AdventureLogContext | null,
    excludeRoomUuid?: string
  ): RoomSummary[] {
    if (!context?.context) {
      return [];
    }

    let summaries = context.context.entries;

    // Exclude current room if specified
    if (excludeRoomUuid) {
      summaries = summaries.filter(s => s.roomUuid !== excludeRoomUuid);
    }

    // Return most recent (already sorted by visitedAt in entries)
    return summaries.slice(-this.maxRecentSummaries);
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Fetch adventure log data from API and cache it.
   */
  private async fetchAndCache(
    worldUuid: string,
    userUuid: string
  ): Promise<AdventureLogContext | null> {
    try {
      const adventureContext = await adventureLogApi.getAdventureContext(worldUuid, userUuid);
      const context = this.buildContext(adventureContext);
      const key = this.buildKey(worldUuid, userUuid);
      this.cache.set(key, context);
      return context;
    } catch (error) {
      console.error(`[AdventureLogSource] Error fetching adventure log for ${worldUuid}/${userUuid}:`, error);
      return null;
    }
  }

  /**
   * Build AdventureLogContext from API response.
   */
  private buildContext(adventureContext: AdventureContext): AdventureLogContext {
    // Get recent summaries (most recent last)
    const recentSummaries = adventureContext.entries.slice(-this.maxRecentSummaries);

    return {
      context: adventureContext,
      recentSummaries,
      totalRoomsVisited: adventureContext.totalRoomsVisited,
    };
  }

  /**
   * Build cache key from world and user UUIDs.
   */
  private buildKey(worldUuid: string, userUuid: string): string {
    return compositeKey(worldUuid, userUuid);
  }

  /**
   * Parse cache key back to world and user UUIDs.
   */
  private parseKey(key: AdventureLogKey): [string | null, string | null] {
    if (typeof key === 'string') {
      const parts = key.split(':');
      if (parts.length === 2) {
        return [parts[0], parts[1]];
      }
    } else if (typeof key === 'object' && key !== null && 'worldUuid' in key && 'userUuid' in key) {
      return [key.worldUuid, key.userUuid];
    }
    return [null, null];
  }

  /**
   * Dispose of the source and clean up resources.
   */
  dispose(): void {
    this.cache.dispose();
  }
}

// Singleton instance for shared use
let sharedInstance: AdventureLogSource | null = null;

/**
 * Get the shared AdventureLogSource instance.
 */
export function getAdventureLogSource(): AdventureLogSource {
  if (!sharedInstance) {
    sharedInstance = new AdventureLogSource();
  }
  return sharedInstance;
}

/**
 * Reset the shared instance (for testing).
 */
export function resetAdventureLogSource(): void {
  if (sharedInstance) {
    sharedInstance.dispose();
    sharedInstance = null;
  }
}
