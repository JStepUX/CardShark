/**
 * @file combatMapSync.ts
 * @description Synchronization service between LocalMapState and GridCombatState.
 *
 * This service bridges the exploration local map system with the grid combat system:
 * - Converts LocalMapEntities to GridCombatants when combat starts
 * - Syncs combatant positions back to LocalMapState after combat actions
 * - Maps between different allegiance systems
 *
 * The LocalMapState remains the source of truth for terrain and room layout.
 * GridCombatState owns combatant positions during combat.
 */

import {
    LocalMapState,
    LocalMapEntity,
    TilePosition,
    Allegiance,
} from '../../types/localMap';
import { calculateThreatZones } from '../../utils/localMapUtils';
import {
    GridCombatant,
    GridCombatState,
    CombatPhase,
    createGridCombatant,
} from '../../types/combat';
import { toCombatAllegiance, CombatAllegiance } from '../../utils/gridCombatUtils';
import type { CharacterInventory } from '../../types/inventory';
import { getEquippedWeaponType, getEquippedWeaponDamage } from '../../types/inventory';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for combat initialization
 */
export interface CombatInitOptions {
    /** Starting phase (default: initiative) */
    startPhase?: CombatPhase;
    /** Whether player has initiative advantage */
    playerAdvantage?: boolean;
    /** Player's inventory (affects weapon type and damage) */
    playerInventory?: CharacterInventory;
    /** Ally's inventory (affects weapon type and damage) */
    allyInventory?: CharacterInventory;
}

/**
 * Result of syncing positions back to map
 */
export interface SyncResult {
    updatedEntities: LocalMapEntity[];
    removedEntityIds: string[];  // Entities that were defeated
}

// =============================================================================
// Allegiance Mapping
// =============================================================================

/**
 * Determine if a LocalMapEntity should participate in combat.
 * Only player, bonded companion, and hostile NPCs fight.
 * Friendly/neutral NPCs must be bonded first to join combat.
 */
export function shouldParticipateInCombat(entity: LocalMapEntity): boolean {
    switch (entity.allegiance) {
        case 'player':
        case 'bonded_ally':
        case 'hostile':
            return true;
        case 'friendly':  // Must be bonded to join combat
        case 'neutral':
        case 'captured':
            return false;
    }
}

/**
 * Map LocalMapEntity allegiance to combat allegiance.
 * Extends the utility function with context about the player entity.
 */
export function mapAllegiance(
    allegiance: Allegiance,
    isPlayer: boolean
): CombatAllegiance {
    if (isPlayer) return 'player';
    return toCombatAllegiance(allegiance);
}

// =============================================================================
// Combat Initialization
// =============================================================================

/**
 * Convert a LocalMapEntity to a GridCombatant.
 *
 * @param entity - The entity to convert
 * @param isPlayer - Whether this is the player character
 * @param inventory - Optional inventory for determining weapon type and bonus damage
 */
export function entityToCombatant(
    entity: LocalMapEntity,
    isPlayer: boolean = false,
    inventory?: CharacterInventory
): GridCombatant {
    const combatAllegiance = mapAllegiance(entity.allegiance, isPlayer);

    // Determine weapon type from inventory if available, otherwise use heuristic
    let weaponType: 'melee' | 'ranged';
    let bonusDamage = 0;

    if (inventory) {
        // Use equipped weapon from inventory
        weaponType = getEquippedWeaponType(inventory);
        bonusDamage = getEquippedWeaponDamage(inventory);
    } else {
        // Fallback: higher level enemies more likely to be ranged
        weaponType = entity.level > 20 && Math.random() > 0.7 ? 'ranged' : 'melee';
    }

    // isPlayerControlled = true for player's team (used for targeting)
    // isPlayer = true only for the actual player character (used for input control)
    const isOnPlayerTeam = combatAllegiance === 'player' || combatAllegiance === 'ally';

    const combatant = createGridCombatant(
        entity.id,
        entity.name,
        entity.level,
        entity.imagePath,
        isOnPlayerTeam, // isPlayerControlled = on player's team
        isPlayer,
        entity.position,
        weaponType
    );

    // Apply bonus damage from equipped weapon
    if (bonusDamage > 0) {
        combatant.damage += bonusDamage;
    }

    return combatant;
}

/**
 * Initialize GridCombatState from LocalMapState.
 *
 * @param mapState - Current local map state
 * @param playerId - ID of the player entity
 * @param options - Combat initialization options
 * @returns Initialized grid combat state
 *
 * @example
 * const combatState = initializeCombatFromMap(mapState, 'player-123');
 */
