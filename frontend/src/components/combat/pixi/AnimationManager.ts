/**
 * @file AnimationManager.ts
 * @description Ticker-based animation orchestrator for combat animations.
 * 
 * Manages animation queue, sequencing, and parallel execution.
 * All animations run at 60fps via PIXI.Ticker.
 */

import * as PIXI from 'pixi.js';

/**
 * Base animation interface.
 * Implement this to create custom animations.
 */
export interface Animation {
    /**
     * Update the animation state.
     * @param deltaTime - Time elapsed since last frame in seconds
     * @returns true when animation is complete
     */
    update(deltaTime: number): boolean;

    /**
     * Optional cleanup when animation completes or is cancelled
     */
    onComplete?(): void;

    /**
     * Optional callback when animation is cancelled
     */
    onCancel?(): void;
}

/**
 * Internal wrapper for tracking animation state
 */
interface AnimationState {
    animation: Animation;
    resolve: () => void;
    reject: (reason?: any) => void;
}

/**
 * Manages all combat animations via PIXI.Ticker
 */
export class AnimationManager {
    private app: PIXI.Application;
    private activeAnimations: Set<AnimationState> = new Set();
    private tickerCallback: (ticker: PIXI.Ticker) => void;

    constructor(app: PIXI.Application) {
        this.app = app;

        // Bind ticker callback
        this.tickerCallback = (ticker: PIXI.Ticker) => {
            this.update(ticker.deltaMS / 1000); // Convert ms to seconds
        };

        this.app.ticker.add(this.tickerCallback);
    }

    /**
     * Update all active animations
     */
    private update(deltaTime: number): void {
        const completed: AnimationState[] = [];

        // Update each animation
        this.activeAnimations.forEach(state => {
            try {
                const isComplete = state.animation.update(deltaTime);

                if (isComplete) {
                    completed.push(state);
                }
            } catch (error) {
                console.error('Animation update error:', error);
                completed.push(state);
                state.reject(error);
            }
        });

        // Clean up completed animations
        completed.forEach(state => {
            this.activeAnimations.delete(state);

            // Call onComplete callback
            if (state.animation.onComplete) {
                try {
                    state.animation.onComplete();
                } catch (error) {
                    console.error('Animation onComplete error:', error);
                }
            }

            state.resolve();
        });
    }

    /**
     * Play a single animation
     * @returns Promise that resolves when animation completes
     */
    play(animation: Animation): Promise<void> {
        return new Promise((resolve, reject) => {
            const state: AnimationState = {
                animation,
                resolve,
                reject,
            };

            this.activeAnimations.add(state);
        });
    }

    /**
     * Play animations in sequence (one after another)
     * @returns Promise that resolves when all animations complete
     */
    async playSequence(animations: Animation[]): Promise<void> {
        for (const animation of animations) {
            await this.play(animation);
        }
    }

    /**
     * Play animations in parallel (all at once)
     * @returns Promise that resolves when all animations complete
     */
    async playParallel(animations: Animation[]): Promise<void> {
        const promises = animations.map(anim => this.play(anim));
        await Promise.all(promises);
    }

    /**
     * Cancel a specific animation
     */
    cancel(animation: Animation): void {
        this.activeAnimations.forEach(state => {
            if (state.animation === animation) {
                this.activeAnimations.delete(state);

                if (state.animation.onCancel) {
                    state.animation.onCancel();
                }

                state.reject(new Error('Animation cancelled'));
            }
        });
    }

    /**
     * Cancel all active animations
     */
    cancelAll(): void {
        this.activeAnimations.forEach(state => {
            if (state.animation.onCancel) {
                state.animation.onCancel();
            }

            state.reject(new Error('Animation cancelled'));
        });

        this.activeAnimations.clear();
    }

    /**
     * Check if any animations are currently playing
     */
    isPlaying(): boolean {
        return this.activeAnimations.size > 0;
    }

    /**
     * Cleanup - remove ticker callback
     */
    destroy(): void {
        this.cancelAll();
        this.app.ticker.remove(this.tickerCallback);
    }
}

// ============================================================================
// Built-in Animation Classes
// ============================================================================

