/**
 * Tests for easing.ts
 *
 * Covers:
 * - Mathematical correctness at boundaries (0, 0.5, 1)
 * - Monotonicity (output increases as input increases)
 * - Expected behavior characteristics of each easing function
 */

import { easeInQuad, easeOutQuad, easeInOutQuad, easeOutBack, linear } from './easing';

describe('easing functions', () => {
    // Precision for floating point comparisons
    const PRECISION = 10;

    describe('linear', () => {
        it('should return 0 at t=0', () => {
            expect(linear(0)).toBe(0);
        });

        it('should return 1 at t=1', () => {
            expect(linear(1)).toBe(1);
        });

        it('should return 0.5 at t=0.5', () => {
            expect(linear(0.5)).toBe(0.5);
        });

        it('should be a straight line (output equals input)', () => {
            for (let t = 0; t <= 1; t += 0.1) {
                expect(linear(t)).toBeCloseTo(t, PRECISION);
            }
        });
    });

    describe('easeInQuad', () => {
        it('should return 0 at t=0', () => {
            expect(easeInQuad(0)).toBe(0);
        });

        it('should return 1 at t=1', () => {
            expect(easeInQuad(1)).toBe(1);
        });

        it('should return 0.25 at t=0.5 (quadratic: 0.5^2 = 0.25)', () => {
            expect(easeInQuad(0.5)).toBeCloseTo(0.25, PRECISION);
        });

        it('should be slow at the start (ease-in characteristic)', () => {
            // At t=0.25, output should be less than 0.25 (slower than linear)
            expect(easeInQuad(0.25)).toBeLessThan(0.25);
        });

        it('should accelerate towards the end', () => {
            // At t=0.75, output should still be less than 0.75
            expect(easeInQuad(0.75)).toBeLessThan(0.75);
        });

        it('should be monotonically increasing', () => {
            let prev = -1;
            for (let t = 0; t <= 1; t += 0.05) {
                const current = easeInQuad(t);
                expect(current).toBeGreaterThanOrEqual(prev);
                prev = current;
            }
        });
    });

    describe('easeOutQuad', () => {
        it('should return 0 at t=0', () => {
            expect(easeOutQuad(0)).toBe(0);
        });

        it('should return 1 at t=1', () => {
            expect(easeOutQuad(1)).toBe(1);
        });

        it('should return 0.75 at t=0.5 (inverse of easeIn: 1 - (1-0.5)^2 = 0.75)', () => {
            expect(easeOutQuad(0.5)).toBeCloseTo(0.75, PRECISION);
        });

        it('should be fast at the start (ease-out characteristic)', () => {
            // At t=0.25, output should be greater than 0.25 (faster than linear)
            expect(easeOutQuad(0.25)).toBeGreaterThan(0.25);
        });

        it('should decelerate towards the end', () => {
            // At t=0.75, output should be greater than 0.75
            expect(easeOutQuad(0.75)).toBeGreaterThan(0.75);
        });

        it('should be monotonically increasing', () => {
            let prev = -1;
            for (let t = 0; t <= 1; t += 0.05) {
                const current = easeOutQuad(t);
                expect(current).toBeGreaterThanOrEqual(prev);
                prev = current;
            }
        });
    });

    describe('easeInOutQuad', () => {
        it('should return 0 at t=0', () => {
            expect(easeInOutQuad(0)).toBe(0);
        });

        it('should return 1 at t=1', () => {
            expect(easeInOutQuad(1)).toBe(1);
        });

        it('should return 0.5 at t=0.5 (symmetric midpoint)', () => {
            expect(easeInOutQuad(0.5)).toBeCloseTo(0.5, PRECISION);
        });

        it('should be slow at the start (ease-in for first half)', () => {
            // At t=0.25, output should be less than 0.25
            expect(easeInOutQuad(0.25)).toBeLessThan(0.25);
        });

        it('should be fast in the middle (transition point)', () => {
            // Just after midpoint, should be accelerating
            const justBefore = easeInOutQuad(0.49);
            const justAfter = easeInOutQuad(0.51);
            // Rate of change should be highest at midpoint
            expect(justAfter - justBefore).toBeGreaterThan(0.02 * 0.8);
        });

        it('should be slowing down at the end (ease-out for second half)', () => {
            // At t=0.75, output should be greater than 0.75
            expect(easeInOutQuad(0.75)).toBeGreaterThan(0.75);
        });

        it('should be symmetric around t=0.5', () => {
            // For symmetric ease in-out: f(0.25) should equal 1 - f(0.75) approximately
            const atQuarter = easeInOutQuad(0.25);
            const atThreeQuarters = easeInOutQuad(0.75);
            expect(atQuarter + atThreeQuarters).toBeCloseTo(1, PRECISION);
        });

        it('should be monotonically increasing', () => {
            let prev = -1;
            for (let t = 0; t <= 1; t += 0.05) {
                const current = easeInOutQuad(t);
                expect(current).toBeGreaterThanOrEqual(prev);
                prev = current;
            }
        });
    });

    describe('easeOutBack', () => {
        it('should return 0 at t=0', () => {
            expect(easeOutBack(0)).toBeCloseTo(0, PRECISION);
        });

        it('should return 1 at t=1', () => {
            expect(easeOutBack(1)).toBeCloseTo(1, PRECISION);
        });

        it('should overshoot 1 before settling (characteristic of back easing)', () => {
            // The easeOutBack function overshoots then settles
            // Find the maximum value in the range
            let maxValue = 0;
            for (let t = 0; t <= 1; t += 0.01) {
                maxValue = Math.max(maxValue, easeOutBack(t));
            }
            expect(maxValue).toBeGreaterThan(1);
        });

        it('should overshoot around t=0.5-0.7', () => {
            // The overshoot typically happens in this range
            const midpointValue = easeOutBack(0.6);
            expect(midpointValue).toBeGreaterThan(1);
        });

        it('should settle back to exactly 1 at t=1', () => {
            // Despite overshoot, should land at exactly 1
            expect(easeOutBack(1)).toBe(1);
        });

        it('should be fast at the start (ease-out characteristic)', () => {
            // At t=0.2, output should be significantly greater than 0.2
            expect(easeOutBack(0.2)).toBeGreaterThan(0.3);
        });

        it('should eventually be monotonically settling toward 1 in latter half', () => {
            // After the overshoot, it should be decreasing back to 1
            const at8 = easeOutBack(0.8);
            const at9 = easeOutBack(0.9);
            const at1 = easeOutBack(1);

            // These should be decreasing toward 1 (all > 1 but getting closer)
            expect(at8).toBeGreaterThan(1);
            expect(at9).toBeGreaterThan(at1);
            expect(at9).toBeLessThan(at8);
        });
    });

    describe('value ranges', () => {
        it('all easing functions should handle t=0 and t=1 correctly', () => {
            const funcs = [linear, easeInQuad, easeOutQuad, easeInOutQuad, easeOutBack];
            for (const fn of funcs) {
                expect(fn(0)).toBeCloseTo(0, PRECISION);
                expect(fn(1)).toBeCloseTo(1, PRECISION);
            }
        });

        it('non-back easing functions should stay within [0, 1] range', () => {
            const funcs = [linear, easeInQuad, easeOutQuad, easeInOutQuad];
            for (const fn of funcs) {
                for (let t = 0; t <= 1; t += 0.01) {
                    const value = fn(t);
                    expect(value).toBeGreaterThanOrEqual(0);
                    expect(value).toBeLessThanOrEqual(1);
                }
            }
        });
    });

    describe('edge cases', () => {
        it('should handle values very close to 0', () => {
            const epsilon = 0.0001;
            expect(linear(epsilon)).toBeCloseTo(epsilon, PRECISION);
            expect(easeInQuad(epsilon)).toBeCloseTo(epsilon * epsilon, PRECISION);
        });

        it('should handle values very close to 1', () => {
            const almostOne = 0.9999;
            expect(linear(almostOne)).toBeCloseTo(almostOne, PRECISION);
            expect(easeOutQuad(almostOne)).toBeCloseTo(0.99999999, 4);
        });
    });
});
