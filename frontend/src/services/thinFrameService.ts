/**
 * @file thinFrameService.ts
 * @description Service for generating and managing NPC thin frames.
 *
 * Thin frames are pre-generated summaries of NPC identity stored in PNG metadata.
 * They provide stable, consistent character context without truncation artifacts.
 *
 * @dependencies apiService, schema types
 * @consumers CharacterContext, WorldPlayView
 */

import { CharacterCard, NPCThinFrame, isValidThinFrame, THIN_FRAME_VERSION } from '../types/schema';
import { getApiBaseUrl } from '../utils/apiConfig';

/** Response from the thin frame generation endpoint */
interface ThinFrameGenerationResponse {
  success: boolean;
  thin_frame?: NPCThinFrame;
  fallback_used?: boolean;
  reason?: string;
  message?: string;
}

/** Options for thin frame generation */
interface GenerateThinFrameOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

const DEFAULT_TIMEOUT = 30000;

/**
 * Generate a thin frame for a character using the LLM.
 *
 * This calls the backend endpoint which handles:
 * - LLM prompting for archetype, traits, speaking style, etc.
 * - Timeout handling with fallback to truncation
 * - JSON parsing and validation
 *
 * @param characterData - The full character card data
 * @param apiConfig - LLM API configuration
 * @param options - Optional settings (timeout)
 * @returns Generated thin frame, or fallback frame on error
 *
 * @example
 * const frame = await generateThinFrame(characterCard, apiConfig);
 * characterCard.data.extensions.cardshark_thin_frame = frame;
 */
export async function generateThinFrame(
  characterData: CharacterCard,
  apiConfig: Record<string, unknown>,
  options: GenerateThinFrameOptions = {}
): Promise<NPCThinFrame> {
  const { timeout = DEFAULT_TIMEOUT } = options;
  const baseUrl = getApiBaseUrl();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${baseUrl}/api/context/generate-thin-frame`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        character_data: characterData,
        api_config: apiConfig,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const result: ThinFrameGenerationResponse = await response.json();

    if (!result.success || !result.thin_frame) {
      throw new Error(result.message || 'Failed to generate thin frame');
    }

    return result.thin_frame;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('Thin frame generation timed out, creating fallback');
    } else {
      console.error('Thin frame generation failed:', error);
    }

    // Return a fallback frame
    return createFallbackThinFrame(characterData);
  }
}

/**
 * Create a fallback thin frame by truncating character data.
 *
 * Used when LLM generation fails or is unavailable.
 * Extracts first 2 sentences from description for appearance hook.
 *
 * @param characterData - The character card to extract from
 * @returns A minimal thin frame with truncated content
 */
export function createFallbackThinFrame(characterData: CharacterCard): NPCThinFrame {
  const data = characterData.data;
  const name = data?.name || 'Unknown';
  const description = data?.description || '';
  const personality = data?.personality || '';

  // Extract first 2 sentences from description
  const sentences = description.split(/(?<=[.!?])\s+/);
  const appearanceHook = sentences.slice(0, 2).join(' ').trim() || 'no distinctive features';

  // Extract first sentence from personality
  const personalityMatch = personality.match(/^[^.!?]+[.!?]/);
  const firstTrait = personalityMatch ? personalityMatch[0].trim() : personality.slice(0, 50);

  return {
    version: THIN_FRAME_VERSION,
    generated_at: Date.now(),
    archetype: name,
    key_traits: firstTrait ? [firstTrait] : [],
    speaking_style: 'natural',
    motivation: '',
    appearance_hook: appearanceHook.slice(0, 200),
  };
}

/**
 * Extract thin frame from a character card's extensions.
 *
 * @param characterCard - The character card to check
 * @returns The thin frame if present and valid, null otherwise
 */
export function getThinFrameFromCard(characterCard: CharacterCard): NPCThinFrame | null {
  const frame = characterCard.data?.extensions?.cardshark_thin_frame;
  return isValidThinFrame(frame) ? frame : null;
}

/**
 * Check if a character card has a valid thin frame.
 *
 * @param characterCard - The character card to check
 * @returns true if card has a valid thin frame
 */
export function hasThinFrame(characterCard: CharacterCard): boolean {
  return getThinFrameFromCard(characterCard) !== null;
}

/**
 * Check if a thin frame should be regenerated based on content changes.
 *
 * Compares current description/personality length to detect significant changes.
 * A change of more than 20% in content length triggers regeneration.
 *
 * @param characterCard - The character card with existing thin frame
 * @param originalDescription - Original description when frame was generated
 * @param originalPersonality - Original personality when frame was generated
 * @returns true if frame should be regenerated
 */
export function shouldRegenerateThinFrame(
  characterCard: CharacterCard,
  originalDescription: string,
  originalPersonality: string
): boolean {
  const frame = getThinFrameFromCard(characterCard);

  // No frame? Need to generate one
  if (!frame) return true;

  const currentDesc = characterCard.data?.description || '';
  const currentPers = characterCard.data?.personality || '';

  // Check for significant content changes (>20% length change)
  const descLengthDiff = Math.abs(currentDesc.length - originalDescription.length);
  const persLengthDiff = Math.abs(currentPers.length - originalPersonality.length);

  const descChanged = originalDescription.length > 0
    ? descLengthDiff / originalDescription.length > 0.2
    : currentDesc.length > 50;

  const persChanged = originalPersonality.length > 0
    ? persLengthDiff / originalPersonality.length > 0.2
    : currentPers.length > 50;

  return descChanged || persChanged;
}

/**
 * Merge a thin frame into a character card's extensions.
 *
 * Creates the extensions object if it doesn't exist.
 * Returns a new character card (does not mutate the original).
 *
 * @param characterCard - The character card to update
 * @param thinFrame - The thin frame to merge
 * @returns New character card with thin frame in extensions
 */
export function mergeThinFrameIntoCard(
  characterCard: CharacterCard,
  thinFrame: NPCThinFrame
): CharacterCard {
  return {
    ...characterCard,
    data: {
      ...characterCard.data,
      extensions: {
        ...characterCard.data.extensions,
        cardshark_thin_frame: thinFrame,
      },
    },
  };
}

/**
 * Generate thin frames for multiple NPCs in parallel.
 *
 * Useful during room transitions to batch-generate frames for all NPCs
 * that are missing them.
 *
 * @param npcs - Array of { characterCard, apiConfig } objects
 * @param options - Generation options (timeout applies per-NPC)
 * @returns Array of results with characterUuid and generated thin frame
 */
export async function generateThinFramesBatch(
  npcs: Array<{ characterCard: CharacterCard; apiConfig: Record<string, unknown> }>,
  options: GenerateThinFrameOptions = {}
): Promise<Array<{ characterUuid: string; thinFrame: NPCThinFrame; error?: string }>> {
  const results = await Promise.allSettled(
    npcs.map(async ({ characterCard, apiConfig }) => {
      const thinFrame = await generateThinFrame(characterCard, apiConfig, options);
      return {
        characterUuid: characterCard.data?.character_uuid || 'unknown',
        thinFrame,
      };
    })
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      const characterCard = npcs[index].characterCard;
      return {
        characterUuid: characterCard.data?.character_uuid || 'unknown',
        thinFrame: createFallbackThinFrame(characterCard),
        error: result.reason?.message || 'Unknown error',
      };
    }
  });
}
