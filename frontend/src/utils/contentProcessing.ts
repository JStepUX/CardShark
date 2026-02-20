// src/utils/contentProcessing.ts
/**
 * Utility functions for processing chat message content
 */

/**
 * Defines a word substitution rule for content filtering
 */
export interface WordSwapRule {
  /** Original word or phrase to match */
  original: string;
  /** Possible replacements (empty string means removal) */
  substitutions: string[];
  /** Matching mode for the substitution */
  mode: 'exact' | 'case-insensitive' | 'regex';
  /** Whether this rule is currently active */
  enabled: boolean;
  /** How to implement the substitution */
  strategy: 'api-ban' | 'client-replace' | 'auto';
}

/**
 * Removes incomplete sentences from the end of text content
 * An incomplete sentence is one that doesn't end with any of these characters: ., !, ?, .", !", ?", etc.
 * 
 * @param text The text content to process
 * @returns The text content with any incomplete sentence at the end removed
 */
export function removeIncompleteSentences(text: string): string {
  if (!text || typeof text !== 'string') return text;

  const trimmed = text.trim();
  if (trimmed.length === 0) return trimmed;

  // A valid sentence ending is terminal punctuation (.!?) followed by zero or more
  // closing wrappers: any quotation mark (Unicode-aware), asterisks, or brackets.
  // A bare closing * also counts (RP action blocks like *nods*).
  // Uses \p{Quotation_Mark} to match ALL Unicode quote variants — no guessing.
  const CLOSERS = `[*\\p{Quotation_Mark}\\)\\]\\}]*`;

  // 1. Already ends cleanly? Done.
  const endsCleanly = new RegExp(`(?:[.!?]${CLOSERS}|\\*)$`, 'u').test(trimmed);
  if (endsCleanly) return trimmed;

  // 2. Find the last valid sentence ending in the text and trim there.
  //    Anchor on .!? + optional closers, requiring whitespace or EOL after.
  //    Also match * followed by whitespace (closing an RP action mid-text).
  const endingPattern = new RegExp(`[.!?]${CLOSERS}(?=\\s|$)|\\*(?=\\s|$)`, 'gu');
  let lastEnd = -1;
  let match;
  while ((match = endingPattern.exec(trimmed)) !== null) {
    lastEnd = match.index + match[0].length;
  }

  if (lastEnd > 0) return trimmed.substring(0, lastEnd);

  // 3. No sentence ending found anywhere — return original. Never destroy content.
  return trimmed;
}

/**
 * Applies word substitution rules to the given text
 * 
 * @param text The text content to process
 * @param rules Array of word substitution rules to apply
 * @returns The processed text with substitutions applied
 */
export function applyWordSubstitutions(text: string, rules: WordSwapRule[]): string {
  if (!text || typeof text !== 'string' || !rules || rules.length === 0) {
    return text;
  }

  let processedText = text;
  
  // Apply only enabled rules with client-side strategy
  const clientRules = rules.filter(rule => rule.enabled && 
    (rule.strategy === 'client-replace' || rule.strategy === 'auto'));
  
  for (const rule of clientRules) {
    // Skip rules without valid original text or substitutions
    if (!rule.original || !rule.substitutions || rule.substitutions.length === 0) {
      continue;
    }

    // Get a random substitution (or empty string if none available)
    const replacement = rule.substitutions.length > 0 
      ? rule.substitutions[Math.floor(Math.random() * rule.substitutions.length)] 
      : '';

    // Apply the substitution based on the matching mode
    switch (rule.mode) {
      case 'exact':
        processedText = processedText.split(rule.original).join(replacement);
        break;
        
      case 'case-insensitive': {
        const regex = new RegExp(escapeRegExp(rule.original), 'gi');
        processedText = processedText.replace(regex, replacement);
        break;
      }
        
      case 'regex': {
        try {
          const regex = new RegExp(rule.original, 'g');
          processedText = processedText.replace(regex, replacement);
        } catch (error) {
          console.error(`Invalid regex in word substitution rule: ${rule.original}`, error);
        }
        break;
      }
    }
  }
  
  return processedText;
}

/**
 * Extract banned tokens from word substitution rules for API-level filtering
 * 
 * @param rules Array of word substitution rules
 * @returns Array of strings to be banned at API level
 */
export function extractBannedTokens(rules: WordSwapRule[]): string[] {
  if (!rules || rules.length === 0) {
    return [];
  }

  // Only include enabled rules with api-ban strategy
  return rules
    .filter(rule => rule.enabled && (rule.strategy === 'api-ban' || rule.strategy === 'auto'))
    .map(rule => rule.original)
    .filter(Boolean);
}

/**
 * Helper function to escape special characters in strings for use in regular expressions
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strips character name prefix from the beginning of AI-generated responses.
 * Many models prepend responses with "CharacterName:" which should be removed.
 *
 * @param text The text content to process
 * @param characterName The character's name to match against
 * @returns The text with the character name prefix removed (if present)
 *
 * @example
 * stripCharacterPrefix("Bob: Hello there!", "Bob") // returns "Hello there!"
 * stripCharacterPrefix("Bob:Hello there!", "Bob") // returns "Hello there!"
 * stripCharacterPrefix("Hello there!", "Bob") // returns "Hello there!" (no change)
 */
export function stripCharacterPrefix(text: string, characterName: string): string {
  if (!text || typeof text !== 'string' || !characterName) {
    return text;
  }

  // Escape special regex characters in the character name
  const escapedName = escapeRegExp(characterName);

  // Match the character name followed by a colon at the start of the text
  // Allows for optional whitespace after the colon
  // Case-insensitive to handle variations
  const prefixPattern = new RegExp(`^${escapedName}:\\s*`, 'i');

  return text.replace(prefixPattern, '');
}
