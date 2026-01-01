// frontend/src/types/combat.ts
// Combat system types - fully independent of World/Room implementation

// =============================================================================
// Combat Stats
// =============================================================================

/**
 * Derived combat stats for any combatant.
 * All stats are derived from monster_level using formulas.
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
 * Derive combat stats from monster level (1-60).
 * Single source of truth for all stat calculations.
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
  isKnockedOut: boolean;

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
  | 'overwatch_activated'
  | 'overwatch_triggered'
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
