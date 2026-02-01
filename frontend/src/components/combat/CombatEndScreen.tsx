/**
 * @file CombatEndScreen.tsx
 * @description Post-combat result screen displaying victory or defeat.
 *
 * Shows:
 * - Victory: Rewards (XP, gold), defeated enemies list, revived allies, level-up
 * - Defeat: Message about being defeated
 * - Continue button to return to exploration
 */

import React, { useEffect } from 'react';
import { Skull, Coins, Star, Heart, LogOut, TrendingUp, Zap, Shield, Swords } from 'lucide-react';
import type { GridCombatState, GridCombatant } from '../../types/combat';
import type { LevelUpInfo } from '../../utils/progressionUtils';
import { soundManager } from './pixi/SoundManager';

// Combat backdrop images by genre
// TODO: Add genre-specific backdrops (sci-fi, modern, etc.)
import fantasyBackdrop from '../../assets/finish_combat_backdrop.png';

// Genre backdrop mapping - extend this for non-fantasy worlds
const COMBAT_BACKDROPS: Record<string, string> = {
  fantasy: fantasyBackdrop,
  // Future genre support:
  // scifi: scifiBackdrop,
  // modern: modernBackdrop,
  // horror: horrorBackdrop,
  default: fantasyBackdrop,
};

/**
 * Get the appropriate combat backdrop for the world's genre
 * @param genre - The world's genre (e.g., 'fantasy', 'scifi')
 * @returns URL to the backdrop image
 */
const getCombatBackdrop = (genre?: string): string => {
  return COMBAT_BACKDROPS[genre || 'default'] || COMBAT_BACKDROPS.default;
};

// =============================================================================
// Types
// =============================================================================

interface CombatEndScreenProps {
    /** Combat end phase */
    phase: 'victory' | 'defeat';
    /** Combat result data */
    result: GridCombatState['result'];
    /** All combatants (for displaying enemy names) */
    combatants?: Record<string, GridCombatant>;
    /** Level-up information if player leveled up */
    levelUpInfo?: LevelUpInfo | null;
    /** World genre for themed backdrop (e.g., 'fantasy', 'scifi') */
    genre?: string;
    /** Callback when player clicks continue */
    onContinue: () => void;
}

// Check if this is a flee outcome
const isFledOutcome = (result: GridCombatState['result']): boolean => {
    return result?.outcome === 'fled';
};

// =============================================================================
// Level-Up Display Component
// =============================================================================

interface LevelUpDisplayProps {
    levelUpInfo: LevelUpInfo;
}

