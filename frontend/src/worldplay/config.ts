export const WORLD_PLAY_DEFAULT_PLAYER_TILE = {
  x: 2,
  y: 2,
} as const;

export const WORLD_PLAY_TIME = {
  messagesPerDay: 50,
  enableDayNightCycle: true,
} as const;

export const WORLD_PLAY_VIEWPORT = {
  zoom: {
    default: 2.2,
    min: 0.75,
    max: 3.0,
    buttonStep: 0.3,
    wheelStep: 0.15,
    minVisibleFraction: 0.25,
  },
  autoPan: {
    edgeZonePx: 30,
    speedPxPerFrame: 3,
  },
  keyboardPan: {
    speedPxPerFrame: 8,
  },
  recenterOnCombatStart: true,
} as const;

export const WORLD_PLAY_TRANSITION = {
  totalTimeoutMs: 30_000,
  thinFrameTimeoutMs: 30_000,
  summarizationTimeoutMs: 15_000,
  maxMessagesOnTravel: 8,
} as const;

export const WORLD_PLAY_COMBAT = {
  level: {
    min: 1,
    max: 60,
  },
  stats: {
    baseHp: 20,
    hpPerLevel: 5,
    baseDamage: 2,
    damageLevelsPerBonus: 2,
    baseDefense: 5,
    defenseLevelsPerBonus: 3,
    baseSpeed: 3,
    speedLevelsPerBonus: 10,
    armorLevelsPerBonus: 15,
  },
  movement: {
    baseRange: 3,
    speedPerBonusTile: 3,
  },
  attackRange: {
    melee: 1,
    rangedBase: 3,
    rangedLevelsPerBonusTile: 20,
  },
  threatRange: {
    standardMaxLevel: 19,
    eliteMaxLevel: 39,
    standard: 1,
    elite: 2,
    boss: 3,
  },
  ap: {
    base: 2,
    levelsPerBonusAp: 10,
  },
  actionCosts: {
    move: 1,
    difficultMove: 2,
    attack: 2,
    lightAttack: 1,
    defend: 1,
    overwatch: 2,
    aimedShot: 3,
    useItem: 2,
    aoeAttack: 3,
  },
  limits: {
    maxLightAttacksPerTurn: 2,
  },
  progression: {
    xpBase: 100,
    xpExponent: 1.5,
    killXpMultiplier: 10,
    incapacitateXpMultiplier: 5,
    goldMultiplier: 5,
  },
  outcomes: {
    incapacitationChancePercent: 70,
  },
} as const;
