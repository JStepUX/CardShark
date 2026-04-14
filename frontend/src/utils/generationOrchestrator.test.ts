/**
 * Unit tests for Hard Regenerate break-strategy logic in
 * generationOrchestrator.ts. These tests cover the pure, synchronous
 * strategy selector — no network, no streaming, no React.
 */
import { describe, it, expect } from 'vitest';
import {
  applyHardRegenStrategy,
  extractHardRegenBanWords,
  HARD_REGEN_PROTECTED_WORDS,
} from './generationOrchestrator';

const BASE_SETTINGS = Object.freeze({
  temperature: 0.9,
  top_p: 0.92,
  min_p: 0.05,
  top_k: 40,
  dynatemp_range: 0,
  dynatemp_exponent: 1,
});

describe('extractHardRegenBanWords', () => {
  it('extracts words >=5 chars from the first 20 tokens', () => {
    const content =
      'The shimmering blade caught the light as Elena turned toward the gate.';
    const words = extractHardRegenBanWords(content);
    expect(words.length).toBeGreaterThan(0);
    expect(words.length).toBeLessThanOrEqual(3);
    // "shimmering" is long + not protected — should appear
    expect(words).toContain('shimmering');
  });

  it('skips protected structural words', () => {
    const content =
      'through around because against between another already perhaps within without';
    // Every one of these is in the protected list — no bans should come out.
    const words = extractHardRegenBanWords(content);
    expect(words).toEqual([]);
  });

  it('skips short words (<5 chars)', () => {
    const content = 'a cat sat on the mat and it was fine yes no';
    const words = extractHardRegenBanWords(content);
    expect(words).toEqual([]);
  });

  it('caps output at maxBans', () => {
    const content =
      'shimmering glistening sparkling gleaming radiant luminous brilliant dazzling';
    const words = extractHardRegenBanWords(content, 20, 3);
    expect(words.length).toBe(3);
  });

  it('only scans the first `windowTokens` tokens', () => {
    // First 2 tokens are protected/short; "shimmering" is beyond the window
    const content = 'the cat shimmering blade';
    const words = extractHardRegenBanWords(content, 2);
    expect(words).not.toContain('shimmering');
  });

  it('dedupes repeated words', () => {
    const content = 'shimmering shimmering shimmering blade shimmering';
    const words = extractHardRegenBanWords(content);
    expect(words.filter((w) => w === 'shimmering').length).toBe(1);
  });

  it('protected words set includes "through" and "because"', () => {
    expect(HARD_REGEN_PROTECTED_WORDS.has('through')).toBe(true);
    expect(HARD_REGEN_PROTECTED_WORDS.has('because')).toBe(true);
    expect(HARD_REGEN_PROTECTED_WORDS.has('shimmering')).toBe(false);
  });
});

describe('applyHardRegenStrategy — strategy rotation', () => {
  const targetContent =
    'The shimmering glistening blade caught the dazzling light from above.';

  it('attempt 0: token ban — produces banned_tokens from message content', () => {
    const result = applyHardRegenStrategy(BASE_SETTINGS, 0, targetContent);
    expect(Array.isArray(result.banned_tokens)).toBe(true);
    expect(result.banned_tokens.length).toBeGreaterThan(0);
    // No protected words in the ban list
    for (const w of result.banned_tokens) {
      expect(HARD_REGEN_PROTECTED_WORDS.has(w)).toBe(false);
    }
    // Dynatemp and widening unchanged at attempt 0
    expect(result.dynatemp_range).toBe(0);
    expect(result.top_p).toBe(0.92);
    expect(result.top_k).toBe(40);
  });

  it('attempt 1: dynatemp bump — sets range=3, exponent=1, preserves temperature', () => {
    const result = applyHardRegenStrategy(BASE_SETTINGS, 1, targetContent);
    expect(result.dynatemp_range).toBe(3.0);
    expect(result.dynatemp_exponent).toBe(1.0);
    // Temperature itself is untouched
    expect(result.temperature).toBe(BASE_SETTINGS.temperature);
    // No ban, no widening
    expect(result.banned_tokens).toBeUndefined();
    expect(result.top_p).toBe(0.92);
    expect(result.min_p).toBe(0.05);
    expect(result.top_k).toBe(40);
  });

  it('attempt 2: sampler widening — sets top_p=1, min_p=0, top_k=0', () => {
    const result = applyHardRegenStrategy(BASE_SETTINGS, 2, targetContent);
    expect(result.top_p).toBe(1.0);
    expect(result.min_p).toBe(0);
    expect(result.top_k).toBe(0);
    // No ban, no dynatemp bump
    expect(result.banned_tokens).toBeUndefined();
    expect(result.dynatemp_range).toBe(0);
    expect(result.temperature).toBe(BASE_SETTINGS.temperature);
  });

  it('attempt 3: nuclear — ban + dynatemp + widening together', () => {
    const result = applyHardRegenStrategy(BASE_SETTINGS, 3, targetContent);
    expect(result.banned_tokens).toBeDefined();
    expect(result.banned_tokens.length).toBeGreaterThan(0);
    expect(result.dynatemp_range).toBe(3.0);
    expect(result.dynatemp_exponent).toBe(1.0);
    expect(result.top_p).toBe(1.0);
    expect(result.min_p).toBe(0);
    expect(result.top_k).toBe(0);
  });

  it('attempt 4+ behaves the same as attempt 3 (nuclear stays nuclear)', () => {
    const a3 = applyHardRegenStrategy(BASE_SETTINGS, 3, targetContent);
    const a7 = applyHardRegenStrategy(BASE_SETTINGS, 7, targetContent);
    expect(a7.dynatemp_range).toBe(a3.dynatemp_range);
    expect(a7.top_p).toBe(a3.top_p);
    expect(a7.banned_tokens).toEqual(a3.banned_tokens);
  });

  it('does not mutate the input settings object (purity)', () => {
    const input: Record<string, any> = {
      temperature: 0.9,
      top_p: 0.92,
      min_p: 0.05,
      top_k: 40,
      dynatemp_range: 0,
      dynatemp_exponent: 1,
      banned_tokens: ['pre-existing'],
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    applyHardRegenStrategy(input, 0, targetContent);
    applyHardRegenStrategy(input, 1, targetContent);
    applyHardRegenStrategy(input, 2, targetContent);
    applyHardRegenStrategy(input, 3, targetContent);
    expect(input).toEqual(snapshot);
  });

  it('attempt 0 merges with existing banned_tokens rather than replacing', () => {
    const settings = { ...BASE_SETTINGS, banned_tokens: ['legacy_ban'] };
    const result = applyHardRegenStrategy(settings, 0, targetContent);
    expect(result.banned_tokens).toContain('legacy_ban');
    // At least one word from the content should be added
    expect(result.banned_tokens.length).toBeGreaterThan(1);
  });

  it('handles undefined baseSettings gracefully', () => {
    const result = applyHardRegenStrategy(undefined, 0, targetContent);
    expect(Array.isArray(result.banned_tokens)).toBe(true);
    expect(result.banned_tokens.length).toBeGreaterThan(0);
  });

  it('attempt 0 with empty content produces no ban list', () => {
    const result = applyHardRegenStrategy(BASE_SETTINGS, 0, '');
    expect(result.banned_tokens).toBeUndefined();
  });
});
