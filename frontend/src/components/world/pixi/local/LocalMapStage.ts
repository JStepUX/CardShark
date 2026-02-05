/**
 * @file LocalMapStage.ts
 * @description Main PIXI.Container for the local map (tactical grid view within a room).
 *
 * Based on the mockup:
 * - Background image fills the stage
 * - 8x5 grid of tiles with subtle dashed borders
 * - Entity cards positioned on tiles (larger than tiles for visibility)
 * - Threat zones (red overlay) around hostile NPCs
 * - Exit tiles at edges with directional icons
 * - Player position highlighted with gold glow
 *
 * Layer hierarchy (bottom to top):
 * 1. Background image
 * 2. Grid tiles (with highlights for threat zones, valid moves)
 * 3. Exit icons
 * 4. Entity shadows
 * 5. Entity cards
 * 6. UI overlay (tooltips, context menus - future)
 */

import * as PIXI from 'pixi.js';
import {
    LocalMapState,
    LocalMapEntity,
    TilePosition,
    ExitTile,
    LocalMapConfig,
} from '../../../../types/localMap';
import { LocalMapTile } from './LocalMapTile';
import { EntityCardSprite } from './EntityCardSprite';
import { CombatParticleSystem, EFFECT_COLORS, PROJECTILE_PRESETS } from './CombatParticleSystem';

// Default grid configuration (9x9 square with true center point at 4,4)
const DEFAULT_GRID_WIDTH = 9;
const DEFAULT_GRID_HEIGHT = 9;
const DEFAULT_TILE_SIZE = 80;
const TILE_GAP = 2;

// Debug logging flag - set to true for development debugging
const DEBUG = false;

// Text resolution multiplier for crisp text on high-DPI displays
const TEXT_RESOLUTION = Math.max(window.devicePixelRatio || 1, 2);

export class LocalMapStage extends PIXI.Container {
    // Configuration
    private config: LocalMapConfig;
    private stageWidth: number;
    private stageHeight: number;

    // Layers
    private backgroundLayer: PIXI.Container;
    private gridLayer: PIXI.Container;
    private threatZoneLayer: PIXI.Container;
    private exitLayer: PIXI.Container;
    private entityShadowLayer: PIXI.Container;
    private entityLayer: PIXI.Container;
    private effectsLayer: PIXI.Container;
    private uiLayer: PIXI.Container;

    // Particle system for combat effects
    private particleSystem: CombatParticleSystem | null = null;

    // Background
    private backgroundSprite: PIXI.Sprite | null = null;
    private backgroundOverlay: PIXI.Graphics | null = null;

    // Tiles (2D array)
    private tiles: LocalMapTile[][] = [];

    // Entity cards
    private entityCards: Map<string, EntityCardSprite> = new Map();

    // State
    private currentState: LocalMapState | null = null;
    private inCombat: boolean = false;
    private isDestroyed: boolean = false;

    // Viewport state (zoom and pan)
    private viewportZoom: number = 1.0;
    private viewportPan: { x: number; y: number } = { x: 0, y: 0 };
    private contentContainer: PIXI.Container;

    // Zoom constraints
    private static readonly MIN_ZOOM = 0.5;
    private static readonly MAX_ZOOM = 2.0;

