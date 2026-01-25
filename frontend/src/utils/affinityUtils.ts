// frontend/src/utils/affinityUtils.ts
// Utility functions for NPC affinity/relationship calculations

import { AffinityTier, NPCRelationship } from '../types/worldRuntime';

/**
 * Calculate affinity tier from numeric affinity score.
 * @param affinity - Affinity score (0-100)
 * @returns Corresponding AffinityTier
 */
export function calculateAffinityTier(affinity: number): AffinityTier {
    const clamped = clampAffinity(affinity);

    if (clamped >= 80) return AffinityTier.BEST_FRIEND;
    if (clamped >= 60) return AffinityTier.FRIEND;
    if (clamped >= 40) return AffinityTier.ACQUAINTANCE;
    if (clamped >= 20) return AffinityTier.STRANGER;
    return AffinityTier.HOSTILE;
}

/**
 * Get display name for affinity tier.
 * @param tier - AffinityTier enum value
 * @returns Human-readable tier name
 */
export function getTierDisplayName(tier: AffinityTier): string {
    const names: Record<AffinityTier, string> = {
        [AffinityTier.HOSTILE]: 'Hostile',
        [AffinityTier.STRANGER]: 'Stranger',
        [AffinityTier.ACQUAINTANCE]: 'Acquaintance',
        [AffinityTier.FRIEND]: 'Friend',
        [AffinityTier.BEST_FRIEND]: 'Best Friend',
    };
    return names[tier];
}

/**
 * Get color class for affinity tier (Tailwind CSS).
 * @param tier - AffinityTier enum value
 * @returns Tailwind color class
 */
export function getTierColor(tier: AffinityTier): string {
    const colors: Record<AffinityTier, string> = {
        [AffinityTier.HOSTILE]: 'text-red-500',
        [AffinityTier.STRANGER]: 'text-gray-400',
        [AffinityTier.ACQUAINTANCE]: 'text-yellow-400',
        [AffinityTier.FRIEND]: 'text-green-400',
        [AffinityTier.BEST_FRIEND]: 'text-pink-400',
    };
    return colors[tier];
}

/**
 * Calculate number of hearts to display (0-5).
 * Each tier corresponds to one heart, with partial fill for progress.
 * @param affinity - Affinity score (0-100)
 * @returns Number of hearts (0-5, can be fractional)
 */
export function calculateHearts(affinity: number): number {
    const clamped = clampAffinity(affinity);
    // 0-100 maps to 0-5 hearts
    return clamped / 20;
}

/**
 * Get number of filled hearts (integer) and whether to show half heart.
 * @param affinity - Affinity score (0-100)
 * @returns Object with filled hearts count and half heart flag
 */
export function getHeartDisplay(affinity: number): { filled: number; half: boolean } {
    const hearts = calculateHearts(affinity);
    const filled = Math.floor(hearts);
    const half = (hearts - filled) >= 0.5;
    return { filled, half };
}

/**
 * Clamp affinity to valid range (0-100).
 * @param affinity - Raw affinity value
 * @returns Clamped value between 0 and 100
 */
export function clampAffinity(affinity: number): number {
    return Math.max(0, Math.min(100, affinity));
}

/**
 * Create default relationship for a new NPC.
 * @param npcUuid - NPC character UUID
 * @returns Default NPCRelationship object
 */
export function createDefaultRelationship(npcUuid: string): NPCRelationship {
    return {
        npc_uuid: npcUuid,
        affinity: 20, // Start as Stranger
        tier: AffinityTier.STRANGER,
        last_interaction: new Date().toISOString(),
        total_interactions: 0,
        flags: [],
        sentiment_history: [],
        messages_since_last_gain: 0,
        last_sentiment_gain: new Date().toISOString(),
        affinity_gained_today: 0,
        affinity_day_started: 1, // Start on Day 1
    };
}

/**
 * Update relationship with affinity change.
 * Recalculates tier and updates interaction timestamp.
 * @param relationship - Current relationship data
 * @param affinityDelta - Change in affinity (can be negative)
 * @returns Updated relationship object
 */
export function updateRelationshipAffinity(
    relationship: NPCRelationship,
    affinityDelta: number
): NPCRelationship {
    const newAffinity = clampAffinity(relationship.affinity + affinityDelta);
    const newTier = calculateAffinityTier(newAffinity);

    return {
        ...relationship,
        affinity: newAffinity,
        tier: newTier,
        last_interaction: new Date().toISOString(),
        total_interactions: relationship.total_interactions + 1,
    };
}

/**
 * Format affinity change for display.
 * @param delta - Affinity change amount
 * @returns Formatted string (e.g., "+15", "-5")
 */
export function formatAffinityDelta(delta: number): string {
    return delta > 0 ? `+${delta}` : `${delta}`;
}

/**
 * Get affinity change description based on magnitude.
 * @param delta - Affinity change amount
 * @returns Description string
 */
export function getAffinityChangeDescription(delta: number): string {
    const abs = Math.abs(delta);

    if (abs >= 20) return delta > 0 ? 'greatly improved' : 'greatly worsened';
    if (abs >= 10) return delta > 0 ? 'improved' : 'worsened';
    if (abs >= 5) return delta > 0 ? 'slightly improved' : 'slightly worsened';
    return delta > 0 ? 'nudged up' : 'nudged down';
}

/**
 * Check if NPC can gain affinity today (under daily cap).
 * Automatically resets tracking if it's a new day.
 * 
 * @param relationship - Current relationship data
 * @param currentDay - Current day number
 * @param dailyCap - Maximum affinity gain per day (default: 60 = 3 hearts)
 * @returns True if NPC can still gain affinity today
 */
export function canGainAffinityToday(
    relationship: NPCRelationship,
    currentDay: number,
    dailyCap: number = 60
): boolean {
    // If it's a new day, tracking will be reset (so they can gain)
    if (relationship.affinity_day_started !== currentDay) {
        return true;
    }

    // Check if under daily cap
    return relationship.affinity_gained_today < dailyCap;
}

/**
 * Calculate how much affinity can be gained (respecting daily cap).
 * Returns the actual amount that can be gained, which may be less than requested.
 * 
 * @param relationship - Current relationship data
 * @param requestedDelta - Desired affinity change
 * @param currentDay - Current day number
 * @param dailyCap - Maximum affinity gain per day (default: 60 = 3 hearts)
 * @returns Actual affinity that can be gained (0 if cap reached)
 */
export function getAvailableAffinityGain(
    relationship: NPCRelationship,
    requestedDelta: number,
    currentDay: number,
    dailyCap: number = 60
): number {
    // If it's a new day, reset tracking (full amount available)
    if (relationship.affinity_day_started !== currentDay) {
        return Math.min(requestedDelta, dailyCap);
    }

    // Calculate remaining capacity for today
    const remainingCapacity = dailyCap - relationship.affinity_gained_today;

    // Return the lesser of requested amount or remaining capacity
    return Math.max(0, Math.min(requestedDelta, remainingCapacity));
}

/**
 * Reset daily affinity tracking for new day.
 * Called when a new day begins to allow fresh affinity gains.
 * 
 * @param relationship - Current relationship data
 * @param newDay - New day number
 * @returns Updated relationship with reset daily tracking
 */
export function resetDailyAffinity(
    relationship: NPCRelationship,
    newDay: number
): NPCRelationship {
    return {
        ...relationship,
        affinity_gained_today: 0,
        affinity_day_started: newDay,
    };
}

