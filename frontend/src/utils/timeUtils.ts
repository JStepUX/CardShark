// frontend/src/utils/timeUtils.ts
// Utility functions for day/night cycle time progression

import { TimeState, TimeConfig } from '../types/worldRuntime';

/**
 * Create default time state for new world sessions.
 * Starts at Day 1, dawn (0 messages).
 */
export function createDefaultTimeState(): TimeState {
    return {
        currentDay: 1,
        messagesInDay: 0,
        totalMessages: 0,
        timeOfDay: 0.0, // Dawn
        lastMessageTimestamp: new Date().toISOString(),
    };
}

/**
 * Advance time by one message.
 * Returns updated TimeState and whether a new day started.
 * 
 * @param currentState - Current time state
 * @param config - Time system configuration
 * @returns Object with newState and newDayStarted flag
 */
export function advanceTime(
    currentState: TimeState,
    config: TimeConfig
): { newState: TimeState; newDayStarted: boolean } {
    const newMessagesInDay = currentState.messagesInDay + 1;
    const newTotalMessages = currentState.totalMessages + 1;

    // Check if we've completed a full day cycle
    const newDayStarted = newMessagesInDay >= config.messagesPerDay;

    const newState: TimeState = {
        currentDay: newDayStarted ? currentState.currentDay + 1 : currentState.currentDay,
        messagesInDay: newDayStarted ? 0 : newMessagesInDay,
        totalMessages: newTotalMessages,
        timeOfDay: calculateTimeOfDay(
            newDayStarted ? 0 : newMessagesInDay,
            config.messagesPerDay
        ),
        lastMessageTimestamp: new Date().toISOString(),
    };

    return { newState, newDayStarted };
}

/**
 * Calculate time of day (0.0-1.0) from message count.
 * 
 * @param messagesInDay - Messages since day started
 * @param messagesPerDay - Total messages per day cycle
 * @returns Time of day (0.0 = dawn, 0.5 = noon, 1.0 = midnight)
 */
export function calculateTimeOfDay(
    messagesInDay: number,
    messagesPerDay: number
): number {
    if (messagesPerDay === 0) return 0;
    return Math.min(1.0, messagesInDay / messagesPerDay);
}

/**
 * Get sun/moon rotation angle for visual sphere.
 * The sphere rotates 180 degrees over the course of a day.
 * 
 * @param timeOfDay - Time of day (0.0-1.0)
 * @returns Rotation angle in degrees (0-180)
 */
export function getSunMoonAngle(timeOfDay: number): number {
    // 0.0 (dawn) = 0°, 0.5 (noon) = 90°, 1.0 (midnight) = 180°
    return timeOfDay * 180;
}

/**
 * Get descriptive time of day string for UI display.
 * 
 * @param timeOfDay - Time of day (0.0-1.0)
 * @returns Human-readable time description
 */
export function getTimeOfDayDescription(timeOfDay: number): string {
    if (timeOfDay < 0.125) return 'Dawn';
    if (timeOfDay < 0.375) return 'Morning';
    if (timeOfDay < 0.625) return 'Noon';
    if (timeOfDay < 0.75) return 'Afternoon';
    if (timeOfDay < 0.875) return 'Dusk';
    if (timeOfDay < 1.0) return 'Night';
    return 'Midnight';
}

/**
 * Format time progress for tooltip display.
 * 
 * @param messagesInDay - Messages since day started
 * @param messagesPerDay - Total messages per day
 * @returns Formatted string (e.g., "25/50 messages")
 */
export function formatTimeProgress(messagesInDay: number, messagesPerDay: number): string {
    return `${messagesInDay}/${messagesPerDay} messages`;
}
