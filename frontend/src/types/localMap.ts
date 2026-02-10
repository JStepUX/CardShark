// frontend/src/types/localMap.ts
// Types for the local map (tactical grid view within a room)

import { EDITOR_GRID_SIZE } from './editorGrid';

/**
 * Position on the local map grid
 */
export interface TilePosition {
    x: number;
    y: number;
}

/**
 * Allegiance type determines card appearance and combat behavior
 */
export type Allegiance =
    | 'player'
    | 'bonded_ally'
    | 'friendly'
    | 'neutral'
    | 'hostile'
    | 'captured';

/**
 * Entity on the local map (player, companion, or NPC)
 */
export interface LocalMapEntity {
    id: string;
    name: string;
    level: number;
    allegiance: Allegiance;
    position: TilePosition;
    imagePath: string | null;

    // Combat stats (shown during combat)
    currentHp?: number;
    maxHp?: number;
    attack?: number;
    defense?: number;

    // Threat range (for hostile NPCs) - determines engagement distance
    // Default is 1 (adjacent only), higher level enemies have larger threat ranges
    threatRange?: number;

    // Status flags
    isBonded?: boolean;      // Bonded companion (heart badge)
    isCaptured?: boolean;    // Captured state (lock badge)
    isIncapacitated?: boolean; // Knocked out but alive - visually grey and toppled
    isDead?: boolean;        // Permanently dead - will be removed after animation
}

/**
 * Exit direction for room transitions
 */
export type ExitDirection = 'north' | 'south' | 'east' | 'west';

/**
 * Exit tile information
 */
export interface ExitTile {
    direction: ExitDirection;
    position: TilePosition;
    targetRoomId: string;
    targetRoomName: string;
}

/**
 * Terrain type affects movement and visuals
 */
export type TerrainType = 'normal' | 'difficult' | 'impassable' | 'hazard' | 'water';

/**
 * Tile highlight state for visual feedback
 */
export type TileHighlight =
    | 'none'
    | 'player_position'    // Gold glow - where player is
    | 'valid_movement'     // Blue - can move here
    | 'threat_zone'        // Red - adjacent to hostile
    | 'attack_range'       // Red border - can attack here
    | 'exit'               // Exit icon overlay
    // Combat-specific highlights
    | 'selected_target'    // Yellow - selected attack target
    | 'active_combatant'   // Bright gold - current turn entity
    | 'path_preview'       // Light blue - movement path preview
    | 'aoe_preview';       // Orange - AoE blast pattern preview

/**
 * Local map tile data
 */
export interface LocalMapTileData {
    position: TilePosition;
    traversable: boolean;
    terrainType: TerrainType;
    highlight: TileHighlight;
    isExit: boolean;
    exit?: ExitTile;

    // Combat-specific properties (optional, for grid combat system)
    /** Movement cost override (default: derived from terrainType) */
    cost?: number;
    /** Whether tile blocks line of sight for ranged attacks */
    blocksVision?: boolean;
    /** Cover value: reduces incoming ranged damage (0-1, e.g., 0.5 = 50% reduction) */
    coverValue?: number;
    /** Zone type from room layout (for visual indicators) */
    zoneType?: ZoneType;
}

/**
 * Local map configuration
 */
export interface LocalMapConfig {
    gridWidth: number;
    gridHeight: number;
    tileSize: number;
    backgroundImage?: string | null;
}

/**
 * Local map state for rendering
 */
export interface LocalMapState {
    roomId: string;
    roomName: string;
    config: LocalMapConfig;
    tiles: LocalMapTileData[][];
    entities: LocalMapEntity[];
    playerPosition: TilePosition;
    threatZones: TilePosition[];
    exits: ExitTile[];
    inCombat: boolean;
}

/**
 * Allegiance color configuration
 */
export const ALLEGIANCE_COLORS: Record<Allegiance, { frame: number; badge: number }> = {
    player: { frame: 0xFFD700, badge: 0xFFD700 },      // Gold
    bonded_ally: { frame: 0x3B82F6, badge: 0x3B82F6 }, // Blue
    friendly: { frame: 0x3B82F6, badge: 0x3B82F6 },    // Blue
    neutral: { frame: 0x6B7280, badge: 0x6B7280 },     // Gray
    hostile: { frame: 0xEF4444, badge: 0xEF4444 },     // Red
    captured: { frame: 0x3B82F6, badge: 0x6B7280 },    // Blue frame, gray badge
};

/**
 * Highlight color configuration
 */
export const HIGHLIGHT_COLORS: Record<TileHighlight, { color: number; alpha: number }> = {
    none: { color: 0x000000, alpha: 0 },
    player_position: { color: 0xFFD700, alpha: 0.4 },   // Gold
    valid_movement: { color: 0x3B82F6, alpha: 0.3 },    // Blue
    threat_zone: { color: 0xEF4444, alpha: 0.4 },       // Red
    attack_range: { color: 0xEF4444, alpha: 0.6 },      // Red (more opaque)
    exit: { color: 0x10B981, alpha: 0.3 },              // Green
    // Combat-specific highlights
    selected_target: { color: 0xFBBF24, alpha: 0.5 },   // Yellow/Amber
    active_combatant: { color: 0xFFD700, alpha: 0.6 },  // Bright gold
    path_preview: { color: 0x60A5FA, alpha: 0.4 },      // Light blue
    aoe_preview: { color: 0xF97316, alpha: 0.5 },       // Orange for AoE blast
};

