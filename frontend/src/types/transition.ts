import { WORLD_PLAY_TRANSITION } from '../worldplay/config';

/**
 * @file transition.ts
 * @description Types for room transition state management.
 *
 * Transition flow:
 * IDLE -> INITIATING -> SUMMARIZING -> LOADING_ASSETS -> GENERATING_FRAMES -> READY -> IDLE
 */

/**
 * Phase of the room transition state machine.
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
 */
export interface TransitionProgress {
  summarization: ProgressStatus;
  assetPreload: ProgressStatus;
  thinFrameGeneration: ProgressStatus;
}

/**
 * Complete transition state for room navigation.
 */
export interface TransitionState {
  phase: TransitionPhase;
  sourceRoomName: string | null;
  targetRoomName: string | null;
  targetRoomId: string | null;
  progress: TransitionProgress;
  error: string | null;
  startedAt: number | null;
}

/**
 * Create initial or idle transition state.
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
 */
export const TRANSITION_TIMEOUT_MS = WORLD_PLAY_TRANSITION.totalTimeoutMs;

/**
 * Thin frame generation timeout in milliseconds.
 */
export const THIN_FRAME_TIMEOUT_MS = WORLD_PLAY_TRANSITION.thinFrameTimeoutMs;

/**
 * Summarization timeout in milliseconds.
 */
export const SUMMARIZATION_TIMEOUT_MS = WORLD_PLAY_TRANSITION.summarizationTimeoutMs;