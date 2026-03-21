/**
 * Tests for LocalMapStage.ts
 *
 * Covers:
 * - Grid coordinate calculations
 * - Entity placement logic
 * - Tile state management
 * - Stage dimensions calculation
 * - Layer hierarchy
 * - Combat mode transitions
 * - Entity card management (add, update, remove)
 * - Viewport zoom/pan operations
 */

import { LocalMapState, LocalMapEntity, LocalMapTileData, TilePosition, ExitTile, LocalMapConfig, LOCAL_MAP_ZOOM } from '../../../../types/localMap';

// Mock dependencies before importing LocalMapStage
jest.mock('../../../combat/pixi/TextureCache', () => ({
    TextureCache: {
        get: jest.fn(() => ({
            width: 100,
            height: 140,
            source: { label: 'mock-texture' },
        })),
    },
}));

// Track created tiles and entities for verification
const createdTiles: unknown[] = [];
const createdEntityCards: Map<string, unknown> = new Map();

// Mock LocalMapTile
jest.mock('./LocalMapTile', () => ({
    LocalMapTile: jest.fn().mockImplementation((position, size) => {
        const tile = {
            x: 0,
            y: 0,
            position,
            size,
            highlight: 'none',
            isExit: false,
            exitDirection: null,
            traversable: true,
            zoneType: null,
            gridLineAlpha: 1,
            on: jest.fn(),
            setHighlight: jest.fn(function (this: { highlight: string }, h: string) {
                this.highlight = h;
            }),
            clearExit: jest.fn(function (this: { isExit: boolean; exitDirection: string | null }) {
                this.isExit = false;
                this.exitDirection = null;
            }),
            setExit: jest.fn(function (this: { isExit: boolean; exitDirection: string }, dir: string) {
                this.isExit = true;
                this.exitDirection = dir;
            }),
            setTraversable: jest.fn(function (
                this: { traversable: boolean; zoneType: string | null },
                t: boolean,
                z?: string
            ) {
                this.traversable = t;
                this.zoneType = z ?? null;
            }),
            setGridLineAlpha: jest.fn(function (this: { gridLineAlpha: number }, a: number) {
                this.gridLineAlpha = a;
            }),
            getIsExit: jest.fn(function (this: { isExit: boolean }) {
                return this.isExit;
            }),
            getPosition: jest.fn(function (this: { position: TilePosition }) {
                return this.position;
            }),
            updatePulse: jest.fn(),
            destroy: jest.fn(),
        };
        createdTiles.push(tile);
        return tile;
    }),
}));

// Mock EntityCardSprite
jest.mock('./EntityCardSprite', () => ({
    EntityCardSprite: jest.fn().mockImplementation((entity) => {
        const card = {
            x: 0,
            y: 0,
            entityId: entity.id,
            entity,
            showHpBar: false,
            highlighted: false,
            isAnimatingFlag: false,
            scale: {
                x: 1,
                y: 1,
                set: jest.fn(function (this: { x: number; y: number }, x: number, y?: number) {
                    this.x = x;
                    this.y = y ?? x;
                }),
            },
            on: jest.fn(),
            updateFromEntity: jest.fn(function (this: { entity: LocalMapEntity }, e: LocalMapEntity) {
                this.entity = e;
            }),
            setShowHpBar: jest.fn(function (this: { showHpBar: boolean }, show: boolean) {
                this.showHpBar = show;
            }),
            setHighlight: jest.fn(function (this: { highlighted: boolean }, h: boolean) {
                this.highlighted = h;
            }),
            animateMoveTo: jest.fn(),
            animateAttack: jest.fn(),
            playDamageFlash: jest.fn(),
            isAnimating: jest.fn(function (this: { isAnimatingFlag: boolean }) {
                return this.isAnimatingFlag;
            }),
            updateBob: jest.fn(),
            destroy: jest.fn(),
        };
        createdEntityCards.set(entity.id, card);
        return card;
    }),
}));

