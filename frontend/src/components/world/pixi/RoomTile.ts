/**
 * @file RoomTile.ts
 * @description PIXI.Container subclass representing a single room tile on the world map.
 * 
 * Visual layers (bottom to top):
 * 1. Background (Graphics) - semi-transparent with dashed border
 * 2. Room image (Sprite) - optional room thumbnail
 * 3. Gradient overlay (Graphics) - text readability
 * 4. Room name (Text) - centered at top
 * 5. NPC indicators (Container) - friendly/hostile counts
 * 6. Glow effect (Graphics) - for current room pulse
 */

import * as PIXI from 'pixi.js';
import { GridRoom } from '../../../types/worldGrid';
import { TextureCache } from '../../combat/pixi/TextureCache';
import { getCurrentFont } from '../../../utils/fontConfig';

// Tile dimensions (larger for better visibility)
const TILE_WIDTH = 140;
const TILE_HEIGHT = 140;
const BORDER_RADIUS = 6;

// Colors
const NORMAL_BG = 0x2a2a2a;
const NORMAL_BORDER = 0x4B5563; // gray-600
const CURRENT_BG = 0x1E3A8A; // blue-900
const CURRENT_BORDER = 0x3B82F6; // blue-500
const HOVER_BG = 0x3a3a3a;

// Font — read from CSS variable at construction time; updates on next tile creation
const FONT_FAMILY = getCurrentFont();
const NAME_FONT_SIZE = 13;
const NPC_FONT_SIZE = 11;

// Text resolution multiplier for crisp text on high-DPI displays
const TEXT_RESOLUTION = Math.max(window.devicePixelRatio || 1, 2);

export type RoomTileState = 'normal' | 'current' | 'highlighted' | 'disabled';

export class RoomTile extends PIXI.Container {
    private room: GridRoom;
    private state: RoomTileState = 'normal';

    // Visual layers
    private background!: PIXI.Graphics;
    private roomImageSprite?: PIXI.Sprite;
    private gradientOverlay!: PIXI.Graphics;
    private nameText!: PIXI.Text;
    private npcContainer!: PIXI.Container;
    private glowEffect!: PIXI.Graphics;

    // Animation state
    private pulseTime: number = 0;

    constructor(room: GridRoom) {
        super();

        this.room = room;

        // Enable interactivity
        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.hitArea = new PIXI.Rectangle(0, 0, TILE_WIDTH, TILE_HEIGHT);

        // Create visual layers
        this.background = this.createBackground();
        this.addChild(this.background);

        // Room image (if available)
        if (room.image_path) {
            this.roomImageSprite = this.createRoomImage(room.image_path);
            this.addChild(this.roomImageSprite);
        }

        this.gradientOverlay = this.createGradientOverlay();
        this.addChild(this.gradientOverlay);

        this.nameText = this.createNameText(room.name);
        this.addChild(this.nameText);

        this.npcContainer = this.createNPCIndicators();
        this.addChild(this.npcContainer);

        this.glowEffect = this.createGlowEffect();
        this.glowEffect.visible = false;
        this.addChild(this.glowEffect);

        // Set up hover effects
        this.on('pointerover', this.onHoverStart.bind(this));
        this.on('pointerout', this.onHoverEnd.bind(this));
    }

    /**
     * Create background with dashed border (layer 1)
     */
    private createBackground(): PIXI.Graphics {
        const bg = new PIXI.Graphics();
        this.updateBackground(bg, 'normal');
        return bg;
    }

    /**
     * Update background based on state
     */
    private updateBackground(bg: PIXI.Graphics, state: RoomTileState): void {
        bg.clear();

        const bgColor = state === 'current' ? CURRENT_BG : NORMAL_BG;
        const borderColor = state === 'current' ? CURRENT_BORDER : NORMAL_BORDER;
        const alpha = state === 'disabled' ? 0.3 : 0.6;

        // Semi-transparent background
        bg.roundRect(0, 0, TILE_WIDTH, TILE_HEIGHT, BORDER_RADIUS);
        bg.fill({ color: bgColor, alpha });

        // Dashed border
        this.drawDashedRect(bg, 0, 0, TILE_WIDTH, TILE_HEIGHT, BORDER_RADIUS, borderColor);
    }

