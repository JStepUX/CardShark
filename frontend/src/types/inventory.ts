/**
 * @file inventory.ts
 * @description Inventory system types for the tactical RPG.
 *
 * This file defines:
 * - Item types and interfaces (weapons, consumables, loot)
 * - Weapon categories and subtypes (8 weapon subtypes)
 * - Consumable subtypes (meds, buffs, bombs)
 * - Character inventory structure with stacking
 * - Default starter weapons
 * - Helper functions for inventory management
 * - Active buff tracking for combatants
 */

// =============================================================================
// Item Types
// =============================================================================

/**
 * Base item type categories
 */
export type ItemType = 'weapon' | 'armor' | 'consumable' | 'loot';

/**
 * Weapon category: melee or ranged (top-level grouping)
 */
export type WeaponCategory = 'melee' | 'ranged';

/**
 * Weapon subtypes - each has unique AP cost, range, and special behavior.
 *
 * Melee:
 * - heavy_melee: Greatsword, axe. 2 AP, ends turn. Cleave on kill.
 * - light_melee: Dagger, shortsword. 1 AP, does NOT end turn. Max 2/turn.
 *
 * Ranged:
 * - heavy_ranged: Bow, longbow. 2 AP, ends turn. Aimed shot (3 AP).
 * - light_ranged: Crossbow. 1 AP, does NOT end turn. Max 2/turn. Reload mechanic.
 * - gun: Pistol, rifle. 2 AP, ends turn. 50% armor penetration.
 * - magic_direct: Wand, focus. 2 AP, ends turn. No LOS required.
 *
 * AoE:
 * - bomb: Grenade, firebomb. 3 AP, ends turn. 3x3 blast, friendly fire (50%).
 * - magic_aoe: Staff, grimoire. 3 AP, ends turn. Cross pattern, no friendly fire.
 */
export type WeaponSubtype =
  | 'heavy_melee'
  | 'light_melee'
  | 'heavy_ranged'
  | 'light_ranged'
  | 'gun'
  | 'magic_direct'
  | 'bomb'
  | 'magic_aoe'
  // Legacy compatibility
  | 'melee'
  | 'ranged';

/**
 * Consumable subtypes
 */
export type ConsumableSubtype = 'med' | 'buff' | 'bomb';

/**
 * Loot subtypes
 */
export type LootSubtype = 'vendor_trash' | 'quest_item' | 'crafting_material';

/**
 * AoE blast pattern types
 */
export type BlastPattern = 'radius_3x3' | 'cross';

/**
 * Item stats that can modify combat
 */
export interface ItemStats {
  /** Bonus damage added to attacks */
  damage?: number;
  /** Bonus defense added to defense stat */
  defense?: number;
  /** Flat damage reduction (armor value) */
  armor?: number;
  /** Heal amount as percentage of max HP (for meds) */
  healPercent?: number;
  /** Minimum heal amount (for meds) */
  healMin?: number;
  /** Buff: attack roll bonus */
  attackBonus?: number;
  /** Buff: damage bonus */
  damageBonus?: number;
  /** Buff: defense bonus */
  defenseBonus?: number;
  /** Buff duration in turns */
  buffDuration?: number;
  /** AoE base damage (for bombs) */
  aoeDamage?: number;
  /** Gold value for selling */
  sellValue?: number;
}

/**
 * Special weapon properties
 */
export interface WeaponProperties {
  /** Cleave: on kill, free attack on 1 adjacent enemy (heavy melee) */
  cleave?: boolean;
  /** Armor penetration percentage (gun: 0.5 = 50%) */
  armorPenPercent?: number;
  /** No LOS required for attacks (magic direct) */
  noLOSRequired?: boolean;
  /** Aimed shot available (heavy ranged): 3 AP, +3 hit, +2 dmg */
  aimedShot?: boolean;
  /** Reload mechanic (light ranged): every other shot costs 2 AP */
  reload?: boolean;
  /** AoE blast pattern */
  blastPattern?: BlastPattern;
  /** AoE causes friendly fire (bombs: allies take 50% damage) */
  friendlyFire?: boolean;
  /** Friendly fire damage multiplier (0.5 = 50%) */
  friendlyFireMultiplier?: number;
}