export function initializeCombatFromMap(
    mapState: LocalMapState,
    playerId: string,
    options: CombatInitOptions = {}
): GridCombatState {
    const {
        startPhase = 'initiative',
        playerAdvantage = false,
        playerInventory,
        allyInventory,
    } = options;

    // Convert participating entities to combatants
    const combatants: Record<string, GridCombatant> = {};
    const playerSide: string[] = [];
    const enemySide: string[] = [];

    for (const entity of mapState.entities) {
        if (!shouldParticipateInCombat(entity)) continue;

        const isPlayer = entity.id === playerId;

        // Determine which inventory to use
        let inventory: CharacterInventory | undefined;
        if (isPlayer && playerInventory) {
            inventory = playerInventory;
        } else if (entity.allegiance === 'bonded_ally' && allyInventory) {
            inventory = allyInventory;
        }

        const combatant = entityToCombatant(entity, isPlayer, inventory);
        combatants[combatant.id] = combatant;

        if (combatant.isPlayerControlled || toCombatAllegiance(entity.allegiance) === 'ally') {
            playerSide.push(combatant.id);
        } else {
            enemySide.push(combatant.id);
        }
    }

    // Roll initiative
    const initiativeOrder = rollInitiative(
        combatants,
        playerAdvantage,
        playerSide,
        enemySide
    );

    return {
        phase: startPhase,
        turn: 1,
        combatants,
        initiativeOrder,
        currentTurnIndex: 0,
        markedTargets: [],
        log: [],
        pendingEvents: [],
        mapRoomId: mapState.roomId,
        validMoveTargets: [],
        validAttackTargets: [],
        activeOverwatchZones: [],
    };
}

/**
 * Roll initiative and determine turn order.
 * Uses combatant speed with a random element.
 */
function rollInitiative(
    combatants: Record<string, GridCombatant>,
    playerAdvantage: boolean,
    playerSide: string[],
    _enemySide: string[]
): string[] {
    const entries = Object.entries(combatants);

    // Calculate initiative score: speed + d6
    const initiatives = entries.map(([id, combatant]) => {
        const roll = Math.floor(Math.random() * 6) + 1;
        let score = combatant.speed + roll;

        // Player advantage: +3 to initiative for player side
        if (playerAdvantage && playerSide.includes(id)) {
            score += 3;
        }

        return { id, score };
    });

    // Sort by initiative (highest first)
    initiatives.sort((a, b) => b.score - a.score);

    return initiatives.map(i => i.id);
}

// =============================================================================
// Position Synchronization
// =============================================================================

/**
 * Sync combatant positions back to LocalMapState.
 * Call this after combat actions that involve movement.
 *
 * @param combatState - Current grid combat state
 * @param mapState - Local map state to update
 * @returns Updated local map state
 */
export function syncPositionsToMap(
    combatState: GridCombatState,
    mapState: LocalMapState
): LocalMapState {
    const updatedEntities = mapState.entities.map(entity => {
        const combatant = combatState.combatants[entity.id];
        if (!combatant) return entity;

        // Update position from combat state
        return {
            ...entity,
            position: combatant.position,
            currentHp: combatant.currentHp,
            maxHp: combatant.maxHp,
        };
    });

    // Update player position
    const playerCombatant = Object.values(combatState.combatants).find(c => c.isPlayer);
    const playerPosition = playerCombatant?.position ?? mapState.playerPosition;

    return {
        ...mapState,
        entities: updatedEntities,
        playerPosition,
        inCombat: combatState.phase !== 'victory' && combatState.phase !== 'defeat',
    };
}

/**
 * Result of entity cleanup after combat, separating dead and incapacitated.
 */
export interface CleanupResult {
    updatedMapState: LocalMapState;
    deadEntityIds: string[];
    incapacitatedEntityIds: string[];
    revivedAllyIds: string[];
}

/**
 * Process defeated entities after combat.
 * - Dead ENEMIES are removed from the map
 * - Incapacitated ENEMIES remain but are marked as non-interactive
 * - Incapacitated ALLIES are auto-revived on victory (already handled in combat engine)
 * - Revived allies have their HP restored and flags cleared
 *
 * @param combatState - Final combat state
 * @param mapState - Local map state to clean up
 * @returns CleanupResult with updated map and categorized entity IDs
 */
