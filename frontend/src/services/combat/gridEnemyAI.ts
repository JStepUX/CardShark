/**
 * @file gridEnemyAI.ts
 * @description Enemy AI for grid-based tactical combat.
 *
 * AI Decision Priority:
 * 1. If in attack range of target: Attack
 * 2. If can reach attack range: Move then Attack
 * 3. If can move closer: Move toward nearest enemy
 * 4. Else: Defend or End Turn
 *
 * Targeting Priority:
 * 1. Lowest HP enemy (finish off wounded)
 * 2. Closest enemy (minimize movement)
 * 3. Highest threat (player > allies)
 */

import {
    GridCombatant,
    GridCombatState,
    GridCombatAction,
    GridMoveAction,
    GRID_AP_COSTS,
} from '../../types/combat';
import { TilePosition } from '../../types/localMap';
import { findPath, getReachableTiles, PathfindingGrid } from '../../utils/pathfinding';
import {
    calculateDistance,
    hasLineOfSight,
    CombatGrid,
} from '../../utils/gridCombatUtils';

// =============================================================================
// Types
// =============================================================================

interface AIDecision {
    actions: GridCombatAction[];
    reasoning: string;
}

interface TargetScore {
    target: GridCombatant;
    score: number;
    distance: number;
}

// =============================================================================
// Main AI Entry Point
// =============================================================================

/**
 * Calculate threat map from combat log.
 * Returns a map of enemy ID -> total damage dealt to this actor.
 * This allows enemies to "remember" who has been attacking them and prioritize those targets.
 */
function calculateThreatMap(state: GridCombatState, actorId: string): Map<string, number> {
    const threatMap = new Map<string, number>();

    // Look through combat log for attacks that hit this actor
    for (const entry of state.log) {
        // Only consider attacks that targeted this actor
        if (entry.targetId !== actorId) continue;
        if (entry.actionType !== 'attack') continue;
        if (!entry.result.hit) continue;

        const damage = entry.result.damage ?? 0;
        if (damage > 0) {
            const attackerId = entry.actorId;
            const currentThreat = threatMap.get(attackerId) ?? 0;
            threatMap.set(attackerId, currentThreat + damage);
        }
    }

    return threatMap;
}

/**
 * Decide actions for an AI-controlled combatant.
 *
 * @param state - Current combat state
 * @param combatantId - ID of the AI combatant
 * @param grid - Combat grid for pathfinding/LOS
 * @returns Array of actions to execute (may be multiple: move + attack)
 */
