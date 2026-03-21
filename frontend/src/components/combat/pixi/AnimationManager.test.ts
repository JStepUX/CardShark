/**
 * Tests for AnimationManager.ts
 *
 * Covers:
 * - Animation lifecycle (play -> update -> complete -> cleanup)
 * - Animation sequencing (playSequence)
 * - Parallel animation execution (playParallel)
 * - Cancellation behavior (cancel, cancelAll)
 * - Error handling during animation updates
 * - isPlaying state tracking
 * - destroy cleanup
 */

// Mock PIXI before importing AnimationManager
jest.mock('pixi.js', () => ({
    Container: class MockContainer {
        x = 0;
        y = 0;
        scale = { set: jest.fn(), x: 1, y: 1 };
        rotation = 0;
        alpha = 1;
        filters = null;
        children: unknown[] = [];
        addChild = jest.fn();
        removeChild = jest.fn();
        destroy = jest.fn();
    },
    Sprite: jest.fn(() => ({
        x: 0,
        y: 0,
        anchor: { set: jest.fn() },
        rotation: 0,
        visible: true,
        destroy: jest.fn(),
    })),
    Graphics: jest.fn(() => ({
        roundRect: jest.fn().mockReturnThis(),
        fill: jest.fn().mockReturnThis(),
        destroy: jest.fn(),
        tint: 0xFFFFFF,
    })),
    Text: jest.fn(() => ({
        x: 0,
        y: 0,
        alpha: 1,
        scale: { set: jest.fn() },
        parent: { removeChild: jest.fn() },
        destroy: jest.fn(),
    })),
    ColorMatrixFilter: jest.fn(() => ({
        desaturate: jest.fn(),
    })),
    Application: jest.fn(),
    Ticker: jest.fn(),
}));

import { AnimationManager, Animation } from './AnimationManager';

// Mock PIXI.Application and PIXI.Ticker
interface MockTicker {
    add: jest.Mock;
    remove: jest.Mock;
    deltaMS: number;
    callbacks: Set<(ticker: MockTicker) => void>;
    tick: (deltaMS: number) => void;
}

interface MockApp {
    ticker: MockTicker;
}

/**
 * Create a mock PIXI.Application with a controllable ticker
 */
function createMockApp(): MockApp {
    const callbacks = new Set<(ticker: MockTicker) => void>();
    const ticker: MockTicker = {
        deltaMS: 16.67, // ~60fps
        callbacks,
        add: jest.fn((callback: (ticker: MockTicker) => void) => {
            callbacks.add(callback);
        }),
        remove: jest.fn((callback: (ticker: MockTicker) => void) => {
            callbacks.delete(callback);
        }),
        tick(deltaMS: number) {
            this.deltaMS = deltaMS;
            // Copy to array to allow modification during iteration
            for (const cb of Array.from(callbacks)) {
                cb(this);
            }
        },
    };
    return { ticker };
}

/**
 * Create a mock animation that completes after a specified number of updates
 */
function createMockAnimation(updatesUntilComplete: number = 1): Animation & {
    updateCount: number;
    onCompleteCalled: boolean;
    onCancelCalled: boolean;
} {
    let updateCount = 0;
    return {
        updateCount: 0,
        onCompleteCalled: false,
        onCancelCalled: false,
        update(_deltaTime: number): boolean {
            updateCount++;
            this.updateCount = updateCount;
            return updateCount >= updatesUntilComplete;
        },
        onComplete() {
            this.onCompleteCalled = true;
        },
        onCancel() {
            this.onCancelCalled = true;
        },
    };
}

/**
 * Create an animation that throws an error during update
 */
function createErrorAnimation(errorOnUpdate: number = 1): Animation {
    let updateCount = 0;
    return {
        update(_deltaTime: number): boolean {
            updateCount++;
            if (updateCount === errorOnUpdate) {
                throw new Error('Animation update error');
            }
            return false;
        },
    };
}

