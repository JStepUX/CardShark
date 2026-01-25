/**
 * @file WorldMapStage.ts
 * @description Main PIXI.Container managing the world map layout and layer hierarchy.
 * 
 * Layer Structure:
 * - backgroundLayer: Dark gradient or world image
 * - gridLayer: RoomTile instances (8x6 grid)
 * - connectionLayer: Future - paths between rooms
 * - playerLayer: PlayerToken sprite
 * - effectsLayer: Particles (dust, ambient)
 * - uiLayer: Tooltips, legend
 */

import * as PIXI from 'pixi.js';
import { GridWorldState } from '../../../types/worldGrid';
import { RoomTile } from './RoomTile';
import { PlayerToken } from './PlayerToken';

// Grid configuration (8x6 grid, larger tiles for visibility)
const GRID_WIDTH = 8;
const GRID_HEIGHT = 6;
const TILE_SIZE = 140;
const TILE_GAP = 6;
const STAGE_WIDTH = GRID_WIDTH * (TILE_SIZE + TILE_GAP);
const STAGE_HEIGHT = GRID_HEIGHT * (TILE_SIZE + TILE_GAP);

export class WorldMapStage extends PIXI.Container {
    // Layers (rendered in order)
    private backgroundLayer: PIXI.Container;
    private gridLayer: PIXI.Container;
    private connectionLayer: PIXI.Container;
    private playerLayer: PIXI.Container;
    private effectsLayer: PIXI.Container;
    private uiLayer: PIXI.Container;

    // Room tiles by position
    private roomTiles: Map<string, RoomTile> = new Map();

    // Player token
    private playerToken: PlayerToken;

    // Current state
    private currentRoomId: string | null = null;

    // Backdrop image
    private backdropSprite: PIXI.Sprite | null = null;

    constructor() {
        super();

        // Create layers in render order (bottom to top)
        this.backgroundLayer = new PIXI.Container();
        this.addChild(this.backgroundLayer);

        this.gridLayer = new PIXI.Container();
        this.addChild(this.gridLayer);

        this.connectionLayer = new PIXI.Container();
        this.addChild(this.connectionLayer);

        this.playerLayer = new PIXI.Container();
        this.addChild(this.playerLayer);

        this.effectsLayer = new PIXI.Container();
        this.addChild(this.effectsLayer);

        this.uiLayer = new PIXI.Container();
        this.addChild(this.uiLayer);

        // Create background
        this.createBackground();

        // Create player token
        this.playerToken = new PlayerToken();
        this.playerLayer.addChild(this.playerToken);
    }

    /**
     * Create dark gradient background (default)
     */
    private createBackground(): void {
        const bg = new PIXI.Graphics();

        // Dark gradient background
        bg.rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
        bg.fill({ color: 0x0a0a0a, alpha: 1 });

        this.backgroundLayer.addChild(bg);
    }

    /**
     * Set custom backdrop image (full map background)
     * @param imagePath - Path to backdrop image, or null to clear
     */
    setBackdropImage(imagePath: string | null): void {
        // Remove existing backdrop
        if (this.backdropSprite) {
            this.backgroundLayer.removeChild(this.backdropSprite);
            this.backdropSprite.destroy();
            this.backdropSprite = null;
        }

        if (!imagePath) return;

        // Load texture and create sprite
        const texture = PIXI.Texture.from(imagePath);
        this.backdropSprite = new PIXI.Sprite(texture);

        // Cover scaling - scale to fill entire stage, may crop
        const onTextureLoaded = () => {
            if (!this.backdropSprite) return;

            const textureWidth = texture.width || STAGE_WIDTH;
            const textureHeight = texture.height || STAGE_HEIGHT;

            const scaleX = STAGE_WIDTH / textureWidth;
            const scaleY = STAGE_HEIGHT / textureHeight;
            const scale = Math.max(scaleX, scaleY);

            this.backdropSprite.scale.set(scale);

            // Center the image
            const scaledWidth = textureWidth * scale;
            const scaledHeight = textureHeight * scale;
            this.backdropSprite.x = (STAGE_WIDTH - scaledWidth) / 2;
            this.backdropSprite.y = (STAGE_HEIGHT - scaledHeight) / 2;
        };

        // If texture is already loaded, apply scaling immediately
        if (texture.source.width > 0) {
            onTextureLoaded();
        } else {
            // Wait for texture to load
            texture.source.on('update', onTextureLoaded);
        }

        // Semi-transparent so tiles are visible
        this.backdropSprite.alpha = 0.3;

        // Add behind default background (at index 0)
        this.backgroundLayer.addChildAt(this.backdropSprite, 0);
    }