// Mock CombatParticleSystem
jest.mock('./CombatParticleSystem', () => ({
    CombatParticleSystem: jest.fn().mockImplementation(() => ({
        playImpact: jest.fn(),
        playProjectile: jest.fn().mockResolvedValue(undefined),
        playWhiff: jest.fn(),
        emitDirectional: jest.fn(),
        destroy: jest.fn(),
    })),
    EFFECT_COLORS: {
        physical: 0xFFFFFF,
        blood: 0xFF0000,
    },
    PROJECTILE_PRESETS: {
        energy: { color: 0x00FF00 },
    },
}));

// Mock PIXI
jest.mock('pixi.js', () => ({
    Container: class MockContainer {
        x = 0;
        y = 0;
        scale = {
            x: 1,
            y: 1,
            set: jest.fn(function (this: { x: number; y: number }, x: number, y?: number) {
                this.x = x;
                this.y = y ?? x;
            }),
        };
        eventMode = 'passive';
        cullable = false;
        cullableChildren = false;
        children: unknown[] = [];

        addChild(child: unknown) {
            this.children.push(child);
            return child;
        }

        addChildAt(child: unknown, index: number) {
            this.children.splice(index, 0, child);
            return child;
        }

        removeChild(child: unknown) {
            const index = this.children.indexOf(child);
            if (index > -1) this.children.splice(index, 1);
            return child;
        }

        removeChildren() {
            this.children = [];
        }

        on = jest.fn();
        off = jest.fn();
        emit = jest.fn();
        destroy = jest.fn();
    },
    Graphics: jest.fn(() => ({
        x: 0,
        y: 0,
        rect: jest.fn().mockReturnThis(),
        roundRect: jest.fn().mockReturnThis(),
        fill: jest.fn().mockReturnThis(),
        destroy: jest.fn(),
    })),
    Sprite: jest.fn(() => ({
        x: 0,
        y: 0,
        scale: { set: jest.fn() },
        destroy: jest.fn(),
    })),
    Text: jest.fn(() => ({
        x: 0,
        y: 0,
        anchor: { set: jest.fn() },
        alpha: 1,
        scale: { set: jest.fn() },
        eventMode: 'passive',
        destroy: jest.fn(),
    })),
    Assets: {
        load: jest.fn().mockResolvedValue({
            width: 400,
            height: 300,
        }),
    },
    Application: jest.fn(),
    ColorMatrixFilter: jest.fn(() => ({
        desaturate: jest.fn(),
    })),
}));

// Import after mocking
import { LocalMapStage } from './LocalMapStage';

/**
 * Create a minimal LocalMapState for testing
 */
function createMockState(overrides: Partial<LocalMapState> = {}): LocalMapState {
    const config: LocalMapConfig = {
        gridWidth: 9,
        gridHeight: 9,
        tileSize: 80,
        backgroundImage: null,
    };

    // Create default tile data
    const tiles: LocalMapTileData[][] = [];
    for (let y = 0; y < 9; y++) {
        const row: LocalMapTileData[] = [];
        for (let x = 0; x < 9; x++) {
            row.push({
                position: { x, y },
                traversable: true,
                terrainType: 'normal',
                highlight: 'none',
                isExit: false,
            });
        }
        tiles.push(row);
    }

    return {
        roomId: 'test-room-id',
        roomName: 'Test Room',
        config,
        tiles,
        entities: [],
        playerPosition: { x: 4, y: 4 },  // Center of 9x9 grid
        exits: [],
        threatZones: [],
        inCombat: false,
        ...overrides,
    };
}

/**
 * Create a mock entity
 */
function createMockEntity(overrides: Partial<LocalMapEntity> = {}): LocalMapEntity {
    return {
        id: `entity-${Date.now()}-${Math.random()}`,
        name: 'Test Entity',
        level: 5,
        allegiance: 'friendly',
        position: { x: 0, y: 0 },
        imagePath: '/assets/character.png',
        currentHp: 100,
        maxHp: 100,
        isBonded: false,
        isCaptured: false,
        ...overrides,
    };
}