describe('AnimationManager', () => {
    let mockApp: MockApp;
    let manager: AnimationManager;

    beforeEach(() => {
        mockApp = createMockApp();
        // Cast to unknown first to avoid TS errors with mock
        manager = new AnimationManager(mockApp as unknown as import('pixi.js').Application);
    });

    afterEach(() => {
        manager.destroy();
    });

    describe('constructor', () => {
        it('should register a ticker callback on construction', () => {
            expect(mockApp.ticker.add).toHaveBeenCalledTimes(1);
            expect(mockApp.ticker.callbacks.size).toBe(1);
        });
    });

    describe('play', () => {
        it('should return a promise that resolves when animation completes', async () => {
            const animation = createMockAnimation(2);
            const playPromise = manager.play(animation);

            // First tick - animation not complete
            mockApp.ticker.tick(16.67);
            expect(animation.updateCount).toBe(1);

            // Second tick - animation completes
            mockApp.ticker.tick(16.67);
            expect(animation.updateCount).toBe(2);

            await expect(playPromise).resolves.toBeUndefined();
        });

        it('should call onComplete when animation finishes', async () => {
            const animation = createMockAnimation(1);
            const playPromise = manager.play(animation);

            mockApp.ticker.tick(16.67);

            await playPromise;
            expect(animation.onCompleteCalled).toBe(true);
        });

        it('should pass deltaTime in seconds to animation update', async () => {
            let receivedDeltaTime: number | null = null;
            const animation: Animation = {
                update(deltaTime: number): boolean {
                    receivedDeltaTime = deltaTime;
                    return true;
                },
            };

            manager.play(animation);
            mockApp.ticker.tick(100); // 100ms

            expect(receivedDeltaTime).toBeCloseTo(0.1, 5); // 100ms = 0.1 seconds
        });

        it('should track isPlaying correctly during animation', async () => {
            const animation = createMockAnimation(2);

            expect(manager.isPlaying()).toBe(false);

            manager.play(animation);
            expect(manager.isPlaying()).toBe(true);

            mockApp.ticker.tick(16.67);
            expect(manager.isPlaying()).toBe(true);

            mockApp.ticker.tick(16.67);
            // After completion, isPlaying should be false
            expect(manager.isPlaying()).toBe(false);
        });

        it('should handle multiple concurrent animations', async () => {
            const animation1 = createMockAnimation(2);
            const animation2 = createMockAnimation(3);

            const promise1 = manager.play(animation1);
            const promise2 = manager.play(animation2);

            expect(manager.isPlaying()).toBe(true);

            // First tick
            mockApp.ticker.tick(16.67);
            expect(animation1.updateCount).toBe(1);
            expect(animation2.updateCount).toBe(1);

            // Second tick - animation1 completes
            mockApp.ticker.tick(16.67);
            expect(animation1.updateCount).toBe(2);
            expect(animation2.updateCount).toBe(2);

            await expect(promise1).resolves.toBeUndefined();
            expect(manager.isPlaying()).toBe(true); // animation2 still running

            // Third tick - animation2 completes
            mockApp.ticker.tick(16.67);

            await expect(promise2).resolves.toBeUndefined();
            expect(manager.isPlaying()).toBe(false);
        });
    });

    describe('playSequence', () => {
        it('should play animations one after another', async () => {
            const animation1 = createMockAnimation(1);
            const animation2 = createMockAnimation(1);
            const animation3 = createMockAnimation(1);

            const sequencePromise = manager.playSequence([animation1, animation2, animation3]);

            // First animation
            mockApp.ticker.tick(16.67);
            expect(animation1.updateCount).toBe(1);
            expect(animation2.updateCount).toBe(0);
            expect(animation3.updateCount).toBe(0);

            // Allow promise microtask to resolve
            await Promise.resolve();

            // Second animation
            mockApp.ticker.tick(16.67);
            expect(animation2.updateCount).toBe(1);
            expect(animation3.updateCount).toBe(0);

            await Promise.resolve();

            // Third animation
            mockApp.ticker.tick(16.67);
            expect(animation3.updateCount).toBe(1);

            await expect(sequencePromise).resolves.toBeUndefined();
        });

        it('should handle empty sequence', async () => {
            await expect(manager.playSequence([])).resolves.toBeUndefined();
        });

        it('should call onComplete for each animation in sequence', async () => {
            const animation1 = createMockAnimation(1);
            const animation2 = createMockAnimation(1);

            const sequencePromise = manager.playSequence([animation1, animation2]);

            mockApp.ticker.tick(16.67);
            expect(animation1.onCompleteCalled).toBe(true);

            await Promise.resolve();

            mockApp.ticker.tick(16.67);
            expect(animation2.onCompleteCalled).toBe(true);

            await sequencePromise;
        });
    });

    describe('playParallel', () => {
        it('should play all animations simultaneously', async () => {
            const animation1 = createMockAnimation(2);
            const animation2 = createMockAnimation(3);

            const parallelPromise = manager.playParallel([animation1, animation2]);

            // First tick - both update
            mockApp.ticker.tick(16.67);
            expect(animation1.updateCount).toBe(1);
            expect(animation2.updateCount).toBe(1);

            // Second tick - animation1 completes, animation2 continues
            mockApp.ticker.tick(16.67);
            expect(animation1.updateCount).toBe(2);
            expect(animation2.updateCount).toBe(2);

            // Third tick - animation2 completes
            mockApp.ticker.tick(16.67);
            expect(animation2.updateCount).toBe(3);

            await expect(parallelPromise).resolves.toBeUndefined();
        });

        it('should resolve only when all animations complete', async () => {
            const animation1 = createMockAnimation(1);
            const animation2 = createMockAnimation(3);

            let resolved = false;
            const parallelPromise = manager.playParallel([animation1, animation2]).then(() => {
                resolved = true;
            });

            mockApp.ticker.tick(16.67);
            expect(animation1.onCompleteCalled).toBe(true);

            await Promise.resolve();
            expect(resolved).toBe(false);

            mockApp.ticker.tick(16.67);
            await Promise.resolve();
            expect(resolved).toBe(false);

            mockApp.ticker.tick(16.67);
            await parallelPromise;
            expect(resolved).toBe(true);
        });

        it('should handle empty parallel array', async () => {
            await expect(manager.playParallel([])).resolves.toBeUndefined();
        });
    });

    describe('cancel', () => {
        it('should cancel a specific animation', async () => {
            const animation = createMockAnimation(5);
            const playPromise = manager.play(animation);

            mockApp.ticker.tick(16.67);
            expect(animation.updateCount).toBe(1);

            manager.cancel(animation);

            await expect(playPromise).rejects.toThrow('Animation cancelled');
            expect(animation.onCancelCalled).toBe(true);
        });

        it('should call onCancel callback when cancelled', async () => {
            const animation = createMockAnimation(5);
            const playPromise = manager.play(animation);

            manager.cancel(animation);

            expect(animation.onCancelCalled).toBe(true);

            // Consume the rejection
            await expect(playPromise).rejects.toThrow('Animation cancelled');
        });

        it('should not affect other animations when one is cancelled', async () => {
            const animation1 = createMockAnimation(5);
            const animation2 = createMockAnimation(2);

            const promise1 = manager.play(animation1);
            const promise2 = manager.play(animation2);

            manager.cancel(animation1);

            // Consume the rejection from animation1
            await expect(promise1).rejects.toThrow('Animation cancelled');

            // animation2 should still work
            mockApp.ticker.tick(16.67);
            mockApp.ticker.tick(16.67);

            await expect(promise2).resolves.toBeUndefined();
            expect(animation2.onCompleteCalled).toBe(true);
        });

        it('should handle cancelling non-existent animation gracefully', () => {
            const animation = createMockAnimation(1);
            // Don't play, just try to cancel
            expect(() => manager.cancel(animation)).not.toThrow();
        });
    });

    describe('cancelAll', () => {
        it('should cancel all active animations', async () => {
            const animation1 = createMockAnimation(5);
            const animation2 = createMockAnimation(5);
            const animation3 = createMockAnimation(5);

            const promise1 = manager.play(animation1);
            const promise2 = manager.play(animation2);
            const promise3 = manager.play(animation3);

            expect(manager.isPlaying()).toBe(true);

            manager.cancelAll();

            expect(manager.isPlaying()).toBe(false);

            await expect(promise1).rejects.toThrow('Animation cancelled');
            await expect(promise2).rejects.toThrow('Animation cancelled');
            await expect(promise3).rejects.toThrow('Animation cancelled');

            expect(animation1.onCancelCalled).toBe(true);
            expect(animation2.onCancelCalled).toBe(true);
            expect(animation3.onCancelCalled).toBe(true);
        });

        it('should handle cancelAll when no animations are playing', () => {
            expect(() => manager.cancelAll()).not.toThrow();
            expect(manager.isPlaying()).toBe(false);
        });
    });

    describe('error handling', () => {
        it('should reject promise when animation update throws', async () => {
            const errorAnimation = createErrorAnimation(1);
            const playPromise = manager.play(errorAnimation);

            // Suppress console.error for this test
            const originalError = console.error;
            console.error = jest.fn();

            mockApp.ticker.tick(16.67);

            console.error = originalError;

            await expect(playPromise).rejects.toThrow('Animation update error');
        });

        it('should remove animation from active set after error', async () => {
            const errorAnimation = createErrorAnimation(1);
            const playPromise = manager.play(errorAnimation);

            console.error = jest.fn();

            mockApp.ticker.tick(16.67);

            // Consume the rejection
            await expect(playPromise).rejects.toThrow('Animation update error');

            expect(manager.isPlaying()).toBe(false);
        });

        it('should continue updating other animations after one throws', async () => {
            const errorAnimation = createErrorAnimation(1);
            const goodAnimation = createMockAnimation(2);

            const errorPromise = manager.play(errorAnimation);
            const goodPromise = manager.play(goodAnimation);

            console.error = jest.fn();

            // First tick - error animation throws
            mockApp.ticker.tick(16.67);
            expect(goodAnimation.updateCount).toBe(1);

            // Consume the error rejection
            await expect(errorPromise).rejects.toThrow('Animation update error');

            // Second tick - good animation continues
            mockApp.ticker.tick(16.67);
            expect(goodAnimation.updateCount).toBe(2);

            await expect(goodPromise).resolves.toBeUndefined();
        });

        it('should handle error in onComplete callback gracefully', async () => {
            const animation: Animation = {
                update: () => true,
                onComplete: () => {
                    throw new Error('onComplete error');
                },
            };

            const originalError = console.error;
            console.error = jest.fn();

            const playPromise = manager.play(animation);
            mockApp.ticker.tick(16.67);

            // The promise should still resolve despite onComplete error
            await expect(playPromise).resolves.toBeUndefined();

            console.error = originalError;
        });
    });

    describe('destroy', () => {
        it('should cancel all animations on destroy', async () => {
            const animation = createMockAnimation(10);
            const playPromise = manager.play(animation);

            manager.destroy();

            await expect(playPromise).rejects.toThrow('Animation cancelled');
        });

        it('should remove ticker callback on destroy', () => {
            manager.destroy();

            expect(mockApp.ticker.remove).toHaveBeenCalledTimes(1);
            expect(mockApp.ticker.callbacks.size).toBe(0);
        });

        it('should stop updating animations after destroy', async () => {
            const animation = createMockAnimation(10);
            const playPromise = manager.play(animation);

            manager.destroy();

            // Consume the rejection
            await expect(playPromise).rejects.toThrow('Animation cancelled');

            // Tick after destroy
            mockApp.ticker.tick(16.67);

            // Animation should not have been updated after destroy
            // (only once before destroy due to the play call)
            expect(animation.updateCount).toBe(0);
        });
    });

    describe('animation without optional callbacks', () => {
        it('should handle animation without onComplete', async () => {
            const animation: Animation = {
                update: () => true,
            };

            const playPromise = manager.play(animation);
            mockApp.ticker.tick(16.67);

            await expect(playPromise).resolves.toBeUndefined();
        });

        it('should handle animation without onCancel', async () => {
            const animation: Animation = {
                update: () => false,
            };

            const playPromise = manager.play(animation);
            expect(() => manager.cancel(animation)).not.toThrow();

            // Consume the rejection
            await expect(playPromise).rejects.toThrow('Animation cancelled');
        });
    });
});
