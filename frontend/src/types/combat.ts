/**
 * @file combat.ts
 * @description Combat system type definitions and stat derivation formulas.
 *
 * This file is the single source of truth for:
 * - All combat-related TypeScript interfaces
 * - The stat derivation formula (deriveCombatStats)
 * - Hit quality calculations
 *
 * ## Design Philosophy
 * World creators only set ONE field on hostile NPCs: `monster_level` (1-60).
 * All other stats (HP, damage, defense, etc.) derive from this single value.
 *
 * ## Stat Reference Table
 * | Level | HP  | Damage | Defense | Speed | Armor |
 * |-------|-----|--------|---------|-------|-------|
 * | 1     | 25  | 2      | 5       | 3     | 0     |
 * | 10    | 70  | 7      | 8       | 4     | 0     |
 * | 30    | 170 | 17     | 15      | 6     | 2     |
 * | 60    | 320 | 32     | 25      | 9     | 4     |
 *
 * @see /docs/combat-system.md for full documentation
 * @see /tools/combat-simulator.js for balance testing
 */

// =============================================================================
// Combat Stats
// =============================================================================

/**
 * Derived combat stats for any combatant.
 * All stats are calculated from monster_level using deriveCombatStats().
 */
export interface CombatStats {
  hp: number;
  maxHp: number;
  damage: number;
  defense: number;
  speed: number;
  armor: number;
  weaponType: 'melee' | 'ranged';
}

/**
 * Derive all combat stats from a single monster level (1-60).
 *
 * This is the ONLY function that determines combatant stats. When balancing
 * combat, modify ONLY these formulas and use the simulator to verify changes.
 *
 * ## Current Formulas (V1)
 * - HP: 20 + (level × 5) → 25 to 320
 * - Damage: 2 + floor(level / 2) → 2 to 32
 * - Defense: 5 + floor(level / 3) → 5 to 25
 * - Speed: 3 + floor(level / 10) → 3 to 9
 * - Armor: floor(level / 15) → 0 to 4
 *
 * ## Known Balance Issues
 * - Miss rate drops to 0% at level 26+ (attack bonus outpaces defense)
 * - Level disparity is too punishing (0% win rate vs +5 level enemies)
 *
 * @param level - Monster level from 1 to 60 (clamped if out of range)
 * @returns Complete stat block for a combatant of that level
 *
 * @example
 * const goblinStats = deriveCombatStats(5);  // Level 5 goblin
 * // { hp: 45, damage: 4, defense: 6, speed: 3, armor: 0 }
 *
 * @example
 * const bossStats = deriveCombatStats(40);   // Level 40 boss
 * // { hp: 220, damage: 22, defense: 18, speed: 7, armor: 2 }
 */
export function deriveCombatStats(level: number): CombatStats {
  const clampedLevel = Math.max(1, Math.min(60, level));
  const hp = 20 + (clampedLevel * 5);

  return {
    hp,
    maxHp: hp,
    damage: 2 + Math.floor(clampedLevel / 2),
    defense: 5 + Math.floor(clampedLevel / 3),
    speed: 3 + Math.floor(clampedLevel / 10),
    armor: Math.floor(clampedLevel / 15),
    weaponType: 'melee', // Hardcoded V1
  };
}

// =============================================================================
// Combatant Types
// =============================================================================

/**
 * A combatant in the battle (player, ally, or enemy).
 */
export interface Combatant {
  id: string;
  name: string;
  level: number;
  imagePath: string | null;
  isPlayerControlled: boolean;
  isPlayer: boolean; // true for THE player character

  // Current combat state
  currentHp: number;
  maxHp: number;
  damage: number;
  defense: number;
  speed: number;
  armor: number;
  weaponType: 'melee' | 'ranged';

  // Position on battlefield (0-4) - legacy slot-based system, unused in grid combat
  slotPosition: number;

  // Per-turn state
  apRemaining: number;

  // Status effects
  isDefending: boolean;
  isOverwatching: boolean;
  hasAimedShot: boolean;         // Ranged only: stored +3 hit, +2 damage bonus
  isKnockedOut: boolean;
  defendingAllyId?: string;      // ID of ally this combatant is protecting
  protectedByDefenderId?: string; // ID of defender protecting this combatant
  overwatchPenalty?: number;      // Variable accuracy penalty for overwatch (1-3)