    /**
     * Draw a dashed rounded rectangle border
     */
    private drawDashedRect(
        graphics: PIXI.Graphics,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
        color: number
    ): void {
        const dashLength = 6;
        const gapLength = 4;
        const lineWidth = 2;
        const alpha = 0.7;

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

                    graphics.moveTo(sx, sy);
                    graphics.lineTo(ex, ey);
                    graphics.stroke({ color, alpha, width: lineWidth });
                }

                currentLength = nextLength;
                drawing = !drawing;
            }
        };

        // Draw four sides
        drawDashedLine(x + radius, y, x + width - radius, y);
        drawDashedLine(x + width, y + radius, x + width, y + height - radius);
        drawDashedLine(x + width - radius, y + height, x + radius, y + height);
        drawDashedLine(x, y + height - radius, x, y + radius);

        // Draw corner arcs (solid for simplicity)
        const cornerAlpha = alpha * 0.7;
        graphics.arc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5);
        graphics.stroke({ color, alpha: cornerAlpha, width: lineWidth });
        graphics.arc(x + width - radius, y + radius, radius, Math.PI * 1.5, Math.PI * 2);
        graphics.stroke({ color, alpha: cornerAlpha, width: lineWidth });
        graphics.arc(x + width - radius, y + height - radius, radius, 0, Math.PI * 0.5);
        graphics.stroke({ color, alpha: cornerAlpha, width: lineWidth });
        graphics.arc(x + radius, y + height - radius, radius, Math.PI * 0.5, Math.PI);
        graphics.stroke({ color, alpha: cornerAlpha, width: lineWidth });
    }

    /**
     * Create room image sprite (layer 2)
     */
    private createRoomImage(imagePath: string): PIXI.Sprite {
        const texture = TextureCache.get(imagePath);
        const sprite = new PIXI.Sprite(texture);

        // Scale to cover tile area
        const textureWidth = texture.width || TILE_WIDTH;
        const textureHeight = texture.height || TILE_HEIGHT;

        const scaleX = TILE_WIDTH / textureWidth;
        const scaleY = TILE_HEIGHT / textureHeight;
        const scale = Math.max(scaleX, scaleY);

        sprite.scale.set(scale);

        // Center the image
        const scaledWidth = textureWidth * scale;
        const scaledHeight = textureHeight * scale;
        sprite.x = (TILE_WIDTH - scaledWidth) / 2;
        sprite.y = (TILE_HEIGHT - scaledHeight) / 2;

        // Create mask to clip to rounded area
        const mask = new PIXI.Graphics();
        mask.roundRect(0, 0, TILE_WIDTH, TILE_HEIGHT, BORDER_RADIUS);
        mask.fill({ color: 0xFFFFFF });
        this.addChild(mask);
        sprite.mask = mask;

        // Reduce opacity so text is readable
        sprite.alpha = 0.4;

        return sprite;
    }

    /**
     * Create gradient overlay for text readability (layer 3)
     */
    private createGradientOverlay(): PIXI.Graphics {
        const overlay = new PIXI.Graphics();

        // Top gradient for name (taller for larger tiles)
        overlay.roundRect(0, 0, TILE_WIDTH, 40, BORDER_RADIUS);
        overlay.fill({ color: 0x000000, alpha: 0.6 });

        // Bottom gradient for NPC indicators (taller for larger tiles)
        overlay.roundRect(0, TILE_HEIGHT - 32, TILE_WIDTH, 32, BORDER_RADIUS);
        overlay.fill({ color: 0x000000, alpha: 0.5 });

        return overlay;
    }

    /**
     * Create room name text (layer 4)
     */
    private createNameText(name: string): PIXI.Text {
        const text = new PIXI.Text({
            text: name,
            style: {
                fontFamily: FONT_FAMILY,
                fontSize: NAME_FONT_SIZE,
                fontWeight: '600',
                fill: 0xFFFFFF,
                wordWrap: true,
                wordWrapWidth: TILE_WIDTH - 12,
                align: 'center',
            },
            resolution: TEXT_RESOLUTION,
        });

        text.anchor.set(0.5, 0);
        text.x = TILE_WIDTH / 2;
        text.y = 6;

        // Truncate if too long
        if (text.height > 32) {
            let truncated = name;
            while (text.height > 32 && truncated.length > 0) {
                truncated = truncated.slice(0, -1);
                text.text = truncated + '...';
            }
        }

        return text;
    }

    /**
     * Create NPC indicators (layer 5)
     */
    private createNPCIndicators(): PIXI.Container {
        const container = new PIXI.Container();
        container.x = TILE_WIDTH / 2;
        container.y = TILE_HEIGHT - 20;

        const npcs = this.room.npcs || [];
        const friendlyCount = npcs.filter(npc => !npc.hostile).length;
        const hostileCount = npcs.filter(npc => npc.hostile).length;

        if (friendlyCount === 0 && hostileCount === 0) {
            return container;
        }

        // Create indicator badges
        const badges: PIXI.Container[] = [];

        if (friendlyCount > 0) {
            badges.push(this.createNPCBadge(friendlyCount, 0x3B82F6, '👥'));
        }

        if (hostileCount > 0) {
            badges.push(this.createNPCBadge(hostileCount, 0xEF4444, '⚔'));
        }

        // Layout badges horizontally (larger spacing)
        const totalWidth = badges.length * 32 + (badges.length - 1) * 6;
        let xOffset = -totalWidth / 2;

        badges.forEach(badge => {
            badge.x = xOffset;
            container.addChild(badge);
            xOffset += 38;
        });

        return container;
    }

    /**
     * Create a single NPC badge
     */
    private createNPCBadge(count: number, color: number, icon: string): PIXI.Container {
        const container = new PIXI.Container();

        // Background (larger for visibility)
        const bg = new PIXI.Graphics();
        bg.roundRect(0, 0, 32, 18, 9);
        bg.fill({ color, alpha: 0.8 });
        container.addChild(bg);

        // Icon + count text
        const text = new PIXI.Text({
            text: `${icon}${count}`,
            style: {
                fontFamily: FONT_FAMILY,
                fontSize: NPC_FONT_SIZE,
                fontWeight: 'bold',
                fill: 0xFFFFFF,
            },
            resolution: TEXT_RESOLUTION,
        });
        text.anchor.set(0.5);
        text.x = 16;
        text.y = 9;
        container.addChild(text);

        return container;
    }

    /**
     * Create glow effect for current room (layer 6)
     */
    private createGlowEffect(): PIXI.Graphics {
        const glow = new PIXI.Graphics();
        glow.roundRect(-2, -2, TILE_WIDTH + 4, TILE_HEIGHT + 4, BORDER_RADIUS + 2);
        glow.stroke({ color: CURRENT_BORDER, alpha: 0.8, width: 3 });
        return glow;
    }

    /**
     * Set tile state
     */
    setState(state: RoomTileState): void {
        this.state = state;
        this.updateBackground(this.background, state);

        // Show/hide glow for current room
        this.glowEffect.visible = state === 'current';

        // Disable interactivity for disabled state
        if (state === 'disabled') {
            this.eventMode = 'none';
            this.cursor = 'default';
            this.alpha = 0.5;
        } else {
            this.eventMode = 'static';
            this.cursor = 'pointer';
            this.alpha = 1.0;
        }
    }

    /**
     * Update pulse animation for current room
     * Call this from ticker
     */
    updatePulse(deltaTime: number): void {
        if (this.state !== 'current' || !this.glowEffect.visible) return;

        this.pulseTime += deltaTime * 2;
        const pulse = 0.6 + Math.sin(this.pulseTime) * 0.2; // 0.4 to 0.8
        this.glowEffect.alpha = pulse;
    }

    /**
     * Hover start handler
     */
    private onHoverStart(): void {
        if (this.state === 'disabled') return;

        // Scale up slightly
        this.scale.set(1.05);

        // Brighten background
        if (this.state === 'normal') {
            this.background.clear();
            this.background.roundRect(0, 0, TILE_WIDTH, TILE_HEIGHT, BORDER_RADIUS);
            this.background.fill({ color: HOVER_BG, alpha: 0.8 });
            this.drawDashedRect(this.background, 0, 0, TILE_WIDTH, TILE_HEIGHT, BORDER_RADIUS, 0x9CA3AF);
        }
    }

    /**
     * Hover end handler
     */
    private onHoverEnd(): void {
        if (this.state === 'disabled') return;

        // Reset scale
        this.scale.set(1.0);

        // Restore background
        this.updateBackground(this.background, this.state);
    }

    /**
     * Get room ID
     */
    getRoomId(): string {
        return this.room.id;
    }

    /**
     * Get room data
     */
    getRoom(): GridRoom {
        return this.room;
    }

    /**
     * Cleanup
     */
    destroy(options?: boolean | PIXI.DestroyOptions): void {
        super.destroy(options);
    }
}
