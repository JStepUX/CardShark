/**
 * @file gridCombatEngine.ts
 * @description Grid-based tactical combat engine for card-avatar RPG.
 *
 * This is the combat engine. Combatants move on a tile grid, use AP for actions,
 * and fight using range/LOS mechanics.
 *
 * ## Core Loop
 * 1. Combat starts from LocalMapState when player enters threat zone
 * 2. Entities become GridCombatants with positions preserved
 * 3. Turn-based: initiative order, 4 AP per turn
 * 4. Actions: move (1 AP/tile), attack (2 AP), defend (1 AP), end turn
 * 5. Victory when all enemies defeated, defeat when player KO'd
 *
 * ## AP Economy
 * - 4 AP per turn
 * - Move: 1 AP per tile (2 AP for difficult terrain)
 * - Attack: 2 AP
 * - Defend: 1 AP (reduces incoming damage)
 * - End Turn: 0 AP (pass remaining AP)
 */

import {
    GridCombatant,
    GridCombatState,
    GridCombatAction,
    GridMoveAction,
    GridAttackAction,
    GridDefendAction,
    GridEndTurnAction,
    GridFleeAction,
    CombatPhase,
    CombatEvent,
    CombatEventType,
    CombatLogEntry,
    HitQuality,
    calculateHitQuality,
    GRID_AP_COSTS,
} from '../../types/combat';
import { TilePosition, LocalMapTileData } from '../../types/localMap';
import { generateUUID } from '../../utils/generateUUID';
import { findPath, validatePath, PathfindingGrid } from '../../utils/pathfinding';
import {
    calculateDistance,
    hasLineOfSight,
    checkFlanking,
    CombatGrid,
    CombatEntity,
} from '../../utils/gridCombatUtils';

// =============================================================================
// Random Utilities
// =============================================================================

function rollD20(): number {
    return Math.floor(Math.random() * 20) + 1;
}

function rollD6(): number {
    return Math.floor(Math.random() * 6) + 1;
}

function rollDamageVariance(): number {
    return Math.floor(Math.random() * 7) - 3; // -3 to +3
}

/**
 * Determine whether a defeated enemy is killed or incapacitated.
 * Incapacitation is MORE LIKELY than death (70% vs 30%).
 *
 * @returns 'incapacitated' or 'dead'
 */
export function rollDeathOrIncapacitation(): 'incapacitated' | 'dead' {
    const roll = Math.random() * 100;
    // 70% chance of incapacitation, 30% chance of death
    return roll < 70 ? 'incapacitated' : 'dead';
}

// =============================================================================
// Grid Combat Reducer
// =============================================================================

export interface GridCombatResult {
    state: GridCombatState;
    events: CombatEvent[];
}

/**
 * Main grid combat reducer.
 * Pure function: state + action => new state + events
 */
export function gridCombatReducer(
    state: GridCombatState,
    action: GridCombatAction,
    grid: CombatGrid
): GridCombatResult {
    // Validate it's the actor's turn
    const currentId = state.initiativeOrder[state.currentTurnIndex];
    if (action.actorId !== currentId && action.type !== 'grid_end_turn') {
        return { state, events: [] };
    }

    let newState: GridCombatState;

    switch (action.type) {
        case 'grid_move':
            newState = executeGridMove(state, action, grid);
            break;
        case 'grid_attack':
            newState = executeGridAttack(state, action, grid);
            break;
        case 'grid_defend':
            newState = executeGridDefend(state, action);
            break;
        case 'grid_flee':
            newState = executeGridFlee(state, action as GridFleeAction);
            break;
        case 'grid_end_turn':
            newState = executeEndTurn(state);
            break;
        default:
            newState = state;
    }

    // Extract and clear pending events
    const events = [...newState.pendingEvents];
    newState = { ...newState, pendingEvents: [] };

    return { state: newState, events };
}

// =============================================================================
// Action Execution
// =============================================================================

/**
 * Execute grid movement along a path.
 * Cost: 1 AP per tile (2 for difficult terrain)
 */
