// frontend/src/components/combat/InitiativeTracker.tsx
// Shows turn order with mini portraits

import { CombatState, Combatant } from '../../types/combat';

interface InitiativeTrackerProps {
  state: CombatState;
}

/**
 * Mini card component for initiative tracker
 */
function MiniCard({ combatant, isCurrent }: { combatant: Combatant; isCurrent: boolean }) {
  const borderColor = combatant.isPlayerControlled ? 'border-amber-500' : 'border-red-500';
  const glowColor = isCurrent ? (combatant.isPlayerControlled ? 'shadow-amber-500/50' : 'shadow-red-500/50') : '';

  return (
    <div className={`relative w-12 h-16 rounded border-2 ${borderColor} ${glowColor} ${isCurrent ? 'shadow-lg' : ''} overflow-hidden bg-black`}>
      {/* Portrait */}
      {combatant.imagePath ? (
        <img
          src={combatant.imagePath}
          alt={combatant.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-600 text-xs">
          ?
        </div>
      )}

      {/* HP indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-900">
        <div
          className="h-full bg-green-500"
          style={{ width: `${(combatant.currentHp / combatant.maxHp) * 100}%` }}
        />
      </div>

      {/* Current turn indicator */}
      {isCurrent && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
      )}
    </div>
  );
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
    <div className="flex items-center justify-center h-full px-4">
      <div className="flex items-center gap-2">
        {displayOrder.map(({ combatant, isCurrent, position }) => {
          if (!combatant) return null;

          const scale = isCurrent ? 'scale-110' : 'scale-90';
          const opacity = isCurrent ? 'opacity-100' : 'opacity-50';

          return (
            <div
              key={`${position}-${combatant.id}`}
              className={`transition-all duration-300 ${scale} ${opacity}`}
            >
              <MiniCard combatant={combatant} isCurrent={isCurrent} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