import { easeInQuad, easeOutQuad, easeOutBack } from './easing';

/**
 * Attack animation: wind-up → strike → return
 * Duration: 600ms
 */
export class AttackAnimation implements Animation {
    private sprite: PIXI.Container;
    private direction: 'up' | 'down';
    private elapsed: number = 0;
    private readonly duration = 0.6; // 600ms

    private originalX: number;
    private originalY: number;
    private originalRotation: number;
    private originalScale: number;

    constructor(sprite: PIXI.Container, direction: 'up' | 'down') {
        this.sprite = sprite;
        this.direction = direction;

        // Store original transform
        this.originalX = sprite.x;
        this.originalY = sprite.y;
        this.originalRotation = sprite.rotation;
        this.originalScale = sprite.scale.x;
    }

    update(deltaTime: number): boolean {
        this.elapsed += deltaTime;
        const progress = Math.min(this.elapsed / this.duration, 1);

        // Phase timings
        const windupEnd = 0.2;   // 120ms
        const strikeEnd = 0.5;   // 180ms
        const returnEnd = 1.0;   // 300ms

        if (progress < windupEnd) {
            // Wind-up phase
            const t = easeInQuad(progress / windupEnd);
            const dirMultiplier = this.direction === 'up' ? 1 : -1;

            this.sprite.x = this.originalX;
            this.sprite.y = this.originalY + (12 * dirMultiplier * t);
            this.sprite.rotation = this.originalRotation + (0.14 * t); // ~8 degrees
            this.sprite.scale.set(this.originalScale * (1 + 0.08 * t));

        } else if (progress < strikeEnd) {
            // Strike phase
            const t = easeOutBack((progress - windupEnd) / (strikeEnd - windupEnd));
            const dirMultiplier = this.direction === 'up' ? -1 : 1;

            this.sprite.x = this.originalX;
            this.sprite.y = this.originalY + (80 * dirMultiplier * t);
            this.sprite.rotation = this.originalRotation - (0.21 * t); // ~12 degrees
            this.sprite.scale.set(this.originalScale * (1 + 0.15 * t));

        } else {
            // Return phase
            const t = easeOutQuad((progress - strikeEnd) / (returnEnd - strikeEnd));
            const dirMultiplier = this.direction === 'up' ? -1 : 1;

            this.sprite.x = this.originalX;
            this.sprite.y = this.originalY + (80 * dirMultiplier * (1 - t));
            this.sprite.rotation = this.originalRotation - (0.21 * (1 - t));
            this.sprite.scale.set(this.originalScale * (1 + 0.15 * (1 - t)));
        }

        return progress >= 1;
    }

    onComplete(): void {
        // Ensure sprite returns to exact original position
        this.sprite.x = this.originalX;
        this.sprite.y = this.originalY;
        this.sprite.rotation = this.originalRotation;
        this.sprite.scale.set(this.originalScale);
    }
}

/**
 * Hit animation: shake + flash white
 * Duration: 300ms
 */
export class HitAnimation implements Animation {
    private sprite: PIXI.Container;
    private elapsed: number = 0;
    private readonly duration = 0.3; // 300ms

    private originalX: number;
    private originalTint: number;

    constructor(sprite: PIXI.Container) {
        this.sprite = sprite;
        this.originalX = sprite.x;

        // Get original tint (assumes sprite has a tintable child)
        const tintable = this.getTintableChild();
        this.originalTint = tintable ? tintable.tint : 0xFFFFFF;
    }

    private getTintableChild(): PIXI.Sprite | PIXI.Graphics | null {
        // Find first tintable child
        for (const child of this.sprite.children) {
            if ('tint' in child) {
                return child as PIXI.Sprite | PIXI.Graphics;
            }
        }
        return null;
    }