export function cleanupDefeatedEntities(
    combatState: GridCombatState,
    mapState: LocalMapState
): CleanupResult {
    const deadIds: string[] = [];
    const incapacitatedIds: string[] = [];
    const revivedAllyIds: string[] = [];

    for (const [id, combatant] of Object.entries(combatState.combatants)) {
        // Skip the player
        if (combatant.isPlayer) continue;

        if (combatant.isPlayerControlled) {
            // Allies - check if they were revived (HP > 0 after being incapacitated)
            // The combat engine already revived them, so just sync their status
            if (!combatant.isKnockedOut && combatant.currentHp > 0) {
                // Check if this ally was previously knocked out by looking at result
                const wasRevived = combatState.result?.revivedAllies?.includes(id);
                if (wasRevived) {
                    revivedAllyIds.push(id);
                }
            }
        } else {
            // Enemies
            if (combatant.isKnockedOut) {
                if (combatant.isDead) {
                    deadIds.push(id);
                } else if (combatant.isIncapacitated) {
                    incapacitatedIds.push(id);
                } else {
                    // Fallback for backward compatibility - treat as incapacitated
                    incapacitatedIds.push(id);
                }
            }
        }
    }

    // Update entities:
    // - Remove dead enemies
    // - Mark incapacitated enemies
    // - Update revived allies with restored HP
    const updatedEntities = mapState.entities
        .filter(e => !deadIds.includes(e.id))
        .map(e => {
            // Handle incapacitated enemies
            if (incapacitatedIds.includes(e.id)) {
                return { ...e, isIncapacitated: true };
            }

            // Handle revived allies - restore their HP from combat state
            if (revivedAllyIds.includes(e.id)) {
                const combatant = combatState.combatants[e.id];
                return {
                    ...e,
                    isIncapacitated: false,
                    currentHp: combatant?.currentHp ?? e.currentHp,
                    maxHp: combatant?.maxHp ?? e.maxHp,
                };
            }

            // Sync HP for any entity that participated in combat
            const combatant = combatState.combatants[e.id];
            if (combatant) {
                return {
                    ...e,
                    currentHp: combatant.currentHp,
                    maxHp: combatant.maxHp,
                };
            }

            return e;
        });

    // Recalculate threat zones based on remaining hostile entities
    const updatedThreatZones = calculateThreatZones(updatedEntities, mapState.config);

    return {
        updatedMapState: {
            ...mapState,
            entities: updatedEntities,
            threatZones: updatedThreatZones,
        },
        deadEntityIds: deadIds,
        incapacitatedEntityIds: incapacitatedIds,
        revivedAllyIds,
    };
}

// =============================================================================
// Combat State Updates
// =============================================================================

/**
 * Update combatant position after a move action.
 *
 * @param state - Current combat state
 * @param combatantId - ID of moving combatant
 * @param newPosition - Destination position
 * @param apCost - AP spent on movement
 * @returns Updated combat state
 */
export function updateCombatantPosition(
    state: GridCombatState,
    combatantId: string,
    newPosition: TilePosition,
    apCost: number
): GridCombatState {
    const combatant = state.combatants[combatantId];
    if (!combatant) return state;

    return {
        ...state,
        combatants: {
            ...state.combatants,
            [combatantId]: {
                ...combatant,
                position: newPosition,
                apRemaining: combatant.apRemaining - apCost,
            },
        },
    };
}

/**
 * Get all enemy combatants relative to a given combatant.
 */
export function getEnemyCombatants(
    state: GridCombatState,
    combatantId: string
): GridCombatant[] {
    const combatant = state.combatants[combatantId];
    if (!combatant) return [];

    const isPlayerSide = combatant.isPlayerControlled;

    return Object.values(state.combatants).filter(c => {
        if (c.isKnockedOut) return false;
        if (c.id === combatantId) return false;
        return c.isPlayerControlled !== isPlayerSide;
    });
}

/**
 * Get all allied combatants (including self) relative to a given combatant.
 */
export function getAlliedCombatants(
    state: GridCombatState,
    combatantId: string
): GridCombatant[] {
    const combatant = state.combatants[combatantId];
    if (!combatant) return [];

    const isPlayerSide = combatant.isPlayerControlled;

    return Object.values(state.combatants).filter(c => {
        if (c.isKnockedOut) return false;
        return c.isPlayerControlled === isPlayerSide;
    });
}

/**
 * Get the current turn combatant.
 */
export function getCurrentTurnCombatant(state: GridCombatState): GridCombatant | null {
    const id = state.initiativeOrder[state.currentTurnIndex];
    return state.combatants[id] ?? null;
}

/**
 * Advance to the next turn.
 */
export function advanceTurn(state: GridCombatState): GridCombatState {
    const nextIndex = (state.currentTurnIndex + 1) % state.initiativeOrder.length;
    const isNewRound = nextIndex === 0;

    // Reset AP for next combatant
    const nextCombatantId = state.initiativeOrder[nextIndex];
    const nextCombatant = state.combatants[nextCombatantId];

    // Skip knocked out combatants
    if (nextCombatant?.isKnockedOut) {
        return advanceTurn({
            ...state,
            currentTurnIndex: nextIndex,
            turn: isNewRound ? state.turn + 1 : state.turn,
        });
    }

    return {
        ...state,
        currentTurnIndex: nextIndex,
        turn: isNewRound ? state.turn + 1 : state.turn,
        phase: 'turn_start',
        combatants: nextCombatant ? {
            ...state.combatants,
            [nextCombatantId]: {
                ...nextCombatant,
                apRemaining: 4, // Reset AP
                isDefending: false, // Clear defend at turn start
            },
        } : state.combatants,
    };
}

/**
 * Check victory/defeat conditions.
 */
export function checkCombatEnd(state: GridCombatState): 'victory' | 'defeat' | null {
    const playerSideAlive = Object.values(state.combatants).some(
        c => c.isPlayerControlled && !c.isKnockedOut
    );
    const enemySideAlive = Object.values(state.combatants).some(
        c => !c.isPlayerControlled && !c.isKnockedOut
    );

    if (!playerSideAlive) return 'defeat';
    if (!enemySideAlive) return 'victory';
    return null;
}
