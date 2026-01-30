/**
 * @file progressionUtils.ts
 * @description XP and leveling system utilities for the tactical RPG.
 *
 * ## XP Threshold Formula
 * XP needed for next level = 100 * level^1.5
 *
 * ## Level Thresholds (cumulative)
 * - Level 1->2: 100 XP
 * - Level 2->3: 283 XP (cumulative: 383)
 * - Level 3->4: 520 XP (cumulative: 903)
 * - Level 4->5: 800 XP (cumulative: 1703)
 *
 * ## XP Sources
 * - Kill enemy: level * 10
 * - Incapacitate enemy: level * 5
 */

// =============================================================================
// XP Threshold Calculations
// =============================================================================

/**
 * Calculate XP needed to advance from a given level to the next.
 * Formula: 100 * level^1.5 (rounded down)
 *
 * @param level - Current level (1-60)
 * @returns XP required to reach level + 1
 *
 * @example
 * calculateXPForNextLevel(1)  // 100
 * calculateXPForNextLevel(2)  // 283
 * calculateXPForNextLevel(5)  // 1118
 */
export function calculateXPForNextLevel(level: number): number {
    const clampedLevel = Math.max(1, Math.min(60, level));
    return Math.floor(100 * Math.pow(clampedLevel, 1.5));
}

/**
 * Calculate total cumulative XP needed to reach a given level.
 * This is the sum of XP thresholds for all previous levels.
 *
 * @param targetLevel - Target level (2-61)
 * @returns Total XP needed from level 1 to reach targetLevel
 *
 * @example
 * calculateCumulativeXP(2)  // 100 (just need level 1->2)
 * calculateCumulativeXP(3)  // 383 (100 + 283)
 * calculateCumulativeXP(4)  // 903 (100 + 283 + 520)
 */
export function calculateCumulativeXP(targetLevel: number): number {
    if (targetLevel <= 1) return 0;

    let total = 0;
    for (let level = 1; level < targetLevel; level++) {
        total += calculateXPForNextLevel(level);
    }
    return total;
}

/**
 * Calculate level from cumulative XP.
 * Inverse of calculateCumulativeXP.
 *
 * @param totalXP - Total XP earned
 * @returns Current level (1-60)
 *
 * @example
 * calculateLevelFromXP(0)    // 1
 * calculateLevelFromXP(50)   // 1
 * calculateLevelFromXP(100)  // 2
 * calculateLevelFromXP(400)  // 3
 */
export function calculateLevelFromXP(totalXP: number): number {
    let level = 1;
    let xpUsed = 0;

    while (level < 60) {
        const xpForNext = calculateXPForNextLevel(level);
        if (xpUsed + xpForNext > totalXP) {
            break;
        }
        xpUsed += xpForNext;
        level++;
    }

    return level;
}

/**
 * Get XP progress information toward the next level.
 *
 * @param currentXP - Total XP earned
 * @param currentLevel - Current level (optional, will be calculated if not provided)
 * @returns Progress info with current XP in level, needed for next, and percentage
 *
 * @example
 * getXPProgress(150, 2)
 * // { current: 50, needed: 283, percentage: 17.67 }
 */
export function getXPProgress(
    currentXP: number,
    currentLevel?: number
): {
    current: number;     // XP earned toward next level
    needed: number;      // XP needed for next level
    percentage: number;  // Progress percentage (0-100)
    xpToNextLevel: number; // XP remaining to level up
} {
    const level = currentLevel ?? calculateLevelFromXP(currentXP);
    const xpAtCurrentLevel = calculateCumulativeXP(level);
    const xpInLevel = currentXP - xpAtCurrentLevel;
    const xpNeededForNext = calculateXPForNextLevel(level);

    return {
        current: xpInLevel,
        needed: xpNeededForNext,
        percentage: Math.min(100, (xpInLevel / xpNeededForNext) * 100),
        xpToNextLevel: Math.max(0, xpNeededForNext - xpInLevel),
    };
}

// =============================================================================
// Level-Up Detection
// =============================================================================

/**
 * Information about stat changes from leveling up.
 */
export interface StatChanges {
    hp: { old: number; new: number; };
    damage: { old: number; new: number; };
    defense: { old: number; new: number; };
    speed: { old: number; new: number; };
    armor: { old: number; new: number; };
    movementRange: { old: number; new: number; };
    attackRange: { old: number; new: number; };
}

/**
 * Information about a level-up event.
 */
export interface LevelUpInfo {
    levelsGained: number;
    oldLevel: number;
    newLevel: number;
    oldXP: number;
    newXP: number;
    statChanges: StatChanges;
}

/**
 * Check for level-ups after gaining XP and calculate stat changes.
 *
 * @param oldXP - XP before combat
 * @param xpGained - XP earned from combat
 * @param deriveStats - Function to derive stats from level
 * @returns LevelUpInfo if leveled up, null otherwise
 */
export function checkLevelUp(
    oldXP: number,
    xpGained: number,
    deriveStats: (level: number) => {
        hp: number;
        maxHp: number;
        damage: number;
        defense: number;
        speed: number;
        armor: number;
        movementRange: number;
        attackRange: number;
    }
): LevelUpInfo | null {
    const newXP = oldXP + xpGained;
    const oldLevel = calculateLevelFromXP(oldXP);
    const newLevel = calculateLevelFromXP(newXP);

    if (newLevel <= oldLevel) {
        return null;
    }

    const oldStats = deriveStats(oldLevel);
    const newStats = deriveStats(newLevel);

    return {
        levelsGained: newLevel - oldLevel,
        oldLevel,
        newLevel,
        oldXP,
        newXP,
        statChanges: {
            hp: { old: oldStats.maxHp, new: newStats.maxHp },
            damage: { old: oldStats.damage, new: newStats.damage },
            defense: { old: oldStats.defense, new: newStats.defense },
            speed: { old: oldStats.speed, new: newStats.speed },
            armor: { old: oldStats.armor, new: newStats.armor },
            movementRange: { old: oldStats.movementRange, new: newStats.movementRange },
            attackRange: { old: oldStats.attackRange, new: newStats.attackRange },
        },
    };
}

// =============================================================================
// Gold Utilities
// =============================================================================

/**
 * Calculate gold drop from enemies.
 * Formula: level * 5 per enemy
 *
 * @param enemyLevel - Level of defeated enemy
 * @returns Gold dropped
 */
export function calculateGoldDrop(enemyLevel: number): number {
    return enemyLevel * 5;
}

// =============================================================================
// XP Reward Calculations
// =============================================================================

/**
 * Calculate XP reward for defeating an enemy.
 *
 * @param enemyLevel - Level of defeated enemy
 * @param wasKilled - True if killed, false if incapacitated
 * @returns XP reward
 *
 * Kill: level * 10
 * Incapacitate: level * 5
 */
export function calculateEnemyXP(enemyLevel: number, wasKilled: boolean): number {
    return wasKilled ? enemyLevel * 10 : enemyLevel * 5;
}

// =============================================================================
// Default Player Progression
// =============================================================================

/**
 * Default player progression state for new worlds.
 */
export interface PlayerProgression {
    xp: number;
    level: number;
    gold: number;
}

/**
 * Create default player progression for a new world.
 */
export function createDefaultPlayerProgression(): PlayerProgression {
    return {
        xp: 0,
        level: 1,
        gold: 0,
    };
}