    update(deltaTime: number): boolean {
        this.elapsed += deltaTime;
        const progress = Math.min(this.elapsed / this.duration, 1);

        // Shake: oscillate X ±4px, 3 cycles
        const shakeAmount = 4 * (1 - progress); // Decay over time
        const shakeCycles = 3;
        const shakeOffset = Math.sin(progress * Math.PI * 2 * shakeCycles) * shakeAmount;
        this.sprite.x = this.originalX + shakeOffset;

        // Flash: white tint that fades out
        const flashProgress = Math.min(progress / 0.67, 1); // Fade by 200ms
        const tintable = this.getTintableChild();
        if (tintable) {
            // Interpolate from white to original tint
            const r1 = 255, g1 = 255, b1 = 255;
            const r2 = (this.originalTint >> 16) & 0xFF;
            const g2 = (this.originalTint >> 8) & 0xFF;
            const b2 = this.originalTint & 0xFF;

            const r = Math.round(r1 + (r2 - r1) * flashProgress);
            const g = Math.round(g1 + (g2 - g1) * flashProgress);
            const b = Math.round(b1 + (b2 - b1) * flashProgress);

            tintable.tint = (r << 16) | (g << 8) | b;
        }

        return progress >= 1;
    }

    onComplete(): void {
        // Restore original position and tint
        this.sprite.x = this.originalX;
        const tintable = this.getTintableChild();
        if (tintable) {
            tintable.tint = this.originalTint;
        }
    }
}

/**
 * Move animation: hop to new position with squash-stretch
 * Duration: 600ms (anticipation + hop + land)
 */
export class MoveAnimation implements Animation {
    private sprite: PIXI.Container;
    private targetX: number;
    private targetY: number;
    private elapsed: number = 0;
    private readonly duration = 0.6; // 600ms for more dramatic movement

    private startX: number;
    private startY: number;
    private originalScaleX: number;
    private originalScaleY: number;

    // Animation phases
    private readonly anticipateEnd = 0.15;  // Squat down (90ms)
    private readonly hopEnd = 0.7;          // Jump and travel (330ms)
    private readonly landEnd = 1.0;         // Land and settle (180ms)

    // Movement parameters
    private readonly hopHeight = 50;        // How high to jump (pixels)
    private readonly squashAmount = 0.15;   // How much to squash (15%)
    private readonly stretchAmount = 0.12;  // How much to stretch (12%)

    constructor(sprite: PIXI.Container, targetX: number, targetY: number) {
        this.sprite = sprite;
        this.targetX = targetX;
        this.targetY = targetY;

        this.startX = sprite.x;
        this.startY = sprite.y;
        this.originalScaleX = sprite.scale.x;
        this.originalScaleY = sprite.scale.y;
    }