/**
 * An item in the inventory system.
 * Items can be weapons, armor, consumables, or loot.
 */
export interface InventoryItem {
  /** Unique identifier for this item instance */
  id: string;
  /** Display name */
  name: string;
  /** Item category */
  type: ItemType;
  /** Weapon subtype (only for weapons) - determines combat behavior */
  subtype?: WeaponSubtype;
  /** Consumable subtype */
  consumableSubtype?: ConsumableSubtype;
  /** Loot subtype */
  lootSubtype?: LootSubtype;
  /** Weapon category shorthand (derived from subtype) */
  weaponCategory?: WeaponCategory;
  /** Combat stat modifiers */
  stats?: ItemStats;
  /** Special weapon properties */
  weaponProperties?: WeaponProperties;
  /** AP cost to use this item in combat */
  apCost?: number;
  /** Whether using this item ends the turn */
  endsTurn?: boolean;
  /** Attack range in tiles (for weapons) */
  attackRange?: number;
  /** Min attack range (for ranged weapons, 0 = no minimum) */
  minRange?: number;
  /** Current stack count (for consumables/loot) */
  stackCount?: number;
  /** Maximum stack size */
  maxStack?: number;
  /** Path to item icon/image (optional) */
  imagePath?: string;
  /** Item description for tooltips */
  description?: string;
  /** Whether item can be sold */
  canSell?: boolean;
  /** Whether item can be dropped */
  canDrop?: boolean;
}

// =============================================================================
// Active Buffs (applied to combatants during combat)
// =============================================================================

/**
 * Active buffs on a combatant during combat.
 * Each buff type has a value and remaining turn count.
 */
export interface ActiveBuffs {
  /** +N to hit rolls */
  attackBonus: number;
  attackTurnsLeft: number;
  /** +N to damage */
  damageBonus: number;
  damageTurnsLeft: number;
  /** +N to defense */
  defenseBonus: number;
  defenseTurnsLeft: number;
}

/**
 * Create a blank (no active buffs) state.
 */
export function createEmptyBuffs(): ActiveBuffs {
  return {
    attackBonus: 0,
    attackTurnsLeft: 0,
    damageBonus: 0,
    damageTurnsLeft: 0,
    defenseBonus: 0,
    defenseTurnsLeft: 0,
  };
}

/**
 * Apply a buff from a consumable item.
 * Same-type buffs refresh duration but do not stack values.
 */
export function applyBuff(
  current: ActiveBuffs,
  item: InventoryItem
): ActiveBuffs {
  const updated = { ...current };
  const duration = item.stats?.buffDuration ?? 3;

  if (item.stats?.attackBonus) {
    updated.attackBonus = item.stats.attackBonus;
    updated.attackTurnsLeft = duration;
  }
  if (item.stats?.damageBonus) {
    updated.damageBonus = item.stats.damageBonus;
    updated.damageTurnsLeft = duration;
  }
  if (item.stats?.defenseBonus) {
    updated.defenseBonus = item.stats.defenseBonus;
    updated.defenseTurnsLeft = duration;
  }

  return updated;
}

/**
 * Decrement buff durations at start of turn. Clear expired buffs.
 */
export function tickBuffs(buffs: ActiveBuffs): ActiveBuffs {
  const updated = { ...buffs };

  if (updated.attackTurnsLeft > 0) {
    updated.attackTurnsLeft--;
    if (updated.attackTurnsLeft === 0) updated.attackBonus = 0;
  }
  if (updated.damageTurnsLeft > 0) {
    updated.damageTurnsLeft--;
    if (updated.damageTurnsLeft === 0) updated.damageBonus = 0;
  }
  if (updated.defenseTurnsLeft > 0) {
    updated.defenseTurnsLeft--;
    if (updated.defenseTurnsLeft === 0) updated.defenseBonus = 0;
  }

  return updated;
}

