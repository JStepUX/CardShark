/**
 * @file multiSpeakerParser.ts
 * @description Utilities for parsing LLM responses that contain multiple speakers.
 * Used for bonded ally participation in conversations - ally can interject with their own responses.
 */

import type { Message, MessageMetadata, SpeakerMetadata } from '../types/messages';
import { generateUUID } from './generateUUID';

/**
 * Represents a parsed segment of a multi-speaker response.
 * Each segment is attributed to a specific speaker.
 */
export interface ParsedSegment {
  /** Who is speaking: the conversation target, bonded ally, or narrator */
  speaker: 'target' | 'ally' | 'narrator';
  /** Display name of the speaker */
  name: string;
  /** The content/dialogue for this segment */
  content: string;
}

/**
 * Configuration for multi-speaker parsing
 */
export interface MultiSpeakerConfig {
  /** Name of the target NPC (primary speaker) */
  targetName: string;
  /** UUID of the target NPC */
  targetId: string;
  /** Name of the bonded ally (can interject) */
  allyName: string;
  /** UUID of the bonded ally */
  allyId: string;
}

/**
 * Parses a multi-speaker response to detect ally interjections.
 *
 * Looks for patterns like:
 * - [AllyName]: "dialogue" or *action*
 * - **AllyName:** dialogue
 * - AllyName: dialogue (at the start of a line)
 *
 * @param content - The raw LLM response content
 * @param config - Configuration with speaker names and IDs
 * @returns Array of parsed segments with speaker attribution
 *
 * @example
 * const content = `*The merchant nods* "Yes, I have potions."
 *
 * [Aria]: *tugs your sleeve* "Ask about the discount!"`;
 *
 * const segments = parseMultiSpeakerResponse(content, {
 *   targetName: 'Marcus', targetId: '...',
 *   allyName: 'Aria', allyId: '...'
 * });
 * // Returns:
 * // [
 * //   { speaker: 'target', name: 'Marcus', content: '*The merchant nods* "Yes, I have potions."' },
 * //   { speaker: 'ally', name: 'Aria', content: '*tugs your sleeve* "Ask about the discount!"' }
 * // ]
 */
export function parseMultiSpeakerResponse(
  content: string,
  config: MultiSpeakerConfig
): ParsedSegment[] {
  const { targetName, allyName } = config;

  if (!content || !content.trim()) {
    return [];
  }

  // Escape special regex characters in names
  const escapedAllyName = allyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build regex patterns to detect ally interjections
  // Pattern 1: [AllyName]: content
  // Pattern 2: **AllyName:** content
  // Pattern 3: AllyName: at start of line (but not in the middle of a sentence)
  const allyPatterns = [
    new RegExp(`\\[${escapedAllyName}\\]:\\s*`, 'gi'),
    new RegExp(`\\*\\*${escapedAllyName}:\\*\\*\\s*`, 'gi'),
    new RegExp(`^${escapedAllyName}:\\s*`, 'gim'),
  ];

  // Find all ally interjection positions
  const allyMarkers: { index: number; length: number }[] = [];

  for (const pattern of allyPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      allyMarkers.push({
        index: match.index,
        length: match[0].length
      });
    }
  }

  // If no ally markers found, entire content is from target
  if (allyMarkers.length === 0) {
    return [{
      speaker: 'target',
      name: targetName,
      content: content.trim()
    }];
  }

  // Sort markers by position
  allyMarkers.sort((a, b) => a.index - b.index);

  // Split content into segments
  const segments: ParsedSegment[] = [];
  let lastIndex = 0;

  for (const marker of allyMarkers) {
    // Content before this marker belongs to target (if any)
    if (marker.index > lastIndex) {
      const targetContent = content.slice(lastIndex, marker.index).trim();
      if (targetContent) {
        segments.push({
          speaker: 'target',
          name: targetName,
          content: targetContent
        });
      }
    }

    // Find end of ally segment (next marker or end of content)
    const nextMarkerIndex = allyMarkers.find(m => m.index > marker.index)?.index;
    const allyContent = content.slice(
      marker.index + marker.length,
      nextMarkerIndex ?? content.length
    ).trim();

    if (allyContent) {
      segments.push({
        speaker: 'ally',
        name: allyName,
        content: allyContent
      });
    }

    lastIndex = nextMarkerIndex ?? content.length;
  }

  // Any remaining content after last marker belongs to target
  if (lastIndex < content.length) {
    const remainingContent = content.slice(lastIndex).trim();
    if (remainingContent) {
      segments.push({
        speaker: 'target',
        name: targetName,
        content: remainingContent
      });
    }
  }

  // Filter out empty segments and merge consecutive same-speaker segments
  return mergeConsecutiveSegments(segments.filter(s => s.content.length > 0));
}

