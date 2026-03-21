/**
 * Tests for thinFrameService.ts
 *
 * Covers:
 * - generateThinFrame() with API success, timeout fallback
 * - createFallbackThinFrame() with truncation logic
 * - hasThinFrame() and getThinFrameFromCard() validation
 * - shouldRegenerateThinFrame() with content diff (>20% change)
 * - mergeThinFrameIntoCard() immutable merge
 */

import { vi } from 'vitest';
import {
  generateThinFrame,
  createFallbackThinFrame,
  getThinFrameFromCard,
  hasThinFrame,
  shouldRegenerateThinFrame,
  mergeThinFrameIntoCard,
  generateThinFramesBatch,
} from './thinFrameService';
import { CharacterCard, NPCThinFrame, THIN_FRAME_VERSION } from '../types/schema';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock getApiBaseUrl
vi.mock('../utils/apiConfig', () => ({
  getApiBaseUrl: () => 'http://localhost:9696',
}));

// Helper to create a minimal character card
function createMockCharacterCard(overrides: Partial<CharacterCard['data']> = {}): CharacterCard {
  return {
    name: 'Test Character',
    description: 'Test description',
    personality: 'Test personality',
    scenario: 'Test scenario',
    first_mes: 'Hello!',
    mes_example: '',
    creatorcomment: '',
    avatar: '',
    chat: '',
    talkativeness: '0.5',
    fav: false,
    tags: [],
    spec: 'chara_card_v2',
    spec_version: '2.0',
    create_date: '2024-01-01',
    data: {
      spec: 'chara_card_v2',
      name: 'Test Character',
      description: 'A brave knight with piercing blue eyes. They wear silver armor. A scar runs down their left cheek.',
      personality: 'Courageous and loyal. Dedicated to protecting the innocent.',
      scenario: 'A medieval fantasy world.',
      first_mes: 'Hello, traveler!',
      mes_example: '',
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
      character_uuid: 'test-uuid-12345',
      ...overrides,
    },
  };
}

// Helper to create a valid thin frame
function createMockThinFrame(overrides: Partial<NPCThinFrame> = {}): NPCThinFrame {
  return {
    version: THIN_FRAME_VERSION,
    generated_at: Date.now(),
    archetype: 'brave knight',
    key_traits: ['courageous', 'loyal'],
    speaking_style: 'formal',
    motivation: 'protect the innocent',
    appearance_hook: 'piercing blue eyes and silver armor',
    ...overrides,
  };
}

