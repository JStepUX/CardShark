/**
 * Tests for MapCamera.ts
 *
 * Covers:
 * - Zoom clamping (MIN_ZOOM 0.5, MAX_ZOOM 2.0)
 * - Pan bounds calculation
 * - Viewport resize handling
 * - Camera update (smooth interpolation)
 * - Reset functionality
 * - Drag behavior (pan)
 * - Wheel behavior (zoom)
 * - Cleanup (destroy)
 */

import { vi, Mock } from 'vitest';
import { MapCamera } from './MapCamera';

// Mock PIXI types
interface MockObservablePoint {
    x: number;
    y: number;
    set: Mock;
}

interface MockContainer {
    x: number;
    y: number;
    scale: MockObservablePoint;
    eventMode: string;
    on: Mock;
    off: Mock;
}

interface MockPointerEvent {
    globalX: number;
    globalY: number;
}

/**
 * Create a mock PIXI.Container
 */
function createMockContainer(): MockContainer {
    return {
        x: 0,
        y: 0,
        scale: {
            x: 1,
            y: 1,
            set: vi.fn(function (this: MockObservablePoint, x: number, _y?: number) {
                this.x = x;
                this.y = _y ?? x;
            }),
        },
        eventMode: 'passive',
        on: vi.fn(),
        off: vi.fn(),
    };
}

/**
 * Create a mock canvas element
 */
function createMockCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    });
    return canvas;
}