function executeGridMove(
    state: GridCombatState,
    action: GridMoveAction,
    grid: CombatGrid
): GridCombatState {
    const actor = state.combatants[action.actorId];
    if (!actor || actor.isKnockedOut) return state;

    const { path } = action;
    if (path.length < 2) return state;

    // Validate path starts at actor position
    const start = path[0];
    if (start.x !== actor.position.x || start.y !== actor.position.y) {
        return state;
    }

    // Calculate path cost
    let totalCost = 0;
    for (let i = 1; i < path.length; i++) {
        const tile = grid.tiles[path[i].y]?.[path[i].x];
        const tileCost = tile?.terrainType === 'difficult' ? 2 : 1;
        totalCost += tileCost;
    }

    // Check AP
    if (totalCost > actor.apRemaining) return state;

    // Execute move
    const destination = path[path.length - 1];
    const updatedActor: GridCombatant = {
        ...actor,
        position: destination,
        apRemaining: actor.apRemaining - totalCost,
        // Update facing based on movement direction
        facing: getFacing(path[path.length - 2], destination),
    };

    const logEntry: CombatLogEntry = {
        id: generateUUID(),
        turn: state.turn,
        actorId: actor.id,
        actorName: actor.name,
        actionType: 'move',
        result: {},
        mechanicalText: `${actor.name} moves ${path.length - 1} tiles.`,
    };

    const moveEvent: CombatEvent = {
        type: 'move_completed',
        turn: state.turn,
        actorId: actor.id,
        data: {
            actorName: actor.name,
            path,
            apSpent: totalCost,
        },
    };

    let newState: GridCombatState = {
        ...state,
        combatants: {
            ...state.combatants,
            [actor.id]: updatedActor,
        },
        log: [...state.log, logEntry],
        pendingEvents: [...state.pendingEvents, moveEvent],
    };

    // Check if AP exhausted - auto end turn
    if (updatedActor.apRemaining === 0) {
        newState = advanceToNextTurn(newState);
    }

    return newState;
}

/**
 * Execute grid attack on target.
 * Cost: 2 AP, ends turn
 */
