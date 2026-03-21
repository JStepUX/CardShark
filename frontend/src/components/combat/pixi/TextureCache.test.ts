/**
 * Tests for TextureCache.ts
 *
 * Covers:
 * - Cache hit/miss behavior
 * - Concurrent load deduplication
 * - Error fallback to WHITE texture
 * - Preload batching
 * - Cache clearing
 * - has() check functionality
 */

import { vi } from 'vitest';

// Create mock PIXI before importing TextureCache
const { mockTexture, mockWhiteTexture, loadCalls, getLoadShouldFail, setLoadShouldFail, getLoadDelay, setLoadDelay } = vi.hoisted(() => {
    const mockTexture = {
        width: 100,
        height: 100,
        source: { label: 'mock-texture' },
    };

    const mockWhiteTexture = {
        width: 1,
        height: 1,
        source: { label: 'white' },
    };

    // Track Assets.load calls
    const loadCalls: string[] = [];
    let loadShouldFail = false;
    let loadDelay = 0;

    return {
        mockTexture,
        mockWhiteTexture,
        loadCalls,
        getLoadShouldFail: () => loadShouldFail,
        setLoadShouldFail: (v: boolean) => { loadShouldFail = v; },
        getLoadDelay: () => loadDelay,
        setLoadDelay: (v: number) => { loadDelay = v; },
    };
});

vi.mock('pixi.js', () => ({
    Assets: {
        load: vi.fn((path: string) => {
            loadCalls.push(path);
            if (getLoadShouldFail()) {
                return Promise.reject(new Error('Load failed'));
            }
            if (getLoadDelay() > 0) {
                return new Promise((resolve) => {
                    setTimeout(() => resolve(mockTexture), getLoadDelay());
                });
            }
            return Promise.resolve(mockTexture);
        }),
    },
    Texture: {
        WHITE: mockWhiteTexture,
    },
}));

// Import after mocking
import { TextureCache } from './TextureCache';

