/**
 * @file LocalMapView.tsx
 * @description React component wrapping the LocalMapStage Pixi.js canvas.
 *
 * This is the main local map component for the Play View.
 * It renders the tactical grid within the current room.
 */

import React, { useRef, useEffect, useCallback, useState, useMemo, useImperativeHandle } from 'react';
import * as PIXI from 'pixi.js';
import { Plus, Minus, RotateCcw, Hand, MousePointer, Music, Volume2 } from 'lucide-react';
import { LocalMapStage } from './LocalMapStage';
import {
    LocalMapState,
    LocalMapEntity,
    LocalMapTileData,
    TilePosition,
    ExitDirection,
    LocalMapConfig,
    DEFAULT_LAYOUT_GRID_SIZE,
    LOCAL_MAP_TILE_SIZE,
    LOCAL_MAP_TILE_GAP,
    LOCAL_MAP_CARD_OVERFLOW_PADDING,
    LOCAL_MAP_ZOOM,
} from '../../../../types/localMap';
import { GridCombatant } from '../../../../types/combat';
import type { BlastPattern } from '../../../../types/inventory';
import { getBlastPattern, CombatGrid } from '../../../../utils/gridCombatUtils';
import { GridWorldState, GridRoom, DisplayNPC } from '../../../../types/worldGrid';
import {
    deriveExitsFromWorld,
    calculateThreatZones,
    autoPlaceEntities,
    getSpawnPosition,
    isInThreatZone,
    areAdjacent,
    findPath,
} from '../../../../utils/localMapUtils';
import { getCellZoneType } from '../../../../types/localMap';
import { TextureCache } from '../../../combat/pixi/TextureCache';
import { soundManager } from '../../../combat/pixi/SoundManager';
import { useSettings } from '../../../../contexts/SettingsContext';

// Debug logging flag - set to true for development debugging
const DEBUG = false;

// Default configuration - uses shared grid size and tile size from localMap.ts
const DEFAULT_CONFIG: LocalMapConfig = {
    gridWidth: DEFAULT_LAYOUT_GRID_SIZE.cols,
    gridHeight: DEFAULT_LAYOUT_GRID_SIZE.rows,
    tileSize: LOCAL_MAP_TILE_SIZE,
};

// Padding around grid for cards that extend above their tiles (from centralized constants)
const CARD_OVERFLOW_PADDING = LOCAL_MAP_CARD_OVERFLOW_PADDING;

/** Extended NPC data with combat info */
interface ResolvedNPC extends DisplayNPC {
    hostile?: boolean;
    monster_level?: number;
}

/** Ref handle for external animation control */
export interface LocalMapViewHandle {
    animateAttack: (attackerId: string, targetId: string, damage: number, onComplete?: () => void) => void;
    showDamageNumber: (entityId: string, damage: number, isCritical?: boolean) => void;
    showMissIndicator: (entityId: string) => void;
    /** Animate entity movement to a target position */
    animateEntityMove: (entityId: string, targetPosition: TilePosition, onComplete?: () => void) => void;
    /** Update entity position directly (no animation) */
    updateEntityPosition: (entityId: string, position: TilePosition) => void;
    /** Play death animation for an entity (shake, red particles, fade out) */
    playDeathAnimation: (entityId: string, onComplete?: () => void) => void;
    /** Play incapacitation animation for an entity (grey, topple) */
    playIncapacitationAnimation: (entityId: string, onComplete?: () => void) => void;
    /** Play revival animation for an entity (stand back up from incapacitated, golden particles) */
    playRevivalAnimation: (entityId: string, onComplete?: () => void) => void;
    /** Play ranged attack effect with projectile and impact */
    playRangedAttackEffect: (attackerId: string, targetId: string, damage: number, isCritical: boolean, onComplete?: () => void) => void;
    /** Play miss whiff effect at target */
    playMissWhiff: (targetId: string) => void;
}

interface LocalMapViewProps {
    /** Current room data */
    currentRoom: GridRoom | null;
    /** World state for deriving exits */
    worldState: GridWorldState | null;
    /** Resolved NPC data with images (from WorldPlayView) */
    roomNpcs?: ResolvedNPC[];
    /** Background image URL */
    backgroundImage?: string | null;
    /** Player entity data */
    player: {
        id: string;
        name: string;
        level: number;
        imagePath: string | null;
        currentHp?: number;
        maxHp?: number;
    };
    /** Bonded companion data (optional) */
    companion?: {
        id: string;
        name: string;
        level: number;
        imagePath: string | null;
        currentHp?: number;
        maxHp?: number;
    } | null;
    /** Initial player position (used when entering from an exit) */
    initialPlayerPosition?: TilePosition;
    /** Entry direction (which exit the player came from) */
    entryDirection?: ExitDirection | null;
    /** Whether combat mode is active */
    inCombat?: boolean;
    /** Called when player clicks a tile to move */
    onTileClick?: (position: TilePosition) => void;
    /** Called when player clicks an entity */
    onEntityClick?: (entityId: string) => void;
    /** Called when player clicks an exit tile */
    onExitClick?: (exit: { direction: ExitDirection; targetRoomId: string }) => void;
    /** Called when player enters a threat zone (triggers combat) */
    onEnterThreatZone?: (hostileIds: string[], currentPosition: TilePosition, mapState: LocalMapState) => void;
    /** Called when map state changes (for external combat system) */
    onMapStateChange?: (state: LocalMapState) => void;
    /** Valid move targets to highlight (from combat system) */
    validMoveTargets?: TilePosition[];
    /** Valid attack targets to highlight (from combat system) */
    validAttackTargets?: GridCombatant[];
    /** Current targeting mode for combat */
    targetingMode?: 'none' | 'move' | 'attack' | 'item' | 'aoe';
    /** AoE blast pattern type for preview overlay (when targetingMode is 'aoe') */
    aoeBlastPattern?: BlastPattern;
    /** Combat map state (used to sync entity positions during combat) */
    combatMapState?: LocalMapState | null;
    /** Configuration overrides */
    config?: Partial<LocalMapConfig>;
    /** Container className */
    className?: string;
    /** Ref for external animation control */
    mapRef?: React.RefObject<LocalMapViewHandle | null>;
}