function executeGridAttack(
    state: GridCombatState,
    action: GridAttackAction,
    grid: CombatGrid
): GridCombatState {
    const actor = state.combatants[action.actorId];
    const target = state.combatants[action.targetId];

    if (!actor || !target || actor.isKnockedOut || target.isKnockedOut) {
        return state;
    }

    if (actor.apRemaining < GRID_AP_COSTS.attack) {
        return state;
    }

    // Validate range
    const distance = calculateDistance(actor.position, target.position);
    if (distance > actor.attackRange) {
        return state;
    }

    // Validate LOS for ranged attacks
    if (actor.attackRange > 1 && !hasLineOfSight(actor.position, target.position, grid)) {
        return state;
    }

    // Roll to hit
    const attackRoll = rollD20();
    const attackBonus = Math.floor(actor.level / 2);

    // Flanking bonus
    const allies = Object.values(state.combatants).filter(
        c => c.isPlayerControlled === actor.isPlayerControlled && !c.isKnockedOut
    );
    const combatEntities: CombatEntity[] = allies.map(c => ({
        id: c.id,
        position: c.position,
        allegiance: c.isPlayerControlled ? 'player' : 'enemy',
        isKnockedOut: c.isKnockedOut,
    }));
    const targetEntity: CombatEntity = {
        id: target.id,
        position: target.position,
        allegiance: target.isPlayerControlled ? 'player' : 'enemy',
        isKnockedOut: target.isKnockedOut,
    };
    const actorEntity: CombatEntity = {
        id: actor.id,
        position: actor.position,
        allegiance: actor.isPlayerControlled ? 'player' : 'enemy',
        isKnockedOut: actor.isKnockedOut,
    };

    const flankingBonus = checkFlanking(actorEntity, targetEntity, combatEntities) ? 2 : 0;

    const totalAttack = attackRoll + attackBonus + flankingBonus;
    const targetDefense = target.defense + (target.isDefending ? 3 : 0);
    const hit = totalAttack >= targetDefense;

    // Calculate damage
    let rawDamage = 0;
    let finalDamage = 0;
    let hitQuality: HitQuality = 'miss';

    if (hit) {
        const variance = rollDamageVariance();
        rawDamage = Math.max(1, actor.damage + variance);
        finalDamage = Math.max(1, rawDamage - target.armor);
        hitQuality = calculateHitQuality(totalAttack, targetDefense, rawDamage, finalDamage);
    }

    // Apply damage
    const newTargetHp = Math.max(0, target.currentHp - finalDamage);
    const isKillingBlow = hit && newTargetHp === 0;

    // Determine death vs incapacitation for defeated combatants
    // Allies (isPlayerControlled=true) ALWAYS get incapacitated, never killed
    // Enemies roll for death vs incapacitation (70% incap, 30% death)
    let deathOutcome: 'incapacitated' | 'dead' | null = null;
    if (isKillingBlow) {
        if (target.isPlayerControlled) {
            // Bonded allies cannot permanently die - always incapacitate
            deathOutcome = 'incapacitated';
        } else {
            // Roll for death vs incapacitation (70% incapacitated, 30% dead)
            deathOutcome = rollDeathOrIncapacitation();
        }
    }

    const updatedActor: GridCombatant = {
        ...actor,
        apRemaining: 0, // Attack ends turn
        facing: getFacing(actor.position, target.position),
    };

    const updatedTarget: GridCombatant = {
        ...target,
        currentHp: newTargetHp,
        isKnockedOut: newTargetHp === 0,
        isIncapacitated: deathOutcome === 'incapacitated',
        isDead: deathOutcome === 'dead',
        recentDamage: hit ? finalDamage : null,
    };

    // Log and events
    const mechanicalText = hit
        ? `${actor.name} ${actor.attackRange > 1 ? 'shoots' : 'strikes'} ${target.name} for ${finalDamage} damage!`
        : `${actor.name}'s attack misses ${target.name}!`;

    const logEntry: CombatLogEntry = {
        id: generateUUID(),
        turn: state.turn,
        actorId: actor.id,
        actorName: actor.name,
        actionType: 'attack',
        targetId: target.id,
        targetName: target.name,
        result: {
            hit,
            damage: finalDamage,
            hitQuality,
            special: isKillingBlow ? 'killing_blow' : undefined,
        },
        mechanicalText,
    };

    const events: CombatEvent[] = [
        {
            type: 'attack_resolved',
            turn: state.turn,
            actorId: actor.id,
            targetId: target.id,
            data: {
                attackRoll: totalAttack,
                targetDefense,
                rawDamage,
                finalDamage,
                hitQuality,
                isKillingBlow,
                flanking: flankingBonus > 0,
                actorName: actor.name,
                targetName: target.name,
            },
        },
    ];

    if (isKillingBlow) {
        events.push({
            type: 'character_defeated',
            turn: state.turn,
            actorId: actor.id,
            targetId: target.id,
            data: {
                defeatedName: target.name,
                defeatedIsEnemy: !target.isPlayerControlled,
                killerName: actor.name,
                deathOutcome: deathOutcome, // 'incapacitated' or 'dead' for enemies
            },
        });
    }

    let newState: GridCombatState = {
        ...state,
        combatants: {
            ...state.combatants,
            [actor.id]: updatedActor,
            [target.id]: updatedTarget,
        },
        log: [...state.log, logEntry],
        pendingEvents: [...state.pendingEvents, ...events],
    };

    // Check victory/defeat
    const endResult = checkCombatEnd(newState);
    if (endResult) {
        return endResult;
    }

    // Advance turn (attack ends turn)
    return advanceToNextTurn(newState);
}

/**
 * Execute defend action.
 * Cost: 1 AP, grants +3 defense until next turn
 */
function executeGridDefend(
    state: GridCombatState,
    action: GridDefendAction
): GridCombatState {
    const actor = state.combatants[action.actorId];
    if (!actor || actor.isKnockedOut) return state;

    if (actor.apRemaining < GRID_AP_COSTS.defend) {
        return state;
    }

    const updatedActor: GridCombatant = {
        ...actor,
        apRemaining: actor.apRemaining - GRID_AP_COSTS.defend,
        isDefending: true,
    };

    const logEntry: CombatLogEntry = {
        id: generateUUID(),
        turn: state.turn,
        actorId: actor.id,
        actorName: actor.name,
        actionType: 'defend',
        result: {},
        mechanicalText: `${actor.name} takes a defensive stance (+3 defense).`,
    };

    const event: CombatEvent = {
        type: 'defend_activated',
        turn: state.turn,
        actorId: actor.id,
        data: { actorName: actor.name },
    };

    let newState: GridCombatState = {
        ...state,
        combatants: {
            ...state.combatants,
            [actor.id]: {
                ...updatedActor,
                apRemaining: 0, // Defend always ends turn - no banked AP
            },
        },
        log: [...state.log, logEntry],
        pendingEvents: [...state.pendingEvents, event],
    };

    // Defend always ends the turn
    newState = advanceToNextTurn(newState);

    return newState;
}