    update(deltaTime: number): boolean {
        this.elapsed += deltaTime;
        const progress = Math.min(this.elapsed / this.duration, 1);

        if (progress < this.anticipateEnd) {
            // Phase 1: Anticipation - squat down before jump
            const t = easeInQuad(progress / this.anticipateEnd);

            // Stay in place
            this.sprite.x = this.startX;

            // Squash (compress vertically, expand horizontally)
            const scaleX = this.originalScaleX * (1 + this.squashAmount * t);
            const scaleY = this.originalScaleY * (1 - this.squashAmount * t);
            this.sprite.scale.set(scaleX, scaleY);

            // Slight downward shift to emphasize squash
            this.sprite.y = this.startY + (8 * t);

        } else if (progress < this.hopEnd) {
            // Phase 2: Hop - jump and travel to target
            const phaseProgress = (progress - this.anticipateEnd) / (this.hopEnd - this.anticipateEnd);
            const t = easeOutQuad(phaseProgress);

            // Move horizontally toward target
            this.sprite.x = this.startX + (this.targetX - this.startX) * t;

            // Parabolic arc for vertical movement
            // Peak at middle of hop (phaseProgress = 0.5)
            const arcProgress = phaseProgress;
            const arc = -4 * this.hopHeight * arcProgress * (arcProgress - 1);
            const baseY = this.startY + (this.targetY - this.startY) * t;
            this.sprite.y = baseY - arc;

            // Stretch during ascent, normalize at peak, slight stretch during descent
            let stretchFactor: number;
            if (phaseProgress < 0.4) {
                // Ascending - stretch vertically
                const stretchT = easeOutQuad(phaseProgress / 0.4);
                stretchFactor = this.stretchAmount * stretchT;
            } else if (phaseProgress < 0.6) {
                // Near peak - mostly normal
                stretchFactor = this.stretchAmount * 0.3;
            } else {
                // Descending - slight stretch
                const stretchT = (phaseProgress - 0.6) / 0.4;
                stretchFactor = this.stretchAmount * (0.3 + stretchT * 0.5);
            }

            const scaleX = this.originalScaleX * (1 - stretchFactor * 0.5);
            const scaleY = this.originalScaleY * (1 + stretchFactor);
            this.sprite.scale.set(scaleX, scaleY);

        } else {
            // Phase 3: Land - impact squash and settle
            const phaseProgress = (progress - this.hopEnd) / (this.landEnd - this.hopEnd);

            // At target position
            this.sprite.x = this.targetX;

            // Landing squash then bounce back
            let squashFactor: number;
            let yOffset: number;

            if (phaseProgress < 0.3) {
                // Impact squash
                const t = easeOutQuad(phaseProgress / 0.3);
                squashFactor = this.squashAmount * 1.2 * t; // Bigger squash on landing
                yOffset = 6 * t;
            } else if (phaseProgress < 0.6) {
                // Bounce back up slightly
                const t = (phaseProgress - 0.3) / 0.3;
                squashFactor = this.squashAmount * 1.2 * (1 - t);
                yOffset = 6 * (1 - t) - 4 * easeOutQuad(t); // Slight upward bounce
            } else {
                // Settle to rest
                const t = easeOutQuad((phaseProgress - 0.6) / 0.4);
                squashFactor = 0;
                yOffset = -4 * (1 - t);
            }

            const scaleX = this.originalScaleX * (1 + squashFactor);
            const scaleY = this.originalScaleY * (1 - squashFactor);
            this.sprite.scale.set(scaleX, scaleY);
            this.sprite.y = this.targetY + yOffset;
        }

        return progress >= 1;
    }

    onComplete(): void {
        // Ensure exact final position and scale
        this.sprite.x = this.targetX;
        this.sprite.y = this.targetY;
        this.sprite.scale.set(this.originalScaleX, this.originalScaleY);
    }
}

/**
 * Death animation: fade out + grayscale
 * Duration: 500ms
 */
export class DeathAnimation implements Animation {
    private sprite: PIXI.Container;
    private elapsed: number = 0;
    private readonly duration = 0.5; // 500ms

    private grayscaleFilter: PIXI.ColorMatrixFilter;

    constructor(sprite: PIXI.Container) {
        this.sprite = sprite;

        // Add grayscale filter
        this.grayscaleFilter = new PIXI.ColorMatrixFilter();
        this.sprite.filters = [this.grayscaleFilter];
    }

    update(deltaTime: number): boolean {
        this.elapsed += deltaTime;
        const progress = Math.min(this.elapsed / this.duration, 1);

        // Fade out
        this.sprite.alpha = 1 - progress;

        // Scale down slightly
        const scale = 1 - (0.2 * progress);
        this.sprite.scale.set(scale);

        // Apply grayscale
        this.grayscaleFilter.desaturate();

        return progress >= 1;
    }

    onComplete(): void {
        // Sprite should be removed by caller
        this.sprite.alpha = 0;
    }
}

/**
 * Damage number animation: float up + fade
 * Duration: 800ms
 */
export class DamageNumberAnimation implements Animation {
    private text: PIXI.Text;
    private elapsed: number = 0;
    private readonly duration = 0.8; // 800ms

    private startY: number;

    constructor(text: PIXI.Text) {
        this.text = text;
        this.startY = text.y;
    }

    update(deltaTime: number): boolean {
        this.elapsed += deltaTime;
        const progress = Math.min(this.elapsed / this.duration, 1);

        // Float up
        this.text.y = this.startY - (40 * progress);

        // Fade out
        this.text.alpha = 1 - progress;

        // Scale down
        const scale = 1.2 - (0.4 * progress);
        this.text.scale.set(scale);

        return progress >= 1;
    }

    onComplete(): void {
        // Remove text from parent
        if (this.text.parent) {
            this.text.parent.removeChild(this.text);
        }
        this.text.destroy();
    }
}

