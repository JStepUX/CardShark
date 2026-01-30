/**
 * @file InventoryModal.tsx
 * @description Full-screen modal for viewing and managing character inventory.
 *
 * Features:
 * - Character portrait and stats display (HP, Gold)
 * - Equipment slots (weapon, armor)
 * - General inventory grid (5x2)
 * - Drag-and-drop item management
 * - Dismiss ally button (for bonded allies)
 * - Disabled during combat
 */

import React, { useState, useCallback } from 'react';
import { X, Swords, Shield, Package, UserMinus } from 'lucide-react';
import type {
  CharacterInventory,
  InventoryItem,
} from '../../types/inventory';
import {
  equipWeapon,
  unequipWeapon,
  isEquippableWeapon,
} from '../../types/inventory';

// =============================================================================
// Types
// =============================================================================

interface InventoryModalProps {
  /** Character unique ID */
  characterId: string;
  /** Character display name */
  characterName: string;
  /** Path to character portrait image */
  characterImagePath: string | null;
  /** Current HP */
  currentHp: number;
  /** Maximum HP */
  maxHp: number;
  /** Gold amount */
  gold: number;
  /** Character's inventory state */
  inventory: CharacterInventory;
  /** Is this an ally (shows dismiss button) */
  isAlly: boolean;
  /** Close modal callback */
  onClose: () => void;
  /** Called when inventory changes */
  onInventoryChange: (newInventory: CharacterInventory) => void;
  /** Called when ally is dismissed (only for allies) */
  onDismissAlly?: () => void;
}

interface DragState {
  item: InventoryItem;
  source: 'weapon' | 'armor' | 'inventory';
  sourceIndex?: number;
}

// =============================================================================
// Sub-components
// =============================================================================

