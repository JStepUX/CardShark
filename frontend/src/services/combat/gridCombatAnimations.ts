/**
 * @file gridCombatAnimations.ts
 * @description Animation utilities for grid combat visual feedback.
 *
 * Provides:
 * - Movement animation along paths
 * - Attack flash effects
 * - Damage number popups
 * - Death fade effects
 *
 * Works with the existing Pixi rendering system.
 */

import { TilePosition } from '../../types/localMap';

// =============================================================================
// Types
// =============================================================================

export type AnimationType = 'move' | 'attack' | 'damage' | 'heal' | 'death' | 'defend' | 'aoe_blast' | 'buff_apply';

export interface CombatAnimation {
    id: string;
    type: AnimationType;
    entityId: string;
    data: AnimationData;
    duration: number;
    startTime: number;
}

export type AnimationData =
    | MoveAnimationData
    | AttackAnimationData
    | DamageAnimationData
    | DeathAnimationData
    | DefendAnimationData
    | AoEBlastAnimationData
    | BuffApplyAnimationData;

export interface MoveAnimationData {
    type: 'move';
    path: TilePosition[];
    currentStep: number;
}

export interface AttackAnimationData {
    type: 'attack';
    targetPosition: TilePosition;
    isRanged: boolean;
}

export interface DamageAnimationData {
    type: 'damage';
    amount: number;
    isCritical: boolean;
    position: TilePosition;
}

export interface DeathAnimationData {
    type: 'death';
    position: TilePosition;
}

export interface DefendAnimationData {
    type: 'defend';
    position: TilePosition;
}

export interface AoEBlastAnimationData {
    type: 'aoe_blast';
    /** Center of the blast */
    centerPosition: TilePosition;
    /** All affected tile positions */
    affectedTiles: TilePosition[];
    /** Whether this is a bomb (fire) or magic (arcane) blast */
    blastStyle: 'fire' | 'arcane';
}

export interface BuffApplyAnimationData {
    type: 'buff_apply';
    /** Position of the buffed entity */
    position: TilePosition;
    /** Type of buff applied */
    buffType: 'attack' | 'damage' | 'defense';
}

// =============================================================================
// Animation Queue Manager
// =============================================================================

export class AnimationQueue {
    private queue: CombatAnimation[] = [];
    private currentAnimation: CombatAnimation | null = null;
    private onAnimationComplete: (() => void) | null = null;
    private animationFrameId: number | null = null;