/**
 * Attempt to flee from combat.
 * Roll: d20 + floor(speed / 5) >= 12 for success
 * On fail: lose turn, log message
 * On success: end combat with 'fled' outcome
 */
function executeGridFlee(
    state: GridCombatState,
    action: GridFleeAction
): GridCombatState {
    const actor = state.combatants[action.actorId];
    if (!actor || actor.isKnockedOut) return state;

    // Only player can flee
    if (!actor.isPlayer) return state;

    // Roll for flee: d20 + floor(speed / 5) >= 12
    const fleeRoll = rollD20();
    const speedBonus = Math.floor(actor.speed / 5);
    const totalRoll = fleeRoll + speedBonus;
    const success = totalRoll >= 12;

    if (success) {
        // Successful flee - end combat
        const logEntry: CombatLogEntry = {
            id: generateUUID(),
            turn: state.turn,
            actorId: actor.id,
            actorName: actor.name,
            actionType: 'flee',
            result: {
                special: 'fled',
            },
            mechanicalText: `${actor.name} successfully flees from combat! (rolled ${fleeRoll} + ${speedBonus} = ${totalRoll} vs DC 12)`,
        };

        const fleeEvent: CombatEvent = {
            type: 'flee_attempted',
            turn: state.turn,
            actorId: actor.id,
            data: {
                actorName: actor.name,
                success: true,
                roll: fleeRoll,
                speedBonus,
                total: totalRoll,
            },
        };

        // Get surviving allies for the result
        const survivingAllies = Object.values(state.combatants)
            .filter(c => c.isPlayerControlled && !c.isKnockedOut)
            .map(c => c.id);

        return {
            ...state,
            phase: 'victory', // Use victory phase for fled (shows end screen)
            log: [...state.log, logEntry],
            pendingEvents: [...state.pendingEvents, fleeEvent],
            result: {
                outcome: 'fled',
                survivingAllies,
                defeatedEnemies: [],
                // No rewards for fleeing
            },
        };
    } else {
        // Failed flee - lose turn
        const logEntry: CombatLogEntry = {
            id: generateUUID(),
            turn: state.turn,
            actorId: actor.id,
            actorName: actor.name,
            actionType: 'flee',
            result: {
                special: 'fled_failed',
            },
            mechanicalText: `${actor.name} fails to flee! (rolled ${fleeRoll} + ${speedBonus} = ${totalRoll} vs DC 12)`,
        };

        const fleeEvent: CombatEvent = {
            type: 'flee_attempted',
            turn: state.turn,
            actorId: actor.id,
            data: {
                actorName: actor.name,
                success: false,
                roll: fleeRoll,
                speedBonus,
                total: totalRoll,
            },
        };

        // Set AP to 0 and advance turn
        const updatedActor: GridCombatant = {
            ...actor,
            apRemaining: 0,
        };

        let newState: GridCombatState = {
            ...state,
            combatants: {
                ...state.combatants,
                [actor.id]: updatedActor,
            },
            log: [...state.log, logEntry],
            pendingEvents: [...state.pendingEvents, fleeEvent],
        };

        return advanceToNextTurn(newState);
    }
}

/**
 * End turn early (pass remaining AP).
 */
function executeEndTurn(state: GridCombatState): GridCombatState {
    return advanceToNextTurn(state);
}

// =============================================================================
// Turn Management
// =============================================================================

/**
 * Advance to the next combatant's turn.
 */
