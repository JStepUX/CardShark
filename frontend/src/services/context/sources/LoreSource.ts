/**
 * @file LoreSource.ts
 * @description Context source for lore book entries and triggered images.
 *
 * Provides access to:
 * - Lore book entries from character cards
 * - Triggered lore images during chat
 * - Lore matching logic
 */

import type { ContextSource, LoreContext, TriggeredLoreImage } from '../../../types/context';
import type { LoreEntryInterface, CharacterCard, CharacterBook } from '../../../types/schema';
import { ContextCache, CachePresets } from '../ContextCache';

/**
 * Internal mutable triggered image tracking (mirrors TriggeredLoreImage but mutable).
 */
interface MutableTriggeredImage {
  entryId: number;
  imageUuid: string;
  triggeredAt: number;
}

/**
 * Source for lore context data.
 *
 * Manages:
 * - Lore book entries per character
 * - Triggered lore images during chat sessions
 * - Token budget tracking
 *
 * @example
 * ```typescript
 * const source = new LoreSource();
 * source.setCharacter(characterCard);
 * const context = await source.get('character-uuid');
 * source.trackTriggeredImage(entry, 'character-uuid');
 * ```
 */
export class LoreSource implements ContextSource<LoreContext> {
  private cache: ContextCache<LoreContext>;
  private loreBookCache: Map<string, LoreEntryInterface[]> = new Map();
  private triggeredImages: Map<string, Map<string, MutableTriggeredImage>> = new Map();

  constructor() {
    // Lore data is stable per character, use standard cache
    this.cache = new ContextCache<LoreContext>(CachePresets.standard());
  }

  /**
   * Get lore context by character UUID.
   */
  async get(characterUuid: string): Promise<LoreContext | null> {
    const cached = this.cache.get(characterUuid);
    if (cached) {
      return cached;
    }

    // Build context from stored data
    const entries = this.loreBookCache.get(characterUuid) ?? [];
    const imageMap = this.triggeredImages.get(characterUuid) ?? new Map();
    const triggeredList = this.buildTriggeredImageList(imageMap);

    const context: LoreContext = {
      matchedEntries: entries,
      triggeredImages: triggeredList,
      tokenBudgetUsed: this.estimateTokenBudget(entries),
    };

    this.cache.set(characterUuid, context);
    return context;
  }

  /**
   * Refresh lore context (re-calculates from stored data).
   */
  async refresh(characterUuid: string): Promise<LoreContext | null> {
    this.cache.invalidate(characterUuid);
    return this.get(characterUuid);
  }

  /**
   * Invalidate cached lore context.
   */
  invalidate(characterUuid: string): void {
    this.cache.invalidate(characterUuid);
  }

  /**
   * Check if lore context is cached.
   */
  has(characterUuid: string): boolean {
    return this.cache.has(characterUuid);
  }

  /**
   * Clear all cached lore data.
   */
  clear(): void {
    this.cache.clear();
    this.loreBookCache.clear();
    this.triggeredImages.clear();
  }

  // =========================================================================
  // Lore Book Management
  // =========================================================================

  /**
   * Set the lore book for a character.
   * Call this when loading a character card.
   */
  setLoreBook(characterUuid: string, book: CharacterBook | undefined): void {
    if (!book || !book.entries) {
      this.loreBookCache.set(characterUuid, []);
      return;
    }

    // Filter to enabled entries only
    const enabledEntries = book.entries.filter(
      (entry: LoreEntryInterface) => entry.enabled !== false
    );

    this.loreBookCache.set(characterUuid, enabledEntries);

    // Invalidate cache since lore changed
    this.cache.invalidate(characterUuid);
  }

  /**
   * Set lore book from a character card.
   */
  setLoreBookFromCard(card: CharacterCard | { data: CharacterCard['data'] }): void {
    const uuid = card.data.character_uuid;
    if (!uuid) {
      console.warn('[LoreSource] Character card has no UUID');
      return;
    }

    this.setLoreBook(uuid, card.data.character_book);
  }

