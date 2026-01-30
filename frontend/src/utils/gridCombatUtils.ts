/**
 * @file gridCombatUtils.ts
 * @description Utility functions for grid-based combat calculations.
 *
 * Features:
 * - Distance calculations (Manhattan, Chebyshev, Euclidean)
 * - Line of sight (Bresenham raycast)
 * - Flanking detection
 * - Valid move/attack target determination
 *
 * All functions are pure and testable without browser environment.
 */

import { TilePosition, LocalMapTileData, Allegiance } from '../types/localMap';
import { PathfindingGrid, getReachableTiles } from './pathfinding';

// =============================================================================
// Types
// =============================================================================

export type DistanceMetric = 'manhattan' | 'chebyshev' | 'euclidean';

/**
 * Combat allegiance mapping (simplified from full Allegiance type)
 */
export type CombatAllegiance = 'player' | 'ally' | 'enemy';

/**
 * Grid for combat calculations
 */
export interface CombatGrid {
    width: number;
    height: number;
    tiles: LocalMapTileData[][];
}

/**
 * Entity position for combat calculations
 */
export interface CombatEntity {
    id: string;
    position: TilePosition;
    allegiance: CombatAllegiance;
    isKnockedOut?: boolean;
}

// =============================================================================
// Allegiance Mapping
// =============================================================================

/**
 * Map LocalMapEntity allegiance to combat allegiance
 */
export function toCombatAllegiance(allegiance: Allegiance): CombatAllegiance {
    switch (allegiance) {
        case 'player':
            return 'player';
        case 'bonded_ally':
        case 'friendly':
            return 'ally';
        case 'hostile':
            return 'enemy';
        case 'neutral':
        case 'captured':
            // Neutral/captured don't participate in combat by default
            // If they do, treat as enemy (they were provoked)
            return 'enemy';
    }
}

/**
 * Check if two allegiances are hostile to each other
 */
export function areHostile(a: CombatAllegiance, b: CombatAllegiance): boolean {
    if (a === 'enemy' && (b === 'player' || b === 'ally')) return true;
    if (b === 'enemy' && (a === 'player' || a === 'ally')) return true;
    return false;
}

/**
 * Check if two allegiances are allied
 */
export function areAllied(a: CombatAllegiance, b: CombatAllegiance): boolean {
    if (a === 'enemy' && b === 'enemy') return true;
    if (a !== 'enemy' && b !== 'enemy') return true;
    return false;
}

// =============================================================================
// Distance Calculations
// =============================================================================

/**
 * Calculate distance between two positions.
 *
 * @param a - First position
 * @param b - Second position
 * @param metric - Distance metric to use
 * @returns Distance value
 *
 * Metrics:
 * - manhattan: |dx| + |dy| - no diagonal shortcuts
 * - chebyshev: max(|dx|, |dy|) - diagonal same cost as cardinal
 * - euclidean: sqrt(dx² + dy²) - true distance
 *
 * @example
 * calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 }, 'manhattan');  // 7
 * calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 }, 'chebyshev');  // 4
 * calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 }, 'euclidean');  // 5
 */
export function calculateDistance(
    a: TilePosition,
    b: TilePosition,
    metric: DistanceMetric = 'chebyshev'
): number {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);

    switch (metric) {
        case 'manhattan':
            return dx + dy;
        case 'chebyshev':
            return Math.max(dx, dy);
        case 'euclidean':
            return Math.sqrt(dx * dx + dy * dy);
    }
}

/**
 * Check if two positions are adjacent (including diagonals)
 */
export function areAdjacent(a: TilePosition, b: TilePosition): boolean {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return dx <= 1 && dy <= 1 && (dx + dy > 0);
}

/**
 * Check if position B is within range of position A
 */
export function isInRange(
    from: TilePosition,
    to: TilePosition,
    range: number,
    metric: DistanceMetric = 'chebyshev'
): boolean {
    return calculateDistance(from, to, metric) <= range;
}

// =============================================================================
// Line of Sight
// =============================================================================

/**
 * Get all tiles along a line from start to end (Bresenham's algorithm).
 * Used for line of sight checks and ranged attack visualization.
 *
 * @param start - Starting position
 * @param end - Ending position
 * @returns Array of positions along the line (including start and end)
 */
export function getLineOfSightTiles(
    start: TilePosition,
    end: TilePosition
): TilePosition[] {
    const tiles: TilePosition[] = [];

    let x0 = start.x;
    let y0 = start.y;
    const x1 = end.x;
    const y1 = end.y;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
        tiles.push({ x: x0, y: y0 });

        if (x0 === x1 && y0 === y1) break;

        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }

    return tiles;
}

