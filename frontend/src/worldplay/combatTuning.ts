import { WORLD_PLAY_COMBAT } from './config';

export interface DerivedCombatTuningStats {
  hp: number;
  maxHp: number;
  damage: number;
  defense: number;
  speed: number;
  armor: number;
  weaponType: 'melee' | 'ranged';
  movementRange: number;
  attackRange: number;
  threatRange: number;
  ap: number;
}

export function clampCombatLevel(level: number): number {
  return Math.max(WORLD_PLAY_COMBAT.level.min, Math.min(WORLD_PLAY_COMBAT.level.max, level));
}

export function deriveThreatRange(level: number): number {
  const clampedLevel = clampCombatLevel(level);

  if (clampedLevel <= WORLD_PLAY_COMBAT.threatRange.standardMaxLevel) {
    return WORLD_PLAY_COMBAT.threatRange.standard;
  }

  if (clampedLevel <= WORLD_PLAY_COMBAT.threatRange.eliteMaxLevel) {
    return WORLD_PLAY_COMBAT.threatRange.elite;
  }

  return WORLD_PLAY_COMBAT.threatRange.boss;
}

export function deriveMovementRangeFromSpeed(speed: number): number {
  return WORLD_PLAY_COMBAT.movement.baseRange
    + Math.floor((speed - WORLD_PLAY_COMBAT.stats.baseSpeed) / WORLD_PLAY_COMBAT.movement.speedPerBonusTile);
}

export function deriveRangedAttackRange(level: number): number {
  return WORLD_PLAY_COMBAT.attackRange.rangedBase
    + Math.floor(clampCombatLevel(level) / WORLD_PLAY_COMBAT.attackRange.rangedLevelsPerBonusTile);
}

export function deriveAPForLevel(level: number): number {
  return WORLD_PLAY_COMBAT.ap.base
    + Math.floor(clampCombatLevel(level) / WORLD_PLAY_COMBAT.ap.levelsPerBonusAp);
}

export function deriveCombatTuningStats(
  level: number,
  weaponType: 'melee' | 'ranged' = 'melee'
): DerivedCombatTuningStats {
  const clampedLevel = clampCombatLevel(level);
  const hp = WORLD_PLAY_COMBAT.stats.baseHp + (clampedLevel * WORLD_PLAY_COMBAT.stats.hpPerLevel);
  const damage = WORLD_PLAY_COMBAT.stats.baseDamage
    + Math.floor(clampedLevel / WORLD_PLAY_COMBAT.stats.damageLevelsPerBonus);
  const defense = WORLD_PLAY_COMBAT.stats.baseDefense
    + Math.floor(clampedLevel / WORLD_PLAY_COMBAT.stats.defenseLevelsPerBonus);
  const speed = WORLD_PLAY_COMBAT.stats.baseSpeed
    + Math.floor(clampedLevel / WORLD_PLAY_COMBAT.stats.speedLevelsPerBonus);
  const armor = Math.floor(clampedLevel / WORLD_PLAY_COMBAT.stats.armorLevelsPerBonus);

  return {
    hp,
    maxHp: hp,
    damage,
    defense,
    speed,
    armor,
    weaponType,
    movementRange: deriveMovementRangeFromSpeed(speed),
    attackRange: weaponType === 'melee'
      ? WORLD_PLAY_COMBAT.attackRange.melee
      : deriveRangedAttackRange(clampedLevel),
    threatRange: deriveThreatRange(clampedLevel),
    ap: deriveAPForLevel(clampedLevel),
  };
}

export function calculateCombatXPForNextLevel(level: number): number {
  return Math.floor(
    WORLD_PLAY_COMBAT.progression.xpBase * Math.pow(clampCombatLevel(level), WORLD_PLAY_COMBAT.progression.xpExponent)
  );
}

export function calculateCombatEnemyXP(enemyLevel: number, wasKilled: boolean): number {
  return clampCombatLevel(enemyLevel)
    * (wasKilled
      ? WORLD_PLAY_COMBAT.progression.killXpMultiplier
      : WORLD_PLAY_COMBAT.progression.incapacitateXpMultiplier);
}

export function calculateCombatGoldDrop(enemyLevel: number): number {
  return clampCombatLevel(enemyLevel) * WORLD_PLAY_COMBAT.progression.goldMultiplier;
}