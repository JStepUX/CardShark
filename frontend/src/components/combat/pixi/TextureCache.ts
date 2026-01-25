/**
 * @file TextureCache.ts
 * @description Singleton texture manager for PixiJS combat system.
 * 
 * Prevents duplicate texture loading and provides centralized texture management.
 * All textures are preloaded at combat start and cleared on combat end.
 */

import * as PIXI from 'pixi.js';

class TextureCacheManager {
    private cache: Map<string, PIXI.Texture> = new Map();
    private loading: Map<string, Promise<PIXI.Texture>> = new Map();

    /**
     * Preload multiple textures before combat starts.
     * Returns when all textures are loaded and cached.
     * 
     * @param paths - Array of texture paths to preload
     * @returns Promise that resolves when all textures are loaded
     * 
     * @example
     * await TextureCache.preload([
     *   '/assets/characters/hero.png',
     *   '/assets/particles/spark.png',
     *   '/assets/projectiles/arrow.png'
     * ]);
     */
    async preload(paths: string[]): Promise<void> {
        const loadPromises = paths.map(path => this.loadTexture(path));
        await Promise.all(loadPromises);
    }

    /**
     * Load a single texture and cache it.
     * If already loading or loaded, returns cached promise/texture.
     * 
     * @param path - Path to texture file
     * @returns Promise that resolves to the loaded texture
     */
    private async loadTexture(path: string): Promise<PIXI.Texture> {
        // Return cached texture if available
        if (this.cache.has(path)) {
            return this.cache.get(path)!;
        }

        // Return in-progress load if already loading
        if (this.loading.has(path)) {
            return this.loading.get(path)!;
        }

        // Start new load
        // Note: Paths should already be URL-encoded when passed to this function
        const loadPromise = PIXI.Assets.load<PIXI.Texture>(path)
            .then(texture => {
                this.cache.set(path, texture);
                this.loading.delete(path);
                return texture;
            })
            .catch(error => {
                console.error(`Failed to load texture: ${path}`, error);
                this.loading.delete(path);
                // Return a fallback white texture on error
                const fallback = PIXI.Texture.WHITE;
                this.cache.set(path, fallback);
                return fallback;
            });

        this.loading.set(path, loadPromise);
        return loadPromise;
    }

    /**
     * Get a cached texture. If not cached, loads it synchronously.
     * Prefer using preload() before combat starts to avoid sync loads.
     * 
     * @param path - Path to texture file
     * @returns Cached texture or WHITE fallback if not found
     */
    get(path: string): PIXI.Texture {
        if (this.cache.has(path)) {
            return this.cache.get(path)!;
        }

        // If not cached, return white texture and start async load
        console.warn(`Texture not preloaded: ${path}. Using fallback.`);
        this.loadTexture(path); // Load async for next time
        return PIXI.Texture.WHITE;
    }

    /**
     * Clear all cached textures.
     * Call this when combat ends to free memory.
     */
    clear(): void {
        // Note: We don't destroy textures here because PIXI.Assets manages that
        // We just clear our references
        this.cache.clear();
        this.loading.clear();
    }

    /**
     * Check if a texture is cached.
     * 
     * @param path - Path to texture file
     * @returns True if texture is cached
     */
    has(path: string): boolean {
        return this.cache.has(path);
    }
}

// Export singleton instance
export const TextureCache = new TextureCacheManager();