/**
 * Check if there's a clear line of sight between two positions.
 * Blocked by tiles with blocksVision=true or traversable=false.
 *
 * @param from - Starting position
 * @param to - Target position
 * @param grid - Grid data with tile information
 * @param ignorePositions - Positions to ignore (e.g., self and target)
 * @returns true if line of sight is clear
 */
export function hasLineOfSight(
    from: TilePosition,
    to: TilePosition,
    grid: CombatGrid,
    ignorePositions: TilePosition[] = []
): boolean {
    const ignoreSet = new Set(ignorePositions.map(p => `${p.x},${p.y}`));

    // Always ignore start and end positions
    ignoreSet.add(`${from.x},${from.y}`);
    ignoreSet.add(`${to.x},${to.y}`);

    const lineTiles = getLineOfSightTiles(from, to);

    for (const tile of lineTiles) {
        const key = `${tile.x},${tile.y}`;
        if (ignoreSet.has(key)) continue;

        // Check bounds
        if (tile.x < 0 || tile.x >= grid.width || tile.y < 0 || tile.y >= grid.height) {
            return false;
        }

        const tileData = grid.tiles[tile.y]?.[tile.x];
        if (!tileData) return false;

        // Check if tile blocks vision
        // Use blocksVision if defined, otherwise fall back to traversable
        const blocksVision = (tileData as LocalMapTileData & { blocksVision?: boolean }).blocksVision;
        if (blocksVision === true) return false;
        if (blocksVision === undefined && !tileData.traversable) return false;
    }

    return true;
}

// =============================================================================
// Flanking
// =============================================================================

/**
 * Get the direction from one position to another (8-directional)
 */
export function getDirection(
    from: TilePosition,
    to: TilePosition
): { dx: number; dy: number } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    return {
        dx: dx === 0 ? 0 : dx > 0 ? 1 : -1,
        dy: dy === 0 ? 0 : dy > 0 ? 1 : -1,
    };
}

/**
 * Check if two directions are opposite
 */
export function areOppositeDirections(
    dir1: { dx: number; dy: number },
    dir2: { dx: number; dy: number }
): boolean {
    // Exactly opposite
    if (dir1.dx === -dir2.dx && dir1.dy === -dir2.dy) return true;

    // Consider near-opposite (e.g., N and S, or NE and SW)
    // For flanking, we want roughly 180 degrees apart
    const dot = dir1.dx * dir2.dx + dir1.dy * dir2.dy;
    return dot < 0; // Negative dot product means > 90 degrees apart
}

/**
 * Check if an attacker has flanking bonus against target.
 * Flanking occurs when an ally is on the opposite side of the target.
 *
 * @param attacker - Attacking entity
 * @param target - Target entity
 * @param allies - All allies of the attacker (including attacker)
 * @returns true if flanking bonus applies
 *
 * @example
 * // Ally at (2,0), Target at (3,0), Attacker at (4,0)
 * // Attacker flanks because ally is on opposite side
 * checkFlanking(attacker, target, [ally, attacker]); // true
 */
export function checkFlanking(
    attacker: CombatEntity,
    target: CombatEntity,
    allies: CombatEntity[]
): boolean {
    // Get direction from target to attacker
    const attackerDir = getDirection(target.position, attacker.position);

    // Check if any ally is on the opposite side
    for (const ally of allies) {
        // Skip self
        if (ally.id === attacker.id) continue;

        // Skip knocked out allies
        if (ally.isKnockedOut) continue;

        // Skip if not adjacent to target
        if (!areAdjacent(ally.position, target.position)) continue;

        // Get direction from target to ally
        const allyDir = getDirection(target.position, ally.position);

        // Check if opposite direction
        if (areOppositeDirections(attackerDir, allyDir)) {
            return true;
        }
    }

    return false;
}

// =============================================================================
// Valid Targets
// =============================================================================

/**
 * Get valid movement destinations for an entity.
 *
 * @param entity - Moving entity
 * @param grid - Pathfinding grid
 * @param maxAP - Maximum AP available for movement
 * @param allEntities - All entities on the grid (for blocking)
 * @returns Array of valid destination positions
 */
export function getValidMoveTargets(
    entity: CombatEntity,
    grid: PathfindingGrid,
    maxAP: number,
    allEntities: CombatEntity[]
): TilePosition[] {
    // Get blocked positions (all other entities)
    const blockedPositions = allEntities
        .filter(e => e.id !== entity.id && !e.isKnockedOut)
        .map(e => e.position);

    const gridWithBlocked: PathfindingGrid = {
        ...grid,
        blockedPositions,
    };

    const reachable = getReachableTiles(
        entity.position,
        gridWithBlocked,
        maxAP,
        { allowDiagonals: true }
    );

    return reachable.map(r => r.position);
}

