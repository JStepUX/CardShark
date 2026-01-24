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

  // Position on battlefield (0-4)
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

  // UI state (clears after render)
  recentDamage: number | null;
  recentHeal: number | null;
}

/**
 * Create a combatant from NPC data.
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
    recentDamage: null,
    recentHeal: null,
  };
}

// =============================================================================
// Battlefield Types
// =============================================================================

/**
 * The battlefield: 2 rows × 5 slots.
 * Index 0-4 for each row, null means empty slot.
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
  | 'combat_victory'
  | 'combat_defeat';

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
// Combat State (Main State Object)
// =============================================================================

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
      items: string[];
    };
    survivingAllies: string[];
    defeatedEnemies: string[];
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
