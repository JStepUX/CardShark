// frontend/src/components/combat/PlayerHUD.tsx
// Player status display for combat

import { Combatant } from '../../types/combat';

interface PlayerHUDProps {
  player: Combatant;
  apRemaining: number;
}

export function PlayerHUD({ player, apRemaining }: PlayerHUDProps) {
  // HP bar calculations
  const hpPercent = Math.max(0, (player.currentHp / player.maxHp) * 100);
  const hpBarColor = hpPercent > 50 ? 'bg-red-500' : hpPercent > 25 ? 'bg-red-600' : 'bg-red-700';

  return (
    <div className="flex items-center gap-4">
      {/* Portrait */}
      <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-amber-600 flex-shrink-0">
        {player.imagePath ? (
          <img
            src={player.imagePath}
            alt={player.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-700 flex items-center justify-center">
            <span className="text-xl text-gray-400 font-bold">
              {player.name.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* HP Bar */}
      <div className="flex-1 max-w-xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-white font-semibold">{player.name}</span>
          <span className="text-sm text-gray-400">Lv.{player.level}</span>
        </div>
        <div className="relative h-6 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
          <div
            className={`absolute inset-y-0 left-0 ${hpBarColor} transition-all duration-300`}
            style={{ width: `${hpPercent}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-xs font-bold drop-shadow">
              HP: {player.currentHp}/{player.maxHp}
            </span>
          </div>
        </div>
      </div>

      {/* AP Indicator */}
      <div className="flex items-center gap-1">
        <span className="text-gray-400 text-sm mr-1">AP:</span>
        {[0, 1].map(i => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 ${i < apRemaining
                ? 'bg-red-500 border-red-400'
                : 'bg-gray-700 border-gray-600'
              }`}
          />
        ))}
      </div>

      {/* Status effects */}
      <div className="flex items-center gap-1">
        {player.isDefending && (
          <div className="px-2 py-1 bg-blue-600 rounded text-xs text-white">
            Defending
          </div>
        )}
        {player.isOverwatching && (
          <div className="px-2 py-1 bg-purple-600 rounded text-xs text-white">
            Overwatch
          </div>
        )}
      </div>
    </div>
  );
}