export function decideAIActions(
    state: GridCombatState,
    combatantId: string,
    grid: CombatGrid
): AIDecision {
    const actor = state.combatants[combatantId];
    // AI runs for any non-player combatant (enemies AND allies)
    // Only the actual player (isPlayer=true) should not get AI actions
    if (!actor || actor.isKnockedOut || actor.isPlayer) {
        return { actions: [], reasoning: 'Invalid actor' };
    }

    const enemies = getEnemyTargets(state, combatantId);
    if (enemies.length === 0) {
        return {
            actions: [{ type: 'grid_end_turn', actorId: combatantId }],
            reasoning: 'No enemies remaining',
        };
    }

    // Calculate threat map: who has been dealing damage to this actor?
    const threatMap = calculateThreatMap(state, combatantId);

    // Score and prioritize targets
    const scoredTargets = scoreTargets(actor, enemies, grid, threatMap);
    const primaryTarget = scoredTargets[0]?.target;

    if (!primaryTarget) {
        return {
            actions: [{ type: 'grid_end_turn', actorId: combatantId }],
            reasoning: 'No valid targets',
        };
    }

    const actions: GridCombatAction[] = [];
    let currentAP = actor.apRemaining;
    let currentPosition = actor.position;

    // Check if we can attack from current position
    const distanceToTarget = calculateDistance(currentPosition, primaryTarget.position);
    const canAttackNow = distanceToTarget <= actor.attackRange &&
        (actor.attackRange === 1 || hasLineOfSight(currentPosition, primaryTarget.position, grid));

    // Kiting logic for ranged combatants: if an enemy is too close (adjacent), retreat first
    const isRangedCombatant = actor.attackRange > 1;
    if (isRangedCombatant) {
        const adjacentEnemy = enemies.find(e =>
            calculateDistance(currentPosition, e.position) <= 1
        );

        if (adjacentEnemy && currentAP >= 1) {
            // Try to retreat to a safer position before attacking
            const retreatPosition = findRetreatPosition(actor, enemies, state, grid);
            if (retreatPosition) {
                const pathGrid = createPathfindingGrid(state, grid, combatantId);
                const pathResult = findPath(currentPosition, retreatPosition.position, pathGrid, {
                    maxCost: Math.min(currentAP, 2), // Use at most 2 AP for retreat
                    allowDiagonals: true,
                });

                if (pathResult.reachable && pathResult.path.length > 1) {
                    actions.push({
                        type: 'grid_move',
                        actorId: combatantId,
                        path: pathResult.path,
                    });
                    currentAP -= pathResult.totalCost;
                    currentPosition = retreatPosition.position;

                    // Check if we can attack after retreating
                    const newDistanceToTarget = calculateDistance(currentPosition, primaryTarget.position);
                    const canAttackAfterRetreat = newDistanceToTarget <= actor.attackRange &&
                        currentAP >= GRID_AP_COSTS.attack &&
                        hasLineOfSight(currentPosition, primaryTarget.position, grid);

                    if (canAttackAfterRetreat) {
                        actions.push({
                            type: 'grid_attack',
                            actorId: combatantId,
                            targetId: primaryTarget.id,
                            targetPosition: primaryTarget.position,
                        });
                        return {
                            actions,
                            reasoning: `Retreating and attacking ${primaryTarget.name} (kiting)`,
                        };
                    }

                    return {
                        actions,
                        reasoning: `Retreating from ${adjacentEnemy.name} (kiting)`,
                    };
                }
            }
        }
    }

    if (canAttackNow && currentAP >= GRID_AP_COSTS.attack) {
        // Attack immediately
        actions.push({
            type: 'grid_attack',
            actorId: combatantId,
            targetId: primaryTarget.id,
            targetPosition: primaryTarget.position,
        });
        return {
            actions,
            reasoning: `Attacking ${primaryTarget.name} (in range)`,
        };
    }

    // Need to move - find path to attack position
    const attackPosition = findAttackPosition(
        actor,
        primaryTarget,
        state,
        grid,
        currentAP
    );

    if (attackPosition) {
        const pathGrid = createPathfindingGrid(state, grid, combatantId);
        const pathResult = findPath(currentPosition, attackPosition.position, pathGrid, {
            maxCost: currentAP,
            allowDiagonals: true,
        });

        if (pathResult.reachable && pathResult.path.length > 1) {
            // Move along path
            const moveAction: GridMoveAction = {
                type: 'grid_move',
                actorId: combatantId,
                path: pathResult.path,
            };
            actions.push(moveAction);
            currentAP -= pathResult.totalCost;
            currentPosition = attackPosition.position;

            // Check if we can attack after moving
            const newDistance = calculateDistance(currentPosition, primaryTarget.position);
            const canAttackAfterMove = newDistance <= actor.attackRange &&
                currentAP >= GRID_AP_COSTS.attack &&
                (actor.attackRange === 1 || hasLineOfSight(currentPosition, primaryTarget.position, grid));

            if (canAttackAfterMove) {
                actions.push({
                    type: 'grid_attack',
                    actorId: combatantId,
                    targetId: primaryTarget.id,
                    targetPosition: primaryTarget.position,
                });
                return {
                    actions,
                    reasoning: `Moving to attack ${primaryTarget.name}`,
                };
            }

            return {
                actions,
                reasoning: `Moving toward ${primaryTarget.name}`,
            };
        }
    }

    // Can't reach target this turn - move as close as possible
    const closestApproach = findClosestApproach(actor, primaryTarget, state, grid);
    if (closestApproach && closestApproach.path.length > 1) {
        actions.push({
            type: 'grid_move',
            actorId: combatantId,
            path: closestApproach.path,
        });
        return {
            actions,
            reasoning: `Advancing toward ${primaryTarget.name}`,
        };
    }

    // Can't move productively - defend if we have AP
    if (currentAP >= GRID_AP_COSTS.defend && !actor.isDefending) {
        actions.push({
            type: 'grid_defend',
            actorId: combatantId,
        });
        return {
            actions,
            reasoning: 'Defending (no good moves)',
        };
    }

    // Nothing useful to do
    actions.push({
        type: 'grid_end_turn',
        actorId: combatantId,
    });
    return {
        actions,
        reasoning: 'Ending turn (no options)',
    };
}

// =============================================================================
// Target Selection
// =============================================================================

/**
 * Get all valid enemy targets.
 */
function getEnemyTargets(state: GridCombatState, combatantId: string): GridCombatant[] {
    const actor = state.combatants[combatantId];
    if (!actor) return [];

    return Object.values(state.combatants).filter(
        c => c.isPlayerControlled !== actor.isPlayerControlled && !c.isKnockedOut
    );
}

/**
 * Score targets by priority.
 * Higher score = more desirable target.
 *
 * Targeting factors:
 * 1. THREAT (damage dealt to actor) - up to 100 points
 * 2. Proximity - up to 80 points
 * 3. Low HP - up to 50 points
 * 4. In attack range - 30 points
 * 5. Clear LOS (ranged) - 15 points
 * 6. Player preference - 5 points
 */
