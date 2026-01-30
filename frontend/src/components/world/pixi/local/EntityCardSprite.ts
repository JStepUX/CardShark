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

// Font
const FONT_FAMILY = 'Poppins, system-ui, -apple-system, sans-serif';

// Text resolution multiplier for crisp text on high-DPI displays
// Using a minimum of 2 ensures text is never blurry even on 1x displays
const TEXT_RESOLUTION = Math.max(window.devicePixelRatio || 1, 2);

// HP Bar colors
const HP_BAR_BG = 0x450A0A;
const HP_BAR_FILL = 0xDC2626;
const HP_BAR_LOW = 0x7F1D1D;

export class EntityCardSprite extends PIXI.Container {
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

    // State
    private currentHp: number = 0;
    private maxHp: number = 0;

    // Animation state
    private bobTime: number = Math.random() * Math.PI * 2; // Random start phase for variety
    private bobEnabled: boolean = true;
    private isMoving: boolean = false;
    private moveAnimationId: number | null = null;

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

        // Hit area relative to pivot point (pivot is near bottom of card)
        this.hitArea = new PIXI.Rectangle(-CARD_WIDTH / 2, -PIVOT_Y_OFFSET, CARD_WIDTH, CARD_HEIGHT);

        // Create visual layers (order matters)
        this.createShadow();
        this.createBorder();
        this.createPortrait(entity.imagePath);
        this.createGradientOverlay();
        this.createLevelBadge(entity.level);
        this.createStatusBadge(entity);
        this.createNamePlate(entity.name);
        this.createHPBar();

        // Position pivot near bottom so card "stands" in tile with head above
        this.pivot.set(CARD_WIDTH / 2, PIVOT_Y_OFFSET);

        // Setup hover effects
        this.on('pointerenter', this.onHoverStart.bind(this));
        this.on('pointerleave', this.onHoverEnd.bind(this));

