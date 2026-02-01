/**
 * @file pathfinding.ts
 * @description A* pathfinding algorithm for grid-based combat movement.
 *
 * Features:
 * - Terrain cost support (normal, difficult, impassable)
 * - Movement point (AP) limits
 * - Diagonal movement option
 * - Blocked tile handling (occupied by entities)
 *
 * All functions are pure and testable without browser environment.
 */

import { TilePosition, LocalMapTileData, TerrainType } from '../types/localMap';

// =============================================================================
// Types
// =============================================================================

/**
 * Grid data needed for pathfinding
 */
export interface PathfindingGrid {
    width: number;
    height: number;
    tiles: LocalMapTileData[][];
    blockedPositions?: TilePosition[]; // Tiles blocked by entities
}

/**
 * Result of pathfinding operation
 */
export interface PathResult {
    path: TilePosition[];
    totalCost: number;
    reachable: boolean;
}

/**
 * Options for pathfinding
 */
export interface PathfindingOptions {
    allowDiagonals?: boolean;     // Allow diagonal movement (default: true)
    diagonalCost?: number;        // Cost multiplier for diagonals (default: 1.414)
    maxCost?: number;             // Maximum total movement cost (AP limit)
    treatDifficultAs?: number;    // Cost multiplier for difficult terrain (default: 2)
}

// =============================================================================
// Constants
// =============================================================================

const SQRT_2 = Math.SQRT2; // ~1.414

/**
 * Terrain type to base cost mapping
 */
const TERRAIN_COSTS: Record<TerrainType, number> = {
    normal: 1,
    difficult: 2,
    hazard: 2,      // Can traverse but costly
    water: 3,       // Traversable but very slow (wading through water)
    impassable: Infinity,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a unique key for a position (for Set/Map usage)
 */
function posKey(pos: TilePosition): string {
    return `${pos.x},${pos.y}`;
}

/**
 * Parse a position key back to TilePosition
 */
function parseKey(key: string): TilePosition {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
}

/**
 * Check if a position is within grid bounds
 */
function isInBounds(pos: TilePosition, grid: PathfindingGrid): boolean {
    return pos.x >= 0 && pos.x < grid.width && pos.y >= 0 && pos.y < grid.height;
}

/**
 * Get the movement cost for a tile
 */
function getTileCost(
    pos: TilePosition,
    grid: PathfindingGrid,
    options: PathfindingOptions
): number {
    const tile = grid.tiles[pos.y]?.[pos.x];
    if (!tile) return Infinity;
    if (!tile.traversable) return Infinity;

    // Check terrain type
    const baseCost = TERRAIN_COSTS[tile.terrainType] ?? 1;

    // Apply difficult terrain multiplier if specified
    if (tile.terrainType === 'difficult' && options.treatDifficultAs !== undefined) {
        return options.treatDifficultAs;
    }

    return baseCost;
}

/**
 * Calculate heuristic distance (Chebyshev for diagonal movement, Manhattan otherwise)
 */
function heuristic(a: TilePosition, b: TilePosition, allowDiagonals: boolean): number {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);

    if (allowDiagonals) {
        // Chebyshev distance (diagonal movement costs same as cardinal)
        return Math.max(dx, dy);
    }
    // Manhattan distance
    return dx + dy;
}

/**
 * Get neighboring positions
 */
function getNeighbors(
    pos: TilePosition,
    grid: PathfindingGrid,
    allowDiagonals: boolean
): TilePosition[] {
    const neighbors: TilePosition[] = [];

    // Cardinal directions
    const cardinals = [
        { x: pos.x, y: pos.y - 1 },     // North
        { x: pos.x + 1, y: pos.y },     // East
        { x: pos.x, y: pos.y + 1 },     // South
        { x: pos.x - 1, y: pos.y },     // West
    ];

    for (const n of cardinals) {
        if (isInBounds(n, grid)) {
            neighbors.push(n);
        }
    }

    // Diagonal directions
    if (allowDiagonals) {
        const diagonals = [
            { x: pos.x + 1, y: pos.y - 1 },   // NE
            { x: pos.x + 1, y: pos.y + 1 },   // SE
            { x: pos.x - 1, y: pos.y + 1 },   // SW
            { x: pos.x - 1, y: pos.y - 1 },   // NW
        ];

        for (const n of diagonals) {
            if (isInBounds(n, grid)) {
                neighbors.push(n);
            }
        }
    }

    return neighbors;
}

