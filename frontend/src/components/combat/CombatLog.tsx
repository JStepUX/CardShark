// frontend/src/components/combat/CombatLog.tsx
// Combat log display showing turn history

import { useEffect, useRef } from 'react';
import { CombatLogEntry } from '../../types/combat';

interface CombatLogProps {
  log: CombatLogEntry[];
  currentTurn: number;
}

export function CombatLog({ log, currentTurn }: CombatLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [log.length]);

  // Get the most recent entries (last 5 or so for display)
  const recentEntries = log.slice(-10);

  return (
    <div className="flex flex-col h-full">
      {/* Turn counter header */}
      <div className="px-4 py-2 border-b border-gray-700 flex-shrink-0">
        <h3 className="text-lg font-bold text-white">
          Combat Turn #{currentTurn}
        </h3>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-3 min-h-0"
      >
        {recentEntries.length === 0 ? (
          <p className="text-gray-500 text-sm italic">Combat begins...</p>
        ) : (
          recentEntries.map(entry => (
            <LogEntry key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  );
}

function LogEntry({ entry }: { entry: CombatLogEntry }) {
  // Determine styling based on action type and result
  const isAttack = entry.actionType === 'attack';
  const isHit = entry.result.hit;
  const isKillingBlow = entry.result.special === 'killing_blow';

  // Mechanical result color
  let mechanicalColor = 'text-gray-300';
  if (isAttack) {
    if (isKillingBlow) {
      mechanicalColor = 'text-red-400 font-bold';
    } else if (isHit) {
      mechanicalColor = 'text-red-400';
    } else {
      mechanicalColor = 'text-gray-400';
    }
  } else if (entry.actionType === 'defend') {
    mechanicalColor = 'text-blue-400';
  } else if (entry.actionType === 'flee') {
    mechanicalColor = entry.result.special === 'fled' ? 'text-green-400' : 'text-yellow-400';
  }

  return (
    <div className="border-l-2 border-gray-700 pl-3">
      {/* Mechanical result */}
      <p className={`text-sm ${mechanicalColor}`}>
        {entry.mechanicalText}
      </p>

      {/* Narrator flavor text (if available) */}
      {entry.narratorText && (
        <p className="text-sm text-gray-400 italic mt-1">
          Narrator: {entry.narratorText}
        </p>
      )}

      {/* Hit quality indicator for attacks */}
      {isAttack && entry.result.hitQuality && (
        <HitQualityBadge quality={entry.result.hitQuality} />
      )}
    </div>
  );
}

function HitQualityBadge({ quality }: { quality: string }) {
  const badges: Record<string, { label: string; color: string }> = {
    miss: { label: 'Miss', color: 'bg-gray-600' },
    marginal: { label: 'Glancing', color: 'bg-yellow-700' },
    solid: { label: 'Solid', color: 'bg-orange-600' },
    crushing: { label: 'Crushing!', color: 'bg-red-600' },
    armor_soak: { label: 'Deflected', color: 'bg-blue-700' },
  };

  const badge = badges[quality] || badges.miss;

  return (
    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded ${badge.color} text-white mt-1`}>
      {badge.label}
    </span>
  );
}
