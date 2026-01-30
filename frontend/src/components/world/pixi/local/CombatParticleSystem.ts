/**
 * @file CombatParticleSystem.ts
 * @description Particle effects system for grid combat attacks.
 *
 * Provides:
 * - Object-pooled particle system for performance
 * - Ranged attack projectiles with trails
 * - Impact bursts for hits
 * - Directional blood splatter for melee hits
 * - Subtle whiff effects for misses
 *
 * Based on existing ParticleSystem.ts pattern but extended for combat effects.
 */

import * as PIXI from 'pixi.js';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for a burst of particles at a point
 */
export interface ParticleBurstConfig {
    x: number;
    y: number;
    count: number;
    color: number;           // Tint color (e.g., 0xFF0000 for red)
    speed: number;           // Pixels per second
    lifetime: number;        // Seconds
    spread?: number;         // Emission angle spread in radians (default: full circle)
    gravity?: number;        // Pixels per second squared (positive = down)
    fadeOut?: boolean;       // Fade alpha over lifetime (default: true)
    shrink?: boolean;        // Shrink scale over lifetime (default: false)
    initialScale?: number;   // Starting scale (default: 1)
}

/**
 * Configuration for directional particle spray (blood splatter, etc.)
 */
export interface DirectionalSprayConfig {
    x: number;
    y: number;
    direction: number;       // Angle in radians (0 = right, PI/2 = down)
    count: number;
    color: number;
    speed: number;
    lifetime: number;
    spread?: number;         // Angle spread around direction (default: PI/4)
    gravity?: number;
    fadeOut?: boolean;
    shrink?: boolean;
    initialScale?: number;
}

/**
 * Configuration for traveling projectile
 */
export interface ProjectileConfig {
    color: number;           // Projectile color
    trailColor?: number;     // Trail particle color (default: same as color)
    size?: number;           // Projectile size scale (default: 1)
    speed?: number;          // Travel speed in pixels per second (default: 600)
    trailEnabled?: boolean;  // Emit trail particles (default: true)
    trailDensity?: number;   // Trail particles per frame (default: 2)
}

// =============================================================================
// Particle Pool
// =============================================================================

interface PooledParticle {
    sprite: PIXI.Sprite;
    vx: number;
    vy: number;
    lifetime: number;
    maxLifetime: number;
    gravity: number;
    fadeOut: boolean;
    shrink: boolean;
    initialScale: number;
    active: boolean;
}

interface ActiveProjectile {
    sprite: PIXI.Sprite;
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
    progress: number;
    duration: number;
    config: ProjectileConfig;
    resolve: () => void;
}

// =============================================================================
// Combat Particle System
// =============================================================================

/**
 * Particle effects system for combat visuals.
 * Uses object pooling for performance.
 */
export class CombatParticleSystem {
    private app: PIXI.Application;
    private container: PIXI.Container;

    // Particle pool
    private particlePool: PooledParticle[] = [];
    private readonly POOL_SIZE = 150;

    // Active projectiles
    private activeProjectiles: ActiveProjectile[] = [];

    // Textures
    private sparkTexture: PIXI.Texture | null = null;
    private glowTexture: PIXI.Texture | null = null;
    private projectileTexture: PIXI.Texture | null = null;

    // Ticker bound function
    private boundUpdate: (ticker: PIXI.Ticker) => void;

    constructor(app: PIXI.Application, container: PIXI.Container) {
        this.app = app;
        this.container = container;

        // Create textures
        this.createTextures();

        // Pre-allocate particle pool
        for (let i = 0; i < this.POOL_SIZE; i++) {
            const sprite = new PIXI.Sprite();
            sprite.anchor.set(0.5);
            sprite.visible = false;
            this.container.addChild(sprite);

            this.particlePool.push({
                sprite,
                vx: 0,
                vy: 0,
                lifetime: 0,
                maxLifetime: 0,
                gravity: 0,
                fadeOut: true,
                shrink: false,
                initialScale: 1,
                active: false,
            });
        }

        // Add update to ticker
        this.boundUpdate = this.update.bind(this);
        this.app.ticker.add(this.boundUpdate);
    }

