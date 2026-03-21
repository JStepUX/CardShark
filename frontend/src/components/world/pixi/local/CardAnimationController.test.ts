/**
 * Tests for CardAnimationController.ts
 *
 * Covers:
 * - Animation state machine transitions
 * - Animation state tracking
 * - Memory cleanup (pending frames/timeouts)
 * - Idle bob behavior
 * - Animation method availability
 * - Damage flash effect
 * - Reset from incapacitation
 * - Destroy cleanup
 *
 * Note: These tests focus on interface contracts and immediate state changes.
 * Testing full animation lifecycle would require controlling requestAnimationFrame,
 * which is complex in Jest. The AnimationManager tests cover ticker-based animation
 * orchestration more thoroughly.
 */

// Mock PIXI before importing
jest.mock('pixi.js', () => ({
    Container: class MockContainer {
        x = 0;
        y = 0;
        scale = { set: jest.fn(), x: 1, y: 1 };
        rotation = 0;
        alpha = 1;
        children: unknown[] = [];
        addChild = jest.fn();
        removeChild = jest.fn();
        destroy = jest.fn();
    },
    Graphics: jest.fn(() => ({
        x: 0,
        y: 0,
        alpha: 1,
        circle: jest.fn().mockReturnThis(),
        fill: jest.fn().mockReturnThis(),
        scale: { set: jest.fn() },
        destroy: jest.fn(),
    })),
    ObservablePoint: jest.fn(),
    EventMode: {},
}));

import * as PIXI from 'pixi.js';
import { CardAnimationController, CardSpriteInterface } from './CardAnimationController';

/**
 * Create a mock CardSpriteInterface
 */
function createMockSprite(): CardSpriteInterface & {
    addedChildren: unknown[];
    removedChildren: unknown[];
} {
    const addedChildren: unknown[] = [];
    const removedChildren: unknown[] = [];

    return {
        x: 0,
        y: 0,
        scale: {
            x: 1,
            y: 1,
            set: jest.fn(function (this: { x: number; y: number }, x: number, y?: number) {
                this.x = x;
                this.y = y ?? x;
            }),
        } as unknown as PIXI.ObservablePoint,
        pivot: {
            x: 0,
            y: 100, // PIVOT_Y_OFFSET default
            set: jest.fn(function (this: { x: number; y: number }, x: number, y: number) {
                this.x = x;
                this.y = y;
            }),
        } as unknown as PIXI.ObservablePoint,
        alpha: 1,
        rotation: 0,
        tint: 0xFFFFFF,
        visible: true,
        eventMode: 'dynamic',
        cursor: 'pointer',
        addedChildren,
        removedChildren,
        addChild(child: PIXI.Container) {
            addedChildren.push(child);
        },
        removeChild(child: PIXI.Container) {
            removedChildren.push(child);
        },
        getBorder: jest.fn(() => ({
            tint: 0xFFFFFF,
        })) as unknown as () => PIXI.Graphics,
    };
}