  /**
   * Get all lore entries for a character.
   */
  getLoreEntries(characterUuid: string): LoreEntryInterface[] {
    return this.loreBookCache.get(characterUuid) ?? [];
  }

  /**
   * Update matched entries for a character.
   * Called when lore matching is performed during generation.
   */
  setMatchedEntries(characterUuid: string, entries: LoreEntryInterface[]): void {
    // Update the stored entries with matched ones
    this.loreBookCache.set(characterUuid, entries);

    // Invalidate cache
    this.cache.invalidate(characterUuid);

    // Track any images from matched entries
    for (const entry of entries) {
      if (entry.has_image && entry.image_uuid) {
        this.trackTriggeredImage(entry, characterUuid);
      }
    }
  }

  // =========================================================================
  // Triggered Image Management
  // =========================================================================

  /**
   * Track a triggered lore image.
   */
  trackTriggeredImage(entry: LoreEntryInterface, characterUuid: string): void {
    if (!entry.has_image || !entry.image_uuid) {
      return;
    }

    let imageMap = this.triggeredImages.get(characterUuid);
    if (!imageMap) {
      imageMap = new Map();
      this.triggeredImages.set(characterUuid, imageMap);
    }

    const entryIdStr = entry.id.toString();
    const existingImage = imageMap.get(entryIdStr);

    if (existingImage) {
      // Update timestamp
      existingImage.triggeredAt = Date.now();
    } else {
      imageMap.set(entryIdStr, {
        entryId: entry.id,
        imageUuid: entry.image_uuid,
        triggeredAt: Date.now(),
      });
    }

    // Invalidate cache
    this.cache.invalidate(characterUuid);
  }

  /**
   * Get triggered images for a character.
   */
  getTriggeredImages(characterUuid: string): TriggeredLoreImage[] {
    const imageMap = this.triggeredImages.get(characterUuid);
    if (!imageMap) {
      return [];
    }
    return this.buildTriggeredImageList(imageMap);
  }

  /**
   * Reset triggered images for a character.
   * Called when starting a new chat session.
   */
  resetTriggeredImages(characterUuid: string): void {
    this.triggeredImages.delete(characterUuid);
    this.cache.invalidate(characterUuid);
  }

  /**
   * Reset all triggered images.
   */
  resetAllTriggeredImages(): void {
    this.triggeredImages.clear();
    this.cache.clear();
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Build sorted triggered image list from map.
   * Converts internal mutable format to readonly TriggeredLoreImage.
   */
  private buildTriggeredImageList(
    imageMap: Map<string, MutableTriggeredImage>
  ): TriggeredLoreImage[] {
    const images = Array.from(imageMap.values());
    // Sort by triggered time (newest first)
    images.sort((a, b) => b.triggeredAt - a.triggeredAt);
    // Return as readonly TriggeredLoreImage array
    return images.map(img => ({
      entryId: img.entryId,
      imageUuid: img.imageUuid,
      triggeredAt: img.triggeredAt,
    }));
  }

  /**
   * Estimate token budget used by lore entries.
   * Uses ~4 chars per token approximation.
   */
  private estimateTokenBudget(entries: LoreEntryInterface[]): number {
    let totalChars = 0;
    for (const entry of entries) {
      if (entry.content) {
        totalChars += entry.content.length;
      }
    }
    return Math.ceil(totalChars / 4);
  }

  /**
   * Dispose of the source and clean up resources.
   */
  dispose(): void {
    this.cache.dispose();
    this.loreBookCache.clear();
    this.triggeredImages.clear();
  }
}

// Singleton instance for shared use
let sharedInstance: LoreSource | null = null;

/**
 * Get the shared LoreSource instance.
 */
export function getLoreSource(): LoreSource {
  if (!sharedInstance) {
    sharedInstance = new LoreSource();
  }
  return sharedInstance;
}

/**
 * Reset the shared instance (for testing).
 */
export function resetLoreSource(): void {
  if (sharedInstance) {
    sharedInstance.dispose();
    sharedInstance = null;
  }
}
