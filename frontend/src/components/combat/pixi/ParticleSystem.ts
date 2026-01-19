import * as PIXI from 'pixi.js';

/**
 * Configuration for particle emission
 */
export interface ParticleConfig {
    x: number;
    y: number;
    texture: 'spark' | 'smoke';
    count: number;
    speed: number;          // pixels per second
    lifetime: number;       // seconds
    gravity?: number;       // pixels per second squared
    fadeOut?: boolean;
    tint?: number;          // color tint (e.g., 0xFFD700 for gold)
    spread?: number;        // emission angle spread in radians (default: Math.PI * 2)
}

/**
 * Individual particle instance
 */
interface Particle {
    sprite: PIXI.Sprite;
    vx: number;             // velocity X
    vy: number;             // velocity Y
    lifetime: number;       // remaining lifetime in seconds
    maxLifetime: number;    // original lifetime for fade calculations
    gravity: number;
    fadeOut: boolean;
    active: boolean;
}

/**
 * Object-pooled particle system for performance
 * Pre-allocates particles and reuses them to avoid GC pressure
 */
export class ParticleSystem {
    private app: PIXI.Application;
    private container: PIXI.Container;
    private pool: Particle[] = [];
    private textures: Map<string, PIXI.Texture> = new Map();
    private readonly POOL_SIZE = 100;

    constructor(app: PIXI.Application, container: PIXI.Container) {
        this.app = app;
        this.container = container;

        // Create programmatic textures
        this.createTextures();

        // Pre-allocate particle pool
        for (let i = 0; i < this.POOL_SIZE; i++) {
            const sprite = new PIXI.Sprite();
            sprite.anchor.set(0.5);
            sprite.visible = false;
            this.container.addChild(sprite);

            this.pool.push({
                sprite,
                vx: 0,
                vy: 0,
                lifetime: 0,
                maxLifetime: 0,
                gravity: 0,
                fadeOut: false,
                active: false,
            });
        }

        // Add update to ticker
        this.app.ticker.add(this.update, this);
    }

    /**
     * Create programmatic particle textures
     */
    private createTextures(): void {
        // Create spark texture (white circle with soft edges)
        const sparkGraphics = new PIXI.Graphics();
        sparkGraphics.circle(16, 16, 12);
        sparkGraphics.fill({ color: 0xFFFFFF, alpha: 1 });

        // Add outer glow
        sparkGraphics.circle(16, 16, 16);
        sparkGraphics.fill({ color: 0xFFFFFF, alpha: 0.3 });

        const sparkTexture = this.app.renderer.generateTexture(sparkGraphics);
        this.textures.set('spark', sparkTexture);

        // Create smoke texture (gray cloud)
        const smokeGraphics = new PIXI.Graphics();

        // Multiple overlapping circles for cloud effect
        smokeGraphics.circle(12, 12, 8);
        smokeGraphics.fill({ color: 0x888888, alpha: 0.6 });

        smokeGraphics.circle(20, 12, 7);
        smokeGraphics.fill({ color: 0x888888, alpha: 0.5 });

        smokeGraphics.circle(16, 18, 6);
        smokeGraphics.fill({ color: 0x888888, alpha: 0.5 });

        const smokeTexture = this.app.renderer.generateTexture(smokeGraphics);
        this.textures.set('smoke', smokeTexture);
    }

    /**
     * Emit particles with the given configuration
     */
    emit(config: ParticleConfig): void {
        const texture = this.textures.get(config.texture);
        if (!texture) {
            console.warn(`Particle texture not found: ${config.texture}`);
            return;
        }

        const spread = config.spread ?? Math.PI * 2;

        for (let i = 0; i < config.count; i++) {
            const particle = this.getInactiveParticle();
            if (!particle) {
                console.warn('Particle pool exhausted');
                break;
            }

            // Random angle within spread
            const angle = Math.random() * spread - spread / 2;
            const speed = config.speed * (0.8 + Math.random() * 0.4); // ±20% variation

            // Setup particle
            particle.sprite.texture = texture;
            particle.sprite.position.set(config.x, config.y);
            particle.sprite.visible = true;
            particle.sprite.alpha = 1;
            particle.sprite.scale.set(1);
            particle.sprite.tint = config.tint ?? 0xFFFFFF;

            particle.vx = Math.cos(angle) * speed;
            particle.vy = Math.sin(angle) * speed;
            particle.lifetime = config.lifetime;
            particle.maxLifetime = config.lifetime;
            particle.gravity = config.gravity ?? 0;
            particle.fadeOut = config.fadeOut ?? true;
            particle.active = true;
        }
    }

    /**
     * Update all active particles
     */
    private update = (ticker: PIXI.Ticker): void => {
        const deltaTime = ticker.deltaMS / 1000; // Convert to seconds

        for (const particle of this.pool) {
            if (!particle.active) continue;

            // Update lifetime
            particle.lifetime -= deltaTime;

            if (particle.lifetime <= 0) {
                // Deactivate particle
                particle.active = false;
                particle.sprite.visible = false;
                continue;
            }

            // Update velocity with gravity
            particle.vy += particle.gravity * deltaTime;

            // Update position
            particle.sprite.x += particle.vx * deltaTime;
            particle.sprite.y += particle.vy * deltaTime;

            // Fade out if enabled
            if (particle.fadeOut) {
                const lifetimeRatio = particle.lifetime / particle.maxLifetime;
                particle.sprite.alpha = lifetimeRatio;
            }
        }
    };

    /**
     * Get an inactive particle from the pool
     */
    private getInactiveParticle(): Particle | null {
        return this.pool.find(p => !p.active) ?? null;
    }

    /**
     * Cleanup and destroy the particle system
     */
    destroy(): void {
        this.app.ticker.remove(this.update, this);

        for (const particle of this.pool) {
            particle.sprite.destroy();
        }

        this.pool = [];
        this.textures.clear();
    }
}
