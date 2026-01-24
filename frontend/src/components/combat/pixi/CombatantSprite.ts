/**
 * @file CombatantSprite.ts
 * @description PIXI.Container subclass representing a single combatant card.
 * 
 * Visual layers (bottom to top):
 * 1. Card border (Graphics) - amber allies, red enemies
 * 2. Portrait (Sprite) - character image, 104×108px
 * 3. Gradient overlay (Graphics) - text readability
 * 4. Level badge (Graphics + Text) - top left
 * 5. Name plate (Graphics + Text) - bottom
 * 6. HP bar (Graphics) - current/max health
 * 7. Status icons (Graphics) - DEF, OW badges
 * 8. Damage numbers (Text) - floats up on hit
 */

import * as PIXI from 'pixi.js';
import { Combatant } from '../../../types/combat';
import { TextureCache } from './TextureCache';

// Card dimensions - larger for better visibility
const CARD_WIDTH = 128;
const CARD_HEIGHT = 180;
const PORTRAIT_WIDTH = 120;
const PORTRAIT_HEIGHT = 130;
const BORDER_WIDTH = 4;
const BORDER_RADIUS = 8;

// Colors
const ALLY_COLOR = 0x3B82F6; // Blue-500 (matches combat turn display)
const ENEMY_COLOR = 0xEF4444; // Red-500
const HP_BAR_BG = 0x450A0A; // Dark red background (red-950)
const HP_BAR_FILL = 0xDC2626; // Red-600 for HP fill
const HP_BAR_LOW = 0x7F1D1D; // Darker red when low (red-900)

// Font - use Poppins if available, fallback to system fonts
const FONT_FAMILY = 'Poppins, system-ui, -apple-system, sans-serif';

export class CombatantSprite extends PIXI.Container {
    private combatantId: string;
    private isPlayerControlled: boolean;

    // Visual layers
    private border!: PIXI.Graphics;
    private portraitSprite!: PIXI.Sprite;
    private gradientOverlay!: PIXI.Graphics;
    private levelBadge!: PIXI.Container;
    private levelText!: PIXI.Text;
    private namePlate!: PIXI.Container;
    private nameText!: PIXI.Text;
    private hpBarBg!: PIXI.Graphics;
    private hpBarFill!: PIXI.Graphics;
    private hpText!: PIXI.Text;
    private statusContainer!: PIXI.Container;

    // State
    private currentHp: number = 0;
    private maxHp: number = 0;

    constructor(combatant: Combatant) {
        super();

        this.combatantId = combatant.id;
        this.isPlayerControlled = combatant.isPlayerControlled;
        this.currentHp = combatant.currentHp;
        this.maxHp = combatant.maxHp;

        // Enable interactivity for click targeting
        this.eventMode = 'static';
        this.cursor = 'pointer';

        // Create visual layers
        this.border = this.createBorder();
        this.addChild(this.border);

        this.portraitSprite = this.createPortrait(combatant.imagePath);
        this.addChild(this.portraitSprite);

        this.gradientOverlay = this.createGradientOverlay();
        this.addChild(this.gradientOverlay);

        this.levelBadge = this.createLevelBadge(combatant.level);
        this.addChild(this.levelBadge);

        this.namePlate = this.createNamePlate(combatant.name);
        this.addChild(this.namePlate);

        const hpBar = this.createHPBar();
        this.hpBarBg = hpBar.bg;
        this.hpBarFill = hpBar.fill;
        this.hpText = hpBar.text;
        this.addChild(this.hpBarBg);
        this.addChild(this.hpBarFill);
        this.addChild(this.hpText);

        this.statusContainer = new PIXI.Container();
        this.statusContainer.x = CARD_WIDTH - 30;
        this.statusContainer.y = 8;
        this.addChild(this.statusContainer);

        this.updateHPBar();
    }

    /**
     * Create card border (layer 1) with rounded corners
     */
    private createBorder(): PIXI.Graphics {
        const border = new PIXI.Graphics();
        const color = this.isPlayerControlled ? ALLY_COLOR : ENEMY_COLOR;

        // Outer rounded rectangle (colored border)
        border.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, BORDER_RADIUS);
        border.fill({ color, alpha: 1 });

