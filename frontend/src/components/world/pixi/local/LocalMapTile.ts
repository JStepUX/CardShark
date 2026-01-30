/**
 * @file LocalMapTile.ts
 * @description PIXI.Container for a single tile on the local map grid.
 *
 * Tiles have:
 * - Subtle dashed border (like the mockup)
 * - Highlight overlay for different states (threat zone, valid move, etc.)
 * - Exit icon overlay when tile is an exit
 *
 * The background image shows through - tiles are mostly transparent.
 */

import * as PIXI from 'pixi.js';
import {
    TilePosition,
    TileHighlight,
    ExitDirection,
    HIGHLIGHT_COLORS,
} from '../../../../types/localMap';

// Tile dimensions
const BORDER_RADIUS = 4;

// Grid line colors
const GRID_LINE_COLOR = 0x4B5563; // gray-600
const GRID_LINE_ALPHA = 0.3;
const GRID_LINE_WIDTH = 1;

// Exit icon colors
const EXIT_ARROW_COLOR = 0xFFFFFF;
const EXIT_BG_COLOR = 0x3B82F6; // Blue-500
const EXIT_SHADOW_COLOR = 0x000000;
const EXIT_ICON_SIZE = 16;

export class LocalMapTile extends PIXI.Container {
    private tileSize: number;
    private tilePosition: TilePosition; // Renamed to avoid conflict with PIXI.Container.position

    // Visual layers
    private gridLines!: PIXI.Graphics;
    private highlightOverlay!: PIXI.Graphics;
    private exitIcon!: PIXI.Container | null;

    // State
    private currentHighlight: TileHighlight = 'none';
    private isExit: boolean = false;
    private exitDirection: ExitDirection | null = null;

    // Animation
    private pulseTime: number = 0;
    private isPulsing: boolean = false;
    private exitPulseTime: number = 0;

    // Grid line base opacity (can be reduced when background is present)
    private gridLineBaseAlpha: number = 1.0;

    // Hover state
    private hoverOverlay!: PIXI.Graphics;
    private isHovered: boolean = false;

    constructor(tilePos: TilePosition, tileSize: number) {
        super();

        this.tilePosition = tilePos;
        this.tileSize = tileSize;
        this.exitIcon = null;

        // Enable interactivity
        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.hitArea = new PIXI.Rectangle(0, 0, tileSize, tileSize);

        // Create visual layers
        this.createGridLines();
        this.createHighlightOverlay();
        this.createHoverOverlay();

        // Hover effects
        this.on('pointerover', this.onHoverStart.bind(this));
        this.on('pointerout', this.onHoverEnd.bind(this));
    }

    /**
     * Create subtle dashed grid lines
     */
    private createGridLines(): void {
        this.gridLines = new PIXI.Graphics();
        this.drawDashedBorder();
        this.addChild(this.gridLines);
    }

    /**
     * Draw dashed border around tile
     */
    private drawDashedBorder(): void {
        const g = this.gridLines;
        g.clear();

        const dashLength = 4;
        const gapLength = 3;
        const size = this.tileSize;

        const drawDashedLine = (
            startX: number, startY: number,
            endX: number, endY: number
        ) => {
            const dx = endX - startX;
            const dy = endY - startY;
            const length = Math.sqrt(dx * dx + dy * dy);
            const unitX = dx / length;
            const unitY = dy / length;

            let currentLength = 0;
            let drawing = true;

            while (currentLength < length) {
                const segmentLength = drawing ? dashLength : gapLength;
                const nextLength = Math.min(currentLength + segmentLength, length);

                if (drawing) {
                    const sx = startX + unitX * currentLength;
                    const sy = startY + unitY * currentLength;
                    const ex = startX + unitX * nextLength;
                    const ey = startY + unitY * nextLength;

                    g.moveTo(sx, sy);
                    g.lineTo(ex, ey);
                    g.stroke({
                        color: GRID_LINE_COLOR,
                        alpha: GRID_LINE_ALPHA,
                        width: GRID_LINE_WIDTH
                    });
                }

                currentLength = nextLength;
                drawing = !drawing;
            }
        };

        // Draw four sides
        drawDashedLine(0, 0, size, 0);           // Top
        drawDashedLine(size, 0, size, size);     // Right
        drawDashedLine(size, size, 0, size);     // Bottom
        drawDashedLine(0, size, 0, 0);           // Left
    }

    /**
     * Create highlight overlay (starts invisible)
     */
    private createHighlightOverlay(): void {
        this.highlightOverlay = new PIXI.Graphics();
        this.highlightOverlay.visible = false;
        this.addChild(this.highlightOverlay);
    }

    /**
     * Create hover overlay (subtle white border, starts invisible)
     */
    private createHoverOverlay(): void {
        this.hoverOverlay = new PIXI.Graphics();
        this.hoverOverlay.roundRect(2, 2, this.tileSize - 4, this.tileSize - 4, BORDER_RADIUS);
        this.hoverOverlay.stroke({ color: 0xFFFFFF, alpha: 0.4, width: 2 });
        this.hoverOverlay.visible = false;
        this.addChild(this.hoverOverlay);
    }

