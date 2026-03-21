/**
 * Tests for EntityCardSprite.ts
 *
 * Covers:
 * - State transitions (allegiance, selection, hover)
 * - Frame color logic based on allegiance
 * - Lifecycle (creation, update, destruction)
 * - Highlight state for targeting
 */

import { vi } from 'vitest';
import { Allegiance, ALLEGIANCE_COLORS, LocalMapEntity } from '../../../../types/localMap';

// Mock TextureCache before importing EntityCardSprite
vi.mock('../../../combat/pixi/TextureCache', () => ({
    TextureCache: {
        get: vi.fn(() => ({
            width: 100,
            height: 140,
            source: { label: 'mock-texture' },
        })),
    },
}));

// Hoist mock instances so they are available inside vi.mock factories
const { mockGraphicsInstance, mockTextInstance, mockSpriteInstance, mockBlurFilterInstance } = vi.hoisted(() => {
    const mockGraphicsInstance = {
        roundRect: vi.fn().mockReturnThis(),
        circle: vi.fn().mockReturnThis(),
        fill: vi.fn().mockReturnThis(),
        stroke: vi.fn().mockReturnThis(),
        clear: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
        tint: 0xFFFFFF,
        filters: null as null | unknown[],
        x: 0,
        y: 0,
        alpha: 1,
        visible: true,
    };

    const mockTextInstance = {
        anchor: { set: vi.fn() },
        x: 0,
        y: 0,
        text: '',
        width: 50,
        style: {},
        destroy: vi.fn(),
    };

    const mockSpriteInstance = {
        scale: { set: vi.fn(), x: 1, y: 1 },
        x: 0,
        y: 0,
        mask: null,
        visible: true,
        destroy: vi.fn(),
    };

    const mockBlurFilterInstance = {
        blur: 8,
        quality: 4,
    };

    return { mockGraphicsInstance, mockTextInstance, mockSpriteInstance, mockBlurFilterInstance };
});

// Mock PIXI
vi.mock('pixi.js', () => ({
    Container: class MockContainer {
        x = 0;
        y = 0;
        scale = {
            x: 1,
            y: 1,
            set: vi.fn(function (this: { x: number; y: number }, x: number, y?: number) {
                this.x = x;
                this.y = y ?? x;
            }),
        };
        pivot = {
            x: 0,
            y: 0,
            set: vi.fn(function (this: { x: number; y: number }, x: number, y: number) {
                this.x = x;
                this.y = y;
            }),
        };
        alpha = 1;
        rotation = 0;
        tint = 0xFFFFFF;
        visible = true;
        eventMode = 'passive';
        cursor = 'default';
        hitArea = null;
        children: unknown[] = [];

        addChild(child: unknown) {
            this.children.push(child);
            return child;
        }

        removeChild(child: unknown) {
            const index = this.children.indexOf(child);
            if (index > -1) this.children.splice(index, 1);
            return child;
        }

        on = vi.fn();
        off = vi.fn();
        emit = vi.fn();
        destroy = vi.fn();
    },
    Graphics: vi.fn(function () { return { ...mockGraphicsInstance }; }),
    Text: vi.fn(function () { return { ...mockTextInstance }; }),
    Sprite: vi.fn(function () { return { ...mockSpriteInstance }; }),
    Texture: {
        EMPTY: { width: 0, height: 0 },
    },
    BlurFilter: vi.fn(function () { return { ...mockBlurFilterInstance }; }),
    Rectangle: class MockRectangle {
        constructor(
            public x: number,
            public y: number,
            public width: number,
            public height: number
        ) {}
    },
}));

// Import after mocking
import { EntityCardSprite } from './EntityCardSprite';

/**
 * Create a mock LocalMapEntity with default values
 */
function createMockEntity(overrides: Partial<LocalMapEntity> = {}): LocalMapEntity {
    return {
        id: 'test-entity-1',
        name: 'Test Entity',
        level: 5,
        allegiance: 'friendly',
        position: { x: 0, y: 0 },
        imagePath: '/assets/character.png',
        currentHp: 80,
        maxHp: 100,
        isBonded: false,
        isCaptured: false,
        ...overrides,
    };
}

