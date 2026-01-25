// frontend/src/utils/sentimentAffinityCalculator.ts
// Calculate affinity changes from conversation sentiment

import type { NPCRelationship } from '../types/worldRuntime';

export interface SentimentAffinityResult {
    shouldGainAffinity: boolean;
    affinityDelta: number;
    reason: string;
    averageValence: number;
}

// Configuration constants
const SENTIMENT_WINDOW_SIZE = 10;  // Track last 10 valence scores
const COOLDOWN_MESSAGES = 20;      // Wait 20 messages between affinity gains
const POSITIVE_THRESHOLD = 40;     // Average valence > 40 = positive
const VERY_POSITIVE_THRESHOLD = 70; // Average valence > 70 = very positive
const NEGATIVE_THRESHOLD = -40;    // Average valence < -40 = negative

/**
 * Calculate affinity change from conversation sentiment.
 * Tracks sentiment over a sliding window and grants affinity for sustained positive interactions.
 * 
 * @param relationship - Current NPC relationship data
 * @param currentValence - Current emotion valence (-100 to +100)
 * @param totalMessages - Total messages in conversation (for cooldown tracking)
 * @param currentDay - Current day number (for daily cap tracking)
 * @param dailyCap - Maximum affinity gain per day (default: 60)
 * @returns Affinity change result with delta and reason
 */
export function calculateSentimentAffinity(
    relationship: NPCRelationship,
    currentValence: number,
    totalMessages: number,
    currentDay: number = 1,
    dailyCap: number = 60
): SentimentAffinityResult {
    // Initialize result
    const result: SentimentAffinityResult = {
        shouldGainAffinity: false,
        affinityDelta: 0,
        reason: '',
        averageValence: 0,
    };

    // Update sentiment history (sliding window)
    const updatedHistory = [...relationship.sentiment_history, currentValence];
    if (updatedHistory.length > SENTIMENT_WINDOW_SIZE) {
        updatedHistory.shift(); // Remove oldest
    }

    // Calculate average valence over window
    if (updatedHistory.length === 0) {
        return result;
    }

    const averageValence = updatedHistory.reduce((sum, val) => sum + val, 0) / updatedHistory.length;
    result.averageValence = averageValence;

    // Check if we have enough data (full window)
    if (updatedHistory.length < SENTIMENT_WINDOW_SIZE) {
        return result; // Not enough data yet
    }

    // Check cooldown
    const messagesSinceLastGain = totalMessages - relationship.messages_since_last_gain;
    if (messagesSinceLastGain < COOLDOWN_MESSAGES) {
        return result; // Still in cooldown
    }

    // Determine affinity change based on average sentiment
    let affinityDelta = 0;
    let reason = '';

    if (averageValence >= VERY_POSITIVE_THRESHOLD) {
        affinityDelta = 10;
        reason = 'very positive conversation';
    } else if (averageValence >= POSITIVE_THRESHOLD) {
        affinityDelta = 5;
        reason = 'positive conversation';
    } else if (averageValence <= NEGATIVE_THRESHOLD) {
        affinityDelta = -3;
        reason = 'negative sentiment';
    }

    // Apply daily cap filtering (only for positive gains)
    if (affinityDelta > 0) {
        const { getAvailableAffinityGain } = require('./affinityUtils');
        const availableGain = getAvailableAffinityGain(
            relationship,
            affinityDelta,
            currentDay,
            dailyCap
        );

        if (availableGain === 0) {
            result.shouldGainAffinity = false;
            result.affinityDelta = 0;
            result.reason = 'daily affinity limit reached';
            return result;
        }

        if (availableGain < affinityDelta) {
            reason = `${reason} (daily limit: ${availableGain}/${affinityDelta})`;
            affinityDelta = availableGain;
        }
    }

    if (affinityDelta !== 0) {
        result.shouldGainAffinity = true;
        result.affinityDelta = affinityDelta;
        result.reason = reason;
    }

    return result;
}

/**
 * Update relationship with new sentiment data.
 * Call this after each NPC message to track sentiment history.
 * 
 * @param relationship - Current relationship
 * @param valence - New valence score to add
 * @param totalMessages - Current total message count
 * @returns Updated relationship with new sentiment data
 */
export function updateSentimentHistory(
    relationship: NPCRelationship,
    valence: number,
    totalMessages: number
): NPCRelationship {
    const updatedHistory = [...relationship.sentiment_history, valence];
    if (updatedHistory.length > SENTIMENT_WINDOW_SIZE) {
        updatedHistory.shift();
    }

    return {
        ...relationship,
        sentiment_history: updatedHistory,
        messages_since_last_gain: totalMessages,
    };
}

/**
 * Reset sentiment tracking after affinity gain.
 * Clears history and updates cooldown tracker.
 * 
 * @param relationship - Current relationship
 * @param totalMessages - Current total message count
 * @returns Updated relationship with reset sentiment tracking
 */
export function resetSentimentAfterGain(
    relationship: NPCRelationship,
    totalMessages: number
): NPCRelationship {
    return {
        ...relationship,
        sentiment_history: [],
        messages_since_last_gain: totalMessages,
        last_sentiment_gain: new Date().toISOString(),
    };
}
