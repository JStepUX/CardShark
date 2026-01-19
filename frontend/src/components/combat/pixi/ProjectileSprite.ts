import * as PIXI from 'pixi.js';
import { ParticleSystem } from './ParticleSystem';

/**
 * Projectile sprite for ranged attacks
 * Supports arc (arrows) and straight (magic) trajectories
 */
export class ProjectileSprite extends PIXI.Sprite {
    private app: PIXI.Application;
    private particleSystem?: ParticleSystem;
    private startX: number = 0;
    private startY: number = 0;
    private targetX: number = 0;
    private targetY: number = 0;
    private progress: number = 0;
    private duration: number = 0;
    private type: 'arc' | 'straight' = 'straight';
    private resolve?: () => void;

    constructor(app: PIXI.Application, texture: PIXI.Texture, particleSystem?: ParticleSystem) {
        super(texture);
        this.app = app;
        this.particleSystem = particleSystem;
        this.anchor.set(0.5);
        this.visible = false;
    }

    /**
     * Fly projectile to target position
     * @param target Target coordinates
     * @param type Trajectory type: 'arc' for arrows, 'straight' for magic
     * @returns Promise that resolves when projectile reaches target
     */
    async flyTo(target: { x: number; y: number }, type: 'arc' | 'straight' = 'straight'): Promise<void> {
        this.startX = this.x;
        this.startY = this.y;
        this.targetX = target.x;
        this.targetY = target.y;
        this.type = type;
        this.progress = 0;
        this.visible = true;

        // Set duration based on type
        this.duration = type === 'arc' ? 400 : 300; // ms

        return new Promise<void>((resolve) => {
            this.resolve = resolve;
            this.app.ticker.add(this.update, this);
        });
    }

    /**
     * Update projectile position based on trajectory type
     */
    private update = (ticker: PIXI.Ticker): void => {
        const deltaTime = ticker.deltaMS;
        this.progress += deltaTime;

        if (this.progress >= this.duration) {
            // Reached target
            this.complete();
            return;
        }

        const t = this.progress / this.duration;

        if (this.type === 'arc') {
            this.updateArc(t);
        } else {
            this.updateStraight(t);
        }
    };

    /**
     * Update position for arc trajectory (arrows)
     * Parabolic path with apex at midpoint
     */
    private updateArc(t: number): void {
        // Linear interpolation for X
        this.x = this.startX + (this.targetX - this.startX) * t;

        // Parabolic arc for Y (apex at t=0.5)
        const baseY = this.startY + (this.targetY - this.startY) * t;
        const arcHeight = 60; // pixels
        const arc = -4 * arcHeight * t * (t - 1); // Parabola: -4h*t*(t-1)
        this.y = baseY - arc;

        // Rotate to follow trajectory
        const dx = this.targetX - this.startX;
        const dy = (this.targetY - this.startY) - (arcHeight * (1 - 2 * t) * 4);
        this.rotation = Math.atan2(dy, dx);
    }

    /**
     * Update position for straight trajectory (magic)
     * Emits particle trail during flight
     */
    private updateStraight(t: number): void {
        // Linear interpolation
        this.x = this.startX + (this.targetX - this.startX) * t;
        this.y = this.startY + (this.targetY - this.startY) * t;

        // Point toward target
        const dx = this.targetX - this.startX;
        const dy = this.targetY - this.startY;
        this.rotation = Math.atan2(dy, dx);

        // Emit particle trail (2 sparks per frame)
        if (this.particleSystem && Math.random() < 0.5) {
            this.particleSystem.emit({
                x: this.x,
                y: this.y,
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

    /**
     * Complete the projectile flight
     */
    private complete(): void {
        this.app.ticker.remove(this.update, this);
        this.visible = false;
        this.progress = 0;

        if (this.resolve) {
            this.resolve();
            this.resolve = undefined;
        }
    }

    /**
     * Cleanup
     */
    destroy(options?: boolean | PIXI.DestroyOptions): void {
        this.app.ticker.remove(this.update, this);
        super.destroy(options);
    }
}

/**
 * Create programmatic projectile textures
 */
export function createProjectileTextures(renderer: PIXI.Renderer): {
    arrow: PIXI.Texture;
    fireball: PIXI.Texture;
} {
    // Create arrow texture (16x16, pointing right)
    const arrowGraphics = new PIXI.Graphics();

    // Arrow shaft (brown)
    arrowGraphics.rect(0, 7, 12, 2);
    arrowGraphics.fill({ color: 0x8B4513 });

    // Arrowhead (gray metal)
    arrowGraphics.moveTo(12, 8);
    arrowGraphics.lineTo(16, 8);
    arrowGraphics.lineTo(12, 4);
    arrowGraphics.lineTo(12, 12);
    arrowGraphics.lineTo(16, 8);
    arrowGraphics.fill({ color: 0x888888 });

    // Fletching (red)
    arrowGraphics.moveTo(0, 8);
    arrowGraphics.lineTo(0, 5);
    arrowGraphics.lineTo(3, 8);
    arrowGraphics.lineTo(0, 11);
    arrowGraphics.lineTo(0, 8);
    arrowGraphics.fill({ color: 0xCC0000 });

    const arrowTexture = renderer.generateTexture(arrowGraphics);

    // Create fireball texture (32x32, glowing orb)
    const fireballGraphics = new PIXI.Graphics();

    // Outer glow (red)
    fireballGraphics.circle(16, 16, 16);
    fireballGraphics.fill({ color: 0xFF3300, alpha: 0.3 });

    // Middle layer (orange)
    fireballGraphics.circle(16, 16, 12);
    fireballGraphics.fill({ color: 0xFF6600, alpha: 0.8 });

    // Core (bright yellow)
    fireballGraphics.circle(16, 16, 8);
    fireballGraphics.fill({ color: 0xFFFF00, alpha: 1 });

    // Hot spot (white)
    fireballGraphics.circle(14, 14, 4);
    fireballGraphics.fill({ color: 0xFFFFFF, alpha: 0.8 });

    const fireballTexture = renderer.generateTexture(fireballGraphics);

    return { arrow: arrowTexture, fireball: fireballTexture };
}
