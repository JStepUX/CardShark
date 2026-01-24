/**
 * @file BattlefieldStage.ts
 * @description PIXI.Container managing the battlefield layout and grid slots.
 * 
 * Layout:
 * - 10 grid slots (5 enemy row, 5 ally row)
 * - Enemy row at y=80, Ally row at y=400
 * - Slot width: 140px (112px card + 28px gap)
 * - Stage size: 800×600px
 * 
 * Future-proofed for terrain, traps, and ground effects.
 */

import * as PIXI from 'pixi.js';
import { CombatState, Combatant } from '../../../types/combat';
import { CombatantSprite } from './CombatantSprite';

// Grid configuration - larger cards for better visibility
const SLOT_WIDTH = 148;
const CARD_WIDTH = 128;
const CARD_HEIGHT = 180;
const ENEMY_ROW_Y = 40;
const ALLY_ROW_Y = 340;
const FIRST_SLOT_X = 30; // Center 5 slots in 800px width: (800 - 5*148) / 2 = 30

// Grid colors (matching old CSS: red for enemies, blue for allies)
const ENEMY_SLOT_BORDER = 0x7F1D1D; // red-900
const ENEMY_SLOT_BG = 0x450A0A;     // red-950
const ALLY_SLOT_BORDER = 0x1E3A8A;  // blue-900
const ALLY_SLOT_BG = 0x172554;      // blue-950

// Move indicator colors (subtle monochrome)
const MOVE_INDICATOR_COLOR = 0x9CA3AF; // Gray-400 - subtle
const MOVE_INDICATOR_GLOW = 0xD1D5DB;  // Gray-300 for pulse effect

// Future-proofing: terrain types for Phase 5+
type TerrainType = 'normal' | 'ice' | 'fire' | 'destroyed';

interface GridSlot {
    x: number;
    y: number;
    occupant: CombatantSprite | null;
    terrain: TerrainType;
    // Future: trap data, ground effects
}

export class BattlefieldStage extends PIXI.Container {
    private enemySlots: GridSlot[] = [];
    private allySlots: GridSlot[] = [];
    private combatantSprites: Map<string, CombatantSprite> = new Map();
    private turnIndicator: PIXI.Graphics | null = null;
    private turnIndicatorBounce: number = 0;

    // Move indicator state
    private moveIndicators: PIXI.Container[] = [];
    private moveIndicatorPulseTime: number = 0;
    private isMoveMode: boolean = false;

    // Visual layers (rendered in order)
    private gridLayer: PIXI.Container;
    private moveIndicatorLayer: PIXI.Container;
    private shieldLinkLayer: PIXI.Container;
    private combatantLayer: PIXI.Container;

    // Projectile support
    private projectileLayer: PIXI.Container;
    private projectileTextures: Map<string, PIXI.Texture> = new Map();
    private projectilePool: PIXI.Sprite[] = [];
    private readonly PROJECTILE_POOL_SIZE = 10;

    constructor(renderer: PIXI.Renderer) {
        super();

        // Create layers in render order (bottom to top)
        // 1. Grid layer - dashed slot outlines
        this.gridLayer = new PIXI.Container();
        this.addChild(this.gridLayer);

        // 2. Move indicator layer - pulsing indicators for valid move destinations
        this.moveIndicatorLayer = new PIXI.Container();
        this.addChild(this.moveIndicatorLayer);

        // 3. Shield link layer - visual connections between defenders and protected allies
        this.shieldLinkLayer = new PIXI.Container();
        this.addChild(this.shieldLinkLayer);

        // 4. Combatant layer - card sprites
        this.combatantLayer = new PIXI.Container();
        this.addChild(this.combatantLayer);

        // 5. Projectile layer (renders above combatants)
        this.projectileLayer = new PIXI.Container();
        this.addChild(this.projectileLayer);

        // Create projectile textures
        this.createProjectileTextures(renderer);

        // Pre-allocate projectile pool
        for (let i = 0; i < this.PROJECTILE_POOL_SIZE; i++) {
            const sprite = new PIXI.Sprite();
            sprite.anchor.set(0.5);
            sprite.visible = false;
            this.projectileLayer.addChild(sprite);
            this.projectilePool.push(sprite);
        }

        // Initialize grid slots
        this.initializeSlots();

        // Draw the grid visualization
        this.drawGrid();

        // Create turn indicator
        this.createTurnIndicator();
    }