        // Play entrance animation
        this.playEntranceAnimation();
    }

    /**
     * Hover start - scale up and add glow effect
     */
    private onHoverStart(): void {
        if (this.isMoving) return;
        this.scale.set(1.08);
        this.shadow.alpha = 0.7;
    }

    /**
     * Hover end - return to normal
     */
    private onHoverEnd(): void {
        if (this.isMoving) return;
        this.scale.set(1.0);
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
            this.scale.set(1.05);
        } else {
            this.border.tint = 0xFFFFFF;
            this.scale.set(1.0);
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
        // Cancel any running movement animation
        if (this.moveAnimationId !== null) {
            cancelAnimationFrame(this.moveAnimationId);
            this.moveAnimationId = null;
        }
        if (this.portraitMask) {
            this.portraitMask.destroy();
        }
        super.destroy(options);
    }

    /**
     * Update idle bob animation (call from ticker)
     */
    updateBob(deltaTime: number): void {
        if (!this.bobEnabled || this.isMoving) return;

        this.bobTime += deltaTime * 2;
        const bob = Math.sin(this.bobTime) * 2; // 2px bob range
        this.pivot.y = PIVOT_Y_OFFSET - bob;
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
        // Cancel any existing movement animation
        if (this.moveAnimationId !== null) {
            cancelAnimationFrame(this.moveAnimationId);
        }

        this.isMoving = true;
        this.bobEnabled = false; // Pause bob during movement

        // Reset pivot to neutral position to ensure animation starts from visual position
        this.pivot.y = PIVOT_Y_OFFSET;

        const startX = this.x;
        const startY = this.y;
        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic for smooth deceleration
            const eased = 1 - Math.pow(1 - progress, 3);

            // Calculate base position
            this.x = startX + (targetX - startX) * eased;
            const baseYPos = startY + (targetY - startY) * eased;

            // Add hop effect (parabolic arc)
            const hopHeight = Math.sin(progress * Math.PI) * 8;
            this.y = baseYPos - hopHeight;

            if (progress < 1) {
                this.moveAnimationId = requestAnimationFrame(animate);
            } else {
                // Animation complete
                this.x = targetX;
                this.y = targetY;
                this.isMoving = false;
                this.bobEnabled = true;
                this.moveAnimationId = null;
                onComplete?.();
            }
        };

        this.moveAnimationId = requestAnimationFrame(animate);
    }

    /**
     * Check if currently animating movement
     */
    isAnimating(): boolean {
        return this.isMoving;
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
        // Cancel any existing movement animation
        if (this.moveAnimationId !== null) {
            cancelAnimationFrame(this.moveAnimationId);
        }

        this.isMoving = true;
        this.bobEnabled = false;

        const startX = this.x;
        const startY = this.y;

        // Calculate direction to target
        const dx = targetX - startX;
        const dy = targetY - startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const normalizedDx = dist > 0 ? dx / dist : 0;
        const normalizedDy = dist > 0 ? dy / dist : 0;

        // Lunge distance (move partway toward target)
        const lungeDistance = Math.min(dist * 0.6, 60);
        const lungeX = startX + normalizedDx * lungeDistance;
        const lungeY = startY + normalizedDy * lungeDistance;

        const lungeDuration = 150;
        const returnDuration = 200;
        const startTime = performance.now();

        let phase: 'lunge' | 'return' = 'lunge';
        let phaseStartTime = startTime;

        const animate = (currentTime: number) => {
            const elapsed = currentTime - phaseStartTime;

            if (phase === 'lunge') {
                const progress = Math.min(elapsed / lungeDuration, 1);
                // Ease out for fast lunge
                const eased = 1 - Math.pow(1 - progress, 2);

                this.x = startX + (lungeX - startX) * eased;
                this.y = startY + (lungeY - startY) * eased;

                if (progress >= 1) {
                    // Hit moment - trigger callback
                    onHit?.();
                    phase = 'return';
                    phaseStartTime = currentTime;
                    this.moveAnimationId = requestAnimationFrame(animate);
                } else {
                    this.moveAnimationId = requestAnimationFrame(animate);
                }
            } else if (phase === 'return') {
                const progress = Math.min(elapsed / returnDuration, 1);
                // Ease in-out for return
                const eased = progress < 0.5
                    ? 2 * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;

                this.x = lungeX + (startX - lungeX) * eased;
                this.y = lungeY + (startY - lungeY) * eased;

                if (progress >= 1) {
                    this.x = startX;
                    this.y = startY;
                    this.isMoving = false;
                    this.bobEnabled = true;
                    this.moveAnimationId = null;
                    onComplete?.();
                } else {
                    this.moveAnimationId = requestAnimationFrame(animate);
                }
            }
        };

        this.moveAnimationId = requestAnimationFrame(animate);
    }

    /**
     * Play damage flash effect (red tint flash)
     */
    playDamageFlash(): void {
        const originalTint = this.border.tint;
        this.border.tint = 0xFF4444;

        setTimeout(() => {
            this.border.tint = originalTint;
        }, 150);
    }

    /**
     * Play entrance pop-in animation
     */
    playEntranceAnimation(): void {
        this.scale.set(0);
        this.alpha = 0;

        const duration = 300;
        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out back for bounce overshoot
            const overshoot = 1.5;
            const eased = 1 - Math.pow(1 - progress, 2) * (1 + overshoot * (1 - progress));

            this.scale.set(Math.max(0, Math.min(eased, 1.05)));
            this.alpha = Math.min(progress * 1.5, 1);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.scale.set(1);
                this.alpha = 1;
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Play death animation: shake violently, spawn red particles, fade out and disappear.
     * @param onComplete Called when animation finishes and card should be removed
     */
    playDeathAnimation(onComplete?: () => void): void {
        // Disable interactivity immediately
        this.eventMode = 'none';
        this.cursor = 'default';
        this.bobEnabled = false;

        const shakeDuration = 400;
        const fadeDuration = 300;
        const startTime = performance.now();
        const startX = this.x;
        const startY = this.y;

        // Phase 1: Violent shaking with red tint
        const shakePhase = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / shakeDuration, 1);

            // Intense shake that decreases over time
            const intensity = (1 - progress) * 8;
            const shakeX = (Math.random() - 0.5) * 2 * intensity;
            const shakeY = (Math.random() - 0.5) * 2 * intensity;
            this.x = startX + shakeX;
            this.y = startY + shakeY;

            // Flash red tint
            const flashIntensity = Math.sin(elapsed * 0.03) * 0.5 + 0.5;
            this.border.tint = this.lerpColor(0xFFFFFF, 0xFF0000, flashIntensity);

            if (progress < 1) {
                requestAnimationFrame(shakePhase);
            } else {
                // Reset position before fade
                this.x = startX;
                this.y = startY;
                this.border.tint = 0xFF0000;

                // Spawn particle effect
                this.spawnDeathParticles();

                // Start fade phase
                requestAnimationFrame(fadePhase.bind(this, performance.now()));
            }
        };

        // Phase 2: Fade out
        const fadePhase = (fadeStartTime: number, currentTime: number) => {
            const elapsed = currentTime - fadeStartTime;
            const progress = Math.min(elapsed / fadeDuration, 1);

            // Fade out and shrink slightly
            this.alpha = 1 - progress;
            this.scale.set(1 - progress * 0.3);

            if (progress < 1) {
                requestAnimationFrame(fadePhase.bind(this, fadeStartTime));
            } else {
                this.visible = false;
                onComplete?.();
            }
        };

        requestAnimationFrame(shakePhase);
    }

    /**
     * Spawn red particle effect for death animation
     */
    private spawnDeathParticles(): void {
        // Create particles as a child container
        const particleCount = 12;

        for (let i = 0; i < particleCount; i++) {
            const particle = new PIXI.Graphics();
            const size = 3 + Math.random() * 5;
            particle.circle(0, 0, size);
            particle.fill({ color: 0xFF0000, alpha: 0.8 + Math.random() * 0.2 });

            // Position at center of card
            particle.x = CARD_WIDTH / 2;
            particle.y = CARD_HEIGHT / 2;
            this.addChild(particle);

            // Random velocity
            const angle = (i / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const speed = 40 + Math.random() * 60;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;

            // Animate particle
            const startTime = performance.now();
            const duration = 400 + Math.random() * 200;

            const animateParticle = (currentTime: number) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Move outward with deceleration
                const eased = 1 - Math.pow(1 - progress, 2);
                particle.x = CARD_WIDTH / 2 + vx * eased;
                particle.y = CARD_HEIGHT / 2 + vy * eased;

                // Fade and shrink
                particle.alpha = (1 - progress) * 0.8;
                particle.scale.set(1 - progress * 0.5);

                if (progress < 1) {
                    requestAnimationFrame(animateParticle);
                } else {
                    this.removeChild(particle);
                    particle.destroy();
                }
            };

            requestAnimationFrame(animateParticle);
        }
    }

    /**
     * Helper to interpolate between two colors
     */
    private lerpColor(color1: number, color2: number, t: number): number {
        const r1 = (color1 >> 16) & 0xFF;
        const g1 = (color1 >> 8) & 0xFF;
        const b1 = color1 & 0xFF;

        const r2 = (color2 >> 16) & 0xFF;
        const g2 = (color2 >> 8) & 0xFF;
        const b2 = color2 & 0xFF;

        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);

        return (r << 16) | (g << 8) | b;
    }

    /**
     * Play incapacitation animation: turn grey and topple onto side.
     * Card remains visible but non-interactive.
     * @param onComplete Called when animation finishes
     */
    playIncapacitationAnimation(onComplete?: () => void): void {
        // Disable interactivity immediately
        this.eventMode = 'none';
        this.cursor = 'default';
        this.bobEnabled = false;

        const duration = 600;
        const startTime = performance.now();
        const targetRotation = Math.PI / 2; // 90 degrees

        // Apply greyscale effect using tint (approximation)
        // True greyscale would need a filter, but tinting to gray is simpler

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out bounce for toppling effect
            const eased = this.easeOutBounce(progress);

            // Rotate to lie on side (90 degrees)
            this.rotation = targetRotation * eased;

            // Gradually desaturate by tinting toward grey
            // Start: white tint (0xFFFFFF), End: grey tint (0x666666)
            const greyProgress = Math.min(progress * 1.5, 1); // Faster grey transition
            this.tint = this.lerpColor(0xFFFFFF, 0x666666, greyProgress);

            // Slight drop as it falls
            this.pivot.y = PIVOT_Y_OFFSET + progress * 20;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Final state: grey, rotated, non-interactive
                this.rotation = targetRotation;
                this.tint = 0x666666;
                this.alpha = 0.7; // Slightly transparent to indicate "out of action"
                onComplete?.();
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Ease out bounce function for natural falling effect
     */
    private easeOutBounce(x: number): number {
        const n1 = 7.5625;
        const d1 = 2.75;

        if (x < 1 / d1) {
            return n1 * x * x;
        } else if (x < 2 / d1) {
            return n1 * (x -= 1.5 / d1) * x + 0.75;
        } else if (x < 2.5 / d1) {
            return n1 * (x -= 2.25 / d1) * x + 0.9375;
        } else {
            return n1 * (x -= 2.625 / d1) * x + 0.984375;
        }
    }

    /**
     * Check if entity is incapacitated (grey and toppled)
     */
    isIncapacitatedState(): boolean {
        return this.rotation !== 0 && this.eventMode === 'none';
    }

    /**
     * Reset from incapacitated state (for dev reset)
     */
    resetFromIncapacitation(): void {
        this.rotation = 0;
        this.tint = 0xFFFFFF;
        this.alpha = 1;
        this.pivot.y = PIVOT_Y_OFFSET;
        this.eventMode = 'dynamic';
        this.cursor = 'pointer';
        this.bobEnabled = true;
    }

    /**
     * Play revival animation: stand back up from incapacitated state with flourish.
     * Reverse of incapacitation - rotate back to upright, restore color, add glow effect.
     * @param onComplete Called when animation finishes
     */
    playRevivalAnimation(onComplete?: () => void): void {
        // If not incapacitated, just complete immediately
        if (this.rotation === 0 && this.eventMode !== 'none') {
            onComplete?.();
            return;
        }

        const duration = 800;
        const startTime = performance.now();
        const startRotation = this.rotation;
        const startAlpha = this.alpha;
        const startPivotY = this.pivot.y;

        // Create golden glow particles for revival effect
        this.spawnRevivalParticles();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out elastic for dramatic standing up
            const eased = this.easeOutElastic(progress);

            // Rotate back to upright (from 90 degrees to 0)
            this.rotation = startRotation * (1 - eased);

            // Restore color from grey to white with golden flash at peak
            if (progress < 0.5) {
                // First half: grey to gold
                this.tint = this.lerpColor(0x666666, 0xFFD700, progress * 2);
            } else {
                // Second half: gold to white
                this.tint = this.lerpColor(0xFFD700, 0xFFFFFF, (progress - 0.5) * 2);
            }

            // Restore alpha
            this.alpha = startAlpha + (1 - startAlpha) * eased;

            // Restore pivot
            this.pivot.y = startPivotY + (PIVOT_Y_OFFSET - startPivotY) * eased;

            // Add a slight scale bounce at the end
            if (progress > 0.7) {
                const bounceProgress = (progress - 0.7) / 0.3;
                const bounce = Math.sin(bounceProgress * Math.PI) * 0.1;
                this.scale.set(1 + bounce);
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Final state: fully restored
                this.rotation = 0;
                this.tint = 0xFFFFFF;
                this.alpha = 1;
                this.pivot.y = PIVOT_Y_OFFSET;
                this.scale.set(1);
                this.eventMode = 'dynamic';
                this.cursor = 'pointer';
                this.bobEnabled = true;
                onComplete?.();
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Spawn golden particle effect for revival animation
     */
    private spawnRevivalParticles(): void {
        const particleCount = 16;

        for (let i = 0; i < particleCount; i++) {
            const particle = new PIXI.Graphics();
            const size = 2 + Math.random() * 4;
            particle.circle(0, 0, size);
            // Mix of gold and white particles
            const color = Math.random() > 0.5 ? 0xFFD700 : 0xFFFFFF;
            particle.fill({ color, alpha: 0.9 });

            // Start from center/bottom of card
            particle.x = CARD_WIDTH / 2;
            particle.y = CARD_HEIGHT * 0.7;
            this.addChild(particle);

            // Upward and outward velocity (like rising sparkles)
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8; // Mostly upward
            const speed = 30 + Math.random() * 50;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;

            // Animate particle
            const startTime = performance.now();
            const duration = 600 + Math.random() * 400;

            const animateParticle = (currentTime: number) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Move upward with slight deceleration
                const eased = 1 - Math.pow(1 - progress, 2);
                particle.x = CARD_WIDTH / 2 + vx * eased;
                particle.y = CARD_HEIGHT * 0.7 + vy * eased;

                // Fade and shrink
                particle.alpha = (1 - progress) * 0.9;
                particle.scale.set(1 - progress * 0.3);

                if (progress < 1) {
                    requestAnimationFrame(animateParticle);
                } else {
                    this.removeChild(particle);
                    particle.destroy();
                }
            };

            // Stagger particle starts for more natural effect
            setTimeout(() => requestAnimationFrame(animateParticle), i * 30);
        }
    }

    /**
     * Ease out elastic for dramatic bounce effect
     */
    private easeOutElastic(x: number): number {
        const c4 = (2 * Math.PI) / 3;
        return x === 0
            ? 0
            : x === 1
            ? 1
            : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
    }
}
