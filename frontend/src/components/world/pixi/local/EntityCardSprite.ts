/**
 * @file EntityCardSprite.ts
 * @description PIXI.Container subclass representing a character card on the local map.
 *
 * Based on the mockup, cards have:
 * - Colored border based on allegiance (gold/blue/gray/red)
 * - Portrait image
 * - Level badge (top-left, circular)
 * - Status badge (heart for bonded, skull for hostile)
 * - HP bar (only visible during combat)
 * - Drop shadow for floating effect
 *
 * Cards are larger than tiles (~1.5 tile width) for visibility.
 */

import * as PIXI from 'pixi.js';
import { LocalMapEntity, Allegiance, ALLEGIANCE_COLORS } from '../../../../types/localMap';
import { TextureCache } from '../../../combat/pixi/TextureCache';
import { CardAnimationController, CardSpriteInterface } from './CardAnimationController';

// Card dimensions - sized so cards "stand" in tiles with heads extending above
// Cards are wider than before, and positioned with feet at tile center
const CARD_WIDTH = 100;
const CARD_HEIGHT = 140;
// Portrait now fills the entire card (edge-to-edge minus border)
const PORTRAIT_WIDTH = CARD_WIDTH - 6; // 94px (3px border on each side)
const PORTRAIT_HEIGHT = CARD_HEIGHT - 6; // 134px (3px border top and bottom)
const BORDER_WIDTH = 3;
const BORDER_RADIUS = 8;

// Name overlay bar at bottom of card
const NAME_OVERLAY_HEIGHT = 28;

// Pivot Y offset - how far from top of card the pivot point is
// This makes the card "stand" with ~40px below tile center (feet) and rest above
const PIVOT_Y_OFFSET = CARD_HEIGHT - 40;

// Badge sizes (scaled proportionally)
const LEVEL_BADGE_RADIUS = 12;
const STATUS_BADGE_SIZE = 22;

// Hit area padding for better touch targets on mobile
const HIT_AREA_PADDING = 8;

// Font
const FONT_FAMILY = 'Poppins, system-ui, -apple-system, sans-serif';

// Text resolution multiplier for crisp text on high-DPI displays
// Using a minimum of 2 ensures text is never blurry even on 1x displays
const TEXT_RESOLUTION = Math.max(window.devicePixelRatio || 1, 2);

// HP Bar colors
const HP_BAR_BG = 0x450A0A;
const HP_BAR_FILL = 0xDC2626;
const HP_BAR_LOW = 0x7F1D1D;

export class EntityCardSprite extends PIXI.Container implements CardSpriteInterface {
    private entityId: string;
    private allegiance: Allegiance;

    // Visual layers
    private shadow!: PIXI.Graphics;
    private border!: PIXI.Graphics;
    private portraitSprite!: PIXI.Sprite;
    private portraitMask!: PIXI.Graphics;
    private gradientOverlay!: PIXI.Graphics;
    private levelBadge!: PIXI.Container;
    private levelText!: PIXI.Text;
    private statusBadge!: PIXI.Container | null;
    private nameText!: PIXI.Text;

    // HP bar (combat only)
    private hpBarContainer!: PIXI.Container;
    private hpBarBg!: PIXI.Graphics;
    private hpBarFill!: PIXI.Graphics;
    private hpText!: PIXI.Text;

    // Buff icons (combat only)
    private buffIconContainer!: PIXI.Container;

    // State
    private currentHp: number = 0;
    private maxHp: number = 0;

    // Animation controller - handles all animations
    private animationController: CardAnimationController;

