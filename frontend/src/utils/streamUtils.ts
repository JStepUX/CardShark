/**
 * Utilities for handling streaming responses from various LLM providers
 */

const encoder = new TextEncoder();

/**
 * Creates a ReadableStream wrapper for KoboldCPP responses
 * This ensures proper stream completion and handles various edge cases
 * 
 * @param originalBody The original response body
 * @param signal Optional AbortSignal to cancel the stream
 * @returns A new ReadableStream that handles KoboldCPP-specific streaming logic
 */
export function createKoboldStreamWrapper(
  originalBody: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      try {
        const reader = originalBody.getReader();
        const decoder = new TextDecoder();
        let lastChunk = Date.now();
        const MAX_IDLE_TIME = 8000; // 8 seconds without data means we're done
        let pendingChunks = 0; // Track pending chunks
        
        // Create a local abort controller for this stream
        const localAbortController = new AbortController();
        
        // Forward the external abortion signal to our local controller
        if (signal) {
          signal.addEventListener('abort', () => {
            console.log('External abort signal received, closing KoboldCPP stream');
            localAbortController.abort();
            // Send DONE signal and close when aborted
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }, { once: true });
        }
        
        while (true) {
          // Check for idle timeout, but only if we've started receiving data
          const timeSinceLastChunk = Date.now() - lastChunk;
          if (pendingChunks > 0 && timeSinceLastChunk > MAX_IDLE_TIME) {
            // If we haven't received data in a while, assume we're done
            console.log(`KoboldCPP stream idle for ${MAX_IDLE_TIME}ms, completing`);
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            break;
          }
          
          // Read with timeout
          let readResult: ReadableStreamReadResult<Uint8Array>;
          try {
            const readPromise = reader.read();
            const timeoutPromise = new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
              setTimeout(() => reject(new Error('Stream read timeout')), MAX_IDLE_TIME);
            });
            
            readResult = await Promise.race([readPromise, timeoutPromise]);
            lastChunk = Date.now();
            pendingChunks++; // Increment pending chunks counter
          } catch (err) {
            if (err instanceof Error && err.message === 'Stream read timeout') {
              // If read times out, only assume we're done if we've received some data
              if (pendingChunks > 0) {
                console.log('KoboldCPP stream read timeout after receiving data, completing');
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
                break;
              } else {
                // If we haven't received any data yet, continue waiting
                console.log('KoboldCPP stream timeout, but no data received yet - continuing to wait');
                continue;
              }
            }
            throw err;
          }
          
          const { value, done } = readResult;
          
          // If stream is done, properly end it
          if (done) {
            console.log('KoboldCPP stream marked as done');
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            break;
          }
          
          // Process the chunk
          const chunk = decoder.decode(value, { stream: true });
          controller.enqueue(value);
          
          // Look for completion signals but DON'T break immediately
          // We need to ensure the current chunk gets processed
          let shouldCompleteAfterChunk = false;
          
          if (chunk.includes('"finish_reason":"length"') || 
              chunk.includes('"finish_reason":"stop"') || 
              chunk.includes('"finish_reason":"eos_token"') || 
              chunk.includes('"stopped_max":true')) {
            
            console.log(`KoboldCPP completion signal detected: ${chunk.substring(0, 100)}...`);
            shouldCompleteAfterChunk = true;
          }
          
          // If completion signal was detected, complete after this chunk has been processed
          if (shouldCompleteAfterChunk) {
            console.log('Completing KoboldCPP stream after processing completion chunk');
            // Use setTimeout to ensure the current chunk is fully processed
            setTimeout(() => {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }, 100);
            break;
          }
        }
      } catch (err) {
        console.error('Error in KoboldCPP stream processing:', err);
        // Send DONE signal even on error to ensure UI updates
        try {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (closeErr) {
          // Controller might already be closed
          console.warn('Error while closing controller after error:', closeErr);
        }
        controller.error(err);
      }
    }
  });
}

/**
 * Detects completion signals in a stream chunk
 * 
 * @param chunk The text chunk to analyze
 * @returns True if the chunk contains a completion signal
 */
export function detectCompletionSignal(chunk: string): boolean {
  return chunk.includes('"finish_reason":"length"') || 
         chunk.includes('"finish_reason":"stop"') || 
         chunk.includes('"finish_reason":"eos_token"') ||
         chunk.includes('"stopped_eos":true') ||
         chunk.includes('"stopped_word":true') ||
         chunk.includes('"stopped_max":true');
}

/**
 * Attempts to extract content from a possibly malformed JSON string
 * 
 * @param text The text to extract content from
 * @returns The extracted content, or null if nothing could be extracted
 */
export function extractContentFromText(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  
  try {
    // First try parsing as JSON
    const data = JSON.parse(text);
    if (data.token) return data.token;
    if (data.content) return data.content;
    if (data.choices && data.choices.length > 0) {
      const content = data.choices[0].delta?.content || data.choices[0].text || '';
      if (content) return content;
    }
  } catch (e) {
    // If JSON parsing fails, try regex extraction
    const contentMatch = text.match(/"content":"([^"]+)"/);
    const textMatch = text.match(/"text":"([^"]+)"/);
    if (contentMatch && contentMatch[1]) {
      return contentMatch[1];
    } else if (textMatch && textMatch[1]) {
      return textMatch[1];
    }
  }
  
  return null;
}
