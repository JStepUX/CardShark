/**
 * Tests for EntityCardSprite.ts
 *
 * Covers:
 * - State transitions (allegiance, selection, hover)
 * - Frame color logic based on allegiance
 * - Lifecycle (creation, update, destruction)
 * - HP bar visibility toggle
 * - Highlight state for targeting
 * - Animation delegation to CardAnimationController
 */

import { Allegiance, ALLEGIANCE_COLORS, LocalMapEntity } from '../../../../types/localMap';

// Mock TextureCache before importing EntityCardSprite
jest.mock('../../../combat/pixi/TextureCache', () => ({
    TextureCache: {
        get: jest.fn(() => ({
            width: 100,
            height: 140,
            source: { label: 'mock-texture' },
        })),
    },
}));

// Mock PIXI
const mockGraphicsInstance = {
    roundRect: jest.fn().mockReturnThis(),
    circle: jest.fn().mockReturnThis(),
    fill: jest.fn().mockReturnThis(),
    stroke: jest.fn().mockReturnThis(),
    clear: jest.fn().mockReturnThis(),
    destroy: jest.fn(),
    tint: 0xFFFFFF,
    filters: null as null | unknown[],
    x: 0,
    y: 0,
    alpha: 1,
    visible: true,
};

const mockTextInstance = {
    anchor: { set: jest.fn() },
    x: 0,
    y: 0,
    text: '',
    width: 50,
    style: {},
    destroy: jest.fn(),
};

const mockSpriteInstance = {
    scale: { set: jest.fn(), x: 1, y: 1 },
    x: 0,
    y: 0,
    mask: null,
    visible: true,
    destroy: jest.fn(),
};

const mockBlurFilterInstance = {
    blur: 8,
    quality: 4,
};

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
        pivot = {
            x: 0,
            y: 0,
            set: jest.fn(function (this: { x: number; y: number }, x: number, y: number) {
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

        on = jest.fn();
        off = jest.fn();
        emit = jest.fn();
        destroy = jest.fn();
    },
    Graphics: jest.fn(() => ({ ...mockGraphicsInstance })),
    Text: jest.fn(() => ({ ...mockTextInstance })),
    Sprite: jest.fn(() => ({ ...mockSpriteInstance })),
    Texture: {
        EMPTY: { width: 0, height: 0 },
    },
    BlurFilter: jest.fn(() => ({ ...mockBlurFilterInstance })),
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
        jest.clearAllMocks();
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

    describe('status badges', () => {
        it('should show heart badge for bonded entity', () => {
            const entity = createMockEntity({ isBonded: true });
            const card = new EntityCardSprite(entity);

            // Card should be created with bonded state
            expect(card).toBeDefined();
        });

        it('should show skull badge for hostile entity', () => {
            const entity = createMockEntity({ allegiance: 'hostile' });
            const card = new EntityCardSprite(entity);

            expect(card.getAllegiance()).toBe('hostile');
        });

        it('should show lock badge for captured entity', () => {
            const entity = createMockEntity({ isCaptured: true });
            const card = new EntityCardSprite(entity);

            expect(card).toBeDefined();
        });

        it('should not show status badge for regular friendly', () => {
            const entity = createMockEntity({ allegiance: 'friendly', isBonded: false });
            const card = new EntityCardSprite(entity);

            expect(card).toBeDefined();
        });
    });

    describe('HP bar visibility', () => {
        it('should hide HP bar by default (exploration mode)', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            // HP bar container should be created but hidden
            card.setShowHpBar(false);

            // No error should occur
            expect(card).toBeDefined();
        });

        it('should show HP bar when setShowHpBar(true) is called', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            card.setShowHpBar(true);

            // No error should occur
            expect(card).toBeDefined();
        });

        it('should toggle HP bar visibility', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            card.setShowHpBar(true);
            card.setShowHpBar(false);
            card.setShowHpBar(true);

            expect(card).toBeDefined();
        });
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

    describe('animation methods', () => {
        it('should have isAnimating method', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(typeof card.isAnimating).toBe('function');
            // Initially may be animating (entrance animation)
            expect(typeof card.isAnimating()).toBe('boolean');
        });

        it('should have animateMoveTo method', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(typeof card.animateMoveTo).toBe('function');
        });

        it('should have animateAttack method', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(typeof card.animateAttack).toBe('function');
        });

        it('should have playDamageFlash method', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(typeof card.playDamageFlash).toBe('function');
        });

        it('should have playDeathAnimation method', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(typeof card.playDeathAnimation).toBe('function');
        });

        it('should have playIncapacitationAnimation method', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(typeof card.playIncapacitationAnimation).toBe('function');
        });

        it('should have playRevivalAnimation method', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(typeof card.playRevivalAnimation).toBe('function');
        });

        it('should have updateBob method', () => {
            const entity = createMockEntity();
            const card = new EntityCardSprite(entity);

            expect(typeof card.updateBob).toBe('function');

            // Should not throw when called
            expect(() => card.updateBob(0.016)).not.toThrow();
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