function scoreTargets(
    actor: GridCombatant,
    enemies: GridCombatant[],
    grid: CombatGrid,
    threatMap?: Map<string, number>
): TargetScore[] {
    const scores: TargetScore[] = [];

    for (const enemy of enemies) {
        const distance = calculateDistance(actor.position, enemy.position);
        let score = 0;

        // THREAT PRIORITY: Enemies who dealt damage draw aggro
        // This makes enemies focus on whoever is attacking them
        const threatValue = threatMap?.get(enemy.id) ?? 0;
        if (threatValue > 0) {
            // Scale threat: 10 damage = ~50 points, 20+ damage = ~100 points (capped)
            // This makes taking damage the primary aggro factor
            score += Math.min(100, threatValue * 5);
        }

        // Prefer low HP targets (finish them off)
        const hpPercent = enemy.currentHp / enemy.maxHp;
        score += (1 - hpPercent) * 50; // Up to 50 points for low HP

        // Prefer closer targets (most important - don't run past enemies!)
        score += Math.max(0, 10 - distance) * 8; // Up to 80 points for proximity

        // Slight preference for the player over allies (but not enough to run past someone)
        if (enemy.isPlayer) {
            score += 5;
        }

        // Prefer targets in attack range
        if (distance <= actor.attackRange) {
            score += 30;
        }

        // Prefer targets with clear LOS (for ranged)
        if (actor.attackRange > 1 && hasLineOfSight(actor.position, enemy.position, grid)) {
            score += 15;
        }

        scores.push({ target: enemy, score, distance });
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);
    return scores;
}

// =============================================================================
// Positioning
// =============================================================================

/**
 * Find a position from which we can attack the target.
 * For ranged combatants, prefers positions at maximum attack range (kiting behavior).
 */
function findAttackPosition(
    actor: GridCombatant,
    target: GridCombatant,
    state: GridCombatState,
    grid: CombatGrid,
    maxAP: number
): { position: TilePosition; cost: number } | null {
    const pathGrid = createPathfindingGrid(state, grid, actor.id);

    // For melee: find adjacent tiles to target
    // For ranged: find tiles within attack range with LOS
    const attackRange = actor.attackRange;
    const isRanged = attackRange > 1;
    const candidatePositions: Array<{ pos: TilePosition; distance: number }> = [];

    if (attackRange === 1) {
        // Melee - check adjacent tiles
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const x = target.position.x + dx;
                const y = target.position.y + dy;
                if (isValidPosition(x, y, grid, state, actor.id)) {
                    candidatePositions.push({ pos: { x, y }, distance: 1 });
                }
            }
        }
    } else {
        // Ranged - check tiles within attack range
        for (let dy = -attackRange; dy <= attackRange; dy++) {
            for (let dx = -attackRange; dx <= attackRange; dx++) {
                if (dx === 0 && dy === 0) continue;
                const x = target.position.x + dx;
                const y = target.position.y + dy;

                if (!isValidPosition(x, y, grid, state, actor.id)) continue;

                const pos = { x, y };
                const dist = calculateDistance(pos, target.position);
                if (dist <= attackRange && hasLineOfSight(pos, target.position, grid)) {
                    candidatePositions.push({ pos, distance: dist });
                }
            }
        }
    }

    // For ranged combatants, sort candidates by distance (prefer max range for kiting)
    if (isRanged) {
        candidatePositions.sort((a, b) => b.distance - a.distance);
    }

    // Find the best reachable attack position
    // For ranged: prefer max distance positions even if they cost more AP
    // For melee: prefer cheapest path
    let bestPosition: { position: TilePosition; cost: number } | null = null;
    let bestScore = -Infinity;

    for (const { pos, distance } of candidatePositions) {
        // Skip if it's our current position (already handled)
        if (pos.x === actor.position.x && pos.y === actor.position.y) {
            return { position: pos, cost: 0 };
        }

        const pathResult = findPath(actor.position, pos, pathGrid, {
            maxCost: maxAP - GRID_AP_COSTS.attack, // Reserve AP for attack
            allowDiagonals: true,
        });

        if (pathResult.reachable) {
            // Score calculation:
            // - Melee: prefer low cost (negative cost = higher score)
            // - Ranged: prefer max distance, then low cost
            let score: number;
            if (isRanged) {
                // Distance is worth more than AP savings for ranged
                score = distance * 10 - pathResult.totalCost;
            } else {
                score = -pathResult.totalCost;
            }

            if (score > bestScore) {
                bestScore = score;
                bestPosition = { position: pos, cost: pathResult.totalCost };
            }
        }
    }

    return bestPosition;
}

/**
 * Find a retreat position for ranged combatants (kiting).
 * Prefers positions that:
 * 1. Increase distance from the closest enemy
 * 2. Maintain line of sight to a target
 * 3. Stay within attack range if possible
 */