const LevelUpDisplay: React.FC<LevelUpDisplayProps> = ({ levelUpInfo }) => {
    const { oldLevel, newLevel, levelsGained, statChanges } = levelUpInfo;

    // Stat display config
    const statConfig = [
        { key: 'hp', label: 'HP', icon: Heart, color: 'text-green-400' },
        { key: 'damage', label: 'Attack', icon: Swords, color: 'text-red-400' },
        { key: 'defense', label: 'Defense', icon: Shield, color: 'text-blue-400' },
        { key: 'speed', label: 'Speed', icon: Zap, color: 'text-yellow-400' },
        { key: 'armor', label: 'Armor', icon: Shield, color: 'text-gray-400' },
    ] as const;

    return (
        <div className="bg-gradient-to-b from-purple-900/40 to-purple-950/40 rounded-lg p-5 border border-purple-500/40 animate-pulse-slow">
            {/* Level Up Header */}
            <div className="flex items-center justify-center gap-3 mb-4">
                <TrendingUp className="w-8 h-8 text-purple-400" />
                <div className="text-center">
                    <h3 className="text-2xl font-bold text-purple-300 tracking-wide">
                        LEVEL UP!
                    </h3>
                    <p className="text-lg text-purple-400">
                        Level {oldLevel} <span className="text-purple-300">-&gt;</span> Level {newLevel}
                        {levelsGained > 1 && (
                            <span className="text-purple-300 ml-2">(+{levelsGained}!)</span>
                        )}
                    </p>
                </div>
                <TrendingUp className="w-8 h-8 text-purple-400" />
            </div>

            {/* Stat Changes */}
            <div className="grid grid-cols-2 gap-2 text-sm">
                {statConfig.map(({ key, label, icon: Icon, color }) => {
                    const change = statChanges[key as keyof typeof statChanges];
                    if (!change || change.old === change.new) return null;

                    return (
                        <div
                            key={key}
                            className="flex items-center justify-between px-3 py-1.5 bg-black/30 rounded"
                        >
                            <div className="flex items-center gap-2">
                                <Icon className={`w-4 h-4 ${color}`} />
                                <span className="text-gray-400">{label}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-gray-500">{change.old}</span>
                                <span className="text-purple-400">-&gt;</span>
                                <span className={`font-semibold ${color}`}>{change.new}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Full HP Restored */}
            <p className="text-center text-green-400/80 text-xs mt-3 uppercase tracking-wide">
                HP Fully Restored!
            </p>
        </div>
    );
};

// =============================================================================
// Component
// =============================================================================

export const CombatEndScreen: React.FC<CombatEndScreenProps> = ({
    phase,
    result,
    combatants,
    levelUpInfo,
    genre,
    onContinue,
}) => {
    const isFled = isFledOutcome(result);
    const isVictory = phase === 'victory' && !isFled;
    const backdropUrl = getCombatBackdrop(genre);

    // Play victory or defeat sound when screen appears
    useEffect(() => {
        if (isVictory) {
            soundManager.play('victory');
        } else if (phase === 'defeat') {
            soundManager.play('defeat');
        }
    }, [isVictory, phase]);

    // Get defeated enemy names, categorized by death vs incapacitated
    const deadEnemyNames: string[] = [];
    const incapacitatedEnemyNames: string[] = [];

    result?.defeatedEnemies?.forEach(id => {
        const combatant = combatants?.[id];
        const name = combatant?.name ?? 'Unknown Enemy';
        if (combatant?.isDead) {
            deadEnemyNames.push(name);
        } else {
            // Incapacitated or unknown - show as incapacitated
            incapacitatedEnemyNames.push(name);
        }
    });

    // Get revived ally names (allies who were knocked out but auto-revived on victory)
    const revivedAllyNames = result?.revivedAllies?.map(id => {
        const combatant = combatants?.[id];
        return combatant?.name ?? 'Ally';
    }) ?? [];

    // Check if the player was revived by an ally (ally carried the fight)
    const playerWasRevived = result?.revivedPlayer ?? false;
    const revivedByAllyName = result?.revivedByAllyId
        ? combatants?.[result.revivedByAllyId]?.name ?? 'Your ally'
        : 'Your ally';

    const hasDefeatedEnemies = deadEnemyNames.length > 0 || incapacitatedEnemyNames.length > 0;
    const hasLevelUp = levelUpInfo && levelUpInfo.levelsGained > 0;

    // Determine border color based on outcome (purple glow for level-up)
    const borderColor = isFled
        ? 'border-blue-500/50'
        : hasLevelUp
            ? 'border-purple-500/70 shadow-[0_0_20px_rgba(168,85,247,0.4)]'
            : isVictory
                ? 'border-yellow-500/50'
                : 'border-red-500/50';

    return (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50 animate-fade-in">
            <div className={`
                bg-gray-900 rounded-xl p-8 text-center border-2 max-w-md mx-4
                shadow-2xl transform transition-all
                ${borderColor}
            `}>
                {/* Header with backdrop */}
                <div className="mb-6">
                    {isFled ? (
                        <>
                            <LogOut className="w-16 h-16 mx-auto mb-3 text-blue-400" />
                            <h2 className="text-4xl font-bold text-blue-400 tracking-wide">
                                ESCAPED!
                            </h2>
                        </>
                    ) : isVictory ? (
                        <div
                            className="relative w-full h-40 rounded-lg overflow-hidden mb-2"
                            style={{
                                backgroundImage: `url(${backdropUrl})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center top',
                            }}
                        >
                            {/* Gradient overlay for text readability */}
                            <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />
                            {/* Victory text positioned at the bottom of the backdrop */}
                            <div className="absolute inset-x-0 bottom-0 pb-3">
                                <h2 className="text-4xl font-bold text-yellow-400 tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                                    VICTORY!
                                </h2>
                            </div>
                        </div>
                    ) : (
                        <>
                            <Skull className="w-16 h-16 mx-auto mb-3 text-red-500" />
                            <h2 className="text-4xl font-bold text-red-500 tracking-wide">
                                DEFEAT
                            </h2>
                        </>
                    )}
                </div>

                {/* Victory Content */}
                {isVictory && result?.rewards && (
                    <div className="space-y-4 mb-6">
                        {/* Player Revived by Ally (show first - dramatic moment!) */}
                        {playerWasRevived && (
                            <div className="bg-gradient-to-b from-teal-900/40 to-teal-950/40 rounded-lg p-4 border border-teal-500/40">
                                <div className="flex items-center justify-center gap-2 mb-2">
                                    <Heart className="w-5 h-5 text-teal-400" />
                                    <h3 className="text-lg font-semibold text-teal-300">
                                        Saved by {revivedByAllyName}!
                                    </h3>
                                    <Heart className="w-5 h-5 text-teal-400" />
                                </div>
                                <p className="text-sm text-teal-400/80 text-center">
                                    You were knocked out, but your ally finished the fight and helped you back up.
                                </p>
                                <p className="text-xs text-teal-500/70 mt-1 text-center">
                                    Revived at 25% HP
                                </p>
                            </div>
                        )}

                        {/* Level Up (show second - big celebration!) */}
                        {hasLevelUp && levelUpInfo && (
                            <LevelUpDisplay levelUpInfo={levelUpInfo} />
                        )}

                        {/* Rewards */}
                        <div className="bg-gradient-to-b from-gray-800/70 to-gray-900/70 rounded-lg p-5 border border-yellow-500/20">
                            <h3 className="text-sm font-semibold text-yellow-400/80 uppercase tracking-wider mb-4">
                                Rewards Earned
                            </h3>
                            <div className="flex justify-center gap-10">
                                <div className="flex flex-col items-center">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Star className="w-6 h-6 text-yellow-400 animate-pulse" />
                                        <span className="text-3xl font-bold text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]">
                                            +{result.rewards.xp}
                                        </span>
                                    </div>
                                    <span className="text-xs text-yellow-400/70 uppercase tracking-wide">Experience</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Coins className="w-6 h-6 text-amber-400" />
                                        <span className="text-3xl font-bold text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]">
                                            +{result.rewards.gold}
                                        </span>
                                    </div>
                                    <span className="text-xs text-amber-400/70 uppercase tracking-wide">Gold</span>
                                </div>
                            </div>
                        </div>

                        {/* Revived Allies (show next - good news!) */}
                        {revivedAllyNames.length > 0 && (
                            <div className="bg-blue-900/30 rounded-lg p-4 border border-blue-500/30">
                                <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-2">
                                    Recovered
                                </h3>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {revivedAllyNames.map((name, index) => (
                                        <span
                                            key={index}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-900/40 rounded text-sm text-blue-300"
                                        >
                                            <Heart className="w-3 h-3" />
                                            {name}
                                        </span>
                                    ))}
                                </div>
                                <p className="text-xs text-blue-400/70 mt-2">
                                    Revived at 25% HP
                                </p>
                            </div>
                        )}

                        {/* Defeated Enemies */}
                        {hasDefeatedEnemies && (
                            <div className="bg-gray-800/50 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
                                    Defeated
                                </h3>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {/* Dead enemies (skull icon) */}
                                    {deadEnemyNames.map((name, index) => (
                                        <span
                                            key={`dead-${index}`}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-red-900/30 rounded text-sm text-red-300"
                                        >
                                            <Skull className="w-3 h-3" />
                                            {name}
                                        </span>
                                    ))}
                                    {/* Incapacitated enemies (no skull, different color) */}
                                    {incapacitatedEnemyNames.map((name, index) => (
                                        <span
                                            key={`incap-${index}`}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700/50 rounded text-sm text-gray-400"
                                        >
                                            {name}
                                            <span className="text-xs text-gray-500">(KO)</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Fled Content */}
                {isFled && (
                    <div className="mb-6">
                        <p className="text-gray-400">
                            You managed to escape from battle.
                        </p>
                        <p className="text-gray-500 text-sm mt-2">
                            No rewards gained, but you live to fight another day.
                        </p>
                    </div>
                )}

                {/* Defeat Content */}
                {!isVictory && !isFled && (
                    <div className="mb-6">
                        <p className="text-gray-400">
                            You have been defeated in battle.
                        </p>
                        <p className="text-gray-500 text-sm mt-2">
                            Your journey continues...
                        </p>
                    </div>
                )}

                {/* Continue Button */}
                <button
                    onClick={onContinue}
                    className={`
                        px-8 py-3 rounded-lg font-semibold text-lg
                        transition-all transform hover:scale-105
                        ${isFled
                            ? 'bg-blue-600 hover:bg-blue-500 text-white'
                            : hasLevelUp
                                ? 'bg-purple-600 hover:bg-purple-500 text-white'
                                : isVictory
                                    ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                        }
                    `}
                >
                    Continue
                </button>
            </div>
        </div>
    );
};

export default CombatEndScreen;