/**
 * Check if movement from a to b is diagonal
 */
function isDiagonal(a: TilePosition, b: TilePosition): boolean {
    return a.x !== b.x && a.y !== b.y;
}

// =============================================================================
// A* Pathfinding
// =============================================================================

/**
 * Priority queue node for A*
 */
interface AStarNode {
    pos: TilePosition;
    gCost: number;      // Cost from start
    fCost: number;      // gCost + heuristic
}

/**
 * Simple priority queue (min-heap would be more efficient for large grids)
 */
class PriorityQueue {
    private items: AStarNode[] = [];

    push(node: AStarNode): void {
        this.items.push(node);
        this.items.sort((a, b) => a.fCost - b.fCost);
    }

    pop(): AStarNode | undefined {
        return this.items.shift();
    }

    isEmpty(): boolean {
        return this.items.length === 0;
    }
}

/**
 * Find a path from start to goal using A* algorithm.
 *
 * @param start - Starting position
 * @param goal - Target position
 * @param grid - Grid data with tile costs and dimensions
 * @param options - Pathfinding options (diagonals, max cost, etc.)
 * @returns PathResult with path, total cost, and reachability flag
 *
 * @example
 * const result = findPath(
 *   { x: 0, y: 0 },
 *   { x: 5, y: 3 },
 *   grid,
 *   { maxCost: 4, allowDiagonals: true }
 * );
 * if (result.reachable) {
 *   console.log(`Path found with cost ${result.totalCost}`);
 * }
 */
export function findPath(
    start: TilePosition,
    goal: TilePosition,
    grid: PathfindingGrid,
    options: PathfindingOptions = {}
): PathResult {
    const {
        allowDiagonals = true,
        diagonalCost = SQRT_2,
        maxCost = Infinity,
    } = options;

    // Create blocked set for quick lookup
    const blockedSet = new Set<string>(
        (grid.blockedPositions ?? []).map(posKey)
    );

    // Don't block the goal position (we may want to path TO an enemy)
    blockedSet.delete(posKey(goal));

    // Quick check: if goal is impassable, no path exists
    const goalTile = grid.tiles[goal.y]?.[goal.x];
    if (!goalTile || !goalTile.traversable) {
        return { path: [], totalCost: Infinity, reachable: false };
    }

    // A* data structures
    const openSet = new PriorityQueue();
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();

    const startKey = posKey(start);
    const goalKey = posKey(goal);

    gScore.set(startKey, 0);
    openSet.push({
        pos: start,
        gCost: 0,
        fCost: heuristic(start, goal, allowDiagonals),
    });

    while (!openSet.isEmpty()) {
        const current = openSet.pop()!;
        const currentKey = posKey(current.pos);

        // Goal reached
        if (currentKey === goalKey) {
            // Reconstruct path
            const path: TilePosition[] = [];
            let key = goalKey;
            while (key !== startKey) {
                path.unshift(parseKey(key));
                key = cameFrom.get(key)!;
            }
            path.unshift(start);

            return {
                path,
                totalCost: current.gCost,
                reachable: true,
            };
        }

        // Explore neighbors
        const neighbors = getNeighbors(current.pos, grid, allowDiagonals);

        for (const neighbor of neighbors) {
            const neighborKey = posKey(neighbor);

            // Skip blocked tiles
            if (blockedSet.has(neighborKey)) continue;

            // Calculate movement cost
            const tileCost = getTileCost(neighbor, grid, options);
            if (tileCost === Infinity) continue;

            // Apply diagonal cost multiplier
            const moveCost = isDiagonal(current.pos, neighbor)
                ? tileCost * diagonalCost
                : tileCost;

            const tentativeG = current.gCost + moveCost;

            // Enforce max cost limit
            if (tentativeG > maxCost) continue;

            // Check if this path to neighbor is better
            const previousG = gScore.get(neighborKey) ?? Infinity;
            if (tentativeG < previousG) {
                cameFrom.set(neighborKey, currentKey);
                gScore.set(neighborKey, tentativeG);

                openSet.push({
                    pos: neighbor,
                    gCost: tentativeG,
                    fCost: tentativeG + heuristic(neighbor, goal, allowDiagonals),
                });
            }
        }
    }

    // No path found
    return { path: [], totalCost: Infinity, reachable: false };
}

// =============================================================================
// Reachability Analysis
// =============================================================================