  // Death/Incapacitation state (set when knocked out)
  isIncapacitated: boolean;      // Knocked out but alive - can be revived/captured
  isDead: boolean;               // Permanently dead - removed from world

  // UI state (clears after render)
  recentDamage: number | null;
  recentHeal: number | null;
}

/**
 * @deprecated Use createGridCombatant() instead for grid-based combat.
 * Create a combatant from NPC data (slot-based system).
 */
export function createCombatant(
  id: string,
  name: string,
  level: number,
  imagePath: string | null,
  isPlayerControlled: boolean,
  isPlayer: boolean,
  slotPosition: number
): Combatant {
  const stats = deriveCombatStats(level);

  return {
    id,
    name,
    level,
    imagePath,
    isPlayerControlled,
    isPlayer,
    currentHp: stats.maxHp,
    maxHp: stats.maxHp,
    damage: stats.damage,
    defense: stats.defense,
    speed: stats.speed,
    armor: stats.armor,
    weaponType: stats.weaponType,
    slotPosition,
    apRemaining: 2,
    isDefending: false,
    isOverwatching: false,
    hasAimedShot: false,
    isKnockedOut: false,
    isIncapacitated: false,
    isDead: false,
    recentDamage: null,
    recentHeal: null,
  };
}

// =============================================================================
// Battlefield Types (DEPRECATED - use GridCombatState for grid-based combat)
// =============================================================================

/**
 * @deprecated The slot-based battlefield has been replaced by grid-based combat.
 * Use GridCombatState and GridCombatant (with TilePosition) instead.
 * Kept for backward compatibility with combatResultContext.ts.
 */
export interface Battlefield {
  enemySlots: (string | null)[]; // Combatant IDs, top row
  allySlots: (string | null)[];  // Combatant IDs, bottom row
}

// =============================================================================
// Action Types
// =============================================================================

export type ActionType =
  | 'attack'
  | 'defend'
  | 'overwatch'
  | 'aimed_shot'
  | 'mark_target'
  | 'move'
  | 'swap'
  | 'item'
  | 'flee';

export interface CombatAction {
  type: ActionType;
  actorId: string;
  targetId?: string;      // For attack, swap
  targetSlot?: number;    // For move
  itemId?: string;        // For item use
}

// =============================================================================
// Hit Quality System
// =============================================================================

export type HitQuality =
  | 'miss'
  | 'marginal'    // margin 0-2
  | 'solid'       // margin 3-7
  | 'crushing'    // margin >= 8
  | 'armor_soak'; // hit but armor absorbed most damage

export function calculateHitQuality(
  attackRoll: number,
  targetDefense: number,
  rawDamage: number,
  finalDamage: number
): HitQuality {
  const margin = attackRoll - targetDefense;

  if (margin < 0) return 'miss';
  if (rawDamage > 2 && finalDamage <= 1) return 'armor_soak';
  if (margin >= 8) return 'crushing';
  if (margin >= 3) return 'solid';
  return 'marginal';
}

// =============================================================================
// Combat Events (for narrator/UI)
// =============================================================================

export type CombatEventType =
  | 'combat_start'
  | 'turn_start'
  | 'attack_resolved'
  | 'defend_activated'
  | 'damage_intercepted'
  | 'overwatch_activated'
  | 'overwatch_triggered'
  | 'aimed_shot_activated'
  | 'mark_target_placed'
  | 'mark_expired'
  | 'move_completed'
  | 'swap_completed'
  | 'flee_attempted'
  | 'character_defeated'
  | 'ally_revived'     // Incapacitated ally revived after victory
  | 'player_revived'   // Player revived by ally after they carried the fight
  | 'combat_victory'
  | 'combat_defeat'
  | 'item_used'        // Consumable item used (heal/buff)
  | 'aoe_resolved'     // AoE attack resolved (bomb/magic)
  | 'buff_applied'     // Buff applied to combatant
  | 'buff_expired'     // Buff expired at start of turn
  | 'cleave_triggered' // Cleave triggered on kill (heavy melee)
  | 'loot_dropped';    // Item dropped from defeated enemy

export interface CombatEvent {
  type: CombatEventType;
  turn: number;
  actorId?: string;
  targetId?: string;
  data: Record<string, any>;
}

