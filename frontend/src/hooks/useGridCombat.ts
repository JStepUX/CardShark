/**
 * @file useGridCombat.ts
 * @description React hook for managing grid-based tactical combat.
 *
 * Handles:
 * - Combat state management
 * - Action dispatch and validation
 * - Enemy AI turn execution
 * - Map state synchronization
 */

import { useState, useCallback, useRef, useEffect, useMemo, RefObject } from 'react';
import {
    GridCombatState,
    GridCombatant,
    GridCombatAction,
    GridMoveAction,
    GridAttackAction,
    CombatEvent,
} from '../types/combat';
import { LocalMapState, TilePosition } from '../types/localMap';
import { gridCombatReducer, getCurrentCombatant, getEnemies } from '../services/combat/gridCombatEngine';
import { initializeCombatFromMap, syncPositionsToMap, cleanupDefeatedEntities, CombatInitOptions } from '../services/combat/combatMapSync';
import { executeAITurn } from '../services/combat/gridEnemyAI';
import { getReachableTiles, findPath, PathfindingGrid } from '../utils/pathfinding';
import { CombatGrid } from '../utils/gridCombatUtils';
import type { LocalMapViewHandle } from '../components/world/pixi/local/LocalMapView';

// =============================================================================
// Types
// =============================================================================

export type TargetingMode = 'none' | 'move' | 'attack';

export interface UseGridCombatOptions {
    /** Called when combat ends - receives full state to avoid stale closure issues */
    onCombatEnd?: (phase: 'victory' | 'defeat', state: GridCombatState) => void;
    /** Called when map state should update */
    onMapStateUpdate?: (mapState: LocalMapState) => void;
    /** Delay between AI actions (ms) */
    aiActionDelay?: number;
    /** Ref to LocalMapView for triggering animations */
    mapRef?: RefObject<LocalMapViewHandle | null>;
}