    constructor(config?: Partial<LocalMapConfig>) {
        super();

        // Merge config with defaults
        this.config = {
            gridWidth: config?.gridWidth ?? DEFAULT_GRID_WIDTH,
            gridHeight: config?.gridHeight ?? DEFAULT_GRID_HEIGHT,
            tileSize: config?.tileSize ?? DEFAULT_TILE_SIZE,
            backgroundImage: config?.backgroundImage ?? null,
        };

        // Calculate stage dimensions
        this.stageWidth = this.config.gridWidth * (this.config.tileSize + TILE_GAP);
        this.stageHeight = this.config.gridHeight * (this.config.tileSize + TILE_GAP);

        // Create content container for zoom/pan transforms
        this.contentContainer = new PIXI.Container();
        this.addChild(this.contentContainer);

        // Create layer hierarchy (all inside contentContainer for zoom/pan)
        // Enable culling on layers for performance when zoomed in
        this.backgroundLayer = new PIXI.Container();
        this.backgroundLayer.eventMode = 'passive'; // Background should not intercept clicks
        this.backgroundLayer.cullable = true;
        this.contentContainer.addChild(this.backgroundLayer);

        this.gridLayer = new PIXI.Container();
        this.gridLayer.cullable = true;
        this.gridLayer.cullableChildren = true;
        this.contentContainer.addChild(this.gridLayer);

        this.threatZoneLayer = new PIXI.Container();
        this.threatZoneLayer.cullable = true;
        this.contentContainer.addChild(this.threatZoneLayer);

        this.exitLayer = new PIXI.Container();
        this.exitLayer.cullable = true;
        this.contentContainer.addChild(this.exitLayer);

        this.entityShadowLayer = new PIXI.Container();
        this.entityShadowLayer.cullable = true;
        this.contentContainer.addChild(this.entityShadowLayer);

        this.entityLayer = new PIXI.Container();
        this.entityLayer.cullable = true;
        this.entityLayer.cullableChildren = true;
        this.contentContainer.addChild(this.entityLayer);

        this.effectsLayer = new PIXI.Container();
        this.effectsLayer.eventMode = 'passive'; // Effects should not block clicks
        this.effectsLayer.cullable = true;
        this.contentContainer.addChild(this.effectsLayer);

        this.uiLayer = new PIXI.Container();
        this.uiLayer.eventMode = 'passive'; // UI layer should not block clicks on entities
        this.uiLayer.cullable = true;
        this.contentContainer.addChild(this.uiLayer);

        // Initialize
        this.createDefaultBackground();
        this.createGrid();
    }

    /**
     * Initialize particle system (called after app is available)
     */
    initParticleSystem(app: PIXI.Application): void {
        if (!this.particleSystem) {
            this.particleSystem = new CombatParticleSystem(app, this.effectsLayer);
        }
    }

    /**
     * Create default dark background
     */
    private createDefaultBackground(): void {
        const bg = new PIXI.Graphics();
        bg.rect(0, 0, this.stageWidth, this.stageHeight);
        bg.fill({ color: 0x1a1a1a, alpha: 1 });
        this.backgroundLayer.addChild(bg);
    }

    /**
     * Set background image
     */
    setBackgroundImage(imagePath: string | null): void {
        // Remove existing background sprite
        if (this.backgroundSprite) {
            this.backgroundLayer.removeChild(this.backgroundSprite);
            this.backgroundSprite.destroy();
            this.backgroundSprite = null;
        }

        if (this.backgroundOverlay) {
            this.backgroundLayer.removeChild(this.backgroundOverlay);
            this.backgroundOverlay.destroy();
            this.backgroundOverlay = null;
        }

        if (!imagePath) return;

        if (DEBUG) console.log('[LocalMapStage] Setting background image:', imagePath);

        // Load texture asynchronously using Assets API (PixiJS 8)
        PIXI.Assets.load(imagePath)
            .then((texture: PIXI.Texture) => {
                if (DEBUG) console.log('[LocalMapStage] Background texture loaded:', imagePath, texture.width, 'x', texture.height);

                // Create sprite from loaded texture
                this.backgroundSprite = new PIXI.Sprite(texture);

                // Cover scaling
                const textureWidth = texture.width || this.stageWidth;
                const textureHeight = texture.height || this.stageHeight;

                const scaleX = this.stageWidth / textureWidth;
                const scaleY = this.stageHeight / textureHeight;
                const scale = Math.max(scaleX, scaleY);

                this.backgroundSprite.scale.set(scale);

                // Center
                const scaledWidth = textureWidth * scale;
                const scaledHeight = textureHeight * scale;
                this.backgroundSprite.x = (this.stageWidth - scaledWidth) / 2;
                this.backgroundSprite.y = (this.stageHeight - scaledHeight) / 2;

                // Add at index 1 (after default background)
                this.backgroundLayer.addChildAt(this.backgroundSprite, 1);

                // Add a semi-transparent overlay to darken slightly for visibility
                this.backgroundOverlay = new PIXI.Graphics();
                this.backgroundOverlay.rect(0, 0, this.stageWidth, this.stageHeight);
                this.backgroundOverlay.fill({ color: 0x000000, alpha: 0.2 });
                this.backgroundLayer.addChild(this.backgroundOverlay);

                // Reduce grid LINE visibility when background is present (per spec)
                // Only affect grid lines, not exit icons or highlights
                for (const row of this.tiles) {
                    for (const tile of row) {
                        tile.setGridLineAlpha(0.15);
                    }
                }
            })
            .catch((err: Error) => {
                console.error('[LocalMapStage] Background texture failed to load:', imagePath, err);
            });
    }

