/**
 * @file ThinFrameSource.ts
 * @description Context source for NPC thin frames.
 *
 * Provides access to pre-generated NPC identity summaries (thin frames).
 * Can generate thin frames on-demand if not cached on the character.
 */

import type { ContextSource, ThinFrameContext, MinimalCharacterCard } from '../../../types/context';
import type { CharacterCard, NPCThinFrame } from '../../../types/schema';
import { isValidThinFrame } from '../../../types/schema';
import { generateThinFrame } from '../../thinFrameService';
import { ContextCache, CachePresets } from '../ContextCache';
import { getCharacterSource } from './CharacterSource';

/**
 * Source for NPC thin frame context data.
 *
 * Thin frames are pre-generated summaries of NPC identity that provide
 * stable, consistent character context without truncation artifacts.
 *
 * @example
 * ```typescript
 * const source = new ThinFrameSource();
 * const context = await source.get('npc-uuid');
 * // Or generate on-demand
 * const context = await source.getOrGenerate('npc-uuid', apiConfig);
 * ```
 */
export class ThinFrameSource implements ContextSource<ThinFrameContext> {
  private cache: ContextCache<ThinFrameContext>;
  private pendingGenerations: Map<string, Promise<ThinFrameContext | null>> = new Map();

  constructor() {
    // Thin frames are stable, use long-lived cache
    this.cache = new ContextCache<ThinFrameContext>(CachePresets.longLived());
  }

  /**
   * Get thin frame context by character UUID.
   * Returns null if no thin frame exists (does not generate).
   */
  async get(uuid: string): Promise<ThinFrameContext | null> {
    // Check cache first
    const cached = this.cache.get(uuid);
    if (cached) {
      return cached;
    }

    // Try to get from character's stored thin frame
    const characterSource = getCharacterSource();
    const character = await characterSource.get(uuid);

    if (character?.thinFrame) {
      const context = this.buildContext(uuid, character.thinFrame, true);
      this.cache.set(uuid, context);
      return context;
    }

    return null;
  }

  /**
   * Get thin frame context, generating if necessary.
   *
   * @param uuid - Character UUID
   * @param apiConfig - API configuration for LLM generation
   * @param options - Generation options
   */
  async getOrGenerate(
    uuid: string,
    apiConfig: Record<string, unknown>,
    options: { timeout?: number } = {}
  ): Promise<ThinFrameContext | null> {
    // Check cache first
    const cached = this.cache.get(uuid);
    if (cached) {
      return cached;
    }

    // Check if already generating (prevent duplicate requests)
    const pendingGeneration = this.pendingGenerations.get(uuid);
    if (pendingGeneration) {
      return pendingGeneration;
    }

    // Try to get from character's stored thin frame first
    const characterSource = getCharacterSource();
    const character = await characterSource.get(uuid);

    if (character?.thinFrame) {
      const context = this.buildContext(uuid, character.thinFrame, true);
      this.cache.set(uuid, context);
      return context;
    }

    // Need to generate - check if we have the character card
    if (!character?.card) {
      console.warn(`[ThinFrameSource] No character card found for ${uuid}`);
      return null;
    }

    // Generate thin frame
    const generationPromise = this.generateAndCache(uuid, character.card, apiConfig, options);
    this.pendingGenerations.set(uuid, generationPromise);

    try {
      const result = await generationPromise;
      return result;
    } finally {
      this.pendingGenerations.delete(uuid);
    }
  }

  /**
   * Force refresh thin frame data.
   */
  async refresh(uuid: string): Promise<ThinFrameContext | null> {
    this.cache.invalidate(uuid);
    return this.get(uuid);
  }

  /**
   * Invalidate cached thin frame data.
   */
  invalidate(uuid: string): void {
    this.cache.invalidate(uuid);
    // Also invalidate the character source since thin frame is stored there
    getCharacterSource().invalidate(uuid);
  }