/**
 * Get valid attack targets for an entity.
 *
 * @param attacker - Attacking entity
 * @param attackRange - Attack range in tiles
 * @param grid - Combat grid for LOS checks
 * @param allEntities - All entities on the grid
 * @param requireLOS - Whether line of sight is required (default: true)
 * @returns Array of valid target entities
 */
export function getValidAttackTargets(
    attacker: CombatEntity,
    attackRange: number,
    grid: CombatGrid,
    allEntities: CombatEntity[],
    requireLOS: boolean = true
): CombatEntity[] {
    const targets: CombatEntity[] = [];

    for (const entity of allEntities) {
        // Can't target self
        if (entity.id === attacker.id) continue;

        // Can't target knocked out entities
        if (entity.isKnockedOut) continue;

        // Can't target allies
        if (!areHostile(attacker.allegiance, entity.allegiance)) continue;

        // Check range
        if (!isInRange(attacker.position, entity.position, attackRange)) continue;

        // Check line of sight
        if (requireLOS && !hasLineOfSight(attacker.position, entity.position, grid)) {
            continue;
        }

        targets.push(entity);
    }

    return targets;
}

/**
 * Get all tiles within attack range (for highlighting).
 *
 * @param position - Attacker position
 * @param attackRange - Attack range in tiles
 * @param grid - Combat grid
 * @returns Array of tiles within range
 */
export function getAttackRangeTiles(
    position: TilePosition,
    attackRange: number,
    grid: CombatGrid
): TilePosition[] {
    const tiles: TilePosition[] = [];

    // Scan all tiles within range bounding box
    for (let y = position.y - attackRange; y <= position.y + attackRange; y++) {
        for (let x = position.x - attackRange; x <= position.x + attackRange; x++) {
            // Skip out of bounds
            if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) continue;

            // Skip self
            if (x === position.x && y === position.y) continue;

            const target = { x, y };

            // Check if within range (Chebyshev)
            if (!isInRange(position, target, attackRange)) continue;

            tiles.push(target);
        }
    }

    return tiles;
}

// =============================================================================
// Threat Assessment
// =============================================================================

/**
 * Calculate threat score for a position (higher = more dangerous).
 * Considers proximity to enemies and their attack ranges.
 *
 * @param position - Position to evaluate
 * @param enemies - Enemy entities
 * @param enemyAttackRange - Default enemy attack range
 * @returns Threat score (0 = safe, higher = more dangerous)
 */
export function calculateThreatScore(
    position: TilePosition,
    enemies: CombatEntity[],
    enemyAttackRange: number = 1
): number {
    let threat = 0;

    for (const enemy of enemies) {
        if (enemy.isKnockedOut) continue;

        const distance = calculateDistance(position, enemy.position);

        // Immediate threat: within enemy attack range
        if (distance <= enemyAttackRange) {
            threat += 10;
        }
        // Near threat: one tile outside attack range
        else if (distance <= enemyAttackRange + 1) {
            threat += 5;
        }
        // Proximity threat: diminishes with distance
        else {
            threat += Math.max(0, 3 - distance);
        }
    }

    return threat;
}

/**
 * Find the safest adjacent tile for retreat.
 *
 * @param entity - Entity looking to retreat
 * @param grid - Combat grid
 * @param enemies - Enemy entities
 * @param allEntities - All entities (for blocking)
 * @returns Safest adjacent position, or null if none available
 */
export function findSafestRetreatTile(
    entity: CombatEntity,
    grid: CombatGrid,
    enemies: CombatEntity[],
    allEntities: CombatEntity[]
): TilePosition | null {
    const blocked = new Set(
        allEntities
            .filter(e => e.id !== entity.id && !e.isKnockedOut)
            .map(e => `${e.position.x},${e.position.y}`)
    );

    let safestTile: TilePosition | null = null;
    let lowestThreat = calculateThreatScore(entity.position, enemies);

    // Check all adjacent tiles (including diagonals)
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;

            const x = entity.position.x + dx;
            const y = entity.position.y + dy;

            // Check bounds
            if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) continue;

            // Check traversable
            const tile = grid.tiles[y]?.[x];
            if (!tile || !tile.traversable) continue;

            // Check blocked
            if (blocked.has(`${x},${y}`)) continue;

            const threat = calculateThreatScore({ x, y }, enemies);
            if (threat < lowestThreat) {
                lowestThreat = threat;
                safestTile = { x, y };
            }
        }
    }

    return safestTile;
}