export interface AttackResolvedData {
  attackRoll: number;
  targetDefense: number;
  rawDamage: number;
  finalDamage: number;
  hitQuality: HitQuality;
  isKillingBlow: boolean;
  overkillAmount: number;
}

// =============================================================================
// Combat Log Entry
// =============================================================================

export interface CombatLogEntry {
  id: string;
  turn: number;
  actorId: string;
  actorName: string;
  actionType: ActionType;
  targetId?: string;
  targetName?: string;
  result: {
    hit?: boolean;
    damage?: number;
    hitQuality?: HitQuality;
    special?: 'killing_blow' | 'fled' | 'fled_failed';
    interceptedDamage?: number;
    interceptedByDefender?: string;
  };
  mechanicalText: string;  // "Aria strikes Goblin for 14 damage!"
  narratorText?: string;   // AI-generated flavor (added async)
}

// =============================================================================
// Combat Phase
// =============================================================================

export type CombatPhase =
  | 'pre_battle'      // Arranging party (player-initiated)
  | 'initiative'      // Rolling initiative
  | 'turn_start'      // Beginning of a turn
  | 'awaiting_input'  // Waiting for player action
  | 'resolving'       // Executing action
  | 'turn_end'        // End of turn, check for victory/defeat
  | 'victory'         // Combat won
  | 'defeat';         // Combat lost (TPK)

// =============================================================================
// Combat State (DEPRECATED - use GridCombatState for grid-based combat)
// =============================================================================

/**
 * @deprecated Use GridCombatState instead. This was the slot-based combat state.
 * The grid combat system uses GridCombatState with tile-based positioning.
 */
export interface CombatState {
  phase: CombatPhase;
  turn: number;

  // All combatants by ID
  combatants: Record<string, Combatant>;

  // Battlefield positions
  battlefield: Battlefield;

  // Turn order
  initiativeOrder: string[]; // Combatant IDs sorted by initiative
  currentTurnIndex: number;

  // Active marks (ranged action)
  markedTargets: Array<{
    targetId: string;
    markerId: string;
    expiresOnTurn: number;
  }>;

  // Combat log
  log: CombatLogEntry[];

  // Pending events for narrator
  pendingEvents: CombatEvent[];

  // Room context for backdrop
  roomImagePath: string | null;
  roomName: string;

  // Result (set when combat ends)
  result?: {
    outcome: 'victory' | 'defeat' | 'fled';
    rewards?: {
      xp: number;
      gold: number;
      items: InventoryItem[];
    };
    survivingAllies: string[];
    defeatedEnemies: string[];
    revivedAllies?: string[];  // Allies that were incapacitated and auto-revived on victory
    revivedPlayer?: boolean;   // True if THE player was incapacitated but ally carried the fight
    revivedByAllyId?: string;  // ID of the ally who "revived" the player (last ally standing)
  };
}

// =============================================================================
// Combat Initialization
// =============================================================================

export interface CombatInitData {
  playerData: {
    id: string;
    name: string;
    level: number;
    imagePath: string | null;
  };
  enemies: Array<{
    id: string;
    name: string;
    level: number;
    imagePath: string | null;
  }>;
  allies?: Array<{
    id: string;
    name: string;
    level: number;
    imagePath: string | null;
  }>;
  roomImagePath: string | null;
  roomName: string;
  playerAdvantage: boolean; // true = player initiated, false = ambush
}

// =============================================================================
// Grid Combat Extensions (for unified local map combat)
// =============================================================================

import { TilePosition } from './localMap';
import type { ActiveBuffs, InventoryItem, WeaponSubtype } from './inventory';
import { createEmptyBuffs } from './inventory';

/**
 * Extended combatant with grid position for local map combat.
 * Position is optional for backward compatibility with slot-based combat.
 */
export interface GridCombatant extends Combatant {
  /** Grid position (x, y) on the local map */
  position: TilePosition;
  /** Movement range in tiles per turn */
  movementRange: number;
  /** Attack range in tiles (1 = melee, >1 = ranged) */
  attackRange: number;
  /** Threat range in tiles for engagement (default 1, higher for elite enemies) */
  threatRange: number;
  /** Facing direction for backstab/flanking visuals */
  facing?: 'north' | 'south' | 'east' | 'west';

