/**
 * @file CardAnimationController.ts
 * @description Manages all animations for an EntityCardSprite.
 *
 * Extracted from EntityCardSprite.ts to improve maintainability.
 * Features:
 * - Animation queue to prevent overlapping animations
 * - Consistent easing functions
 * - Memory leak prevention via tracking pending frames/timeouts
 * - Particle effect spawning (death, revival)
 *
 * Uses requestAnimationFrame for timing. While PixiJS Ticker would be ideal,
 * EntityCardSprite doesn't have direct access to the Application instance,
 * and the animations work fine with rAF since they're all time-based.
 */

import * as PIXI from 'pixi.js';

// Animation state enum
type AnimationState = 'idle' | 'moving' | 'attacking' | 'entrance' | 'death' | 'incapacitation' | 'revival';

// Card dimensions (mirrored from EntityCardSprite for particle positioning)
const CARD_WIDTH = 100;
const CARD_HEIGHT = 140;
const PIVOT_Y_OFFSET = CARD_HEIGHT - 40;

/**
 * Configuration for an EntityCardSprite that the controller can manipulate.
 * This is the minimal interface the controller needs from its parent sprite.
 */
export interface CardSpriteInterface {
    // Transform properties
    x: number;
    y: number;
    scale: PIXI.ObservablePoint;
    alpha: number;
    rotation: number;
    pivot: PIXI.ObservablePoint;
    tint: number;
    visible: boolean;

    // Child access for particles
    addChild(child: PIXI.Container): void;
    removeChild(child: PIXI.Container): void;

    // Event mode for disabling interactivity (optional to match PIXI.Container)
    eventMode?: PIXI.EventMode;
    cursor?: string;

    // Border for tint effects (exposed as a method to keep encapsulation)
    getBorder(): PIXI.Graphics;
}

/**
 * Animation controller for EntityCardSprite.
 * Manages animation state, queuing, and memory cleanup.
 */
export class CardAnimationController {
    private sprite: CardSpriteInterface;
    private state: AnimationState = 'idle';
    private isDestroyed: boolean = false;

    // Animation tracking for cleanup
    private pendingAnimationFrames: Set<number> = new Set();
    private pendingTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();
    private moveAnimationId: number | null = null;

    // Idle bob state
    private bobTime: number = Math.random() * Math.PI * 2; // Random start phase
    private bobEnabled: boolean = true;

    constructor(sprite: CardSpriteInterface) {
        this.sprite = sprite;
    }

    /**
     * Check if an animation is currently playing (excluding bob)
     */
    isAnimating(): boolean {
        return this.state !== 'idle' || this.moveAnimationId !== null;
    }

    /**
     * Get current animation state
     */
    getState(): AnimationState {
        return this.state;
    }

    /**
     * Enable/disable idle bobbing
     */
    setBobEnabled(enabled: boolean): void {
        this.bobEnabled = enabled;
    }

    /**
     * Update idle bob animation (call from ticker)
     */
    updateBob(deltaTime: number): void {
        if (!this.bobEnabled || this.isAnimating()) return;

        this.bobTime += deltaTime * 2;
        const bob = Math.sin(this.bobTime) * 2; // 2px bob range
        this.sprite.pivot.y = PIVOT_Y_OFFSET - bob;
    }

    // =========================================================================
    // ENTRANCE ANIMATION
    // =========================================================================

    /**
     * Play entrance pop-in animation
     */
    playEntrance(): void {
        if (this.isDestroyed) return;

        this.state = 'entrance';
        this.sprite.scale.set(0);
        this.sprite.alpha = 0;

        const duration = 300;
        const startTime = performance.now();

        const animate = (currentTime: number) => {
            if (this.isDestroyed) {
                this.state = 'idle';
                return;
            }

            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out back for bounce overshoot
            const overshoot = 1.5;
            const eased = 1 - Math.pow(1 - progress, 2) * (1 + overshoot * (1 - progress));

            this.sprite.scale.set(Math.max(0, Math.min(eased, 1.05)));
            this.sprite.alpha = Math.min(progress * 1.5, 1);

            if (progress < 1) {
                const frameId = requestAnimationFrame(animate);
                this.pendingAnimationFrames.add(frameId);
            } else {
                this.sprite.scale.set(1);
                this.sprite.alpha = 1;
                this.state = 'idle';
            }
        };

        const frameId = requestAnimationFrame(animate);
        this.pendingAnimationFrames.add(frameId);
    }