    /**
     * Create programmatic projectile textures
     */
    private createProjectileTextures(renderer: PIXI.Renderer): void {
        // Create arrow texture (16x16, pointing right)
        const arrowGraphics = new PIXI.Graphics();

        // Arrow shaft (brown)
        arrowGraphics.rect(0, 7, 12, 2);
        arrowGraphics.fill({ color: 0x8B4513 });

        // Arrowhead (gray metal)
        arrowGraphics.moveTo(12, 8);
        arrowGraphics.lineTo(16, 8);
        arrowGraphics.lineTo(12, 4);
        arrowGraphics.lineTo(12, 12);
        arrowGraphics.lineTo(16, 8);
        arrowGraphics.fill({ color: 0x888888 });

        // Fletching (red)
        arrowGraphics.moveTo(0, 8);
        arrowGraphics.lineTo(0, 5);
        arrowGraphics.lineTo(3, 8);
        arrowGraphics.lineTo(0, 11);
        arrowGraphics.lineTo(0, 8);
        arrowGraphics.fill({ color: 0xCC0000 });

        const arrowTexture = renderer.generateTexture(arrowGraphics);
        this.projectileTextures.set('arrow', arrowTexture);

        // Create fireball texture (32x32, glowing orb)
        const fireballGraphics = new PIXI.Graphics();

        // Outer glow (red)
        fireballGraphics.circle(16, 16, 16);
        fireballGraphics.fill({ color: 0xFF3300, alpha: 0.3 });

        // Middle layer (orange)
        fireballGraphics.circle(16, 16, 12);
        fireballGraphics.fill({ color: 0xFF6600, alpha: 0.8 });

        // Core (bright yellow)
        fireballGraphics.circle(16, 16, 8);
        fireballGraphics.fill({ color: 0xFFFF00, alpha: 1 });

        // Hot spot (white)
        fireballGraphics.circle(14, 14, 4);
        fireballGraphics.fill({ color: 0xFFFFFF, alpha: 0.8 });

        const fireballTexture = renderer.generateTexture(fireballGraphics);
        this.projectileTextures.set('fireball', fireballTexture);
    }


    /**
     * Initialize all grid slots with positions
     */

    private initializeSlots(): void {
        // Enemy row (top)
        for (let i = 0; i < 5; i++) {
            this.enemySlots.push({
                x: FIRST_SLOT_X + (i * SLOT_WIDTH),
                y: ENEMY_ROW_Y,
                occupant: null,
                terrain: 'normal',
            });
        }

        // Ally row (bottom)
        for (let i = 0; i < 5; i++) {
            this.allySlots.push({
                x: FIRST_SLOT_X + (i * SLOT_WIDTH),
                y: ALLY_ROW_Y,
                occupant: null,
                terrain: 'normal',
            });
        }
    }

    /**
     * Draw the visual grid with dashed slot outlines
     * Matches the old CSS style: dashed borders with semi-transparent backgrounds
     */
    private drawGrid(): void {
        // Draw enemy row slots (red tint)
        this.enemySlots.forEach(slot => {
            this.drawSlotOutline(slot.x, slot.y, true);
        });

        // Draw ally row slots (blue tint)
        this.allySlots.forEach(slot => {
            this.drawSlotOutline(slot.x, slot.y, false);
        });

        // Draw center divider line (like old CSS gradient divider)
        const divider = new PIXI.Graphics();
        const centerY = (ENEMY_ROW_Y + CARD_HEIGHT + ALLY_ROW_Y) / 2;

        // Gradient effect using multiple lines with fading alpha
        const dividerWidth = 5 * SLOT_WIDTH - (SLOT_WIDTH - CARD_WIDTH); // Width of actual card area
        const startX = FIRST_SLOT_X; // Align with grid

        for (let i = 0; i < dividerWidth; i++) {
            // Calculate alpha for gradient (0 at edges, 1 at center)
            const normalizedPos = i / dividerWidth;
            const alpha = Math.sin(normalizedPos * Math.PI) * 0.6;

            divider.moveTo(startX + i, centerY);
            divider.lineTo(startX + i + 1, centerY);
            divider.stroke({ color: 0x4B5563, alpha, width: 1 }); // gray-600
        }

        this.gridLayer.addChild(divider);
    }