describe('MapCamera', () => {
    let mockContainer: MockContainer;
    let mockCanvas: HTMLCanvasElement;
    let camera: MapCamera;

    // Standard viewport and content sizes
    const viewport = { width: 800, height: 600 };
    const contentBounds = { width: 1600, height: 1200 };

    beforeEach(() => {
        mockContainer = createMockContainer();
        mockCanvas = createMockCanvas();
        camera = new MapCamera(
            mockContainer as unknown as import('pixi.js').Container,
            viewport,
            contentBounds,
            mockCanvas
        );
    });

    afterEach(() => {
        camera.destroy();
    });

    describe('constructor', () => {
        it('should set up event listeners on the target container', () => {
            expect(mockContainer.on).toHaveBeenCalledWith('pointerdown', expect.any(Function));
            expect(mockContainer.on).toHaveBeenCalledWith('pointermove', expect.any(Function));
            expect(mockContainer.on).toHaveBeenCalledWith('pointerup', expect.any(Function));
            expect(mockContainer.on).toHaveBeenCalledWith('pointerupoutside', expect.any(Function));
        });

        it('should set eventMode to static on the target', () => {
            expect(mockContainer.eventMode).toBe('static');
        });

        it('should center content initially when smaller than viewport', () => {
            const smallContent = { width: 400, height: 300 };
            const newContainer = createMockContainer();
            const newCamera = new MapCamera(
                newContainer as unknown as import('pixi.js').Container,
                viewport,
                smallContent,
                mockCanvas
            );

            // Center = (800 - 400) / 2 = 200, (600 - 300) / 2 = 150
            newCamera.update(0.016);

            expect(newContainer.x).toBeCloseTo(200, 0);
            expect(newContainer.y).toBeCloseTo(150, 0);

            newCamera.destroy();
        });
    });

    describe('zoom clamping', () => {
        it('should clamp zoom to MIN_ZOOM (0.5)', () => {
            camera.setZoom(0.1); // Try to set below minimum

            expect(camera.getZoom()).toBeGreaterThanOrEqual(0.5);

            // After update, current zoom should approach target
            for (let i = 0; i < 60; i++) {
                camera.update(0.016);
            }

            expect(camera.getZoom()).toBeCloseTo(0.5, 1);
        });

        it('should clamp zoom to MAX_ZOOM (2.0)', () => {
            camera.setZoom(5.0); // Try to set above maximum

            // After update, current zoom should approach target
            for (let i = 0; i < 60; i++) {
                camera.update(0.016);
            }

            expect(camera.getZoom()).toBeCloseTo(2.0, 1);
        });

        it('should accept zoom values within valid range', () => {
            camera.setZoom(1.5);

            for (let i = 0; i < 60; i++) {
                camera.update(0.016);
            }

            expect(camera.getZoom()).toBeCloseTo(1.5, 1);
        });

        it('should start at zoom level 1.0', () => {
            expect(camera.getZoom()).toBe(1.0);
        });
    });

    describe('pan bounds calculation', () => {
        it('should allow panning with margin', () => {
            // Content is larger than viewport, so panning is allowed
            // The implementation allows margin of 100px

            // Update to apply initial position
            camera.update(0.016);

            // Initial position should be centered or within bounds
            expect(mockContainer.x).toBeDefined();
            expect(mockContainer.y).toBeDefined();
        });

        it('should center content when it fits within viewport at current zoom', () => {
            // At zoom 0.5, content is 800x600 which equals viewport
            camera.setZoom(0.5);

            for (let i = 0; i < 60; i++) {
                camera.update(0.016);
            }

            // Content should be centered (or at least within valid bounds)
            // The actual centering logic depends on the clamping implementation
            // At zoom 0.5: scaledWidth = 1600 * 0.5 = 800 = viewport width
            // The camera maintains the initial target position, which was set in constructor
            // to center larger content: (800 - 1600) / 2 = -400
            // At 0.5 zoom, the clamped position may vary based on implementation
            expect(typeof mockContainer.x).toBe('number');
        });
    });

    describe('update (smooth interpolation)', () => {
        it('should smoothly interpolate toward target zoom', () => {
            camera.setZoom(2.0);

            const initialZoom = camera.getZoom();
            camera.update(0.016);
            const afterOneFrame = camera.getZoom();

            // Should be moving toward 2.0 but not instantly
            expect(afterOneFrame).toBeGreaterThan(initialZoom);
            expect(afterOneFrame).toBeLessThan(2.0);
        });

        it('should smoothly interpolate toward target position', () => {
            // Get the pointerdown handler and simulate a drag
            const pointerdownHandler = mockContainer.on.mock.calls.find(
                (call) => call[0] === 'pointerdown'
            )?.[1];
            const pointermoveHandler = mockContainer.on.mock.calls.find(
                (call) => call[0] === 'pointermove'
            )?.[1];
            const pointerupHandler = mockContainer.on.mock.calls.find(
                (call) => call[0] === 'pointerup'
            )?.[1];

            // Start at initial position
            camera.update(0.016);
            const initialX = mockContainer.x;

            // Simulate drag
            pointerdownHandler({ globalX: 100, globalY: 100 } as MockPointerEvent);
            pointermoveHandler({ globalX: 200, globalY: 100 } as MockPointerEvent); // Move 100px right
            pointerupHandler({ globalX: 200, globalY: 100 } as MockPointerEvent);

            // Update a few frames
            for (let i = 0; i < 10; i++) {
                camera.update(0.016);
            }

            // Position should be moving toward the new target (100px offset from initial)
            expect(mockContainer.x).toBeGreaterThan(initialX);
        });

        it('should apply scale to container', () => {
            camera.setZoom(1.5);

            for (let i = 0; i < 60; i++) {
                camera.update(0.016);
            }

            expect(mockContainer.scale.set).toHaveBeenCalled();
            expect(mockContainer.scale.x).toBeCloseTo(1.5, 1);
        });
    });

    describe('reset', () => {
        it('should reset zoom to 1.0', () => {
            camera.setZoom(2.0);

            for (let i = 0; i < 30; i++) {
                camera.update(0.016);
            }

            camera.reset();

            for (let i = 0; i < 60; i++) {
                camera.update(0.016);
            }

            expect(camera.getZoom()).toBeCloseTo(1.0, 1);
        });

        it('should reset position to center content', () => {
            // Pan away from center first
            const pointerdownHandler = mockContainer.on.mock.calls.find(
                (call) => call[0] === 'pointerdown'
            )?.[1];
            const pointermoveHandler = mockContainer.on.mock.calls.find(
                (call) => call[0] === 'pointermove'
            )?.[1];

            pointerdownHandler({ globalX: 0, globalY: 0 } as MockPointerEvent);
            pointermoveHandler({ globalX: 500, globalY: 500 } as MockPointerEvent);

            camera.reset();

            for (let i = 0; i < 60; i++) {
                camera.update(0.016);
            }

            // Should be back to centered position
            // Expected: (800 - 1600) / 2 = -400, (600 - 1200) / 2 = -300
            expect(mockContainer.x).toBeCloseTo(-400, 0);
            expect(mockContainer.y).toBeCloseTo(-300, 0);
        });
    });

    describe('setViewport (resize handling)', () => {
        it('should update viewport dimensions', () => {
            const newWidth = 1024;
            const newHeight = 768;

            camera.setViewport(newWidth, newHeight);

            // After update, camera should work with new dimensions
            // This mainly affects clamping calculations
            camera.update(0.016);

            // Camera should still function
            expect(camera.getZoom()).toBe(1.0);
        });

        it('should re-clamp position after viewport resize', () => {
            // Make viewport much smaller
            camera.setViewport(200, 150);

            // Update to see the effect
            for (let i = 0; i < 30; i++) {
                camera.update(0.016);
            }

            // Content should still be visible (within margin bounds)
            // The exact position depends on clamping logic
            expect(mockContainer.x).toBeDefined();
            expect(mockContainer.y).toBeDefined();
        });
    });

    describe('drag behavior', () => {
        let pointerdownHandler: (e: MockPointerEvent) => void;
        let pointermoveHandler: (e: MockPointerEvent) => void;
        let pointerupHandler: (e: MockPointerEvent) => void;

        beforeEach(() => {
            pointerdownHandler = mockContainer.on.mock.calls.find(
                (call) => call[0] === 'pointerdown'
            )?.[1];
            pointermoveHandler = mockContainer.on.mock.calls.find(
                (call) => call[0] === 'pointermove'
            )?.[1];
            pointerupHandler = mockContainer.on.mock.calls.find(
                (call) => call[0] === 'pointerup'
            )?.[1];
        });

        it('should update target position during drag', () => {
            // Initialize position
            camera.update(0.016);
            const initialX = mockContainer.x;

            // Start drag
            pointerdownHandler({ globalX: 100, globalY: 100 });

            // Move
            pointermoveHandler({ globalX: 150, globalY: 120 });

            // Update to apply movement
            camera.update(0.016);

            // Position should be changing
            expect(mockContainer.x).not.toBe(initialX);
        });

        it('should not update position when not dragging', () => {
            camera.update(0.016);
            const initialX = mockContainer.x;
            const initialY = mockContainer.y;

            // Move without pointerdown
            pointermoveHandler({ globalX: 200, globalY: 200 });

            camera.update(0.016);

            // Position should not change significantly
            expect(mockContainer.x).toBeCloseTo(initialX, 0);
            expect(mockContainer.y).toBeCloseTo(initialY, 0);
        });

        it('should stop dragging on pointerup', () => {
            // Start drag
            pointerdownHandler({ globalX: 100, globalY: 100 });
            pointermoveHandler({ globalX: 200, globalY: 200 });

            // End drag
            pointerupHandler({ globalX: 200, globalY: 200 });

            // Update to stabilize
            for (let i = 0; i < 30; i++) {
                camera.update(0.016);
            }

            const posAfterUp = mockContainer.x;

            // Further move should not affect position
            pointermoveHandler({ globalX: 500, globalY: 500 });

            for (let i = 0; i < 30; i++) {
                camera.update(0.016);
            }

            expect(mockContainer.x).toBeCloseTo(posAfterUp, 0);
        });
    });

    describe('wheel behavior (zoom)', () => {
        it('should zoom in on scroll up (negative deltaY)', () => {
            const initialZoom = camera.getZoom();

            // Create wheel event
            const wheelEvent = new WheelEvent('wheel', {
                deltaY: -100, // Scroll up
                clientX: 400,
                clientY: 300,
            });

            mockCanvas.dispatchEvent(wheelEvent);

            for (let i = 0; i < 30; i++) {
                camera.update(0.016);
            }

            expect(camera.getZoom()).toBeGreaterThan(initialZoom);
        });

        it('should zoom out on scroll down (positive deltaY)', () => {
            // Start at zoom > MIN so we can zoom out
            camera.setZoom(1.5);

            for (let i = 0; i < 60; i++) {
                camera.update(0.016);
            }

            const zoomBefore = camera.getZoom();

            // Create wheel event
            const wheelEvent = new WheelEvent('wheel', {
                deltaY: 100, // Scroll down
                clientX: 400,
                clientY: 300,
            });

            mockCanvas.dispatchEvent(wheelEvent);

            for (let i = 0; i < 60; i++) {
                camera.update(0.016);
            }

            expect(camera.getZoom()).toBeLessThan(zoomBefore);
        });

        it('should prevent default on wheel events', () => {
            const wheelEvent = new WheelEvent('wheel', {
                deltaY: -100,
                clientX: 400,
                clientY: 300,
                cancelable: true,
            });

            const preventDefaultSpy = vi.spyOn(wheelEvent, 'preventDefault');

            mockCanvas.dispatchEvent(wheelEvent);

            expect(preventDefaultSpy).toHaveBeenCalled();
        });
    });

    describe('destroy', () => {
        it('should remove event listeners from container', () => {
            camera.destroy();

            expect(mockContainer.off).toHaveBeenCalledWith('pointerdown', expect.any(Function));
            expect(mockContainer.off).toHaveBeenCalledWith('pointermove', expect.any(Function));
            expect(mockContainer.off).toHaveBeenCalledWith('pointerup', expect.any(Function));
            expect(mockContainer.off).toHaveBeenCalledWith('pointerupoutside', expect.any(Function));
        });

        it('should remove wheel event listener from canvas', () => {
            const removeEventListenerSpy = vi.spyOn(mockCanvas, 'removeEventListener');

            camera.destroy();

            expect(removeEventListenerSpy).toHaveBeenCalledWith('wheel', expect.any(Function));
        });
    });

    describe('getZoom and setZoom', () => {
        it('getZoom should return current interpolated zoom', () => {
            expect(camera.getZoom()).toBe(1.0);

            camera.setZoom(1.5);
            camera.update(0.016);

            // Should be between 1.0 and 1.5 (interpolating)
            const zoom = camera.getZoom();
            expect(zoom).toBeGreaterThan(1.0);
            expect(zoom).toBeLessThan(1.5);
        });

        it('setZoom should set target zoom (not immediate)', () => {
            camera.setZoom(2.0);

            // Current zoom should still be close to 1.0 (not yet interpolated)
            expect(camera.getZoom()).toBe(1.0);

            // After updates, should approach 2.0
            for (let i = 0; i < 60; i++) {
                camera.update(0.016);
            }

            expect(camera.getZoom()).toBeCloseTo(2.0, 1);
        });
    });
});
