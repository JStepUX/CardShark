/**
 * @file SoundManager.ts
 * @description Singleton sound manager for combat sound effects and music.
 *
 * Uses @pixi/sound for audio playback with separate volume controls for
 * SFX (sound effects) and music (combat loop).
 */

import { sound, Sound } from '@pixi/sound';

export type SoundId =
    | 'melee_attack'
    | 'melee_miss'
    | 'ranged_miss'
    | 'level_up'
    | 'victory'
    | 'defeat'
    | 'combat_music';

// Sound file paths relative to public folder
const SOUND_PATHS: Record<string, string | string[]> = {
    melee_attack: [
        '/sounds/melee_attack_1.mp3',
        '/sounds/melee_attack_2.mp3',
        '/sounds/melee_attack_3.mp3',
    ],
    melee_miss: '/sounds/melee_miss_1.mp3',
    ranged_miss: '/sounds/ranged_miss_1.mp3',
    level_up: '/sounds/level_up_1.mp3',
    victory: '/sounds/level_up_1.mp3', // Using level_up for victory fanfare
    defeat: '/sounds/male_defeat_1.mp3',
    combat_music: '/sounds/combat_music_loop_1.mp3',
};

class SoundManager {
    private initialized = false;
    private sfxVolume = 0.5;
    private musicVolume = 0.3;
    private musicInstance: Sound | null = null;
    private isMusicPlaying = false;

    /**
     * Initialize and load all sounds.
     * Call this once at app startup or before first use.
     */
    async init(): Promise<void> {
        if (this.initialized) return;

        try {
            // Load all sounds
            for (const [id, path] of Object.entries(SOUND_PATHS)) {
                if (Array.isArray(path)) {
                    // Load multiple variants (for random selection)
                    for (let i = 0; i < path.length; i++) {
                        sound.add(`${id}_${i}`, path[i]);
                    }
                } else {
                    sound.add(id, path);
                }
            }

            // Store reference to combat music for looping control
            this.musicInstance = sound.find('combat_music');
            if (this.musicInstance) {
                this.musicInstance.loop = true;
            }

            this.initialized = true;
            console.log('[SoundManager] Initialized with all sounds loaded');
        } catch (error) {
            console.error('[SoundManager] Failed to initialize:', error);
        }
    }

    /**
     * Set the volume for sound effects (0-1 range).
     */
    setSfxVolume(vol: number): void {
        this.sfxVolume = Math.max(0, Math.min(1, vol));
    }

    /**
     * Set the volume for music (0-1 range).
     * Updates currently playing music immediately.
     */
    setMusicVolume(vol: number): void {
        this.musicVolume = Math.max(0, Math.min(1, vol));
        // Update playing music volume
        if (this.musicInstance && this.isMusicPlaying) {
            this.musicInstance.volume = this.musicVolume;
        }
    }

    /**
     * Get current SFX volume (0-1).
     */
    getSfxVolume(): number {
        return this.sfxVolume;
    }

    /**
     * Get current music volume (0-1).
     */
    getMusicVolume(): number {
        return this.musicVolume;
    }

    /**
     * Play a sound effect at the current SFX volume.
     * For sounds with variants (like melee_attack), selects randomly.
     */
    play(id: SoundId): void {
        if (!this.initialized) {
            console.warn('[SoundManager] Not initialized, cannot play:', id);
            return;
        }

        // Don't play music through play() - use playMusic() instead
        if (id === 'combat_music') {
            this.playMusic();
            return;
        }

        try {
            const path = SOUND_PATHS[id];

            if (Array.isArray(path)) {
                // Pick random variant
                const variantIndex = Math.floor(Math.random() * path.length);
                const soundId = `${id}_${variantIndex}`;
                sound.play(soundId, { volume: this.sfxVolume });
            } else {
                sound.play(id, { volume: this.sfxVolume });
            }
        } catch (error) {
            console.warn('[SoundManager] Failed to play sound:', id, error);
        }
    }

    /**
     * Start combat music loop at the current music volume.
     * Does nothing if music is already playing.
     */
    playMusic(): void {
        if (!this.initialized) {
            console.warn('[SoundManager] Not initialized, cannot play music');
            return;
        }

        if (this.isMusicPlaying) return;

        try {
            if (this.musicInstance) {
                this.musicInstance.volume = this.musicVolume;
                this.musicInstance.play();
                this.isMusicPlaying = true;
                console.log('[SoundManager] Combat music started');
            }
        } catch (error) {
            console.warn('[SoundManager] Failed to play music:', error);
        }
    }

    /**
     * Stop combat music loop.
     */
    stopMusic(): void {
        if (!this.initialized) return;

        try {
            if (this.musicInstance && this.isMusicPlaying) {
                this.musicInstance.stop();
                this.isMusicPlaying = false;
                console.log('[SoundManager] Combat music stopped');
            }
        } catch (error) {
            console.warn('[SoundManager] Failed to stop music:', error);
        }
    }

    /**
     * Check if music is currently playing.
     */
    isMusicActive(): boolean {
        return this.isMusicPlaying;
    }
}

// Export singleton instance
export const soundManager = new SoundManager();