export const LocalMapView: React.FC<LocalMapViewProps> = ({
    currentRoom,
    worldState,
    roomNpcs,
    backgroundImage,
    player,
    companion,
    initialPlayerPosition,
    entryDirection,
    inCombat = false,
    onTileClick,
    onEntityClick,
    onExitClick,
    onEnterThreatZone,
    onMapStateChange,
    validMoveTargets,
    validAttackTargets,
    targetingMode = 'none',
    aoeBlastPattern,
    combatMapState,
    config: configOverrides,
    className,
    mapRef,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const stageRef = useRef<LocalMapStage | null>(null);

    // Settings for volume control
    const { settings, updateSettings } = useSettings();

    // Track when stage is ready (triggers background update effect)
    const [stageReady, setStageReady] = useState(false);

    // Merge config
    const config = useMemo<LocalMapConfig>(() => ({
        ...DEFAULT_CONFIG,
        ...configOverrides,
        backgroundImage: backgroundImage ?? null,
    }), [configOverrides, backgroundImage]);

    // Track player position - default to center (2,2) for better initial view
    const [playerPosition, setPlayerPosition] = useState<TilePosition>(
        initialPlayerPosition ?? { x: 2, y: 2 }
    );

    // Track loading state for texture preloading
    const [isLoading, setIsLoading] = useState(true);

    // Store placed NPC entities (positions calculated once when room loads)
    const [placedNpcEntities, setPlacedNpcEntities] = useState<LocalMapEntity[]>([]);

    // Track which room we last calculated positions for (to avoid recalculating on companion change)
    const lastPlacedRoomIdRef = useRef<string | null>(null);

    // Track which room we last centered the camera on (for room transition re-centering)
    const lastCenteredRoomRef = useRef<string | null>(null);

    // Movement state for click-to-move
    const [isMoving, setIsMoving] = useState(false);
    const movementAbortRef = useRef(false);

    // Zoom/pan state - start zoomed in for RPG feel (from centralized constants)
    const DEFAULT_ZOOM: number = LOCAL_MAP_ZOOM.default;
    const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
    const [isPanMode, setIsPanMode] = useState(false);
    const isPanModeRef = useRef(false);
    const isPanningRef = useRef(false);
    const lastPanPosRef = useRef({ x: 0, y: 0 });

    // Auto-pan state (edge scrolling)
    const autoPanRef = useRef<{ dx: number; dy: number } | null>(null);
    const autoPanAnimationRef = useRef<number | null>(null);

    // Refs to always get latest handlers (avoids stale closure in Pixi event)
    const handleTileClickRef = useRef<(position: TilePosition) => void>(() => { });
    const onEntityClickRef = useRef<((entityId: string) => void) | undefined>();
    const tileHoverRef = useRef<((position: TilePosition) => void) | null>(null);

    // Keep ref in sync with state
    useEffect(() => {
        isPanModeRef.current = isPanMode;
    }, [isPanMode]);

    // Expose animation methods via ref for external combat control
    useImperativeHandle(mapRef, () => ({
        animateAttack: (attackerId: string, targetId: string, damage: number, onComplete?: () => void) => {
            if (stageRef.current) {
                stageRef.current.animateAttack(attackerId, targetId, damage, onComplete);
            } else {
                onComplete?.();
            }
        },
        showDamageNumber: (entityId: string, damage: number, isCritical: boolean = false) => {
            if (stageRef.current) {
                const pos = stageRef.current.getEntityPosition(entityId);
                if (pos) {
                    stageRef.current.showDamageNumber(pos.x, pos.y, damage, isCritical);
                }
            }
        },
        showMissIndicator: (entityId: string) => {
            if (stageRef.current) {
                const pos = stageRef.current.getEntityPosition(entityId);
                if (pos) {
                    stageRef.current.showMissIndicator(pos.x, pos.y);
                }
            }
        },
        animateEntityMove: (entityId: string, targetPosition: TilePosition, onComplete?: () => void) => {
            if (stageRef.current) {
                stageRef.current.animateEntityMove(entityId, targetPosition);
                // Animation takes ~250ms, call complete after
                setTimeout(() => onComplete?.(), 300);
            } else {
                onComplete?.();
            }
        },
        updateEntityPosition: (entityId: string, position: TilePosition) => {
            if (stageRef.current) {
                stageRef.current.animateEntityMove(entityId, position);
            }
        },
        playDeathAnimation: (entityId: string, onComplete?: () => void) => {
            if (stageRef.current) {
                const card = stageRef.current.getEntityCard(entityId);
                if (card) {
                    card.playDeathAnimation(onComplete);
                } else {
                    onComplete?.();
                }
            } else {
                onComplete?.();
            }
        },
        playIncapacitationAnimation: (entityId: string, onComplete?: () => void) => {
            if (stageRef.current) {
                const card = stageRef.current.getEntityCard(entityId);
                if (card) {
                    card.playIncapacitationAnimation(onComplete);
                } else {
                    onComplete?.();
                }
            } else {
                onComplete?.();
            }
        },
        playRevivalAnimation: (entityId: string, onComplete?: () => void) => {
            if (stageRef.current) {
                const card = stageRef.current.getEntityCard(entityId);
                if (card) {
                    card.playRevivalAnimation(onComplete);
                } else {
                    onComplete?.();
                }
            } else {
                onComplete?.();
            }
        },
        playRangedAttackEffect: (attackerId: string, targetId: string, damage: number, isCritical: boolean, onComplete?: () => void) => {
            if (stageRef.current) {
                stageRef.current.playRangedAttackSequence(attackerId, targetId, damage, isCritical, onComplete);
            } else {
                onComplete?.();
            }
        },
        playMissWhiff: (targetId: string) => {
            if (stageRef.current) {
                stageRef.current.playMissEffect(targetId);
            }
        },
    }), []);

    // Track NPC IDs to detect when room NPCs have loaded/changed
    const lastPlacedNpcIdsRef = useRef<string>('');

    // Calculate NPC positions when room changes OR when roomNpcs change for this room
    useEffect(() => {
        if (!currentRoom) {
            setPlacedNpcEntities([]);
            lastPlacedRoomIdRef.current = null;
            lastPlacedNpcIdsRef.current = '';
            return;
        }

        // Create a signature of current NPCs to detect when they change
        // Include both IDs and image URLs so we re-place when images resolve
        const currentNpcSignature = (roomNpcs ?? []).map(n => {
            const id = 'id' in n ? n.id : (n as any).character_uuid;
            const imageUrl = 'imageUrl' in n ? n.imageUrl : '';
            return `${id}:${imageUrl || 'no-img'}`;
        }).sort().join(',');

        // Recalculate positions if:
        // 1. Room ID changed, OR
        // 2. NPC IDs or images changed (new room's NPCs have loaded or images resolved)
        const roomChanged = lastPlacedRoomIdRef.current !== currentRoom.id;
        const npcsChanged = lastPlacedNpcIdsRef.current !== currentNpcSignature;

        if (!roomChanged && !npcsChanged) {
            return;
        }

        if (DEBUG) console.log('[LocalMapView] Placing NPCs:', { roomChanged, npcsChanged, npcCount: roomNpcs?.length ?? 0 });

        // Get initial player position for NPC placement calculation
        let initialPos = initialPlayerPosition ?? { x: 0, y: Math.floor(config.gridHeight / 2) };
        if (entryDirection && !initialPlayerPosition) {
            initialPos = getSpawnPosition(entryDirection, config);
        }

        // Get all NPCs for this room (exclude player only - companion filtering happens at render time)
        const npcsToPlace = (roomNpcs && roomNpcs.length > 0 ? roomNpcs : currentRoom.npcs)
            ?.filter(npc => {
                const npcId = 'id' in npc ? (npc as ResolvedNPC).id : (npc as any).character_uuid;
                return npcId !== player.id;
            });

        if (npcsToPlace && npcsToPlace.length > 0) {
            const npcData = npcsToPlace.map(npc => {
                const isResolved = 'imageUrl' in npc;
                const resolvedNpc = npc as ResolvedNPC;
                const rawNpc = npc as any;
                return {
                    id: isResolved ? resolvedNpc.id : (rawNpc.character_uuid || rawNpc.name),
                    name: isResolved ? resolvedNpc.name : rawNpc.name,
                    hostile: rawNpc.hostile ?? false,
                    imagePath: isResolved ? resolvedNpc.imageUrl : undefined,
                    level: resolvedNpc.monster_level ?? rawNpc.monster_level ?? 1,
                };
            });

            // Place NPCs once based on initial player position
            // Use layout_data if available for configured spawn positions
            const placed = autoPlaceEntities(npcData, initialPos, config, currentRoom.layout_data);
            setPlacedNpcEntities(placed);
        } else {
            setPlacedNpcEntities([]);
        }

        // Track what we've placed to avoid redundant recalculations
        lastPlacedRoomIdRef.current = currentRoom.id;
        lastPlacedNpcIdsRef.current = currentNpcSignature;
    }, [currentRoom?.id, roomNpcs, player.id, config, entryDirection, initialPlayerPosition]);

    // Build local map state from props (uses pre-calculated NPC positions)
    // When in combat, uses combatMapState entities to reflect combat movement
    const buildMapState = useCallback((): LocalMapState | null => {
        if (!currentRoom) return null;

        // COMBAT MODE: Use entities from combatMapState if available
        // This ensures entity positions reflect combat movement
        if (inCombat && combatMapState && combatMapState.entities.length > 0) {
            // Use the combat-synced entities directly
            // They already have updated positions from the combat engine
            const entities = combatMapState.entities;

            // Derive exits from world topology
            const exits = worldState
                ? deriveExitsFromWorld(currentRoom.id, worldState, config)
                : [];

            // Calculate threat zones (not used in combat, but needed for interface)
            const threatZones = calculateThreatZones(entities, config);

            // Build tile grid with dead zone data from layout
            const tiles: LocalMapTileData[][] = [];
            for (let y = 0; y < config.gridHeight; y++) {
                tiles[y] = [];
                for (let x = 0; x < config.gridWidth; x++) {
                    // Check if this cell is in a dead zone
                    const zoneType = getCellZoneType(currentRoom.layout_data, x, y);
                    let traversable = true;
                    let terrainType: 'normal' | 'difficult' | 'impassable' | 'hazard' | 'water' = 'normal';
                    let blocksVision = false;

                    if (zoneType) {
                        switch (zoneType) {
                            case 'water':
                                traversable = true;   // Can wade through but very slow
                                terrainType = 'water';
                                break;
                            case 'wall':
                                traversable = false;
                                terrainType = 'impassable';
                                blocksVision = true;
                                break;
                            case 'hazard':
                                traversable = true;  // Can walk through but dangerous
                                terrainType = 'hazard';
                                break;
                            case 'no-spawn':
                                traversable = true;  // Can walk through, just blocks NPC placement
                                break;
                        }
                    }

                    tiles[y][x] = {
                        position: { x, y },
                        traversable,
                        terrainType,
                        highlight: 'none',
                        isExit: false,
                        blocksVision,
                        zoneType: zoneType ?? undefined,
                    };
                }
            }

            return {
                roomId: currentRoom.id,
                roomName: currentRoom.name,
                config,
                tiles,
                entities,
                playerPosition: combatMapState.playerPosition,
                threatZones,
                exits,
                inCombat: true,
            };
        }

        // EXPLORATION MODE: Build from props
        // Build entity list
        const entities: LocalMapEntity[] = [];

        // Add player at current position
        entities.push({
            id: player.id,
            name: player.name,
            level: player.level,
            allegiance: 'player',
            position: playerPosition,
            imagePath: player.imagePath,
            currentHp: player.currentHp ?? 100,
            maxHp: player.maxHp ?? 100,
        });

        // Add companion if present - follows player
        if (companion) {
            // Position companion adjacent to player
            const companionPos: TilePosition = {
                x: Math.max(0, playerPosition.x - 1),
                y: playerPosition.y,
            };
            entities.push({
                id: companion.id,
                name: companion.name,
                level: companion.level,
                allegiance: 'bonded_ally',
                position: companionPos,
                imagePath: companion.imagePath,
                currentHp: companion.currentHp ?? 100,
                maxHp: companion.maxHp ?? 100,
                isBonded: true,
            });
        }

        // Add pre-placed room NPCs (positions don't change when player moves)
        // Filter out bonded companion here (they're handled above with follow behavior)
        const nonCompanionNpcs = companion
            ? placedNpcEntities.filter(npc => npc.id !== companion.id)
            : placedNpcEntities;
        entities.push(...nonCompanionNpcs);

        // Derive exits from world topology
        const exits = worldState
            ? deriveExitsFromWorld(currentRoom.id, worldState, config)
            : [];

        // Calculate threat zones
        const threatZones = calculateThreatZones(entities, config);

        // Build tile grid with dead zone data from layout
        // This is needed for pathfinding and combat movement
        const tiles: LocalMapTileData[][] = [];
        for (let y = 0; y < config.gridHeight; y++) {
            tiles[y] = [];
            for (let x = 0; x < config.gridWidth; x++) {
                // Check if this cell is in a dead zone
                const zoneType = getCellZoneType(currentRoom.layout_data, x, y);
                let traversable = true;
                let terrainType: 'normal' | 'difficult' | 'impassable' | 'hazard' | 'water' = 'normal';
                let blocksVision = false;

                if (zoneType) {
                    switch (zoneType) {
                        case 'water':
                            traversable = true;   // Can wade through but very slow
                            terrainType = 'water';
                            break;
                        case 'wall':
                            traversable = false;
                            terrainType = 'impassable';
                            blocksVision = true;
                            break;
                        case 'hazard':
                            traversable = true;  // Can walk through but dangerous
                            terrainType = 'hazard';
                            break;
                        case 'no-spawn':
                            traversable = true;  // Can walk through, just blocks NPC placement
                            break;
                    }
                }

                tiles[y][x] = {
                    position: { x, y },
                    traversable,
                    terrainType,
                    highlight: 'none',
                    isExit: false,
                    blocksVision,
                    zoneType: zoneType ?? undefined,
                };
            }
        }

        return {
            roomId: currentRoom.id,
            roomName: currentRoom.name,
            config,
            tiles,
            entities,
            playerPosition,
            threatZones,
            exits,
            inCombat,
        };
    }, [currentRoom, worldState, player, companion, playerPosition, placedNpcEntities, config, inCombat, combatMapState]);

    // ============================================
    // ZOOM/PAN HANDLERS
    // ============================================

    // Track last known mouse position within the container for button-triggered zoom
    const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

    const handleZoomIn = useCallback(() => {
        if (!stageRef.current) return;
        const newZoom = Math.min(stageRef.current.getZoom() + LOCAL_MAP_ZOOM.buttonStep, LOCAL_MAP_ZOOM.max);
        const mp = lastMousePosRef.current;
        if (mp) {
            stageRef.current.setZoom(newZoom, mp.x, mp.y);
        } else {
            stageRef.current.setZoom(newZoom);
        }
        setCurrentZoom(newZoom);
    }, []);

    const handleZoomOut = useCallback(() => {
        if (!stageRef.current) return;
        const newZoom = Math.max(stageRef.current.getZoom() - LOCAL_MAP_ZOOM.buttonStep, LOCAL_MAP_ZOOM.min);
        const mp = lastMousePosRef.current;
        if (mp) {
            stageRef.current.setZoom(newZoom, mp.x, mp.y);
        } else {
            stageRef.current.setZoom(newZoom);
        }
        setCurrentZoom(newZoom);
    }, []);

    const handleResetZoom = useCallback(() => {
        if (!stageRef.current || !containerRef.current) return;
        // Reset to default zoom and recenter on player
        stageRef.current.setZoom(DEFAULT_ZOOM);
        const rect = containerRef.current.getBoundingClientRect();
        const viewportWidth = rect.width - CARD_OVERFLOW_PADDING * 2;
        const viewportHeight = rect.height - CARD_OVERFLOW_PADDING * 2;
        stageRef.current.centerOnTile(playerPosition, viewportWidth, viewportHeight);
        setCurrentZoom(DEFAULT_ZOOM);
    }, [playerPosition]);

    // Mouse wheel zoom handler
    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (!stageRef.current || !containerRef.current) return;

        e.preventDefault();

        // Get mouse position relative to canvas
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - CARD_OVERFLOW_PADDING;
        const mouseY = e.clientY - rect.top - CARD_OVERFLOW_PADDING;

        // Calculate zoom delta
        const zoomDelta = e.deltaY > 0 ? -LOCAL_MAP_ZOOM.wheelStep : LOCAL_MAP_ZOOM.wheelStep;
        const newZoom = Math.max(LOCAL_MAP_ZOOM.min, Math.min(LOCAL_MAP_ZOOM.max, stageRef.current.getZoom() + zoomDelta));

        // Zoom toward cursor position
        stageRef.current.setZoom(newZoom, mouseX, mouseY);
        setCurrentZoom(newZoom);
    }, []);

    // Pan start handler (middle mouse, Ctrl+left mouse, right mouse, or any click in pan mode)
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // In pan mode, any left click starts panning (use ref to avoid stale closure)
        if (isPanModeRef.current && e.button === 0) {
            e.preventDefault();
            isPanningRef.current = true;
            lastPanPosRef.current = { x: e.clientX, y: e.clientY };
            return;
        }
        // Middle mouse button (1), Ctrl+left mouse (0), or right mouse (2)
        if (e.button === 1 || e.button === 2 || (e.button === 0 && e.ctrlKey)) {
            e.preventDefault();
            isPanningRef.current = true;
            lastPanPosRef.current = { x: e.clientX, y: e.clientY };
        }
    }, []);

    // Prevent context menu on right-click (for pan)
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
    }, []);

    // ============================================
    // AUTO-PAN (EDGE SCROLLING)
    // ============================================

    // Edge zone size in pixels (how close to edge triggers auto-pan)
    // Reduced from 60 to 30 to be less aggressive and avoid triggering over UI
    const EDGE_ZONE = 30;
    // Auto-pan speed (pixels per frame at 60fps)
    const AUTO_PAN_SPEED = 3;

    // Start auto-pan animation loop
    const startAutoPan = useCallback(() => {
        if (autoPanAnimationRef.current !== null) return;

        const animate = () => {
            const dir = autoPanRef.current;
            if (dir && stageRef.current && (dir.dx !== 0 || dir.dy !== 0)) {
                stageRef.current.pan(dir.dx * AUTO_PAN_SPEED, dir.dy * AUTO_PAN_SPEED);
            }
            autoPanAnimationRef.current = requestAnimationFrame(animate);
        };
        autoPanAnimationRef.current = requestAnimationFrame(animate);
    }, []);

    // Stop auto-pan animation loop
    const stopAutoPan = useCallback(() => {
        if (autoPanAnimationRef.current !== null) {
            cancelAnimationFrame(autoPanAnimationRef.current);
            autoPanAnimationRef.current = null;
        }
        autoPanRef.current = null;
    }, []);

    // Check if mouse is in edge zone and update auto-pan direction
    const updateAutoPan = useCallback((e: React.MouseEvent) => {
        if (!containerRef.current || isPanningRef.current) {
            stopAutoPan();
            return;
        }

        // Don't trigger auto-pan when hovering over UI elements (buttons, etc.)
        const target = e.target as HTMLElement;
        if (target.tagName === 'BUTTON' || target.closest('button') || target.closest('.z-20')) {
            stopAutoPan();
            return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const width = rect.width;
        const height = rect.height;

        let dx = 0;
        let dy = 0;

        // Check horizontal edges
        if (x < EDGE_ZONE) {
            dx = 1; // Pan right (move content right = reveal left side)
        } else if (x > width - EDGE_ZONE) {
            dx = -1; // Pan left
        }

        // Check vertical edges
        if (y < EDGE_ZONE) {
            dy = 1; // Pan down
        } else if (y > height - EDGE_ZONE) {
            dy = -1; // Pan up
        }

        if (dx !== 0 || dy !== 0) {
            autoPanRef.current = { dx, dy };
            startAutoPan();
        } else {
            stopAutoPan();
        }
    }, [startAutoPan, stopAutoPan]);

    // Handle mouse leave - stop auto-pan
    const handleMouseLeave = useCallback(() => {
        isPanningRef.current = false;
        lastMousePosRef.current = null;
        stopAutoPan();
    }, [stopAutoPan]);

    // Clean up auto-pan on unmount
    useEffect(() => {
        return () => {
            if (autoPanAnimationRef.current !== null) {
                cancelAnimationFrame(autoPanAnimationRef.current);
            }
        };
    }, []);

    // Initialize sound manager and sync volume settings
    useEffect(() => {
        soundManager.init();
    }, []);

    // Sync volume settings to sound manager when settings change
    useEffect(() => {
        const sfxVol = (settings.sfxVolume ?? 50) / 100;
        const musicVol = (settings.musicVolume ?? 30) / 100;
        soundManager.setSfxVolume(sfxVol);
        soundManager.setMusicVolume(musicVol);
    }, [settings.sfxVolume, settings.musicVolume]);

    // Volume change handlers
    const handleSfxVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10);
        soundManager.setSfxVolume(value / 100);
        updateSettings({ sfxVolume: value });
    }, [updateSettings]);

    const handleMusicVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10);
        soundManager.setMusicVolume(value / 100);
        updateSettings({ musicVolume: value });
    }, [updateSettings]);

    // Pan move handler
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        // Track mouse position for zoom-toward-cursor on button clicks
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            lastMousePosRef.current = {
                x: e.clientX - rect.left - CARD_OVERFLOW_PADDING,
                y: e.clientY - rect.top - CARD_OVERFLOW_PADDING,
            };
        }

        // Manual panning (drag)
        if (isPanningRef.current && stageRef.current) {
            const dx = e.clientX - lastPanPosRef.current.x;
            const dy = e.clientY - lastPanPosRef.current.y;
            lastPanPosRef.current = { x: e.clientX, y: e.clientY };
            stageRef.current.pan(dx, dy);
            return;
        }

        // Auto-pan edge detection (only when not manually panning)
        updateAutoPan(e);
    }, [updateAutoPan]);

    // Pan end handler
    const handleMouseUp = useCallback(() => {
        isPanningRef.current = false;
    }, []);

    // ============================================
    // CLICK-TO-MOVE MOVEMENT
    // ============================================

    // Helper to get blocked tiles (NPC and companion positions)
    // Excludes a specific destination tile if provided (so we can path TO an entity)
    const getBlockedTiles = useCallback((excludePosition?: TilePosition): TilePosition[] => {
        const blocked: TilePosition[] = [];

        // Add NPC positions
        for (const entity of placedNpcEntities) {
            // Skip if this is the excluded destination
            if (excludePosition &&
                entity.position.x === excludePosition.x &&
                entity.position.y === excludePosition.y) {
                continue;
            }
            blocked.push(entity.position);
        }

        // Add companion position if present (companion follows player, shouldn't block)
        // Actually, companion moves with player so we don't need to block their tile

        return blocked;
    }, [placedNpcEntities]);

    // Helper to find a safe adjacent position for companion that doesn't overlap enemies
    const findSafeCompanionPosition = useCallback((
        playerPos: TilePosition,
        entities: LocalMapEntity[]
    ): TilePosition => {
        // Get all enemy positions
        const enemyPositions = entities
            .filter(e => e.allegiance === 'hostile')
            .map(e => e.position);

        // Adjacent offsets in priority order: left, up-left, down-left, up, down, right, up-right, down-right
        const adjacentOffsets: TilePosition[] = [
            { x: -1, y: 0 },   // left (preferred)
            { x: -1, y: -1 },  // up-left
            { x: -1, y: 1 },   // down-left
            { x: 0, y: -1 },   // up
            { x: 0, y: 1 },    // down
            { x: 1, y: 0 },    // right
            { x: 1, y: -1 },   // up-right
            { x: 1, y: 1 },    // down-right
        ];

        for (const offset of adjacentOffsets) {
            const candidatePos: TilePosition = {
                x: playerPos.x + offset.x,
                y: playerPos.y + offset.y,
            };

            // Check bounds
            if (candidatePos.x < 0 || candidatePos.x >= config.gridWidth ||
                candidatePos.y < 0 || candidatePos.y >= config.gridHeight) {
                continue;
            }

            // Check if occupied by enemy
            const isOccupiedByEnemy = enemyPositions.some(
                ep => ep.x === candidatePos.x && ep.y === candidatePos.y
            );

            if (!isOccupiedByEnemy) {
                return candidatePos;
            }
        }

        // Fallback: return left position even if out of bounds (clamp to 0)
        // This shouldn't happen in practice if grid is big enough
        return { x: Math.max(0, playerPos.x - 1), y: playerPos.y };
    }, [config.gridWidth, config.gridHeight]);

    // Check if a tile is occupied by any entity (NPC or companion)
    const isTileOccupied = useCallback((position: TilePosition, mapState: LocalMapState): boolean => {
        // Check against all non-player entities
        return mapState.entities.some(entity =>
            entity.allegiance !== 'player' &&
            entity.position.x === position.x &&
            entity.position.y === position.y
        );
    }, []);

    // Animate a single step
    const animateStep = useCallback((target: TilePosition): Promise<void> => {
        return new Promise(resolve => {
            setPlayerPosition(target);
            if (stageRef.current) {
                stageRef.current.animateEntityMove(player.id, target);
            }
            // Match EntityCardSprite animation duration (250ms)
            setTimeout(resolve, 250);
        });
    }, [player.id]);

    // Start movement along a path
    const startMovement = useCallback(async (
        destination: TilePosition,
        mapState: LocalMapState
    ) => {
        if (isMoving) return;

        // Check if destination is occupied - don't allow moving onto occupied tiles
        if (isTileOccupied(destination, mapState)) {
            // Find the entity and trigger click instead
            const entityAtTile = mapState.entities.find(e =>
                e.allegiance !== 'player' &&
                e.position.x === destination.x &&
                e.position.y === destination.y
            );
            if (entityAtTile) {
                onEntityClick?.(entityAtTile.id);
            }
            return;
        }

        // Find path using BFS (all entity tiles are blocked)
        const path = findPath(playerPosition, destination, config, getBlockedTiles());
        if (!path || path.length <= 1) return;

        setIsMoving(true);
        movementAbortRef.current = false;

        // Walk each step
        for (let i = 1; i < path.length; i++) {
            if (movementAbortRef.current) break;

            const nextTile = path[i];

            // Check for threat zone BEFORE moving (only if not already in combat)
            if (!inCombat && isInThreatZone(nextTile, mapState.threatZones)) {
                // Move to threat zone tile first
                await animateStep(nextTile);

                // Find hostile NPCs adjacent to this position
                const hostileIds = mapState.entities
                    .filter(e => e.allegiance === 'hostile')
                    .filter(e => {
                        const dx = Math.abs(e.position.x - nextTile.x);
                        const dy = Math.abs(e.position.y - nextTile.y);
                        return dx <= 1 && dy <= 1;
                    })
                    .map(e => e.id);

                if (hostileIds.length > 0) {
                    // Pass current position and updated map state to combat
                    // Must update BOTH playerPosition AND the player entity's position
                    // Also update companion position to stay adjacent to player (avoiding enemies)
                    const companionPos = findSafeCompanionPosition(nextTile, mapState.entities);
                    const updatedEntities = mapState.entities.map(e => {
                        if (e.allegiance === 'player') return { ...e, position: nextTile };
                        if (e.allegiance === 'bonded_ally') return { ...e, position: companionPos };
                        return e;
                    });
                    const updatedMapState: LocalMapState = {
                        ...mapState,
                        playerPosition: nextTile,
                        entities: updatedEntities,
                    };
                    onEnterThreatZone?.(hostileIds, nextTile, updatedMapState);
                }
                break; // Stop movement after entering threat zone
            }

            // Check if this is an exit tile
            const exit = mapState.exits.find(
                e => e.position.x === nextTile.x && e.position.y === nextTile.y
            );

            // Animate one step
            await animateStep(nextTile);

            // If we landed on an exit tile, trigger exit after step completes
            if (exit) {
                onExitClick?.({
                    direction: exit.direction,
                    targetRoomId: exit.targetRoomId,
                });
                break;
            }

            onTileClick?.(nextTile);
        }

        setIsMoving(false);
    }, [isMoving, playerPosition, config, getBlockedTiles, inCombat, animateStep, onEnterThreatZone, onExitClick, onTileClick, isTileOccupied, onEntityClick, findSafeCompanionPosition]);

    // Initialize Pixi application
    useEffect(() => {
        if (!containerRef.current) return;

        // Use LOCAL variable (not ref) so each effect invocation has its own flag
        // This prevents React Strict Mode race conditions where resetting the ref
        // would allow a cancelled initPixi() to continue
        let isCleanedUp = false;

        // Also track the app locally so cleanup can find it even if ref gets cleared
        let localApp: PIXI.Application | null = null;
        let localStage: LocalMapStage | null = null;

        const initPixi = async () => {
            if (isCleanedUp) return;
            if (DEBUG) console.log('[LocalMapView] initializing Pixi...');

            // Collect all image paths for preloading
            const imagePaths: string[] = [
                player.imagePath,
                companion?.imagePath,
                ...(roomNpcs?.map(n => n.imageUrl) ?? []),
            ].filter((p): p is string => Boolean(p));

            if (DEBUG) console.log('[LocalMapView] Preloading textures:', imagePaths);

            // Preload all textures before rendering
            if (imagePaths.length > 0) {
                try {
                    await TextureCache.preload(imagePaths);
                    if (DEBUG) console.log('[LocalMapView] Preload complete');
                } catch (err) {
                    console.warn('[LocalMapView] Some textures failed to preload:', err);
                    // Continue anyway - fallback textures will be used
                }
            }

            if (isCleanedUp) {
                setIsLoading(false);
                return;
            }

            // Calculate dimensions with padding for card overflow
            const stageWidth = config.gridWidth * (config.tileSize + LOCAL_MAP_TILE_GAP);
            const stageHeight = config.gridHeight * (config.tileSize + LOCAL_MAP_TILE_GAP);
            const canvasWidth = stageWidth + CARD_OVERFLOW_PADDING * 2;
            const canvasHeight = stageHeight + CARD_OVERFLOW_PADDING * 2;

            if (DEBUG) console.log(`[LocalMapView] Creating app: ${canvasWidth}x${canvasHeight}`);

            // Create Pixi application with transparent background
            // so blurred room image shows through letterbox areas
            const app = new PIXI.Application();
            await app.init({
                width: canvasWidth,
                height: canvasHeight,
                backgroundAlpha: 0, // Transparent to show blur behind
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
            });

            if (isCleanedUp) {
                app.destroy(true, { children: true });
                return;
            }

            localApp = app;
            appRef.current = app;

            // Add canvas to DOM with z-index above blurred background
            if (containerRef.current) {
                const canvas = app.canvas as HTMLCanvasElement;
                canvas.style.position = 'relative';
                canvas.style.zIndex = '10';
                containerRef.current.appendChild(canvas);
                if (DEBUG) console.log('[LocalMapView] Canvas appended to DOM');
            } else if (DEBUG) {
                console.error('[LocalMapView] Container ref is missing!');
            }

            // Create stage and offset it to center within padded canvas
            const stage = new LocalMapStage(config);
            stage.x = CARD_OVERFLOW_PADDING;
            stage.y = CARD_OVERFLOW_PADDING;
            localStage = stage;
            stageRef.current = stage;
            app.stage.addChild(stage);

            // Initialize particle system for combat effects
            stage.initParticleSystem(app);

            // Set up event handlers (use refs to avoid stale closures)
            stage.on('tileClicked', (position: TilePosition) => {
                handleTileClickRef.current(position);
            });

            stage.on('entityClicked', (entityId: string) => {
                if (DEBUG) console.log('[LocalMapView] Received entityClicked event:', entityId, 'has handler:', !!onEntityClickRef.current);
                if (onEntityClickRef.current) {
                    onEntityClickRef.current(entityId);
                } else if (DEBUG) {
                    console.warn('[LocalMapView] No entity click handler set!');
                }
            });

            stage.on('tileHovered', (position: TilePosition) => {
                if (tileHoverRef.current) {
                    tileHoverRef.current(position);
                }
            });

            // Set up ticker for animations
            app.ticker.add((ticker) => {
                stage.updateAnimations(ticker.deltaTime / 60);
            });

            // Initial state update
            const mapState = buildMapState();
            if (mapState) {
                stage.updateFromState(mapState);
            }

            // Set initial zoom and center on player
            stage.setZoom(DEFAULT_ZOOM);
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                // Center on player position (accounting for padding)
                const viewportWidth = rect.width - CARD_OVERFLOW_PADDING * 2;
                const viewportHeight = rect.height - CARD_OVERFLOW_PADDING * 2;
                stage.centerOnTile(playerPosition, viewportWidth, viewportHeight);
            }

            // Mark stage ready (triggers background effect)
            setStageReady(true);

            // Mark loading complete
            if (DEBUG) console.log('[LocalMapView] Initialization complete');
            setIsLoading(false);
        };

        // Execute initialization with error handling
        (async () => {
            try {
                await initPixi();
            } catch (error) {
                console.error('Failed to initialize local map:', error);
                // Ensure loading state clears even on error
                setIsLoading(false);
            }
        })();

        return () => {
            // Set local flag - this only affects THIS invocation's initPixi()
            isCleanedUp = true;

            // Reset stage ready state
            setStageReady(false);

            // Stop the ticker FIRST to prevent any pending animations/updates
            if (localApp) {
                localApp.ticker.stop();
            }

            // Clean up stage (wrap in try/catch for texture pool race conditions)
            if (localStage) {
                try {
                    localStage.destroy();
                } catch (error) {
                    console.warn('[LocalMapView] Error destroying stage:', error);
                }
            }
            stageRef.current = null;

            // Clean up app and remove canvas from DOM
            if (localApp) {
                const canvas = localApp.canvas;
                if (canvas && canvas.parentNode) {
                    canvas.parentNode.removeChild(canvas);
                }
                try {
                    localApp.destroy(true, { children: true });
                } catch (error) {
                    console.warn('[LocalMapView] Error destroying app:', error);
                }
            }
            appRef.current = null;
        };
    }, []); // Only run once on mount

    // Keyboard shortcuts with smooth WASD panning
    useEffect(() => {
        const PAN_SPEED = 8; // Pixels per frame (smooth)
        const keysHeld = new Set<string>();
        let animationId: number | null = null;

        const updatePan = () => {
            if (!stageRef.current || keysHeld.size === 0) {
                animationId = null;
                return;
            }

            let dx = 0, dy = 0;
            if (keysHeld.has('w')) dy += PAN_SPEED;
            if (keysHeld.has('s')) dy -= PAN_SPEED;
            if (keysHeld.has('a')) dx += PAN_SPEED;
            if (keysHeld.has('d')) dx -= PAN_SPEED;

            if (dx !== 0 || dy !== 0) {
                stageRef.current.pan(dx, dy);
            }

            animationId = requestAnimationFrame(updatePan);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input field or contentEditable (TipTap editor)
            if (e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                (e.target instanceof HTMLElement && e.target.isContentEditable)) {
                return;
            }

            // P key toggles pan mode
            if (e.key === 'p' || e.key === 'P') {
                setIsPanMode(prev => !prev);
                return;
            }

            // WASD camera panning
            const key = e.key.toLowerCase();
            if (['w', 'a', 's', 'd'].includes(key)) {
                e.preventDefault();
                if (!keysHeld.has(key)) {
                    keysHeld.add(key);
                    if (!animationId) {
                        animationId = requestAnimationFrame(updatePan);
                    }
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            keysHeld.delete(key);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            if (animationId) cancelAnimationFrame(animationId);
        };
    }, []);

    // Handle tile click - uses click-to-move for distant tiles
    const handleTileClick = useCallback((position: TilePosition) => {
        // Ignore clicks in pan mode (use ref to avoid stale closure)
        if (isPanModeRef.current) return;

        const mapState = buildMapState();
        if (!mapState) return;

        // COMBAT MODE: Delegate all clicks to parent handler for combat engine
        // Combat movement is handled by gridCombat.handleTileClick via onTileClick
        if (inCombat) {
            // Check if tile has an entity for attack targeting
            const entityAtTile = mapState.entities.find(e =>
                e.allegiance !== 'player' &&
                e.position.x === position.x &&
                e.position.y === position.y
            );

            if (entityAtTile) {
                onEntityClick?.(entityAtTile.id);
            } else {
                onTileClick?.(position);
            }
            return;
        }

        // EXPLORATION MODE: Handle movement internally

        // Check if this is an exit tile - exits are always clickable regardless of traversability
        const isExitTile = mapState.exits.some(
            e => e.position.x === position.x && e.position.y === position.y
        );

        // Check if the clicked tile is traversable (walls block movement)
        // Exception: exit tiles are always allowed (safety net for misconfigured layouts)
        const tileData = mapState.tiles[position.y]?.[position.x];
        if (tileData && !tileData.traversable && !isExitTile) {
            // Don't allow clicking on impassable tiles (walls)
            return;
        }

        // Ignore clicks while already moving
        if (isMoving) {
            // Abort current movement and start new path
            movementAbortRef.current = true;
            return;
        }

        // Check if clicking current position (no movement needed)
        const isClickingCurrentPos =
            playerPosition.x === position.x &&
            playerPosition.y === position.y;

        // Check if this is an exit tile
        const exit = mapState.exits.find(
            e => e.position.x === position.x && e.position.y === position.y
        );

        // If player is ON the exit tile and clicks it, trigger exit immediately
        if (exit && isClickingCurrentPos) {
            onExitClick?.({
                direction: exit.direction,
                targetRoomId: exit.targetRoomId,
            });
            return;
        }

        // Check if player is ADJACENT to an exit tile they clicked
        if (exit && areAdjacent(playerPosition, position)) {
            // Walk to exit tile, then trigger exit (handled by startMovement)
            startMovement(position, mapState);
            return;
        }

        // Check if player clicked on themselves (opens inventory in exploration mode)
        if (isClickingCurrentPos) {
            onEntityClick?.(player.id);
            return;
        }

        // Check if the tile is occupied by another entity (NPCs, companions)
        // If so, clicking on them should trigger entity interaction, not movement
        if (isTileOccupied(position, mapState)) {
            // Find the entity at this position
            const entityAtTile = mapState.entities.find(e =>
                e.allegiance !== 'player' &&
                e.position.x === position.x &&
                e.position.y === position.y
            );

            if (entityAtTile) {
                // Trigger entity click instead of movement
                onEntityClick?.(entityAtTile.id);
            }
            return; // Don't allow movement onto occupied tile
        }

        // Check if this is an adjacent tile (simple 1-step move)
        const isAdjacent = areAdjacent(playerPosition, position);

        if (isAdjacent) {
            // Single step - check for threat zone
            if (isInThreatZone(position, mapState.threatZones)) {
                // Find hostile NPCs adjacent to this position
                const hostileIds = mapState.entities
                    .filter(e => e.allegiance === 'hostile')
                    .filter(e => {
                        const dx = Math.abs(e.position.x - position.x);
                        const dy = Math.abs(e.position.y - position.y);
                        return dx <= 1 && dy <= 1;
                    })
                    .map(e => e.id);

                // Move to the tile first
                setPlayerPosition(position);
                if (stageRef.current) {
                    stageRef.current.animateEntityMove(player.id, position);
                }

                // Then trigger combat with updated map state
                // Must update BOTH playerPosition AND the player entity's position
                // Also update companion position to stay adjacent to player (avoiding enemies)
                if (hostileIds.length > 0) {
                    const companionPos = findSafeCompanionPosition(position, mapState.entities);
                    const updatedEntities = mapState.entities.map(e => {
                        if (e.allegiance === 'player') return { ...e, position: position };
                        if (e.allegiance === 'bonded_ally') return { ...e, position: companionPos };
                        return e;
                    });
                    const updatedMapState: LocalMapState = {
                        ...mapState,
                        playerPosition: position,
                        entities: updatedEntities,
                    };
                    onEnterThreatZone?.(hostileIds, position, updatedMapState);
                }
                onTileClick?.(position);
                return;
            }

            // Simple adjacent move (no threat)
            setPlayerPosition(position);
            if (stageRef.current) {
                stageRef.current.animateEntityMove(player.id, position);
            }
            onTileClick?.(position);
            return;
        }

        // Distant tile - use click-to-move pathfinding
        startMovement(position, mapState);
    }, [isMoving, buildMapState, playerPosition, inCombat, onExitClick, onEnterThreatZone, onTileClick, onEntityClick, startMovement, player.id, isTileOccupied, findSafeCompanionPosition]);

    // Keep refs updated to avoid stale closure in Pixi event handler
    useEffect(() => {
        handleTileClickRef.current = handleTileClick;
    }, [handleTileClick]);

    useEffect(() => {
        if (DEBUG) console.log('[LocalMapView] Updating onEntityClickRef, handler exists:', !!onEntityClick, 'inCombat:', inCombat);
        onEntityClickRef.current = onEntityClick;
    }, [onEntityClick, inCombat]);

    // Update stage when state changes
    // IMPORTANT: Include stageReady in deps to ensure this runs after Pixi init completes
    // This fixes a race condition where NPC placement happens before stage is ready
    useEffect(() => {
        if (!stageRef.current || !stageReady) return;

        const mapState = buildMapState();
        if (mapState) {
            // Reduce log noise - only log significant changes
            // console.log('[LocalMapView] Updating stage with mapState', { inCombat, entityCount: mapState.entities.length });

            // Update player position in state
            mapState.playerPosition = playerPosition;
            mapState.threatZones = calculateThreatZones(mapState.entities, config);

            stageRef.current.updateFromState(mapState);
            stageRef.current.setCombatMode(inCombat);

            // Re-center camera on player when room changes
            if (currentRoom?.id !== lastCenteredRoomRef.current) {
                lastCenteredRoomRef.current = currentRoom?.id ?? null;
                if (containerRef.current) {
                    stageRef.current.setZoom(DEFAULT_ZOOM);
                    const rect = containerRef.current.getBoundingClientRect();
                    const viewportWidth = rect.width - CARD_OVERFLOW_PADDING * 2;
                    const viewportHeight = rect.height - CARD_OVERFLOW_PADDING * 2;
                    stageRef.current.centerOnTile(playerPosition, viewportWidth, viewportHeight);
                    setCurrentZoom(DEFAULT_ZOOM);
                }
            }

            // Notify parent of map state for external combat system
            // Only when NOT in combat - once combat starts, combat engine owns the state
            if (!inCombat) {
                onMapStateChange?.(mapState);
            }
        }
    }, [currentRoom, worldState, player, companion, playerPosition, inCombat, buildMapState, onMapStateChange, stageReady]);

    // Update background when it changes or stage becomes ready
    useEffect(() => {
        if (DEBUG) console.log('[LocalMapView] Background effect - image:', backgroundImage, 'stageReady:', stageReady);
        if (stageRef.current && backgroundImage && stageReady) {
            if (DEBUG) console.log('[LocalMapView] Setting background image:', backgroundImage);
            stageRef.current.setBackgroundImage(backgroundImage);
        }
    }, [backgroundImage, stageReady]);

    // Update tile highlights based on targeting mode (combat)
    useEffect(() => {
        if (!stageRef.current || !inCombat) return;

        // Clear previous highlights first
        stageRef.current.clearActionHighlights();

        if (targetingMode === 'move' && validMoveTargets && validMoveTargets.length > 0) {
            if (DEBUG) console.log('[LocalMapView] Showing valid move targets:', validMoveTargets.length);
            stageRef.current.showValidMoves(validMoveTargets);
        } else if (targetingMode === 'attack' && validAttackTargets && validAttackTargets.length > 0) {
            if (DEBUG) console.log('[LocalMapView] Showing valid attack targets:', validAttackTargets.length);
            const attackPositions = validAttackTargets.map(t => t.position);
            stageRef.current.showAttackRange(attackPositions);
            // Also highlight the entity cards themselves
            for (const target of validAttackTargets) {
                stageRef.current.highlightEntity(target.id, true);
            }
        }

        // Cleanup: clear entity highlights when mode changes
        return () => {
            if (stageRef.current && validAttackTargets) {
                for (const target of validAttackTargets) {
                    stageRef.current.highlightEntity(target.id, false);
                }
            }
        };
    }, [inCombat, targetingMode, validMoveTargets, validAttackTargets]);

    // AoE blast pattern preview: update on tile hover when in 'aoe' targeting mode
    useEffect(() => {
        if (!inCombat || targetingMode !== 'aoe' || !aoeBlastPattern) {
            tileHoverRef.current = null;
            return;
        }

        tileHoverRef.current = (position: TilePosition) => {
            if (!stageRef.current) return;
            // Clear previous AoE preview highlights
            stageRef.current.clearActionHighlights();
            // Compute blast pattern tiles
            const grid: CombatGrid = {
                width: config.gridWidth,
                height: config.gridHeight,
                tiles: [], // getBlastPattern only uses width/height for bounds checking
            };
            const blastTiles = getBlastPattern(position, aoeBlastPattern, grid);
            stageRef.current.showAoEPreview(blastTiles);
        };

        return () => {
            tileHoverRef.current = null;
            // Clear AoE preview on cleanup
            if (stageRef.current) {
                stageRef.current.clearActionHighlights();
            }
        };
    }, [inCombat, targetingMode, aoeBlastPattern, config.gridWidth, config.gridHeight]);

    // Always render the container div so the ref is attached for Pixi initialization
    // Show loading overlay on top while textures preload
    return (
        <div
            ref={containerRef}
            className={`local-map-container ${className ?? ''} ${isPanMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden',
                backgroundColor: '#1a1a1a',
                position: 'relative',
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onContextMenu={handleContextMenu}
        >
            {/* Blurred background to fill letterboxing areas */}
            {backgroundImage && (
                <div
                    className="absolute inset-0 z-0"
                    style={{
                        backgroundImage: `url(${backgroundImage})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        filter: 'blur(20px) brightness(0.4)',
                        transform: 'scale(1.1)', // Prevent blur edge artifacts
                    }}
                />
            )}

            {/* Mode Toggle + Zoom Controls - Top Right */}
            {!isLoading && (
                <div className="absolute top-2 right-2 flex flex-col gap-1 z-20">
                    {/* Pan/Navigate mode toggle */}
                    <button
                        onClick={() => setIsPanMode(!isPanMode)}
                        className={`w-8 h-8 flex items-center justify-center rounded transition-colors shadow-lg border ${isPanMode
                                ? 'bg-blue-600/90 text-white border-blue-500/50'
                                : 'bg-stone-800/80 hover:bg-stone-700/90 text-white border-stone-600/50'
                            }`}
                        title={isPanMode ? 'Pan mode (P) - click to switch to navigate' : 'Navigate mode (P) - click to switch to pan'}
                    >
                        {isPanMode ? <Hand size={16} /> : <MousePointer size={16} />}
                    </button>

                    {/* Divider */}
                    <div className="h-px bg-stone-600/30 my-0.5" />

                    <button
                        onClick={handleZoomIn}
                        className="w-8 h-8 flex items-center justify-center rounded bg-stone-800/80 hover:bg-stone-700/90
                                   text-white border border-stone-600/50 transition-colors shadow-lg"
                        title="Zoom in"
                    >
                        <Plus size={16} />
                    </button>
                    <button
                        onClick={handleZoomOut}
                        className="w-8 h-8 flex items-center justify-center rounded bg-stone-800/80 hover:bg-stone-700/90
                                   text-white border border-stone-600/50 transition-colors shadow-lg"
                        title="Zoom out"
                    >
                        <Minus size={16} />
                    </button>
                    <button
                        onClick={handleResetZoom}
                        className="w-8 h-8 flex items-center justify-center rounded bg-stone-800/80 hover:bg-stone-700/90
                                   text-white border border-stone-600/50 transition-colors shadow-lg"
                        title="Reset zoom"
                    >
                        <RotateCcw size={14} />
                    </button>
                    {/* Zoom level indicator */}
                    <div className="text-xs text-center text-gray-400 mt-1">
                        {Math.round(currentZoom * 100)}%
                    </div>

                    {/* Volume Controls */}
                    <div className="h-px bg-stone-600/30 my-1.5" />
                    <div className="flex gap-1.5 justify-center">
                        {/* Music Volume */}
                        <div className="flex flex-col items-center">
                            <Music size={12} className="text-gray-400 mb-1" />
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={settings.musicVolume ?? 30}
                                onChange={handleMusicVolumeChange}
                                className="volume-slider"
                                title={`Music: ${settings.musicVolume ?? 30}%`}
                                style={{
                                    writingMode: 'vertical-lr',
                                    direction: 'rtl',
                                    width: '16px',
                                    height: '48px',
                                    appearance: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                }}
                            />
                        </div>
                        {/* SFX Volume */}
                        <div className="flex flex-col items-center">
                            <Volume2 size={12} className="text-gray-400 mb-1" />
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={settings.sfxVolume ?? 50}
                                onChange={handleSfxVolumeChange}
                                className="volume-slider"
                                title={`SFX: ${settings.sfxVolume ?? 50}%`}
                                style={{
                                    writingMode: 'vertical-lr',
                                    direction: 'rtl',
                                    width: '16px',
                                    height: '48px',
                                    appearance: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Loading Overlay */}
            {isLoading && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: '#1a1a1a',
                        zIndex: 10,
                    }}
                >
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-2" />
                        <p className="text-gray-500 text-sm">Loading map...</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LocalMapView;
