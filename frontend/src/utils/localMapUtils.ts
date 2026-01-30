/**
 * @file localMapUtils.ts
 * @description Utility functions for the local map system.
 *
 * Key functionality:
 * - Derive exit tiles from world topology (adjacent rooms)
 * - Calculate threat zones from hostile positions
 * - Auto-place NPCs on the grid
 * - Pathfinding helpers
 */

import {
    TilePosition,
    ExitTile,
    ExitDirection,
    LocalMapEntity,
    LocalMapConfig,
    Allegiance,
} from '../types/localMap';
import { GridWorldState } from '../types/worldGrid';

/**
 * Exit positions on the local map edges
 * Based on spec: center of each edge
 */
export function getExitPosition(
    direction: ExitDirection,
    config: LocalMapConfig
): TilePosition {
    const { gridWidth, gridHeight } = config;

    switch (direction) {
        case 'north':
            return { x: Math.floor(gridWidth / 2), y: 0 };
        case 'south':
            return { x: Math.floor(gridWidth / 2), y: gridHeight - 1 };
        case 'east':
            return { x: gridWidth - 1, y: Math.floor(gridHeight / 2) };
        case 'west':
            return { x: 0, y: Math.floor(gridHeight / 2) };
    }
}

/**
 * Get spawn position when entering from a direction
 * Player spawns at the edge they entered from (the doorway)
 */
export function getSpawnPosition(
    entryDirection: ExitDirection,
    config: LocalMapConfig
): TilePosition {
    // Entry direction is where we came FROM - spawn at that edge (the doorway)
    return getExitPosition(entryDirection, config);
}

/**
 * Derive exits from world topology
 *
 * Checks adjacent positions in the world grid and creates exit tiles
 * for each direction that has a room.
 */
export function deriveExitsFromWorld(
    currentRoomId: string,
    worldState: GridWorldState,
    config: LocalMapConfig
): ExitTile[] {
    const exits: ExitTile[] = [];

    // Find current room position in world grid
    let currentPosition: { x: number; y: number } | null = null;

    for (let y = 0; y < worldState.grid.length; y++) {
        for (let x = 0; x < worldState.grid[y].length; x++) {
            const room = worldState.grid[y][x];
            if (room && room.id === currentRoomId) {
                currentPosition = { x, y };
                break;
            }
        }
        if (currentPosition) break;
    }

    if (!currentPosition) return exits;

    // Check each direction for adjacent rooms
    const directions: Array<{
        dir: ExitDirection;
        dx: number;
        dy: number;
    }> = [
        { dir: 'north', dx: 0, dy: -1 },
        { dir: 'south', dx: 0, dy: 1 },
        { dir: 'east', dx: 1, dy: 0 },
        { dir: 'west', dx: -1, dy: 0 },
    ];

    for (const { dir, dx, dy } of directions) {
        const adjacentX = currentPosition.x + dx;
        const adjacentY = currentPosition.y + dy;

        // Check bounds
        if (
            adjacentY >= 0 &&
            adjacentY < worldState.grid.length &&
            adjacentX >= 0 &&
            adjacentX < worldState.grid[adjacentY].length
        ) {
            const adjacentRoom = worldState.grid[adjacentY][adjacentX];
            if (adjacentRoom) {
                exits.push({
                    direction: dir,
                    position: getExitPosition(dir, config),
                    targetRoomId: adjacentRoom.id,
                    targetRoomName: adjacentRoom.name,
                });
            }
        }
    }

    return exits;
}

/**
 * Calculate threat zones from hostile entity positions
 *
 * Threat zones are tiles within range of hostile NPCs.
 * Each entity uses its own threatRange (defaults to 1 if not specified).
 * Higher level enemies have larger threat ranges based on deriveGridCombatStats.
 *
 * @param entities - All entities on the map
 * @param config - Map configuration
 * @param defaultThreatRange - Fallback range if entity has no threatRange (default 1)
 */
export function calculateThreatZones(
    entities: LocalMapEntity[],
    config: LocalMapConfig,
    defaultThreatRange: number = 1
): TilePosition[] {
    const threatSet = new Set<string>();

    // Find all hostile entities (skip incapacitated/dead)
    const hostiles = entities.filter(e =>
        e.allegiance === 'hostile' && !e.isIncapacitated && !e.isDead
    );

    for (const hostile of hostiles) {
        // Use entity's own threatRange or fall back to default
        const range = hostile.threatRange ?? defaultThreatRange;

        // Add all tiles within threat range
        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                // Skip the hostile's own tile and tiles too far (Manhattan distance)
                if (Math.abs(dx) + Math.abs(dy) > range) continue;
                if (dx === 0 && dy === 0) continue;

                const x = hostile.position.x + dx;
                const y = hostile.position.y + dy;

                // Check bounds
                if (x >= 0 && x < config.gridWidth && y >= 0 && y < config.gridHeight) {
                    threatSet.add(`${x},${y}`);
                }
            }
        }
    }

    // Convert back to positions
    return Array.from(threatSet).map(key => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
    });
}

/**
 * Auto-place NPCs on the grid
 *
 * Strategy:
 * - Player starts at spawn position
 * - Bonded companion adjacent to player
 * - Friendly NPCs spread around the room
 * - Hostile NPCs on opposite side from player
 * - Neutral NPCs in middle areas
 */
