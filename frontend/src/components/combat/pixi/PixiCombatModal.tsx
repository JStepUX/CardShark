/**
 * @file PixiCombatModal.tsx
 * @description React wrapper for PixiJS-based combat rendering.
 * 
 * This component has the same interface as the CSS-based CombatModal.tsx
 * but uses PixiJS for rendering the battlefield instead of DOM/CSS.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as PIXI from 'pixi.js';
import {
    CombatState,
    CombatAction,
    CombatEvent,
    ActionType,
    CombatInitData,
    AttackResolvedData,
} from '../../../types/combat';
import {
    initializeCombat,
    combatReducer,
    getCurrentActor,
    getAvailableActions,
    getValidAttackTargets,
    getValidMoveSlots,
    getValidSwapTargets,
} from '../../../services/combat/combatEngine';
import { getEnemyAction } from '../../../services/combat/enemyAI';
import { ActionButtons } from '../ActionButtons';
import { CombatLog } from '../CombatLog';
import { InitiativeTracker } from '../InitiativeTracker';
import { PlayerHUD } from '../PlayerHUD';
import { BattlefieldStage } from './BattlefieldStage';
import { TextureCache } from './TextureCache';
import {
    AnimationManager,
    AttackAnimation,
    HitAnimation,
    MoveAnimation,
    DeathAnimation,
    DamageNumberAnimation,
    ScreenShakeAnimation
} from './AnimationManager';
import { ParticleSystem } from './ParticleSystem';

/**
 * Play animations for combat events
 */
async function playEventAnimations(
    events: CombatEvent[],
    battlefield: BattlefieldStage,
    animationManager: AnimationManager,
    particleSystem: ParticleSystem,
    combatState: CombatState
): Promise<void> {
    for (const event of events) {
        switch (event.type) {
            case 'attack_resolved': {
                const actorSprite = battlefield.getCombatantSprite(event.actorId!);
                const targetSprite = battlefield.getCombatantSprite(event.targetId!);

                if (!actorSprite || !targetSprite) break;

                const data = event.data as AttackResolvedData;
                const isHit = data.hitQuality !== 'miss';

                // Check if this is a ranged attack by looking up the actor in combat state
                const actor = combatState.combatants[event.actorId!];
                const isRanged = actor?.weaponType === 'ranged';

                if (isRanged) {
                    // Ranged attack - use projectile
                    const projectile = battlefield.getProjectile('arrow');

                    if (projectile) {
                        const { ProjectileAnimation } = await import('./AnimationManager');

                        await animationManager.play(
                            new ProjectileAnimation(
                                projectile,
                                actorSprite.x,
                                actorSprite.y,
                                targetSprite.x,
                                targetSprite.y,
                                'arc',
                                particleSystem
                            )
                        );
                    }
                } else {
                    // Melee attack - use attack animation
                    const direction = actorSprite.y < targetSprite.y ? 'down' : 'up';
                    await animationManager.playSequence([
                        new AttackAnimation(actorSprite, direction),
                    ]);
                }

                if (isHit) {
                    // Hit landed - play hit effect and damage number
                    const damageText = targetSprite.showDamage(
                        data.finalDamage,
                        data.hitQuality === 'crushing' ? 'critical' : 'damage'
                    );

                    const isCritical = data.hitQuality === 'crushing';

                    // Emit hit particles
                    particleSystem.emit({
                        x: targetSprite.x,
                        y: targetSprite.y + 60,
                        texture: 'spark',
                        count: isCritical ? 16 : 8,
                        speed: isCritical ? 180 : 120,
                        lifetime: isCritical ? 0.5 : 0.4,
                        gravity: isCritical ? 150 : 200,
                        fadeOut: true,
                        tint: isCritical ? 0xFFD700 : undefined,
                    });

                    // Screen shake for critical hits
                    const animations: any[] = [
                        new HitAnimation(targetSprite),
                        new DamageNumberAnimation(damageText),
                    ];

                    if (isCritical) {
                        animations.push(new ScreenShakeAnimation(battlefield));
                    }

                    await animationManager.playParallel(animations);

                    // If killing blow, play death animation with smoke
                    if (data.isKillingBlow) {
                        // Emit death smoke
                        particleSystem.emit({
                            x: targetSprite.x,
                            y: targetSprite.y + 80,
                            texture: 'smoke',
                            count: 12,
                            speed: 40,
                            lifetime: 0.8,
                            gravity: -50, // Rises upward
                            fadeOut: true,
                        });

                        await animationManager.play(new DeathAnimation(targetSprite));
                    }
                }
                break;
            }

            case 'move_completed': {
                const actorSprite = battlefield.getCombatantSprite(event.actorId!);
                if (!actorSprite) break;

                // Event data uses 'toSlot' not 'targetSlot'
                const targetSlot = event.data.toSlot as number;
                // Determine if enemy by looking up the actor in combat state
                const actor = combatState.combatants[event.actorId!];
                const isEnemy = actor ? !actor.isPlayerControlled : false;
                const { x, y } = battlefield.getSlotPosition(targetSlot, isEnemy);

                await animationManager.play(new MoveAnimation(actorSprite, x, y));
                break;
            }

            case 'swap_completed': {
                const actor1Sprite = battlefield.getCombatantSprite(event.actorId!);
                const actor2Sprite = battlefield.getCombatantSprite(event.targetId!);

                if (!actor1Sprite || !actor2Sprite) break;

                // Swap positions simultaneously
                const actor1Target = { x: actor2Sprite.x, y: actor2Sprite.y };
                const actor2Target = { x: actor1Sprite.x, y: actor1Sprite.y };

                await animationManager.playParallel([
                    new MoveAnimation(actor1Sprite, actor1Target.x, actor1Target.y),
                    new MoveAnimation(actor2Sprite, actor2Target.x, actor2Target.y),
                ]);
                break;
            }

            // Other events don't need animations (defend, overwatch, etc.)
            default:
                break;
        }
    }
}