    /**
     * Update map from world state
     */
    updateFromState(worldData: GridWorldState): void {
        // Clear existing tiles
        this.roomTiles.forEach(tile => {
            this.gridLayer.removeChild(tile);
            tile.destroy();
        });
        this.roomTiles.clear();

        // Create tiles for each room in the grid
        worldData.grid.forEach((row, y) => {
            row.forEach((room, x) => {
                if (room) {
                    const tile = new RoomTile(room);

                    // Position tile
                    tile.x = x * (TILE_SIZE + TILE_GAP);
                    tile.y = y * (TILE_SIZE + TILE_GAP);

                    // Set up click handler
                    tile.on('pointerdown', () => {
                        this.emit('roomClicked', room.id);
                    });

                    // Store tile
                    const key = `${x},${y}`;
                    this.roomTiles.set(key, tile);
                    this.gridLayer.addChild(tile);
                }
            });
        });
    }

    /**
     * Set current room (updates player token position and room state)
     */
    setCurrentRoom(roomId: string | null, worldData: GridWorldState): void {
        // Clear previous current room state
        if (this.currentRoomId) {
            const prevTile = this.findRoomTile(this.currentRoomId);
            if (prevTile) {
                prevTile.setState('normal');
            }
        }

        this.currentRoomId = roomId;

        if (!roomId) {
            this.playerToken.visible = false;
            return;
        }

        // Find the room and its position
        let roomPosition: { x: number; y: number } | null = null;
        worldData.grid.forEach((row, y) => {
            row.forEach((room, x) => {
                if (room && room.id === roomId) {
                    roomPosition = { x, y };
                }
            });
        });

        if (!roomPosition) {
            this.playerToken.visible = false;
            return;
        }

        // TypeScript type narrowing - roomPosition is guaranteed to be non-null here
        const pos = roomPosition as { x: number; y: number };

        // Update tile state
        const tile = this.roomTiles.get(`${pos.x},${pos.y}`);
        if (tile) {
            tile.setState('current');
        }

        // Position player token at center of tile
        this.playerToken.visible = true;
        this.playerToken.x = pos.x * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2;
        this.playerToken.y = pos.y * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2;
    }

    /**
     * Find room tile by room ID
     */
    private findRoomTile(roomId: string): RoomTile | undefined {
        for (const tile of this.roomTiles.values()) {
            if (tile.getRoomId() === roomId) {
                return tile;
            }
        }
        return undefined;
    }

    /**
     * Get room tile position (for animations)
     */
    getRoomPosition(roomId: string): { x: number; y: number } | null {
        const tile = this.findRoomTile(roomId);
        if (!tile) return null;

        return {
            x: tile.x + TILE_SIZE / 2,
            y: tile.y + TILE_SIZE / 2,
        };
    }

    /**
     * Highlight a room
     */
    highlightRoom(roomId: string): void {
        const tile = this.findRoomTile(roomId);
        if (tile && tile.getRoomId() !== this.currentRoomId) {
            tile.setState('highlighted');
        }
    }

    /**
     * Clear all highlights
     */
    clearHighlights(): void {
        this.roomTiles.forEach(tile => {
            if (tile.getRoomId() !== this.currentRoomId) {
                tile.setState('normal');
            }
        });
    }

    /**
     * Get player token (for animations)
     */
    getPlayerToken(): PlayerToken {
        return this.playerToken;
    }

    /**
     * Get effects layer (for particle system)
     */
    getEffectsLayer(): PIXI.Container {
        return this.effectsLayer;
    }

    /**
     * Update animations (call from ticker)
     */
    updateAnimations(deltaTime: number): void {
        // Update player token pulse
        this.playerToken.updatePulse(deltaTime);

        // Update room tile pulses (current room)
        this.roomTiles.forEach(tile => {
            tile.updatePulse(deltaTime);
        });
    }

    /**
     * Cleanup
     */
    destroy(options?: boolean | PIXI.DestroyOptions): void {
        // Destroy all tiles
        this.roomTiles.forEach(tile => tile.destroy());
        this.roomTiles.clear();

        // Destroy player token
        this.playerToken.destroy();

        // Destroy layers
        this.backgroundLayer.destroy({ children: true });
        this.gridLayer.destroy({ children: true });
        this.connectionLayer.destroy({ children: true });
        this.playerLayer.destroy({ children: true });
        this.effectsLayer.destroy({ children: true });
        this.uiLayer.destroy({ children: true });

        super.destroy(options);
    }
}