// ============================================
// ROOM LAYOUT EDITOR TYPES
// ============================================

/**
 * Cell position in the room layout grid
 */
export interface CellPosition {
    col: number;
    row: number;
}

/**
 * Direction an entity can face
 */
export type FacingDirection = 'up' | 'down' | 'left' | 'right';

/**
 * NPC spawn point configuration
 */
export interface SpawnPoint {
    entityId: string;  // character_uuid of the NPC
    col: number;
    row: number;
    facing?: FacingDirection;
}

/**
 * Zone type for dead zones (impassable or hazardous areas)
 */
export type ZoneType = 'water' | 'wall' | 'hazard' | 'no-spawn';

/**
 * Dead zone definition (water, walls, hazards)
 */
export interface Zone {
    type: ZoneType;
    cells: CellPosition[];
}

/**
 * Container type (future feature)
 */
export type ContainerType = 'chest' | 'barrel' | 'crate';

/**
 * Interactive container definition (future feature)
 */
export interface LayoutContainer {
    id: string;
    col: number;
    row: number;
    type: ContainerType;
    lootTable?: string;
}

/**
 * Exit/stairs type (future feature)
 */
export type ExitType = 'door' | 'stairs' | 'portal';

/**
 * Exit/stairs definition linking rooms (future feature)
 */
export interface LayoutExit {
    col: number;
    row: number;
    targetRoomId: string;
    type: ExitType;
}

/**
 * Room layout data stored in room cards
 * Configures spatial elements: NPC positions, dead zones, containers, exits
 */
export interface RoomLayoutData {
    gridSize: {
        cols: number;  // Default: 9 (matching LocalMapStage)
        rows: number;  // Default: 9 (matching LocalMapStage)
    };
    spawns: SpawnPoint[];
    deadZones: Zone[];
    containers?: LayoutContainer[];  // Future
    exits?: LayoutExit[];            // Future
}

/**
 * Default grid size matching LocalMapStage gameplay dimensions.
 * Re-exported from editorGrid.ts for backward compatibility with gameplay code.
 */
export const DEFAULT_LAYOUT_GRID_SIZE = EDITOR_GRID_SIZE;

/** Tile rendering constants (single source of truth) */
export const LOCAL_MAP_TILE_SIZE = 124;
export const LOCAL_MAP_TILE_GAP = 2;

/** Card sprite dimensions */
export const LOCAL_MAP_CARD_WIDTH = 100;
export const LOCAL_MAP_CARD_HEIGHT = 140;
export const LOCAL_MAP_CARD_PIVOT_FROM_BOTTOM = 40;

/** Canvas padding derived from card overflow above tiles */
export const LOCAL_MAP_CARD_OVERFLOW_PADDING =
    LOCAL_MAP_CARD_HEIGHT - LOCAL_MAP_CARD_PIVOT_FROM_BOTTOM + 20; // 120

/** Zoom viewport constants */
export const LOCAL_MAP_ZOOM = {
    default: 2.2,    // ~5 tiles visible — zoomed-in RPG feel
    min: 0.75,       // full 15x15 grid visible
    max: 3.0,        // close-up inspection
    buttonStep: 0.3,
    wheelStep: 0.15,
    minVisibleFraction: 0.25, // 25% of map must stay in view when panning
} as const;

/**
 * Create a default empty RoomLayoutData
 */
export function createDefaultRoomLayoutData(): RoomLayoutData {
    return {
        gridSize: { ...DEFAULT_LAYOUT_GRID_SIZE },
        spawns: [],
        deadZones: [],
    };
}

/**
 * Find spawn position for an NPC by entity ID
 */
export function findSpawnForEntity(
    layoutData: RoomLayoutData | undefined,
    entityId: string
): SpawnPoint | undefined {
    if (!layoutData) return undefined;
    return layoutData.spawns.find(s => s.entityId === entityId);
}

/**
 * Check if a cell is in a dead zone
 */
export function isCellInDeadZone(
    layoutData: RoomLayoutData | undefined,
    col: number,
    row: number
): boolean {
    if (!layoutData) return false;
    return layoutData.deadZones.some(zone =>
        zone.cells.some(cell => cell.col === col && cell.row === row)
    );
}

/**
 * Get the zone type for a cell (if any)
 */
export function getCellZoneType(
    layoutData: RoomLayoutData | undefined,
    col: number,
    row: number
): ZoneType | null {
    if (!layoutData) return null;
    for (const zone of layoutData.deadZones) {
        if (zone.cells.some(cell => cell.col === col && cell.row === row)) {
            return zone.type;
        }
    }
    return null;
}

/**
 * Remove orphaned spawn points whose entityId is not in the given NPC ID list.
 * Returns a new RoomLayoutData with cleaned spawns, or the original if nothing changed.
 */
export function cleanOrphanedSpawns(
    layoutData: RoomLayoutData,
    npcIds: string[]
): RoomLayoutData {
    const npcIdSet = new Set(npcIds);
    const cleanedSpawns = layoutData.spawns.filter(s => npcIdSet.has(s.entityId));
    if (cleanedSpawns.length === layoutData.spawns.length) return layoutData;
    return { ...layoutData, spawns: cleanedSpawns };
}