describe('TextureCache', () => {
    beforeEach(() => {
        // Clear the cache before each test
        TextureCache.clear();
        loadCalls.length = 0;
        setLoadShouldFail(false);
        setLoadDelay(0);
    });

    describe('preload', () => {
        it('should load multiple textures and cache them', async () => {
            const paths = ['/assets/texture1.png', '/assets/texture2.png', '/assets/texture3.png'];

            await TextureCache.preload(paths);

            expect(loadCalls).toEqual(paths);
            expect(TextureCache.has('/assets/texture1.png')).toBe(true);
            expect(TextureCache.has('/assets/texture2.png')).toBe(true);
            expect(TextureCache.has('/assets/texture3.png')).toBe(true);
        });

        it('should not reload already cached textures', async () => {
            const path = '/assets/cached.png';

            await TextureCache.preload([path]);
            loadCalls.length = 0;

            await TextureCache.preload([path]);

            expect(loadCalls).toHaveLength(0);
        });

        it('should handle empty array', async () => {
            await expect(TextureCache.preload([])).resolves.toBeUndefined();
            expect(loadCalls).toHaveLength(0);
        });

        it('should wait for all textures to load before resolving', async () => {
            setLoadDelay(10);

            const startTime = Date.now();
            await TextureCache.preload(['/assets/slow1.png', '/assets/slow2.png']);
            const elapsed = Date.now() - startTime;

            // Should have waited for both loads
            expect(elapsed).toBeGreaterThanOrEqual(10);
            expect(TextureCache.has('/assets/slow1.png')).toBe(true);
            expect(TextureCache.has('/assets/slow2.png')).toBe(true);
        });
    });

    describe('get', () => {
        it('should return cached texture for preloaded path', async () => {
            const path = '/assets/character.png';
            await TextureCache.preload([path]);

            const texture = TextureCache.get(path);

            expect(texture).toBe(mockTexture);
        });

        it('should return WHITE texture for non-preloaded path', () => {
            const originalWarn = console.warn;
            console.warn = vi.fn() as typeof console.warn;

            const texture = TextureCache.get('/assets/not-preloaded.png');

            expect(texture).toBe(mockWhiteTexture);
            expect(console.warn).toHaveBeenCalledWith(
                'Texture not preloaded: /assets/not-preloaded.png. Using fallback.'
            );

            console.warn = originalWarn;
        });

        it('should trigger async load when getting non-cached texture', async () => {
            const path = '/assets/lazy-load.png';

            console.warn = vi.fn() as typeof console.warn;
            const texture = TextureCache.get(path);
            console.warn = vi.fn() as typeof console.warn;

            // Returns WHITE immediately
            expect(texture).toBe(mockWhiteTexture);

            // But starts loading in background
            expect(loadCalls).toContain(path);

            // Wait for async load to complete
            await new Promise((resolve) => setTimeout(resolve, 10));

            // Now it should be cached
            expect(TextureCache.has(path)).toBe(true);
        });
    });

    describe('concurrent load deduplication', () => {
        it('should only load once when same path is requested concurrently', async () => {
            setLoadDelay(50);
            const path = '/assets/concurrent.png';

            // Start multiple preloads for the same path simultaneously
            const promise1 = TextureCache.preload([path]);
            const promise2 = TextureCache.preload([path]);
            const promise3 = TextureCache.preload([path]);

            await Promise.all([promise1, promise2, promise3]);

            // Should only have loaded once
            expect(loadCalls.filter((p) => p === path)).toHaveLength(1);
        });

        it('should share the same promise for concurrent loads', async () => {
            setLoadDelay(50);
            const path = '/assets/shared-promise.png';

            const promises = [
                TextureCache.preload([path]),
                TextureCache.preload([path]),
                TextureCache.preload([path]),
            ];

            // All should resolve around the same time
            const startTime = Date.now();
            await Promise.all(promises);
            const elapsed = Date.now() - startTime;

            // Should complete in ~50ms (the single load time), not 150ms (3 sequential loads)
            expect(elapsed).toBeLessThan(100);
        });
    });

    describe('error handling', () => {
        it('should cache WHITE texture on load failure', async () => {
            setLoadShouldFail(true);
            const path = '/assets/broken.png';

            const originalError = console.error;
            console.error = vi.fn() as typeof console.error;

            await TextureCache.preload([path]);

            console.error = originalError;

            const texture = TextureCache.get(path);
            expect(texture).toBe(mockWhiteTexture);
        });

        it('should log error on load failure', async () => {
            setLoadShouldFail(true);
            const path = '/assets/error-log.png';

            const originalError = console.error;
            console.error = vi.fn() as typeof console.error;

            await TextureCache.preload([path]);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to load texture'),
                expect.any(Error)
            );

            console.error = originalError;
        });

        it('should allow other textures to load when one fails', async () => {
            const goodPath = '/assets/good.png';
            const badPath = '/assets/bad.png';

            // Get a reference to the mocked Assets module and override load for this test
            const pixiMock = await import('pixi.js');
            const originalLoad = pixiMock.Assets.load;
            (pixiMock.Assets as unknown as { load: ReturnType<typeof vi.fn> }).load = vi.fn((path: string) => {
                loadCalls.push(path);
                if (path === badPath) {
                    return Promise.reject(new Error('Load failed'));
                }
                return Promise.resolve(mockTexture);
            });

            const originalError = console.error;
            console.error = vi.fn() as typeof console.error;

            await TextureCache.preload([goodPath, badPath]);

            console.error = originalError;
            (pixiMock.Assets as { load: typeof originalLoad }).load = originalLoad;

            expect(TextureCache.get(goodPath)).toBe(mockTexture);
            expect(TextureCache.get(badPath)).toBe(mockWhiteTexture);
        });
    });

    describe('has', () => {
        it('should return true for cached texture', async () => {
            const path = '/assets/exists.png';
            await TextureCache.preload([path]);

            expect(TextureCache.has(path)).toBe(true);
        });

        it('should return false for non-cached texture', () => {
            expect(TextureCache.has('/assets/does-not-exist.png')).toBe(false);
        });
    });

    describe('clear', () => {
        it('should remove all cached textures', async () => {
            await TextureCache.preload(['/assets/a.png', '/assets/b.png', '/assets/c.png']);

            expect(TextureCache.has('/assets/a.png')).toBe(true);
            expect(TextureCache.has('/assets/b.png')).toBe(true);
            expect(TextureCache.has('/assets/c.png')).toBe(true);

            TextureCache.clear();

            expect(TextureCache.has('/assets/a.png')).toBe(false);
            expect(TextureCache.has('/assets/b.png')).toBe(false);
            expect(TextureCache.has('/assets/c.png')).toBe(false);
        });

        it('should allow reloading after clear', async () => {
            const path = '/assets/reload.png';

            await TextureCache.preload([path]);
            TextureCache.clear();
            loadCalls.length = 0;

            await TextureCache.preload([path]);

            expect(loadCalls).toContain(path);
            expect(TextureCache.has(path)).toBe(true);
        });

        it('should clear pending loads as well', async () => {
            setLoadDelay(100);
            const path = '/assets/pending.png';

            // Start a load but don't wait for it
            TextureCache.preload([path]);

            // Clear immediately
            TextureCache.clear();

            // The loading map should be cleared (tested indirectly)
            // A new preload should trigger a new load
            loadCalls.length = 0;
            setLoadDelay(0);

            await TextureCache.preload([path]);

            // Should have loaded again
            expect(loadCalls).toContain(path);
        });
    });
});
