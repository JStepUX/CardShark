/**
 * @file MapAnimations.ts
 * @description Animation classes for world map travel and room interactions.
 * 
 * Implements the Animation interface from AnimationManager.
 */

import * as PIXI from 'pixi.js';
import { Animation } from '../../combat/pixi/AnimationManager';
import { easeInQuad, easeOutQuad, easeOutBack } from '../../combat/pixi/easing';
import { RoomTile } from './RoomTile';

/**
 * Travel animation: hop motion from source to target room
 * Duration: 500ms (anticipation + hop + land)
 * 
 * Reuses the hop pattern from MoveAnimation in combat
 */
export class TravelAnimation implements Animation {
    private playerToken: PIXI.Container;
    private startX: number;
    private startY: number;
    private targetX: number;
    private targetY: number;
    private elapsed: number = 0;
    private readonly duration = 0.5; // 500ms

    private originalScaleX: number;
    private originalScaleY: number;

    // Animation phases
    private readonly anticipateEnd = 0.15;  // Squat down (75ms)
    private readonly hopEnd = 0.7;          // Jump and travel (275ms)
    private readonly landEnd = 1.0;         // Land and settle (150ms)

    // Movement parameters
    private readonly hopHeight = 40;        // How high to jump
    private readonly squashAmount = 0.12;   // Squash amount
    private readonly stretchAmount = 0.1;   // Stretch amount

    constructor(
        playerToken: PIXI.Container,
        startX: number,
        startY: number,
        targetX: number,
        targetY: number
    ) {
        this.playerToken = playerToken;
        this.startX = startX;
        this.startY = startY;
        this.targetX = targetX;
        this.targetY = targetY;

        this.originalScaleX = playerToken.scale.x;
        this.originalScaleY = playerToken.scale.y;
    }

    update(deltaTime: number): boolean {
        this.elapsed += deltaTime;
        const progress = Math.min(this.elapsed / this.duration, 1);

        if (progress < this.anticipateEnd) {
            // Phase 1: Anticipation - squat down
            const t = easeInQuad(progress / this.anticipateEnd);

            this.playerToken.x = this.startX;

            // Squash
            const scaleX = this.originalScaleX * (1 + this.squashAmount * t);
            const scaleY = this.originalScaleY * (1 - this.squashAmount * t);
            this.playerToken.scale.set(scaleX, scaleY);

            // Slight downward shift
            this.playerToken.y = this.startY + (6 * t);

        } else if (progress < this.hopEnd) {
            // Phase 2: Hop - jump and travel
            const phaseProgress = (progress - this.anticipateEnd) / (this.hopEnd - this.anticipateEnd);
            const t = easeOutQuad(phaseProgress);

            // Move toward target
            this.playerToken.x = this.startX + (this.targetX - this.startX) * t;

            // Parabolic arc
            const arcProgress = phaseProgress;
            const arc = -4 * this.hopHeight * arcProgress * (arcProgress - 1);
            const baseY = this.startY + (this.targetY - this.startY) * t;
            this.playerToken.y = baseY - arc;

            // Stretch during flight
            let stretchFactor: number;
            if (phaseProgress < 0.4) {
                const stretchT = easeOutQuad(phaseProgress / 0.4);
                stretchFactor = this.stretchAmount * stretchT;
            } else if (phaseProgress < 0.6) {
                stretchFactor = this.stretchAmount * 0.3;
            } else {
                const stretchT = (phaseProgress - 0.6) / 0.4;
                stretchFactor = this.stretchAmount * (0.3 + stretchT * 0.5);
            }

            const scaleX = this.originalScaleX * (1 - stretchFactor * 0.5);
            const scaleY = this.originalScaleY * (1 + stretchFactor);
            this.playerToken.scale.set(scaleX, scaleY);

        } else {
            // Phase 3: Land - impact squash and settle
            const phaseProgress = (progress - this.hopEnd) / (this.landEnd - this.hopEnd);

            this.playerToken.x = this.targetX;

            // Landing squash then bounce back
            let squashFactor: number;
            let yOffset: number;

            if (phaseProgress < 0.3) {
                // Impact squash
                const t = easeOutQuad(phaseProgress / 0.3);
                squashFactor = this.squashAmount * 1.2 * t;
                yOffset = 5 * t;
            } else if (phaseProgress < 0.6) {
                // Bounce back
                const t = (phaseProgress - 0.3) / 0.3;
                squashFactor = this.squashAmount * 1.2 * (1 - t);
                yOffset = 5 * (1 - t) - 3 * easeOutQuad(t);
            } else {
                // Settle
                const t = easeOutQuad((phaseProgress - 0.6) / 0.4);
                squashFactor = 0;
                yOffset = -3 * (1 - t);
            }

            const scaleX = this.originalScaleX * (1 + squashFactor);
            const scaleY = this.originalScaleY * (1 - squashFactor);
            this.playerToken.scale.set(scaleX, scaleY);
            this.playerToken.y = this.targetY + yOffset;
        }

        return progress >= 1;
    }

