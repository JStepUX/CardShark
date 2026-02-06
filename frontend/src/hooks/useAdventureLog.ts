/**
 * @file useAdventureLog.ts
 * @description Injects adventure log context into session notes for LLM continuity.
 * Extracted from WorldPlayView.tsx.
 */
import { useEffect, useRef } from 'react';
import type { AdventureContext } from '../types/adventureLog';
import { mergeAdventureLogWithNotes } from '../utils/adventureLogContext';

export interface UseAdventureLogOptions {
  adventureContext: AdventureContext | null;
  currentRoomId: string | undefined;
  sessionNotes: string;
  setSessionNotes: (notes: string) => void;
}

/**
 * Pure side-effect hook: merges adventure log entries into session notes
 * so the LLM has narrative continuity across room transitions.
 */
export function useAdventureLog({
  adventureContext,
  currentRoomId,
  sessionNotes,
  setSessionNotes,
}: UseAdventureLogOptions): void {
  // Ref to track the base (user-entered) session notes separate from adventure log additions
  const baseSessionNotesRef = useRef<string>('');

  // When adventure context or current room changes, merge adventure log into session notes
  useEffect(() => {
    if (!adventureContext || adventureContext.entries.length === 0) {
      return;
    }

    const mergedNotes = mergeAdventureLogWithNotes(
      baseSessionNotesRef.current,
      adventureContext,
      currentRoomId
    );

    if (mergedNotes !== sessionNotes) {
      setSessionNotes(mergedNotes);
      console.log('[AdventureLog] Injected adventure log into session context');
    }
  }, [adventureContext, currentRoomId, sessionNotes, setSessionNotes]);

  // When user manually edits session notes (via Journal), update the base ref
  useEffect(() => {
    if (sessionNotes && !sessionNotes.startsWith('[Your Recent Journey]')) {
      baseSessionNotesRef.current = sessionNotes;
    }
  }, [sessionNotes]);
}