    // =========================================================================
    // MOVEMENT ANIMATION
    // =========================================================================

    /**
     * Animate movement to target position with easing and hop
     */
    playMoveTo(
        targetX: number,
        targetY: number,
        duration: number = 250,
        onComplete?: () => void
    ): void {
        // Cancel any existing movement animation
        if (this.moveAnimationId !== null) {
            cancelAnimationFrame(this.moveAnimationId);
            this.pendingAnimationFrames.delete(this.moveAnimationId);
        }

        this.state = 'moving';
        this.bobEnabled = false;

        // Reset pivot to neutral position
        this.sprite.pivot.y = PIVOT_Y_OFFSET;

        const startX = this.sprite.x;
        const startY = this.sprite.y;
        const startTime = performance.now();

        const animate = (currentTime: number) => {
            if (this.isDestroyed) {
                this.state = 'idle';
                onComplete?.();
                return;
            }

            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic for smooth deceleration
            const eased = 1 - Math.pow(1 - progress, 3);

            // Calculate base position
            this.sprite.x = startX + (targetX - startX) * eased;
            const baseYPos = startY + (targetY - startY) * eased;

            // Add hop effect (parabolic arc)
            const hopHeight = Math.sin(progress * Math.PI) * 8;
            this.sprite.y = baseYPos - hopHeight;

            if (progress < 1) {
                this.moveAnimationId = requestAnimationFrame(animate);
                this.pendingAnimationFrames.add(this.moveAnimationId);
            } else {
                // Animation complete
                this.sprite.x = targetX;
                this.sprite.y = targetY;
                this.state = 'idle';
                this.bobEnabled = true;
                this.moveAnimationId = null;
                onComplete?.();
            }
        };

        this.moveAnimationId = requestAnimationFrame(animate);
        this.pendingAnimationFrames.add(this.moveAnimationId);
    }

    // =========================================================================
    // ATTACK ANIMATION
    // =========================================================================

    /**
     * Animate an attack toward a target position (lunge and return)
     */
    playAttack(
        targetX: number,
        targetY: number,
        onHit?: () => void,
        onComplete?: () => void
    ): void {
        // Cancel any existing movement animation
        if (this.moveAnimationId !== null) {
            cancelAnimationFrame(this.moveAnimationId);
            this.pendingAnimationFrames.delete(this.moveAnimationId);
        }

        this.state = 'attacking';
        this.bobEnabled = false;

        const startX = this.sprite.x;
        const startY = this.sprite.y;

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
            if (this.isDestroyed) {
                this.state = 'idle';
                onComplete?.();
                return;
            }

            const elapsed = currentTime - phaseStartTime;

            if (phase === 'lunge') {
                const progress = Math.min(elapsed / lungeDuration, 1);
                // Ease out for fast lunge
                const eased = 1 - Math.pow(1 - progress, 2);

                this.sprite.x = startX + (lungeX - startX) * eased;
                this.sprite.y = startY + (lungeY - startY) * eased;

                if (progress >= 1) {
                    // Hit moment - trigger callback
                    onHit?.();
                    phase = 'return';
                    phaseStartTime = currentTime;
                    this.moveAnimationId = requestAnimationFrame(animate);
                    this.pendingAnimationFrames.add(this.moveAnimationId);
                } else {
                    this.moveAnimationId = requestAnimationFrame(animate);
                    this.pendingAnimationFrames.add(this.moveAnimationId);
                }
            } else if (phase === 'return') {
                const progress = Math.min(elapsed / returnDuration, 1);
                // Ease in-out for return
                const eased = progress < 0.5
                    ? 2 * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;

                this.sprite.x = lungeX + (startX - lungeX) * eased;
                this.sprite.y = lungeY + (startY - lungeY) * eased;

                if (progress >= 1) {
                    this.sprite.x = startX;
                    this.sprite.y = startY;
                    this.state = 'idle';
                    this.bobEnabled = true;
                    this.moveAnimationId = null;
                    onComplete?.();
                } else {
                    this.moveAnimationId = requestAnimationFrame(animate);
                    this.pendingAnimationFrames.add(this.moveAnimationId);
                }
            }
        };

