/**
 * @file ContextCache.ts
 * @description Generic caching utility for context sources.
 *
 * Provides a simple, memory-efficient cache with TTL (time-to-live) support.
 * Used by all ContextSource implementations to cache fetched data.
 *
 * Features:
 * - Generic type support for any cached data
 * - Configurable TTL per entry or global default
 * - Automatic cleanup of expired entries
 * - Manual invalidation support
 * - Memory-efficient with WeakRef option for large objects
 */

/**
 * Configuration options for cache behavior.
 */
export interface CacheConfig {
  /** Default TTL in milliseconds (0 = no expiration) */
  defaultTTL: number;
  /** Maximum number of entries (0 = unlimited) */
  maxEntries: number;
  /** Whether to automatically clean up expired entries */
  autoCleanup: boolean;
  /** Interval for auto-cleanup in milliseconds */
  cleanupInterval: number;
}

/**
 * Default cache configuration.
 */
const DEFAULT_CONFIG: CacheConfig = {
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  maxEntries: 100,
  autoCleanup: true,
  cleanupInterval: 60 * 1000, // 1 minute
};

/**
 * Internal cache entry structure.
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

/**
 * Generic cache implementation for context sources.
 *
 * @template T - The type of values stored in the cache
 * @template K - The type of keys (defaults to string)
 *
 * @example
 * ```typescript
 * const cache = new ContextCache<CharacterCard>({ defaultTTL: 60000 });
 * cache.set('uuid-123', characterCard);
 * const card = cache.get('uuid-123'); // CharacterCard | null
 * cache.invalidate('uuid-123');
 * ```
 */
export class ContextCache<T, K extends string = string> {
  private cache: Map<K, CacheEntry<T>>;
  private config: CacheConfig;
  private cleanupTimerId: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.cache = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.autoCleanup && this.config.cleanupInterval > 0) {
      this.startAutoCleanup();
    }
  }

  /**
   * Get a value from the cache.
   * Returns null if the key doesn't exist or the entry has expired.
   *
   * @param key - The cache key
   * @returns The cached value or null
   */
  get(key: K): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set a value in the cache.
   *
   * @param key - The cache key
   * @param value - The value to cache
   * @param ttl - Optional TTL override for this entry
   */
  set(key: K, value: T, ttl?: number): void {
    // Enforce max entries limit
    if (this.config.maxEntries > 0 && this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl ?? this.config.defaultTTL,
    });
  }

  /**
   * Check if a key exists in the cache and is not expired.
   *
   * @param key - The cache key
   * @returns True if the key exists and is valid
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Invalidate (remove) a specific key from the cache.
   *
   * @param key - The cache key to invalidate
   */
  invalidate(key: K): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all keys that match a predicate.
   *
   * @param predicate - Function that returns true for keys to invalidate
   */
  invalidateWhere(predicate: (key: K) => boolean): void {
    for (const key of this.cache.keys()) {
      if (predicate(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of entries in the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys currently in the cache (including potentially expired ones).
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Get cache statistics for debugging.
   */
  getStats(): {
    size: number;
    maxEntries: number;
    defaultTTL: number;
    autoCleanup: boolean;
  } {
    return {
      size: this.cache.size,
      maxEntries: this.config.maxEntries,
      defaultTTL: this.config.defaultTTL,
      autoCleanup: this.config.autoCleanup,
    };
  }

  /**
   * Manually trigger cleanup of expired entries.
   *
   * @returns Number of entries removed
   */
  cleanup(): number {
    let removed = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.ttl > 0 && now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Stop the auto-cleanup timer.
   * Call this when disposing of the cache.
   */
  dispose(): void {
    if (this.cleanupTimerId !== null) {
      clearInterval(this.cleanupTimerId);
      this.cleanupTimerId = null;
    }
    this.cache.clear();
  }

  /**
   * Check if an entry has expired.
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    if (entry.ttl === 0) {
      return false; // No expiration
    }
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Evict the oldest entry to make room for new ones.
   */
  private evictOldest(): void {
    let oldestKey: K | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Start the auto-cleanup interval.
   */
  private startAutoCleanup(): void {
    this.cleanupTimerId = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }
}

/**
 * Create a cache with common presets.
 */
export const CachePresets = {
  /**
   * Short-lived cache for frequently changing data.
   */
  shortLived: (): Partial<CacheConfig> => ({
    defaultTTL: 30 * 1000, // 30 seconds
    maxEntries: 50,
  }),

  /**
   * Standard cache for moderately stable data.
   */
  standard: (): Partial<CacheConfig> => ({
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    maxEntries: 100,
  }),

  /**
   * Long-lived cache for stable data.
   */
  longLived: (): Partial<CacheConfig> => ({
    defaultTTL: 30 * 60 * 1000, // 30 minutes
    maxEntries: 200,
  }),

  /**
   * Permanent cache (no expiration, manual invalidation only).
   */
  permanent: (): Partial<CacheConfig> => ({
    defaultTTL: 0, // No expiration
    maxEntries: 500,
    autoCleanup: false,
  }),
};

/**
 * Utility type for cache key generation.
 */
export type CacheKeyGenerator<T> = (data: T) => string;

/**
 * Create a composite cache key from multiple parts.
 *
 * @param parts - Key parts to combine
 * @returns Combined cache key
 *
 * @example
 * ```typescript
 * const key = compositeKey('world', worldUuid, 'room', roomUuid);
 * // Returns: 'world:uuid1:room:uuid2'
 * ```
 */
export function compositeKey(...parts: (string | number)[]): string {
  return parts.join(':');
}