/**
 * Screen shake animation: random stage offset for impact
 * Duration: 200ms
 */
export class ScreenShakeAnimation implements Animation {
    private stage: PIXI.Container;
    private elapsed: number = 0;
    private readonly duration = 0.2; // 200ms
    private readonly intensity = 6; // ±6px

    private originalX: number;
    private originalY: number;

    constructor(stage: PIXI.Container) {
        this.stage = stage;
        this.originalX = stage.x;
        this.originalY = stage.y;
    }

    update(deltaTime: number): boolean {
        this.elapsed += deltaTime;
        const progress = Math.min(this.elapsed / this.duration, 1);

        if (progress < 1) {
            // Random offset that decays over time
            const decay = 1 - progress;
            const offsetX = (Math.random() * 2 - 1) * this.intensity * decay;
            const offsetY = (Math.random() * 2 - 1) * this.intensity * decay;

            this.stage.x = this.originalX + offsetX;
            this.stage.y = this.originalY + offsetY;
        }

        return progress >= 1;
    }

    onComplete(): void {
        // Restore original position
        this.stage.x = this.originalX;
        this.stage.y = this.originalY;
    }
}

/**
 * Projectile animation: fly projectile from attacker to target
 * Duration: 300-400ms depending on type
 */
export class ProjectileAnimation implements Animation {
    private projectile: PIXI.Sprite;
    private startX: number;
    private startY: number;
    private targetX: number;
    private targetY: number;
    private type: 'arc' | 'straight';
    private elapsed: number = 0;
    private duration: number;
    private particleSystem?: any; // ParticleSystem type

    constructor(
        projectile: PIXI.Sprite,
        startX: number,
        startY: number,
        targetX: number,
        targetY: number,
        type: 'arc' | 'straight' = 'straight',
        particleSystem?: any
    ) {
        this.projectile = projectile;
        this.startX = startX;
        this.startY = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.type = type;
        this.particleSystem = particleSystem;
        this.duration = type === 'arc' ? 0.4 : 0.3; // 400ms for arc, 300ms for straight

        // Position projectile at start
        this.projectile.x = startX;
        this.projectile.y = startY;
        this.projectile.visible = true;
        this.projectile.anchor.set(0.5);
    }

    update(deltaTime: number): boolean {
        this.elapsed += deltaTime;
        const progress = Math.min(this.elapsed / this.duration, 1);

        if (this.type === 'arc') {
            this.updateArc(progress);
        } else {
            this.updateStraight(progress);
        }

        return progress >= 1;
    }

    private updateArc(t: number): void {
        // Linear interpolation for X
        this.projectile.x = this.startX + (this.targetX - this.startX) * t;

        // Parabolic arc for Y (apex at t=0.5)
        const baseY = this.startY + (this.targetY - this.startY) * t;
        const arcHeight = 60; // pixels
        const arc = -4 * arcHeight * t * (t - 1); // Parabola: -4h*t*(t-1)
        this.projectile.y = baseY - arc;

        // Rotate to follow trajectory
        const dx = this.targetX - this.startX;
        const dy = (this.targetY - this.startY) - (arcHeight * (1 - 2 * t) * 4);
        this.projectile.rotation = Math.atan2(dy, dx);
    }

    private updateStraight(t: number): void {
        // Linear interpolation
        this.projectile.x = this.startX + (this.targetX - this.startX) * t;
        this.projectile.y = this.startY + (this.targetY - this.startY) * t;

        // Point toward target
        const dx = this.targetX - this.startX;
        const dy = this.targetY - this.startY;
        this.projectile.rotation = Math.atan2(dy, dx);

        // Emit particle trail (2 sparks per frame)
        if (this.particleSystem && Math.random() < 0.5) {
            this.particleSystem.emit({
                x: this.projectile.x,
                y: this.projectile.y,
                texture: 'spark',
                count: 2,
                speed: 30,
                lifetime: 0.2,
                gravity: 0,
                fadeOut: true,
                tint: 0xFF6600, // Orange trail
                spread: Math.PI / 4,
            });
        }
    }

    onComplete(): void {
        // Hide projectile
        this.projectile.visible = false;
    }
}