    /**
     * Create grid of tiles
     */
    private createGrid(): void {
        this.tiles = [];

        for (let y = 0; y < this.config.gridHeight; y++) {
            const row: LocalMapTile[] = [];
            for (let x = 0; x < this.config.gridWidth; x++) {
                const tile = new LocalMapTile(
                    { x, y },
                    this.config.tileSize
                );

                // Position tile
                tile.x = x * (this.config.tileSize + TILE_GAP);
                tile.y = y * (this.config.tileSize + TILE_GAP);

                // Set up click handler
                tile.on('pointerdown', () => {
                    this.emit('tileClicked', { x, y });
                });

                row.push(tile);
                this.gridLayer.addChild(tile);
            }
            this.tiles.push(row);
        }
    }

    /**
     * Update map from state
     */
    updateFromState(state: LocalMapState): void {
        this.currentState = state;
        this.inCombat = state.inCombat;

        // Update background
        if (state.config.backgroundImage !== this.config.backgroundImage) {
            this.config.backgroundImage = state.config.backgroundImage;
            this.setBackgroundImage(state.config.backgroundImage ?? null);
        }

        // Update tile traversability (for hover visuals)
        this.updateTileTraversability(state.tiles);

        // Update exits
        this.updateExits(state.exits);

        // Update threat zones
        this.updateThreatZones(state.threatZones);

        // Update player position highlight
        this.updatePlayerPosition(state.playerPosition);

        // Update entities
        this.updateEntities(state.entities);
    }

    /**
     * Update tile traversability based on state
     */
    private updateTileTraversability(tileData: import('../../../../types/localMap').LocalMapTileData[][]): void {
        for (let y = 0; y < tileData.length; y++) {
            for (let x = 0; x < tileData[y].length; x++) {
                const tile = this.getTile({ x, y });
                const data = tileData[y][x];
                if (tile && data) {
                    tile.setTraversable(data.traversable, data.zoneType);
                }
            }
        }
    }

    /**
     * Update exit tiles
     */
    private updateExits(exits: ExitTile[]): void {
        // Clear all exit states first
        for (const row of this.tiles) {
            for (const tile of row) {
                tile.clearExit();
            }
        }

        // Set new exits
        for (const exit of exits) {
            const tile = this.getTile(exit.position);
            if (tile) {
                tile.setExit(exit.direction, exit.targetRoomName);
                // No permanent highlight - exit icon is sufficient
            }
        }
    }

    /**
     * Update threat zone overlays
     */
    private updateThreatZones(threatPositions: TilePosition[]): void {
        // Clear existing threat zone highlights (except exits and player)
        for (const row of this.tiles) {
            for (const tile of row) {
                if (!tile.getIsExit()) {
                    tile.setHighlight('none');
                }
            }
        }

        // Set threat zones (only in exploration mode)
        if (!this.inCombat) {
            for (const pos of threatPositions) {
                const tile = this.getTile(pos);
                if (tile && !tile.getIsExit()) {
                    tile.setHighlight('threat_zone');
                }
            }
        }
    }

    /**
     * Update player position highlight
     */
    private updatePlayerPosition(_position: TilePosition): void {
        // Player card is sufficient indicator - no tile highlight needed
    }

