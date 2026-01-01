// frontend/src/components/combat/InitiativeTracker.tsx
// Shows turn order with mini portraits

import React from 'react';
import { CombatState } from '../../types/combat';
import { CombatCard } from './CombatCard';

interface InitiativeTrackerProps {
  state: CombatState;
}

export function InitiativeTracker({ state }: InitiativeTrackerProps) {
  const { initiativeOrder, currentTurnIndex, combatants } = state;

  // Get previous, current, and next combatants
  const getDisplayOrder = () => {
    const total = initiativeOrder.length;
    if (total === 0) return [];

    const indices = [
      (currentTurnIndex - 1 + total) % total, // Previous
      currentTurnIndex,                        // Current
      (currentTurnIndex + 1) % total,         // Next
    ];

    return indices.map((idx, displayIdx) => ({
      combatant: combatants[initiativeOrder[idx]],
      isCurrent: displayIdx === 1,
      position: displayIdx === 0 ? 'prev' : displayIdx === 1 ? 'current' : 'next',
    }));
  };

  const displayOrder = getDisplayOrder();

  return (
    <div className="flex flex-col items-center gap-2 py-4 px-2">
      <h4 className="text-xs text-gray-500 uppercase tracking-wider">Turn Order</h4>

      <div className="flex flex-col items-center gap-1">
        {displayOrder.map(({ combatant, isCurrent, position }) => {
          if (!combatant) return null;

          const scale = isCurrent ? 'scale-110' : 'scale-90';
          const opacity = isCurrent ? 'opacity-100' : 'opacity-50';

          return (
            <div
              key={`${position}-${combatant.id}`}
              className={`transition-all duration-300 ${scale} ${opacity}`}
            >
              <CombatCard
                combatant={combatant}
                isCurrentTurn={isCurrent}
                isValidTarget={false}
                isSelected={false}
                size="mini"
              />
            </div>
          );
        })}
      </div>

      {/* Fade edges indicator */}
      <div className="w-12 h-4 bg-gradient-to-b from-transparent to-gray-900/50" />
    </div>
  );
}
