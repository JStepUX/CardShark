/**
 * @file LoadingScreen.tsx
 * @description Full-screen loading overlay for room transitions.
 *
 * Shows during room navigation to:
 * 1. Summarize the current room visit for narrative continuity (Phase 3)
 * 2. Preload textures for the new room
 * 3. Generate thin frames for NPCs missing identity context
 *
 * No skip button - loading completes or fails with automatic fallback after 30s timeout.
 */

import React from 'react';
import { MapPin, Loader2, BookOpen } from 'lucide-react';
import type { TransitionPhase, TransitionProgress as TProgress } from '../../types/transition';
import { TransitionProgress } from './TransitionProgress';

interface LoadingScreenProps {
  /** Whether the loading screen is visible */
  visible: boolean;
  /** Name of the room being departed from (for summarization display) */
  sourceRoomName?: string | null;
  /** Name of the room being transitioned to */
  targetRoomName: string | null;
  /** Current phase of the transition */
  phase: TransitionPhase;
  /** Progress tracking for sub-operations */
  progress: TProgress;
  /** Optional travel narrative flavor text */
  flavorText?: string;
}

/**
 * Phase-specific progress labels.
 * Maps internal phase names to user-friendly descriptions.
 */
const PROGRESS_LABELS = {
  summarization: 'Recording your journey',
  assetPreload: 'Preparing the scene',
  thinFrameGeneration: 'Meeting the locals',
} as const;

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  visible,
  sourceRoomName,
  targetRoomName,
  phase,
  progress,
  flavorText,
}) => {
  if (!visible) return null;

  const displayName = targetRoomName || 'unknown destination';
  const isSummarizing = phase === 'summarizing';

  return (
    <div
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 transition-opacity duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loading-title"
      aria-describedby={flavorText ? 'loading-flavor' : undefined}
      data-testid="loading-screen"
    >
      <div className="bg-gray-900 rounded-lg p-8 max-w-md w-full mx-4 border border-gray-700 shadow-2xl">
        {/* Header with destination */}
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isSummarizing ? 'bg-amber-600/20' : 'bg-blue-600/20'
          }`}>
            {isSummarizing ? (
              <BookOpen className="w-5 h-5 text-amber-400" />
            ) : (
              <MapPin className="w-5 h-5 text-blue-400" />
            )}
          </div>
          <div>
            <h2
              id="loading-title"
              className="text-xl font-bold text-white"
            >
              {isSummarizing && sourceRoomName
                ? `Leaving ${sourceRoomName}...`
                : `Traveling to ${displayName}...`
              }
            </h2>
          </div>
        </div>

        {/* Flavor text (optional travel narrative) */}
        {flavorText && (
          <p
            id="loading-flavor"
            className="text-gray-400 text-sm mb-6 italic pl-13"
          >
            {flavorText}
          </p>
        )}

        {/* Progress indicators */}
        <div className="space-y-4 mt-6">
          <TransitionProgress
            label={PROGRESS_LABELS.summarization}
            status={progress.summarization}
            active={phase === 'summarizing'}
          />
          <TransitionProgress
            label={PROGRESS_LABELS.assetPreload}
            status={progress.assetPreload}
            active={phase === 'loading_assets'}
          />
          <TransitionProgress
            label={PROGRESS_LABELS.thinFrameGeneration}
            status={progress.thinFrameGeneration}
            active={phase === 'generating_frames'}
          />
        </div>

        {/* Overall spinner at bottom */}
        <div className="flex items-center justify-center mt-6 pt-4 border-t border-gray-800">
          <Loader2 className="w-5 h-5 text-gray-500 animate-spin mr-2" />
          <span className="text-sm text-gray-500">
            {phase === 'initiating' && 'Preparing...'}
            {phase === 'summarizing' && 'Summarizing your visit...'}
            {phase === 'loading_assets' && 'Loading assets...'}
            {phase === 'generating_frames' && 'Generating NPC profiles...'}
            {phase === 'ready' && 'Almost there...'}
          </span>
        </div>
      </div>
    </div>
  );
};
