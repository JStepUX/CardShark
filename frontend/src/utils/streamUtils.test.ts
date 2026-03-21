import { vi } from 'vitest';
import { createKoboldStreamWrapper, detectCompletionSignal } from './streamUtils';

describe('streamUtils', () => {
  describe('detectCompletionSignal', () => {
    it('should detect finish_reason:stop completion signal', () => {
      // Act
      const result = detectCompletionSignal('data: {"finish_reason":"stop"}');
      
      // Assert
      expect(result).toBe(true);
    });
    
    it('should detect finish_reason:length completion signal', () => {
      // Act
      const result = detectCompletionSignal('data: {"finish_reason":"length"}');
      
      // Assert
      expect(result).toBe(true);
    });
    
    it('should detect finish_reason:eos_token completion signal', () => {
      // Act
      const result = detectCompletionSignal('data: {"finish_reason":"eos_token"}');
      
      // Assert
      expect(result).toBe(true);
    });
    
    it('should detect stopped_max:true completion signal', () => {
      // Act
      const result = detectCompletionSignal('data: {"stopped_max":true}');
      
      // Assert
      expect(result).toBe(true);
    });
    
    it('should return false for regular content', () => {
      // Act
      const result = detectCompletionSignal('data: {"token": "Hello"}');
      
      // Assert
      expect(result).toBe(false);
    });
  });
  
  describe('createKoboldStreamWrapper', () => {
    it('should pass through chunk data and append DONE sentinel', async () => {
      const inputBytes = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: inputBytes })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn()
      };

      const mockOriginalBody = {
        getReader: vi.fn().mockReturnValue(mockReader)
      } as unknown as ReadableStream<Uint8Array>;

      const abortController = new AbortController();
      const wrapped = createKoboldStreamWrapper(mockOriginalBody, abortController.signal);
      const reader = wrapped.getReader();

      // First read: the original chunk is passed through
      const first = await reader.read();
      expect(first.done).toBe(false);
      expect(first.value).toBeInstanceOf(Uint8Array);
      expect(first.value).toEqual(inputBytes);

      // Second read: the wrapper appends a DONE sentinel
      const second = await reader.read();
      expect(second.done).toBe(false);
      const decoded = new TextDecoder().decode(second.value);
      expect(decoded).toContain('[DONE]');

      // Third read: stream is closed
      const third = await reader.read();
      expect(third.done).toBe(true);

      reader.releaseLock();
    });

    it('should emit DONE sentinel even when source stream is immediately done', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn()
      };

      const mockOriginalBody = {
        getReader: vi.fn().mockReturnValue(mockReader)
      } as unknown as ReadableStream<Uint8Array>;

      const abortController = new AbortController();
      const wrapped = createKoboldStreamWrapper(mockOriginalBody, abortController.signal);
      const reader = wrapped.getReader();

      // Even with empty source, wrapper emits DONE sentinel before closing
      const first = await reader.read();
      expect(first.done).toBe(false);
      const decoded = new TextDecoder().decode(first.value);
      expect(decoded).toContain('[DONE]');

      const second = await reader.read();
      expect(second.done).toBe(true);

      reader.releaseLock();
    });
  });
});