    /**
     * Draw a single slot outline with dashed border
     */
    private drawSlotOutline(x: number, y: number, isEnemy: boolean): void {
        const slotGraphics = new PIXI.Graphics();

        const borderColor = isEnemy ? ENEMY_SLOT_BORDER : ALLY_SLOT_BORDER;
        const bgColor = isEnemy ? ENEMY_SLOT_BG : ALLY_SLOT_BG;

        // Draw semi-transparent background
        slotGraphics.roundRect(x, y, CARD_WIDTH, CARD_HEIGHT, 8);
        slotGraphics.fill({ color: bgColor, alpha: 0.2 });

        // Draw dashed border
        // PIXI.js v8 doesn't have native dash support, so we draw it manually
        this.drawDashedRect(slotGraphics, x, y, CARD_WIDTH, CARD_HEIGHT, 8, borderColor, 0.5);

        this.gridLayer.addChild(slotGraphics);
    }

    /**
     * Draw a dashed rounded rectangle
     */
    private drawDashedRect(
        graphics: PIXI.Graphics,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
        color: number,
        alpha: number
    ): void {
        const dashLength = 8;
        const gapLength = 6;
        const lineWidth = 2;

        // Helper to draw a dashed line segment
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

        // Draw the four sides (simplified - ignoring rounded corners for dash calculation)
        // Top edge
        drawDashedLine(x + radius, y, x + width - radius, y);
        // Right edge
        drawDashedLine(x + width, y + radius, x + width, y + height - radius);
        // Bottom edge
        drawDashedLine(x + width - radius, y + height, x + radius, y + height);
        // Left edge
        drawDashedLine(x, y + height - radius, x, y + radius);

        // Draw corner arcs (solid, not dashed, for simplicity)
        const cornerAlpha = alpha * 0.7;

        // Top-left corner
        graphics.arc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5);
        graphics.stroke({ color, alpha: cornerAlpha, width: lineWidth });

        // Top-right corner
        graphics.arc(x + width - radius, y + radius, radius, Math.PI * 1.5, Math.PI * 2);
        graphics.stroke({ color, alpha: cornerAlpha, width: lineWidth });

        // Bottom-right corner
        graphics.arc(x + width - radius, y + height - radius, radius, 0, Math.PI * 0.5);
        graphics.stroke({ color, alpha: cornerAlpha, width: lineWidth });

