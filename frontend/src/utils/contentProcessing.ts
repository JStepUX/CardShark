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
const DEBUG_CONTENT_PROCESSING = process.env.NODE_ENV === 'development';

 export function removeIncompleteSentences(text: string): string {
  if (DEBUG_CONTENT_PROCESSING) {
    console.debug('[removeIncompleteSentences] Input:', text);
  }
   
   if (!text || typeof text !== 'string') {
    if (DEBUG_CONTENT_PROCESSING) {
      console.debug('[removeIncompleteSentences] Empty or invalid input, returning as-is');
    }
     return text;
   }
  
  // Trim the text first to remove trailing whitespace
  const trimmedText = text.trim();
  
  // If the text is empty after trimming, return it
  if (trimmedText.length === 0) {
    console.log('[removeIncompleteSentences] Empty after trimming');
    return trimmedText;
  }
  
  // Check if the text already ends with a sentence ending or a complete markdown block (image/link)
  // This prevents trimming valid markdown content at the end of a message
  // Allow *, **, and ) as valid endings
  const endsWithSentence = /(?:[.!?*)]+['"""'']?[)\]"'"""'\s]*|!?\[[^\]]*\]\([^)]*\)\s*)$/.test(trimmedText);
  console.log('[removeIncompleteSentences] Already ends with sentence or markdown:', endsWithSentence);
  if (endsWithSentence) {
    return trimmedText;
  }
  
  // Find the last sentence ending anywhere in the text
  // We use an enhanced regex that matches:
  // 1. Markdown images/links: prevents splitting inside URLs and treats them as valid endings
  // 2. Standard sentence endings: [.!?] followed optionally by quotes, but ONLY if followed by whitespace, EOF, or closing delimiters
  const safeEndingsRegex = /(?:!?\[[^\]]*\]\([^)]*\)|[.!?*)]+['"""'']?(?=\s|$|['"”’)]))/g;
  let lastIndex = -1;
  let match;
  
  while ((match = safeEndingsRegex.exec(trimmedText)) !== null) {
    lastIndex = match.index + match[0].length;
  }
  
  console.log('[removeIncompleteSentences] Last safe ending found at index:', lastIndex);
  
  // If we found a sentence ending, trim the text to that point
  if (lastIndex > 0) {
    const result = trimmedText.substring(0, lastIndex);
    console.log('[removeIncompleteSentences] Trimmed result:', result);
    return result;
  }
  
  // If no sentence ending is found, check if the entire text appears to be an incomplete sentence
  // This handles cases where the whole response is one incomplete sentence
  const isEntirelyIncomplete = !/[.!?*)]+['"""'']?[)\]"'"""'\s]*$/.test(trimmedText) &&
    trimmedText.length > 10 && // Avoid removing very short responses
    !/^(yes|no|okay?|sure|fine|good|bad|maybe|perhaps?|alright?|thanks?|please|sorry|hello|hi|hey|bye|goodbye|thanks?|welcome)$/i.test(trimmedText.trim()) && // Don't remove common short complete responses
    /\w$/.test(trimmedText); // Ends with a word character (not punctuation)

  if (isEntirelyIncomplete) {
    console.log('[removeIncompleteSentences] Detected entire response as incomplete sentence, removing.');
    return '';
  }

  // Legacy cutoff indicators for cases where there might be partial sentences after complete ones
  // (though this is rare since we already checked for sentence endings above)
  const cutoffIndicators = [
    /[;,:]\s*$/,                                            // Ends in non-terminal punctuation
    /[;,:]\s+\w{1,5}$/,                                     // Ends in punctuation + short word (e.g. ", a")
    /\s(and|but|or|the|a|an|of|to|in|at|by|for|with)\s*$/i  // Ends in connector/preposition
  ];

  if (cutoffIndicators.some(regex => regex.test(trimmedText))) {
    console.log('[removeIncompleteSentences] Detected incomplete sentence fragment, removing.');
    return '';
  }

  // Otherwise return the original text (might be a short answer like "Yes" or "Okay" without punctuation)
  console.log('[removeIncompleteSentences] No sentence ending found but seems complete, returning original');
  return trimmedText;
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
