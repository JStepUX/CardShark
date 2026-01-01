// frontend/src/components/combat/BattlefieldGrid.tsx
// The 2x5 battlefield grid for combat

import { CombatState } from '../../types/combat';
import { CombatCard } from './CombatCard';

interface BattlefieldGridProps {
  state: CombatState;
  currentActorId: string | null;
  validTargetIds: string[];
  validMoveSlots: number[];
  selectedTargetId: string | null;
  targetingMode: 'none' | 'attack' | 'move' | 'swap';
  onSelectTarget: (targetId: string) => void;
  onSelectMoveSlot: (slot: number) => void;
}

export function BattlefieldGrid({
  state,
  currentActorId,
  validTargetIds,
  validMoveSlots,
  selectedTargetId,
  targetingMode,
  onSelectTarget,
  onSelectMoveSlot,
}: BattlefieldGridProps) {
  const renderSlot = (
    slotIndex: number,
    combatantId: string | null,
    isEnemyRow: boolean
  ) => {
    const combatant = combatantId ? state.combatants[combatantId] : null;
    const isEmpty = !combatant;

    // Check if this empty slot is a valid move target
    const isValidMoveTarget =
      targetingMode === 'move' &&
      isEmpty &&
      !isEnemyRow && // Can only move in own row
      validMoveSlots.includes(slotIndex);

    // Empty slot styling
    const emptySlotClass = isEnemyRow
      ? 'border-red-900/50 bg-red-950/20'
      : 'border-blue-900/50 bg-blue-950/20';

    const validMoveClass = isValidMoveTarget
      ? 'border-green-500 bg-green-900/30 cursor-pointer hover:bg-green-800/40'
      : '';

    if (isEmpty) {
      return (
        <div
          key={`slot-${isEnemyRow ? 'enemy' : 'ally'}-${slotIndex}`}
          onClick={isValidMoveTarget ? () => onSelectMoveSlot(slotIndex) : undefined}
          className={`
            w-28 h-40 rounded-lg border-2 border-dashed
            flex items-center justify-center
            transition-all duration-200
            ${emptySlotClass} ${validMoveClass}
          `}
        >
          {isValidMoveTarget && (
            <div className="text-green-400 text-sm">Move here</div>
          )}
        </div>
      );
    }

    const isCurrentTurn = combatantId === currentActorId;
    const isValidTarget = validTargetIds.includes(combatantId!);
    const isSelected = combatantId === selectedTargetId;

    return (
      <CombatCard
        key={combatantId}
        combatant={combatant}
        isCurrentTurn={isCurrentTurn}
        isValidTarget={isValidTarget && targetingMode !== 'none'}
        isSelected={isSelected}
        onClick={() => onSelectTarget(combatantId!)}
      />
    );
  };

  return (
    <div className="flex flex-col gap-6 items-center py-4">
      {/* Enemy row (top) */}
      <div className="flex gap-3 justify-center">
        {state.battlefield.enemySlots.map((id, index) =>
          renderSlot(index, id, true)
        )}
      </div>

      {/* Center divider */}
      <div className="w-full max-w-2xl h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent" />

      {/* Ally row (bottom) */}
      <div className="flex gap-3 justify-center">
        {state.battlefield.allySlots.map((id, index) =>
          renderSlot(index, id, false)
        )}
      </div>
    </div>
  );
}