    /**
     * Update entity cards on the map
     */
    private updateEntities(entities: LocalMapEntity[]): void {
        const currentIds = new Set(entities.map(e => e.id));

        // Remove entities no longer present
        for (const [id, card] of this.entityCards) {
            if (!currentIds.has(id)) {
                this.entityLayer.removeChild(card);
                card.destroy();
                this.entityCards.delete(id);
            }
        }

        // Update or create entities
        for (const entity of entities) {
            let card = this.entityCards.get(entity.id);
            const isNewCard = !card;

            if (!card) {
                // Create new card
                card = new EntityCardSprite(entity);
                // Capture entity values in consts to ensure correct closure behavior
                const cardEntityId = entity.id;
                const cardAllegiance = entity.allegiance;
                card.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
                    if (DEBUG) console.log('[LocalMapStage] Entity card clicked:', cardEntityId, 'allegiance:', cardAllegiance);
                    event.stopPropagation();
                    this.emit('entityClicked', cardEntityId);
                });
                this.entityCards.set(entity.id, card);
                this.entityLayer.addChild(card);
                if (DEBUG) console.log('[LocalMapStage] Created card for entity:', entity.id, entity.name);
            }

            // Update card state
            card.updateFromEntity(entity);
            card.setShowHpBar(this.inCombat);

            // Position card at tile center
            const tileCenter = this.getTileCenter(entity.position);

            // Check distance from current position to target
            const dx = card.x - tileCenter.x;
            const dy = card.y - tileCenter.y;
            const distanceSquared = dx * dx + dy * dy;
            const atTarget = distanceSquared < 1; // Within 1px tolerance

            if (isNewCard) {
                // New card - position directly (no animation)
                card.x = tileCenter.x;
                card.y = tileCenter.y;
            } else if (!atTarget) {
                // Card needs to move to new position
                // Large distance (> 2 tiles) = teleport instantly (e.g., room transition, state reset)
                // Small distance = animate smoothly (e.g., click-to-move)
                const TELEPORT_THRESHOLD = (this.config.tileSize + TILE_GAP) * 2;
                const distance = Math.sqrt(distanceSquared);

                if (distance > TELEPORT_THRESHOLD) {
                    // Large position change - teleport immediately
                    // This handles room transitions, combat state resets, etc.
                    if (DEBUG) console.log('[LocalMapStage] Teleporting entity', entity.id, 'from', { x: card.x, y: card.y }, 'to', tileCenter);
                    card.x = tileCenter.x;
                    card.y = tileCenter.y;
                } else {
                    // Small position change - animate (animateMoveTo cancels existing animations)
                    card.animateMoveTo(tileCenter.x, tileCenter.y);
                }
            }