    /**
     * Create programmatic textures for particles
     */
    private createTextures(): void {
        // Spark texture - small bright circle with glow
        const sparkGraphics = new PIXI.Graphics();
        sparkGraphics.circle(8, 8, 6);
        sparkGraphics.fill({ color: 0xFFFFFF, alpha: 1 });
        sparkGraphics.circle(8, 8, 8);
        sparkGraphics.fill({ color: 0xFFFFFF, alpha: 0.4 });
        this.sparkTexture = this.app.renderer.generateTexture(sparkGraphics);

        // Glow texture - larger soft circle for impact effects
        const glowGraphics = new PIXI.Graphics();
        glowGraphics.circle(16, 16, 8);
        glowGraphics.fill({ color: 0xFFFFFF, alpha: 1 });
        glowGraphics.circle(16, 16, 12);
        glowGraphics.fill({ color: 0xFFFFFF, alpha: 0.5 });
        glowGraphics.circle(16, 16, 16);
        glowGraphics.fill({ color: 0xFFFFFF, alpha: 0.2 });
        this.glowTexture = this.app.renderer.generateTexture(glowGraphics);

        // Projectile texture - elongated glow orb
        const projectileGraphics = new PIXI.Graphics();
        // Core
        projectileGraphics.ellipse(16, 8, 12, 6);
        projectileGraphics.fill({ color: 0xFFFFFF, alpha: 1 });
        // Outer glow
        projectileGraphics.ellipse(16, 8, 16, 8);
        projectileGraphics.fill({ color: 0xFFFFFF, alpha: 0.4 });
        this.projectileTexture = this.app.renderer.generateTexture(projectileGraphics);
    }

    /**
     * Emit a burst of particles at a point (omnidirectional)
     */
    emit(config: ParticleBurstConfig): void {
        if (!this.sparkTexture) return;

        const spread = config.spread ?? Math.PI * 2;
        const startAngle = spread === Math.PI * 2 ? 0 : -spread / 2;

        for (let i = 0; i < config.count; i++) {
            const particle = this.getInactiveParticle();
            if (!particle) break;

            // Random angle within spread
            const angle = startAngle + Math.random() * spread;
            const speed = config.speed * (0.7 + Math.random() * 0.6); // 70-130% variation
            const scale = (config.initialScale ?? 1) * (0.5 + Math.random() * 0.5);

            this.activateParticle(particle, {
                x: config.x,
                y: config.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: config.color,
                lifetime: config.lifetime * (0.8 + Math.random() * 0.4),
                gravity: config.gravity ?? 0,
                fadeOut: config.fadeOut ?? true,
                shrink: config.shrink ?? false,
                initialScale: scale,
            });
        }
    }

    /**
     * Emit particles in a specific direction (for blood splatter)
     */
    emitDirectional(config: DirectionalSprayConfig): void {
        if (!this.sparkTexture) return;

        const spread = config.spread ?? Math.PI / 4;

        for (let i = 0; i < config.count; i++) {
            const particle = this.getInactiveParticle();
            if (!particle) break;

            // Angle centered on direction with spread
            const angleOffset = (Math.random() - 0.5) * spread;
            const angle = config.direction + angleOffset;
            const speed = config.speed * (0.6 + Math.random() * 0.8);
            const scale = (config.initialScale ?? 1) * (0.4 + Math.random() * 0.6);

            this.activateParticle(particle, {
                x: config.x + (Math.random() - 0.5) * 10,
                y: config.y + (Math.random() - 0.5) * 10,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: config.color,
                lifetime: config.lifetime * (0.7 + Math.random() * 0.6),
                gravity: config.gravity ?? 100,
                fadeOut: config.fadeOut ?? true,
                shrink: config.shrink ?? true,
                initialScale: scale,
            });
        }
    }

