/**
 * @file CharacterSource.ts
 * @description Context source for character card data.
 *
 * Provides cached access to character cards by UUID.
 * Implements the ContextSource interface for consistent data access.
 */

import type { ContextSource, CharacterContext, MinimalCharacterCard } from '../../../types/context';
import type { NPCThinFrame, CharacterData } from '../../../types/schema';
import { isValidThinFrame } from '../../../types/schema';
import { ContextCache, CachePresets } from '../ContextCache';
import { getApiBaseUrl } from '../../../utils/apiConfig';

/**
 * Fetched character data structure from API.
 * API may return various structures depending on endpoint.
 */
interface CharacterApiResponse {
  spec?: string;
  spec_version?: string;
  data?: CharacterData;
  // Direct properties (some APIs return flat structure)
  name?: string;
  description?: string;
  character_uuid?: string;
  // Full card properties (when API returns complete card)
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  avatar?: string;
  extensions?: Record<string, unknown>;
}

/**
 * Source for character card data with caching.
 *
 * @example
 * ```typescript
 * const source = new CharacterSource();
 * const context = await source.get('character-uuid');
 * if (context) {
 *   console.log(context.name);
 * }
 * ```
 */
export class CharacterSource implements ContextSource<CharacterContext> {
  private cache: ContextCache<CharacterContext>;
  private baseUrl: string;

  constructor() {
    // Characters are relatively stable, use long-lived cache
    this.cache = new ContextCache<CharacterContext>(CachePresets.longLived());
    this.baseUrl = getApiBaseUrl();
  }

  /**
   * Get character context by UUID.
   * Returns cached data if available, otherwise fetches from API.
   */
  async get(uuid: string): Promise<CharacterContext | null> {
    // Check cache first
    const cached = this.cache.get(uuid);
    if (cached) {
      return cached;
    }

    // Fetch from API
    return this.fetchAndCache(uuid);
  }

  /**
   * Force refresh character data, bypassing cache.
   */
  async refresh(uuid: string): Promise<CharacterContext | null> {
    this.cache.invalidate(uuid);
    return this.fetchAndCache(uuid);
  }

  /**
   * Invalidate cached data for a character.
   */
  invalidate(uuid: string): void {
    this.cache.invalidate(uuid);
  }

  /**
   * Check if character data is cached.
   */
  has(uuid: string): boolean {
    return this.cache.has(uuid);
  }

  /**
   * Clear all cached character data.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the raw character card (without CharacterContext wrapper).
   * Useful when you need the full card object.
   * Note: Returns MinimalCharacterCard which has required spec/spec_version/data.
   */
  async getCard(uuid: string): Promise<MinimalCharacterCard | null> {
    const context = await this.get(uuid);
    return context?.card ?? null;
  }

  /**
   * Get only the character's thin frame (if available).
   */
  async getThinFrame(uuid: string): Promise<NPCThinFrame | null> {
    const context = await this.get(uuid);
    return context?.thinFrame ?? null;
  }

  /**
   * Fetch character data from API and cache it.
   */
  private async fetchAndCache(uuid: string): Promise<CharacterContext | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/character/${encodeURIComponent(uuid)}`);

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[CharacterSource] Character not found: ${uuid}`);
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: CharacterApiResponse = await response.json();

      // Normalize the response to CharacterCard format
      const card = this.normalizeToCard(data, uuid);
      if (!card) {
        console.error(`[CharacterSource] Failed to normalize character data: ${uuid}`);
        return null;
      }

      // Build CharacterContext
      const context = this.buildContext(card, uuid);

      // Cache and return
      this.cache.set(uuid, context);
      return context;
    } catch (error) {
      console.error(`[CharacterSource] Error fetching character ${uuid}:`, error);
      return null;
    }
  }

  /**
   * Normalize API response to MinimalCharacterCard format.
   * Handles both wrapped and flat response structures.
   */
  private normalizeToCard(response: CharacterApiResponse, uuid: string): MinimalCharacterCard | null {
    // If response has 'data' property with required fields, use it
    if (response.data && response.spec) {
      return {
        spec: response.spec,
        spec_version: response.spec_version || '2.0',
        data: response.data,
      };
    }

    // If response has nested 'data' with character fields
    if (response.data?.name) {
      return {
        spec: response.spec || 'chara_card_v2',
        spec_version: response.spec_version || '2.0',
        data: response.data,
      };
    }

    // Flat structure - build card from properties
    if (response.name) {
      const data = this.buildDataFromFlat(response, uuid);
      return {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data,
      };
    }

    return null;
  }

  /**
   * Build CharacterData from a flat API response.
   */
  private buildDataFromFlat(response: CharacterApiResponse, uuid: string): CharacterData {
    return {
      spec: 'chara_card_v2',
      name: response.name || 'Unknown',
      description: response.description || '',
      personality: response.personality || '',
      scenario: response.scenario || '',
      first_mes: response.first_mes || '',
      mes_example: response.mes_example || '',
      creator_notes: '',
      system_prompt: '',
      post_history_instructions: '',
      tags: [],
      creator: '',
      character_version: '',
      alternate_greetings: [],
      extensions: {
        talkativeness: '0.5',
        fav: false,
        world: '',
        depth_prompt: { prompt: '', depth: 0, role: 'system' },
      },
      group_only_greetings: [],
      character_book: { entries: [], name: '' },
      character_uuid: response.character_uuid || uuid,
    };
  }

  /**
   * Build CharacterContext from a MinimalCharacterCard.
   */
  private buildContext(card: MinimalCharacterCard, uuid: string): CharacterContext {
    // Extract thin frame if present
    let thinFrame: NPCThinFrame | null = null;
    const extensions = card.data.extensions;
    if (extensions && isValidThinFrame(extensions.cardshark_thin_frame)) {
      thinFrame = extensions.cardshark_thin_frame;
    }

    // Build image path
    const imagePath = `/api/character-image/${encodeURIComponent(uuid)}.png`;

    return {
      card,
      uuid: card.data.character_uuid || uuid,
      name: card.data.name || 'Unknown',
      thinFrame,
      imagePath,
    };
  }

  /**
   * Dispose of the source and clean up resources.
   */
  dispose(): void {
    this.cache.dispose();
  }
}

// Singleton instance for shared use
let sharedInstance: CharacterSource | null = null;

/**
 * Get the shared CharacterSource instance.
 * Creates one if it doesn't exist.
 */
export function getCharacterSource(): CharacterSource {
  if (!sharedInstance) {
    sharedInstance = new CharacterSource();
  }
  return sharedInstance;
}

/**
 * Reset the shared instance (for testing).
 */
export function resetCharacterSource(): void {
  if (sharedInstance) {
    sharedInstance.dispose();
    sharedInstance = null;
  }
}
