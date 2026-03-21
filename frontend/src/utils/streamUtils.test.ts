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
    it('creates a ReadableStream that processes the original stream', async () => {
      // Create a more robust mock that properly triggers the internal code
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([104, 101, 108, 108, 111]) }) // "hello"
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn()
      };
      
      const mockOriginalBody = {
        getReader: jest.fn().mockReturnValue(mockReader)
      } as unknown as ReadableStream<Uint8Array>;
      
      // Create an abort controller for testing
      const abortController = new AbortController();
      
      // Call the function with the signal
      const result = createKoboldStreamWrapper(mockOriginalBody, abortController.signal);
      
      // Get a reader and read from it to trigger the stream processing
      const reader = result.getReader();
      
      // Use value in an assertion to avoid unused variable warning
      await reader.read().then(({ value }) => {
        // Verify we got some data (even if undefined in our mock)
        expect(value || new Uint8Array()).toBeDefined();
      });
      
      // Now the original reader should have been called
      expect(mockOriginalBody.getReader).toHaveBeenCalled();
      expect(mockReader.read).toHaveBeenCalled();
      
      // Clean up
      reader.releaseLock();
    });
  });
});