export interface UseGridCombatReturn {
    /** Current combat state (null if not in combat) */
    combatState: GridCombatState | null;
    /** Whether combat is active */
    inCombat: boolean;
    /** Whether it's the player's turn */
    isPlayerTurn: boolean;
    /** Current targeting mode */
    targetingMode: TargetingMode;
    /** Valid move destinations (when in move mode) */
    validMoveTargets: TilePosition[];
    /** Valid attack targets (when in attack mode) */
    validAttackTargets: GridCombatant[];
    /** Start combat from map state (optionally with inventories) */
    startCombat: (mapState: LocalMapState, playerId: string, options?: CombatInitOptions) => void;
    /** End combat and cleanup */
    endCombat: () => void;
    /** Set targeting mode */
    setTargetingMode: (mode: TargetingMode) => void;
    /** Execute a move to target tile */
    executeMove: (targetTile: TilePosition) => void;
    /** Execute an attack on target */
    executeAttack: (targetId: string) => void;
    /** Execute defend action */
    executeDefend: () => void;
    /** End turn early */
    endTurn: () => void;
    /** Attempt to flee from combat */
    attemptFlee: () => void;
    /** Handle tile click (delegates based on targeting mode) */
    handleTileClick: (position: TilePosition) => void;
    /** Handle entity click (delegates based on targeting mode) */
    handleEntityClick: (entityId: string) => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useGridCombat(
    mapState: LocalMapState | null,
    options: UseGridCombatOptions = {}
): UseGridCombatReturn {
    const {
        onCombatEnd,
        onMapStateUpdate,
        aiActionDelay = 800,
        mapRef,
    } = options;

    // Combat state
    const [combatState, setCombatState] = useState<GridCombatState | null>(null);
    const [targetingMode, setTargetingMode] = useState<TargetingMode>('none');

    // Track if AI is currently acting
    const aiActingRef = useRef(false);

    // Create combat grid from map state
    const getCombatGrid = useCallback((): CombatGrid | null => {
        if (!mapState) return null;
        return {
            width: mapState.config.gridWidth,
            height: mapState.config.gridHeight,
            tiles: mapState.tiles,
        };
    }, [mapState]);

    // Create pathfinding grid
    const getPathfindingGrid = useCallback((): PathfindingGrid | null => {
        if (!mapState || !combatState) return null;

        const blockedPositions = Object.values(combatState.combatants)
            .filter(c => !c.isKnockedOut)
            .map(c => c.position);

        return {
            width: mapState.config.gridWidth,
            height: mapState.config.gridHeight,
            tiles: mapState.tiles,
            blockedPositions,
        };
    }, [mapState, combatState]);

    // Check if player's turn (only actual player, not allies - they use AI)
    const currentCombatant = combatState ? getCurrentCombatant(combatState) : null;
    const isPlayerTurn = currentCombatant?.isPlayer ?? false;

    // Calculate valid move targets
    const validMoveTargets = useMemo(() => {
        if (!combatState || !isPlayerTurn || targetingMode !== 'move') {
            return [];
        }

        const current = getCurrentCombatant(combatState);
        if (!current) return [];

        const pathGrid = getPathfindingGrid();
        if (!pathGrid) return [];

        // Filter out current position from blocked
        const gridForPathing: PathfindingGrid = {
            ...pathGrid,
            blockedPositions: pathGrid.blockedPositions?.filter(
                p => p.x !== current.position.x || p.y !== current.position.y
            ),
        };

        const reachable = getReachableTiles(current.position, gridForPathing, current.apRemaining);
        return reachable.map(r => r.position);
    }, [combatState, isPlayerTurn, targetingMode, getPathfindingGrid]);

    // Calculate valid attack targets
    const validAttackTargets = useMemo(() => {
        if (!combatState || !isPlayerTurn || targetingMode !== 'attack') {
            console.log('[GridCombat] validAttackTargets: empty (conditions not met)', {
                hasCombatState: !!combatState,
                isPlayerTurn,
                targetingMode,
            });
            return [];
        }

        const current = getCurrentCombatant(combatState);
        if (!current) {
            console.log('[GridCombat] validAttackTargets: empty (no current combatant)');
            return [];
        }

        const enemies = getEnemies(combatState, current.id);
        console.log('[GridCombat] validAttackTargets computed:', enemies.map(e => ({ id: e.id, name: e.name })));
        return enemies;
    }, [combatState, isPlayerTurn, targetingMode]);

    // Process combat events and trigger animations
    const processEvents = useCallback((events: CombatEvent[], state: GridCombatState): Promise<void> => {
        return new Promise((resolve) => {
            let pendingAnimations = 0;

            const checkComplete = () => {
                if (pendingAnimations === 0) {
                    resolve();
                }
            };

            for (const event of events) {
                console.log('[Combat Event]', event.type, event.data, 'mapRef available:', !!mapRef?.current);

                // Trigger move animations
                if (event.type === 'move_completed') {
                    const { path, actorName } = event.data;
                    const actorId = event.actorId;

                    if (actorId && path && path.length > 1) {
                        const destination = path[path.length - 1];
                        console.log('[Combat] Animating move for', actorName, 'to', destination);

                        if (mapRef?.current) {
                            pendingAnimations++;
                            mapRef.current.animateEntityMove(actorId, destination, () => {
                                pendingAnimations--;
                                checkComplete();
                            });
                        } else {
                            console.warn('[Combat] mapRef not available for move animation');
                        }
                    }
                }

                // Trigger attack animations
                if (event.type === 'attack_resolved' && mapRef?.current) {
                    const { finalDamage, hitQuality } = event.data;
                    const actorId = event.actorId;
                    const targetId = event.targetId;

                    if (actorId && targetId) {
                        pendingAnimations++;

                        // Determine if this is a ranged attack by checking attacker's attackRange
                        const attacker = state.combatants[actorId];
                        const isRanged = attacker && attacker.attackRange > 1;

                        if (hitQuality === 'miss') {
                            // Show miss indicator with whiff effect
                            mapRef.current.playMissWhiff(targetId);
                            mapRef.current.showMissIndicator(targetId);
                            pendingAnimations--;
                            checkComplete();
                        } else if (isRanged) {
                            // Ranged attack: projectile effect then impact
                            const isCritical = hitQuality === 'crushing';
                            mapRef.current.playRangedAttackEffect(actorId, targetId, finalDamage, isCritical, () => {
                                pendingAnimations--;
                                checkComplete();
                            });
                        } else {
                            // Melee attack: lunge with impact (handled by animateAttack which now includes blood splatter)
                            mapRef.current.animateAttack(actorId, targetId, finalDamage, () => {
                                pendingAnimations--;
                                checkComplete();
                            });
                        }
                    }
                }

                // Trigger death/incapacitation animations
                if (event.type === 'character_defeated' && mapRef?.current) {
                    const { deathOutcome } = event.data;
                    const targetId = event.targetId;

                    if (targetId && deathOutcome) {
                        pendingAnimations++;

                        // Small delay to let attack animation finish first
                        setTimeout(() => {
                            if (deathOutcome === 'dead') {
                                mapRef.current?.playDeathAnimation(targetId, () => {
                                    pendingAnimations--;
                                    checkComplete();
                                });
                            } else if (deathOutcome === 'incapacitated') {
                                mapRef.current?.playIncapacitationAnimation(targetId, () => {
                                    pendingAnimations--;
                                    checkComplete();
                                });
                            } else {
                                pendingAnimations--;
                                checkComplete();
                            }
                        }, 400); // Wait for attack animation to complete
                    }
                }
            }

            // If no animations, resolve immediately
            checkComplete();
        });
    }, [mapRef]);

    // Dispatch action to combat reducer
    const dispatchAction = useCallback(async (action: GridCombatAction) => {
        if (!combatState) return;

        const grid = getCombatGrid();
        if (!grid) return;

        const result = gridCombatReducer(combatState, action, grid);

        // Wait for animations to complete before updating state
        await processEvents(result.events, result.state);
        setCombatState(result.state);

        // Check for combat end
        if (result.state.phase === 'victory' || result.state.phase === 'defeat') {
            onCombatEnd?.(result.state.phase, result.state);
        }

        // Sync to map
        if (mapState && onMapStateUpdate) {
            const updatedMap = syncPositionsToMap(result.state, mapState);
            onMapStateUpdate(updatedMap);
        }

        // Clear targeting mode after action
        setTargetingMode('none');
    }, [combatState, getCombatGrid, processEvents, onCombatEnd, mapState, onMapStateUpdate]);

    // Execute AI turn
    const runAITurn = useCallback(async () => {
        if (!combatState || aiActingRef.current) return;

        const current = getCurrentCombatant(combatState);
        // AI runs for any combatant that's not the actual player (including allies)
        if (!current || current.isPlayer) return;

        aiActingRef.current = true;

        const grid = getCombatGrid();
        if (!grid) {
            aiActingRef.current = false;
            return;
        }

        // Get AI actions
        const actions = executeAITurn(combatState, current.id, grid);

        // Execute actions with delay for visual feedback
        let currentState = combatState;
        for (const action of actions) {
            await new Promise(resolve => setTimeout(resolve, aiActionDelay));

            const result = gridCombatReducer(currentState, action, grid);
            // Wait for animations to complete before continuing
            await processEvents(result.events, result.state);
            currentState = result.state;
            setCombatState(result.state);

            // Sync to map
            if (mapState && onMapStateUpdate) {
                const updatedMap = syncPositionsToMap(result.state, mapState);
                onMapStateUpdate(updatedMap);
            }

            // Check for combat end
            if (result.state.phase === 'victory' || result.state.phase === 'defeat') {
                onCombatEnd?.(result.state.phase, result.state);
                aiActingRef.current = false;
                return;
            }
        }

        aiActingRef.current = false;
    }, [combatState, getCombatGrid, aiActionDelay, processEvents, mapState, onMapStateUpdate, onCombatEnd]);

    // Trigger AI turn when it's enemy's turn
    useEffect(() => {
        if (combatState && !isPlayerTurn && !aiActingRef.current) {
            const phase = combatState.phase;
            if (phase !== 'victory' && phase !== 'defeat') {
                // Small delay before AI acts to allow state to settle
                const timer = setTimeout(() => {
                    runAITurn();
                }, 500);
                return () => clearTimeout(timer);
            }
        }
    }, [combatState, isPlayerTurn, runAITurn]);

    // Start combat
    const startCombat = useCallback((initialMapState: LocalMapState, playerId: string, options?: CombatInitOptions) => {
        const state = initializeCombatFromMap(initialMapState, playerId, options);
        setCombatState(state);
        setTargetingMode('none');
    }, []);

    // End combat
    const endCombat = useCallback(() => {
        if (combatState && mapState && onMapStateUpdate) {
            const cleanupResult = cleanupDefeatedEntities(combatState, mapState);
            onMapStateUpdate(cleanupResult.updatedMapState);
        }
        setCombatState(null);
        setTargetingMode('none');
    }, [combatState, mapState, onMapStateUpdate]);

    // Execute move
    const executeMove = useCallback((targetTile: TilePosition) => {
        if (!combatState) return;

        const current = getCurrentCombatant(combatState);
        if (!current || !current.isPlayerControlled) return;

        const pathGrid = getPathfindingGrid();
        if (!pathGrid) return;

        // Find path
        const result = findPath(current.position, targetTile, pathGrid, {
            maxCost: current.apRemaining,
            allowDiagonals: true,
        });

        if (!result.reachable) return;

        const action: GridMoveAction = {
            type: 'grid_move',
            actorId: current.id,
            path: result.path,
        };

        dispatchAction(action);
    }, [combatState, getPathfindingGrid, dispatchAction]);

    // Execute attack
    const executeAttack = useCallback((targetId: string) => {
        console.log('[GridCombat] executeAttack called', { targetId });

        if (!combatState) {
            console.log('[GridCombat] executeAttack: no combatState');
            return;
        }

        const current = getCurrentCombatant(combatState);
        if (!current || !current.isPlayerControlled) {
            console.log('[GridCombat] executeAttack: no current player', { current });
            return;
        }

        const target = combatState.combatants[targetId];
        if (!target) {
            console.log('[GridCombat] executeAttack: target not found', { targetId, combatants: Object.keys(combatState.combatants) });
            return;
        }

        console.log('[GridCombat] Dispatching grid_attack', { actorId: current.id, targetId: target.id });

        const action: GridAttackAction = {
            type: 'grid_attack',
            actorId: current.id,
            targetId: target.id,
            targetPosition: target.position,
        };

        dispatchAction(action);
    }, [combatState, dispatchAction]);

    // Execute defend
    const executeDefend = useCallback(() => {
        if (!combatState) return;

        const current = getCurrentCombatant(combatState);
        if (!current || !current.isPlayerControlled) return;

        dispatchAction({
            type: 'grid_defend',
            actorId: current.id,
        });
    }, [combatState, dispatchAction]);

    // End turn
    const endTurn = useCallback(() => {
        if (!combatState) return;

        const current = getCurrentCombatant(combatState);
        if (!current || !current.isPlayerControlled) return;

        dispatchAction({
            type: 'grid_end_turn',
            actorId: current.id,
        });
    }, [combatState, dispatchAction]);

    // Attempt to flee
    const attemptFlee = useCallback(() => {
        if (!combatState) return;

        const current = getCurrentCombatant(combatState);
        if (!current || !current.isPlayer) return; // Only player can flee

        dispatchAction({
            type: 'grid_flee',
            actorId: current.id,
        });
    }, [combatState, dispatchAction]);

    // Handle tile click
    const handleTileClick = useCallback((position: TilePosition) => {
        if (targetingMode === 'move') {
            const isValid = validMoveTargets.some(t => t.x === position.x && t.y === position.y);
            if (isValid) {
                executeMove(position);
            }
        } else if (targetingMode === 'attack') {
            const targetAtTile = validAttackTargets.find(
                t => t.position.x === position.x && t.position.y === position.y
            );
            if (targetAtTile) {
                executeAttack(targetAtTile.id);
            }
        }
    }, [targetingMode, validMoveTargets, validAttackTargets, executeMove, executeAttack]);

    // Handle entity click
    const handleEntityClick = useCallback((entityId: string) => {
        console.log('[GridCombat] handleEntityClick called', {
            entityId,
            targetingMode,
            isPlayerTurn,
            validAttackTargets: validAttackTargets.map(t => ({ id: t.id, name: t.name })),
            combatantIds: combatState ? Object.keys(combatState.combatants) : [],
        });

        if (targetingMode === 'attack') {
            const isValid = validAttackTargets.some(t => t.id === entityId);
            console.log('[GridCombat] Attack target validation:', {
                entityId,
                isValid,
                targets: validAttackTargets.map(t => t.id),
            });
            if (isValid) {
                console.log('[GridCombat] Executing attack on', entityId);
                executeAttack(entityId);
                setTargetingMode('none'); // Clear targeting after attack
            } else {
                console.warn('[GridCombat] Entity not in valid attack targets:', entityId);
            }
        } else {
            console.log('[GridCombat] Not in attack targeting mode, ignoring entity click');
        }
    }, [targetingMode, validAttackTargets, executeAttack, isPlayerTurn, combatState]);

    // Wrap setTargetingMode to add debug logging
    const setTargetingModeWithLog = useCallback((mode: TargetingMode) => {
        console.log('[GridCombat] Setting targeting mode:', mode);
        if (mode === 'none') {
            console.trace('[GridCombat] Stack trace for targeting mode reset to none');
        }
        setTargetingMode(mode);
    }, []);

    return {
        combatState,
        inCombat: combatState !== null,
        isPlayerTurn,
        targetingMode,
        validMoveTargets,
        validAttackTargets,
        startCombat,
        endCombat,
        setTargetingMode: setTargetingModeWithLog,
        executeMove,
        executeAttack,
        executeDefend,
        endTurn,
        attemptFlee,
        handleTileClick,
        handleEntityClick,
    };
}

export default useGridCombat;