// =============================================================================
// Character Inventory
// =============================================================================

/**
 * A character's complete inventory state.
 * Includes equipment slots and general storage.
 */
export interface CharacterInventory {
  /** Currently equipped weapon (determines attack type and range) */
  equippedWeapon: InventoryItem | null;
  /** Currently equipped armor (future: affects defense) */
  equippedArmor: InventoryItem | null;
  /** General inventory storage (unequipped items, loot, consumables) */
  items: InventoryItem[];
}

// =============================================================================
// Default Items
// =============================================================================

/**
 * Default starter melee weapon (heavy melee - backward compatible with old Iron Sword)
 */
export const DEFAULT_MELEE_WEAPON: InventoryItem = {
  id: 'starter-sword',
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

/**
 * Default starter ranged weapon (heavy ranged - backward compatible with old Short Bow)
 */
export const DEFAULT_RANGED_WEAPON: InventoryItem = {
  id: 'starter-bow',
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

/**
 * All default starter weapons
 */
export const DEFAULT_WEAPONS: InventoryItem[] = [
  DEFAULT_MELEE_WEAPON,
  DEFAULT_RANGED_WEAPON,
];

// =============================================================================
// Weapon Subtype Helpers
// =============================================================================

/**
 * Get the weapon category from a subtype.
 * Maps new subtypes and legacy subtypes to 'melee' | 'ranged'.
 */
export function getWeaponCategory(subtype: WeaponSubtype | undefined): WeaponCategory {
  switch (subtype) {
    case 'heavy_melee':
    case 'light_melee':
    case 'melee':
      return 'melee';
    case 'heavy_ranged':
    case 'light_ranged':
    case 'gun':
    case 'magic_direct':
    case 'bomb':
    case 'magic_aoe':
    case 'ranged':
      return 'ranged';
    default:
      return 'melee';
  }
}

/**
 * Check if a weapon subtype is a light weapon (1 AP, doesn't end turn).
 */
export function isLightWeapon(subtype: WeaponSubtype | undefined): boolean {
  return subtype === 'light_melee' || subtype === 'light_ranged';
}

/**
 * Check if a weapon subtype is AoE.
 */
export function isAoEWeapon(subtype: WeaponSubtype | undefined): boolean {
  return subtype === 'bomb' || subtype === 'magic_aoe';
}

/**
 * Get the AP cost for attacking with a weapon.
 */
export function getWeaponAPCost(item: InventoryItem | null): number {
  if (!item) return 2; // Unarmed = heavy attack
  if (item.apCost !== undefined) return item.apCost;
  // Fallback for legacy items
  if (isLightWeapon(item.subtype)) return 1;
  if (isAoEWeapon(item.subtype)) return 3;
  return 2;
}

/**
 * Check if attacking with this weapon ends the turn.
 */
export function doesWeaponEndTurn(item: InventoryItem | null): boolean {
  if (!item) return true; // Unarmed ends turn
  if (item.endsTurn !== undefined) return item.endsTurn;
  return !isLightWeapon(item.subtype);
}

/**
 * Get attack range for a weapon, considering level for ranged scaling.
 */
export function getWeaponAttackRange(item: InventoryItem | null, level: number = 1): number {
  if (!item) return 1; // Unarmed
  if (item.attackRange !== undefined) return item.attackRange;
  // Legacy fallback
  const cat = getWeaponCategory(item.subtype);
  if (cat === 'melee') return 1;
  return 3 + Math.floor(level / 20);
}

/**
 * Check if a weapon requires LOS for attacks.
 */
export function weaponRequiresLOS(item: InventoryItem | null): boolean {
  if (!item) return false; // Melee, no LOS
  if (item.weaponProperties?.noLOSRequired) return false;
  // Melee doesn't need LOS
  const cat = getWeaponCategory(item.subtype);
  if (cat === 'melee') return false;
  return true;
}

// =============================================================================
// Consumable Helpers
// =============================================================================

/**
 * Check if an item is usable in combat (consumable with appropriate subtype).
 */
export function isUsableInCombat(item: InventoryItem): boolean {
  if (item.type !== 'consumable') return false;
  if (!item.stackCount || item.stackCount <= 0) return false;
  return item.consumableSubtype === 'med' || item.consumableSubtype === 'buff';
}

/**
 * Check if an item is a bomb (AoE consumable).
 */
export function isBombItem(item: InventoryItem): boolean {
  return item.type === 'consumable' && item.consumableSubtype === 'bomb';
}

/**
 * Use one charge of a consumable, decreasing stack count.
 * Returns updated item, or null if no charges remain.
 */
export function consumeItem(item: InventoryItem): InventoryItem | null {
  if (!item.stackCount || item.stackCount <= 0) return null;
  const newCount = item.stackCount - 1;
  if (newCount <= 0) return null;
  return { ...item, stackCount: newCount };
}

// =============================================================================
// Inventory Helper Functions
// =============================================================================

/**
 * Create a default inventory for a new character.
 * Includes starter melee and ranged weapons, plus some basic supplies.
 */
export function createDefaultInventory(): CharacterInventory {
  return {
    equippedWeapon: { ...DEFAULT_MELEE_WEAPON },
    equippedArmor: null,
    items: [
      { ...DEFAULT_RANGED_WEAPON },
    ],
  };
}

/**
 * Get the weapon type for combat from equipped weapon.
 * Returns 'melee' if no weapon equipped (unarmed).
 */
export function getEquippedWeaponType(inventory: CharacterInventory | null): 'melee' | 'ranged' {
  if (!inventory?.equippedWeapon) {
    return 'melee';
  }
  return getWeaponCategory(inventory.equippedWeapon.subtype) || 'melee';
}

/**
 * Get the bonus damage from equipped weapon.
 */
export function getEquippedWeaponDamage(inventory: CharacterInventory | null): number {
  if (!inventory?.equippedWeapon?.stats?.damage) {
    return 0;
  }
  return inventory.equippedWeapon.stats.damage;
}

/**
 * Get the attack range based on equipped weapon.
 */
export function getAttackRange(inventory: CharacterInventory | null, level: number = 1): number {
  return getWeaponAttackRange(inventory?.equippedWeapon ?? null, level);
}

/**
 * Check if an item can be equipped in the weapon slot.
 */
export function isEquippableWeapon(item: InventoryItem): boolean {
  return item.type === 'weapon';
}

/**
 * Check if an item can be equipped in the armor slot.
 */
export function isEquippableArmor(item: InventoryItem): boolean {
  return item.type === 'armor';
}

/**
 * Move an item from inventory to weapon slot, swapping if needed.
 */
export function equipWeapon(
  inventory: CharacterInventory,
  itemId: string
): CharacterInventory | null {
  const itemIndex = inventory.items.findIndex(item => item.id === itemId);
  if (itemIndex === -1) return null;

  const item = inventory.items[itemIndex];
  if (!isEquippableWeapon(item)) return null;

  const newItems = [...inventory.items];
  newItems.splice(itemIndex, 1);

  if (inventory.equippedWeapon) {
    newItems.push(inventory.equippedWeapon);
  }

  return {
    ...inventory,
    equippedWeapon: item,
    items: newItems,
  };
}

/**
 * Move equipped weapon back to inventory.
 */
export function unequipWeapon(inventory: CharacterInventory): CharacterInventory {
  if (!inventory.equippedWeapon) {
    return inventory;
  }

  return {
    ...inventory,
    equippedWeapon: null,
    items: [...inventory.items, inventory.equippedWeapon],
  };
}

/**
 * Add an item to inventory. Stacks consumables/loot by ID if possible.
 */
export function addItemToInventory(
  inventory: CharacterInventory,
  item: InventoryItem
): CharacterInventory {
  // Try to stack with existing item of same ID
  if (item.stackCount && item.maxStack) {
    const existingIndex = inventory.items.findIndex(
      i => i.id === item.id && i.stackCount !== undefined
    );
    if (existingIndex !== -1) {
      const existing = inventory.items[existingIndex];
      const newCount = Math.min(
        (existing.stackCount ?? 0) + (item.stackCount ?? 1),
        item.maxStack
      );
      const updatedItems = [...inventory.items];
      updatedItems[existingIndex] = { ...existing, stackCount: newCount };
      return { ...inventory, items: updatedItems };
    }
  }

  return {
    ...inventory,
    items: [...inventory.items, item],
  };
}

/**
 * Remove an item from inventory by ID.
 */
export function removeItemFromInventory(
  inventory: CharacterInventory,
  itemId: string
): CharacterInventory {
  return {
    ...inventory,
    items: inventory.items.filter(item => item.id !== itemId),
  };
}

/**
 * Get all usable consumables from inventory.
 */
export function getUsableConsumables(inventory: CharacterInventory): InventoryItem[] {
  return inventory.items.filter(isUsableInCombat);
}

/**
 * Get all bomb items from inventory.
 */
export function getBombItems(inventory: CharacterInventory): InventoryItem[] {
  return inventory.items.filter(isBombItem);
}

/**
 * Use a consumable from inventory, decreasing its stack.
 * Removes the item entirely if stack reaches 0.
 */
export function useConsumableFromInventory(
  inventory: CharacterInventory,
  itemId: string
): { inventory: CharacterInventory; usedItem: InventoryItem | null } {
  const itemIndex = inventory.items.findIndex(i => i.id === itemId);
  if (itemIndex === -1) return { inventory, usedItem: null };

  const item = inventory.items[itemIndex];
  if (item.type !== 'consumable') return { inventory, usedItem: null };

  const remaining = consumeItem(item);
  const newItems = [...inventory.items];

  if (remaining) {
    newItems[itemIndex] = remaining;
  } else {
    newItems.splice(itemIndex, 1);
  }

  return {
    inventory: { ...inventory, items: newItems },
    usedItem: item,
  };
}

// =============================================================================
// Migration Helper
// =============================================================================

/**
 * Migrate old inventory format (pre-weapon-subtype) to new format.
 * Converts legacy 'melee'/'ranged' subtypes to new subtypes.
 */
export function migrateInventoryItem(item: InventoryItem): InventoryItem {
  // Already migrated
  if (item.subtype && item.subtype !== 'melee' && item.subtype !== 'ranged') {
    return item;
  }

  if (item.type !== 'weapon') return item;

  // Map legacy subtypes
  if (item.subtype === 'melee' || (!item.subtype && item.id === 'starter-sword')) {
    return {
      ...item,
      subtype: 'heavy_melee',
      weaponCategory: 'melee',
      apCost: 2,
      endsTurn: true,
      attackRange: 1,
      weaponProperties: { cleave: true },
      stats: { damage: item.stats?.damage ?? 4 },
    };
  }

  if (item.subtype === 'ranged' || (!item.subtype && item.id === 'starter-bow')) {
    return {
      ...item,
      subtype: 'heavy_ranged',
      weaponCategory: 'ranged',
      apCost: 2,
      endsTurn: true,
      attackRange: item.attackRange ?? 4,
      weaponProperties: { aimedShot: true },
      stats: { damage: item.stats?.damage ?? 2 },
    };
  }

  return item;
}

/**
 * Migrate an entire inventory to the new format.
 */
export function migrateInventory(inventory: CharacterInventory): CharacterInventory {
  return {
    equippedWeapon: inventory.equippedWeapon
      ? migrateInventoryItem(inventory.equippedWeapon)
      : null,
    equippedArmor: inventory.equippedArmor,
    items: inventory.items.map(migrateInventoryItem),
  };
}
