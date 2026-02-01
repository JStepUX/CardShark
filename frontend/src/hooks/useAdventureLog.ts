/**
 * @file useAdventureLog.ts
 * @description Hook for managing adventure log and session notes in world play.
 *
 * Extracted from WorldPlayView to separate concerns:
 * - Adventure context loading and storage
 * - Session notes injection with adventure log
 * - Base session notes tracking
 *
 * This hook manages the narrative continuity system that provides
 * context about previous room visits to the LLM.
 */

import { useEffect, useRef } from 'react';
import type { AdventureContext } from '../types/adventureLog';
import { mergeAdventureLogWithNotes } from '../utils/adventureLogContext';

// =============================================================================
// Types
// =============================================================================

export interface UseAdventureLogOptions {
  /** Current adventure context (loaded from API) */
  adventureContext: AdventureContext | null;

  /** Current room ID (to exclude from history) */
  currentRoomId: string | undefined;

  /** Current session notes value */
  sessionNotes: string;

  /** Setter for session notes */
  setSessionNotes: (notes: string) => void;
}

export interface UseAdventureLogResult {
  /** Ref to the base session notes (user-entered, without adventure log) */
  baseSessionNotesRef: React.MutableRefObject<string>;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for managing adventure log injection into session notes.
 *
 * This hook maintains a separation between user-entered session notes
 * and the auto-generated adventure log. It merges them for context
 * injection while preserving the ability to track user edits.
 */
export function useAdventureLog(options: UseAdventureLogOptions): UseAdventureLogResult {
  const {
    adventureContext,
    currentRoomId,
    sessionNotes,
    setSessionNotes,
  } = options;

  // Track the base (user-entered) session notes separate from adventure log
  const baseSessionNotesRef = useRef<string>('');

  // ==========================================================================
  // Adventure Log Injection
  // ==========================================================================

  /**
   * When adventure context or current room changes, merge adventure log
   * into session notes. This provides narrative continuity by telling
   * the LLM about previous room visits.
   */
  useEffect(() => {
    if (!adventureContext || adventureContext.entries.length === 0) {
      return;
    }

    // Merge adventure log with base session notes (excluding current room from history)
    const mergedNotes = mergeAdventureLogWithNotes(
      baseSessionNotesRef.current,
      adventureContext,
      currentRoomId
    );

    // Only update if different (prevent infinite loops)
    if (mergedNotes !== sessionNotes) {
      setSessionNotes(mergedNotes);
      console.log('[useAdventureLog] Injected adventure log into session context');
    }
  }, [adventureContext, currentRoomId, sessionNotes, setSessionNotes]);

  // ==========================================================================
  // Base Notes Tracking
  // ==========================================================================

  /**
   * When session notes change (e.g., user edits via Journal), capture
   * the base notes if they don't appear to have adventure log merged in.
   *
   * This allows us to preserve user edits when re-merging.
   */
  useEffect(() => {
    // Only capture as "base" if it doesn't look like it has adventure log merged in
    if (sessionNotes && !sessionNotes.startsWith('[Your Recent Journey]')) {
      baseSessionNotesRef.current = sessionNotes;
    }
  }, [sessionNotes]);

  // ==========================================================================
  // Return
  // ==========================================================================

  return {
    baseSessionNotesRef,
  };
}

/**
 * Utility: Check if session notes contain merged adventure log.
 */
export function hasAdventureLogMerged(notes: string): boolean {
  return notes.startsWith('[Your Recent Journey]');
}

/**
 * Utility: Extract base notes from merged notes.
 * Returns the user's original notes without the adventure log section.
 */
export function extractBaseNotes(mergedNotes: string): string {
  if (!hasAdventureLogMerged(mergedNotes)) {
    return mergedNotes;
  }

  // Find where the adventure log section ends (double newline before user notes)
  const userNotesMarker = '\n\n[Your Notes]';
  const markerIndex = mergedNotes.indexOf(userNotesMarker);

  if (markerIndex === -1) {
    // No user notes section, just adventure log
    return '';
  }

  // Extract everything after "[Your Notes]\n"
  return mergedNotes.slice(markerIndex + userNotesMarker.length + 1).trim();
}
