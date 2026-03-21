// Test file for contentProcessing utilities
import { removeIncompleteSentences } from './contentProcessing';

describe('removeIncompleteSentences', () => {
  it('should remove incomplete sentences from the end of text', () => {
    // Test text with incomplete sentence at the end
    const input = "This is a complete sentence. This is an incomplete";
    const expected = "This is a complete sentence.";
    const result = removeIncompleteSentences(input);
    expect(result).toBe(expected);
  });

  it('should preserve text that already ends with complete sentences', () => {
    const input = "This is a complete sentence. This is also complete.";
    const result = removeIncompleteSentences(input);
    expect(result).toBe(input);
  });

  it('should handle text with question marks', () => {
    const input = "What is this? This is incomplete";
    const expected = "What is this?";
    const result = removeIncompleteSentences(input);
    expect(result).toBe(expected);
  });

  it('should handle text with exclamation marks', () => {
    const input = "Amazing! This is incomplete";
    const expected = "Amazing!";
    const result = removeIncompleteSentences(input);
    expect(result).toBe(expected);
  });

  it('should handle text with quotes after punctuation', () => {
    const input = 'He said "Hello." This is incomplete';
    const expected = 'He said "Hello."';
    const result = removeIncompleteSentences(input);
    expect(result).toBe(expected);
  });

  it('should return empty string for empty input', () => {
    const result = removeIncompleteSentences('');
    expect(result).toBe('');
  });

  it('should preserve text when no sentence ending is found', () => {
    const input = "This is incomplete";
    // When there's no sentence ending found, preserve the content as-is
    // rather than blanking valid completions that lack terminal punctuation
    const result = removeIncompleteSentences(input);
    expect(result).toBe('This is incomplete');
  });

  it('should preserve short common responses without punctuation', () => {
    // Short common responses like "yes", "no", "okay" should be preserved
    expect(removeIncompleteSentences('yes')).toBe('yes');
    expect(removeIncompleteSentences('no')).toBe('no');
    expect(removeIncompleteSentences('okay')).toBe('okay');
    expect(removeIncompleteSentences('thanks')).toBe('thanks');
  });

  it('should handle text with trailing whitespace', () => {
    const input = "Complete sentence. Incomplete   ";
    const expected = "Complete sentence.";
    const result = removeIncompleteSentences(input);
    expect(result).toBe(expected);
  });

  it('should handle various quote styles', () => {
    const input = 'He said "Hello!" Then he started';
    const expected = 'He said "Hello!"';
    const result = removeIncompleteSentences(input);
    expect(result).toBe(expected);
  });

  // Markdown image tests
  it('should preserve markdown images at the end of text', () => {
    const input = 'Here is an image: ![description](https://example.com/img.png)';
    const result = removeIncompleteSentences(input);
    expect(result).toBe(input);
  });

  it('should preserve markdown images with complex URLs', () => {
    const input = 'Check this out! ![alt text](https://example.com/path/to/image.jpg?size=large&format=webp#anchor)';
    const result = removeIncompleteSentences(input);
    expect(result).toBe(input);
  });

  it('should preserve text ending in markdown link', () => {
    const input = 'Read more at [this link](https://docs.example.com/guide)';
    const result = removeIncompleteSentences(input);
    expect(result).toBe(input);
  });

  it('should trim incomplete text after markdown image', () => {
    const input = 'Here is an image: ![photo](https://example.com/img.png) And then something incomplete';
    const expected = 'Here is an image: ![photo](https://example.com/img.png)';
    const result = removeIncompleteSentences(input);
    expect(result).toBe(expected);
  });

  // Quoted sentences with punctuation inside quotes
  it('should preserve sentences ending with punctuation inside quotes', () => {
    const input = 'She replied, "Of course!"';
    const result = removeIncompleteSentences(input);
    expect(result).toBe(input);
  });

  it('should preserve sentences with question inside quotes', () => {
    const input = 'He asked, "Are you coming?"';
    const result = removeIncompleteSentences(input);
    expect(result).toBe(input);
  });

  it('should preserve sentences with period inside quotes', () => {
    const input = 'The sign read, "No parking."';
    const result = removeIncompleteSentences(input);
    expect(result).toBe(input);
  });

  it('should handle curly quotes', () => {
    const input = 'She said, "Hello there."';
    const result = removeIncompleteSentences(input);
    expect(result).toBe(input);
  });

  it('should handle single curly quotes', () => {
    const input = "He replied, 'I'll be there.'";
    const result = removeIncompleteSentences(input);
    expect(result).toBe(input);
  });

  // Text ending with asterisks (bold/italic markdown)
  it('should preserve text ending with bold markers', () => {
    const input = 'This is **bold text.**';
    const result = removeIncompleteSentences(input);
    expect(result).toBe(input);
  });

  it('should preserve text ending with italic markers', () => {
    const input = 'This is *italic text.*';
    const result = removeIncompleteSentences(input);
    expect(result).toBe(input);
  });

  // Multiple sentences with trailing incomplete
  it('should trim to last complete sentence in complex text', () => {
    const input = 'First sentence. Second sentence! Third question? Then incomplete';
    const expected = 'First sentence. Second sentence! Third question?';
    const result = removeIncompleteSentences(input);
    expect(result).toBe(expected);
  });
});
