/**
 * @file PixiMapModal.tsx
 * @description Full-screen PixiJS-based world map view.
 * 
 * Takes over the screen like combat mode (dismissible with close button or ESC).
 * Uses PixiJS for rendering the map with smooth animations.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { X, Map as MapIcon, ZoomIn, ZoomOut, Home, Hand, MousePointer } from 'lucide-react';
import Button from '../../common/Button';
import { GridWorldState } from '../../../types/worldGrid';
import { WorldMapStage } from './WorldMapStage';
import { MapCamera } from './MapCamera';
import { TextureCache } from '../../combat/pixi/TextureCache';
import { AnimationManager } from '../../combat/pixi/AnimationManager';
import { ParticleSystem } from '../../combat/pixi/ParticleSystem';
import {
    TravelAnimation,
    PlayerDepartAnimation,
    PlayerArriveAnimation,
} from './MapAnimations';

interface PixiMapModalProps {
    worldData: GridWorldState;
    currentRoomId: string | null;
    onNavigate: (roomId: string) => void;
    onClose: () => void;
}

export function PixiMapModal({
    worldData,
    currentRoomId,
    onNavigate,
    onClose,
}: PixiMapModalProps) {
    // UI state
    const [isAnimating, setIsAnimating] = useState(false);
    const [isPanMode, setIsPanMode] = useState(false);

    // PixiJS refs
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const stageRef = useRef<WorldMapStage | null>(null);
    const cameraRef = useRef<MapCamera | null>(null);
    const animationManagerRef = useRef<AnimationManager | null>(null);
    const particleSystemRef = useRef<ParticleSystem | null>(null);

    // Callback refs to avoid stale closures
    const onNavigateRef = useRef(onNavigate);
    const onCloseRef = useRef(onClose);
    const currentRoomIdRef = useRef(currentRoomId);
    const isPanModeRef = useRef(isPanMode);
    useEffect(() => {
        onNavigateRef.current = onNavigate;
        onCloseRef.current = onClose;
    }, [onNavigate, onClose]);
    useEffect(() => {
        currentRoomIdRef.current = currentRoomId;
    }, [currentRoomId]);
    useEffect(() => {
        isPanModeRef.current = isPanMode;
    }, [isPanMode]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isAnimating) {
                onCloseRef.current();
            }
            // P key toggles pan mode
            if (e.key === 'p' || e.key === 'P') {
                setIsPanMode(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isAnimating]);

    // Initialize PixiJS application
    useEffect(() => {
        if (!containerRef.current) return;

        // Track if cleanup was called during async init (React Strict Mode)
        let isCleanedUp = false;

        const initPixi = async () => {
            try {
                // Get container dimensions for full-screen canvas
                const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
                const containerHeight = containerRef.current?.clientHeight || window.innerHeight;

                // Create PIXI application (full-screen)
                const app = new PIXI.Application();
                await app.init({
                    width: containerWidth,
                    height: containerHeight,
                    backgroundAlpha: 0,
                    antialias: true,
                    resizeTo: containerRef.current || undefined,
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

                // Preload room images
                const texturePaths: string[] = [];
                worldData.grid.forEach((row: any) => {
                    row.forEach((room: any) => {
                        if (room && room.image_path) {
                            texturePaths.push(room.image_path);
                        }
                    });
                });

                if (texturePaths.length > 0) {
                    await TextureCache.preload(texturePaths);
                }

                // Abort if cleanup was called during texture loading
                if (isCleanedUp) {
                    app.destroy(true, { children: true, texture: true });
                    TextureCache.clear();
                    return;
                }

                // Create world map stage
                const mapStage = new WorldMapStage();
                app.stage.addChild(mapStage);

                // Calculate stage dimensions
                const stageWidth = 8 * (140 + 6); // GRID_WIDTH * (TILE_SIZE + TILE_GAP)
                const stageHeight = 6 * (140 + 6); // GRID_HEIGHT * (TILE_SIZE + TILE_GAP)

                // Create camera for pan/zoom
                const camera = new MapCamera(
                    mapStage,
                    { width: containerWidth, height: containerHeight },
                    { width: stageWidth, height: stageHeight },
                    app.canvas as HTMLCanvasElement
                );

                // Set up click handler for room navigation
                mapStage.on('roomClicked', (roomId: string) => {
                    handleRoomClick(roomId);
                });

                // Initial render
                mapStage.updateFromState(worldData);
                mapStage.setCurrentRoom(currentRoomId, worldData);

                // Set backdrop image if available
                const mapImage = (worldData as any).map_image;
                if (mapImage) {
                    mapStage.setBackdropImage(mapImage);
                }

                // Create animation manager
                const animationManager = new AnimationManager(app);

                // Create particle system
                const particleSystem = new ParticleSystem(app, mapStage.getEffectsLayer());

                // Set up ticker for animations and camera
                app.ticker.add((ticker) => {
                    const dt = ticker.deltaMS / 1000;
                    mapStage.updateAnimations(dt);
                    camera.update(dt);
                });

                // Final check before storing refs
                if (isCleanedUp) {
                    camera.destroy();
                    particleSystem.destroy();
                    animationManager.destroy();
                    mapStage.destroy();
                    app.destroy(true, { children: true, texture: true });
                    TextureCache.clear();
                    return;
                }

                // Store refs
                appRef.current = app;
                stageRef.current = mapStage;
                cameraRef.current = camera;
                animationManagerRef.current = animationManager;
                particleSystemRef.current = particleSystem;
            } catch (error) {
                console.error('Failed to initialize PixiJS:', error);
            }
        };

        initPixi();

        // Cleanup on unmount
        return () => {
            isCleanedUp = true;

            if (cameraRef.current) {
                cameraRef.current.destroy();
                cameraRef.current = null;
            }
            if (particleSystemRef.current) {
                particleSystemRef.current.destroy();
                particleSystemRef.current = null;
            }
            if (animationManagerRef.current) {
                animationManagerRef.current.destroy();
                animationManagerRef.current = null;
            }
            if (stageRef.current) {
                stageRef.current.destroy();
                stageRef.current = null;
            }
            if (appRef.current) {
                appRef.current.destroy(true, { children: true, texture: true });
                appRef.current = null;
            }
            // NOTE: Do NOT call TextureCache.clear() here!
            // The texture cache is shared between LocalMapView and PixiMapModal.
            // Clearing it here destroys textures the local map is still using,
            // causing the local map to disappear when the world map is closed.
        };
    }, []); // Only run once on mount

    // Update map when world data or current room changes
    useEffect(() => {
        if (stageRef.current) {
            stageRef.current.updateFromState(worldData);
            stageRef.current.setCurrentRoom(currentRoomId, worldData);
        }
    }, [worldData, currentRoomId]);

    // Handle room click with travel animation
    const handleRoomClick = useCallback(async (targetRoomId: string) => {
        // Skip navigation in pan mode
        if (isPanModeRef.current) return;
        if (isAnimating) return;

        // Use ref for current room ID to avoid stale closure
        const currentRoom = currentRoomIdRef.current;
        if (targetRoomId === currentRoom) return;
        if (!stageRef.current || !animationManagerRef.current || !particleSystemRef.current) {
            // Fallback: navigate without animation
            onNavigateRef.current(targetRoomId);
            onCloseRef.current();
            return;
        }

        const mapStage = stageRef.current;
        const animationManager = animationManagerRef.current;
        const particleSystem = particleSystemRef.current;

        // Get positions - use player token's actual position for accurate animation start
        const playerToken = mapStage.getPlayerToken();
        const sourcePos = currentRoom ? { x: playerToken.x, y: playerToken.y } : null;
        const targetPos = mapStage.getRoomPosition(targetRoomId);

        if (!targetPos) {
            // Fallback: navigate without animation
            onNavigateRef.current(targetRoomId);
            onCloseRef.current();
            return;
        }

        setIsAnimating(true);

        try {
            // Phase 1: Depart current room (if we have a source)
            if (sourcePos) {
                // Emit dust particles at liftoff
                particleSystem.emit({
                    x: sourcePos.x,
                    y: sourcePos.y,
                    texture: 'smoke',
                    count: 8,
                    speed: 40,
                    lifetime: 0.4,
                    gravity: 50,
                    fadeOut: true,
                });

                await animationManager.play(new PlayerDepartAnimation(playerToken));
            }

            // Phase 2: Travel to target
            const startX = sourcePos ? sourcePos.x : playerToken.x;
            const startY = sourcePos ? sourcePos.y : playerToken.y;

            await animationManager.play(
                new TravelAnimation(playerToken, startX, startY, targetPos.x, targetPos.y)
            );

            // Phase 3: Arrive at target
            // Emit dust particles at landing
            particleSystem.emit({
                x: targetPos.x,
                y: targetPos.y,
                texture: 'smoke',
                count: 10,
                speed: 50,
                lifetime: 0.5,
                gravity: 60,
                fadeOut: true,
            });

            await animationManager.play(new PlayerArriveAnimation(playerToken));

            // Update map state
            mapStage.setCurrentRoom(targetRoomId, worldData);

            // Trigger navigation callback
            onNavigateRef.current(targetRoomId);
            onCloseRef.current();
        } finally {
            setIsAnimating(false);
        }
    }, [isAnimating, worldData]);

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                <div className="flex items-center gap-3">
                    <MapIcon className="w-6 h-6 text-blue-400" />
                    <h1 className="text-xl font-semibold text-white">
                        {worldData.metadata.name}
                    </h1>
                </div>

                {/* Close button */}
                <Button
                    variant="ghost"
                    size="sm"
                    icon={<X className="w-6 h-6" />}
                    onClick={onClose}
                    disabled={isAnimating}
                    aria-label="Close map"
                />
            </div>

            {/* PixiJS Canvas Container (fills remaining space) */}
            <div
                ref={containerRef}
                className={`flex-1 relative overflow-hidden ${isPanMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
            >
                {/* Mode toggle + Zoom controls (bottom-right corner) */}
                <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
                    {/* Mode toggle */}
                    <Button
                        variant="toolbar"
                        active={isPanMode}
                        icon={isPanMode ? <Hand className="w-5 h-5" /> : <MousePointer className="w-5 h-5" />}
                        onClick={() => setIsPanMode(!isPanMode)}
                        aria-label={isPanMode ? 'Switch to navigate mode' : 'Switch to pan mode'}
                        title={isPanMode ? 'Pan mode (click to switch to navigate)' : 'Navigate mode (click to switch to pan)'}
                        className="backdrop-blur-sm"
                    />

                    {/* Divider */}
                    <div className="h-px bg-gray-600/50 my-1" />

                    {/* Zoom controls */}
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<ZoomIn className="w-5 h-5" />}
                        onClick={() => cameraRef.current?.setZoom((cameraRef.current?.getZoom() || 1) + 0.25)}
                        aria-label="Zoom in"
                        className="backdrop-blur-sm"
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<ZoomOut className="w-5 h-5" />}
                        onClick={() => cameraRef.current?.setZoom((cameraRef.current?.getZoom() || 1) - 0.25)}
                        aria-label="Zoom out"
                        className="backdrop-blur-sm"
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<Home className="w-5 h-5" />}
                        onClick={() => cameraRef.current?.reset()}
                        aria-label="Reset view"
                        className="backdrop-blur-sm"
                    />
                </div>
            </div>

            {/* Legend (bottom bar) */}
            <div className="border-t border-gray-800 px-6 py-3 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-blue-600/30 border-2 border-blue-500 rounded" />
                    <span className="text-gray-300">Current Room</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-[#2a2a2a] border border-gray-600 rounded" />
                    <span className="text-gray-300">{isPanMode ? 'Drag to Pan' : 'Click to Travel'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-lg">👥</span>
                    <span className="text-gray-300">Friendly NPCs</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-lg">⚔</span>
                    <span className="text-gray-300">Hostile NPCs</span>
                </div>
                <div className="text-gray-500 text-xs ml-4">
                    P: Toggle pan | ESC: Close
                </div>
            </div>

            {/* Animation blocker overlay */}
            {isAnimating && (
                <div className="absolute inset-0 bg-transparent cursor-wait" />
            )}
        </div>
    );
}