        this.moveAnimationId = requestAnimationFrame(animate);
        this.pendingAnimationFrames.add(this.moveAnimationId);
    }

    // =========================================================================
    // DAMAGE FLASH
    // =========================================================================

    /**
     * Play damage flash effect (red tint flash)
     */
    playDamageFlash(): void {
        if (this.isDestroyed) return;

        const border = this.sprite.getBorder();
        const originalTint = border.tint;
        border.tint = 0xFF4444;

        const timeoutId = setTimeout(() => {
            this.pendingTimeouts.delete(timeoutId);
            if (this.isDestroyed) return;
            border.tint = originalTint;
        }, 150);
        this.pendingTimeouts.add(timeoutId);
    }

    // =========================================================================
    // DEATH ANIMATION
    // =========================================================================

    /**
     * Play death animation: shake violently, spawn red particles, fade out.
     * @param onComplete Called when animation finishes
     */
    playDeath(onComplete?: () => void): void {
        if (this.isDestroyed) {
            onComplete?.();
            return;
        }

        // Disable interactivity immediately
        this.sprite.eventMode = 'none';
        this.sprite.cursor = 'default';
        this.bobEnabled = false;
        this.state = 'death';

        const shakeDuration = 400;
        const fadeDuration = 300;
        const startTime = performance.now();
        const startX = this.sprite.x;
        const startY = this.sprite.y;
        const border = this.sprite.getBorder();

        // Phase 1: Violent shaking with red tint
        const shakePhase = (currentTime: number) => {
            if (this.isDestroyed) return;

            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / shakeDuration, 1);

            // Intense shake that decreases over time
            const intensity = (1 - progress) * 8;
            const shakeX = (Math.random() - 0.5) * 2 * intensity;
            const shakeY = (Math.random() - 0.5) * 2 * intensity;
            this.sprite.x = startX + shakeX;
            this.sprite.y = startY + shakeY;

            // Flash red tint
            const flashIntensity = Math.sin(elapsed * 0.03) * 0.5 + 0.5;
            border.tint = this.lerpColor(0xFFFFFF, 0xFF0000, flashIntensity);

            if (progress < 1) {
                const frameId = requestAnimationFrame(shakePhase);
                this.pendingAnimationFrames.add(frameId);
            } else {
                // Reset position before fade
                this.sprite.x = startX;
                this.sprite.y = startY;
                border.tint = 0xFF0000;

                // Spawn particle effect
                this.spawnDeathParticles();

                // Start fade phase
                const fadeStartTime = performance.now();
                const frameId = requestAnimationFrame((ct) => fadePhase(fadeStartTime, ct));
                this.pendingAnimationFrames.add(frameId);
            }
        };

        // Phase 2: Fade out
        const fadePhase = (fadeStartTime: number, currentTime: number) => {
            if (this.isDestroyed) return;

            const elapsed = currentTime - fadeStartTime;
            const progress = Math.min(elapsed / fadeDuration, 1);

            // Fade out and shrink slightly
            this.sprite.alpha = 1 - progress;
            this.sprite.scale.set(1 - progress * 0.3);

            if (progress < 1) {
                const frameId = requestAnimationFrame((ct) => fadePhase(fadeStartTime, ct));
                this.pendingAnimationFrames.add(frameId);
            } else {
                this.sprite.visible = false;
                this.state = 'idle';
                onComplete?.();
            }
        };

        const frameId = requestAnimationFrame(shakePhase);
        this.pendingAnimationFrames.add(frameId);
    }

    /**
     * Spawn red particle effect for death animation
     */
    private spawnDeathParticles(): void {
        if (this.isDestroyed) return;

        const particleCount = 12;

        for (let i = 0; i < particleCount; i++) {
            const particle = new PIXI.Graphics();
            const size = 3 + Math.random() * 5;
            particle.circle(0, 0, size);
            particle.fill({ color: 0xFF0000, alpha: 0.8 + Math.random() * 0.2 });

            // Position at center of card
            particle.x = CARD_WIDTH / 2;
            particle.y = CARD_HEIGHT / 2;
            this.sprite.addChild(particle);

            // Random velocity
            const angle = (i / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const speed = 40 + Math.random() * 60;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;

            // Animate particle
            const startTime = performance.now();
            const duration = 400 + Math.random() * 200;

            const animateParticle = (currentTime: number) => {
                if (this.isDestroyed) {
                    try {
                        particle.destroy();
                    } catch {
                        // Particle may already be destroyed
                    }
                    return;
                }

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
                    const frameId = requestAnimationFrame(animateParticle);
                    this.pendingAnimationFrames.add(frameId);
                } else {
                    this.sprite.removeChild(particle);
                    particle.destroy();
                }
            };

            const frameId = requestAnimationFrame(animateParticle);
            this.pendingAnimationFrames.add(frameId);
        }
    }

    // =========================================================================
    // INCAPACITATION ANIMATION
    // =========================================================================

    /**
     * Play incapacitation animation: turn grey and topple onto side.
     * @param onComplete Called when animation finishes
     */
    playIncapacitation(onComplete?: () => void): void {
        if (this.isDestroyed) {
            onComplete?.();
            return;
        }

        // Disable interactivity immediately
        this.sprite.eventMode = 'none';
        this.sprite.cursor = 'default';
        this.bobEnabled = false;
        this.state = 'incapacitation';

        const duration = 600;
        const startTime = performance.now();
        const targetRotation = Math.PI / 2; // 90 degrees

        const animate = (currentTime: number) => {
            if (this.isDestroyed) return;

            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out bounce for toppling effect
            const eased = this.easeOutBounce(progress);

            // Rotate to lie on side (90 degrees)
            this.sprite.rotation = targetRotation * eased;

            // Gradually desaturate by tinting toward grey
            const greyProgress = Math.min(progress * 1.5, 1);
            this.sprite.tint = this.lerpColor(0xFFFFFF, 0x666666, greyProgress);

            // Slight drop as it falls
            this.sprite.pivot.y = PIVOT_Y_OFFSET + progress * 20;

            if (progress < 1) {
                const frameId = requestAnimationFrame(animate);
                this.pendingAnimationFrames.add(frameId);
            } else {
                // Final state: grey, rotated, non-interactive
                this.sprite.rotation = targetRotation;
                this.sprite.tint = 0x666666;
                this.sprite.alpha = 0.7;
                this.state = 'idle';
                onComplete?.();
            }
        };

        const frameId = requestAnimationFrame(animate);
        this.pendingAnimationFrames.add(frameId);
    }

    // =========================================================================
    // REVIVAL ANIMATION
    // =========================================================================

    /**
     * Play revival animation: stand back up from incapacitated state.
     * @param onComplete Called when animation finishes
     */
    playRevival(onComplete?: () => void): void {
        // If destroyed or not incapacitated, complete immediately
        if (this.isDestroyed || (this.sprite.rotation === 0 && this.sprite.eventMode !== 'none')) {
            onComplete?.();
            return;
        }

        this.state = 'revival';
        const duration = 800;
        const startTime = performance.now();
        const startRotation = this.sprite.rotation;
        const startAlpha = this.sprite.alpha;
        const startPivotY = this.sprite.pivot.y;

        // Create golden glow particles
        this.spawnRevivalParticles();

        const animate = (currentTime: number) => {
            if (this.isDestroyed) return;

            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out elastic for dramatic standing up
            const eased = this.easeOutElastic(progress);

            // Rotate back to upright
            this.sprite.rotation = startRotation * (1 - eased);

            // Restore color from grey to white with golden flash at peak
            if (progress < 0.5) {
                this.sprite.tint = this.lerpColor(0x666666, 0xFFD700, progress * 2);
            } else {
                this.sprite.tint = this.lerpColor(0xFFD700, 0xFFFFFF, (progress - 0.5) * 2);
            }

            // Restore alpha
            this.sprite.alpha = startAlpha + (1 - startAlpha) * eased;

            // Restore pivot
            this.sprite.pivot.y = startPivotY + (PIVOT_Y_OFFSET - startPivotY) * eased;

            // Add a slight scale bounce at the end
            if (progress > 0.7) {
                const bounceProgress = (progress - 0.7) / 0.3;
                const bounce = Math.sin(bounceProgress * Math.PI) * 0.1;
                this.sprite.scale.set(1 + bounce);
            }

            if (progress < 1) {
                const frameId = requestAnimationFrame(animate);
                this.pendingAnimationFrames.add(frameId);
            } else {
                // Final state: fully restored
                this.sprite.rotation = 0;
                this.sprite.tint = 0xFFFFFF;
                this.sprite.alpha = 1;
                this.sprite.pivot.y = PIVOT_Y_OFFSET;
                this.sprite.scale.set(1);
                this.sprite.eventMode = 'dynamic';
                this.sprite.cursor = 'pointer';
                this.bobEnabled = true;
                this.state = 'idle';
                onComplete?.();
            }
        };

        const frameId = requestAnimationFrame(animate);
        this.pendingAnimationFrames.add(frameId);
    }

    /**
     * Spawn golden particle effect for revival animation
     */
    private spawnRevivalParticles(): void {
        if (this.isDestroyed) return;

        const particleCount = 16;

        for (let i = 0; i < particleCount; i++) {
            const particle = new PIXI.Graphics();
            const size = 2 + Math.random() * 4;
            particle.circle(0, 0, size);
            const color = Math.random() > 0.5 ? 0xFFD700 : 0xFFFFFF;
            particle.fill({ color, alpha: 0.9 });

            // Start from center/bottom of card
            particle.x = CARD_WIDTH / 2;
            particle.y = CARD_HEIGHT * 0.7;
            this.sprite.addChild(particle);

            // Upward and outward velocity
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
            const speed = 30 + Math.random() * 50;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;

            // Animate particle
            const startTime = performance.now();
            const duration = 600 + Math.random() * 400;

            const animateParticle = (currentTime: number) => {
                if (this.isDestroyed) {
                    try {
                        particle.destroy();
                    } catch {
                        // Particle may already be destroyed
                    }
                    return;
                }

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
                    const frameId = requestAnimationFrame(animateParticle);
                    this.pendingAnimationFrames.add(frameId);
                } else {
                    this.sprite.removeChild(particle);
                    particle.destroy();
                }
            };

            // Stagger particle starts for more natural effect
            const timeoutId = setTimeout(() => {
                this.pendingTimeouts.delete(timeoutId);
                if (this.isDestroyed) {
                    try {
                        particle.destroy();
                    } catch {
                        // Particle may already be destroyed
                    }
                    return;
                }
                const frameId = requestAnimationFrame(animateParticle);
                this.pendingAnimationFrames.add(frameId);
            }, i * 30);
            this.pendingTimeouts.add(timeoutId);
        }
    }

    // =========================================================================
    // STATE HELPERS
    // =========================================================================

    /**
     * Check if entity is in incapacitated visual state
     */
    isIncapacitatedState(): boolean {
        return this.sprite.rotation !== 0 && this.sprite.eventMode === 'none';
    }

    /**
     * Reset from incapacitated state (for dev reset)
     */
    resetFromIncapacitation(): void {
        this.sprite.rotation = 0;
        this.sprite.tint = 0xFFFFFF;
        this.sprite.alpha = 1;
        this.sprite.pivot.y = PIVOT_Y_OFFSET;
        this.sprite.eventMode = 'dynamic';
        this.sprite.cursor = 'pointer';
        this.bobEnabled = true;
        this.state = 'idle';
    }

    // =========================================================================
    // EASING FUNCTIONS
    // =========================================================================

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

    // =========================================================================
    // CLEANUP
    // =========================================================================

    /**
     * Destroy controller and cancel all pending animations
     */
    destroy(): void {
        this.isDestroyed = true;

        // Cancel any running movement animation
        if (this.moveAnimationId !== null) {
            cancelAnimationFrame(this.moveAnimationId);
            this.moveAnimationId = null;
        }

        // Cancel all pending animation frames
        for (const frameId of this.pendingAnimationFrames) {
            cancelAnimationFrame(frameId);
        }
        this.pendingAnimationFrames.clear();

        // Cancel all pending timeouts
        for (const timeoutId of this.pendingTimeouts) {
            clearTimeout(timeoutId);
        }
        this.pendingTimeouts.clear();
    }
}