    constructor(entity: LocalMapEntity) {
        super();

        this.entityId = entity.id;
        this.allegiance = entity.allegiance;
        this.currentHp = entity.currentHp ?? 100;
        this.maxHp = entity.maxHp ?? 100;

        // Enable interactivity
        // Use 'dynamic' because cards animate (bob, attack lunges, movement)
        // 'static' doesn't generate synthetic events for moving objects
        this.eventMode = 'dynamic';
        this.cursor = 'pointer';

        // Hit area must account for pivot offset
        // Pivot is at (CARD_WIDTH/2, PIVOT_Y_OFFSET) = (50, 100)
        // Visual bounds are drawn from (0,0) to (CARD_WIDTH, CARD_HEIGHT) in local drawing space
        // PixiJS hit testing transforms click coordinates by subtracting pivot, so the hit area
        // must be specified relative to the pivot point:
        //   X: 0 - 50 = -50 to 100 - 50 = 50
        //   Y: 0 - 100 = -100 to 140 - 100 = 40
        // Added HIT_AREA_PADDING on all sides for better touch targets
        this.hitArea = new PIXI.Rectangle(
            -CARD_WIDTH / 2 - HIT_AREA_PADDING,
            -PIVOT_Y_OFFSET - HIT_AREA_PADDING,
            CARD_WIDTH + HIT_AREA_PADDING * 2,
            CARD_HEIGHT + HIT_AREA_PADDING * 2
        );

        // Create visual layers (order matters)
        this.createShadow();
        this.createBorder();
        this.createPortrait(entity.imagePath);
        this.createGradientOverlay();
        this.createLevelBadge(entity.level);
        this.createStatusBadge(entity);
        this.createNamePlate(entity.name);
        this.createHPBar();
        this.createBuffIcons();

        // Position pivot near bottom so card "stands" in tile with head above
        this.pivot.set(CARD_WIDTH / 2, PIVOT_Y_OFFSET);

        // Initialize animation controller
        this.animationController = new CardAnimationController(this);

        // Setup hover effects
        this.on('pointerenter', this.onHoverStart.bind(this));
        this.on('pointerleave', this.onHoverEnd.bind(this));

        // Play entrance animation
        this.playEntranceAnimation();
    }

    /**
     * Get border graphics for animation controller to manipulate tint
     */
    getBorder(): PIXI.Graphics {
        return this.border;
    }

    /**
     * Hover start - enhance shadow for glow effect
     */
    private onHoverStart(): void {
        if (this.animationController.isAnimating()) return;
        this.shadow.alpha = 0.7;
    }

    /**
     * Hover end - return shadow to normal
     */
    private onHoverEnd(): void {
        if (this.animationController.isAnimating()) return;
        this.shadow.alpha = 0.5;
    }

    /**
     * Create drop shadow for floating effect
     */
    private createShadow(): void {
        this.shadow = new PIXI.Graphics();
        this.shadow.roundRect(4, 8, CARD_WIDTH, CARD_HEIGHT, BORDER_RADIUS);
        this.shadow.fill({ color: 0x000000, alpha: 0.5 });

        // Apply blur filter for soft shadow
        const blurFilter = new PIXI.BlurFilter();
        blurFilter.blur = 8;
        blurFilter.quality = 4;
        this.shadow.filters = [blurFilter];

        this.addChild(this.shadow);
    }

    /**
     * Create colored border based on allegiance
     */
    private createBorder(): void {
        this.border = new PIXI.Graphics();
        const colors = ALLEGIANCE_COLORS[this.allegiance];

        // Outer border (colored)
        this.border.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, BORDER_RADIUS);
        this.border.fill({ color: colors.frame, alpha: 1 });

        // Inner area (black background for portrait)
        this.border.roundRect(
            BORDER_WIDTH,
            BORDER_WIDTH,
            CARD_WIDTH - BORDER_WIDTH * 2,
            CARD_HEIGHT - BORDER_WIDTH * 2,
            BORDER_RADIUS - 2
        );
        this.border.fill({ color: 0x000000, alpha: 1 });

