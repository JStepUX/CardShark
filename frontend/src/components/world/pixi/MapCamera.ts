/**
 * @file MapCamera.ts
 * @description Camera controller for panning and zooming the world map.
 * 
 * Controls:
 * - Click-drag: Pan the map
 * - Scroll wheel: Zoom in/out (0.5x–2.0x range)
 * - Smooth easing for zoom transitions
 */

import * as PIXI from 'pixi.js';

// Zoom configuration
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_SPEED = 0.1;
const ZOOM_EASE_SPEED = 8; // Lerp speed

// Pan configuration
const PAN_EASE_SPEED = 12;

export class MapCamera {
    private target: PIXI.Container;
    private viewport: { width: number; height: number };
    private contentBounds: { width: number; height: number };

    // Camera state
    private targetZoom: number = 1.0;
    private currentZoom: number = 1.0;
    private targetX: number = 0;
    private targetY: number = 0;
    private currentX: number = 0;
    private currentY: number = 0;

    // Drag state
    private isDragging: boolean = false;
    private dragStartX: number = 0;
    private dragStartY: number = 0;
    private dragStartCamX: number = 0;
    private dragStartCamY: number = 0;

    // Input handlers (stored for cleanup)
    private onPointerDown: (e: PIXI.FederatedPointerEvent) => void;
    private onPointerMove: (e: PIXI.FederatedPointerEvent) => void;
    private onPointerUp: (e: PIXI.FederatedPointerEvent) => void;
    private onWheel: (e: WheelEvent) => void;

    constructor(
        target: PIXI.Container,
        viewport: { width: number; height: number },
        contentBounds: { width: number; height: number },
        canvas: HTMLCanvasElement
    ) {
        this.target = target;
        this.viewport = viewport;
        this.contentBounds = contentBounds;

        // Center the content initially
        this.targetX = (viewport.width - contentBounds.width) / 2;
        this.targetY = (viewport.height - contentBounds.height) / 2;
        this.currentX = this.targetX;
        this.currentY = this.targetY;

        // Bind event handlers
        this.onPointerDown = this.handlePointerDown.bind(this);
        this.onPointerMove = this.handlePointerMove.bind(this);
        this.onPointerUp = this.handlePointerUp.bind(this);
        this.onWheel = this.handleWheel.bind(this);

        // Attach drag events to target
        target.eventMode = 'static';
        target.on('pointerdown', this.onPointerDown);
        target.on('pointermove', this.onPointerMove);
        target.on('pointerup', this.onPointerUp);
        target.on('pointerupoutside', this.onPointerUp);

        // Attach wheel event to canvas
        canvas.addEventListener('wheel', this.onWheel, { passive: false });

        // Store canvas ref for cleanup
        (this as any)._canvas = canvas;
    }

    /**
     * Handle pointer down (start drag)
     */
    private handlePointerDown(e: PIXI.FederatedPointerEvent): void {
        this.isDragging = true;
        this.dragStartX = e.globalX;
        this.dragStartY = e.globalY;
        this.dragStartCamX = this.targetX;
        this.dragStartCamY = this.targetY;
    }

    /**
     * Handle pointer move (drag)
     */
    private handlePointerMove(e: PIXI.FederatedPointerEvent): void {
        if (!this.isDragging) return;

        const dx = e.globalX - this.dragStartX;
        const dy = e.globalY - this.dragStartY;

        this.targetX = this.dragStartCamX + dx;
        this.targetY = this.dragStartCamY + dy;

        this.clampPosition();
    }

    /**
     * Handle pointer up (end drag)
     */
    private handlePointerUp(_e: PIXI.FederatedPointerEvent): void {
        this.isDragging = false;
    }

    /**
     * Handle wheel (zoom)
     */
    private handleWheel(e: WheelEvent): void {
        e.preventDefault();

        // Calculate zoom direction
        const zoomDelta = e.deltaY < 0 ? ZOOM_SPEED : -ZOOM_SPEED;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.targetZoom + zoomDelta));

        if (newZoom === this.targetZoom) return;

        // Get mouse position relative to viewport
        const rect = (this as any)._canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Zoom toward mouse position
        const zoomFactor = newZoom / this.targetZoom;

        // Adjust position to zoom toward mouse
        this.targetX = mouseX - (mouseX - this.targetX) * zoomFactor;
        this.targetY = mouseY - (mouseY - this.targetY) * zoomFactor;

        this.targetZoom = newZoom;
        this.clampPosition();
    }

    /**
     * Clamp camera position to keep content visible
     */
    private clampPosition(): void {
        const scaledWidth = this.contentBounds.width * this.targetZoom;
        const scaledHeight = this.contentBounds.height * this.targetZoom;

        // Allow some margin for panning beyond edges
        const margin = 100;

        const minX = this.viewport.width - scaledWidth - margin;
        const maxX = margin;
        const minY = this.viewport.height - scaledHeight - margin;
        const maxY = margin;

        // If content is smaller than viewport, center it
        if (scaledWidth < this.viewport.width) {
            this.targetX = (this.viewport.width - scaledWidth) / 2;
        } else {
            this.targetX = Math.max(minX, Math.min(maxX, this.targetX));
        }

        if (scaledHeight < this.viewport.height) {
            this.targetY = (this.viewport.height - scaledHeight) / 2;
        } else {
            this.targetY = Math.max(minY, Math.min(maxY, this.targetY));
        }
    }

    /**
     * Update camera (call from ticker)
     */
    update(deltaTime: number): void {
        // Smooth zoom interpolation
        const zoomLerp = 1 - Math.exp(-ZOOM_EASE_SPEED * deltaTime);
        this.currentZoom += (this.targetZoom - this.currentZoom) * zoomLerp;

        // Smooth pan interpolation
        const panLerp = 1 - Math.exp(-PAN_EASE_SPEED * deltaTime);
        this.currentX += (this.targetX - this.currentX) * panLerp;
        this.currentY += (this.targetY - this.currentY) * panLerp;

        // Apply to target
        this.target.scale.set(this.currentZoom);
        this.target.x = this.currentX;
        this.target.y = this.currentY;
    }

    /**
     * Get current zoom level
     */
    getZoom(): number {
        return this.currentZoom;
    }

    /**
     * Set zoom level
     */
    setZoom(zoom: number): void {
        this.targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    }

    /**
     * Reset camera to center and default zoom
     */
    reset(): void {
        this.targetZoom = 1.0;
        this.targetX = (this.viewport.width - this.contentBounds.width) / 2;
        this.targetY = (this.viewport.height - this.contentBounds.height) / 2;
    }

    /**
     * Update viewport size (on resize)
     */
    setViewport(width: number, height: number): void {
        this.viewport = { width, height };
        this.clampPosition();
    }

    /**
     * Cleanup
     */
    destroy(): void {
        // Remove PIXI event listeners
        this.target.off('pointerdown', this.onPointerDown);
        this.target.off('pointermove', this.onPointerMove);
        this.target.off('pointerup', this.onPointerUp);
        this.target.off('pointerupoutside', this.onPointerUp);

        // Remove wheel listener
        const canvas = (this as any)._canvas;
        if (canvas) {
            canvas.removeEventListener('wheel', this.onWheel);
        }
    }
}
