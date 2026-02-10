// frontend/src/types/editorGrid.ts
// Single source of truth for all editor grid constants.
// Separate from PixiJS gameplay constants in localMap.ts.

import type { ZoneType } from './localMap';

/** Grid dimensions used by BOTH world and room editor grids */
export const EDITOR_GRID_SIZE = { cols: 15, rows: 15 } as const;

/** Cell rendering (pixels at zoom 1.0) */
export const EDITOR_GRID_CELL_SIZE = 120;
export const EDITOR_GRID_CELL_GAP = 12;

/** Zoom/pan viewport constants */
export const EDITOR_ZOOM = {
    default: 1.0,
    min: 0.5,
    max: 2.0,
    buttonStep: 0.2,
    wheelStep: 0.1,
} as const;

/** Zone type configuration with labels, icons, and descriptions */
export const ZONE_TYPE_CONFIG: ReadonlyArray<{
    type: ZoneType;
    label: string;
    iconName: 'Droplets' | 'Square' | 'AlertTriangle' | 'Ban';
    colorClass: string;
    description: string;
}> = [
    { type: 'water', label: 'Water', iconName: 'Droplets', colorClass: 'bg-blue-500', description: 'Impassable water' },
    { type: 'wall', label: 'Wall', iconName: 'Square', colorClass: 'bg-gray-600', description: 'Blocks movement and vision' },
    { type: 'hazard', label: 'Hazard', iconName: 'AlertTriangle', colorClass: 'bg-orange-500', description: 'Dangerous terrain' },
    { type: 'no-spawn', label: 'No-Spawn', iconName: 'Ban', colorClass: 'bg-purple-500', description: 'Blocks NPC spawning' },
] as const;

/** Zone cell background colors for overlays */
export const ZONE_CELL_COLORS: Record<string, string> = {
    water: 'bg-blue-500/40',
    wall: 'bg-gray-600/60',
    hazard: 'bg-orange-500/40',
    'no-spawn': 'bg-purple-500/30',
};

/** Room editor tool types */
export type RoomEditorTool = 'pan' | 'npc-place' | 'tile-paint' | 'eraser';
