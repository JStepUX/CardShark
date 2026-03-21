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
import Button from '../../../common/Button';
import { LocalMapStage } from './LocalMapStage';
import {
    LocalMapState,
    LocalMapEntity,
    TilePosition,
    ExitDirection,
    LocalMapConfig,
    DEFAULT_LAYOUT_GRID_SIZE,
    LOCAL_MAP_TILE_SIZE,
    LOCAL_MAP_TILE_GAP,
    LOCAL_MAP_CARD_OVERFLOW_PADDING,
} from '../../../../types/localMap';
import { WORLD_PLAY_VIEWPORT } from '../../../../worldplay/config';
import { GridCombatant } from '../../../../types/combat';
import type { BlastPattern } from '../../../../types/inventory';
import { getBlastPattern, CombatGrid } from '../../../../utils/gridCombatUtils';
import { GridWorldState, GridRoom, DisplayNPC } from '../../../../types/worldGrid';
import {
    calculateThreatZones,
    isInThreatZone,
    areAdjacent,
    findPath,
} from '../../../../utils/localMapUtils';
import { TextureCache } from '../../../combat/pixi/TextureCache';
import { soundManager } from '../../../combat/pixi/SoundManager';
import { useSettings } from '../../../../contexts/SettingsContext';
import {
    buildLocalMapState,
    createPlacedNpcEntities,
    findSafeCompanionPosition,
    getHostileIdsNearPosition,
    getLocalMapEntryPosition,
    getNonPlayerEntityAtTile,
    isTileOccupiedByNonPlayer,
} from './localMapState';
import { useLocalMapCamera } from './useLocalMapCamera';

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
    /** Optional debug toggle from world play */
    showDebugOverlay?: boolean;
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
    showDebugOverlay = false,
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

    // Track player position from entry/default spawn
    const [playerPosition, setPlayerPosition] = useState<TilePosition>(
        getLocalMapEntryPosition(initialPlayerPosition, entryDirection, config)
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

    // Refs to always get latest handlers (avoids stale closure in Pixi event)
    const handleTileClickRef = useRef<(position: TilePosition) => void>(() => { });
    const onEntityClickRef = useRef<((entityId: string) => void) | undefined>();
    const tileHoverRef = useRef<((position: TilePosition) => void) | null>(null);
    const DEFAULT_ZOOM = WORLD_PLAY_VIEWPORT.zoom.default;
    const {
        currentZoom,
        viewportDebug,
        isPanMode,
        isPanModeRef,
        setIsPanMode,
        centerViewportOnPlayer,
        handleZoomIn,
        handleZoomOut,
        handleResetZoom,
        handleWheel,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleMouseLeave,
        handleContextMenu,
    } = useLocalMapCamera({
        containerRef,
        stageRef,
        playerPosition,
        defaultZoom: DEFAULT_ZOOM,
        cardOverflowPadding: CARD_OVERFLOW_PADDING,
    });

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
        const placedNpcs = createPlacedNpcEntities({
            currentRoom,
            roomNpcs,
            playerId: player.id,
            config,
            initialPlayerPosition,
            entryDirection,
        });
        setPlacedNpcEntities(placedNpcs);

        // Track what we've placed to avoid redundant recalculations
        lastPlacedRoomIdRef.current = currentRoom.id;
        lastPlacedNpcIdsRef.current = currentNpcSignature;
    }, [currentRoom?.id, roomNpcs, player.id, config, entryDirection, initialPlayerPosition]);

    // Build local map state from props (uses pre-calculated NPC positions)
    // When in combat, uses combatMapState entities to reflect combat movement
    const buildMapState = useCallback((): LocalMapState | null => {
        if (!currentRoom) return null;
        return buildLocalMapState({
            currentRoom,
            worldState,
            config,
            player,
            companion,
            playerPosition,
            placedNpcEntities,
            inCombat,
            combatMapState,
        });
    }, [currentRoom, worldState, player, companion, playerPosition, placedNpcEntities, config, inCombat, combatMapState]);

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
        if (isTileOccupiedByNonPlayer(mapState.entities, destination)) {
            // Find the entity and trigger click instead
            const entityAtTile = getNonPlayerEntityAtTile(mapState.entities, destination);
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

                const hostileIds = getHostileIdsNearPosition(mapState.entities, nextTile);

                if (hostileIds.length > 0) {
                    // Pass current position and updated map state to combat
                    // Must update BOTH playerPosition AND the player entity's position
                    // Also update companion position to stay adjacent to player (avoiding enemies)
                    const companionPos = findSafeCompanionPosition(nextTile, mapState.entities, config);
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
    }, [isMoving, playerPosition, config, getBlockedTiles, inCombat, animateStep, onEnterThreatZone, onExitClick, onTileClick, onEntityClick]);

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
                canvas.style.position = 'absolute';
                canvas.style.top = '0';
                canvas.style.left = '0';
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

            // Set initial zoom and center on player (defer to after browser layout)
            requestAnimationFrame(() => {
                centerViewportOnPlayer({ resetZoom: true });
            });

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
    // Component is keyed by room id in WorldPlayView, so initialization should run once per mount.
    // centerViewportOnPlayer is read from closure at call-time; listing it as a dep causes
    // re-init on every player movement tick, destroying and recreating the PIXI app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Handle tile click - uses click-to-move for distant tiles
    const handleTileClick = useCallback((position: TilePosition) => {
        if (isPanModeRef.current) return;

        const mapState = buildMapState();
        if (!mapState) return;

        // COMBAT MODE: Delegate all clicks to parent handler for combat engine
        // Combat movement is handled by gridCombat.handleTileClick via onTileClick
        if (inCombat) {
            // Check if tile has an entity for attack targeting
            const entityAtTile = getNonPlayerEntityAtTile(mapState.entities, position);

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
        if (isTileOccupiedByNonPlayer(mapState.entities, position)) {
            // Find the entity at this position
            const entityAtTile = getNonPlayerEntityAtTile(mapState.entities, position);

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
                const hostileIds = getHostileIdsNearPosition(mapState.entities, position);

                // Move to the tile first
                setPlayerPosition(position);
                if (stageRef.current) {
                    stageRef.current.animateEntityMove(player.id, position);
                }

                // Then trigger combat with updated map state
                // Must update BOTH playerPosition AND the player entity's position
                // Also update companion position to stay adjacent to player (avoiding enemies)
                if (hostileIds.length > 0) {
                    const companionPos = findSafeCompanionPosition(position, mapState.entities, config);
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
    }, [isMoving, buildMapState, playerPosition, inCombat, onExitClick, onEnterThreatZone, onTileClick, onEntityClick, startMovement, player.id, config]);

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
                centerViewportOnPlayer({ resetZoom: true });
            }

            // Notify parent of map state for external combat system
            // Only when NOT in combat - once combat starts, combat engine owns the state
            if (!inCombat) {
                onMapStateChange?.(mapState);
            }
        }
    // syncViewportDebug and centerViewportOnPlayer are called imperatively within this effect;
    // they read latest state via refs. Listing them as deps caused re-fire on every movement tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentRoom, worldState, player, companion, playerPosition, inCombat, buildMapState, onMapStateChange, stageReady]);

    const lastCombatModeRef = useRef(inCombat);
    useEffect(() => {
        const enteredCombat = inCombat && !lastCombatModeRef.current;
        lastCombatModeRef.current = inCombat;

        if (!enteredCombat || !WORLD_PLAY_VIEWPORT.recenterOnCombatStart || !stageRef.current || !containerRef.current) {
            return;
        }

        centerViewportOnPlayer();
    }, [inCombat, centerViewportOnPlayer]);

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
                    <Button
                        onClick={() => setIsPanMode(!isPanMode)}
                        variant="ghost"
                        size="sm"
                        active={isPanMode}
                        icon={isPanMode ? <Hand size={16} /> : <MousePointer size={16} />}
                        className={`w-8 h-8 shadow-lg border ${isPanMode
                                ? 'bg-blue-600/90 border-blue-500/50'
                                : 'bg-stone-800/80 hover:bg-stone-700/90 border-stone-600/50'
                            }`}
                        title={isPanMode ? 'Pan mode (P) - click to switch to navigate' : 'Navigate mode (P) - click to switch to pan'}
                    />

                    {/* Divider */}
                    <div className="h-px bg-stone-600/30 my-0.5" />

                    <Button
                        onClick={handleZoomIn}
                        variant="ghost"
                        size="sm"
                        icon={<Plus size={16} />}
                        className="w-8 h-8 bg-stone-800/80 hover:bg-stone-700/90 border border-stone-600/50 shadow-lg"
                        title="Zoom in"
                    />
                    <Button
                        onClick={handleZoomOut}
                        variant="ghost"
                        size="sm"
                        icon={<Minus size={16} />}
                        className="w-8 h-8 bg-stone-800/80 hover:bg-stone-700/90 border border-stone-600/50 shadow-lg"
                        title="Zoom out"
                    />
                    <Button
                        onClick={handleResetZoom}
                        variant="ghost"
                        size="sm"
                        icon={<RotateCcw size={14} />}
                        className="w-8 h-8 bg-stone-800/80 hover:bg-stone-700/90 border border-stone-600/50 shadow-lg"
                        title="Reset zoom"
                    />
                    {/* Zoom level indicator */}
                    <div className="text-xs text-center text-gray-400 mt-1">
                        {Math.round(currentZoom * 100)}%
                    </div>

                    {showDebugOverlay && (
                        <div className="mt-2 rounded border border-amber-500/40 bg-black/70 px-2 py-2 text-[10px] leading-4 text-amber-200 shadow-lg">
                            <div>zoom {currentZoom.toFixed(2)}</div>
                            <div>pan {Math.round(viewportDebug.pan.x)}, {Math.round(viewportDebug.pan.y)}</div>
                            <div>bounds x {Math.round(viewportDebug.bounds.minX)}..{Math.round(viewportDebug.bounds.maxX)}</div>
                            <div>bounds y {Math.round(viewportDebug.bounds.minY)}..{Math.round(viewportDebug.bounds.maxY)}</div>
                            <div>player {viewportDebug.playerTile.x}, {viewportDebug.playerTile.y}</div>
                        </div>
                    )}

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