    /**
     * Play a projectile effect traveling from start to target.
     * Returns a promise that resolves when projectile reaches target.
     */
    playProjectile(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        config: ProjectileConfig
    ): Promise<void> {
        return new Promise((resolve) => {
            if (!this.projectileTexture) {
                resolve();
                return;
            }

            // Create projectile sprite
            const sprite = new PIXI.Sprite(this.projectileTexture);
            sprite.anchor.set(0.5);
            sprite.tint = config.color;
            sprite.scale.set(config.size ?? 1);
            sprite.x = fromX;
            sprite.y = fromY;

            // Calculate angle to target
            const dx = toX - fromX;
            const dy = toY - fromY;
            sprite.rotation = Math.atan2(dy, dx);

            this.container.addChild(sprite);

            // Calculate duration based on distance and speed
            const distance = Math.sqrt(dx * dx + dy * dy);
            const speed = config.speed ?? 600;
            const duration = (distance / speed) * 1000; // ms

            this.activeProjectiles.push({
                sprite,
                startX: fromX,
                startY: fromY,
                targetX: toX,
                targetY: toY,
                progress: 0,
                duration: Math.max(100, duration), // Minimum 100ms
                config,
                resolve,
            });
        });
    }

    /**
     * Play an impact burst effect at a position
     */
    playImpact(x: number, y: number, color: number, intensity: number = 1): void {
        // Central flash
        this.emit({
            x,
            y,
            count: Math.floor(8 * intensity),
            color,
            speed: 80 * intensity,
            lifetime: 0.25,
            spread: Math.PI * 2,
            fadeOut: true,
            shrink: true,
            initialScale: 1.5 * intensity,
        });

        // Outer sparks
        this.emit({
            x,
            y,
            count: Math.floor(12 * intensity),
            color,
            speed: 150 * intensity,
            lifetime: 0.35,
            spread: Math.PI * 2,
            gravity: 50,
            fadeOut: true,
            initialScale: 0.8,
        });
    }

    /**
     * Play a miss/whiff effect (subtle air displacement)
     */
    playWhiff(x: number, y: number): void {
        // Very subtle gray particles
        this.emit({
            x,
            y,
            count: 4,
            color: 0x888888,
            speed: 40,
            lifetime: 0.2,
            spread: Math.PI * 2,
            fadeOut: true,
            initialScale: 0.5,
        });
    }

