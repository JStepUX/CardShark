/**
 * @file easing.ts
 * @description Easing functions for smooth animations in the PixiJS combat system.
 * 
 * These functions take a normalized time value (0-1) and return an eased value (0-1).
 * Used by AnimationManager to create natural-feeling motion.
 */

/**
 * Quadratic ease-in: accelerating from zero velocity.
 * Good for: wind-up animations, objects starting to move
 */
export const easeInQuad = (t: number): number => t * t;

/**
 * Quadratic ease-out: decelerating to zero velocity.
 * Good for: objects coming to rest, return animations
 */
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);

/**
 * Quadratic ease-in-out: acceleration until halfway, then deceleration.
 * Good for: smooth movement between positions, slide animations
 */
export const easeInOutQuad = (t: number): number =>
    t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/**
 * Ease-out with back overshoot: decelerates with slight overshoot at end.
 * Good for: impact animations, strike effects that need punch
 */
export const easeOutBack = (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
