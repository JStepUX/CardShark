// frontend/src/types/localMap.ts
// Types for the local map (tactical grid view within a room)

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
export type TerrainType = 'normal' | 'difficult' | 'impassable' | 'hazard';

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
    | 'path_preview';      // Light blue - movement path preview

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
};