/**
 * Get all tiles reachable from a position within a cost limit.
 * Useful for highlighting valid movement destinations.
 *
 * @param start - Starting position
 * @param grid - Grid data
 * @param maxCost - Maximum movement cost (AP available)
 * @param options - Pathfinding options
 * @returns Array of reachable positions with their costs
 *
 * @example
 * const reachable = getReachableTiles(playerPos, grid, 4);
 * // Highlight all tiles the player can reach with 4 AP
 */
export function getReachableTiles(
    start: TilePosition,
    grid: PathfindingGrid,
    maxCost: number,
    options: PathfindingOptions = {}
): Array<{ position: TilePosition; cost: number }> {
    const {
        allowDiagonals = true,
        diagonalCost = SQRT_2,
    } = options;

    const blockedSet = new Set<string>(
        (grid.blockedPositions ?? []).map(posKey)
    );

    const reachable: Array<{ position: TilePosition; cost: number }> = [];
    const visited = new Map<string, number>(); // Key -> lowest cost to reach

    // BFS with cost tracking (Dijkstra-like)
    const queue: Array<{ pos: TilePosition; cost: number }> = [
        { pos: start, cost: 0 }
    ];
    visited.set(posKey(start), 0);

    while (queue.length > 0) {
        // Sort by cost (simple approach; heap would be better for large grids)
        queue.sort((a, b) => a.cost - b.cost);
        const current = queue.shift()!;

        // Add to reachable (except start)
        if (current.cost > 0) {
            reachable.push({
                position: current.pos,
                cost: current.cost,
            });
        }

        const neighbors = getNeighbors(current.pos, grid, allowDiagonals);

        for (const neighbor of neighbors) {
            const neighborKey = posKey(neighbor);

            // Skip blocked tiles
            if (blockedSet.has(neighborKey)) continue;

            const tileCost = getTileCost(neighbor, grid, options);
            if (tileCost === Infinity) continue;

            const moveCost = isDiagonal(current.pos, neighbor)
                ? tileCost * diagonalCost
                : tileCost;

            const newCost = current.cost + moveCost;

            // Skip if over budget
            if (newCost > maxCost) continue;

            // Skip if we've found a better path already
            const previousCost = visited.get(neighborKey);
            if (previousCost !== undefined && previousCost <= newCost) continue;

            visited.set(neighborKey, newCost);
            queue.push({ pos: neighbor, cost: newCost });
        }
    }

    return reachable;
}

// =============================================================================
// Path Validation
// =============================================================================

/**
 * Validate a pre-computed path (e.g., from player input).
 * Checks that each step is valid and calculates total cost.
 *
 * @param path - Array of positions forming the path
 * @param grid - Grid data
 * @param options - Pathfinding options
 * @returns PathResult with validation status and cost
 */
export function validatePath(
    path: TilePosition[],
    grid: PathfindingGrid,
    options: PathfindingOptions = {}
): PathResult {
    if (path.length < 2) {
        return { path, totalCost: 0, reachable: true };
    }

    const {
        allowDiagonals = true,
        diagonalCost = SQRT_2,
        maxCost = Infinity,
    } = options;

    const blockedSet = new Set<string>(
        (grid.blockedPositions ?? []).map(posKey)
    );

    let totalCost = 0;

    for (let i = 1; i < path.length; i++) {
        const prev = path[i - 1];
        const curr = path[i];

        // Check adjacency
        const dx = Math.abs(curr.x - prev.x);
        const dy = Math.abs(curr.y - prev.y);

        if (dx > 1 || dy > 1) {
            return { path: [], totalCost: Infinity, reachable: false };
        }

        // Check diagonal allowed
        if (!allowDiagonals && dx === 1 && dy === 1) {
            return { path: [], totalCost: Infinity, reachable: false };
        }

        // Check blocked (except final position)
        const currKey = posKey(curr);
        if (i < path.length - 1 && blockedSet.has(currKey)) {
            return { path: [], totalCost: Infinity, reachable: false };
        }

        // Calculate cost
        const tileCost = getTileCost(curr, grid, options);
        if (tileCost === Infinity) {
            return { path: [], totalCost: Infinity, reachable: false };
        }

        const moveCost = isDiagonal(prev, curr)
            ? tileCost * diagonalCost
            : tileCost;

        totalCost += moveCost;

        if (totalCost > maxCost) {
            return { path: [], totalCost: Infinity, reachable: false };
        }
    }

    return { path, totalCost, reachable: true };
}