  // --- V2 Extended Fields ---
  /** Active temporary buffs (attack/damage/defense bonuses with turn counters) */
  activeBuffs: ActiveBuffs;
  /** Equipped weapon reference (determines AP cost, endsTurn, special behavior) */
  equippedWeapon: InventoryItem | null;
  /** Weapon subtype for quick access (derived from equippedWeapon) */
  weaponSubtype: WeaponSubtype | undefined;
  /** Number of light attacks performed this turn (cap: MAX_LIGHT_ATTACKS_PER_TURN) */
  lightAttacksThisTurn: number;
  /** Crossbow reload state: true = next shot is a reload shot (costs 2 AP) */
  needsReload: boolean;
  /** Inventory items available in combat (consumables only) */
  combatItems: InventoryItem[];
}

/**
 * Grid-based combat actions
 */
export type GridActionType =
  | 'grid_move'        // Move along a path
  | 'grid_attack'      // Attack a target at range
  | 'grid_defend'      // Defend (reduces incoming damage)
  | 'grid_overwatch'   // Watch an area, attack enemies entering
  | 'grid_flee'        // Attempt to flee combat
  | 'grid_end_turn'    // End turn early
  | 'grid_use_item'    // Use a consumable item (2 AP, does NOT end turn)
  | 'grid_aoe_attack'; // AoE attack on a tile (3 AP, ends turn)

export interface GridMoveAction {
  type: 'grid_move';
  actorId: string;
  path: TilePosition[];  // Full path from current to destination
}

export interface GridAttackAction {
  type: 'grid_attack';
  actorId: string;
  targetId: string;
  targetPosition: TilePosition;
}

export interface GridDefendAction {
  type: 'grid_defend';
  actorId: string;
}

export interface GridOverwatchAction {
  type: 'grid_overwatch';
  actorId: string;
  watchArea: TilePosition[];  // Tiles being watched
}

export interface GridEndTurnAction {
  type: 'grid_end_turn';
  actorId: string;
}

export interface GridFleeAction {
  type: 'grid_flee';
  actorId: string;
}

/** Use a consumable item (med/buff) on self or adjacent ally */
export interface GridUseItemAction {
  type: 'grid_use_item';
  actorId: string;
  itemId: string;
  targetId?: string;  // Self or adjacent ally (defaults to self in engine)
}

/** AoE attack targeting a tile (bomb or magic AoE weapon) */
export interface GridAoEAttackAction {
  type: 'grid_aoe_attack';
  actorId: string;
  targetPosition: TilePosition;
  itemId?: string;  // Bomb item ID (for consumable bombs)
}

export type GridCombatAction =
  | GridMoveAction
  | GridAttackAction
  | GridDefendAction
  | GridOverwatchAction
  | GridFleeAction
  | GridEndTurnAction
  | GridUseItemAction
  | GridAoEAttackAction;

/**
 * Grid combat state extends base combat state with map integration
 */
export interface GridCombatState {
  phase: CombatPhase;
  turn: number;

  /** All combatants by ID (with grid positions) */
  combatants: Record<string, GridCombatant>;

  /** Turn order */
  initiativeOrder: string[];
  currentTurnIndex: number;

  /** Active marks (ranged action) */
  markedTargets: Array<{
    targetId: string;
    markerId: string;
    expiresOnTurn: number;
  }>;

  /** Combat log */
  log: CombatLogEntry[];

  /** Pending events for narrator */
  pendingEvents: CombatEvent[];

  /** Reference to the local map state (source of truth for terrain) */
  mapRoomId: string;

  /** Computed overlays for UI */
  validMoveTargets: TilePosition[];
  validAttackTargets: TilePosition[];
  activeOverwatchZones: Array<{
    combatantId: string;
    tiles: TilePosition[];
  }>;

  /** Result (set when combat ends) */
  result?: {
    outcome: 'victory' | 'defeat' | 'fled';
    rewards?: {
      xp: number;
      gold: number;
      items: InventoryItem[];
    };
    survivingAllies: string[];
    defeatedEnemies: string[];
    revivedAllies?: string[];  // Allies that were incapacitated and auto-revived on victory
    revivedPlayer?: boolean;   // True if THE player was incapacitated but ally carried the fight
    revivedByAllyId?: string;  // ID of the ally who "revived" the player (last ally standing)
  };
}