export function autoPlaceEntities(
    npcs: Array<{ id: string; name: string; hostile: boolean; imagePath?: string; level?: number }>,
    playerPosition: TilePosition,
    config: LocalMapConfig
): LocalMapEntity[] {
    const entities: LocalMapEntity[] = [];
    const occupiedTiles = new Set<string>();

    // Mark player position as occupied
    occupiedTiles.add(`${playerPosition.x},${playerPosition.y}`);

    // Helper to find an unoccupied tile
    const findUnoccupiedTile = (
        preferredPositions: TilePosition[]
    ): TilePosition | null => {
        for (const pos of preferredPositions) {
            const key = `${pos.x},${pos.y}`;
            if (!occupiedTiles.has(key)) {
                occupiedTiles.add(key);
                return pos;
            }
        }
        return null;
    };

    // Generate positions for different allegiances
    const { gridWidth, gridHeight } = config;

    // Hostile positions: far from player (opposite corners/edges)
    const hostilePositions: TilePosition[] = [];
    for (let x = gridWidth - 1; x >= gridWidth - 3; x--) {
        for (let y = 0; y < Math.min(3, gridHeight); y++) {
            hostilePositions.push({ x, y });
        }
    }

    // Friendly positions: near player but not blocking
    const friendlyPositions: TilePosition[] = [];
    for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
            if (dx === 0 && dy === 0) continue;
            const x = playerPosition.x + dx;
            const y = playerPosition.y + dy;
            if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
                friendlyPositions.push({ x, y });
            }
        }
    }

    // Neutral positions: middle of map
    const neutralPositions: TilePosition[] = [];
    const midX = Math.floor(gridWidth / 2);
    const midY = Math.floor(gridHeight / 2);
    for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const x = midX + dx;
            const y = midY + dy;
            if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
                neutralPositions.push({ x, y });
            }
        }
    }

    // Place NPCs
    for (const npc of npcs) {
        let position: TilePosition | null = null;
        let allegiance: Allegiance = 'neutral';

        if (npc.hostile) {
            allegiance = 'hostile';
            position = findUnoccupiedTile(hostilePositions);
        } else {
            allegiance = 'friendly';
            position = findUnoccupiedTile(friendlyPositions);
        }

        // Fallback to neutral positions
        if (!position) {
            position = findUnoccupiedTile(neutralPositions);
        }

        // Last resort: any unoccupied tile
        if (!position) {
            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    const key = `${x},${y}`;
                    if (!occupiedTiles.has(key)) {
                        position = { x, y };
                        occupiedTiles.add(key);
                        break;
                    }
                }
                if (position) break;
            }
        }

        if (position) {
            const level = npc.level ?? 1;
            const baseHp = 30 + level * 10; // Scale HP with level

            // Calculate threat range for hostile NPCs based on level
            // Level 1-19: 1 tile (standard)
            // Level 20-39: 2 tiles (elite)
            // Level 40+: 3 tiles (boss-tier)
            const threatRange = allegiance === 'hostile'
                ? (level >= 40 ? 3 : level >= 20 ? 2 : 1)
                : undefined;

            entities.push({
                id: npc.id,
                name: npc.name,
                level,
                allegiance,
                position,
                imagePath: npc.imagePath ?? null,
                currentHp: baseHp,
                maxHp: baseHp,
                threatRange,
            });
        }
    }

    return entities;
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
 * Check if player is in a threat zone
 */
export function isInThreatZone(
    playerPosition: TilePosition,
    threatZones: TilePosition[]
): boolean {
    return threatZones.some(
        tz => tz.x === playerPosition.x && tz.y === playerPosition.y
    );
}

/**
 * Get adjacent tiles (for movement)
 */
export function getAdjacentTiles(
    position: TilePosition,
    config: LocalMapConfig,
    includeDiagonals: boolean = false
): TilePosition[] {
    const adjacent: TilePosition[] = [];
    const deltas = includeDiagonals
        ? [
            { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
            { dx: -1, dy: 0 },                      { dx: 1, dy: 0 },
            { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 },
        ]
        : [
            { dx: 0, dy: -1 },
            { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
            { dx: 0, dy: 1 },
        ];

    for (const { dx, dy } of deltas) {
        const x = position.x + dx;
        const y = position.y + dy;
        if (x >= 0 && x < config.gridWidth && y >= 0 && y < config.gridHeight) {
            adjacent.push({ x, y });
        }
    }

    return adjacent;
}

/**
 * Simple pathfinding (BFS) from start to goal
 * Returns the path as array of positions, or null if no path exists
 */
export function findPath(
    start: TilePosition,
    goal: TilePosition,
    config: LocalMapConfig,
    blockedTiles: TilePosition[] = []
): TilePosition[] | null {
    const blockedSet = new Set(blockedTiles.map(t => `${t.x},${t.y}`));

    // BFS
    const queue: Array<{ pos: TilePosition; path: TilePosition[] }> = [
        { pos: start, path: [start] }
    ];
    const visited = new Set<string>();
    visited.add(`${start.x},${start.y}`);

    while (queue.length > 0) {
        const current = queue.shift()!;

        if (current.pos.x === goal.x && current.pos.y === goal.y) {
            return current.path;
        }

        const neighbors = getAdjacentTiles(current.pos, config, false);
        for (const neighbor of neighbors) {
            const key = `${neighbor.x},${neighbor.y}`;
            if (!visited.has(key) && !blockedSet.has(key)) {
                visited.add(key);
                queue.push({
                    pos: neighbor,
                    path: [...current.path, neighbor]
                });
            }
        }
    }

    return null; // No path found
}