function advanceToNextTurn(state: GridCombatState): GridCombatState {
    let nextIndex = state.currentTurnIndex + 1;
    let nextTurn = state.turn;

    // Wrap to next round
    if (nextIndex >= state.initiativeOrder.length) {
        nextIndex = 0;
        nextTurn = state.turn + 1;
    }

    // Find next non-KO'd combatant
    let attempts = 0;
    while (attempts < state.initiativeOrder.length) {
        const nextId = state.initiativeOrder[nextIndex];
        const nextCombatant = state.combatants[nextId];

        if (nextCombatant && !nextCombatant.isKnockedOut) {
            break;
        }

        nextIndex = (nextIndex + 1) % state.initiativeOrder.length;
        if (nextIndex === 0) {
            nextTurn++;
        }
        attempts++;
    }

    const nextId = state.initiativeOrder[nextIndex];
    const nextCombatant = state.combatants[nextId];

    if (!nextCombatant) {
        return state;
    }

    // Reset AP and clear defend for next combatant
    const updatedCombatant: GridCombatant = {
        ...nextCombatant,
        apRemaining: 4,
        isDefending: false,
        recentDamage: null,
        recentHeal: null,
    };

    const turnEvent: CombatEvent = {
        type: 'turn_start',
        turn: nextTurn,
        actorId: nextId,
        data: {
            actorName: nextCombatant.name,
            isPlayerControlled: nextCombatant.isPlayerControlled,
        },
    };

    return {
        ...state,
        turn: nextTurn,
        currentTurnIndex: nextIndex,
        phase: nextCombatant.isPlayerControlled ? 'awaiting_input' : 'resolving',
        combatants: {
            ...state.combatants,
            [nextId]: updatedCombatant,
        },
        pendingEvents: [...state.pendingEvents, turnEvent],
    };
}

/**
 * Check for victory or defeat.
 * On victory, automatically revives incapacitated allies at 25% HP.
 */