describe('LocalMapStage', () => {
    beforeEach(() => {
        createdTiles.length = 0;
        createdEntityCards.clear();
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create with default configuration', () => {
            const stage = new LocalMapStage();

            expect(stage).toBeDefined();
        });

        it('should accept custom configuration', () => {
            const stage = new LocalMapStage({
                gridWidth: 10,
                gridHeight: 12,
                tileSize: 100,
            });

            expect(stage).toBeDefined();
        });

        it('should create correct number of tiles', () => {
            const stage = new LocalMapStage({
                gridWidth: 9,
                gridHeight: 9,
            });

            // 9 * 9 = 81 tiles
            expect(createdTiles.length).toBe(81);

            stage.destroy();
        });

        it('should calculate stage dimensions correctly', () => {
            const tileSize = 80;
            const gap = 2;
            const stage = new LocalMapStage({
                gridWidth: 9,
                gridHeight: 9,
                tileSize,
            });

            const dims = stage.getStageDimensions();

            expect(dims.width).toBe(9 * (tileSize + gap));
            expect(dims.height).toBe(9 * (tileSize + gap));

            stage.destroy();
        });
    });

    describe('updateFromState', () => {
        it('should update with new state', () => {
            const stage = new LocalMapStage();
            const state = createMockState();

            expect(() => stage.updateFromState(state)).not.toThrow();

            stage.destroy();
        });

        it('should update tile traversability', () => {
            const stage = new LocalMapStage();
            const state = createMockState();

            // Make some tiles non-traversable
            state.tiles[0][0].traversable = false;
            state.tiles[1][1].traversable = false;

            stage.updateFromState(state);

            // Verify tiles were updated
            const tile00 = createdTiles.find(
                (t: unknown) => (t as { position: TilePosition }).position.x === 0 && (t as { position: TilePosition }).position.y === 0
            ) as { setTraversable: jest.Mock };
            expect(tile00.setTraversable).toHaveBeenCalledWith(false, undefined);

            stage.destroy();
        });

        it('should add entities from state', () => {
            const stage = new LocalMapStage();
            const entity = createMockEntity({ id: 'player-1', allegiance: 'player' });
            const state = createMockState({
                entities: [entity],
            });

            stage.updateFromState(state);

            expect(createdEntityCards.has('player-1')).toBe(true);

            stage.destroy();
        });

        it('should remove entities no longer in state', () => {
            const stage = new LocalMapStage();
            const entity = createMockEntity({ id: 'temp-entity' });

            // First update with entity
            stage.updateFromState(createMockState({ entities: [entity] }));
            expect(createdEntityCards.has('temp-entity')).toBe(true);

            // Second update without entity
            stage.updateFromState(createMockState({ entities: [] }));

            // Entity card should be destroyed (checked via mock)
            const card = createdEntityCards.get('temp-entity') as { destroy: jest.Mock };
            expect(card.destroy).toHaveBeenCalled();

            stage.destroy();
        });

        it('should update existing entities', () => {
            const stage = new LocalMapStage();
            const entity = createMockEntity({ id: 'update-entity', currentHp: 100 });

            stage.updateFromState(createMockState({ entities: [entity] }));

            // Update with changed HP
            const updatedEntity = { ...entity, currentHp: 50 };
            stage.updateFromState(createMockState({ entities: [updatedEntity] }));

            const card = createdEntityCards.get('update-entity') as { updateFromEntity: jest.Mock };
            expect(card.updateFromEntity).toHaveBeenCalledWith(expect.objectContaining({ currentHp: 50 }));

            stage.destroy();
        });

        it('should update exits', () => {
            const stage = new LocalMapStage();
            const exits: ExitTile[] = [
                { position: { x: 2, y: 0 }, direction: 'north', targetRoomId: 'room-north', targetRoomName: 'North Room' },
                { position: { x: 4, y: 4 }, direction: 'east', targetRoomId: 'room-east', targetRoomName: 'East Room' },
            ];

            const state = createMockState({ exits });
            stage.updateFromState(state);

            // Verify exit tiles were set
            const topTile = createdTiles.find(
                (t: unknown) => (t as { position: TilePosition }).position.x === 2 && (t as { position: TilePosition }).position.y === 0
            ) as { setExit: jest.Mock };
            expect(topTile.setExit).toHaveBeenCalledWith('north', 'North Room');

            stage.destroy();
        });

        it('should update threat zones', () => {
            const stage = new LocalMapStage();
            const threatZones: TilePosition[] = [
                { x: 1, y: 1 },
                { x: 1, y: 2 },
                { x: 2, y: 1 },
            ];

            const state = createMockState({ threatZones, inCombat: false });
            stage.updateFromState(state);

            // Verify threat zone highlights
            const tile11 = createdTiles.find(
                (t: unknown) => (t as { position: TilePosition }).position.x === 1 && (t as { position: TilePosition }).position.y === 1
            ) as { setHighlight: jest.Mock };
            expect(tile11.setHighlight).toHaveBeenCalledWith('threat_zone');

            stage.destroy();
        });

        it('should not show threat zones during combat', () => {
            const stage = new LocalMapStage();
            const threatZones: TilePosition[] = [{ x: 1, y: 1 }];

            const state = createMockState({ threatZones, inCombat: true });
            stage.updateFromState(state);

            // In combat mode, threat zones should not be highlighted
            const tile11 = createdTiles.find(
                (t: unknown) => (t as { position: TilePosition }).position.x === 1 && (t as { position: TilePosition }).position.y === 1
            ) as { setHighlight: jest.Mock };

            // Last highlight should be 'none' (cleared)
            const lastCall = tile11.setHighlight.mock.calls[tile11.setHighlight.mock.calls.length - 1];
            expect(lastCall[0]).toBe('none');

            stage.destroy();
        });
    });

    describe('combat mode', () => {
        it('should set combat mode on entities', () => {
            const stage = new LocalMapStage();
            const entity = createMockEntity({ id: 'combat-entity' });

            stage.updateFromState(createMockState({ entities: [entity] }));
            stage.setCombatMode(true);

            const card = createdEntityCards.get('combat-entity') as { setShowHpBar: jest.Mock };
            expect(card.setShowHpBar).toHaveBeenCalledWith(true);

            stage.destroy();
        });

        it('should hide HP bars when exiting combat', () => {
            const stage = new LocalMapStage();
            const entity = createMockEntity({ id: 'combat-entity' });

            stage.updateFromState(createMockState({ entities: [entity] }));
            stage.setCombatMode(true);
            stage.setCombatMode(false);

            const card = createdEntityCards.get('combat-entity') as { setShowHpBar: jest.Mock };
            // Last call should be with false
            const lastCall = card.setShowHpBar.mock.calls[card.setShowHpBar.mock.calls.length - 1];
            expect(lastCall[0]).toBe(false);

            stage.destroy();
        });
    });

    describe('valid moves and attack range', () => {
        it('should show valid movement tiles', () => {
            const stage = new LocalMapStage();
            stage.updateFromState(createMockState());

            const validMoves: TilePosition[] = [
                { x: 1, y: 1 },
                { x: 2, y: 1 },
                { x: 3, y: 1 },
            ];

            stage.showValidMoves(validMoves);

            validMoves.forEach((pos) => {
                const tile = createdTiles.find(
                    (t: unknown) => (t as { position: TilePosition }).position.x === pos.x && (t as { position: TilePosition }).position.y === pos.y
                ) as { setHighlight: jest.Mock };
                expect(tile.setHighlight).toHaveBeenCalledWith('valid_movement');
            });

            stage.destroy();
        });

        it('should show attack range tiles', () => {
            const stage = new LocalMapStage();
            stage.updateFromState(createMockState());

            const attackRange: TilePosition[] = [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
            ];

            stage.showAttackRange(attackRange);

            attackRange.forEach((pos) => {
                const tile = createdTiles.find(
                    (t: unknown) => (t as { position: TilePosition }).position.x === pos.x && (t as { position: TilePosition }).position.y === pos.y
                ) as { setHighlight: jest.Mock };
                expect(tile.setHighlight).toHaveBeenCalledWith('attack_range');
            });

            stage.destroy();
        });

        it('should clear action highlights', () => {
            const stage = new LocalMapStage();
            stage.updateFromState(createMockState());

            stage.showValidMoves([{ x: 1, y: 1 }]);
            stage.clearActionHighlights();

            // After clear, tiles should be reset (to threat zones or none)
            expect(() => stage.clearActionHighlights()).not.toThrow();

            stage.destroy();
        });
    });

    describe('entity highlights', () => {
        it('should highlight entity card for targeting', () => {
            const stage = new LocalMapStage();
            const entity = createMockEntity({ id: 'target-entity' });

            stage.updateFromState(createMockState({ entities: [entity] }));
            stage.highlightEntity('target-entity', true);

            const card = createdEntityCards.get('target-entity') as { setHighlight: jest.Mock };
            expect(card.setHighlight).toHaveBeenCalledWith(true);

            stage.destroy();
        });

        it('should remove entity highlight', () => {
            const stage = new LocalMapStage();
            const entity = createMockEntity({ id: 'target-entity' });

            stage.updateFromState(createMockState({ entities: [entity] }));
            stage.highlightEntity('target-entity', true);
            stage.highlightEntity('target-entity', false);

            const card = createdEntityCards.get('target-entity') as { setHighlight: jest.Mock };
            expect(card.setHighlight).toHaveBeenLastCalledWith(false);

            stage.destroy();
        });

        it('should handle highlighting non-existent entity', () => {
            const stage = new LocalMapStage();
            stage.updateFromState(createMockState());

            // Should not throw
            expect(() => stage.highlightEntity('non-existent', true)).not.toThrow();

            stage.destroy();
        });
    });

    describe('viewport zoom/pan', () => {
        it('should clamp zoom to minimum', () => {
            const stage = new LocalMapStage();

            stage.setZoom(0.1); // Below minimum

            expect(stage.getZoom()).toBeGreaterThanOrEqual(LOCAL_MAP_ZOOM.min);

            stage.destroy();
        });

        it('should clamp zoom to maximum', () => {
            const stage = new LocalMapStage();

            stage.setZoom(5.0); // Above maximum

            expect(stage.getZoom()).toBeLessThanOrEqual(LOCAL_MAP_ZOOM.max);

            stage.destroy();
        });

        it('should set valid zoom level', () => {
            const stage = new LocalMapStage();

            stage.setZoom(1.5);

            expect(stage.getZoom()).toBe(1.5);

            stage.destroy();
        });

        it('should pan viewport', () => {
            const stage = new LocalMapStage();

            const initialPan = stage.getPan();
            stage.pan(50, 30);
            const newPan = stage.getPan();

            expect(newPan.x).toBe(initialPan.x + 50);
            expect(newPan.y).toBe(initialPan.y + 30);

            stage.destroy();
        });

        it('should set absolute pan position', () => {
            const stage = new LocalMapStage();

            stage.setPan(100, 200);
            const pan = stage.getPan();

            expect(pan.x).toBe(100);
            expect(pan.y).toBe(200);

            stage.destroy();
        });

        it('should reset view to defaults', () => {
            const stage = new LocalMapStage();

            stage.setZoom(1.5);
            stage.setPan(100, 100);
            stage.resetView();

            expect(stage.getZoom()).toBe(LOCAL_MAP_ZOOM.default);
            const pan = stage.getPan();
            expect(pan.x).toBe(0);
            expect(pan.y).toBe(0);

            stage.destroy();
        });

        it('should center on tile', () => {
            const stage = new LocalMapStage();

            stage.centerOnTile({ x: 2, y: 4 }, 800, 600);

            // Pan should be adjusted to center the tile
            const pan = stage.getPan();
            expect(typeof pan.x).toBe('number');
            expect(typeof pan.y).toBe('number');

            stage.destroy();
        });

        it('should convert screen to content coordinates', () => {
            const stage = new LocalMapStage();

            stage.setZoom(2.0);
            stage.setPan(100, 50);

            const content = stage.screenToContent(300, 250);

            // (300 - 100) / 2 = 100, (250 - 50) / 2 = 100
            expect(content.x).toBe(100);
            expect(content.y).toBe(100);

            stage.destroy();
        });

        it('should convert content to screen coordinates', () => {
            const stage = new LocalMapStage();

            stage.setZoom(2.0);
            stage.setPan(100, 50);

            const screen = stage.contentToScreen(100, 100);

            // 100 * 2 + 100 = 300, 100 * 2 + 50 = 250
            expect(screen.x).toBe(300);
            expect(screen.y).toBe(250);

            stage.destroy();
        });
    });

    describe('entity card access', () => {
        it('should get entity card by ID', () => {
            const stage = new LocalMapStage();
            const entity = createMockEntity({ id: 'find-me' });

            stage.updateFromState(createMockState({ entities: [entity] }));

            const card = stage.getEntityCard('find-me');
            expect(card).toBeDefined();

            stage.destroy();
        });

        it('should return undefined for non-existent entity', () => {
            const stage = new LocalMapStage();
            stage.updateFromState(createMockState());

            const card = stage.getEntityCard('does-not-exist');
            expect(card).toBeUndefined();

            stage.destroy();
        });

        it('should get entity position', () => {
            const stage = new LocalMapStage();
            const entity = createMockEntity({ id: 'position-test', position: { x: 2, y: 3 } });

            stage.updateFromState(createMockState({ entities: [entity] }));

            const pos = stage.getEntityPosition('position-test');
            expect(pos).not.toBeNull();
            expect(typeof pos?.x).toBe('number');
            expect(typeof pos?.y).toBe('number');

            stage.destroy();
        });

        it('should return null for non-existent entity position', () => {
            const stage = new LocalMapStage();
            stage.updateFromState(createMockState());

            const pos = stage.getEntityPosition('ghost');
            expect(pos).toBeNull();

            stage.destroy();
        });
    });

    describe('animation methods', () => {
        it('should animate entity movement', () => {
            const stage = new LocalMapStage();
            const entity = createMockEntity({ id: 'mover' });

            stage.updateFromState(createMockState({ entities: [entity] }));
            stage.animateEntityMove('mover', { x: 3, y: 4 });

            const card = createdEntityCards.get('mover') as { animateMoveTo: jest.Mock };
            expect(card.animateMoveTo).toHaveBeenCalled();

            stage.destroy();
        });

        it('should handle animating non-existent entity', () => {
            const stage = new LocalMapStage();
            stage.updateFromState(createMockState());

            // Should not throw
            expect(() => stage.animateEntityMove('ghost', { x: 0, y: 0 })).not.toThrow();

            stage.destroy();
        });

        it('should animate attack between entities', () => {
            const stage = new LocalMapStage();
            const attacker = createMockEntity({ id: 'attacker', position: { x: 0, y: 0 } });
            const target = createMockEntity({ id: 'target', position: { x: 1, y: 0 } });

            stage.updateFromState(createMockState({ entities: [attacker, target] }));
            stage.animateAttack('attacker', 'target', 10);

            const attackerCard = createdEntityCards.get('attacker') as { animateAttack: jest.Mock };
            expect(attackerCard.animateAttack).toHaveBeenCalled();

            stage.destroy();
        });

        it('should call onComplete when attack animation finishes for missing cards', () => {
            const stage = new LocalMapStage();
            stage.updateFromState(createMockState());

            const onComplete = jest.fn();
            stage.animateAttack('ghost', 'phantom', 0, onComplete);

            expect(onComplete).toHaveBeenCalled();

            stage.destroy();
        });

        it('should update animations on tick', () => {
            const stage = new LocalMapStage();
            const entity = createMockEntity({ id: 'bobber' });

            stage.updateFromState(createMockState({ entities: [entity] }));

            expect(() => stage.updateAnimations(0.016)).not.toThrow();

            stage.destroy();
        });
    });

    describe('getUILayer', () => {
        it('should return the UI layer container', () => {
            const stage = new LocalMapStage();

            const uiLayer = stage.getUILayer();

            expect(uiLayer).toBeDefined();

            stage.destroy();
        });
    });

    describe('destroy', () => {
        it('should clean up all resources', () => {
            const stage = new LocalMapStage();
            const entity = createMockEntity({ id: 'cleanup-test' });

            stage.updateFromState(createMockState({ entities: [entity] }));

            expect(() => stage.destroy()).not.toThrow();
        });

        it('should handle destroy with options', () => {
            const stage = new LocalMapStage();

            expect(() => stage.destroy({ children: true })).not.toThrow();
        });
    });
});
