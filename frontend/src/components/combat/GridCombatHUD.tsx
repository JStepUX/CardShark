/**
 * @file GridCombatHUD.tsx
 * @description Combat HUD overlay for grid-based tactical combat.
 *
 * Displays:
 * - Turn order bar (top)
 * - Action buttons (bottom center)
 * - Combat log (bottom left)
 * - Current combatant info (bottom right)
 */

import React, { useMemo } from 'react';
import {
    Swords,
    Shield,
    SkipForward,
    Footprints,
    Heart,
    Zap,
    LogOut,
    FlaskConical,
    Crosshair,
} from 'lucide-react';
import {
    GridCombatState,
    GridCombatant,
    CombatLogEntry,
    GRID_AP_COSTS,
} from '../../types/combat';
import type { InventoryItem } from '../../types/inventory';
import { isUsableInCombat, isBombItem, isAoEWeapon, isLightWeapon, getWeaponAPCost } from '../../types/inventory';

// =============================================================================
// Types
// =============================================================================

interface GridCombatHUDProps {
    /** Current combat state */
    combatState: GridCombatState;
    /** Whether it's the player's turn */
    isPlayerTurn: boolean;
    /** Current targeting mode */
    targetingMode: 'none' | 'move' | 'attack' | 'item' | 'aoe';
    /** Callback when action button clicked */
    onActionClick: (action: 'attack' | 'defend' | 'end_turn' | 'flee') => void;
    /** Callback to enter targeting mode */
    onStartTargeting: (mode: 'move' | 'attack' | 'aoe') => void;
    /** Callback to cancel targeting */
    onCancelTargeting: () => void;
    /** Called when player selects an item to use */
    onUseItem?: (itemId: string) => void;
    /** Called when player selects AoE targeting with an item */
    onStartAoETargeting?: (item: InventoryItem) => void;
}

// =============================================================================
// Sub-Components
// =============================================================================

/** Turn order portrait */
const TurnPortrait: React.FC<{
    combatant: GridCombatant;
    isActive: boolean;
    isPlayer: boolean;
}> = ({ combatant, isActive }) => {
    const borderColor = combatant.isPlayerControlled
        ? isActive ? 'border-yellow-400' : 'border-blue-500'
        : isActive ? 'border-yellow-400' : 'border-red-500';

    const bgColor = combatant.isKnockedOut
        ? 'bg-gray-800 opacity-50'
        : combatant.isPlayerControlled ? 'bg-blue-900' : 'bg-red-900';

    return (
        <div
            className={`relative w-12 h-12 rounded-lg border-2 ${borderColor} ${bgColor}
                        overflow-hidden transition-all ${isActive ? 'ring-2 ring-yellow-400 scale-110' : ''}`}
            title={`${combatant.name} (${combatant.currentHp}/${combatant.maxHp} HP)`}
        >
            {combatant.imagePath ? (
                <img
                    src={combatant.imagePath}
                    alt={combatant.name}
                    className="w-full h-full object-cover"
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold">
                    {combatant.name.charAt(0)}
                </div>
            )}
            {/* HP bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-900">
                <div
                    className={`h-full ${combatant.currentHp / combatant.maxHp > 0.5 ? 'bg-green-500' :
                        combatant.currentHp / combatant.maxHp > 0.25 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${(combatant.currentHp / combatant.maxHp) * 100}%` }}
                />
            </div>
            {/* Knockout overlay */}
            {combatant.isKnockedOut && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="text-red-500 text-lg">✕</span>
                </div>
            )}
        </div>
    );
};

/** Action button */
const ActionButton: React.FC<{
    icon: React.ReactNode;
    label: string;
    apCost: number;
    disabled: boolean;
    active?: boolean;
    onClick: () => void;
}> = ({ icon, label, apCost, disabled, active, onClick }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`flex flex-col items-center justify-center px-4 py-2 rounded-lg
                   transition-all min-w-[70px]
                   ${disabled
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : active
                    ? 'bg-yellow-600 text-white ring-2 ring-yellow-400'
                    : 'bg-gray-800 text-white hover:bg-gray-700'}`}
    >
        <div className="text-xl mb-1">{icon}</div>
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[10px] text-gray-400">{apCost} AP</span>
    </button>
);