interface ItemSlotProps {
  item: InventoryItem | null;
  slotType: 'weapon' | 'armor' | 'inventory';
  slotIndex?: number;
  isDragOver: boolean;
  onDragStart: (item: InventoryItem, source: 'weapon' | 'armor' | 'inventory', index?: number) => void;
  onDragEnd: () => void;
  onDrop: (slotType: 'weapon' | 'armor' | 'inventory', slotIndex?: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  placeholder?: string;
}

function ItemSlot({
  item,
  slotType,
  slotIndex,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDrop,
  onDragOver,
  onDragLeave,
  placeholder,
}: ItemSlotProps) {
  const handleDragStart = (e: React.DragEvent) => {
    if (!item) return;
    e.dataTransfer.effectAllowed = 'move';
    onDragStart(item, slotType, slotIndex);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onDrop(slotType, slotIndex);
  };

  const isEquipmentSlot = slotType === 'weapon' || slotType === 'armor';

  return (
    <div
      className={`
        relative flex items-center justify-center
        border-2 rounded-lg transition-all duration-150
        ${isEquipmentSlot ? 'w-20 h-20' : 'w-16 h-16'}
        ${isDragOver ? 'border-blue-400 bg-blue-500/20' : 'border-gray-600 bg-gray-800/50'}
        ${item ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
      `}
      draggable={!!item}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
    >
      {item ? (
        <div className="flex flex-col items-center justify-center p-1 text-center">
          {/* Item icon placeholder - could be replaced with actual images */}
          <div className="text-2xl mb-0.5">
            {item.type === 'weapon' && item.subtype === 'melee' && '⚔️'}
            {item.type === 'weapon' && item.subtype === 'ranged' && '🏹'}
            {item.type === 'armor' && '🛡️'}
            {item.type === 'consumable' && '🧪'}
            {item.type === 'loot' && '💎'}
          </div>
          <span className="text-xs text-gray-300 truncate max-w-full leading-tight">
            {item.name}
          </span>
          {item.stats?.damage && (
            <span className="text-xs text-red-400">+{item.stats.damage}</span>
          )}
        </div>
      ) : (
        <span className="text-gray-500 text-xs text-center px-1">
          {placeholder || 'Empty'}
        </span>
      )}

      {/* Slot type indicator for equipment slots */}
      {isEquipmentSlot && (
        <div className="absolute -top-2 -left-2 w-5 h-5 bg-gray-700 rounded-full flex items-center justify-center border border-gray-600">
          {slotType === 'weapon' && <Swords className="w-3 h-3 text-red-400" />}
          {slotType === 'armor' && <Shield className="w-3 h-3 text-blue-400" />}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function InventoryModal({
  characterId,
  characterName,
  characterImagePath,
  currentHp,
  maxHp,
  gold,
  inventory,
  isAlly,
  onClose,
  onInventoryChange,
  onDismissAlly,
}: InventoryModalProps) {
  // Drag state
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  // HP bar percentage
  const hpPercentage = maxHp > 0 ? (currentHp / maxHp) * 100 : 0;
  const hpColor = hpPercentage > 50 ? 'bg-green-500' : hpPercentage > 25 ? 'bg-yellow-500' : 'bg-red-500';

  // Handle drag start
  const handleDragStart = useCallback((
    item: InventoryItem,
    source: 'weapon' | 'armor' | 'inventory',
    sourceIndex?: number
  ) => {
    setDragState({ item, source, sourceIndex });
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDragState(null);
    setDragOverTarget(null);
  }, []);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget(targetId);
  }, []);

  // Handle drag leave
  const handleDragLeave = useCallback(() => {
    setDragOverTarget(null);
  }, []);

  // Handle drop
  const handleDrop = useCallback((
    targetType: 'weapon' | 'armor' | 'inventory',
    targetIndex?: number
  ) => {
    if (!dragState) return;

    const { item, source, sourceIndex } = dragState;
    let newInventory = { ...inventory };

    // Determine if drop is valid
    if (targetType === 'weapon' && !isEquippableWeapon(item)) {
      // Can't drop non-weapons in weapon slot
      setDragState(null);
      setDragOverTarget(null);
      return;
    }

    // Handle drop based on source and target
    if (source === 'inventory' && targetType === 'weapon') {
      // Equip weapon from inventory
      const result = equipWeapon(inventory, item.id);
      if (result) {
        newInventory = result;
      }
    } else if (source === 'weapon' && targetType === 'inventory') {
      // Unequip weapon to inventory
      newInventory = unequipWeapon(inventory);
    } else if (source === 'inventory' && targetType === 'inventory') {
      // Rearrange items in inventory
      if (sourceIndex !== undefined && targetIndex !== undefined && sourceIndex !== targetIndex) {
        const newItems = [...inventory.items];
        const [removed] = newItems.splice(sourceIndex, 1);
        newItems.splice(targetIndex, 0, removed);
        newInventory = { ...inventory, items: newItems };
      }
    }

    onInventoryChange(newInventory);
    setDragState(null);
    setDragOverTarget(null);
  }, [dragState, inventory, onInventoryChange]);

  // Close on escape
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  // Inventory grid (5 columns x 2 rows = 10 slots)
  const INVENTORY_SLOTS = 10;
  const inventorySlots: (InventoryItem | null)[] = [];
  for (let i = 0; i < INVENTORY_SLOTS; i++) {
    inventorySlots.push(inventory.items[i] || null);
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">{characterName}'s Inventory</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            aria-label="Close inventory"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Character Info Row */}
          <div className="flex gap-4">
            {/* Portrait */}
            <div className="w-24 h-32 rounded-lg overflow-hidden bg-gray-800 border border-gray-700 flex-shrink-0">
              {characterImagePath ? (
                <img
                  src={characterImagePath}
                  alt={characterName}
                  className="w-full h-full object-cover object-top"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">
                  No Image
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex-1 space-y-3">
              {/* HP Bar */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">HP</span>
                  <span className="text-white">{currentHp} / {maxHp}</span>
                </div>
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${hpColor} transition-all duration-300`}
                    style={{ width: `${hpPercentage}%` }}
                  />
                </div>
              </div>

              {/* Gold */}
              <div className="flex items-center gap-2">
                <span className="text-yellow-400 text-lg">🪙</span>
                <span className="text-white font-medium">{gold}</span>
                <span className="text-gray-500 text-sm">Gold</span>
              </div>
            </div>
          </div>

          {/* Equipment Slots */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">Equipment</h3>
            <div className="flex gap-4">
              <div>
                <span className="text-xs text-gray-500 block mb-1">Weapon</span>
                <ItemSlot
                  item={inventory.equippedWeapon}
                  slotType="weapon"
                  isDragOver={dragOverTarget === 'weapon'}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDrop={handleDrop}
                  onDragOver={(e) => handleDragOver(e, 'weapon')}
                  onDragLeave={handleDragLeave}
                  placeholder="No Weapon"
                />
              </div>
              <div>
                <span className="text-xs text-gray-500 block mb-1">Armor</span>
                <ItemSlot
                  item={inventory.equippedArmor}
                  slotType="armor"
                  isDragOver={dragOverTarget === 'armor'}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDrop={handleDrop}
                  onDragOver={(e) => handleDragOver(e, 'armor')}
                  onDragLeave={handleDragLeave}
                  placeholder="No Armor"
                />
              </div>
            </div>
          </div>

          {/* Inventory Grid */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">Inventory</h3>
            <div className="grid grid-cols-5 gap-2">
              {inventorySlots.map((item, index) => (
                <ItemSlot
                  key={index}
                  item={item}
                  slotType="inventory"
                  slotIndex={index}
                  isDragOver={dragOverTarget === `inventory-${index}`}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDrop={handleDrop}
                  onDragOver={(e) => handleDragOver(e, `inventory-${index}`)}
                  onDragLeave={handleDragLeave}
                />
              ))}
            </div>
          </div>

          {/* Ally Dismiss Button */}
          {isAlly && onDismissAlly && (
            <div className="pt-2 border-t border-gray-700">
              <button
                onClick={onDismissAlly}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                           bg-red-900/50 hover:bg-red-800/60 border border-red-700/50
                           text-red-300 hover:text-red-200 rounded-lg transition-colors"
              >
                <UserMinus className="w-4 h-4" />
                <span>Dismiss {characterName}</span>
              </button>
              <p className="text-xs text-gray-500 text-center mt-2">
                This ally will remain here while you continue alone.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InventoryModal;
