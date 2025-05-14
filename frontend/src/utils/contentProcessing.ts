// src/utils/contentProcessing.ts
/**
 * Utility functions for processing chat message content
 */

/**
 * Removes incomplete sentences from the end of text content
 * An incomplete sentence is one that doesn't end with any of these characters: ., !, ?, .", !", ?", etc.
 * 
 * @param text The text content to process
 * @returns The text content with any incomplete sentence at the end removed
 */
export function removeIncompleteSentences(text: string): string {
  if (!text || typeof text !== 'string') return text;
  
  // Trim the text first to remove trailing whitespace
  const trimmedText = text.trim();
  
  // If the text is empty after trimming, return it
  if (trimmedText.length === 0) return trimmedText;
  
  // Check if the text already ends with a sentence ending
  const endsWithSentence = /[.!?]['"""'']?[)\]"'"""'\s]*$/.test(trimmedText);
  if (endsWithSentence) {
    return trimmedText;
  }
  
  // Find the last sentence ending anywhere in the text
  const sentenceEndingRegex = /[.!?]['"""'']?/g;
  let lastIndex = -1;
  let match;
  
  while ((match = sentenceEndingRegex.exec(trimmedText)) !== null) {
    lastIndex = match.index + match[0].length;
  }
  
  // If we found a sentence ending, trim the text to that point
  if (lastIndex > 0) {
    return trimmedText.substring(0, lastIndex);
  }
  
  // If no sentence ending is found, return the original text (might be just one incomplete sentence)
  return trimmedText;
}
