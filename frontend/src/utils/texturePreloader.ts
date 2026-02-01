/**
 * @file texturePreloader.ts
 * @description Utility functions for preloading textures during room transitions.
 *
 * Wraps TextureCache.preload() with timeout handling and progress tracking.
 * Used by room transition flow to ensure all entity images are loaded
 * before revealing the new room.
 */

import { TextureCache } from '../components/combat/pixi/TextureCache';
import { TRANSITION_TIMEOUT_MS } from '../types/transition';

/**
 * Entity with optional image path for preloading.
 */
interface PreloadableEntity {
  imagePath?: string | null;
  imageUrl?: string | null;
}

/**
 * Options for texture preloading.
 */
interface PreloadOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Callback for progress updates (0-100) */
  onProgress?: (percent: number) => void;
}

/**
 * Result of texture preloading operation.
 */
export interface PreloadResult {
  /** Whether preloading completed successfully */
  success: boolean;
  /** Number of textures loaded */
  loadedCount: number;
  /** Number of textures that failed to load */
  failedCount: number;
  /** Whether operation timed out */
  timedOut: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Extract image paths from entities, filtering nulls and duplicates.
 */
function collectImagePaths(entities: PreloadableEntity[]): string[] {
  const paths = new Set<string>();

  for (const entity of entities) {
    const path = entity.imagePath ?? entity.imageUrl;
    if (path) {
      paths.add(path);
    }
  }

  return Array.from(paths);
}

/**
 * Preload textures for a list of entities.
 *
 * @param entities - Array of entities with imagePath or imageUrl properties
 * @param options - Preload options (timeout, progress callback)
 * @returns Promise resolving to preload result
 *
 * @example
 * const result = await preloadEntityTextures(roomNpcs, {
 *   timeout: 15000,
 *   onProgress: (percent) => updateProgress(percent),
 * });
 */
export async function preloadEntityTextures(
  entities: PreloadableEntity[],
  options: PreloadOptions = {}
): Promise<PreloadResult> {
  const { timeout = TRANSITION_TIMEOUT_MS, onProgress } = options;

  const paths = collectImagePaths(entities);

  if (paths.length === 0) {
    // No textures to load
    onProgress?.(100);
    return {
      success: true,
      loadedCount: 0,
      failedCount: 0,
      timedOut: false,
    };
  }

  // Track progress
  let loadedCount = 0;
  let failedCount = 0;

  // Create preload promise with timeout
  const preloadPromise = (async () => {
    // Use TextureCache.preload which handles individual failures gracefully
    await TextureCache.preload(paths);

    // Count successful loads (TextureCache caches even failed as WHITE texture)
    for (const path of paths) {
      if (TextureCache.has(path)) {
        loadedCount++;
      } else {
        failedCount++;
      }
    }

    onProgress?.(100);
    return {
      success: true,
      loadedCount,
      failedCount,
      timedOut: false,
    };
  })();

  // Create timeout promise
  const timeoutPromise = new Promise<PreloadResult>((resolve) => {
    setTimeout(() => {
      resolve({
        success: false,
        loadedCount,
        failedCount: paths.length - loadedCount,
        timedOut: true,
        error: `Texture preload timed out after ${timeout}ms`,
      });
    }, timeout);
  });

  // Race between preload and timeout
  return Promise.race([preloadPromise, timeoutPromise]);
}

/**
 * Preload all textures needed for a room.
 *
 * Convenience wrapper that collects player, companion, and NPC images.
 *
 * @param params - Room texture parameters
 * @param options - Preload options
 * @returns Promise resolving to preload result
 *
 * @example
 * const result = await preloadRoomTextures({
 *   playerImagePath: currentUser?.imagePath,
 *   companionImagePath: activeNpcCard?.imageUrl,
 *   npcImageUrls: roomNpcs.map(n => n.imageUrl),
 * });
 */
export async function preloadRoomTextures(
  params: {
    playerImagePath?: string | null;
    companionImagePath?: string | null;
    npcImageUrls?: (string | null | undefined)[];
  },
  options: PreloadOptions = {}
): Promise<PreloadResult> {
  const entities: PreloadableEntity[] = [];

  // Add player
  if (params.playerImagePath) {
    entities.push({ imagePath: params.playerImagePath });
  }

  // Add companion
  if (params.companionImagePath) {
    entities.push({ imagePath: params.companionImagePath });
  }

  // Add NPCs
  if (params.npcImageUrls) {
    for (const url of params.npcImageUrls) {
      if (url) {
        entities.push({ imageUrl: url });
      }
    }
  }

  return preloadEntityTextures(entities, options);
}

/**
 * Check if textures are already cached for given paths.
 * Useful to skip preloading if textures are already available.
 *
 * @param paths - Array of texture paths to check
 * @returns True if all textures are cached
 */
export function areTexturesCached(paths: (string | null | undefined)[]): boolean {
  const validPaths = paths.filter((p): p is string => Boolean(p));
  return validPaths.every(path => TextureCache.has(path));
}