  /**
   * Check if thin frame data is cached.
   */
  has(uuid: string): boolean {
    return this.cache.has(uuid);
  }

  /**
   * Clear all cached thin frame data.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Check if a character needs thin frame generation.
   */
  async needsGeneration(uuid: string): Promise<boolean> {
    // Check cache
    if (this.cache.has(uuid)) {
      return false;
    }

    // Check character's stored thin frame
    const characterSource = getCharacterSource();
    const character = await characterSource.get(uuid);

    return !character?.thinFrame || !isValidThinFrame(character.thinFrame);
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Generate thin frame and cache it.
   */
  private async generateAndCache(
    uuid: string,
    card: MinimalCharacterCard,
    apiConfig: Record<string, unknown>,
    options: { timeout?: number }
  ): Promise<ThinFrameContext | null> {
    try {
      // Build a CharacterCard structure for the generation API
      // Use default values for optional fields from MinimalCharacterDataFields
      const data = card.data;
      const characterCard: CharacterCard = {
        name: data.name,
        description: data.description,
        personality: data.personality || '',
        scenario: data.scenario || '',
        first_mes: data.first_mes || '',
        mes_example: data.mes_example || '',
        creatorcomment: '',
        avatar: '',
        chat: '',
        talkativeness: '0.5',
        fav: false,
        tags: data.tags || [],
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
          spec: data.spec || 'chara_card_v2',
          name: data.name,
          description: data.description,
          personality: data.personality || '',
          scenario: data.scenario || '',
          first_mes: data.first_mes || '',
          mes_example: data.mes_example || '',
          creator_notes: data.creator_notes || '',
          system_prompt: data.system_prompt || '',
          post_history_instructions: data.post_history_instructions || '',
          tags: data.tags || [],
          creator: data.creator || '',
          character_version: data.character_version || '',
          alternate_greetings: data.alternate_greetings || [],
          extensions: (data.extensions as import('../../../types/schema').CharacterExtensions) || {
            talkativeness: '0.5',
            fav: false,
            world: '',
            depth_prompt: { prompt: '', depth: 0, role: '' },
          },
          group_only_greetings: data.group_only_greetings || [],
          character_book: (data.character_book as import('../../../types/schema').CharacterBook) || { entries: [], name: '' },
          character_uuid: data.character_uuid,
        },
        create_date: new Date().toISOString(),
      };

      const thinFrame = await generateThinFrame(characterCard, apiConfig, options);

      // Build and cache context
      const isGenerated = true; // We just generated it
      const context = this.buildContext(uuid, thinFrame, isGenerated);
      this.cache.set(uuid, context);

      // Optionally save to character card (this is done by the caller usually)
      // We don't do it here to avoid side effects in the source

      return context;
    } catch (error) {
      console.error(`[ThinFrameSource] Error generating thin frame for ${uuid}:`, error);
      return null;
    }
  }

  /**
   * Build ThinFrameContext from thin frame data.
   */
  private buildContext(
    uuid: string,
    frame: NPCThinFrame,
    isGenerated: boolean
  ): ThinFrameContext {
    return {
      frame,
      characterUuid: uuid,
      isGenerated,
      generatedAt: frame.generated_at,
    };
  }

  /**
   * Dispose of the source and clean up resources.
   */
  dispose(): void {
    this.cache.dispose();
    this.pendingGenerations.clear();
  }
}

// Singleton instance for shared use
let sharedInstance: ThinFrameSource | null = null;

/**
 * Get the shared ThinFrameSource instance.
 */
export function getThinFrameSource(): ThinFrameSource {
  if (!sharedInstance) {
    sharedInstance = new ThinFrameSource();
  }
  return sharedInstance;
}

/**
 * Reset the shared instance (for testing).
 */
export function resetThinFrameSource(): void {
  if (sharedInstance) {
    sharedInstance.dispose();
    sharedInstance = null;
  }
}