    onComplete(): void {
        // Ensure exact final position and scale
        this.playerToken.x = this.targetX;
        this.playerToken.y = this.targetY;
        this.playerToken.scale.set(this.originalScaleX, this.originalScaleY);
    }
}

/**
 * Player depart animation: lift off with slight scale
 * Duration: 200ms
 */
export class PlayerDepartAnimation implements Animation {
    private playerToken: PIXI.Container;
    private elapsed: number = 0;
    private readonly duration = 0.2; // 200ms

    private originalY: number;
    private originalScale: number;

    constructor(playerToken: PIXI.Container) {
        this.playerToken = playerToken;
        this.originalY = playerToken.y;
        this.originalScale = playerToken.scale.x;
    }

    update(deltaTime: number): boolean {
        this.elapsed += deltaTime;
        const progress = Math.min(this.elapsed / this.duration, 1);
        const t = easeOutQuad(progress);

        // Lift up slightly
        this.playerToken.y = this.originalY - (8 * t);

        // Scale up slightly
        const scale = this.originalScale * (1 + 0.1 * t);
        this.playerToken.scale.set(scale);

        // Fade slightly
        this.playerToken.alpha = 1 - (0.2 * t);

        return progress >= 1;
    }

    onComplete(): void {
        // Reset for travel animation
        this.playerToken.y = this.originalY;
        this.playerToken.scale.set(this.originalScale);
        this.playerToken.alpha = 1;
    }
}

/**
 * Player arrive animation: land with slight bounce
 * Duration: 200ms
 */
export class PlayerArriveAnimation implements Animation {
    private playerToken: PIXI.Container;
    private elapsed: number = 0;
    private readonly duration = 0.2; // 200ms

    private targetY: number;
    private originalScale: number;

    constructor(playerToken: PIXI.Container) {
        this.playerToken = playerToken;
        this.targetY = playerToken.y;
        this.originalScale = playerToken.scale.x;
    }

    update(deltaTime: number): boolean {
        this.elapsed += deltaTime;
        const progress = Math.min(this.elapsed / this.duration, 1);

        if (progress < 0.5) {
            // Descend
            const t = easeInQuad(progress / 0.5);
            this.playerToken.y = this.targetY - 8 + (8 * t);
            this.playerToken.alpha = 0.8 + (0.2 * t);
        } else {
            // Settle with slight bounce
            const t = easeOutBack((progress - 0.5) / 0.5);
            this.playerToken.y = this.targetY;
            const scale = this.originalScale * (1 + 0.1 * (1 - t));
            this.playerToken.scale.set(scale);
        }

        return progress >= 1;
    }

    onComplete(): void {
        this.playerToken.y = this.targetY;
        this.playerToken.scale.set(this.originalScale);
        this.playerToken.alpha = 1;
    }
}

/**
 * Room select animation: glow and pulse
 * Duration: 300ms
 */
export class RoomSelectAnimation implements Animation {
    private roomTile: RoomTile;
    private elapsed: number = 0;
    private readonly duration = 0.3; // 300ms

    constructor(roomTile: RoomTile) {
        this.roomTile = roomTile;
    }

    update(deltaTime: number): boolean {
        this.elapsed += deltaTime;
        const progress = Math.min(this.elapsed / this.duration, 1);
        const t = easeOutBack(progress);

        // Pulse scale
        const scale = 1 + (0.1 * (1 - t));
        this.roomTile.scale.set(scale);

        return progress >= 1;
    }

    onComplete(): void {
        this.roomTile.scale.set(1);
    }
}

/**
 * Room deselect animation: fade out glow
 * Duration: 200ms
 */
export class RoomDeselectAnimation implements Animation {
    private roomTile: RoomTile;
    private elapsed: number = 0;
    private readonly duration = 0.2; // 200ms

    constructor(roomTile: RoomTile) {
        this.roomTile = roomTile;
    }

    update(deltaTime: number): boolean {
        this.elapsed += deltaTime;
        const progress = Math.min(this.elapsed / this.duration, 1);

        // Fade scale back to normal
        const t = easeOutQuad(progress);
        const scale = 1.05 - (0.05 * t);
        this.roomTile.scale.set(scale);

        return progress >= 1;
    }

    onComplete(): void {
        this.roomTile.scale.set(1);
    }
}