            // Scale by allegiance (player card is largest)
            // Only set scale if not animating (entrance animation sets its own scale)
            if (!card.isAnimating()) {
                const scale = entity.allegiance === 'player' ? 1.0 : 0.9;
                card.scale.set(scale);
            }
        }

        // Sort entities by y position for proper overlap
        this.entityLayer.children.sort((a, b) => a.y - b.y);
    }

    /**
     * Get tile at position
     */
    private getTile(pos: TilePosition): LocalMapTile | null {
        if (pos.y >= 0 && pos.y < this.tiles.length) {
            if (pos.x >= 0 && pos.x < this.tiles[pos.y].length) {
                return this.tiles[pos.y][pos.x];
            }
        }
        return null;
    }

    /**
     * Get center coordinates of a tile (for entity positioning)
     */
    private getTileCenter(pos: TilePosition): { x: number; y: number } {
        return {
            x: pos.x * (this.config.tileSize + TILE_GAP) + this.config.tileSize / 2,
            y: pos.y * (this.config.tileSize + TILE_GAP) + this.config.tileSize / 2,
        };
    }

    /**
     * Show valid movement tiles
     */
    showValidMoves(positions: TilePosition[]): void {
        for (const pos of positions) {
            const tile = this.getTile(pos);
            if (tile && tile.getPosition() !== this.currentState?.playerPosition) {
                tile.setHighlight('valid_movement');
            }
        }
    }

    /**
     * Show attack range tiles
     */
    showAttackRange(positions: TilePosition[]): void {
        for (const pos of positions) {
            const tile = this.getTile(pos);
            if (tile) {
                tile.setHighlight('attack_range');
            }
        }
    }

    /**
     * Clear all movement/attack highlights (keep threat zones and player)
     */
    clearActionHighlights(): void {
        if (!this.currentState) return;

        // Restore state-based highlights
        this.updateThreatZones(this.currentState.threatZones);
        this.updatePlayerPosition(this.currentState.playerPosition);
        this.updateExits(this.currentState.exits);
    }

    /**
     * Set combat mode
     */
    setCombatMode(inCombat: boolean): void {
        this.inCombat = inCombat;

        // Update all entity cards to show/hide HP bars
        for (const card of this.entityCards.values()) {
            card.setShowHpBar(inCombat);
        }

        // When ENTERING combat, hide threat zones (they're no longer relevant during combat)
        // When EXITING combat, don't clear highlights - updateFromState() has already
        // set the correct threat zones for any remaining hostile enemies
        if (inCombat && this.currentState) {
            for (const row of this.tiles) {
                for (const tile of row) {
                    const highlight = tile.getIsExit() ? 'exit' : 'none';
                    tile.setHighlight(highlight);
                }
            }
            // Keep player position highlighted in combat
            this.updatePlayerPosition(this.currentState.playerPosition);
        }
    }

    /**
     * Highlight an entity card (for targeting)
     */
    highlightEntity(entityId: string, active: boolean): void {
        const card = this.entityCards.get(entityId);
        if (card) {
            card.setHighlight(active);
        }
    }

    /**
     * Get entity card by ID
     */
    getEntityCard(entityId: string): EntityCardSprite | undefined {
        return this.entityCards.get(entityId);
    }

    /**
     * Get entity position on stage (for animations)
     */
    getEntityPosition(entityId: string): { x: number; y: number } | null {
        const card = this.entityCards.get(entityId);
        if (!card) return null;
        return { x: card.x, y: card.y };
    }

    /**
     * Update animations (call from ticker)
     */
    updateAnimations(deltaTime: number): void {
        // Update tile pulses
        for (const row of this.tiles) {
            for (const tile of row) {
                tile.updatePulse(deltaTime);
            }
        }

        // Update entity card animations (idle bob)
        for (const card of this.entityCards.values()) {
            card.updateBob(deltaTime);
        }
    }

    /**
     * Get stage dimensions
     */
    getStageDimensions(): { width: number; height: number } {
        return { width: this.stageWidth, height: this.stageHeight };
    }

    /**
     * Get UI layer (for context menus, tooltips)
     */
    getUILayer(): PIXI.Container {
        return this.uiLayer;
    }

    // ============================================
    // VIEWPORT ZOOM/PAN METHODS
    // ============================================

    /**
     * Set zoom level (clamped to MIN_ZOOM - MAX_ZOOM)
     * @param scale Zoom scale (1.0 = 100%)
     * @param centerX Optional X coordinate to zoom toward (in stage coordinates)
     * @param centerY Optional Y coordinate to zoom toward (in stage coordinates)
     */
    setZoom(scale: number, centerX?: number, centerY?: number): void {
        const oldZoom = this.viewportZoom;
        this.viewportZoom = Math.max(
            LocalMapStage.MIN_ZOOM,
            Math.min(LocalMapStage.MAX_ZOOM, scale)
        );

        // If center point provided, adjust pan to keep that point stationary
        if (centerX !== undefined && centerY !== undefined) {
            // Calculate the point in content coordinates before zoom
            const contentX = (centerX - this.viewportPan.x) / oldZoom;
            const contentY = (centerY - this.viewportPan.y) / oldZoom;

            // After zoom, adjust pan so the same content point is at the same screen position
            this.viewportPan.x = centerX - contentX * this.viewportZoom;
            this.viewportPan.y = centerY - contentY * this.viewportZoom;
        }

        this.applyViewportTransform();
    }

    /**
     * Get current zoom level
     */
    getZoom(): number {
        return this.viewportZoom;
    }

    /**
     * Pan the viewport by delta
     */
    pan(dx: number, dy: number): void {
        this.viewportPan.x += dx;
        this.viewportPan.y += dy;
        this.clampPan();
        this.applyViewportTransform();
    }

    /**
     * Set absolute pan position
     */
    setPan(x: number, y: number): void {
        this.viewportPan.x = x;
        this.viewportPan.y = y;
        this.clampPan();
        this.applyViewportTransform();
    }

    /**
     * Get current pan offset
     */
    getPan(): { x: number; y: number } {
        return { ...this.viewportPan };
    }

    /**
     * Reset zoom and pan to default
     */
    resetView(): void {
        this.viewportZoom = 1.0;
        this.viewportPan = { x: 0, y: 0 };
        this.applyViewportTransform();
    }

    /**
     * Center the viewport on a specific tile position
     * @param position Tile position to center on
     * @param viewportWidth Width of the viewport container
     * @param viewportHeight Height of the viewport container
     */
    centerOnTile(position: TilePosition, viewportWidth: number, viewportHeight: number): void {
        const tileCenter = this.getTileCenter(position);

        // Calculate pan to center this tile in the viewport
        // Content position + pan = viewport center
        // pan = viewport center - (content position * zoom)
        this.viewportPan.x = viewportWidth / 2 - tileCenter.x * this.viewportZoom;
        this.viewportPan.y = viewportHeight / 2 - tileCenter.y * this.viewportZoom;

        this.clampPan();
        this.applyViewportTransform();
    }

    /**
     * Clamp pan to keep map partially visible in viewport
     */
    private clampPan(): void {
        const scaledWidth = this.stageWidth * this.viewportZoom;
        const scaledHeight = this.stageHeight * this.viewportZoom;

        // Allow panning such that at least 10% of the map is visible (relaxed from 25%)
        const minVisibleFraction = 0.10;
        const minVisibleX = scaledWidth * minVisibleFraction;
        const minVisibleY = scaledHeight * minVisibleFraction;

        // Max pan: content can move right/down until only minVisible remains on screen
        const maxPanX = scaledWidth - minVisibleX;
        const maxPanY = scaledHeight - minVisibleY;

        // Min pan: content can move left/up until only minVisible is past the origin
        const minPanX = -(scaledWidth - minVisibleX);
        const minPanY = -(scaledHeight - minVisibleY);

        this.viewportPan.x = Math.max(minPanX, Math.min(maxPanX, this.viewportPan.x));
        this.viewportPan.y = Math.max(minPanY, Math.min(maxPanY, this.viewportPan.y));
    }

    /**
     * Apply zoom and pan transforms to content container
     */
    private applyViewportTransform(): void {
        this.contentContainer.scale.set(this.viewportZoom);
        this.contentContainer.x = this.viewportPan.x;
        this.contentContainer.y = this.viewportPan.y;
    }

    /**
     * Convert screen coordinates to content coordinates
     */
    screenToContent(screenX: number, screenY: number): { x: number; y: number } {
        return {
            x: (screenX - this.viewportPan.x) / this.viewportZoom,
            y: (screenY - this.viewportPan.y) / this.viewportZoom,
        };
    }

    /**
     * Convert content coordinates to screen coordinates
     */
    contentToScreen(contentX: number, contentY: number): { x: number; y: number } {
        return {
            x: contentX * this.viewportZoom + this.viewportPan.x,
            y: contentY * this.viewportZoom + this.viewportPan.y,
        };
    }

    /**
     * Animate entity movement (exposed for external control)
     */
    animateEntityMove(entityId: string, targetPosition: TilePosition): void {
        if (DEBUG) console.log('[LocalMapStage] animateEntityMove called', { entityId, targetPosition, availableIds: Array.from(this.entityCards.keys()) });
        const card = this.entityCards.get(entityId);
        if (card) {
            const tileCenter = this.getTileCenter(targetPosition);
            if (DEBUG) console.log('[LocalMapStage] Animating card to', tileCenter);
            card.animateMoveTo(tileCenter.x, tileCenter.y);
        } else if (DEBUG) {
            console.warn('[LocalMapStage] Entity card not found:', entityId);
        }
    }

    /**
     * Animate an attack from one entity to another
     */
    animateAttack(
        attackerId: string,
        targetId: string,
        damage: number,
        onComplete?: () => void
    ): void {
        if (DEBUG) console.log('[LocalMapStage] animateAttack called', { attackerId, targetId, damage, availableIds: Array.from(this.entityCards.keys()) });
        const attackerCard = this.entityCards.get(attackerId);
        const targetCard = this.entityCards.get(targetId);

        if (!attackerCard || !targetCard) {
            if (DEBUG) console.warn('[LocalMapStage] Missing cards for attack animation', { hasAttacker: !!attackerCard, hasTarget: !!targetCard });
            onComplete?.();
            return;
        }

        // Animate attacker lunging toward target
        attackerCard.animateAttack(
            targetCard.x,
            targetCard.y,
            // On hit: flash target, show damage, and play melee impact effect
            () => {
                targetCard.playDamageFlash();
                if (damage > 0) {
                    this.showDamageNumber(targetCard.x, targetCard.y, damage);
                    // Play melee impact with blood spray
                    this.playMeleeImpactEffect(targetCard.x, targetCard.y, attackerCard.x, attackerCard.y);
                }
            },
            // On complete
            onComplete
        );
    }

    /**
     * Play a ranged attack projectile effect from attacker to target.
     * Returns a promise that resolves when the projectile hits.
     */
    async playRangedAttackEffect(
        attackerId: string,
        targetId: string,
        onHit?: () => void
    ): Promise<void> {
        const attackerCard = this.entityCards.get(attackerId);
        const targetCard = this.entityCards.get(targetId);

        if (!attackerCard || !targetCard || !this.particleSystem) {
            onHit?.();
            return;
        }

        // Play projectile from attacker to target
        await this.particleSystem.playProjectile(
            attackerCard.x,
            attackerCard.y - 40, // Offset up to fire from "hands" not feet
            targetCard.x,
            targetCard.y - 40,
            PROJECTILE_PRESETS.energy
        );

        // Impact burst at target
        this.particleSystem.playImpact(targetCard.x, targetCard.y - 40, EFFECT_COLORS.physical, 1.2);

        onHit?.();
    }

    /**
     * Play melee impact effect at target position with blood spray.
     */
    playMeleeImpactEffect(
        targetX: number,
        targetY: number,
        attackerX: number,
        attackerY: number
    ): void {
        if (!this.particleSystem) return;

        // Calculate direction away from attacker (for blood spray)
        const dx = targetX - attackerX;
        const dy = targetY - attackerY;
        const awayAngle = Math.atan2(dy, dx);

        // Impact flash (white/yellow)
        this.particleSystem.playImpact(targetX, targetY - 40, EFFECT_COLORS.physical, 0.8);

        // Blood splatter spraying away from attacker
        this.particleSystem.emitDirectional({
            x: targetX,
            y: targetY - 40,
            direction: awayAngle,
            count: 8,
            color: EFFECT_COLORS.blood,
            speed: 120,
            lifetime: 0.3,
            spread: Math.PI / 3,
            gravity: 150,
            fadeOut: true,
            shrink: true,
            initialScale: 0.7,
        });
    }

    /**
     * Play a miss/whiff effect at target position.
     */
    playMissEffect(targetId: string): void {
        const targetCard = this.entityCards.get(targetId);
        if (!targetCard || !this.particleSystem) return;

        this.particleSystem.playWhiff(targetCard.x, targetCard.y - 40);
    }

    /**
     * Play ranged attack with full effect sequence.
     * @param attackerId Attacker entity ID
     * @param targetId Target entity ID
     * @param damage Damage dealt (0 for miss)
     * @param isCritical Whether it's a critical hit
     * @param onComplete Called when all effects finish
     */
    async playRangedAttackSequence(
        attackerId: string,
        targetId: string,
        damage: number,
        isCritical: boolean = false,
        onComplete?: () => void
    ): Promise<void> {
        const targetCard = this.entityCards.get(targetId);
        if (!targetCard) {
            onComplete?.();
            return;
        }

        // Play projectile and wait for it to hit
        await this.playRangedAttackEffect(attackerId, targetId, () => {
            // On hit: flash target and show damage
            if (damage > 0) {
                targetCard.playDamageFlash();
                this.showDamageNumber(targetCard.x, targetCard.y, damage, isCritical);
            }
        });

        onComplete?.();
    }

    /**
     * Show a floating damage number at a position
     */
    showDamageNumber(x: number, y: number, damage: number, isCritical: boolean = false): void {
        const damageText = new PIXI.Text({
            text: `-${damage}`,
            style: {
                fontFamily: 'Poppins, system-ui, sans-serif',
                fontSize: isCritical ? 28 : 22,
                fontWeight: 'bold',
                fill: isCritical ? 0xFFD700 : 0xFF4444,
                stroke: { color: 0x000000, width: 3 },
                dropShadow: {
                    color: 0x000000,
                    alpha: 0.8,
                    blur: 4,
                    distance: 2,
                },
            },
            resolution: TEXT_RESOLUTION,
        });

        damageText.anchor.set(0.5);
        damageText.x = x;
        damageText.y = y - 20;
        damageText.alpha = 1;
        damageText.eventMode = 'none'; // Don't block clicks on entities below

        this.uiLayer.addChild(damageText);

        // Animate: float up and fade out
        const startTime = performance.now();
        const duration = 800;
        const startY = damageText.y;

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out quad for smooth deceleration
            const eased = 1 - Math.pow(1 - progress, 2);

            // Float up
            damageText.y = startY - 40 * eased;

            // Fade out in second half
            if (progress > 0.5) {
                damageText.alpha = 1 - ((progress - 0.5) * 2);
            }

            // Scale bounce at start
            if (progress < 0.1) {
                const bounce = 1 + Math.sin(progress * Math.PI * 10) * 0.1;
                damageText.scale.set(bounce);
            } else {
                damageText.scale.set(1);
            }

            if (this.isDestroyed) {
                // Component destroyed, don't try to clean up (already handled)
                return;
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.uiLayer.removeChild(damageText);
                damageText.destroy();
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Show a miss indicator at a position
     */
    showMissIndicator(x: number, y: number): void {
        const missText = new PIXI.Text({
            text: 'MISS',
            style: {
                fontFamily: 'Poppins, system-ui, sans-serif',
                fontSize: 18,
                fontWeight: 'bold',
                fill: 0xAAAAAA,
                stroke: { color: 0x000000, width: 2 },
            },
            resolution: TEXT_RESOLUTION,
        });

        missText.anchor.set(0.5);
        missText.x = x;
        missText.y = y - 20;
        missText.alpha = 1;
        missText.eventMode = 'none'; // Don't block clicks on entities below

        this.uiLayer.addChild(missText);

        // Animate: float up and fade out
        const startTime = performance.now();
        const duration = 600;
        const startY = missText.y;

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            if (this.isDestroyed) {
                // Component destroyed, don't try to clean up (already handled)
                return;
            }

            missText.y = startY - 30 * progress;
            missText.alpha = 1 - progress;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.uiLayer.removeChild(missText);
                missText.destroy();
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Cleanup
     */
    destroy(options?: boolean | PIXI.DestroyOptions): void {
        // Set destroyed flag FIRST to stop any pending animations
        this.isDestroyed = true;

        // Clear uiLayer children first without destroying (they may have pending animations)
        // The children will be destroyed when we destroy the layer with { children: true }
        this.uiLayer.removeChildren();

        // Destroy tiles
        for (const row of this.tiles) {
            for (const tile of row) {
                tile.destroy();
            }
        }
        this.tiles = [];

        // Destroy entity cards
        for (const card of this.entityCards.values()) {
            card.destroy();
        }
        this.entityCards.clear();

        // Destroy background
        if (this.backgroundSprite) {
            this.backgroundSprite.destroy();
            this.backgroundSprite = null;
        }
        if (this.backgroundOverlay) {
            this.backgroundOverlay.destroy();
            this.backgroundOverlay = null;
        }

        // Destroy particle system
        if (this.particleSystem) {
            this.particleSystem.destroy();
            this.particleSystem = null;
        }

        // Destroy layers - wrap in try/catch to prevent texture pool errors from crashing
        try {
            this.backgroundLayer.destroy({ children: true });
            this.gridLayer.destroy({ children: true });
            this.threatZoneLayer.destroy({ children: true });
            this.exitLayer.destroy({ children: true });
            this.entityShadowLayer.destroy({ children: true });
            this.entityLayer.destroy({ children: true });
            this.effectsLayer.destroy({ children: true });
            this.uiLayer.destroy({ children: true });

            // Destroy content container
            this.contentContainer.destroy({ children: true });
        } catch (error) {
            console.warn('[LocalMapStage] Error during layer cleanup (likely texture pool race):', error);
        }

        super.destroy(options);
    }
}
