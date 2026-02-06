/**
 * @file weapons.ts
 * @description All weapon definitions with stats, AP costs, and special properties.
 *
 * 8 weapon subtypes across melee, ranged, and AoE categories.
 * Each weapon is an InventoryItem with full combat metadata.
 */

import type { InventoryItem } from '../types/inventory';
import {
  WEAPON_IRON_SWORD,
  WEAPON_STEEL_GREATSWORD,
  WEAPON_IRON_DAGGER,
  WEAPON_SHORT_BOW,
  WEAPON_LONGBOW,
  WEAPON_CROSSBOW,
  WEAPON_PISTOL,
  WEAPON_OAK_WAND,
  WEAPON_IRON_STAFF,
} from '../constants/itemIds';

// =============================================================================
// Heavy Melee: 2 AP, ends turn, cleave on kill
// =============================================================================

export const IRON_SWORD: InventoryItem = {
  id: WEAPON_IRON_SWORD,
  name: 'Iron Sword',
  type: 'weapon',
  subtype: 'heavy_melee',
  weaponCategory: 'melee',
  stats: { damage: 4 },
  apCost: 2,
  endsTurn: true,
  attackRange: 1,
  weaponProperties: { cleave: true },
  description: 'A sturdy blade. Cleaves into adjacent enemies on a killing blow.',
};

export const STEEL_GREATSWORD: InventoryItem = {
  id: WEAPON_STEEL_GREATSWORD,
  name: 'Steel Greatsword',
  type: 'weapon',
  subtype: 'heavy_melee',
  weaponCategory: 'melee',
  stats: { damage: 6 },
  apCost: 2,
  endsTurn: true,
  attackRange: 1,
  weaponProperties: { cleave: true },
  description: 'A massive two-handed blade. Devastating cleave attacks.',
};

// =============================================================================
// Light Melee: 1 AP, does NOT end turn, max 2 attacks/turn
// =============================================================================

export const IRON_DAGGER: InventoryItem = {
  id: WEAPON_IRON_DAGGER,
  name: 'Iron Dagger',
  type: 'weapon',
  subtype: 'light_melee',
  weaponCategory: 'melee',
  stats: { damage: 1 },
  apCost: 1,
  endsTurn: false,
  attackRange: 1,
  description: 'A quick blade. Can attack twice per turn or combo with movement.',
};

// =============================================================================
// Heavy Ranged: 2 AP, ends turn, aimed shot available (3 AP)
// =============================================================================

export const SHORT_BOW: InventoryItem = {
  id: WEAPON_SHORT_BOW,
  name: 'Short Bow',
  type: 'weapon',
  subtype: 'heavy_ranged',
  weaponCategory: 'ranged',
  stats: { damage: 2 },
  apCost: 2,
  endsTurn: true,
  attackRange: 4,
  minRange: 0,
  weaponProperties: { aimedShot: true },
  description: 'A lightweight bow. Can use aimed shots for +3 hit, +2 damage (3 AP).',
};

export const LONGBOW: InventoryItem = {
  id: WEAPON_LONGBOW,
  name: 'Longbow',
  type: 'weapon',
  subtype: 'heavy_ranged',
  weaponCategory: 'ranged',
  stats: { damage: 3 },
  apCost: 2,
  endsTurn: true,
  attackRange: 5,
  minRange: 0,
  weaponProperties: { aimedShot: true },
  description: 'A powerful longbow with extended range. Aimed shots deal devastating damage.',
};

// =============================================================================
// Light Ranged: 1 AP, does NOT end turn, max 2/turn, reload mechanic
// =============================================================================

export const CROSSBOW: InventoryItem = {
  id: WEAPON_CROSSBOW,
  name: 'Crossbow',
  type: 'weapon',
  subtype: 'light_ranged',
  weaponCategory: 'ranged',
  stats: { damage: 1 },
  apCost: 1,
  endsTurn: false,
  attackRange: 4,
  minRange: 0,
  weaponProperties: { reload: true },
  description: 'A mechanical crossbow. Quick shots, but every other shot requires reload (2 AP).',
};

// =============================================================================
// Gun: 2 AP, ends turn, 50% armor penetration
// =============================================================================

export const PISTOL: InventoryItem = {
  id: WEAPON_PISTOL,
  name: 'Pistol',
  type: 'weapon',
  subtype: 'gun',
  weaponCategory: 'ranged',
  stats: { damage: 3 },
  apCost: 2,
  endsTurn: true,
  attackRange: 5,
  minRange: 0,
  weaponProperties: { armorPenPercent: 0.5 },
  description: 'A reliable firearm. Ignores 50% of target armor.',
};

// =============================================================================
// Magic Direct: 2 AP, ends turn, no LOS required
// =============================================================================

export const OAK_WAND: InventoryItem = {
  id: WEAPON_OAK_WAND,
  name: 'Oak Wand',
  type: 'weapon',
  subtype: 'magic_direct',
  weaponCategory: 'ranged',
  stats: { damage: 2 },
  apCost: 2,
  endsTurn: true,
  attackRange: 5,
  minRange: 0,
  weaponProperties: { noLOSRequired: true },
  description: 'An arcane focus. Attacks bypass line of sight barriers.',
};

// =============================================================================
// Magic AoE: 3 AP, ends turn, cross pattern, no friendly fire
// =============================================================================

export const IRON_STAFF: InventoryItem = {
  id: WEAPON_IRON_STAFF,
  name: 'Iron Staff',
  type: 'weapon',
  subtype: 'magic_aoe',
  weaponCategory: 'ranged',
  stats: { damage: 3 },
  apCost: 3,
  endsTurn: true,
  attackRange: 5,
  minRange: 0,
  weaponProperties: {
    blastPattern: 'cross',
    friendlyFire: false,
  },
  description: 'An enchanted staff. Unleashes cross-pattern AoE magic (no friendly fire).',
};

// =============================================================================
// All Weapons Registry (for loot tables, shops, etc.)
// =============================================================================

export const ALL_WEAPONS: InventoryItem[] = [
  IRON_SWORD,
  STEEL_GREATSWORD,
  IRON_DAGGER,
  SHORT_BOW,
  LONGBOW,
  CROSSBOW,
  PISTOL,
  OAK_WAND,
  IRON_STAFF,
];

/**
 * Get a weapon definition by ID.
 */
export function getWeaponById(id: string): InventoryItem | undefined {
  return ALL_WEAPONS.find(w => w.id === id);
}