        this.addChild(this.border);
    }

    /**
     * Create portrait sprite with cover scaling - fills entire card (edge-to-edge)
     * Falls back to a colored placeholder with initials if no image
     */
    private createPortrait(imagePath: string | null): void {
        // Create mask for rounded corners first (needed for both cases)
        // Mask now covers entire inner card area for full-bleed image
        this.portraitMask = new PIXI.Graphics();
        this.portraitMask.roundRect(
            BORDER_WIDTH,
            BORDER_WIDTH,
            PORTRAIT_WIDTH,
            PORTRAIT_HEIGHT,
            BORDER_RADIUS - 2
        );
        this.portraitMask.fill({ color: 0xFFFFFF });
        this.addChild(this.portraitMask);

        if (imagePath) {
            // Load actual image
            const texture = TextureCache.get(imagePath);
            this.portraitSprite = new PIXI.Sprite(texture);

            // Cover scaling (fill entire card area, maintain aspect ratio)
            const textureWidth = texture.width || PORTRAIT_WIDTH;
            const textureHeight = texture.height || PORTRAIT_HEIGHT;

            const scaleX = PORTRAIT_WIDTH / textureWidth;
            const scaleY = PORTRAIT_HEIGHT / textureHeight;
            const scale = Math.max(scaleX, scaleY);

            this.portraitSprite.scale.set(scale);

            // Center within portrait area (which now fills the card)
            const scaledWidth = textureWidth * scale;
            const scaledHeight = textureHeight * scale;
            this.portraitSprite.x = BORDER_WIDTH + (PORTRAIT_WIDTH - scaledWidth) / 2;
            this.portraitSprite.y = BORDER_WIDTH + (PORTRAIT_HEIGHT - scaledHeight) / 2;

            this.portraitSprite.mask = this.portraitMask;
            this.addChild(this.portraitSprite);
        } else {
            // No image - create colored placeholder with gradient
            const colors = ALLEGIANCE_COLORS[this.allegiance];
            const placeholder = new PIXI.Graphics();

            // Dark background with subtle gradient effect
            placeholder.roundRect(
                BORDER_WIDTH,
                BORDER_WIDTH,
                PORTRAIT_WIDTH,
                PORTRAIT_HEIGHT,
                BORDER_RADIUS - 2
            );
            placeholder.fill({ color: 0x1a1a2e, alpha: 1 });

            // Add a subtle colored overlay based on allegiance
            placeholder.roundRect(
                BORDER_WIDTH,
                BORDER_WIDTH,
                PORTRAIT_WIDTH,
                PORTRAIT_HEIGHT,
                BORDER_RADIUS - 2
            );
            placeholder.fill({ color: colors.frame, alpha: 0.15 });

            this.addChild(placeholder);

            // Create a fallback sprite that won't be used but keeps the API consistent
            this.portraitSprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
            this.portraitSprite.visible = false;
            this.addChild(this.portraitSprite);
        }
    }

    /**
     * Create semi-transparent black overlay bar at bottom for name text
     * This sits on top of the full-bleed portrait image
     */
    private createGradientOverlay(): void {
        this.gradientOverlay = new PIXI.Graphics();

        // Semi-transparent black bar at bottom of card (over the portrait)
        // Position it at the very bottom of the inner card area
        const barY = CARD_HEIGHT - NAME_OVERLAY_HEIGHT - BORDER_WIDTH;
        const barHeight = NAME_OVERLAY_HEIGHT;

        // Use regular roundRect - the bottom corners will be visible,
        // top corners will blend into the portrait above
        // Use a smaller radius just for slight softening
        this.gradientOverlay.roundRect(
            BORDER_WIDTH,
            barY,
            PORTRAIT_WIDTH,
            barHeight,
            4
        );
        this.gradientOverlay.fill({ color: 0x000000, alpha: 0.75 });

        this.addChild(this.gradientOverlay);
    }

    /**
     * Create level badge (top-left circular badge)
     */
    private createLevelBadge(level: number): void {
        this.levelBadge = new PIXI.Container();
        this.levelBadge.x = 4;
        this.levelBadge.y = 4;

        const colors = ALLEGIANCE_COLORS[this.allegiance];

        // Badge background
        const bg = new PIXI.Graphics();
        bg.circle(LEVEL_BADGE_RADIUS, LEVEL_BADGE_RADIUS, LEVEL_BADGE_RADIUS);
        bg.fill({ color: colors.badge, alpha: 0.95 });
        this.levelBadge.addChild(bg);

        // Level text
        this.levelText = new PIXI.Text({
            text: level.toString(),
            style: {
                fontFamily: FONT_FAMILY,
                fontSize: 10,
                fontWeight: 'bold',
                fill: 0xFFFFFF,
            },
            resolution: TEXT_RESOLUTION,
        });
        this.levelText.anchor.set(0.5);
        this.levelText.x = LEVEL_BADGE_RADIUS;
        this.levelText.y = LEVEL_BADGE_RADIUS;
        this.levelBadge.addChild(this.levelText);

        this.addChild(this.levelBadge);
    }

    /**
     * Create status badge (heart for bonded, skull for hostile)
     */
    private createStatusBadge(entity: LocalMapEntity): void {
        this.statusBadge = null;

        let icon: string | null = null;
        let bgColor: number = 0x000000;

        if (entity.isBonded) {
            icon = '\u2764'; // Heart
            bgColor = 0xEC4899; // Pink
        } else if (entity.allegiance === 'hostile') {
            icon = '\u2620'; // Skull
            bgColor = 0xEF4444; // Red
        } else if (entity.isCaptured) {
            icon = '\uD83D\uDD12'; // Lock
            bgColor = 0x6B7280; // Gray
        }

        if (!icon) return;

        this.statusBadge = new PIXI.Container();
        this.statusBadge.x = CARD_WIDTH - STATUS_BADGE_SIZE - 4;
        this.statusBadge.y = 4;

        // Badge background
        const bg = new PIXI.Graphics();
        bg.circle(STATUS_BADGE_SIZE / 2, STATUS_BADGE_SIZE / 2, STATUS_BADGE_SIZE / 2);
        bg.fill({ color: bgColor, alpha: 0.95 });
        this.statusBadge.addChild(bg);

        // Icon
        const iconText = new PIXI.Text({
            text: icon,
            style: {
                fontFamily: FONT_FAMILY,
                fontSize: 11,
                fill: 0xFFFFFF,
            },
            resolution: TEXT_RESOLUTION,
        });
        iconText.anchor.set(0.5);
        iconText.x = STATUS_BADGE_SIZE / 2;
        iconText.y = STATUS_BADGE_SIZE / 2;
        this.statusBadge.addChild(iconText);

        this.addChild(this.statusBadge);
    }

    /**
     * Create name plate centered within the bottom overlay bar
     */
    private createNamePlate(name: string): void {
        const maxWidth = PORTRAIT_WIDTH - 8;

        this.nameText = new PIXI.Text({
            text: name,
            style: {
                fontFamily: FONT_FAMILY,
                fontSize: 10,
                fontWeight: 'bold',
                fill: 0xFFFFFF,
            },
            resolution: TEXT_RESOLUTION,
        });

        // Center horizontally and vertically within the overlay bar
        this.nameText.anchor.set(0.5, 0.5);
        this.nameText.x = CARD_WIDTH / 2;
        // Position at center of overlay bar (bar starts at CARD_HEIGHT - NAME_OVERLAY_HEIGHT - BORDER_WIDTH)
        const barY = CARD_HEIGHT - NAME_OVERLAY_HEIGHT - BORDER_WIDTH;
        this.nameText.y = barY + NAME_OVERLAY_HEIGHT / 2;

        // Truncate if too long
        if (this.nameText.width > maxWidth) {
            let truncated = name;
            while (this.nameText.width > maxWidth && truncated.length > 0) {
                truncated = truncated.slice(0, -1);
                this.nameText.text = truncated + '...';
            }
        }

        this.addChild(this.nameText);
    }

    /**
     * Create HP bar (hidden by default, shown during combat)
     * HP bar appears above the name overlay bar during combat
     */
    private createHPBar(): void {
        this.hpBarContainer = new PIXI.Container();
        this.hpBarContainer.visible = false;

        const barWidth = PORTRAIT_WIDTH - 8;
        const barHeight = 12;
        const barRadius = barHeight / 2;
        const barX = BORDER_WIDTH + 4;
        // Position above the name overlay bar
        const barY = CARD_HEIGHT - NAME_OVERLAY_HEIGHT - BORDER_WIDTH - barHeight - 4;

        // Background
        this.hpBarBg = new PIXI.Graphics();
        this.hpBarBg.roundRect(barX, barY, barWidth, barHeight, barRadius);
        this.hpBarBg.fill({ color: HP_BAR_BG, alpha: 1 });
        this.hpBarBg.stroke({ color: 0x7F1D1D, alpha: 0.8, width: 1 });
        this.hpBarContainer.addChild(this.hpBarBg);

        // Fill (will be updated)
        this.hpBarFill = new PIXI.Graphics();
        this.hpBarContainer.addChild(this.hpBarFill);

        // HP text
        this.hpText = new PIXI.Text({
            text: '',
            style: {
                fontFamily: FONT_FAMILY,
                fontSize: 7,
                fontWeight: 'bold',
                fill: 0xFFFFFF,
            },
            resolution: TEXT_RESOLUTION,
        });
        this.hpText.anchor.set(0.5);
        this.hpText.x = barX + barWidth / 2;
        this.hpText.y = barY + barHeight / 2;
        this.hpBarContainer.addChild(this.hpText);

        this.addChild(this.hpBarContainer);
        this.updateHPBar();
    }

    /**
     * Update HP bar fill based on current HP
     */
    private updateHPBar(): void {
        const barWidth = PORTRAIT_WIDTH - 8;
        const barHeight = 12;
        const barRadius = barHeight / 2;
        const barX = BORDER_WIDTH + 4;
        // Position above the name overlay bar (same as createHPBar)
        const barY = CARD_HEIGHT - NAME_OVERLAY_HEIGHT - BORDER_WIDTH - barHeight - 4;

        const hpPercent = Math.max(0, Math.min(1, this.currentHp / this.maxHp));
        const fillWidth = Math.max(0, barWidth * hpPercent);

        const fillColor = hpPercent < 0.3 ? HP_BAR_LOW : HP_BAR_FILL;

        this.hpBarFill.clear();
        if (fillWidth > barRadius * 2) {
            this.hpBarFill.roundRect(barX, barY, fillWidth, barHeight, barRadius);
            this.hpBarFill.fill({ color: fillColor, alpha: 1 });
        } else if (fillWidth > 0) {
            const smallRadius = Math.min(barRadius, fillWidth / 2);
            this.hpBarFill.roundRect(barX, barY, fillWidth, barHeight, smallRadius);
            this.hpBarFill.fill({ color: fillColor, alpha: 1 });
        }

        this.hpText.text = `HP ${Math.max(0, Math.floor(this.currentHp))}/${this.maxHp}`;
    }

    /**
     * Create buff icon container (positioned above the level badge area, top-right)
     */
    private createBuffIcons(): void {
        this.buffIconContainer = new PIXI.Container();
        // Position at top-right of card
        this.buffIconContainer.x = CARD_WIDTH - 4;
        this.buffIconContainer.y = 4;
        this.buffIconContainer.visible = false; // Hidden until buffs are set
        this.addChild(this.buffIconContainer);
    }

    /**
     * Update buff icons displayed on this card.
     * Shows small colored circles for each active buff type.
     *
     * @param buffs - Object with buff types and whether they're active
     */
    updateBuffIcons(buffs: {
        attack?: boolean;
        damage?: boolean;
        defense?: boolean;
    }): void {
        // Clear existing icons
        this.buffIconContainer.removeChildren();

        const activeBuffs: Array<{ color: number; label: string }> = [];
        if (buffs.attack) activeBuffs.push({ color: 0xFF6B35, label: 'ATK' });
        if (buffs.damage) activeBuffs.push({ color: 0xEF4444, label: 'DMG' });
        if (buffs.defense) activeBuffs.push({ color: 0x3B82F6, label: 'DEF' });

        if (activeBuffs.length === 0) {
            this.buffIconContainer.visible = false;
            return;
        }

        this.buffIconContainer.visible = true;
        const iconSize = 14;
        const gap = 2;

        activeBuffs.forEach((buff, i) => {
            const yPos = i * (iconSize + gap);

            // Background circle
            const bg = new PIXI.Graphics();
            bg.circle(0, 0, iconSize / 2);
            bg.fill({ color: buff.color, alpha: 0.9 });
            bg.stroke({ color: 0xFFFFFF, alpha: 0.6, width: 1 });
            bg.x = -(iconSize / 2) - 2;
            bg.y = yPos + iconSize / 2;
            this.buffIconContainer.addChild(bg);

            // Label text
            const label = new PIXI.Text({
                text: buff.label[0], // First letter: A, D, D
                style: {
                    fontFamily: FONT_FAMILY,
                    fontSize: 7,
                    fontWeight: 'bold',
                    fill: 0xFFFFFF,
                },
                resolution: TEXT_RESOLUTION,
            });
            label.anchor.set(0.5);
            label.x = bg.x;
            label.y = bg.y;
            this.buffIconContainer.addChild(label);
        });
    }

    /**
     * Show/hide HP bar (combat mode toggle)
     * With the new layout, name stays in the overlay bar and HP bar floats above it
     */
    setShowHpBar(show: boolean): void {
        this.hpBarContainer.visible = show;
        // Name position no longer needs adjustment - it stays in the overlay bar
    }

    /**
     * Update entity state
     */
    updateFromEntity(entity: LocalMapEntity): void {
        this.currentHp = entity.currentHp ?? this.currentHp;
        this.maxHp = entity.maxHp ?? this.maxHp;
        this.updateHPBar();

        // Update level
        this.levelText.text = entity.level.toString();

        // Update status badge (bonded status may have changed)
        this.updateStatusBadge(entity);
    }

    /**
     * Update status badge based on current entity state
     */
    private updateStatusBadge(entity: LocalMapEntity): void {
        // Remove existing badge
        if (this.statusBadge) {
            this.removeChild(this.statusBadge);
            this.statusBadge.destroy();
            this.statusBadge = null;
        }

        // Recreate if needed
        this.createStatusBadge(entity);
    }

    /**
     * Set highlight state for targeting
     */
    setHighlight(active: boolean): void {
        if (active) {
            this.border.tint = 0xFFFF00;
        } else {
            this.border.tint = 0xFFFFFF;
        }
    }

    /**
     * Get entity ID
     */
    getId(): string {
        return this.entityId;
    }

    /**
     * Get allegiance
     */
    getAllegiance(): Allegiance {
        return this.allegiance;
    }

    /**
     * Cleanup
     */
    destroy(options?: boolean | PIXI.DestroyOptions): void {
        // Destroy animation controller first (cancels all pending animations)
        this.animationController.destroy();

        if (this.portraitMask) {
            this.portraitMask.destroy();
        }
        super.destroy(options);
    }

    // =========================================================================
    // ANIMATION METHODS (delegated to CardAnimationController)
    // =========================================================================

    /**
     * Update idle bob animation (call from ticker)
     */
    updateBob(deltaTime: number): void {
        this.animationController.updateBob(deltaTime);
    }

    /**
     * Animate movement to target position with easing and hop
     */
    animateMoveTo(
        targetX: number,
        targetY: number,
        duration: number = 250,
        onComplete?: () => void
    ): void {
        this.animationController.playMoveTo(targetX, targetY, duration, onComplete);
    }

    /**
     * Check if currently animating movement
     */
    isAnimating(): boolean {
        return this.animationController.isAnimating();
    }

    /**
     * Animate an attack toward a target position (lunge and return)
     */
    animateAttack(
        targetX: number,
        targetY: number,
        onHit?: () => void,
        onComplete?: () => void
    ): void {
        this.animationController.playAttack(targetX, targetY, onHit, onComplete);
    }

    /**
     * Play damage flash effect (red tint flash)
     */
    playDamageFlash(): void {
        this.animationController.playDamageFlash();
    }

    /**
     * Play entrance pop-in animation
     */
    playEntranceAnimation(): void {
        this.animationController.playEntrance();
    }

    /**
     * Play death animation: shake violently, spawn red particles, fade out and disappear.
     * @param onComplete Called when animation finishes and card should be removed
     */
    playDeathAnimation(onComplete?: () => void): void {
        this.animationController.playDeath(onComplete);
    }

    /**
     * Play incapacitation animation: turn grey and topple onto side.
     * Card remains visible but non-interactive.
     * @param onComplete Called when animation finishes
     */
    playIncapacitationAnimation(onComplete?: () => void): void {
        this.animationController.playIncapacitation(onComplete);
    }

    /**
     * Check if entity is incapacitated (grey and toppled)
     */
    isIncapacitatedState(): boolean {
        return this.animationController.isIncapacitatedState();
    }

    /**
     * Reset from incapacitated state (for dev reset)
     */
    resetFromIncapacitation(): void {
        this.animationController.resetFromIncapacitation();
    }

    /**
     * Play revival animation: stand back up from incapacitated state with flourish.
     * Reverse of incapacitation - rotate back to upright, restore color, add glow effect.
     * @param onComplete Called when animation finishes
     */
    playRevivalAnimation(onComplete?: () => void): void {
        this.animationController.playRevival(onComplete);
    }
}