        // Inner rounded rectangle for portrait area (black background)
        border.roundRect(
            BORDER_WIDTH,
            BORDER_WIDTH,
            CARD_WIDTH - BORDER_WIDTH * 2,
            CARD_HEIGHT - BORDER_WIDTH * 2,
            BORDER_RADIUS - 2
        );
        border.fill({ color: 0x000000, alpha: 1 });

        return border;
    }

    /**
     * Create portrait sprite (layer 2) with cover-style scaling (no stretching)
     */
    private createPortrait(imagePath: string | null): PIXI.Sprite {
        let texture: PIXI.Texture;

        if (imagePath) {
            texture = TextureCache.get(imagePath);
        } else {
            // Fallback to white texture if no image
            texture = PIXI.Texture.WHITE;
        }

        const sprite = new PIXI.Sprite(texture);

        // Calculate cover-style scaling (fill area while maintaining aspect ratio)
        const textureWidth = texture.width || PORTRAIT_WIDTH;
        const textureHeight = texture.height || PORTRAIT_HEIGHT;

        const scaleX = PORTRAIT_WIDTH / textureWidth;
        const scaleY = PORTRAIT_HEIGHT / textureHeight;
        const scale = Math.max(scaleX, scaleY); // Use larger scale to cover

        sprite.scale.set(scale);

        // Center the image within the portrait area
        const scaledWidth = textureWidth * scale;
        const scaledHeight = textureHeight * scale;
        sprite.x = BORDER_WIDTH + (PORTRAIT_WIDTH - scaledWidth) / 2;
        sprite.y = BORDER_WIDTH + (PORTRAIT_HEIGHT - scaledHeight) / 2;

        // Create mask to clip the portrait to the rounded area
        const mask = new PIXI.Graphics();
        mask.roundRect(
            BORDER_WIDTH,
            BORDER_WIDTH,
            PORTRAIT_WIDTH,
            PORTRAIT_HEIGHT,
            BORDER_RADIUS - 2
        );
        mask.fill({ color: 0xFFFFFF });
        this.addChild(mask);
        sprite.mask = mask;

        return sprite;
    }

    /**
     * Create gradient overlay for text readability (layer 3)
     */
    private createGradientOverlay(): PIXI.Graphics {
        const overlay = new PIXI.Graphics();

        // Bottom gradient for name plate readability (with rounded bottom corners)
        overlay.roundRect(
            BORDER_WIDTH,
            CARD_HEIGHT - 50,
            PORTRAIT_WIDTH,
            50 - BORDER_WIDTH,
            BORDER_RADIUS - 2
        );
        overlay.fill({ color: 0x000000, alpha: 0.7 });

        return overlay;
    }

    /**
     * Create level badge (layer 4)
     */
    private createLevelBadge(level: number): PIXI.Container {
        const container = new PIXI.Container();
        container.x = 8;
        container.y = 8;

        // Badge background
        const bg = new PIXI.Graphics();
        bg.circle(0, 0, 14);
        bg.fill({ color: 0x1F2937, alpha: 0.9 });
        container.addChild(bg);

        // Level text
        this.levelText = new PIXI.Text({
            text: level.toString(),
            style: {
                fontFamily: FONT_FAMILY,
                fontSize: 12,
                fontWeight: 'bold',
                fill: 0xFFFFFF,
            }
        });
        this.levelText.anchor.set(0.5);
        container.addChild(this.levelText);

        return container;
    }

    /**
     * Create name plate (layer 5) - text only, relies on gradient overlay for contrast
     */
    private createNamePlate(name: string): PIXI.Container {
        const container = new PIXI.Container();
        const plateWidth = PORTRAIT_WIDTH - 8;
        const plateX = BORDER_WIDTH + 4;
        const plateY = CARD_HEIGHT - 46;

        container.x = plateX;
        container.y = plateY;

        // Name text (no background - black gradient overlay provides contrast)
        this.nameText = new PIXI.Text({
            text: name,
            style: {
                fontFamily: FONT_FAMILY,
                fontSize: 13,
                fontWeight: 'bold',
                fill: 0xFFFFFF,
            }
        });

        // Center horizontally
        this.nameText.anchor.set(0.5, 0);
        this.nameText.x = plateWidth / 2;

        // Truncate if too long
        const maxTextWidth = plateWidth - 8;
        if (this.nameText.width > maxTextWidth) {
            let truncated = name;
            while (this.nameText.width > maxTextWidth && truncated.length > 0) {
                truncated = truncated.slice(0, -1);
                this.nameText.text = truncated + '...';
            }
        }

        container.addChild(this.nameText);

        return container;
    }

    /**
     * Create HP bar (layer 6) - pill-shaped with red theme
     */
    private createHPBar(): { bg: PIXI.Graphics; fill: PIXI.Graphics; text: PIXI.Text } {
        const barWidth = PORTRAIT_WIDTH - 8;
        const barHeight = 14;
        const barRadius = barHeight / 2; // Full pill shape
        const barX = BORDER_WIDTH + 4;
        const barY = CARD_HEIGHT - 20;

        // Background (pill-shaped)
        const bg = new PIXI.Graphics();
        bg.roundRect(barX, barY, barWidth, barHeight, barRadius);
        bg.fill({ color: HP_BAR_BG, alpha: 1 });
        bg.stroke({ color: 0x7F1D1D, alpha: 0.8, width: 1 }); // Subtle border

        // Fill (will be updated based on HP)
        const fill = new PIXI.Graphics();

        // HP text (centered in bar)
        const text = new PIXI.Text({
            text: '',
            style: {
                fontFamily: FONT_FAMILY,
                fontSize: 9,
                fontWeight: 'bold',
                fill: 0xFFFFFF,
            }
        });
        text.x = barX + barWidth / 2;
        text.y = barY + barHeight / 2;
        text.anchor.set(0.5, 0.5);

        return { bg, fill, text };
    }

    /**
     * Update HP bar based on current HP
     */
    private updateHPBar(): void {
        const barWidth = PORTRAIT_WIDTH - 8;
        const barHeight = 14;
        const barRadius = barHeight / 2;
        const barX = BORDER_WIDTH + 4;
        const barY = CARD_HEIGHT - 20;

        const hpPercent = Math.max(0, Math.min(1, this.currentHp / this.maxHp));
        const fillWidth = Math.max(0, barWidth * hpPercent);

        // Choose color based on HP percentage (darker when low)
        let fillColor = HP_BAR_FILL;
        if (hpPercent < 0.3) {
            fillColor = HP_BAR_LOW;
        }

        // Redraw fill (pill-shaped, clipped to current HP)
        this.hpBarFill.clear();
        if (fillWidth > barRadius * 2) {
            // Full pill with variable width
            this.hpBarFill.roundRect(barX, barY, fillWidth, barHeight, barRadius);
            this.hpBarFill.fill({ color: fillColor, alpha: 1 });
        } else if (fillWidth > 0) {
            // Small fill - just show a rounded rect that fits
            const smallRadius = Math.min(barRadius, fillWidth / 2);
            this.hpBarFill.roundRect(barX, barY, fillWidth, barHeight, smallRadius);
            this.hpBarFill.fill({ color: fillColor, alpha: 1 });
        }

        // Update text
        this.hpText.text = `${Math.max(0, Math.floor(this.currentHp))}/${this.maxHp}`;
    }

    /**
     * Update sprite from combat state
     */
    updateFromState(combatant: Combatant, isMarked: boolean = false): void {
        this.currentHp = combatant.currentHp;
        this.maxHp = combatant.maxHp;
        this.updateHPBar();

        // Update status icons
        this.updateStatusIcons(
            combatant.isDefending,
            combatant.isOverwatching,
            combatant.hasAimedShot,
            isMarked,
            combatant.defendingAllyId,
            combatant.protectedByDefenderId
        );

        // Update level if changed
        this.levelText.text = combatant.level.toString();
    }

    /**
     * Update status icons (GUARD, shield, OW, AIM, MARK badges)
     */
    private updateStatusIcons(
        isDefending: boolean,
        isOverwatching: boolean,
        hasAimedShot: boolean,
        isMarked: boolean,
        defendingAllyId?: string,
        protectedByDefenderId?: string
    ): void {
        this.statusContainer.removeChildren();

        let yOffset = 0;

        // Show GUARD badge if actively defending an ally
        if (isDefending && defendingAllyId) {
            const guardBadge = this.createStatusBadge('GUARD', 0x3B82F6); // Blue
            guardBadge.y = yOffset;
            this.statusContainer.addChild(guardBadge);
            yOffset += 22;
        }

        // Show shield badge if protected by a defender
        if (protectedByDefenderId) {
            const shieldBadge = this.createStatusBadge('🛡', 0x10B981); // Green
            shieldBadge.y = yOffset;
            this.statusContainer.addChild(shieldBadge);
            yOffset += 22;
        }

        if (isOverwatching) {
            const owBadge = this.createStatusBadge('OW', 0xF59E0B); // Amber
            owBadge.y = yOffset;
            this.statusContainer.addChild(owBadge);
            yOffset += 22;
        }

        if (hasAimedShot) {
            const aimBadge = this.createStatusBadge('AIM', 0xEAB308); // Yellow
            aimBadge.y = yOffset;
            this.statusContainer.addChild(aimBadge);
            yOffset += 22;
        }

        if (isMarked) {
            const markBadge = this.createStatusBadge('MARK', 0xDC2626); // Red
            markBadge.y = yOffset;
            this.statusContainer.addChild(markBadge);
        }
    }

    /**
     * Create a status badge
     */
    private createStatusBadge(label: string, color: number): PIXI.Container {
        const container = new PIXI.Container();

        // Adjust width for longer labels like "GUARD"
        const width = label.length > 2 ? 36 : 24;

        // Background (pill-shaped)
        const bg = new PIXI.Graphics();
        bg.roundRect(0, 0, width, 18, 9);
        bg.fill({ color, alpha: 0.9 });
        container.addChild(bg);

        // Text
        const text = new PIXI.Text({
            text: label,
            style: {
                fontFamily: FONT_FAMILY,
                fontSize: label.length > 2 ? 8 : 9,
                fontWeight: 'bold',
                fill: 0xFFFFFF,
            }
        });
        text.x = width / 2;
        text.y = 9;
        text.anchor.set(0.5);
        container.addChild(text);

        return container;
    }

    /**
     * Set highlight for valid target
     */
    setHighlight(active: boolean): void {
        if (active) {
            this.border.tint = 0xFFFF00; // Yellow tint
            this.alpha = 1.0;
        } else {
            this.border.tint = 0xFFFFFF; // No tint
            this.alpha = 1.0;
        }
    }

    /**
     * Play attack animation
     * @deprecated Use AnimationManager directly instead
     */
    playAttackAnimation(_direction: 'up' | 'down'): Promise<void> {
        // Import will be handled by AnimationManager
        // This method will be called by AnimationManager with the animation instance
        return Promise.resolve();
    }

    /**
     * Play hit animation
     */
    playHitAnimation(): Promise<void> {
        // Import will be handled by AnimationManager
        return Promise.resolve();
    }

    /**
     * Play move animation
     * @deprecated Use AnimationManager directly instead
     */
    playMoveAnimation(_targetX: number, _targetY: number): Promise<void> {
        // Import will be handled by AnimationManager
        return Promise.resolve();
    }

    /**
     * Play death animation
     */
    playDeathAnimation(): Promise<void> {
        // Import will be handled by AnimationManager
        return Promise.resolve();
    }

    /**
     * Show floating damage number
     * Returns the text object for animation by AnimationManager
     */
    showDamage(amount: number, type: 'damage' | 'heal' | 'critical' = 'damage'): PIXI.Text {
        let color = 0xFF4444; // Red for damage
        let prefix = '-';
        let scale = 1.2;

        if (type === 'heal') {
            color = 0x44FF44; // Green for heal
            prefix = '+';
        } else if (type === 'critical') {
            color = 0xFFD700; // Gold for critical
            scale = 1.5;
        }

        const damageText = new PIXI.Text({
            text: `${prefix}${Math.floor(amount)}`,
            style: {
                fontFamily: FONT_FAMILY,
                fontSize: 24,
                fontWeight: 'bold',
                fill: color,
                dropShadow: {
                    alpha: 0.8,
                    angle: Math.PI / 6,
                    blur: 4,
                    color: 0x000000,
                    distance: 2,
                }
            }
        });

        damageText.anchor.set(0.5);
        damageText.x = CARD_WIDTH / 2;
        damageText.y = CARD_HEIGHT / 2;
        damageText.scale.set(scale);

        this.addChild(damageText);

        return damageText;
    }

    /**
     * Get combatant ID
     */
    getId(): string {
        return this.combatantId;
    }

    /**
     * Cleanup
     */
    destroy(options?: boolean | PIXI.DestroyOptions): void {
        super.destroy(options);
    }
}