describe('thinFrameService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createFallbackThinFrame', () => {
    it('should create a fallback thin frame with truncated content', () => {
      const card = createMockCharacterCard();
      const frame = createFallbackThinFrame(card);

      expect(frame.version).toBe(THIN_FRAME_VERSION);
      expect(frame.generated_at).toBeDefined();
      expect(typeof frame.generated_at).toBe('number');
      expect(frame.archetype).toBe('Test Character');
      expect(frame.speaking_style).toBe('natural');
    });

    it('should extract first 2 sentences from description for appearance_hook', () => {
      const card = createMockCharacterCard({
        description: 'First sentence here. Second sentence follows. Third sentence ignored. Fourth too.',
      });

      const frame = createFallbackThinFrame(card);

      expect(frame.appearance_hook).toBe('First sentence here. Second sentence follows.');
    });

    it('should extract first sentence from personality for key_traits', () => {
      const card = createMockCharacterCard({
        personality: 'Very brave and strong. Also smart. And kind.',
      });

      const frame = createFallbackThinFrame(card);

      expect(frame.key_traits).toContain('Very brave and strong.');
    });

    it('should handle empty description', () => {
      const card = createMockCharacterCard({
        description: '',
      });

      const frame = createFallbackThinFrame(card);

      expect(frame.appearance_hook).toBe('no distinctive features');
    });

    it('should handle empty personality', () => {
      const card = createMockCharacterCard({
        personality: '',
      });

      const frame = createFallbackThinFrame(card);

      expect(frame.key_traits).toEqual([]);
    });

    it('should truncate long appearance_hook to 200 characters', () => {
      const longDescription = 'A' + '. B'.repeat(100);
      const card = createMockCharacterCard({
        description: longDescription,
      });

      const frame = createFallbackThinFrame(card);

      expect(frame.appearance_hook.length).toBeLessThanOrEqual(200);
    });

    it('should handle missing data gracefully', () => {
      const card = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: undefined,
      } as unknown as CharacterCard;

      const frame = createFallbackThinFrame(card);

      expect(frame.archetype).toBe('Unknown');
      expect(frame.appearance_hook).toBe('no distinctive features');
    });
  });

  describe('getThinFrameFromCard', () => {
    it('should return thin frame when present and valid', () => {
      const thinFrame = createMockThinFrame();
      const card = createMockCharacterCard();
      card.data.extensions = {
        ...card.data.extensions,
        cardshark_thin_frame: thinFrame,
      };

      const result = getThinFrameFromCard(card);

      expect(result).toEqual(thinFrame);
    });

    it('should return null when thin frame is missing', () => {
      const card = createMockCharacterCard();

      const result = getThinFrameFromCard(card);

      expect(result).toBeNull();
    });

    it('should return null when thin frame has wrong version', () => {
      const card = createMockCharacterCard();
      card.data.extensions = {
        ...card.data.extensions,
        cardshark_thin_frame: {
          ...createMockThinFrame(),
          version: 0 as any, // Invalid version
        },
      };

      const result = getThinFrameFromCard(card);

      expect(result).toBeNull();
    });

    it('should return null when thin frame is missing required fields', () => {
      const card = createMockCharacterCard();
      card.data.extensions = {
        ...card.data.extensions,
        cardshark_thin_frame: {
          version: THIN_FRAME_VERSION,
          // Missing other required fields
        } as any,
      };

      const result = getThinFrameFromCard(card);

      expect(result).toBeNull();
    });
  });

  describe('hasThinFrame', () => {
    it('should return true when card has valid thin frame', () => {
      const card = createMockCharacterCard();
      card.data.extensions = {
        ...card.data.extensions,
        cardshark_thin_frame: createMockThinFrame(),
      };

      expect(hasThinFrame(card)).toBe(true);
    });

    it('should return false when card has no thin frame', () => {
      const card = createMockCharacterCard();

      expect(hasThinFrame(card)).toBe(false);
    });
  });

  describe('shouldRegenerateThinFrame', () => {
    it('should return true when no thin frame exists', () => {
      const card = createMockCharacterCard();

      const result = shouldRegenerateThinFrame(card, 'original desc', 'original pers');

      expect(result).toBe(true);
    });

    it('should return false when content unchanged', () => {
      const card = createMockCharacterCard({
        description: 'Same description',
        personality: 'Same personality',
      });
      card.data.extensions = {
        ...card.data.extensions,
        cardshark_thin_frame: createMockThinFrame(),
      };

      const result = shouldRegenerateThinFrame(card, 'Same description', 'Same personality');

      expect(result).toBe(false);
    });

    it('should return true when description changes by more than 20%', () => {
      const original = 'A'.repeat(100);
      const newDesc = 'A'.repeat(130); // 30% longer

      const card = createMockCharacterCard({
        description: newDesc,
        personality: 'Same',
      });
      card.data.extensions = {
        ...card.data.extensions,
        cardshark_thin_frame: createMockThinFrame(),
      };

      const result = shouldRegenerateThinFrame(card, original, 'Same');

      expect(result).toBe(true);
    });

    it('should return true when personality changes by more than 20%', () => {
      const original = 'B'.repeat(100);
      const newPers = 'B'.repeat(130); // 30% longer

      const card = createMockCharacterCard({
        description: 'Same',
        personality: newPers,
      });
      card.data.extensions = {
        ...card.data.extensions,
        cardshark_thin_frame: createMockThinFrame(),
      };

      const result = shouldRegenerateThinFrame(card, 'Same', original);

      expect(result).toBe(true);
    });

    it('should return false when changes are under 20%', () => {
      const original = 'C'.repeat(100);
      const modified = 'C'.repeat(115); // 15% longer

      const card = createMockCharacterCard({
        description: modified,
        personality: 'Same',
      });
      card.data.extensions = {
        ...card.data.extensions,
        cardshark_thin_frame: createMockThinFrame(),
      };

      const result = shouldRegenerateThinFrame(card, original, 'Same');

      expect(result).toBe(false);
    });

    it('should handle empty original description', () => {
      const card = createMockCharacterCard({
        description: 'A'.repeat(100), // Significant new content
      });
      card.data.extensions = {
        ...card.data.extensions,
        cardshark_thin_frame: createMockThinFrame(),
      };

      const result = shouldRegenerateThinFrame(card, '', 'Same');

      expect(result).toBe(true);
    });
  });

  describe('mergeThinFrameIntoCard', () => {
    it('should merge thin frame into card extensions', () => {
      const card = createMockCharacterCard();
      const thinFrame = createMockThinFrame();

      const result = mergeThinFrameIntoCard(card, thinFrame);

      expect(result.data.extensions.cardshark_thin_frame).toEqual(thinFrame);
    });

    it('should not mutate the original card', () => {
      const card = createMockCharacterCard();
      const originalExtensions = { ...card.data.extensions };
      const thinFrame = createMockThinFrame();

      mergeThinFrameIntoCard(card, thinFrame);

      expect(card.data.extensions).toEqual(originalExtensions);
      expect(card.data.extensions.cardshark_thin_frame).toBeUndefined();
    });

    it('should preserve existing extensions', () => {
      const card = createMockCharacterCard();
      card.data.extensions = {
        ...card.data.extensions,
        custom_field: 'custom value',
      } as any;
      const thinFrame = createMockThinFrame();

      const result = mergeThinFrameIntoCard(card, thinFrame);

      expect((result.data.extensions as any).custom_field).toBe('custom value');
      expect(result.data.extensions.cardshark_thin_frame).toEqual(thinFrame);
    });

    it('should replace existing thin frame', () => {
      const card = createMockCharacterCard();
      card.data.extensions = {
        ...card.data.extensions,
        cardshark_thin_frame: createMockThinFrame({ archetype: 'old archetype' }),
      };
      const newFrame = createMockThinFrame({ archetype: 'new archetype' });

      const result = mergeThinFrameIntoCard(card, newFrame);

      expect(result.data.extensions.cardshark_thin_frame?.archetype).toBe('new archetype');
    });
  });

  describe('generateThinFrame', () => {
    it('should return thin frame on successful API call', async () => {
      const expectedFrame = createMockThinFrame();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          thin_frame: expectedFrame,
        }),
      });

      const card = createMockCharacterCard();
      const apiConfig = { api_key: 'test' };

      const resultPromise = generateThinFrame(card, apiConfig);

      // Fast-forward timers to complete the request
      vi.runAllTimers();

      const result = await resultPromise;

      expect(result).toEqual(expectedFrame);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:9696/api/context/generate-thin-frame',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should return fallback frame on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const card = createMockCharacterCard();
      const apiConfig = { api_key: 'test' };

      const resultPromise = generateThinFrame(card, apiConfig);
      vi.runAllTimers();
      const result = await resultPromise;

      // Should return a fallback frame
      expect(result.version).toBe(THIN_FRAME_VERSION);
      expect(result.archetype).toBe('Test Character');
    });

    it('should return fallback frame on abort error', async () => {
      // Mock a fetch that throws an AbortError (simulating timeout)
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const card = createMockCharacterCard();
      const apiConfig = { api_key: 'test' };

      const resultPromise = generateThinFrame(card, apiConfig);
      vi.runAllTimers();
      const result = await resultPromise;

      // Should return fallback frame on abort
      expect(result.version).toBe(THIN_FRAME_VERSION);
      expect(result.archetype).toBe('Test Character');
    });

    it('should return fallback frame when API returns success: false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          message: 'Generation failed',
        }),
      });

      const card = createMockCharacterCard();
      const apiConfig = { api_key: 'test' };

      const resultPromise = generateThinFrame(card, apiConfig);
      vi.runAllTimers();
      const result = await resultPromise;

      expect(result.version).toBe(THIN_FRAME_VERSION);
    });
  });

  describe('generateThinFramesBatch', () => {
    it('should generate thin frames for multiple NPCs', async () => {
      const frame1 = createMockThinFrame({ archetype: 'knight' });
      const frame2 = createMockThinFrame({ archetype: 'mage' });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, thin_frame: frame1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, thin_frame: frame2 }),
        });

      const npcs = [
        { characterCard: createMockCharacterCard({ character_uuid: 'uuid-1' }), apiConfig: {} },
        { characterCard: createMockCharacterCard({ character_uuid: 'uuid-2' }), apiConfig: {} },
      ];

      const resultsPromise = generateThinFramesBatch(npcs);
      vi.runAllTimers();
      const results = await resultsPromise;

      expect(results).toHaveLength(2);
      expect(results[0].thinFrame.archetype).toBe('knight');
      expect(results[1].thinFrame.archetype).toBe('mage');
    });

    it('should handle partial failures gracefully', async () => {
      const frame1 = createMockThinFrame({ archetype: 'knight' });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, thin_frame: frame1 }),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const npcs = [
        { characterCard: createMockCharacterCard({ character_uuid: 'uuid-1' }), apiConfig: {} },
        { characterCard: createMockCharacterCard({ character_uuid: 'uuid-2' }), apiConfig: {} },
      ];

      const resultsPromise = generateThinFramesBatch(npcs);
      vi.runAllTimers();
      const results = await resultsPromise;

      expect(results).toHaveLength(2);
      expect(results[0].thinFrame.archetype).toBe('knight');
      // Second should be fallback (generateThinFrame catches errors internally)
      expect(results[1].thinFrame.version).toBe(THIN_FRAME_VERSION);
      // Note: error field is not set because generateThinFrame handles errors internally
      // and returns a fallback frame instead of throwing
    });

    it('should return character UUIDs in results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, thin_frame: createMockThinFrame() }),
      });

      const npcs = [
        { characterCard: createMockCharacterCard({ character_uuid: 'uuid-abc' }), apiConfig: {} },
        { characterCard: createMockCharacterCard({ character_uuid: 'uuid-xyz' }), apiConfig: {} },
      ];

      const resultsPromise = generateThinFramesBatch(npcs);
      vi.runAllTimers();
      const results = await resultsPromise;

      expect(results[0].characterUuid).toBe('uuid-abc');
      expect(results[1].characterUuid).toBe('uuid-xyz');
    });
  });
});