describe('CardAnimationController', () => {
    let mockSprite: ReturnType<typeof createMockSprite>;
    let controller: CardAnimationController;

    beforeEach(() => {
        jest.useFakeTimers();
        mockSprite = createMockSprite();
        controller = new CardAnimationController(mockSprite);
    });

    afterEach(() => {
        controller.destroy();
        jest.useRealTimers();
    });

    describe('initial state', () => {
        it('should start in idle state', () => {
            expect(controller.getState()).toBe('idle');
        });

        it('should not be animating initially', () => {
            expect(controller.isAnimating()).toBe(false);
        });

        it('should not be in incapacitated state initially', () => {
            expect(controller.isIncapacitatedState()).toBe(false);
        });
    });

    describe('idle bob', () => {
        it('should have setBobEnabled method', () => {
            expect(typeof controller.setBobEnabled).toBe('function');
        });

        it('should have updateBob method', () => {
            expect(typeof controller.updateBob).toBe('function');
        });

        it('should not throw when updateBob is called', () => {
            expect(() => controller.updateBob(0.016)).not.toThrow();
        });

        it('should not update pivot when bob is disabled', () => {
            controller.setBobEnabled(false);
            (mockSprite.pivot.set as jest.Mock).mockClear();

            controller.updateBob(0.016);

            expect(mockSprite.pivot.set).not.toHaveBeenCalled();
        });
    });

    describe('entrance animation', () => {
        it('should set state to entrance during animation', () => {
            controller.playEntrance();

            expect(controller.getState()).toBe('entrance');
        });

        it('should set scale to 0 at start', () => {
            controller.playEntrance();

            expect(mockSprite.scale.set).toHaveBeenCalledWith(0);
        });

        it('should set alpha to 0 at start', () => {
            controller.playEntrance();

            expect(mockSprite.alpha).toBe(0);
        });
    });

    describe('movement animation', () => {
        it('should set state to moving when started', () => {
            controller.playMoveTo(100, 100);

            expect(controller.getState()).toBe('moving');
        });

        it('should be animating during movement', () => {
            controller.playMoveTo(100, 100);

            expect(controller.isAnimating()).toBe(true);
        });

        it('should accept duration parameter', () => {
            expect(() => controller.playMoveTo(100, 100, 500)).not.toThrow();
        });

        it('should accept onComplete callback', () => {
            const onComplete = jest.fn();
            expect(() => controller.playMoveTo(100, 100, 250, onComplete)).not.toThrow();
        });
    });

    describe('attack animation', () => {
        it('should set state to attacking when started', () => {
            controller.playAttack(100, 100);

            expect(controller.getState()).toBe('attacking');
        });

        it('should accept onHit callback', () => {
            const onHit = jest.fn();
            expect(() => controller.playAttack(100, 100, onHit)).not.toThrow();
        });

        it('should accept onComplete callback', () => {
            const onComplete = jest.fn();
            expect(() => controller.playAttack(100, 100, undefined, onComplete)).not.toThrow();
        });
    });

    describe('damage flash', () => {
        it('should change border tint to red', () => {
            const mockBorder = { tint: 0xFFFFFF };
            (mockSprite.getBorder as jest.Mock).mockReturnValue(mockBorder);

            controller.playDamageFlash();

            expect(mockBorder.tint).toBe(0xFF4444);
        });

        it('should restore original tint after delay', () => {
            const mockBorder = { tint: 0xFFFFFF };
            (mockSprite.getBorder as jest.Mock).mockReturnValue(mockBorder);

            controller.playDamageFlash();

            expect(mockBorder.tint).toBe(0xFF4444);

            jest.advanceTimersByTime(200);

            expect(mockBorder.tint).toBe(0xFFFFFF);
        });

        it('should not restore tint if destroyed', () => {
            const mockBorder = { tint: 0xFFFFFF };
            (mockSprite.getBorder as jest.Mock).mockReturnValue(mockBorder);

            controller.playDamageFlash();
            controller.destroy();

            jest.advanceTimersByTime(200);

            // Tint should still be red because restore was cancelled
            expect(mockBorder.tint).toBe(0xFF4444);
        });
    });

    describe('death animation', () => {
        it('should set state to death when started', () => {
            controller.playDeath();

            expect(controller.getState()).toBe('death');
        });

        it('should disable interactivity immediately', () => {
            controller.playDeath();

            expect(mockSprite.eventMode).toBe('none');
            expect(mockSprite.cursor).toBe('default');
        });

        it('should accept onComplete callback', () => {
            const onComplete = jest.fn();
            expect(() => controller.playDeath(onComplete)).not.toThrow();
        });
    });

    describe('incapacitation animation', () => {
        it('should set state to incapacitation when started', () => {
            controller.playIncapacitation();

            expect(controller.getState()).toBe('incapacitation');
        });

        it('should disable interactivity immediately', () => {
            controller.playIncapacitation();

            expect(mockSprite.eventMode).toBe('none');
        });

        it('should accept onComplete callback', () => {
            const onComplete = jest.fn();
            expect(() => controller.playIncapacitation(onComplete)).not.toThrow();
        });
    });

    describe('revival animation', () => {
        it('should set state to revival when sprite is incapacitated', () => {
            // Set up incapacitated state
            mockSprite.rotation = Math.PI / 2;
            mockSprite.eventMode = 'none';

            controller.playRevival();

            expect(controller.getState()).toBe('revival');
        });

        it('should return immediately if not incapacitated', () => {
            // Sprite starts in normal state (rotation=0, eventMode='dynamic')
            controller.playRevival();

            // Should stay in idle because early return was triggered
            expect(controller.getState()).toBe('idle');
        });

        it('should accept onComplete callback', () => {
            const onComplete = jest.fn();
            expect(() => controller.playRevival(onComplete)).not.toThrow();
        });

        it('should call onComplete immediately if not incapacitated', () => {
            const onComplete = jest.fn();
            controller.playRevival(onComplete);

            // Should be called immediately since sprite is not incapacitated
            expect(onComplete).toHaveBeenCalled();
        });
    });

    describe('resetFromIncapacitation', () => {
        it('should immediately reset rotation', () => {
            mockSprite.rotation = Math.PI / 2;

            controller.resetFromIncapacitation();

            expect(mockSprite.rotation).toBe(0);
        });

        it('should immediately restore tint to white', () => {
            mockSprite.tint = 0x666666;

            controller.resetFromIncapacitation();

            expect(mockSprite.tint).toBe(0xFFFFFF);
        });

        it('should immediately restore full alpha', () => {
            mockSprite.alpha = 0.7;

            controller.resetFromIncapacitation();

            expect(mockSprite.alpha).toBe(1);
        });

        it('should restore interactivity', () => {
            mockSprite.eventMode = 'none';
            mockSprite.cursor = 'default';

            controller.resetFromIncapacitation();

            expect(mockSprite.eventMode).toBe('dynamic');
            expect(mockSprite.cursor).toBe('pointer');
        });

        it('should return to idle state', () => {
            controller.playIncapacitation();

            controller.resetFromIncapacitation();

            expect(controller.getState()).toBe('idle');
        });
    });

    describe('isIncapacitatedState', () => {
        it('should return false initially', () => {
            expect(controller.isIncapacitatedState()).toBe(false);
        });

        it('should return true when sprite is rotated and non-interactive', () => {
            mockSprite.rotation = Math.PI / 2;
            mockSprite.eventMode = 'none';

            expect(controller.isIncapacitatedState()).toBe(true);
        });

        it('should return false when rotation is 0', () => {
            mockSprite.rotation = 0;
            mockSprite.eventMode = 'none';

            expect(controller.isIncapacitatedState()).toBe(false);
        });

        it('should return false when interactive', () => {
            mockSprite.rotation = Math.PI / 2;
            mockSprite.eventMode = 'dynamic';

            expect(controller.isIncapacitatedState()).toBe(false);
        });
    });

    describe('destroy', () => {
        it('should clear pending timeouts', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

            controller.playDamageFlash();
            controller.destroy();

            expect(clearTimeoutSpy).toHaveBeenCalled();

            clearTimeoutSpy.mockRestore();
        });

        it('should not throw when called multiple times', () => {
            controller.destroy();

            expect(() => controller.destroy()).not.toThrow();
        });

        it('should not throw when destroying during animation', () => {
            controller.playMoveTo(100, 100);

            expect(() => controller.destroy()).not.toThrow();
        });

        it('should prevent damage flash restore after destroy', () => {
            const mockBorder = { tint: 0xFFFFFF };
            (mockSprite.getBorder as jest.Mock).mockReturnValue(mockBorder);

            controller.playDamageFlash();
            expect(mockBorder.tint).toBe(0xFF4444);

            controller.destroy();
            jest.advanceTimersByTime(200);

            // Should still be red - restore callback should have been cancelled
            expect(mockBorder.tint).toBe(0xFF4444);
        });
    });

    describe('animation state transitions', () => {
        it('should transition from idle to moving', () => {
            expect(controller.getState()).toBe('idle');

            controller.playMoveTo(100, 100);

            expect(controller.getState()).toBe('moving');
        });

        it('should transition from idle to attacking', () => {
            expect(controller.getState()).toBe('idle');

            controller.playAttack(100, 100);

            expect(controller.getState()).toBe('attacking');
        });

        it('should transition from idle to entrance', () => {
            expect(controller.getState()).toBe('idle');

            controller.playEntrance();

            expect(controller.getState()).toBe('entrance');
        });

        it('should transition from idle to death', () => {
            expect(controller.getState()).toBe('idle');

            controller.playDeath();

            expect(controller.getState()).toBe('death');
        });

        it('should transition from idle to incapacitation', () => {
            expect(controller.getState()).toBe('idle');

            controller.playIncapacitation();

            expect(controller.getState()).toBe('incapacitation');
        });

        it('should transition from incapacitation to revival', () => {
            controller.playIncapacitation();
            expect(controller.getState()).toBe('incapacitation');

            controller.playRevival();

            expect(controller.getState()).toBe('revival');
        });
    });
});
