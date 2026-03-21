import { useCallback, useState } from 'react';
import type { CharacterInventory } from '../types/inventory';
import type { WorldPlayMessageAppender } from '../worldplay/contracts';

interface UseWorldPlayInventoryOptions {
  isInCombat: boolean;
  activeNpcId: string | undefined;
  activeNpcName: string;
  playerInventory: CharacterInventory;
  allyInventory: CharacterInventory | null;
  setPlayerInventory: (inventory: CharacterInventory) => void;
  setAllyInventory: (inventory: CharacterInventory | null) => void;
  clearBondedAlly: () => void;
  addMessage: WorldPlayMessageAppender;
}

interface UseWorldPlayInventoryReturn {
  playerInventory: CharacterInventory;
  allyInventory: CharacterInventory | null;
  showInventoryModal: boolean;
  inventoryTarget: 'player' | 'ally';
  handleOpenInventory: (target: 'player' | 'ally') => void;
  handleCloseInventory: () => void;
  handleInventoryChange: (inventory: CharacterInventory) => void;
  handleDismissAllyFromInventory: () => void;
}

export function useWorldPlayInventory({
  isInCombat,
  activeNpcId,
  activeNpcName,
  playerInventory,
  allyInventory,
  setPlayerInventory,
  setAllyInventory,
  clearBondedAlly,
  addMessage,
}: UseWorldPlayInventoryOptions): UseWorldPlayInventoryReturn {
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventoryTarget, setInventoryTarget] = useState<'player' | 'ally'>('player');

  const handleOpenInventory = useCallback((target: 'player' | 'ally') => {
    if (isInCombat) {
      return;
    }

    setInventoryTarget(target);
    setShowInventoryModal(true);
  }, [isInCombat]);

  const handleCloseInventory = useCallback(() => {
    setShowInventoryModal(false);
  }, []);

  const handleInventoryChange = useCallback((inventory: CharacterInventory) => {
    if (inventoryTarget === 'player') {
      setPlayerInventory(inventory);
      return;
    }

    setAllyInventory(inventory);
  }, [inventoryTarget, setPlayerInventory, setAllyInventory]);

  const handleDismissAllyFromInventory = useCallback(() => {
    if (!activeNpcId || !activeNpcName) {
      return;
    }

    setShowInventoryModal(false);
    clearBondedAlly();
    addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `*${activeNpcName} stays behind as you part ways.*`,
      timestamp: Date.now(),
      metadata: {
        type: 'npc_dismissed',
        npcId: activeNpcId,
        speakerName: activeNpcName,
      },
    });
    setAllyInventory(null);
  }, [activeNpcId, activeNpcName, addMessage, clearBondedAlly, setAllyInventory]);

  return {
    playerInventory,
    allyInventory,
    showInventoryModal,
    inventoryTarget,
    handleOpenInventory,
    handleCloseInventory,
    handleInventoryChange,
    handleDismissAllyFromInventory,
  };
}
