/**
 * @file adventureLogContext.ts
 * @description Utilities for formatting adventure log into LLM context.
 *
 * The adventure log provides narrative continuity by summarizing previous room visits.
 * This module formats those summaries for injection into the LLM prompt.
 */

import type { AdventureContext, RoomSummary, NPCInteractionSummary } from '../types/adventureLog';

/**
 * Maximum number of recent entries to include in context.
 * Limits token usage while maintaining narrative continuity.
 */
const MAX_ENTRIES_IN_CONTEXT = 5;

/**
 * Maximum characters for the entire adventure log section.
 * Prevents context bloat.
 */
const MAX_ADVENTURE_LOG_CHARS = 1500;

/**
 * Format a single room summary into a concise narrative line.
 */
function formatRoomSummary(entry: RoomSummary): string {
  const parts: string[] = [];

  // Room name
  parts.push(`In ${entry.roomName}:`);

  // Key events (first 2 only for brevity)
  if (entry.keyEvents.length > 0) {
    const events = entry.keyEvents.slice(0, 2).join('; ');
    parts.push(events);
  }

  // NPC interactions (summarized)
  if (entry.npcsInteracted.length > 0) {
    const npcSummaries = entry.npcsInteracted.map(npc => {
      const changeText = npc.relationshipChange === 'improved' ? '(+)'
        : npc.relationshipChange === 'worsened' ? '(-)'
        : '';
      return `${npc.npcName}${changeText}`;
    });
    parts.push(`Met: ${npcSummaries.join(', ')}`);
  }

  // Items (if any)
  if (entry.itemsChanged.length > 0) {
    const itemList = entry.itemsChanged.map(i =>
      `${i.action}: ${i.item}`
    ).join(', ');
    parts.push(itemList);
  }

  // Mood on departure
  if (entry.moodOnDeparture && entry.moodOnDeparture !== 'neutral') {
    parts.push(`Left feeling ${entry.moodOnDeparture}`);
  }

  return parts.join(' ');
}

/**
 * Format adventure context for LLM injection.
 *
 * Returns a formatted string suitable for including in session notes or memory context.
 * Returns empty string if no meaningful entries exist.
 *
 * @param context - The adventure context to format
 * @param currentRoomUuid - UUID of current room (to exclude from history)
 * @returns Formatted adventure log string, or empty string
 */
export function formatAdventureLogForContext(
  context: AdventureContext | null,
  currentRoomUuid?: string
): string {
  if (!context || context.entries.length === 0) {
    return '';
  }

  // Filter out current room and get recent entries
  const relevantEntries = context.entries
    .filter(entry => entry.roomUuid !== currentRoomUuid)
    .slice(-MAX_ENTRIES_IN_CONTEXT);

  if (relevantEntries.length === 0) {
    return '';
  }

  // Format header
  const lines: string[] = [
    '[Your Recent Journey]',
  ];

  // Format each entry
  for (const entry of relevantEntries) {
    const summary = formatRoomSummary(entry);
    lines.push(`- ${summary}`);
  }

  // Add unresolved threads from most recent entry
  const lastEntry = relevantEntries[relevantEntries.length - 1];
  if (lastEntry?.unresolvedThreads.length > 0) {
    lines.push('');
    lines.push('Unresolved: ' + lastEntry.unresolvedThreads.join('; '));
  }

  // Add current objectives if any
  if (context.currentObjectives.length > 0) {
    lines.push('');
    lines.push('Current objectives: ' + context.currentObjectives.join(', '));
  }

  lines.push('[End Journey]');

  // Join and truncate if needed
  let result = lines.join('\n');
  if (result.length > MAX_ADVENTURE_LOG_CHARS) {
    result = result.substring(0, MAX_ADVENTURE_LOG_CHARS - 3) + '...';
  }

  return result;
}

/**
 * Merge adventure log context with existing session notes.
 *
 * @param sessionNotes - Existing session notes (may be empty)
 * @param adventureContext - Adventure context to merge
 * @param currentRoomUuid - Current room UUID to exclude
 * @returns Combined notes string
 */
export function mergeAdventureLogWithNotes(
  sessionNotes: string,
  adventureContext: AdventureContext | null,
  currentRoomUuid?: string
): string {
  const adventureLog = formatAdventureLogForContext(adventureContext, currentRoomUuid);

  if (!adventureLog) {
    return sessionNotes;
  }

  if (!sessionNotes || !sessionNotes.trim()) {
    return adventureLog;
  }

  // Combine: adventure log first (background context), then user notes
  return `${adventureLog}\n\n${sessionNotes}`;
}

/**
 * Extract notable events from adventure context for quick reference.
 *
 * @param context - The adventure context
 * @returns Array of notable event strings
 */
export function extractNotableEvents(context: AdventureContext | null): string[] {
  if (!context || context.entries.length === 0) {
    return [];
  }

  const events: string[] = [];

  for (const entry of context.entries.slice(-3)) {
    for (const event of entry.keyEvents) {
      events.push(`${entry.roomName}: ${event}`);
    }
  }

  return events.slice(-5); // Return at most 5 recent events
}

/**
 * Get NPC relationship changes from adventure context.
 *
 * @param context - The adventure context
 * @returns Map of NPC UUID to their latest interaction summary
 */
export function getNpcRelationshipChanges(
  context: AdventureContext | null
): Map<string, NPCInteractionSummary> {
  const relationships = new Map<string, NPCInteractionSummary>();

  if (!context) {
    return relationships;
  }

  // Iterate chronologically so later entries overwrite earlier ones
  for (const entry of context.entries) {
    for (const npc of entry.npcsInteracted) {
      relationships.set(npc.npcUuid, npc);
    }
  }

  return relationships;
}