    /**
     * Set tile highlight state
     */
    setHighlight(highlight: TileHighlight): void {
        this.currentHighlight = highlight;

        if (highlight === 'none') {
            this.highlightOverlay.visible = false;
            this.isPulsing = false;
            return;
        }

        const colors = HIGHLIGHT_COLORS[highlight];

        this.highlightOverlay.clear();
        this.highlightOverlay.roundRect(1, 1, this.tileSize - 2, this.tileSize - 2, BORDER_RADIUS);
        this.highlightOverlay.fill({ color: colors.color, alpha: colors.alpha });

        // Add border for attack range
        if (highlight === 'attack_range') {
            this.highlightOverlay.roundRect(1, 1, this.tileSize - 2, this.tileSize - 2, BORDER_RADIUS);
            this.highlightOverlay.stroke({ color: colors.color, alpha: 0.8, width: 2 });
        }

        // Player position gets a glowing border
        if (highlight === 'player_position') {
            this.highlightOverlay.roundRect(1, 1, this.tileSize - 2, this.tileSize - 2, BORDER_RADIUS);
            this.highlightOverlay.stroke({ color: 0xFFD700, alpha: 0.9, width: 3 });
            this.isPulsing = true;
        }

        this.highlightOverlay.visible = true;
    }

    /**
     * Set this tile as an exit
     */
    setExit(direction: ExitDirection, destinationName: string): void {
        this.isExit = true;
        this.exitDirection = direction;

        // Remove existing exit icon
        if (this.exitIcon) {
            this.removeChild(this.exitIcon);
            this.exitIcon.destroy();
            this.exitIcon = null;
        }

        this.exitIcon = new PIXI.Container();
        const centerX = this.tileSize / 2;
        const centerY = this.tileSize / 2;

        // Set pivot to center so scale animation throbs from center
        this.exitIcon.pivot.set(centerX, centerY);
        this.exitIcon.position.set(centerX, centerY);

        // Shadow (offset slightly)
        const shadow = new PIXI.Graphics();
        shadow.circle(centerX + 2, centerY + 2, EXIT_ICON_SIZE);
        shadow.fill({ color: EXIT_SHADOW_COLOR, alpha: 0.4 });
        this.exitIcon.addChild(shadow);

        // Background circle - blue with lower opacity
        const bg = new PIXI.Graphics();
        bg.circle(centerX, centerY, EXIT_ICON_SIZE);
        bg.fill({ color: EXIT_BG_COLOR, alpha: 0.7 });
        this.exitIcon.addChild(bg);

        // Directional arrow
        const arrow = this.createArrow(direction);
        arrow.x = centerX;
        arrow.y = centerY;
        this.exitIcon.addChild(arrow);

        this.addChild(this.exitIcon);

        // Store destination for tooltip (future)
        this.exitIcon.name = destinationName;
    }

    /**
     * Create directional arrow
     */
    private createArrow(direction: ExitDirection): PIXI.Graphics {
        const arrow = new PIXI.Graphics();
        const size = 10;

        // Arrow pointing in direction
        arrow.moveTo(0, -size);
        arrow.lineTo(size * 0.6, size * 0.5);
        arrow.lineTo(-size * 0.6, size * 0.5);
        arrow.closePath();
        arrow.fill({ color: EXIT_ARROW_COLOR, alpha: 1 });

        // Rotate based on direction
        switch (direction) {
            case 'north':
                arrow.rotation = 0;
                break;
            case 'south':
                arrow.rotation = Math.PI;
                break;
            case 'east':
                arrow.rotation = Math.PI / 2;
                break;
            case 'west':
                arrow.rotation = -Math.PI / 2;
                break;
        }

        return arrow;
    }

    /**
     * Clear exit state
     */
    clearExit(): void {
        this.isExit = false;
        this.exitDirection = null;

        if (this.exitIcon) {
            this.removeChild(this.exitIcon);
            this.exitIcon.destroy();
            this.exitIcon = null;
        }
    }

    /**
     * Update pulse animation
     */
    updatePulse(deltaTime: number): void {
        // Pulse highlight overlay
        if (this.isPulsing && this.highlightOverlay.visible) {
            this.pulseTime += deltaTime * 2;
            const pulse = 0.3 + Math.sin(this.pulseTime) * 0.15; // 0.15 to 0.45
            this.highlightOverlay.alpha = pulse / HIGHLIGHT_COLORS[this.currentHighlight].alpha;
        }

        // Subtle throb for exit icons
        if (this.isExit && this.exitIcon) {
            this.exitPulseTime += deltaTime * 1.5; // Gentle speed
            const scale = 1.0 + Math.sin(this.exitPulseTime) * 0.06; // 0.94 to 1.06
            this.exitIcon.scale.set(scale);
        }
    }

    /**
     * Hover start
     */
    private onHoverStart(): void {
        this.isHovered = true;
        // Brighten grid lines on hover (relative to base)
        this.gridLines.alpha = Math.min(this.gridLineBaseAlpha * 2, 1.0);
        // Show hover overlay
        this.hoverOverlay.visible = true;
    }

    /**
     * Hover end
     */
    private onHoverEnd(): void {
        this.isHovered = false;
        this.gridLines.alpha = this.gridLineBaseAlpha;
        this.hoverOverlay.visible = false;
    }

    /**
     * Check if tile is hovered
     */
    getIsHovered(): boolean {
        return this.isHovered;
    }

    /**
     * Set grid line opacity (for reducing grid visibility when background is present)
     * This only affects the grid lines, not exit icons or highlights
     */
    setGridLineAlpha(alpha: number): void {
        this.gridLineBaseAlpha = alpha;
        if (!this.isHovered) {
            this.gridLines.alpha = alpha;
        }
    }

    /**
     * Get tile position
     */
    getPosition(): TilePosition {
        return this.tilePosition;
    }

    /**
     * Check if tile is an exit
     */
    getIsExit(): boolean {
        return this.isExit;
    }

    /**
     * Get exit direction
     */
    getExitDirection(): ExitDirection | null {
        return this.exitDirection;
    }

    /**
     * Cleanup
     */
    destroy(options?: boolean | PIXI.DestroyOptions): void {
        if (this.exitIcon) {
            this.exitIcon.destroy();
        }
        super.destroy(options);
    }
}