/**
 * Merges consecutive segments from the same speaker.
 * This handles cases where parsing might split one speaker's dialogue incorrectly.
 */
function mergeConsecutiveSegments(segments: ParsedSegment[]): ParsedSegment[] {
  if (segments.length <= 1) return segments;

  const merged: ParsedSegment[] = [];
  let current = segments[0];

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    if (next.speaker === current.speaker && next.name === current.name) {
      // Merge with current
      current = {
        ...current,
        content: current.content + '\n\n' + next.content
      };
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  return merged;
}

/**
 * Converts parsed segments into separate Message objects.
 *
 * Each segment becomes its own message with appropriate metadata for
 * speaker attribution. Messages maintain temporal ordering via timestamp offsets.
 *
 * @param segments - Parsed segments from parseMultiSpeakerResponse
 * @param baseMessage - The original assistant message (used for common properties)
 * @param config - Configuration with speaker names and IDs
 * @returns Array of Message objects, one per segment
 */
export function splitIntoMessages(
  segments: ParsedSegment[],
  baseMessage: Partial<Message>,
  config: MultiSpeakerConfig
): Message[] {
  const { targetName, targetId, allyName, allyId } = config;
  const baseTimestamp = baseMessage.timestamp || Date.now();

  return segments.map((segment, index) => {
    const speakerMetadata: SpeakerMetadata = {
      speakerId: segment.speaker === 'ally' ? allyId : targetId,
      speakerName: segment.speaker === 'ally' ? allyName : targetName,
      speakerRole: segment.speaker
    };

    const metadata: MessageMetadata = {
      ...baseMessage.metadata,
      ...speakerMetadata,
      type: baseMessage.metadata?.type || 'npc_response',
      multiSpeaker: true,
      segmentIndex: index,
      totalSegments: segments.length
    };

    return {
      id: index === 0 && baseMessage.id ? baseMessage.id : generateUUID(),
      role: 'assistant' as const,
      content: segment.content,
      timestamp: baseTimestamp + index, // Slight offset to maintain order
      status: 'complete' as const,
      metadata
    };
  });
}

/**
 * Checks if a response contains ally interjections.
 * Useful for quickly determining if parsing is needed.
 *
 * @param content - The LLM response content
 * @param allyName - Name of the bonded ally
 * @returns true if ally interjections are detected
 */
export function hasAllyInterjection(content: string, allyName: string): boolean {
  if (!content || !allyName) return false;

  const escapedName = allyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`\\[${escapedName}\\]:`, 'i'),
    new RegExp(`\\*\\*${escapedName}:\\*\\*`, 'i'),
    new RegExp(`^${escapedName}:`, 'im')
  ];

  return patterns.some(pattern => pattern.test(content));
}

/**
 * Strips ally interjection markers from content for clean display.
 * Use this if you want to show the full response without parsing into segments.
 *
 * @param content - The LLM response content
 * @param allyName - Name of the bonded ally
 * @returns Content with markers cleaned up for readability
 */
export function cleanAllyMarkers(content: string, allyName: string): string {
  if (!content || !allyName) return content;

  const escapedName = allyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return content
    .replace(new RegExp(`\\[${escapedName}\\]:\\s*`, 'gi'), `**${allyName}:** `)
    .replace(new RegExp(`^${escapedName}:\\s*`, 'gim'), `**${allyName}:** `);
}