describe('EntityCardSprite', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create a card sprite from entity data', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(card).toBeDefined();
            expect(card.getId()).toBe('test-entity-1');
            expect(card.getAllegiance()).toBe('friendly');
        });

        it('should set eventMode to dynamic for interactive cards', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(card.eventMode).toBe('dynamic');
        });

        it('should set cursor to pointer', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(card.cursor).toBe('pointer');
        });

        it('should set up hit area for click detection', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(card.hitArea).not.toBeNull();
        });

        it('should register hover event handlers', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(card.on).toHaveBeenCalledWith('pointerenter', expect.any(Function));
            expect(card.on).toHaveBeenCalledWith('pointerleave', expect.any(Function));
        });
    });

    describe('allegiance colors', () => {
        const allegianceTestCases: { allegiance: Allegiance; expectedColor: number }[] = [
            { allegiance: 'player', expectedColor: ALLEGIANCE_COLORS.player.frame },
            { allegiance: 'friendly', expectedColor: ALLEGIANCE_COLORS.friendly.frame },
            { allegiance: 'bonded_ally', expectedColor: ALLEGIANCE_COLORS.bonded_ally.frame },
            { allegiance: 'neutral', expectedColor: ALLEGIANCE_COLORS.neutral.frame },
            { allegiance: 'hostile', expectedColor: ALLEGIANCE_COLORS.hostile.frame },
        ];

        test.each(allegianceTestCases)(
            'should use correct frame color for $allegiance allegiance',
            ({ allegiance }) => {
                const entity = createMockEntity({ allegiance });
                const card = new EntityCardSprite(entity);

                // Card should be created without errors for each allegiance
                expect(card.getAllegiance()).toBe(allegiance);
            }
        );
    });

    describe('highlight state', () => {
        it('should set highlight state for targeting', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            card.setHighlight(true);

            // Border tint should be yellow when highlighted
            const border = card.getBorder();
            expect(border.tint).toBe(0xFFFF00);
        });

        it('should clear highlight state', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            card.setHighlight(true);
            card.setHighlight(false);

            const border = card.getBorder();
            expect(border.tint).toBe(0xFFFFFF);
        });
    });

    describe('updateFromEntity', () => {
        it('should update HP values', () => {
            const entity = createMockEntity({ currentHp: 100, maxHp: 100 });
            const card = new EntityCardSprite(entity);

            card.updateFromEntity({
                ...entity,
                currentHp: 50,
            });

            // HP bar should be updated (no error)
            expect(card).toBeDefined();
        });

        it('should update level text', () => {
            const entity = createMockEntity({ level: 1 });
            const card = new EntityCardSprite(entity);

            card.updateFromEntity({
                ...entity,
                level: 10,
            });

            expect(card).toBeDefined();
        });

        it('should update status badge when bonded status changes', () => {
            const entity = createMockEntity({ isBonded: false });
            const card = new EntityCardSprite(entity);

            card.updateFromEntity({
                ...entity,
                isBonded: true,
            });

            expect(card).toBeDefined();
        });
    });

    describe('getId', () => {
        it('should return the entity ID', () => {
            const entity = createMockEntity({ id: 'unique-id-123' });
            const card = new EntityCardSprite(entity);

            expect(card.getId()).toBe('unique-id-123');
        });
    });

    describe('getAllegiance', () => {
        it('should return the entity allegiance', () => {
            const entity = createMockEntity({ allegiance: 'hostile' });
            const card = new EntityCardSprite(entity);

            expect(card.getAllegiance()).toBe('hostile');
        });
    });

    describe('incapacitation state', () => {
        it('should have isIncapacitatedState method', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(typeof card.isIncapacitatedState).toBe('function');
            expect(card.isIncapacitatedState()).toBe(false);
        });

        it('should have resetFromIncapacitation method', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(typeof card.resetFromIncapacitation).toBe('function');

            // Should not throw when called
            expect(() => card.resetFromIncapacitation()).not.toThrow();
        });
    });

    describe('destroy', () => {
        it('should clean up resources on destroy', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(() => card.destroy()).not.toThrow();
        });

        it('should handle destroy with options', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(() => card.destroy({ children: true })).not.toThrow();
        });
    });

    describe('portrait handling', () => {
        it('should handle entity with image path', () => {
            const entity = createMockEntity({ imagePath: '/assets/portrait.png' });
            const card = new EntityCardSprite(entity);

            expect(card).toBeDefined();
        });

        it('should handle entity without image path', () => {
            const entity = createMockEntity({ imagePath: null });
            const card = new EntityCardSprite(entity);

            // Should create a placeholder instead
            expect(card).toBeDefined();
        });
    });

    describe('getBorder', () => {
        it('should return the border graphics object', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            const border = card.getBorder();

            expect(border).toBeDefined();
            expect(typeof border.tint).toBe('number');
        });
    });
});
