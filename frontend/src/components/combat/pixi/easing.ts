/**
 * @file easing.ts
 * @description Easing functions for smooth animations.
 * 
 * All easing functions take a normalized time value (0-1) and return
 * a normalized progress value (0-1).
 */

/**
 * Quadratic ease-in: accelerating from zero velocity
 * Used for: Wind-up motions
 */
export const easeInQuad = (t: number): number => {
    return t * t;
};

/**
 * Quadratic ease-out: decelerating to zero velocity
 * Used for: Return motions
 */
export const easeOutQuad = (t: number): number => {
    return 1 - (1 - t) * (1 - t);
};

/**
 * Quadratic ease-in-out: acceleration until halfway, then deceleration
 * Used for: Move animations
 */
export const easeInOutQuad = (t: number): number => {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

/**
 * Back ease-out: overshoot and settle back
 * Used for: Strike motions with impact feel
 */
export const easeOutBack = (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/**
 * Linear: constant speed
 * Used for: Simple transitions
 */
export const linear = (t: number): number => {
    return t;
};
