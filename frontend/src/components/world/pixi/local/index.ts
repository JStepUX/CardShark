/**
 * Local Map Components
 *
 * These components render the tactical grid view within a room.
 * Used for exploration and combat.
 */

export { LocalMapStage } from './LocalMapStage';
export { LocalMapTile } from './LocalMapTile';
export { EntityCardSprite } from './EntityCardSprite';
export { CardAnimationController } from './CardAnimationController';
export type { CardSpriteInterface } from './CardAnimationController';
export { LocalMapView } from './LocalMapView';
export type { LocalMapViewHandle } from './LocalMapView';
export type { default as LocalMapViewProps } from './LocalMapView';
export { CombatParticleSystem, EFFECT_COLORS, PROJECTILE_PRESETS } from './CombatParticleSystem';
export type { ParticleBurstConfig, DirectionalSprayConfig, ProjectileConfig } from './CombatParticleSystem';

// Sound manager re-export for convenience
export { soundManager } from '../../../combat/pixi/SoundManager';
export type { SoundId } from '../../../combat/pixi/SoundManager';