function findRetreatPosition(
    actor: GridCombatant,
    enemies: GridCombatant[],
    state: GridCombatState,
    grid: CombatGrid
): { position: TilePosition; cost: number } | null {
    const pathGrid = createPathfindingGrid(state, grid, actor.id);

    // Get reachable tiles within 2 AP (conservative retreat)
    const reachable = getReachableTiles(actor.position, pathGrid, 2, {
        allowDiagonals: true,
    });

    if (reachable.length === 0) return null;

    // Find closest enemy
    let closestEnemy = enemies[0];
    let closestDistance = calculateDistance(actor.position, enemies[0].position);
    for (const enemy of enemies) {
        const dist = calculateDistance(actor.position, enemy.position);
        if (dist < closestDistance) {
            closestDistance = dist;
            closestEnemy = enemy;
        }
    }

    // Score each reachable position
    let bestTile: { position: TilePosition; cost: number } | null = null;
    let bestScore = -Infinity;

    for (const tile of reachable) {
        const distFromClosestEnemy = calculateDistance(tile.position, closestEnemy.position);

        // Skip if not actually retreating (must increase distance)
        if (distFromClosestEnemy <= closestDistance) continue;

        // Score: prioritize distance from closest enemy
        let score = distFromClosestEnemy * 10;

        // Bonus if still within attack range of someone
        const canAttackSomeone = enemies.some(e =>
            calculateDistance(tile.position, e.position) <= actor.attackRange &&
            hasLineOfSight(tile.position, e.position, grid)
        );
        if (canAttackSomeone) {
            score += 20;
        }

        // Penalty for path cost (prefer closer retreats)
        score -= tile.cost;

        if (score > bestScore) {
            bestScore = score;
            bestTile = tile;
        }
    }

    return bestTile;
}

/**
 * Find path to get as close as possible to target.
 */
function findClosestApproach(
    actor: GridCombatant,
    target: GridCombatant,
    state: GridCombatState,
    grid: CombatGrid
): { path: TilePosition[]; cost: number } | null {
    const pathGrid = createPathfindingGrid(state, grid, actor.id);

    // Get all reachable tiles
    const reachable = getReachableTiles(actor.position, pathGrid, actor.apRemaining, {
        allowDiagonals: true,
    });

    if (reachable.length === 0) return null;

    // Find the reachable tile closest to target
    let bestTile: { position: TilePosition; cost: number } | null = null;
    let bestDistance = Infinity;

    for (const tile of reachable) {
        const dist = calculateDistance(tile.position, target.position);
        if (dist < bestDistance) {
            bestDistance = dist;
            bestTile = tile;
        }
    }

    if (!bestTile || bestDistance >= calculateDistance(actor.position, target.position)) {
        // Can't get closer
        return null;
    }

    // Get the actual path
    const pathResult = findPath(actor.position, bestTile.position, pathGrid, {
        maxCost: actor.apRemaining,
        allowDiagonals: true,
    });

    if (pathResult.reachable) {
        return { path: pathResult.path, cost: pathResult.totalCost };
    }

    return null;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if a position is valid (in bounds, traversable, not occupied).
 */
function isValidPosition(
    x: number,
    y: number,
    grid: CombatGrid,
    state: GridCombatState,
    excludeId?: string
): boolean {
    // Bounds check
    if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) {
        return false;
    }

    // Traversable check
    const tile = grid.tiles[y]?.[x];
    if (!tile || !tile.traversable) {
        return false;
    }

    // Occupancy check
    for (const combatant of Object.values(state.combatants)) {
        if (combatant.id === excludeId) continue;
        if (combatant.isKnockedOut) continue;
        if (combatant.position.x === x && combatant.position.y === y) {
            return false;
        }
    }

    return true;
}

/**
 * Create a pathfinding grid from combat state.
 */
function createPathfindingGrid(
    state: GridCombatState,
    grid: CombatGrid,
    excludeId?: string
): PathfindingGrid {
    const blockedPositions: TilePosition[] = [];

    for (const combatant of Object.values(state.combatants)) {
        if (combatant.id === excludeId) continue;
        if (combatant.isKnockedOut) continue;
        blockedPositions.push(combatant.position);
    }

    return {
        width: grid.width,
        height: grid.height,
        tiles: grid.tiles,
        blockedPositions,
    };
}

// =============================================================================
// AI Turn Execution
// =============================================================================

/**
 * Execute a full AI turn (may involve multiple actions).
 * Returns all actions the AI wants to take this turn.
 */
export function executeAITurn(
    state: GridCombatState,
    combatantId: string,
    grid: CombatGrid
): GridCombatAction[] {
    const decision = decideAIActions(state, combatantId, grid);
    return decision.actions;
}