/** Combat log entry */
const LogEntry: React.FC<{ entry: CombatLogEntry }> = ({ entry }) => {
    const getEntryColor = () => {
        if (entry.result.special === 'killing_blow') return 'text-red-400';
        if (entry.result.hit === false) return 'text-gray-400';
        if (entry.result.hitQuality === 'crushing') return 'text-yellow-400';
        return 'text-white';
    };

    return (
        <div className={`text-xs py-1 ${getEntryColor()}`}>
            <span className="text-gray-500 mr-1">[{entry.turn}]</span>
            {entry.mechanicalText}
        </div>
    );
};

// =============================================================================
// Main Component
// =============================================================================

export const GridCombatHUD: React.FC<GridCombatHUDProps> = ({
    combatState,
    isPlayerTurn,
    targetingMode,
    onActionClick,
    onStartTargeting,
    onCancelTargeting,
    onUseItem,
    onStartAoETargeting,
}) => {
    // Get current combatant
    const currentCombatant = useMemo(() => {
        const id = combatState.initiativeOrder[combatState.currentTurnIndex];
        return combatState.combatants[id];
    }, [combatState]);

    // Get ordered combatants for turn display
    const orderedCombatants = useMemo(() => {
        return combatState.initiativeOrder.map(id => combatState.combatants[id]).filter(Boolean);
    }, [combatState]);

    // Get recent log entries (last 5)
    const recentLog = useMemo(() => {
        return combatState.log.slice(-5).reverse();
    }, [combatState.log]);

    // AP available
    const currentAP = currentCombatant?.apRemaining ?? 0;

    // Get player's combat items
    const playerItems = useMemo(() => {
        if (!currentCombatant) return [];
        return currentCombatant.combatItems?.filter(
            item => (isUsableInCombat(item) || isBombItem(item)) && (item.stackCount ?? 0) > 0
        ) ?? [];
    }, [currentCombatant]);

    // Check weapon-specific AP cost for attack button
    const attackAPCost = useMemo(() => {
        if (!currentCombatant?.equippedWeapon) return GRID_AP_COSTS.attack;
        return getWeaponAPCost(currentCombatant.equippedWeapon);
    }, [currentCombatant]);

    const canAttack = isPlayerTurn && currentAP >= attackAPCost;
    const canUseItem = isPlayerTurn && currentAP >= GRID_AP_COSTS.useItem && playerItems.length > 0;

    // Check if equipped weapon is AoE
    const hasAoEWeapon = currentCombatant?.equippedWeapon && isAoEWeapon(currentCombatant.equippedWeapon.subtype);
    const canAoE = isPlayerTurn && currentAP >= GRID_AP_COSTS.aoeAttack && hasAoEWeapon;

    // Check what actions are available
    const canDefend = isPlayerTurn && currentAP >= GRID_AP_COSTS.defend && !currentCombatant?.isDefending;
    const canMove = isPlayerTurn && currentAP >= 1;

    // Victory/defeat state
    const isEnded = combatState.phase === 'victory' || combatState.phase === 'defeat';

    if (isEnded) {
        return (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-50">
                <div className="bg-gray-900 rounded-xl p-8 text-center border-2 border-gray-700">
                    <h2 className={`text-3xl font-bold mb-4 ${combatState.phase === 'victory' ? 'text-yellow-400' : 'text-red-500'}`}>
                        {combatState.phase === 'victory' ? 'Victory!' : 'Defeat'}
                    </h2>
                    {combatState.result?.rewards && (
                        <div className="text-gray-300 mb-4">
                            <p>XP Gained: {combatState.result.rewards.xp}</p>
                            <p>Gold: {combatState.result.rewards.gold}</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 pointer-events-none z-40">
            {/* Turn Order Bar - Top */}
            {/* Note: outer div is pointer-events-none so clicks pass through to map */}
            {/* Only the inner content box has pointer-events-auto */}
            <div className="absolute top-0 left-0 right-0 flex justify-center p-2">
                <div className="bg-gray-900/90 rounded-lg px-4 py-2 flex items-center gap-2 border border-gray-700 pointer-events-auto">
                    <span className="text-xs text-gray-400 mr-2">Turn {combatState.turn}</span>
                    <div className="flex gap-1">
                        {orderedCombatants.map((c, idx) => (
                            <TurnPortrait
                                key={c.id}
                                combatant={c}
                                isActive={idx === combatState.currentTurnIndex}
                                isPlayer={c.isPlayer}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Current Combatant Info - Top Right (below map controls) */}
            {currentCombatant && (
                <div className="absolute top-56 right-4 bg-gray-900/90 rounded-lg p-3 border border-gray-700 pointer-events-auto">
                    <div className="text-sm font-bold text-white mb-1">{currentCombatant.name}</div>
                    <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1">
                            <Heart className="w-3 h-3 text-red-400" />
                            <span className="text-gray-300">{currentCombatant.currentHp}/{currentCombatant.maxHp}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3 text-yellow-400" />
                            <span className="text-gray-300">{currentAP} AP</span>
                        </div>
                    </div>
                    {currentCombatant.isDefending && (
                        <div className="text-xs text-blue-400 mt-1 flex items-center gap-1">
                            <Shield className="w-3 h-3" /> Defending
                        </div>
                    )}
                    {/* Active buffs */}
                    {currentCombatant.activeBuffs && (
                        <div className="flex gap-1 mt-1">
                            {currentCombatant.activeBuffs.attackBonus > 0 && (
                                <span className="text-[10px] px-1 bg-red-900/50 text-red-300 rounded" title={`+${currentCombatant.activeBuffs.attackBonus} attack (${currentCombatant.activeBuffs.attackTurnsLeft} turns)`}>
                                    ATK+{currentCombatant.activeBuffs.attackBonus}
                                </span>
                            )}
                            {currentCombatant.activeBuffs.damageBonus > 0 && (
                                <span className="text-[10px] px-1 bg-orange-900/50 text-orange-300 rounded" title={`+${currentCombatant.activeBuffs.damageBonus} damage (${currentCombatant.activeBuffs.damageTurnsLeft} turns)`}>
                                    DMG+{currentCombatant.activeBuffs.damageBonus}
                                </span>
                            )}
                            {currentCombatant.activeBuffs.defenseBonus > 0 && (
                                <span className="text-[10px] px-1 bg-blue-900/50 text-blue-300 rounded" title={`+${currentCombatant.activeBuffs.defenseBonus} defense (${currentCombatant.activeBuffs.defenseTurnsLeft} turns)`}>
                                    DEF+{currentCombatant.activeBuffs.defenseBonus}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Combat Log - Bottom Left */}
            <div className="absolute bottom-20 left-4 w-72 bg-gray-900/90 rounded-lg p-3 border border-gray-700 pointer-events-auto max-h-40 overflow-y-auto">
                <div className="text-xs font-bold text-gray-400 mb-2">Combat Log</div>
                {recentLog.length === 0 ? (
                    <div className="text-xs text-gray-500">Combat started...</div>
                ) : (
                    recentLog.map(entry => <LogEntry key={entry.id} entry={entry} />)
                )}
            </div>

            {/* Action Bar - Bottom Center */}
            {isPlayerTurn && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto">
                    <div className="bg-gray-900/90 rounded-lg px-4 py-3 flex items-center gap-2 border border-gray-700">
                        {/* Move button */}
                        <ActionButton
                            icon={<Footprints className="w-5 h-5" />}
                            label="Move"
                            apCost={1}
                            disabled={!canMove}
                            active={targetingMode === 'move'}
                            onClick={() => onStartTargeting('move')}
                        />

                        {/* Attack button */}
                        <ActionButton
                            icon={<Swords className="w-5 h-5" />}
                            label={isLightWeapon(currentCombatant?.equippedWeapon?.subtype) ? "Quick Atk" : "Attack"}
                            apCost={attackAPCost}
                            disabled={!canAttack}
                            active={targetingMode === 'attack'}
                            onClick={() => onStartTargeting('attack')}
                        />

                        {/* Defend button */}
                        <ActionButton
                            icon={<Shield className="w-5 h-5" />}
                            label="Defend"
                            apCost={GRID_AP_COSTS.defend}
                            disabled={!canDefend}
                            onClick={() => onActionClick('defend')}
                        />

                        {/* Use Item button */}
                        {playerItems.length > 0 && (
                            <div className="relative group">
                                <ActionButton
                                    icon={<FlaskConical className="w-5 h-5" />}
                                    label="Item"
                                    apCost={GRID_AP_COSTS.useItem}
                                    disabled={!canUseItem}
                                    active={targetingMode === 'item'}
                                    onClick={() => {
                                        // Use first available med/buff item immediately
                                        const usableItem = playerItems.find(i => i.consumableSubtype === 'med' || i.consumableSubtype === 'buff');
                                        if (usableItem && onUseItem) {
                                            onUseItem(usableItem.id);
                                        }
                                    }}
                                />
                                {/* Item count badge */}
                                <div className="absolute -top-1 -right-1 bg-blue-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                    {playerItems.filter(i => i.consumableSubtype !== 'bomb').length}
                                </div>
                            </div>
                        )}

                        {/* AoE button - for equipped AoE weapon or bomb items */}
                        {(hasAoEWeapon || playerItems.some(i => isBombItem(i))) && (
                            <ActionButton
                                icon={<Crosshair className="w-5 h-5" />}
                                label="AoE"
                                apCost={GRID_AP_COSTS.aoeAttack}
                                disabled={!canAoE && !playerItems.some(i => isBombItem(i) && currentAP >= (i.apCost ?? 3))}
                                active={targetingMode === 'aoe'}
                                onClick={() => {
                                    if (hasAoEWeapon) {
                                        onStartTargeting('aoe');
                                    } else {
                                        const bomb = playerItems.find(i => isBombItem(i));
                                        if (bomb && onStartAoETargeting) {
                                            onStartAoETargeting(bomb);
                                        }
                                    }
                                }}
                            />
                        )}

                        <div className="w-px h-10 bg-gray-700 mx-2" />

                        {/* Flee button - dice roll d20 + speed/5 vs DC 12 */}
                        <div title="Roll d20 + Speed/5 vs DC 12. Success: escape combat. Failure: lose your turn.">
                            <ActionButton
                                icon={<LogOut className="w-5 h-5" />}
                                label="Flee"
                                apCost={0}
                                disabled={false}
                                onClick={() => onActionClick('flee')}
                            />
                        </div>

                        {/* End Turn button */}
                        <ActionButton
                            icon={<SkipForward className="w-5 h-5" />}
                            label="End Turn"
                            apCost={0}
                            disabled={false}
                            onClick={() => onActionClick('end_turn')}
                        />
                    </div>

                    {/* Targeting mode hint */}
                    {targetingMode !== 'none' && (
                        <div className="text-center mt-2 text-sm text-yellow-400 bg-gray-900/80 rounded px-3 py-1">
                            {targetingMode === 'move' && 'Click a tile to move'}
                            {targetingMode === 'attack' && 'Click an enemy to attack'}
                            {targetingMode === 'aoe' && 'Click a tile to target AoE'}
                            {targetingMode === 'item' && 'Select an item to use'}
                            <button
                                onClick={onCancelTargeting}
                                className="ml-2 text-gray-400 hover:text-white underline"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Non-Player Turn Indicator (Ally or Enemy) */}
            {!isPlayerTurn && currentCombatant && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto">
                    <div className={`rounded-lg px-6 py-3 border text-center ${
                        currentCombatant.isPlayerControlled
                            ? 'bg-blue-900/90 border-blue-700'
                            : 'bg-red-900/90 border-red-700'
                    }`}>
                        <div className={`text-sm ${currentCombatant.isPlayerControlled ? 'text-blue-300' : 'text-red-300'}`}>
                            {currentCombatant.isPlayerControlled ? 'Ally Turn' : 'Enemy Turn'}
                        </div>
                        <div className="text-white font-bold">{currentCombatant.name}</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GridCombatHUD;