interface PixiCombatModalProps {
    initData: CombatInitData;
    onCombatEnd: (result: CombatState['result']) => void;
    onNarratorRequest?: (events: CombatEvent[]) => void;
}

export function PixiCombatModal({
    initData,
    onCombatEnd,
    onNarratorRequest,
}: PixiCombatModalProps) {
    // Combat state
    const [combatState, setCombatState] = useState<CombatState>(() =>
        initializeCombat(initData)
    );

    // Ref to prevent double-execution of enemy turns
    const enemyTurnInProgress = useRef(false);

    // UI state
    const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
    const [targetingMode, setTargetingMode] = useState<'none' | 'attack' | 'move' | 'swap'>('none');
    const [isAnimating, setIsAnimating] = useState(false);

    // PixiJS refs
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const battlefieldRef = useRef<BattlefieldStage | null>(null);
    const animationManagerRef = useRef<AnimationManager | null>(null);
    const particleSystemRef = useRef<ParticleSystem | null>(null);

    // Refs to access current state values in PIXI callbacks (avoids stale closure)
    const targetingModeRef = useRef<'none' | 'attack' | 'move' | 'swap'>('none');
    const handleSelectTargetRef = useRef<((targetId: string) => void) | null>(null);
    const handleSelectMoveSlotRef = useRef<((slot: number) => void) | null>(null);

    // Derived state
    const currentActor = getCurrentActor(combatState);
    const isPlayerTurn = currentActor?.isPlayerControlled ?? false;
    const availableActions = isPlayerTurn ? getAvailableActions(combatState) : [];

    // Get valid targets based on selected action
    const validTargetIds = (() => {
        if (!currentActor || !selectedAction) return [];
        if (selectedAction === 'attack') {
            return getValidAttackTargets(combatState, currentActor.id).map(c => c.id);
        }
        if (selectedAction === 'swap') {
            return getValidSwapTargets(combatState, currentActor.id).map(c => c.id);
        }
        return [];
    })();

    const validMoveSlots = (() => {
        if (!currentActor || selectedAction !== 'move') return [];
        return getValidMoveSlots(combatState, currentActor.id);
    })();

    // Find the player character for HUD
    const playerCombatant = Object.values(combatState.combatants).find(c => c.isPlayer);

    // Initialize PixiJS application
    useEffect(() => {
        if (!containerRef.current) return;

        // Track if cleanup was called during async init (React Strict Mode race condition)
        let isCleanedUp = false;

        const initPixi = async () => {
            try {
                // Create PIXI application with transparent background
                // This lets the room backdrop show through
                const app = new PIXI.Application();
                await app.init({
                    width: 800,
                    height: 600,
                    backgroundAlpha: 0,
                    background: 'transparent',
                    antialias: true,
                });

                // Abort if cleanup was called during init
                if (isCleanedUp) {
                    app.destroy(true, { children: true, texture: true });
                    return;
                }

                // Append canvas to container
                if (containerRef.current) {
                    containerRef.current.appendChild(app.canvas);
                }

                // Preload textures
                const texturePaths: string[] = [];
                Object.values(combatState.combatants).forEach(combatant => {
                    if (combatant.imagePath) {
                        texturePaths.push(combatant.imagePath);
                    }
                });

                await TextureCache.preload(texturePaths);

                // Abort if cleanup was called during texture loading
                if (isCleanedUp) {
                    app.destroy(true, { children: true, texture: true });
                    TextureCache.clear();
                    return;
                }

                // Create battlefield stage
                const battlefield = new BattlefieldStage(app.renderer);
                app.stage.addChild(battlefield);

                // Set up click handler for targeting
                // Uses refs to avoid stale closure capturing initial state
                battlefield.on('combatantClicked', (combatantId: string) => {
                    const mode = targetingModeRef.current;
                    const handler = handleSelectTargetRef.current;
                    if ((mode === 'attack' || mode === 'swap') && handler) {
                        handler(combatantId);
                    }
                });

                // Set up click handler for move slot selection
                battlefield.on('moveSlotClicked', (slotIndex: number) => {
                    const mode = targetingModeRef.current;
                    const handler = handleSelectMoveSlotRef.current;
                    if (mode === 'move' && handler) {
                        handler(slotIndex);
                    }
                });

                // Initial render
                battlefield.updateFromState(combatState);

                // Create animation manager
                const animationManager = new AnimationManager(app);

                // Create particle system
                const particleSystem = new ParticleSystem(app, app.stage);

                // Set up ticker for animations (turn indicator + move indicators)
                app.ticker.add((ticker) => {
                    const dt = ticker.deltaMS / 1000;
                    battlefield.updateTurnIndicator(dt);
                    battlefield.updateMoveIndicators(dt);
                });

                // Final check before storing refs
                if (isCleanedUp) {
                    particleSystem.destroy();
                    animationManager.destroy();
                    battlefield.destroy();
                    app.destroy(true, { children: true, texture: true });
                    TextureCache.clear();
                    return;
                }

                // Store refs
                appRef.current = app;
                battlefieldRef.current = battlefield;
                animationManagerRef.current = animationManager;
                particleSystemRef.current = particleSystem;
            } catch (error) {
                console.error('Failed to initialize PixiJS:', error);
                // Fallback: render nothing (parent can fall back to CSS combat)
            }
        };

        initPixi();

        // Cleanup on unmount
        return () => {
            // Signal to abort any in-progress async init
            isCleanedUp = true;

            if (particleSystemRef.current) {
                particleSystemRef.current.destroy();
                particleSystemRef.current = null;
            }
            if (animationManagerRef.current) {
                animationManagerRef.current.destroy();
                animationManagerRef.current = null;
            }
            if (battlefieldRef.current) {
                battlefieldRef.current.destroy();
                battlefieldRef.current = null;
            }
            if (appRef.current) {
                appRef.current.destroy(true, { children: true, texture: true });
                appRef.current = null;
            }
            TextureCache.clear();
        };
    }, []); // Only run once on mount

    // Update battlefield when combat state changes
    useEffect(() => {
        if (battlefieldRef.current) {
            battlefieldRef.current.updateFromState(combatState);

            // Update turn indicator
            if (currentActor) {
                battlefieldRef.current.setCurrentActor(currentActor.id);
            } else {
                battlefieldRef.current.setCurrentActor(null);
            }
        }
    }, [combatState, currentActor]);

    // Update highlights when targeting mode changes
    useEffect(() => {
        if (battlefieldRef.current) {
            if (targetingMode === 'attack' || targetingMode === 'swap') {
                battlefieldRef.current.highlightTargets(validTargetIds);
                battlefieldRef.current.clearMoveIndicators();
            } else if (targetingMode === 'move' && currentActor) {
                battlefieldRef.current.clearHighlights();
                // Show move indicators - determine if current actor is on enemy or ally row
                const isEnemy = !currentActor.isPlayerControlled;
                battlefieldRef.current.showMoveIndicators(validMoveSlots, isEnemy);
            } else {
                battlefieldRef.current.clearHighlights();
                battlefieldRef.current.clearMoveIndicators();
            }
        }
    }, [targetingMode, validTargetIds, validMoveSlots, currentActor]);

    // Process action and update state with animations
    const executeAction = useCallback(async (action: CombatAction) => {
        if (!battlefieldRef.current || !animationManagerRef.current || !particleSystemRef.current) {
            // Fallback: execute without animations
            const { state: newState, events } = combatReducer(combatState, action);
            setCombatState(newState);
            setSelectedAction(null);
            setTargetingMode('none');

            if (events.length > 0 && onNarratorRequest) {
                onNarratorRequest(events);
            }

            if (newState.phase === 'victory' || newState.phase === 'defeat') {
                setTimeout(() => onCombatEnd(newState.result), 1500);
            }
            return;
        }

        setIsAnimating(true);

        try {
            // Execute combat action
            const { state: newState, events } = combatReducer(combatState, action);

            // Play animations for events
            await playEventAnimations(events, battlefieldRef.current, animationManagerRef.current, particleSystemRef.current, combatState);


            // Update state after animations complete
            setCombatState(newState);
            setSelectedAction(null);
            setTargetingMode('none');

            // Send events to narrator
            if (events.length > 0 && onNarratorRequest) {
                onNarratorRequest(events);
            }

            // Check for combat end
            if (newState.phase === 'victory' || newState.phase === 'defeat') {
                setTimeout(() => onCombatEnd(newState.result), 1500);
            }
        } finally {
            setIsAnimating(false);
        }
    }, [combatState, onCombatEnd, onNarratorRequest]);

    // Handle enemy turns automatically
    useEffect(() => {
        if (combatState.phase === 'resolving' && currentActor && !currentActor.isPlayerControlled) {
            // Guard against double-execution
            if (enemyTurnInProgress.current) return;
            enemyTurnInProgress.current = true;

            // Add a small delay for UX
            const timeout = setTimeout(() => {
                const enemyAction = getEnemyAction(combatState);
                if (enemyAction) {
                    executeAction(enemyAction);
                }
                enemyTurnInProgress.current = false;
            }, 1000);

            return () => {
                clearTimeout(timeout);
                enemyTurnInProgress.current = false;
            };
        }
    }, [combatState, currentActor, executeAction]);

    // Handle action selection
    const handleSelectAction = useCallback((action: ActionType) => {
        setSelectedAction(action);

        // Set targeting mode based on action
        if (action === 'attack') {
            setTargetingMode('attack');
        } else if (action === 'move') {
            setTargetingMode('move');
        } else if (action === 'swap') {
            setTargetingMode('swap');
        } else {
            // Actions that don't need targeting (defend, overwatch, flee)
            setTargetingMode('none');

            // Execute immediately
            if (currentActor) {
                executeAction({
                    type: action,
                    actorId: currentActor.id,
                });
            }
        }
    }, [currentActor, executeAction]);

    // Handle target selection
    const handleSelectTarget = useCallback((targetId: string) => {
        if (!currentActor || !selectedAction) return;

        if (selectedAction === 'attack' || selectedAction === 'swap') {
            executeAction({
                type: selectedAction,
                actorId: currentActor.id,
                targetId,
            });
        }
    }, [currentActor, selectedAction, executeAction]);

    // Keep refs updated for PIXI callbacks (fixes stale closure issue)
    useEffect(() => {
        targetingModeRef.current = targetingMode;
    }, [targetingMode]);

    useEffect(() => {
        handleSelectTargetRef.current = handleSelectTarget;
    }, [handleSelectTarget]);

    // Handle move slot selection
    const handleSelectMoveSlot = useCallback((slot: number) => {
        if (!currentActor || selectedAction !== 'move') return;

        executeAction({
            type: 'move',
            actorId: currentActor.id,
            targetSlot: slot,
        });
    }, [currentActor, selectedAction, executeAction]);

    // Keep move slot handler ref updated
    useEffect(() => {
        handleSelectMoveSlotRef.current = handleSelectMoveSlot;
    }, [handleSelectMoveSlot]);

    // Handle cancel
    const handleCancel = useCallback(() => {
        setSelectedAction(null);
        setTargetingMode('none');
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isPlayerTurn) return;

            const key = e.key.toUpperCase();
            const actionMap: Record<string, ActionType> = {
                'A': 'attack',
                'D': 'defend',
                'O': 'overwatch',
                'M': 'move',
                'S': 'swap',
                'F': 'flee',
            };

            if (key === 'ESCAPE') {
                handleCancel();
            } else if (actionMap[key] && availableActions.includes(actionMap[key])) {
                handleSelectAction(actionMap[key]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlayerTurn, availableActions, handleSelectAction, handleCancel]);

    // Combat end screens
    if (combatState.phase === 'victory') {
        const isFled = combatState.result?.outcome === 'fled';

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
                <div className="text-center">
                    <h1 className={`text-5xl font-bold mb-4 ${isFled ? 'text-amber-500' : 'text-green-500'}`}>
                        {isFled ? 'ESCAPED!' : 'VICTORY!'}
                    </h1>
                    {!isFled && combatState.result?.rewards && (
                        <div className="text-white text-xl space-y-2">
                            <p>+{combatState.result.rewards.xp} XP</p>
                            <p>+{combatState.result.rewards.gold} Gold</p>
                        </div>
                    )}
                    {isFled && (
                        <p className="text-gray-300">You fled from combat successfully.</p>
                    )}
                    <p className="text-gray-400 mt-4">Combat ended in {combatState.turn} turns</p>
                </div>
            </div>
        );
    }

    if (combatState.phase === 'defeat') {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
                <div className="text-center">
                    <h1 className="text-5xl font-bold text-red-500 mb-4">DEFEAT</h1>
                    <p className="text-gray-400">Your party has fallen...</p>
                    <p className="text-gray-500 mt-2 text-sm">Survived {combatState.turn} turns</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
            {/* Room backdrop - fully visible like old CSS version */}
            {combatState.roomImagePath && (
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${combatState.roomImagePath})` }}
                />
            )}

            {/* Main content: Battlefield (PixiJS canvas) - Top, largest area */}
            <div className="relative flex-1 flex items-center justify-center min-h-0 overflow-hidden p-4">
                <div
                    ref={containerRef}
                    className="relative"
                    style={{
                        width: '800px',
                        height: '600px',
                    }}
                />
            </div>

            {/* Middle bar: Initiative Tracker + Combat Log (horizontal) */}
            <div className="relative border-y border-gray-800 bg-stone-900/80 flex-shrink-0">
                <div className="flex h-32">
                    {/* Initiative tracker - left side */}
                    <div className="border-r border-gray-800 flex-shrink-0">
                        <InitiativeTracker state={combatState} />
                    </div>

                    {/* Combat log - right side, takes remaining space */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                        <CombatLog
                            log={combatState.log}
                            currentTurn={combatState.turn}
                            currentActor={currentActor}
                            state={combatState}
                        />
                    </div>
                </div>
            </div>

            {/* Bottom HUD: Player tools */}
            <div className="relative bg-stone-900/90 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                    {/* Player HUD (left) */}
                    {playerCombatant && (
                        <PlayerHUD
                            player={playerCombatant}
                            apRemaining={currentActor?.isPlayer ? currentActor.apRemaining : 0}
                        />
                    )}

                    {/* Action buttons (right) */}
                    <ActionButtons
                        availableActions={availableActions}
                        selectedAction={selectedAction}
                        apRemaining={currentActor?.apRemaining || 0}
                        onSelectAction={handleSelectAction}
                        onCancel={handleCancel}
                        disabled={!isPlayerTurn || isAnimating}
                    />
                </div>

                {/* Turn indicator */}
                {!isPlayerTurn && currentActor && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full">
                        <div className="bg-stone-800 border border-gray-700 rounded-t px-4 py-1 text-sm text-gray-400">
                            {currentActor.name}'s turn...
                        </div>
                    </div>
                )}

                {/* Targeting hint */}
                {targetingMode !== 'none' && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full">
                        <div className="bg-amber-700 border border-amber-600 rounded-t px-4 py-1 text-sm text-white">
                            {targetingMode === 'attack' && 'Click an enemy card to attack'}
                            {targetingMode === 'move' && 'Click a pulsing indicator to move there'}
                            {targetingMode === 'swap' && 'Click an adjacent ally to swap with'}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
