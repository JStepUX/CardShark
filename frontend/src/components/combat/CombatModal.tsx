// frontend/src/components/combat/CombatModal.tsx
// Main combat modal - orchestrates all combat UI

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CombatState,
  CombatAction,
  CombatEvent,
  ActionType,
  CombatInitData,
} from '../../types/combat';
import {
  initializeCombat,
  combatReducer,
  getCurrentActor,
  getAvailableActions,
  getValidAttackTargets,
  getValidMoveSlots,
  getValidSwapTargets,
} from '../../services/combat/combatEngine';
import { getEnemyAction } from '../../services/combat/enemyAI';
import { BattlefieldGrid } from './BattlefieldGrid';
import { ActionButtons } from './ActionButtons';
import { CombatLog } from './CombatLog';
import { InitiativeTracker } from './InitiativeTracker';
import { PlayerHUD } from './PlayerHUD';

interface CombatModalProps {
  initData: CombatInitData;
  onCombatEnd: (result: CombatState['result']) => void;
  onNarratorRequest?: (events: CombatEvent[]) => void;
}

export function CombatModal({
  initData,
  onCombatEnd,
  onNarratorRequest,
}: CombatModalProps) {
  // Combat state
  const [combatState, setCombatState] = useState<CombatState>(() =>
    initializeCombat(initData)
  );

  // Ref to prevent double-execution of enemy turns
  const enemyTurnInProgress = useRef(false);

  // UI state
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [targetingMode, setTargetingMode] = useState<'none' | 'attack' | 'move' | 'swap'>('none');

  // Derived state
  const currentActor = getCurrentActor(combatState);
  const isPlayerTurn = currentActor?.isPlayerControlled ?? false;
  const availableActions = isPlayerTurn ? getAvailableActions(combatState) : [];

  // Get valid targets based on selected action
  const validTargetIds = (() => {
    if (!currentActor || !selectedAction) return [];
    if (selectedAction === 'attack') {
      return getValidAttackTargets(combatState, currentActor.id).map(c => c.id);
    }
    if (selectedAction === 'swap') {
      return getValidSwapTargets(combatState, currentActor.id).map(c => c.id);
    }
    return [];
  })();

  const validMoveSlots = (() => {
    if (!currentActor || selectedAction !== 'move') return [];
    return getValidMoveSlots(combatState, currentActor.id);
  })();

  // Find the player character for HUD
  const playerCombatant = Object.values(combatState.combatants).find(c => c.isPlayer);

  // Process action and update state
  const executeAction = useCallback((action: CombatAction) => {
    const { state: newState, events } = combatReducer(combatState, action);
    setCombatState(newState);

    // Clear UI state
    setSelectedAction(null);
    setTargetingMode('none');

    // Send events to narrator if callback provided
    if (events.length > 0 && onNarratorRequest) {
      onNarratorRequest(events);
    }

    // Check for combat end
    if (newState.phase === 'victory' || newState.phase === 'defeat') {
      // Small delay before calling end callback for UX
      setTimeout(() => {
        onCombatEnd(newState.result);
      }, 1500);
    }
  }, [combatState, onCombatEnd, onNarratorRequest]);

  // Handle enemy turns automatically
  useEffect(() => {
    if (combatState.phase === 'resolving' && currentActor && !currentActor.isPlayerControlled) {
      // Guard against double-execution
      if (enemyTurnInProgress.current) return;
      enemyTurnInProgress.current = true;

      // Add a small delay for UX
      const timeout = setTimeout(() => {
        const enemyAction = getEnemyAction(combatState);
        if (enemyAction) {
          executeAction(enemyAction);
        }
        enemyTurnInProgress.current = false;
      }, 1000);

      return () => {
        clearTimeout(timeout);
        enemyTurnInProgress.current = false;
      };
    }
  }, [combatState, currentActor, executeAction]);

  // Handle action selection
  const handleSelectAction = useCallback((action: ActionType) => {
    setSelectedAction(action);

    // Set targeting mode based on action
    if (action === 'attack') {
      setTargetingMode('attack');
    } else if (action === 'move') {
      setTargetingMode('move');
    } else if (action === 'swap') {
      setTargetingMode('swap');
    } else {
      // Actions that don't need targeting (defend, overwatch, flee)
      setTargetingMode('none');

      // Execute immediately
      if (currentActor) {
        executeAction({
          type: action,
          actorId: currentActor.id,
        });
      }
    }
  }, [currentActor, executeAction]);

  // Handle target selection
  const handleSelectTarget = useCallback((targetId: string) => {
    if (!currentActor || !selectedAction) return;

    if (selectedAction === 'attack' || selectedAction === 'swap') {
      executeAction({
        type: selectedAction,
        actorId: currentActor.id,
        targetId,
      });
    }
  }, [currentActor, selectedAction, executeAction]);

  // Handle move slot selection
  const handleSelectMoveSlot = useCallback((slot: number) => {
    if (!currentActor || selectedAction !== 'move') return;

    executeAction({
      type: 'move',
      actorId: currentActor.id,
      targetSlot: slot,
    });
  }, [currentActor, selectedAction, executeAction]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setSelectedAction(null);
    setTargetingMode('none');
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlayerTurn) return;

      const key = e.key.toUpperCase();
      const actionMap: Record<string, ActionType> = {
        'A': 'attack',
        'D': 'defend',
        'O': 'overwatch',
        'M': 'move',
        'S': 'swap',
        'F': 'flee',
      };

      if (key === 'ESCAPE') {
        handleCancel();
      } else if (actionMap[key] && availableActions.includes(actionMap[key])) {
        handleSelectAction(actionMap[key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlayerTurn, availableActions, handleSelectAction, handleCancel]);

  // Combat end screens
  if (combatState.phase === 'victory') {
    const isFled = combatState.result?.outcome === 'fled';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="text-center">
          <h1 className={`text-5xl font-bold mb-4 ${isFled ? 'text-amber-500' : 'text-green-500'}`}>
            {isFled ? 'ESCAPED!' : 'VICTORY!'}
          </h1>
          {!isFled && combatState.result?.rewards && (
            <div className="text-white text-xl space-y-2">
              <p>+{combatState.result.rewards.xp} XP</p>
              <p>+{combatState.result.rewards.gold} Gold</p>
            </div>
          )}
          {isFled && (
            <p className="text-gray-300">You fled from combat successfully.</p>
          )}
          <p className="text-gray-400 mt-4">Combat ended in {combatState.turn} turns</p>
        </div>
      </div>
    );
  }

  if (combatState.phase === 'defeat') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-red-500 mb-4">DEFEAT</h1>
          <p className="text-gray-400">Your party has fallen...</p>
          <p className="text-gray-500 mt-2 text-sm">Survived {combatState.turn} turns</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      {/* Room backdrop (blurred) */}
      {combatState.roomImagePath && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20 blur-sm"
          style={{ backgroundImage: `url(${combatState.roomImagePath})` }}
        />
      )}

      {/* Main content - constrained to not overflow */}
      <div className="relative flex-1 flex min-h-0 overflow-hidden">
        {/* Left side: Battlefield */}
        <div className="flex-1 flex flex-col">
          {/* Battlefield area */}
          <div className="flex-1 flex items-center justify-center">
            <BattlefieldGrid
              state={combatState}
              currentActorId={currentActor?.id || null}
              validTargetIds={validTargetIds}
              validMoveSlots={validMoveSlots}
              selectedTargetId={null}
              targetingMode={targetingMode}
              onSelectTarget={handleSelectTarget}
              onSelectMoveSlot={handleSelectMoveSlot}
            />
          </div>
        </div>

        {/* Right side: Combat log + Initiative */}
        <div className="w-80 flex flex-col border-l border-gray-800 bg-gray-900/80">
          {/* Initiative tracker */}
          <div className="border-b border-gray-800 flex-shrink-0">
            <InitiativeTracker state={combatState} />
          </div>

          {/* Combat log - Fixed height with scroll */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <CombatLog log={combatState.log} currentTurn={combatState.turn} />
          </div>
        </div>
      </div>

      {/* Bottom HUD - prevent from being pushed down */}
      <div className="relative border-t border-gray-800 bg-gray-900/90 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* Player HUD (left) */}
          {playerCombatant && (
            <PlayerHUD
              player={playerCombatant}
              apRemaining={currentActor?.isPlayer ? currentActor.apRemaining : 0}
            />
          )}

          {/* Action buttons (right) */}
          <ActionButtons
            availableActions={availableActions}
            selectedAction={selectedAction}
            apRemaining={currentActor?.apRemaining || 0}
            onSelectAction={handleSelectAction}
            onCancel={handleCancel}
            disabled={!isPlayerTurn}
          />
        </div>

        {/* Turn indicator */}
        {!isPlayerTurn && currentActor && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full">
            <div className="bg-gray-800 border border-gray-700 rounded-t px-4 py-1 text-sm text-gray-400">
              {currentActor.name}'s turn...
            </div>
          </div>
        )}

        {/* Targeting hint */}
        {targetingMode !== 'none' && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full">
            <div className="bg-amber-700 border border-amber-600 rounded-t px-4 py-1 text-sm text-white">
              {targetingMode === 'attack' && 'Select an enemy to attack'}
              {targetingMode === 'move' && 'Select a position to move to'}
              {targetingMode === 'swap' && 'Select an adjacent ally to swap with'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
