// frontend/src/types/worldGrid.ts
// View layer types for grid-based world UI components
// Used by WorldEditor, WorldPlayView, MapModal, etc.

import { RoomNPC } from './room';
import { RoomLayoutData } from './localMap';

/**
 * Grid-compatible room format for UI rendering.
 * This is the view layer representation of a room on the grid.
 */
export interface GridRoom {
    id: string;
    name: string;
    description: string;
    introduction_text: string;
    npcs: RoomNPC[];  // Full NPC assignment objects (includes character_uuid, role, hostile, etc.)
    events: any[];
    connections: Record<string, string | null>;  // { north: 'room-id', south: null, ... }
    position: { x: number; y: number };
    image_path?: string;
    layout_data?: RoomLayoutData;  // Spatial layout configuration (NPC positions, dead zones)
}

/**
 * Complete world state for grid UI.
 * This includes the 2D grid of rooms and player position.
 */
export interface GridWorldState {
    uuid?: string;
    grid: (GridRoom | null)[][];
    player_position: { x: number; y: number };
    starting_position?: { x: number; y: number };
    metadata: {
        name: string;
        description: string;
        author?: string | null;
        uuid?: string;
        created_at?: string;
        last_modified?: string;
        cover_image?: string | null;
    };
    grid_size?: {
        width: number;
        height: number;
    };
}

/**
 * NPC display information for UI components.
 * Used for rendering NPC cards and lists.
 */
export interface DisplayNPC {
    id: string;
    name: string;
    imageUrl: string;
    personality?: string;
}
