/**
 * @file transition.ts
 * @description Types for room transition state management.
 *
 * Transition flow (Phase 1 + Phase 2 + Phase 3):
 * IDLE -> INITIATING -> SUMMARIZING -> LOADING_ASSETS -> GENERATING_FRAMES -> READY -> IDLE
 *
 * Phases:
 * - INITIATING: Transition started, gathering info about current and target rooms
 * - SUMMARIZING: (Phase 3) Generating AI summary of the current room visit
 * - LOADING_ASSETS: Preloading textures for the new room
 * - GENERATING_FRAMES: Generating thin frames for NPCs missing identity context
 * - READY: All preparation complete, about to reveal new room
 */

/**
 * Phase of the room transition state machine.
 *
 * - idle: No transition in progress
 * - initiating: Transition started, gathering info
 * - summarizing: Generating summary of current room visit (Phase 3)
 * - loading_assets: Preloading textures for new room
 * - generating_frames: Generating thin frames for NPCs missing them
 * - ready: All preparation complete, about to reveal
 */
export type TransitionPhase =
  | 'idle'
  | 'initiating'
  | 'summarizing'
  | 'loading_assets'
  | 'generating_frames'
  | 'ready';

/**
 * Status of a progress item during transition.
 */
export type ProgressStatus =
  | { status: 'pending' }
  | { status: 'in_progress'; percent: number }
  | { status: 'complete' }
  | { status: 'failed'; error: string };

/**
 * Progress tracking for transition phases.
 * Tracks summarization, asset preloading, and thin frame generation.
 */
export interface TransitionProgress {
  /** Phase 3: Room visit summarization */
  summarization: ProgressStatus;
  /** Asset preloading (textures for room, NPCs) */
  assetPreload: ProgressStatus;
  /** Phase 2: Thin frame generation for NPCs missing identity context */
  thinFrameGeneration: ProgressStatus;
}

/**
 * Complete transition state for room navigation.
 */
export interface TransitionState {
  /** Current phase of the transition */
  phase: TransitionPhase;

  /** Name of the room being departed from (for summarization display) */
  sourceRoomName: string | null;

  /** Name of the room being transitioned to (for display) */
  targetRoomName: string | null;

  /** UUID of the target room */
  targetRoomId: string | null;

  /** Progress tracking for sub-operations */
  progress: TransitionProgress;

  /** Error message if transition failed */
  error: string | null;

  /** Timestamp when transition started (for timeout tracking) */
  startedAt: number | null;
}

/**
 * Create initial/idle transition state.
 */
export function createIdleTransitionState(): TransitionState {
  return {
    phase: 'idle',
    sourceRoomName: null,
    targetRoomName: null,
    targetRoomId: null,
    progress: {
      summarization: { status: 'pending' },
      assetPreload: { status: 'pending' },
      thinFrameGeneration: { status: 'pending' },
    },
    error: null,
    startedAt: null,
  };
}

/**
 * Transition timeout in milliseconds.
 * After this time, transition will force-complete with fallbacks.
 */
export const TRANSITION_TIMEOUT_MS = 30_000;

/**
 * Thin frame generation timeout in milliseconds.
 * Individual NPC frame generation will timeout after this duration.
 */
export const THIN_FRAME_TIMEOUT_MS = 30_000;

/**
 * Summarization timeout in milliseconds.
 * Room summarization will timeout after this duration, falling back to keyword extraction.
 */
export const SUMMARIZATION_TIMEOUT_MS = 15_000;