    /**
     * Add an animation to the queue.
     */
    enqueue(animation: Omit<CombatAnimation, 'id' | 'startTime'>): void {
        this.queue.push({
            ...animation,
            id: `anim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            startTime: 0,
        });

        if (!this.currentAnimation) {
            this.processNext();
        }
    }

    /**
     * Process the next animation in the queue.
     */
    private processNext(): void {
        if (this.queue.length === 0) {
            this.currentAnimation = null;
            return;
        }

        this.currentAnimation = this.queue.shift()!;
        this.currentAnimation.startTime = performance.now();

        this.tick();
    }

    /**
     * Animation tick - called each frame.
     */
    private tick = (): void => {
        if (!this.currentAnimation) return;

        const elapsed = performance.now() - this.currentAnimation.startTime;
        const progress = Math.min(1, elapsed / this.currentAnimation.duration);

        // Animation complete
        if (progress >= 1) {
            this.onAnimationComplete?.();
            this.processNext();
            return;
        }

        this.animationFrameId = requestAnimationFrame(this.tick);
    };

    /**
     * Get current animation progress (0-1).
     */
    getProgress(): number {
        if (!this.currentAnimation) return 0;
        const elapsed = performance.now() - this.currentAnimation.startTime;
        return Math.min(1, elapsed / this.currentAnimation.duration);
    }

    /**
     * Get current animation.
     */
    getCurrent(): CombatAnimation | null {
        return this.currentAnimation;
    }

    /**
     * Check if animations are playing.
     */
    isPlaying(): boolean {
        return this.currentAnimation !== null || this.queue.length > 0;
    }

    /**
     * Clear all animations.
     */
    clear(): void {
        this.queue = [];
        this.currentAnimation = null;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * Set callback for animation completion.
     */
    setOnComplete(callback: () => void): void {
        this.onAnimationComplete = callback;
    }
}

// =============================================================================
// Animation Timing Constants
// =============================================================================

export const ANIMATION_DURATIONS = {
    moveStep: 150,      // Per tile
    attack: 300,        // Attack swing/shot
    damage: 400,        // Damage number float
    death: 600,         // Death fade
    defend: 200,        // Shield raise
    aoeBlast: 500,      // AoE blast expansion
    buffApply: 350,     // Buff application glow
} as const;

// =============================================================================
// Animation Helpers
// =============================================================================

/**
 * Create move animation from path.
 */
export function createMoveAnimation(
    entityId: string,
    path: TilePosition[]
): CombatAnimation {
    return {
        id: '',
        type: 'move',
        entityId,
        data: {
            type: 'move',
            path,
            currentStep: 0,
        },
        duration: (path.length - 1) * ANIMATION_DURATIONS.moveStep,
        startTime: 0,
    };
}

/**
 * Create attack animation.
 */
export function createAttackAnimation(
    entityId: string,
    targetPosition: TilePosition,
    isRanged: boolean
): CombatAnimation {
    return {
        id: '',
        type: 'attack',
        entityId,
        data: {
            type: 'attack',
            targetPosition,
            isRanged,
        },
        duration: ANIMATION_DURATIONS.attack,
        startTime: 0,
    };
}

/**
 * Create damage number animation.
 */
export function createDamageAnimation(
    entityId: string,
    amount: number,
    position: TilePosition,
    isCritical: boolean = false
): CombatAnimation {
    return {
        id: '',
        type: 'damage',
        entityId,
        data: {
            type: 'damage',
            amount,
            isCritical,
            position,
        },
        duration: ANIMATION_DURATIONS.damage,
        startTime: 0,
    };
}

/**
 * Create death animation.
 */
export function createDeathAnimation(
    entityId: string,
    position: TilePosition
): CombatAnimation {
    return {
        id: '',
        type: 'death',
        entityId,
        data: {
            type: 'death',
            position,
        },
        duration: ANIMATION_DURATIONS.death,
        startTime: 0,
    };
}

/**
 * Create defend animation.
 */
export function createDefendAnimation(
    entityId: string,
    position: TilePosition
): CombatAnimation {
    return {
        id: '',
        type: 'defend',
        entityId,
        data: {
            type: 'defend',
            position,
        },
        duration: ANIMATION_DURATIONS.defend,
        startTime: 0,
    };
}

/**
 * Create AoE blast animation.
 *
 * @param entityId - ID of the entity that triggered the AoE (attacker)
 * @param centerPosition - Center tile of the blast
 * @param affectedTiles - All tiles affected by the blast
 * @param blastStyle - 'fire' for bombs, 'arcane' for magic AoE
 */
export function createAoEBlastAnimation(
    entityId: string,
    centerPosition: TilePosition,
    affectedTiles: TilePosition[],
    blastStyle: 'fire' | 'arcane' = 'fire'
): CombatAnimation {
    return {
        id: '',
        type: 'aoe_blast',
        entityId,
        data: {
            type: 'aoe_blast',
            centerPosition,
            affectedTiles,
            blastStyle,
        },
        duration: ANIMATION_DURATIONS.aoeBlast,
        startTime: 0,
    };
}

/**
 * Create buff application animation.
 *
 * @param entityId - ID of the buffed entity
 * @param position - Tile position of the entity
 * @param buffType - Which buff was applied
 */
export function createBuffApplyAnimation(
    entityId: string,
    position: TilePosition,
    buffType: 'attack' | 'damage' | 'defense'
): CombatAnimation {
    return {
        id: '',
        type: 'buff_apply',
        entityId,
        data: {
            type: 'buff_apply',
            position,
            buffType,
        },
        duration: ANIMATION_DURATIONS.buffApply,
        startTime: 0,
    };
}

// =============================================================================
// Easing Functions
// =============================================================================

export const Easing = {
    linear: (t: number) => t,
    easeInQuad: (t: number) => t * t,
    easeOutQuad: (t: number) => t * (2 - t),
    easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeOutBounce: (t: number) => {
        if (t < 1 / 2.75) {
            return 7.5625 * t * t;
        } else if (t < 2 / 2.75) {
            return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
        } else if (t < 2.5 / 2.75) {
            return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
        } else {
            return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
        }
    },
};

// =============================================================================
// Position Interpolation
// =============================================================================

/**
 * Interpolate position along a path.
 */
export function interpolatePathPosition(
    path: TilePosition[],
    progress: number,
    tileSize: number
): { x: number; y: number } {
    if (path.length < 2) {
        return {
            x: path[0].x * tileSize + tileSize / 2,
            y: path[0].y * tileSize + tileSize / 2,
        };
    }

    const totalSteps = path.length - 1;
    const currentStepFloat = progress * totalSteps;
    const currentStep = Math.floor(currentStepFloat);
    const stepProgress = currentStepFloat - currentStep;

    const from = path[Math.min(currentStep, path.length - 1)];
    const to = path[Math.min(currentStep + 1, path.length - 1)];

    const easedProgress = Easing.easeInOutQuad(stepProgress);

    return {
        x: (from.x + (to.x - from.x) * easedProgress) * tileSize + tileSize / 2,
        y: (from.y + (to.y - from.y) * easedProgress) * tileSize + tileSize / 2,
    };
}

/**
 * Get attack animation offset (shake/lunge toward target).
 */
export function getAttackOffset(
    attackerPos: TilePosition,
    targetPos: TilePosition,
    progress: number,
    isRanged: boolean
): { x: number; y: number } {
    if (isRanged) {
        // Ranged: small recoil
        const recoil = Math.sin(progress * Math.PI) * 5;
        const dx = targetPos.x - attackerPos.x;
        const dy = targetPos.y - attackerPos.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        return {
            x: -(dx / len) * recoil,
            y: -(dy / len) * recoil,
        };
    } else {
        // Melee: lunge toward target
        const lunge = Math.sin(progress * Math.PI) * 20;
        const dx = targetPos.x - attackerPos.x;
        const dy = targetPos.y - attackerPos.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        return {
            x: (dx / len) * lunge,
            y: (dy / len) * lunge,
        };
    }
}

/**
 * Get damage number animation position (floats up).
 */
export function getDamageNumberOffset(progress: number): { y: number; alpha: number } {
    return {
        y: -30 * Easing.easeOutQuad(progress),
        alpha: 1 - Easing.easeInQuad(progress),
    };
}

/**
 * Get death animation effects.
 */
export function getDeathEffects(progress: number): { alpha: number; scale: number } {
    return {
        alpha: 1 - progress,
        scale: 1 - 0.3 * progress,
    };
}

/**
 * Get defend animation effects (shield pulse).
 */
export function getDefendEffects(progress: number): { scale: number; glow: number } {
    const pulse = Math.sin(progress * Math.PI);
    return {
        scale: 1 + 0.1 * pulse,
        glow: pulse,
    };
}

/**
 * Get AoE blast animation effects.
 * Blast expands from center with a flash, then fades.
 *
 * @param progress - Animation progress (0-1)
 * @param tileIndex - Index of the tile in the affected array (for stagger)
 * @param totalTiles - Total number of affected tiles
 * @returns Visual effects for this tile at this point in the animation
 */
export function getAoEBlastEffects(
    progress: number,
    tileIndex: number,
    totalTiles: number,
): { alpha: number; scale: number; tint: number } {
    // Stagger: tiles further from center start their animation slightly later
    const staggerDelay = (tileIndex / Math.max(1, totalTiles)) * 0.3;
    const adjustedProgress = Math.max(0, Math.min(1, (progress - staggerDelay) / (1 - staggerDelay)));

    // Flash in, hold, fade out
    const flashIn = Math.min(1, adjustedProgress * 4); // Quick flash (0-0.25)
    const fadeOut = adjustedProgress > 0.5 ? (adjustedProgress - 0.5) * 2 : 0; // Fade (0.5-1.0)

    return {
        alpha: flashIn * (1 - fadeOut) * 0.7,
        scale: 0.5 + Easing.easeOutQuad(flashIn) * 0.5,
        // Fire = orange/red, Arcane = blue/purple (tint applied by renderer)
        tint: 0xFFFFFF,
    };
}

/**
 * Get buff application animation effects.
 * Upward sparkle/glow that fades.
 */
export function getBuffApplyEffects(
    progress: number,
    buffType: 'attack' | 'damage' | 'defense'
): { alpha: number; yOffset: number; scale: number; color: number } {
    const rise = Easing.easeOutQuad(progress);
    const fade = progress > 0.6 ? (progress - 0.6) / 0.4 : 0;

    // Color by buff type
    const colors: Record<string, number> = {
        attack: 0xFF6B35,  // Orange for attack
        damage: 0xEF4444,  // Red for damage
        defense: 0x3B82F6, // Blue for defense
    };

    return {
        alpha: (1 - fade) * 0.8,
        yOffset: -20 * rise,
        scale: 0.8 + 0.4 * Math.sin(progress * Math.PI),
        color: colors[buffType] ?? 0xFFFFFF,
    };
}
