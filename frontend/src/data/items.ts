/**
 * @file items.ts
 * @description All consumable and loot item definitions.
 *
 * Item categories:
 * - Meds: Healing potions (combat + exploration)
 * - Buffs: Temporary stat boosts (3 turn duration, combat only)
 * - Bombs: AoE consumable weapons (3x3 blast, friendly fire)
 * - Loot: Vendor trash, quest items, crafting materials
 */

import type { InventoryItem } from '../types/inventory';
import {
  ITEM_MINOR_HEALING_POTION,
  ITEM_MAJOR_HEALING_POTION,
  ITEM_FULL_RESTORE_ELIXIR,
  ITEM_SHARPENING_STONE,
  ITEM_BERSERKER_BREW,
  ITEM_IRONBARK_POTION,
  ITEM_FIREBOMB,
  LOOT_RUSTY_TRINKET,
  LOOT_TORN_BANNER,
  LOOT_GEMSTONE_SHARD,
  LOOT_ANCIENT_COIN,
} from '../constants/itemIds';

// =============================================================================
// Meds (Healing)
// =============================================================================

export const MINOR_HEALING_POTION: InventoryItem = {
  id: ITEM_MINOR_HEALING_POTION,
  name: 'Minor Healing Potion',
  type: 'consumable',
  consumableSubtype: 'med',
  stats: { healPercent: 0.25, healMin: 15 },
  apCost: 2,
  endsTurn: false,
  stackCount: 1,
  maxStack: 10,
  canSell: true,
  canDrop: true,
  description: 'Restores 25% max HP (minimum 15). Usable in combat or exploration.',
};

export const MAJOR_HEALING_POTION: InventoryItem = {
  id: ITEM_MAJOR_HEALING_POTION,
  name: 'Major Healing Potion',
  type: 'consumable',
  consumableSubtype: 'med',
  stats: { healPercent: 0.50, healMin: 40 },
  apCost: 2,
  endsTurn: false,
  stackCount: 1,
  maxStack: 10,
  canSell: true,
  canDrop: true,
  description: 'Restores 50% max HP (minimum 40). Usable in combat or exploration.',
};

export const FULL_RESTORE_ELIXIR: InventoryItem = {
  id: ITEM_FULL_RESTORE_ELIXIR,
  name: 'Full Restore Elixir',
  type: 'consumable',
  consumableSubtype: 'med',
  stats: { healPercent: 1.0, healMin: 0 },
  apCost: 2,
  endsTurn: false,
  stackCount: 1,
  maxStack: 5,
  canSell: true,
  canDrop: true,
  description: 'Fully restores HP. Rare and precious.',
};

// =============================================================================
// Buffs (Temporary Stat Boosts - 3 turn duration)
// =============================================================================

export const SHARPENING_STONE: InventoryItem = {
  id: ITEM_SHARPENING_STONE,
  name: 'Sharpening Stone',
  type: 'consumable',
  consumableSubtype: 'buff',
  stats: { attackBonus: 3, buffDuration: 3 },
  apCost: 2,
  endsTurn: false,
  stackCount: 1,
  maxStack: 5,
  canSell: true,
  canDrop: true,
  description: '+3 to attack rolls for 3 turns. Same-type buffs refresh duration.',
};

export const BERSERKER_BREW: InventoryItem = {
  id: ITEM_BERSERKER_BREW,
  name: 'Berserker Brew',
  type: 'consumable',
  consumableSubtype: 'buff',
  stats: { damageBonus: 5, buffDuration: 3 },
  apCost: 2,
  endsTurn: false,
  stackCount: 1,
  maxStack: 5,
  canSell: true,
  canDrop: true,
  description: '+5 to damage for 3 turns. Same-type buffs refresh duration.',
};

export const IRONBARK_POTION: InventoryItem = {
  id: ITEM_IRONBARK_POTION,
  name: 'Ironbark Potion',
  type: 'consumable',
  consumableSubtype: 'buff',
  stats: { defenseBonus: 5, buffDuration: 3 },
  apCost: 2,
  endsTurn: false,
  stackCount: 1,
  maxStack: 5,
  canSell: true,
  canDrop: true,
  description: '+5 to defense for 3 turns. Same-type buffs refresh duration.',
};

// =============================================================================
// Bombs (AoE Consumables)
// =============================================================================

export const FIREBOMB: InventoryItem = {
  id: ITEM_FIREBOMB,
  name: 'Firebomb',
  type: 'consumable',
  consumableSubtype: 'bomb',
  stats: { aoeDamage: 8 },
  apCost: 3,
  endsTurn: true,
  attackRange: 4,
  stackCount: 1,
  maxStack: 5,
  canSell: true,
  canDrop: true,
  weaponProperties: {
    blastPattern: 'radius_3x3',
    friendlyFire: true,
    friendlyFireMultiplier: 0.5,
  },
  description: '3x3 blast dealing 8 damage. WARNING: Allies in blast take 50% damage.',
};

// =============================================================================
// Loot (Vendor Trash)
// =============================================================================

export const RUSTY_TRINKET: InventoryItem = {
  id: LOOT_RUSTY_TRINKET,
  name: 'Rusty Trinket',
  type: 'loot',
  lootSubtype: 'vendor_trash',
  stats: { sellValue: 5 },
  stackCount: 1,
  maxStack: 99,
  canSell: true,
  canDrop: true,
  description: 'A tarnished bit of metal. Worth a few coins to the right buyer.',
};

export const TORN_BANNER: InventoryItem = {
  id: LOOT_TORN_BANNER,
  name: 'Torn Banner',
  type: 'loot',
  lootSubtype: 'vendor_trash',
  stats: { sellValue: 10 },
  stackCount: 1,
  maxStack: 99,
  canSell: true,
  canDrop: true,
  description: 'A fragment of a defeated foe\'s standard. Modest value.',
};

export const GEMSTONE_SHARD: InventoryItem = {
  id: LOOT_GEMSTONE_SHARD,
  name: 'Gemstone Shard',
  type: 'loot',
  lootSubtype: 'vendor_trash',
  stats: { sellValue: 25 },
  stackCount: 1,
  maxStack: 99,
  canSell: true,
  canDrop: true,
  description: 'A glittering fragment. Worth a decent sum.',
};

export const ANCIENT_COIN: InventoryItem = {
  id: LOOT_ANCIENT_COIN,
  name: 'Ancient Coin',
  type: 'loot',
  lootSubtype: 'vendor_trash',
  stats: { sellValue: 50 },
  stackCount: 1,
  maxStack: 99,
  canSell: true,
  canDrop: true,
  description: 'A coin from a forgotten age. Highly valued by collectors.',
};

// =============================================================================
// Registries
// =============================================================================

export const ALL_CONSUMABLES: InventoryItem[] = [
  MINOR_HEALING_POTION,
  MAJOR_HEALING_POTION,
  FULL_RESTORE_ELIXIR,
  SHARPENING_STONE,
  BERSERKER_BREW,
  IRONBARK_POTION,
  FIREBOMB,
];

export const ALL_LOOT: InventoryItem[] = [
  RUSTY_TRINKET,
  TORN_BANNER,
  GEMSTONE_SHARD,
  ANCIENT_COIN,
];

/**
 * Get a consumable definition by ID.
 */
export function getConsumableById(id: string): InventoryItem | undefined {
  return ALL_CONSUMABLES.find(c => c.id === id);
}

/**
 * Get a loot definition by ID.
 */
export function getLootById(id: string): InventoryItem | undefined {
  return ALL_LOOT.find(l => l.id === id);
}
