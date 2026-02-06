/**
 * @file lootGenerator.ts
 * @description Loot generation system for grid combat rewards.
 *
 * Features:
 * - Level-tiered loot tables (1-10, 11-20, 21-40, 40+)
 * - Weighted random drops (healing, buffs, weapons, vendor trash)
 * - Stacking logic for consumables and loot items
 * - Dead vs incapacitated enemy drop rates
 */

import type { InventoryItem } from '../../types/inventory';
import {
  MINOR_HEALING_POTION,
  MAJOR_HEALING_POTION,
  FULL_RESTORE_ELIXIR,
  SHARPENING_STONE,
  BERSERKER_BREW,
  IRONBARK_POTION,
  FIREBOMB,
  RUSTY_TRINKET,
  TORN_BANNER,
  GEMSTONE_SHARD,
  ANCIENT_COIN,
} from '../../data/items';
import {
  IRON_DAGGER,
  CROSSBOW,
  OAK_WAND,
  PISTOL,
  IRON_STAFF,
  LONGBOW,
  STEEL_GREATSWORD,
} from '../../data/weapons';

// =============================================================================
// Loot Table Types
// =============================================================================

interface LootTableEntry {
  /** Item to drop */
  item: InventoryItem | null; // null = nothing
  /** Drop weight (higher = more likely) */
  weight: number;
}

type LootTable = LootTableEntry[];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Pick a random weapon from a list.
 * Returns a deep copy so the original isn't mutated.
 */
function pickRandomWeapon(weapons: InventoryItem[]): InventoryItem {
  const idx = Math.floor(Math.random() * weapons.length);
  return { ...weapons[idx] };
}

/**
 * Pick one entry from a loot table based on weights.
 * Returns null if "nothing" is selected.
 */
function rollLootTable(table: LootTable): InventoryItem | null {
  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.item ? { ...entry.item } : null;
    }
  }

  return null; // Fallback (shouldn't reach here)
}

// =============================================================================
// Loot Tables by Level Tier
// =============================================================================

/**
 * Level 1-10 drops:
 * - 30% Minor Healing Potion
 * - 50% vendor trash (Rusty Trinket)
 * - 10% weapon (Iron Dagger or Crossbow)
 * - 10% nothing
 */
function getLootTableTier1(): LootTable {
  return [
    { item: MINOR_HEALING_POTION, weight: 30 },
    { item: RUSTY_TRINKET, weight: 50 },
    { item: pickRandomWeapon([IRON_DAGGER, CROSSBOW]), weight: 10 },
    { item: null, weight: 10 },
  ];
}

/**
 * Level 11-20 drops:
 * - 15% Major Healing Potion
 * - 20% Sharpening Stone or Berserker Brew
 * - 25% vendor trash (Torn Banner)
 * - 15% Minor Healing Potion
 * - 15% weapon (Iron Dagger, Crossbow, Oak Wand, or Pistol)
 * - 10% nothing
 */
function getLootTableTier2(): LootTable {
  const buffChoice = Math.random() < 0.5 ? SHARPENING_STONE : BERSERKER_BREW;
  const weaponChoice = pickRandomWeapon([IRON_DAGGER, CROSSBOW, OAK_WAND, PISTOL]);

  return [
    { item: MAJOR_HEALING_POTION, weight: 15 },
    { item: buffChoice, weight: 20 },
    { item: TORN_BANNER, weight: 25 },
    { item: MINOR_HEALING_POTION, weight: 15 },
    { item: weaponChoice, weight: 15 },
    { item: null, weight: 10 },
  ];
}

/**
 * Level 21-40 drops:
 * - 20% Ironbark Potion or Berserker Brew
 * - 15% Major Healing Potion
 * - 10% Firebomb
 * - 25% vendor trash (Gemstone Shard)
 * - 15% weapon (Longbow, Pistol, Oak Wand, Iron Staff)
 * - 15% Sharpening Stone
 */
function getLootTableTier3(): LootTable {
  const buffChoice = Math.random() < 0.5 ? IRONBARK_POTION : BERSERKER_BREW;
  const weaponChoice = pickRandomWeapon([LONGBOW, PISTOL, OAK_WAND, IRON_STAFF]);

  return [
    { item: buffChoice, weight: 20 },
    { item: MAJOR_HEALING_POTION, weight: 15 },
    { item: FIREBOMB, weight: 10 },
    { item: GEMSTONE_SHARD, weight: 25 },
    { item: weaponChoice, weight: 15 },
    { item: SHARPENING_STONE, weight: 15 },
  ];
}

/**
 * Level 40+ drops:
 * - 100% guaranteed rare drop: Full Restore Elixir, Steel Greatsword, Iron Staff, or Longbow
 * - PLUS 50% chance of Gemstone Shard or Ancient Coin
 */
function getLootTableTier4(): InventoryItem[] {
  const rareDrops = [FULL_RESTORE_ELIXIR, STEEL_GREATSWORD, IRON_STAFF, LONGBOW];
  const guaranteedDrop = pickRandomWeapon(rareDrops);
  const drops = [guaranteedDrop];

  // 50% chance for bonus loot
  if (Math.random() < 0.5) {
    const bonusLoot = Math.random() < 0.5 ? GEMSTONE_SHARD : ANCIENT_COIN;
    drops.push({ ...bonusLoot });
  }

  return drops;
}

// =============================================================================
// Loot Generation Functions
// =============================================================================

/**
 * Generate loot for a single defeated enemy based on level.
 * Returns an array of InventoryItems (each with stackCount: 1).
 */
export function generateLootForEnemy(enemyLevel: number): InventoryItem[] {
  // Tier 4: Level 40+
  if (enemyLevel >= 40) {
    return getLootTableTier4();
  }

  // Tier 3: Level 21-40
  if (enemyLevel >= 21) {
    const loot = rollLootTable(getLootTableTier3());
    return loot ? [loot] : [];
  }

  // Tier 2: Level 11-20
  if (enemyLevel >= 11) {
    const loot = rollLootTable(getLootTableTier2());
    return loot ? [loot] : [];
  }

  // Tier 1: Level 1-10
  const loot = rollLootTable(getLootTableTier1());
  return loot ? [loot] : [];
}

/**
 * Generate loot for all defeated enemies in a combat encounter.
 * - Dead enemies: 100% drop chance
 * - Incapacitated enemies: 50% drop chance
 * - Merges/stacks identical items by ID
 */
export function generateCombatLoot(
  defeatedEnemies: Array<{ level: number; isDead: boolean }>
): InventoryItem[] {
  const allDrops: InventoryItem[] = [];

  for (const enemy of defeatedEnemies) {
    let shouldRoll = enemy.isDead;
    if (!shouldRoll && Math.random() < 0.5) {
      shouldRoll = true; // 50% chance for incapacitated
    }

    if (shouldRoll) {
      const drops = generateLootForEnemy(enemy.level);
      allDrops.push(...drops);
    }
  }

  // Merge stacks of identical items
  const mergedLoot: Map<string, InventoryItem> = new Map();

  for (const drop of allDrops) {
    const existing = mergedLoot.get(drop.id);
    if (existing && existing.maxStack && drop.stackCount) {
      // Stack items
      const newStackCount = Math.min(
        (existing.stackCount ?? 1) + (drop.stackCount ?? 1),
        existing.maxStack
      );
      mergedLoot.set(drop.id, { ...existing, stackCount: newStackCount });
    } else {
      // First occurrence or non-stackable
      mergedLoot.set(drop.id, drop);
    }
  }

  return Array.from(mergedLoot.values());
}
