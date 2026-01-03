// frontend/src/components/combat/CombatCard.tsx
// Individual combatant card for the battlefield

import { Combatant } from '../../types/combat';

interface CombatCardProps {
  combatant: Combatant;
  isCurrentTurn: boolean;
  isValidTarget: boolean;
  isSelected: boolean;
  onClick?: () => void;
  size?: 'normal' | 'mini';
  // Animation states
  isAttacking?: boolean;
  isBeingAttacked?: boolean;
  isEnemyRow?: boolean; // Used to determine attack direction
}

export function CombatCard({
  combatant,
  isCurrentTurn,
  isValidTarget,
  isSelected,
  onClick,
  size = 'normal',
  isAttacking = false,
  isBeingAttacked = false,
  isEnemyRow = false,
}: CombatCardProps) {
  const isMini = size === 'mini';
  const isKnockedOut = combatant.isKnockedOut;

  // Calculate HP percentage for bar
  const hpPercent = Math.max(0, (combatant.currentHp / combatant.maxHp) * 100);
  const hpBarColor = hpPercent > 50 ? 'bg-red-500' : hpPercent > 25 ? 'bg-red-600' : 'bg-red-700';

  // Card frame color based on team
  const frameColor = combatant.isPlayerControlled
    ? 'border-amber-600'
    : 'border-red-700';

  // Current turn indicator
  const turnIndicator = isCurrentTurn ? 'ring-4 ring-blue-500 ring-opacity-75' : '';

  // Valid target glow
  const targetGlow = isValidTarget && !isKnockedOut
    ? 'cursor-pointer hover:ring-2 hover:ring-yellow-400 hover:ring-opacity-75'
    : '';

  // Selected state
  const selectedStyle = isSelected ? 'ring-4 ring-yellow-500' : '';

  // Knocked out styling
  const knockedOutStyle = isKnockedOut
    ? 'grayscale opacity-50 rotate-3'
    : '';

  // Attack animation classes - direction based on row
  // Enemies (top row) attack downward, Players (bottom row) attack upward
  const attackAnimationClass = isAttacking
    ? (isEnemyRow ? 'animate-melee-attack-down z-50' : 'animate-melee-attack-up z-50')
    : '';
  const hitAnimationClass = isBeingAttacked ? 'animate-take-hit' : '';

  // Remove overflow-hidden during animations to allow movement
  const overflowClass = (isAttacking || isBeingAttacked) ? '' : 'overflow-hidden';

  if (isMini) {
    // Mini card for initiative tracker
    return (
      <div
        className={`
          relative w-12 h-16 rounded border-2 overflow-hidden
          ${frameColor} ${turnIndicator} ${knockedOutStyle}
          transition-all duration-200
        `}
      >
        {/* Portrait */}
        <div className="absolute inset-0">
          {combatant.imagePath ? (
            <img
              src={combatant.imagePath}
              alt={combatant.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-stone-700 flex items-center justify-center">
              <span className="text-xs text-gray-400">
                {combatant.name.charAt(0)}
              </span>
            </div>
          )}
        </div>

        {/* Level badge */}
        <div className="absolute top-0 left-0 bg-black/70 text-white text-[10px] px-1 rounded-br">
          {combatant.level}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={isValidTarget && !isKnockedOut ? onClick : undefined}
      className={`
        relative w-28 h-40 rounded-lg border-4
        bg-stone-900 shadow-lg
        ${overflowClass}
        ${frameColor} ${turnIndicator} ${targetGlow} ${selectedStyle} ${knockedOutStyle}
        ${attackAnimationClass} ${hitAnimationClass}
        transition-all duration-200
      `}
    >
      {/* Current turn arrow indicator */}
      {isCurrentTurn && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-10">
          <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-blue-500 animate-bounce" />
        </div>
      )}

      {/* Portrait */}
      <div className="absolute inset-0">
        {combatant.imagePath ? (
          <img
            src={combatant.imagePath}
            alt={combatant.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-gray-700 to-gray-800 flex items-center justify-center">
            <span className="text-2xl text-gray-500 font-bold">
              {combatant.name.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* Gradient overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />

      {/* Level badge (top-left) */}
      <div className="absolute top-1 left-1 bg-black/80 text-white text-xs font-bold px-1.5 py-0.5 rounded">
        {combatant.level}
      </div>

      {/* Status icons (top-right) */}
      <div className="absolute top-1 right-1 flex flex-col gap-0.5">
        {combatant.isDefending && (
          <div className="bg-blue-600 text-white text-[10px] px-1 rounded" title="Defending">
            DEF
          </div>
        )}
        {combatant.isOverwatching && (
          <div className="bg-purple-600 text-white text-[10px] px-1 rounded" title="Overwatch">
            OW
          </div>
        )}
      </div>

      {/* Recent damage display */}
      {combatant.recentDamage !== null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative">
            {/* Slash graphic */}
            <div className="absolute inset-0 w-16 h-16 -rotate-45">
              <div className="w-full h-1 bg-red-500 blur-sm" />
            </div>
            {/* Damage number */}
            <span className="text-3xl font-bold text-red-500 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] animate-pulse">
              -{combatant.recentDamage}
            </span>
          </div>
        </div>
      )}

      {/* Bottom section: stats and HP */}
      <div className="absolute bottom-0 left-0 right-0 p-1">
        {/* Attack/Defense badges */}
        <div className="flex justify-between mb-1">
          <div className="bg-red-900/90 text-white text-[10px] px-1 rounded flex items-center gap-0.5">
            <span>ATK</span>
            <span className="font-bold">{combatant.damage}</span>
          </div>
          <div className="bg-blue-900/90 text-white text-[10px] px-1 rounded flex items-center gap-0.5">
            <span>DEF</span>
            <span className="font-bold">{combatant.defense}</span>
          </div>
        </div>

        {/* Name plate with HP bar */}
        <div className="bg-black/90 rounded px-1 py-0.5">
          <div className="text-white text-xs font-semibold truncate text-center">
            {combatant.name}
          </div>
          {/* HP bar */}
          <div className="relative h-2 bg-stone-700 rounded-full overflow-hidden mt-0.5">
            <div
              className={`absolute inset-y-0 left-0 ${hpBarColor} transition-all duration-300`}
              style={{ width: `${hpPercent}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[8px] text-white font-bold drop-shadow">
                {combatant.currentHp}/{combatant.maxHp}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Knocked out overlay */}
      {isKnockedOut && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <span className="text-red-500 font-bold text-lg rotate-[-15deg]">
            KO
          </span>
        </div>
      )}
    </div>
  );
}