function checkCombatEnd(state: GridCombatState): GridCombatState | null {
    const playerSideAlive = Object.values(state.combatants).some(
        c => c.isPlayerControlled && !c.isKnockedOut
    );
    const enemySideAlive = Object.values(state.combatants).some(
        c => !c.isPlayerControlled && !c.isKnockedOut
    );

    if (!enemySideAlive) {
        // Victory - revive incapacitated allies at 25% HP
        const enemies = Object.values(state.combatants).filter(c => !c.isPlayerControlled);

        // Calculate XP: killed enemies give level * 10, incapacitated give level * 5
        const xpReward = enemies.reduce((sum, e) => {
            if (e.isDead) {
                return sum + e.level * 10;  // Full XP for kills
            } else {
                return sum + e.level * 5;   // Half XP for incapacitation
            }
        }, 0);

        // Calculate gold: level * 5 per enemy
        const goldReward = enemies.reduce((sum, e) => sum + e.level * 5, 0);

        // Find incapacitated player-side combatants to revive (includes THE player)
        const incapacitatedPlayerSide = Object.values(state.combatants).filter(
            c => c.isPlayerControlled && c.isKnockedOut && c.isIncapacitated
        );

        // Find the player specifically and allies separately
        const incapacitatedPlayer = incapacitatedPlayerSide.find(c => c.isPlayer);
        const incapacitatedAllies = incapacitatedPlayerSide.filter(c => !c.isPlayer);

        // Find the ally who "carried" the fight (last ally standing who will revive the player)
        // This is the ally who was NOT knocked out when victory triggered
        const carryingAlly = Object.values(state.combatants).find(
            c => c.isPlayerControlled && !c.isPlayer && !c.isKnockedOut
        );

        // Revive all incapacitated player-side combatants - restore to 25% HP
        const revivedCombatants = { ...state.combatants };
        const revivedAllyIds: string[] = [];
        const revivalEvents: CombatEvent[] = [];
        let revivedPlayer = false;
        let revivedByAllyId: string | undefined = undefined;

        // Revive the player first if they were knocked out
        if (incapacitatedPlayer) {
            const revivedHp = Math.max(1, Math.floor(incapacitatedPlayer.maxHp * 0.25));
            revivedCombatants[incapacitatedPlayer.id] = {
                ...incapacitatedPlayer,
                currentHp: revivedHp,
                isKnockedOut: false,
                isIncapacitated: false,
            };
            revivedPlayer = true;
            revivedByAllyId = carryingAlly?.id;

            // Add player revival event
            revivalEvents.push({
                type: 'player_revived' as CombatEventType,
                turn: state.turn,
                actorId: carryingAlly?.id,
                targetId: incapacitatedPlayer.id,
                data: {
                    playerName: incapacitatedPlayer.name,
                    revivedByAllyName: carryingAlly?.name,
                    revivedHp,
                    maxHp: incapacitatedPlayer.maxHp,
                },
            });
        }

        // Revive allies
        for (const ally of incapacitatedAllies) {
            const revivedHp = Math.max(1, Math.floor(ally.maxHp * 0.25));
            revivedCombatants[ally.id] = {
                ...ally,
                currentHp: revivedHp,
                isKnockedOut: false,
                isIncapacitated: false,
            };
            revivedAllyIds.push(ally.id);

            // Add revival event
            revivalEvents.push({
                type: 'ally_revived' as CombatEventType,
                turn: state.turn,
                actorId: ally.id,
                data: {
                    allyName: ally.name,
                    revivedHp,
                    maxHp: ally.maxHp,
                },
            });
        }

        // Surviving allies = those never knocked out + revived ones
        const survivingAllies = Object.values(revivedCombatants)
            .filter(c => c.isPlayerControlled && !c.isKnockedOut)
            .map(c => c.id);

        return {
            ...state,
            combatants: revivedCombatants,
            phase: 'victory',
            result: {
                outcome: 'victory',
                rewards: { xp: xpReward, gold: goldReward, items: [] },
                survivingAllies,
                defeatedEnemies: enemies.map(e => e.id),
                revivedAllies: revivedAllyIds, // Track which allies were revived
                revivedPlayer,                 // Track if THE player was revived by ally
                revivedByAllyId,               // Track which ally revived the player
            },
            pendingEvents: [
                ...state.pendingEvents,
                ...revivalEvents,
                {
                    type: 'combat_victory',
                    turn: state.turn,
                    data: {
                        turnsTotal: state.turn,
                        xpReward,
                        revivedAllies: revivedAllyIds,
                        revivedPlayer,
                        revivedByAllyId,
                    },
                },
            ],
        };
    }

    if (!playerSideAlive) {
        // Defeat
        return {
            ...state,
            phase: 'defeat',
            result: {
                outcome: 'defeat',
                survivingAllies: [],
                defeatedEnemies: Object.values(state.combatants)
                    .filter(c => !c.isPlayerControlled && c.isKnockedOut)
                    .map(c => c.id),
            },
            pendingEvents: [
                ...state.pendingEvents,
                {
                    type: 'combat_defeat',
                    turn: state.turn,
                    data: { turnsTotal: state.turn },
                },
            ],
        };
    }

    return null;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get facing direction from movement.
 */
function getFacing(from: TilePosition, to: TilePosition): 'north' | 'south' | 'east' | 'west' {
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? 'east' : 'west';
    }
    return dy > 0 ? 'south' : 'north';
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Get the current turn combatant.
 */
export function getCurrentCombatant(state: GridCombatState): GridCombatant | null {
    const id = state.initiativeOrder[state.currentTurnIndex];
    return state.combatants[id] ?? null;
}

/**
 * Check if an action is valid for the current combatant.
 */
export function canPerformAction(
    state: GridCombatState,
    actionType: GridCombatAction['type']
): boolean {
    const actor = getCurrentCombatant(state);
    if (!actor || actor.isKnockedOut) return false;

    switch (actionType) {
        case 'grid_move':
            return actor.apRemaining >= 1;
        case 'grid_attack':
            return actor.apRemaining >= GRID_AP_COSTS.attack;
        case 'grid_defend':
            return actor.apRemaining >= GRID_AP_COSTS.defend && !actor.isDefending;
        case 'grid_end_turn':
            return true;
        default:
            return false;
    }
}

/**
 * Get enemies of a combatant.
 */
export function getEnemies(state: GridCombatState, combatantId: string): GridCombatant[] {
    const combatant = state.combatants[combatantId];
    if (!combatant) return [];

    return Object.values(state.combatants).filter(
        c => c.isPlayerControlled !== combatant.isPlayerControlled && !c.isKnockedOut
    );
}

/**
 * Get allies of a combatant (including self).
 */
export function getAllies(state: GridCombatState, combatantId: string): GridCombatant[] {
    const combatant = state.combatants[combatantId];
    if (!combatant) return [];

    return Object.values(state.combatants).filter(
        c => c.isPlayerControlled === combatant.isPlayerControlled && !c.isKnockedOut
    );
}