        // Bottom-left corner
        graphics.arc(x + radius, y + height - radius, radius, Math.PI * 0.5, Math.PI);
        graphics.stroke({ color, alpha: cornerAlpha, width: lineWidth });
    }

    /**
     * Update battlefield from combat state.
     * Syncs all combatant positions and states.
     */
    updateFromState(state: CombatState): void {
        // Track which combatants are in the new state
        const activeCombatantIds = new Set<string>();

        // Update enemy slots
        state.battlefield.enemySlots.forEach((combatantId, slotIndex) => {
            if (combatantId) {
                activeCombatantIds.add(combatantId);
                const combatant = state.combatants[combatantId];
                this.updateSlot(combatantId, combatant, slotIndex, true);
            } else {
                // Clear slot if empty
                this.clearSlot(slotIndex, true);
            }
        });

        // Update ally slots
        state.battlefield.allySlots.forEach((combatantId, slotIndex) => {
            if (combatantId) {
                activeCombatantIds.add(combatantId);
                const combatant = state.combatants[combatantId];
                this.updateSlot(combatantId, combatant, slotIndex, false);
            } else {
                // Clear slot if empty
                this.clearSlot(slotIndex, false);
            }
        });

        // Remove sprites for combatants no longer in battle (fled or defeated)
        this.combatantSprites.forEach((sprite, id) => {
            if (!activeCombatantIds.has(id)) {
                this.combatantLayer.removeChild(sprite);
                sprite.destroy();
                this.combatantSprites.delete(id);
            }
        });

        // Update shield links
        this.updateShieldLinks(state);
    }

    /**
     * Update a single slot with a combatant
     */
    private updateSlot(
        combatantId: string,
        combatant: Combatant,
        slotIndex: number,
        isEnemy: boolean
    ): void {
        const slots = isEnemy ? this.enemySlots : this.allySlots;
        const slot = slots[slotIndex];

        // Get or create sprite
        let sprite = this.combatantSprites.get(combatantId);

        if (!sprite) {
            // Create new sprite
            sprite = new CombatantSprite(combatant);
            this.combatantSprites.set(combatantId, sprite);
            this.combatantLayer.addChild(sprite);

            // Set up click handler for targeting
            sprite.on('pointerdown', () => {
                this.emit('combatantClicked', combatantId);
            });
        } else {
            // Update existing sprite
            sprite.updateFromState(combatant);
        }

        // Position sprite at slot
        sprite.x = slot.x;
        sprite.y = slot.y;

        // Update slot occupancy
        slot.occupant = sprite;
    }

    /**
     * Clear a slot (remove occupant)
     */
    private clearSlot(slotIndex: number, isEnemy: boolean): void {
        const slots = isEnemy ? this.enemySlots : this.allySlots;
        const slot = slots[slotIndex];
        slot.occupant = null;
    }

    /**
     * Get combatant sprite by ID
     */
    getCombatantSprite(id: string): CombatantSprite | undefined {
        return this.combatantSprites.get(id);
    }

    /**
     * Get slot position coordinates
     */
    getSlotPosition(slot: number, isEnemy: boolean): { x: number; y: number } {
        const slots = isEnemy ? this.enemySlots : this.allySlots;
        return { x: slots[slot].x, y: slots[slot].y };
    }

    /**
     * Highlight valid targets
     */
    highlightTargets(targetIds: string[]): void {
        // Clear all highlights first
        this.combatantSprites.forEach(sprite => sprite.setHighlight(false));

        // Highlight specified targets
        targetIds.forEach(id => {
            const sprite = this.combatantSprites.get(id);
            if (sprite) {
                sprite.setHighlight(true);
            }
        });
    }

    /**
     * Clear all highlights
     */
    clearHighlights(): void {
        this.combatantSprites.forEach(sprite => sprite.setHighlight(false));
    }

    /**
     * Update shield links to show defend relationships
     */
    private updateShieldLinks(state: CombatState): void {
        // Clear existing shield links
        this.shieldLinkLayer.removeChildren();

        // Draw links for all active defend relationships
        Object.values(state.combatants).forEach(combatant => {
            if (combatant.defendingAllyId && combatant.isDefending) {
                const defender = this.combatantSprites.get(combatant.id);
                const protectedAlly = this.combatantSprites.get(combatant.defendingAllyId);

                if (defender && protectedAlly) {
                    this.drawShieldLink(defender, protectedAlly);
                }
            }
        });
    }

    /**
     * Draw a shield link between defender and protected ally
     */
    private drawShieldLink(defenderSprite: CombatantSprite, protectedSprite: CombatantSprite): void {
        const graphics = new PIXI.Graphics();

        // Calculate positions (center of cards)
        const startX = defenderSprite.x + CARD_WIDTH / 2;
        const startY = defenderSprite.y + CARD_HEIGHT / 2;
        const endX = protectedSprite.x + CARD_WIDTH / 2;
        const endY = protectedSprite.y + CARD_HEIGHT / 2;

        // Draw curved line (quadratic bezier)
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        const controlY = midY - 30; // Curve upward

        // Draw the curve with blue color
        graphics.moveTo(startX, startY);
        graphics.bezierCurveTo(
            startX, startY - 20,
            endX, endY - 20,
            endX, endY
        );
        graphics.stroke({ color: 0x3B82F6, width: 3, alpha: 0.7 }); // blue-500

        // Draw shield icon at midpoint
        const shieldGraphics = new PIXI.Graphics();
        const shieldX = midX;
        const shieldY = controlY;

        // Shield shape (simplified)
        shieldGraphics.moveTo(shieldX, shieldY - 8);
        shieldGraphics.lineTo(shieldX - 6, shieldY - 4);
        shieldGraphics.lineTo(shieldX - 6, shieldY + 2);
        shieldGraphics.lineTo(shieldX, shieldY + 8);
        shieldGraphics.lineTo(shieldX + 6, shieldY + 2);
        shieldGraphics.lineTo(shieldX + 6, shieldY - 4);
        shieldGraphics.lineTo(shieldX, shieldY - 8);
        shieldGraphics.fill({ color: 0x3B82F6, alpha: 0.9 }); // blue-500

        // Add white border to shield
        shieldGraphics.moveTo(shieldX, shieldY - 8);
        shieldGraphics.lineTo(shieldX - 6, shieldY - 4);
        shieldGraphics.lineTo(shieldX - 6, shieldY + 2);
        shieldGraphics.lineTo(shieldX, shieldY + 8);
        shieldGraphics.lineTo(shieldX + 6, shieldY + 2);
        shieldGraphics.lineTo(shieldX + 6, shieldY - 4);
        shieldGraphics.lineTo(shieldX, shieldY - 8);
        shieldGraphics.stroke({ color: 0xFFFFFF, width: 1.5, alpha: 0.9 });

        this.shieldLinkLayer.addChild(graphics);
        this.shieldLinkLayer.addChild(shieldGraphics);
    }

    /**
     * Create turn indicator (bouncing arrow)
     */
    private createTurnIndicator(): void {
        this.turnIndicator = new PIXI.Graphics();

        // Draw downward-pointing arrow
        this.turnIndicator.moveTo(0, 0);
        this.turnIndicator.lineTo(8, 12);
        this.turnIndicator.lineTo(-8, 12);
        this.turnIndicator.lineTo(0, 0);
        this.turnIndicator.fill({ color: 0xFFD700, alpha: 1 }); // Gold

        this.turnIndicator.visible = false;
        this.combatantLayer.addChild(this.turnIndicator);
    }

    /**
     * Set current actor (show turn indicator above them)
     */
    setCurrentActor(combatantId: string | null): void {
        if (!this.turnIndicator) return;

        if (!combatantId) {
            this.turnIndicator.visible = false;
            return;
        }

        const sprite = this.combatantSprites.get(combatantId);
        if (sprite) {
            this.turnIndicator.visible = true;
            this.turnIndicator.x = sprite.x + CARD_WIDTH / 2; // Center above card
            this.turnIndicator.y = sprite.y - 20; // Above card
        } else {
            this.turnIndicator.visible = false;
        }
    }

    /**
     * Get a projectile sprite from the pool
     * @param type 'arrow' or 'fireball'
     * @returns Projectile sprite or null if pool exhausted
     */
    getProjectile(type: 'arrow' | 'fireball'): PIXI.Sprite | null {
        const sprite = this.projectilePool.find(p => !p.visible);
        if (!sprite) {
            console.warn('Projectile pool exhausted');
            return null;
        }

        const texture = this.projectileTextures.get(type);
        if (!texture) {
            console.warn(`Projectile texture not found: ${type}`);
            return null;
        }

        sprite.texture = texture;
        sprite.visible = true;
        return sprite;
    }

    /**
     * Show subtle pulsing move indicators for valid move slots.
     * @param validSlots Array of slot indices (0-4) that are valid move destinations
     * @param isEnemy Whether the moving combatant is on the enemy row
     */
    showMoveIndicators(validSlots: number[], isEnemy: boolean): void {
        this.clearMoveIndicators();
        this.isMoveMode = true;
        this.moveIndicatorPulseTime = 0;

        const slots = isEnemy ? this.enemySlots : this.allySlots;

        validSlots.forEach(slotIndex => {
            const slot = slots[slotIndex];
            if (!slot) return;

            // Create indicator container
            const container = new PIXI.Container();
            container.x = slot.x + CARD_WIDTH / 2;
            container.y = slot.y + CARD_HEIGHT / 2;

            // Outer glow ring (subtle)
            const glowRing = new PIXI.Graphics();
            glowRing.circle(0, 0, 24);
            glowRing.stroke({ color: MOVE_INDICATOR_GLOW, alpha: 0.2, width: 3 });
            glowRing.label = 'glow';
            container.addChild(glowRing);

            // Inner ring (subtle dashed appearance via segments)
            const innerRing = new PIXI.Graphics();
            innerRing.circle(0, 0, 16);
            innerRing.stroke({ color: MOVE_INDICATOR_COLOR, alpha: 0.35, width: 2 });
            innerRing.label = 'inner';
            container.addChild(innerRing);

            // Center dot (small, subtle)
            const centerDot = new PIXI.Graphics();
            centerDot.circle(0, 0, 4);
            centerDot.fill({ color: 0xFFFFFF, alpha: 0.5 });
            centerDot.label = 'center';
            container.addChild(centerDot);

            // Make interactive
            container.eventMode = 'static';
            container.cursor = 'pointer';
            container.hitArea = new PIXI.Circle(0, 0, 40);

            // Store slot info for click handler
            (container as any).slotIndex = slotIndex;
            (container as any).isEnemy = isEnemy;

            container.on('pointerdown', () => {
                this.emit('moveSlotClicked', slotIndex);
            });

            // Hover effect - brighten on hover
            container.on('pointerover', () => {
                container.scale.set(1.2);
                container.alpha = 1.0;
            });
            container.on('pointerout', () => {
                container.scale.set(1.0);
                container.alpha = 0.7;
            });

            // Start with reduced opacity
            container.alpha = 0.7;

            this.moveIndicatorLayer.addChild(container);
            this.moveIndicators.push(container);
        });
    }

    /**
     * Clear all move indicators
     */
    clearMoveIndicators(): void {
        this.isMoveMode = false;
        this.moveIndicators.forEach(indicator => {
            this.moveIndicatorLayer.removeChild(indicator);
            indicator.destroy({ children: true });
        });
        this.moveIndicators = [];
    }

    /**
     * Update move indicator pulse animation (subtle breathing effect)
     * Call this from ticker alongside turn indicator update
     */
    updateMoveIndicators(deltaTime: number): void {
        if (!this.isMoveMode || this.moveIndicators.length === 0) return;

        this.moveIndicatorPulseTime += deltaTime * 2; // Slower, gentler pulse

        this.moveIndicators.forEach(container => {
            // Skip if being hovered (scale is 1.2)
            if (container.scale.x > 1.1) return;

            // Gentle breathing pulse (1.0 to 1.05)
            const pulseScale = 1.0 + Math.sin(this.moveIndicatorPulseTime) * 0.05;

            // Get children by label
            const glow = container.getChildByLabel('glow') as PIXI.Graphics;
            const inner = container.getChildByLabel('inner') as PIXI.Graphics;

            if (glow) {
                // Glow expands slightly and fades gently
                glow.scale.set(pulseScale * 1.1);
                glow.alpha = 0.15 + Math.sin(this.moveIndicatorPulseTime) * 0.1;
            }

            if (inner) {
                // Inner ring subtle pulse
                inner.scale.set(pulseScale);
                inner.alpha = 0.3 + Math.sin(this.moveIndicatorPulseTime) * 0.1;
            }
        });
    }

    /**
     * Update turn indicator bounce animation
     * Call this from ticker or animation loop
     */
    updateTurnIndicator(deltaTime: number): void {
        if (!this.turnIndicator || !this.turnIndicator.visible) return;

        this.turnIndicatorBounce += deltaTime * 3; // Speed of bounce
        const bounceOffset = Math.sin(this.turnIndicatorBounce) * 4; // ±4px bounce

        // Apply bounce to Y position (relative to base position)
        const sprite = Array.from(this.combatantSprites.values()).find(
            s => this.turnIndicator &&
                Math.abs(this.turnIndicator.x - (s.x + CARD_WIDTH / 2)) < 1
        );

        if (sprite) {
            this.turnIndicator.y = sprite.y - 20 + bounceOffset;
        }
    }

    /**
     * Cleanup
     */
    destroy(options?: boolean | PIXI.DestroyOptions): void {
        // Destroy all combatant sprites
        this.combatantSprites.forEach(sprite => sprite.destroy());
        this.combatantSprites.clear();

        // Destroy turn indicator
        if (this.turnIndicator) {
            this.turnIndicator.destroy();
            this.turnIndicator = null;
        }

        // Clear move indicators
        this.clearMoveIndicators();

        // Destroy layers
        this.gridLayer.destroy({ children: true });
        this.moveIndicatorLayer.destroy({ children: true });
        this.shieldLinkLayer.destroy({ children: true });
        this.combatantLayer.destroy({ children: true });
        this.projectileLayer.destroy({ children: true });

        super.destroy(options);
    }
}