/**
 * Derive grid combat stats from level.
 * Extends base deriveCombatStats with movement and attack range.
 *
 * @param level - Combatant level (1-60)
 * @param weaponType - Melee or ranged weapon
 * @returns Stats including movement and attack range
 */
export function deriveGridCombatStats(
  level: number,
  weaponType: 'melee' | 'ranged' = 'melee'
): CombatStats & { movementRange: number; attackRange: number; threatRange: number } {
  const baseStats = deriveCombatStats(level);

  // Movement range: 3 base + speed bonus
  // Speed ranges from 3-9, so movement is 3-4 tiles
  const movementRange = 3 + Math.floor((baseStats.speed - 3) / 3);

  // Attack range: 1 for melee, 3-5 for ranged based on level
  const attackRange = weaponType === 'melee'
    ? 1
    : 3 + Math.floor(level / 20); // 3-5 tiles

  // Threat range: engagement distance for combat initiation
  // Level 1-19: 1 tile (standard)
  // Level 20-39: 2 tiles (elite)
  // Level 40+: 3 tiles (boss-tier)
  const threatRange = level >= 40 ? 3 : level >= 20 ? 2 : 1;

  return {
    ...baseStats,
    movementRange,
    attackRange,
    threatRange,
  };
}

/**
 * Create a grid combatant from NPC/player data.
 *
 * @param equippedWeapon - Weapon item (determines subtype, AP cost, special behavior).
 *   Pass null for unarmed / enemies using stat-derived weapon type.
 * @param combatItems - Consumable items available in combat (meds, buffs).
 */
export function createGridCombatant(
  id: string,
  name: string,
  level: number,
  imagePath: string | null,
  isPlayerControlled: boolean,
  isPlayer: boolean,
  position: TilePosition,
  weaponType: 'melee' | 'ranged' = 'melee',
  equippedWeapon: InventoryItem | null = null,
  combatItems: InventoryItem[] = []
): GridCombatant {
  const stats = deriveGridCombatStats(level, weaponType);

  return {
    id,
    name,
    level,
    imagePath,
    isPlayerControlled,
    isPlayer,
    currentHp: stats.maxHp,
    maxHp: stats.maxHp,
    damage: stats.damage,
    defense: stats.defense,
    speed: stats.speed,
    armor: stats.armor,
    weaponType: stats.weaponType,
    slotPosition: 0, // Legacy field, not used in grid combat
    apRemaining: getAPForLevel(level),
    isDefending: false,
    isOverwatching: false,
    hasAimedShot: false,
    isKnockedOut: false,
    isIncapacitated: false,
    isDead: false,
    recentDamage: null,
    recentHeal: null,
    // Grid-specific
    position,
    movementRange: stats.movementRange,
    attackRange: equippedWeapon?.attackRange ?? stats.attackRange,
    threatRange: stats.threatRange,
    facing: 'south',
    // V2 Extended Fields
    activeBuffs: createEmptyBuffs(),
    equippedWeapon,
    weaponSubtype: equippedWeapon?.subtype,
    lightAttacksThisTurn: 0,
    needsReload: false,
    combatItems,
  };
}

/**
 * Calculate AP for a given level.
 * Base AP: 2, scaling: +1 per 10 levels.
 *
 * | Level | AP |
 * |-------|----|
 * | 1-9   | 2  |
 * | 10-19 | 3  |
 * | 20-29 | 4  |
 * | 30-39 | 5  |
 * | 40-49 | 6  |
 * | 50-59 | 7  |
 * | 60    | 8  |
 */
export function getAPForLevel(level: number): number {
  const clamped = Math.max(1, Math.min(60, level));
  return 2 + Math.floor(clamped / 10);
}

/**
 * AP costs for grid combat actions
 */
export const GRID_AP_COSTS = {
  move: 1,           // Per tile moved
  attack: 2,         // Basic attack (heavy/gun/magic direct)
  lightAttack: 1,    // Light weapon attack (melee/ranged)
  defend: 1,         // Enter defend stance
  overwatch: 2,      // Set up overwatch
  aimedShot: 3,      // Careful aimed shot (ranged heavy only)
  aoeAttack: 3,      // AoE attack (bomb/magic AoE)
  useItem: 2,        // Use consumable item
} as const;

/** Maximum light attacks per turn (regardless of available AP) */
export const MAX_LIGHT_ATTACKS_PER_TURN = 2;
