/**
 * @file PlayerToken.ts
 * @description Animated player marker sprite for the world map.
 * 
 * Features:
 * - Idle pulse animation (gentle breathing effect)
 * - Position updates with smooth transitions
 * - Visual indicator (glowing dot with player icon)
 */

import * as PIXI from 'pixi.js';

// Token dimensions
const TOKEN_SIZE = 24;

// Colors
const TOKEN_COLOR = 0x3B82F6; // blue-500
const TOKEN_GLOW = 0x60A5FA; // blue-400

export class PlayerToken extends PIXI.Container {
    private innerCircle!: PIXI.Graphics;
    private outerGlow!: PIXI.Graphics;
    private iconText!: PIXI.Text;

    // Animation state
    private pulseTime: number = 0;

    constructor() {
        super();

        // Create visual layers
        this.outerGlow = this.createOuterGlow();
        this.addChild(this.outerGlow);

        this.innerCircle = this.createInnerCircle();
        this.addChild(this.innerCircle);

        this.iconText = this.createIcon();
        this.addChild(this.iconText);
    }

    /**
     * Create outer glow ring
     */
    private createOuterGlow(): PIXI.Graphics {
        const glow = new PIXI.Graphics();
        glow.circle(0, 0, TOKEN_SIZE);
        glow.fill({ color: TOKEN_GLOW, alpha: 0.3 });
        return glow;
    }

    /**
     * Create inner circle
     */
    private createInnerCircle(): PIXI.Graphics {
        const circle = new PIXI.Graphics();
        circle.circle(0, 0, TOKEN_SIZE * 0.6);
        circle.fill({ color: TOKEN_COLOR, alpha: 0.9 });
        circle.stroke({ color: 0xFFFFFF, alpha: 0.8, width: 2 });
        return circle;
    }

    /**
     * Create player icon
     */
    private createIcon(): PIXI.Text {
        const text = new PIXI.Text({
            text: '👤',
            style: {
                fontSize: 16,
            }
        });
        text.anchor.set(0.5);
        return text;
    }

    /**
     * Update idle pulse animation
     * Call this from ticker
     */
    updatePulse(deltaTime: number): void {
        this.pulseTime += deltaTime * 2; // Gentle pulse speed

        // Outer glow pulses (scale and alpha)
        const glowPulse = 1.0 + Math.sin(this.pulseTime) * 0.15; // 0.85 to 1.15
        const glowAlpha = 0.2 + Math.sin(this.pulseTime) * 0.1; // 0.1 to 0.3
        this.outerGlow.scale.set(glowPulse);
        this.outerGlow.alpha = glowAlpha;

        // Inner circle subtle pulse
        const innerPulse = 1.0 + Math.sin(this.pulseTime) * 0.05; // 0.95 to 1.05
        this.innerCircle.scale.set(innerPulse);
    }

    /**
     * Cleanup
     */
    destroy(options?: boolean | PIXI.DestroyOptions): void {
        super.destroy(options);
    }
}
