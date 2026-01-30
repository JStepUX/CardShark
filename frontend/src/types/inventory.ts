/**
 * @file inventory.ts
 * @description Inventory system types for the tactical RPG.
 *
 * This file defines:
 * - Item types and interfaces
 * - Character inventory structure
 * - Default starter weapons
 * - Helper functions for inventory management
 */

// =============================================================================
// Item Types
// =============================================================================

/**
 * Base item type categories
 */
export type ItemType = 'weapon' | 'armor' | 'consumable' | 'loot';

/**
 * Weapon subtypes - affects combat behavior
 */
export type WeaponSubtype = 'melee' | 'ranged';

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
  /** Weapon subtype (only for weapons) - determines melee vs ranged behavior */
  subtype?: WeaponSubtype;
  /** Combat stat modifiers */
  stats?: ItemStats;
  /** Path to item icon/image (optional) */
  imagePath?: string;
  /** Item description for tooltips */
  description?: string;
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
 * Default starter melee weapon
 */
export const DEFAULT_MELEE_WEAPON: InventoryItem = {
  id: 'starter-sword',
  name: 'Iron Sword',
  type: 'weapon',
  subtype: 'melee',
  stats: {
    damage: 2,
  },
  description: 'A simple but reliable sword. Good for close combat.',
};

/**
 * Default starter ranged weapon
 */
export const DEFAULT_RANGED_WEAPON: InventoryItem = {
  id: 'starter-bow',
  name: 'Short Bow',
  type: 'weapon',
  subtype: 'ranged',
  stats: {
    damage: 1,
  },
  description: 'A lightweight bow for attacking from a distance.',
};

/**
 * All default starter weapons
 */
export const DEFAULT_WEAPONS: InventoryItem[] = [
  DEFAULT_MELEE_WEAPON,
  DEFAULT_RANGED_WEAPON,
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a default inventory for a new character.
 * Includes starter melee and ranged weapons, with melee equipped by default.
 *
 * @returns A CharacterInventory with default items
 */
export function createDefaultInventory(): CharacterInventory {
  return {
    equippedWeapon: { ...DEFAULT_MELEE_WEAPON },
    equippedArmor: null,
    items: [
      { ...DEFAULT_RANGED_WEAPON }, // Ranged weapon in inventory (not equipped)
    ],
  };
}

/**
 * Get the weapon type for combat from equipped weapon.
 * Returns 'melee' if no weapon equipped (unarmed).
 *
 * @param inventory The character's inventory
 * @returns 'melee' or 'ranged'
 */
export function getEquippedWeaponType(inventory: CharacterInventory | null): 'melee' | 'ranged' {
  if (!inventory?.equippedWeapon) {
    return 'melee'; // Unarmed = melee range
  }
  return inventory.equippedWeapon.subtype || 'melee';
}

/**
 * Get the bonus damage from equipped weapon.
 *
 * @param inventory The character's inventory
 * @returns Bonus damage value (0 if no weapon)
 */
export function getEquippedWeaponDamage(inventory: CharacterInventory | null): number {
  if (!inventory?.equippedWeapon?.stats?.damage) {
    return 0;
  }
  return inventory.equippedWeapon.stats.damage;
}

/**
 * Get the attack range based on equipped weapon.
 * Melee weapons have range 1, ranged weapons have range 3-5.
 *
 * @param inventory The character's inventory
 * @param level Character level (affects ranged weapon range)
 * @returns Attack range in tiles
 */
export function getAttackRange(inventory: CharacterInventory | null, level: number = 1): number {
  const weaponType = getEquippedWeaponType(inventory);

  if (weaponType === 'melee') {
    return 1;
  }

  // Ranged: 3 base + level bonus
  return 3 + Math.floor(level / 20);
}

/**
 * Check if an item can be equipped in the weapon slot.
 *
 * @param item The item to check
 * @returns true if item is a weapon
 */
export function isEquippableWeapon(item: InventoryItem): boolean {
  return item.type === 'weapon';
}

/**
 * Check if an item can be equipped in the armor slot.
 *
 * @param item The item to check
 * @returns true if item is armor
 */
export function isEquippableArmor(item: InventoryItem): boolean {
  return item.type === 'armor';
}

/**
 * Move an item from inventory to weapon slot, swapping if needed.
 *
 * @param inventory Current inventory state
 * @param itemId ID of item to equip
 * @returns New inventory state, or null if item not found or not a weapon
 */
export function equipWeapon(
  inventory: CharacterInventory,
  itemId: string
): CharacterInventory | null {
  // Find item in inventory
  const itemIndex = inventory.items.findIndex(item => item.id === itemId);
  if (itemIndex === -1) return null;

  const item = inventory.items[itemIndex];
  if (!isEquippableWeapon(item)) return null;

  // Create new items array without the equipped item
  const newItems = [...inventory.items];
  newItems.splice(itemIndex, 1);

  // If there's a currently equipped weapon, move it to inventory
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
 *
 * @param inventory Current inventory state
 * @returns New inventory state
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
 * Add an item to inventory.
 *
 * @param inventory Current inventory state
 * @param item Item to add
 * @returns New inventory state
 */
export function addItemToInventory(
  inventory: CharacterInventory,
  item: InventoryItem
): CharacterInventory {
  return {
    ...inventory,
    items: [...inventory.items, item],
  };
}

/**
 * Remove an item from inventory by ID.
 *
 * @param inventory Current inventory state
 * @param itemId ID of item to remove
 * @returns New inventory state
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