    /**
     * Update all active particles and projectiles
     */
    private update(ticker: PIXI.Ticker): void {
        const deltaTime = ticker.deltaMS / 1000;

        // Update particles
        for (const particle of this.particlePool) {
            if (!particle.active) continue;

            particle.lifetime -= deltaTime;

            if (particle.lifetime <= 0) {
                particle.active = false;
                particle.sprite.visible = false;
                continue;
            }

            // Apply gravity
            particle.vy += particle.gravity * deltaTime;

            // Update position
            particle.sprite.x += particle.vx * deltaTime;
            particle.sprite.y += particle.vy * deltaTime;

            // Calculate life ratio for effects
            const lifeRatio = particle.lifetime / particle.maxLifetime;

            // Fade out
            if (particle.fadeOut) {
                particle.sprite.alpha = lifeRatio;
            }

            // Shrink
            if (particle.shrink) {
                const scale = particle.initialScale * lifeRatio;
                particle.sprite.scale.set(scale);
            }
        }

        // Update projectiles
        for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
            const proj = this.activeProjectiles[i];
            proj.progress += ticker.deltaMS;

            const t = Math.min(1, proj.progress / proj.duration);

            // Ease out for smooth deceleration at target
            const eased = 1 - Math.pow(1 - t, 2);

            // Update position
            proj.sprite.x = proj.startX + (proj.targetX - proj.startX) * eased;
            proj.sprite.y = proj.startY + (proj.targetY - proj.startY) * eased;

            // Emit trail particles
            if (proj.config.trailEnabled !== false && Math.random() < 0.6) {
                const trailCount = proj.config.trailDensity ?? 2;
                for (let j = 0; j < trailCount; j++) {
                    const particle = this.getInactiveParticle();
                    if (!particle) break;

                    this.activateParticle(particle, {
                        x: proj.sprite.x + (Math.random() - 0.5) * 8,
                        y: proj.sprite.y + (Math.random() - 0.5) * 8,
                        vx: (Math.random() - 0.5) * 20,
                        vy: (Math.random() - 0.5) * 20,
                        color: proj.config.trailColor ?? proj.config.color,
                        lifetime: 0.15 + Math.random() * 0.1,
                        gravity: 0,
                        fadeOut: true,
                        shrink: true,
                        initialScale: 0.4 + Math.random() * 0.3,
                    });
                }
            }

            // Projectile reached target
            if (t >= 1) {
                // Remove and cleanup
                this.container.removeChild(proj.sprite);
                proj.sprite.destroy();
                proj.resolve();
                this.activeProjectiles.splice(i, 1);
            }
        }
    }

    /**
     * Get an inactive particle from the pool
     */
    private getInactiveParticle(): PooledParticle | null {
        return this.particlePool.find(p => !p.active) ?? null;
    }

    /**
     * Activate a pooled particle with settings
     */
    private activateParticle(
        particle: PooledParticle,
        settings: {
            x: number;
            y: number;
            vx: number;
            vy: number;
            color: number;
            lifetime: number;
            gravity: number;
            fadeOut: boolean;
            shrink: boolean;
            initialScale: number;
        }
    ): void {
        particle.sprite.texture = this.sparkTexture!;
        particle.sprite.position.set(settings.x, settings.y);
        particle.sprite.tint = settings.color;
        particle.sprite.alpha = 1;
        particle.sprite.scale.set(settings.initialScale);
        particle.sprite.visible = true;

        particle.vx = settings.vx;
        particle.vy = settings.vy;
        particle.lifetime = settings.lifetime;
        particle.maxLifetime = settings.lifetime;
        particle.gravity = settings.gravity;
        particle.fadeOut = settings.fadeOut;
        particle.shrink = settings.shrink;
        particle.initialScale = settings.initialScale;
        particle.active = true;
    }

    /**
     * Cleanup and destroy the particle system
     */
    destroy(): void {
        this.app.ticker.remove(this.boundUpdate);

        // Destroy all particles
        for (const particle of this.particlePool) {
            particle.sprite.destroy();
        }
        this.particlePool = [];

        // Destroy active projectiles
        for (const proj of this.activeProjectiles) {
            proj.sprite.destroy();
        }
        this.activeProjectiles = [];

        // Destroy textures
        this.sparkTexture?.destroy(true);
        this.glowTexture?.destroy(true);
        this.projectileTexture?.destroy(true);
    }
}

// =============================================================================
// Preset Effect Configurations
// =============================================================================

/**
 * Preset colors for different damage types
 */
export const EFFECT_COLORS = {
    physical: 0xFFFFFF,      // White/silver
    fire: 0xFF6600,          // Orange
    ice: 0x66CCFF,           // Light blue
    lightning: 0xFFFF00,     // Yellow
    poison: 0x00FF00,        // Green
    blood: 0xCC0000,         // Dark red
    magic: 0xAA66FF,         // Purple
} as const;

/**
 * Preset projectile configs
 */
export const PROJECTILE_PRESETS = {
    arrow: {
        color: 0xCCCCCC,
        trailColor: 0x888888,
        size: 0.8,
        speed: 800,
        trailEnabled: false,
    } as ProjectileConfig,

    magic: {
        color: 0xAA66FF,
        trailColor: 0x8844CC,
        size: 1.0,
        speed: 600,
        trailEnabled: true,
        trailDensity: 3,
    } as ProjectileConfig,

    fire: {
        color: 0xFF6600,
        trailColor: 0xFF3300,
        size: 1.2,
        speed: 500,
        trailEnabled: true,
        trailDensity: 4,
    } as ProjectileConfig,

    energy: {
        color: 0xFFFF00,
        trailColor: 0xFFCC00,
        size: 0.9,
        speed: 700,
        trailEnabled: true,
        trailDensity: 2,
    } as ProjectileConfig,
};
