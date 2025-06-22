// useStreamProcessor.ts - Stream Processing Hook
// Extracted from useChatMessages.ts as part of Phase 2.1 refactoring
// Handles real-time message streaming, timeouts, and abort control

import { useRef, useCallback } from 'react';
import { PromptHandler } from '../../handlers/promptHandler';
import { STREAM_SETTINGS } from '../../services/chat/chatTypes';

// --- Types ---
export interface StreamProcessor {
  // Core streaming functions
  processStream: (
    response: Response,
    messageId: string,
    isThinking: boolean,
    onComplete: (content: string, chunks: number) => void,
    onError: (error: any) => void
  ) => Promise<void>;
  
  // Abort control
  createAbortController: () => AbortController;
  abortCurrentStream: () => void;
  isStreamActive: () => boolean;
  
  // Timeout management
  resetStreamTimeout: (onTimeout: () => void) => void;
  clearStreamTimeout: () => void;
  
  // Cleanup
  cleanup: () => void;
}

export interface StreamState {
  isActive: boolean;
  currentController: AbortController | null;
  timeoutId: NodeJS.Timeout | null;
}

// --- Hook Implementation ---
export function useStreamProcessor(): StreamProcessor {
  // Refs for persistent state across renders
  const currentGenerationRef = useRef<AbortController | null>(null);
  const streamTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Timeout Management ---
  const clearStreamTimeout = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
  }, []);

  const resetStreamTimeout = useCallback((onTimeout: () => void) => {
    clearStreamTimeout();
    streamTimeoutRef.current = setTimeout(() => {
      console.warn(`Stream timed out after ${STREAM_SETTINGS.INACTIVITY_TIMEOUT_MS / 1000}s. Aborting.`);
      onTimeout();
    }, STREAM_SETTINGS.INACTIVITY_TIMEOUT_MS);
  }, [clearStreamTimeout]);

  // --- Abort Controller Management ---
  const createAbortController = useCallback((): AbortController => {
    // Clean up any existing controller
    if (currentGenerationRef.current) {
      currentGenerationRef.current.abort();
    }
    
    // Create new controller
    const controller = new AbortController();
    currentGenerationRef.current = controller;
    return controller;
  }, []);

  const abortCurrentStream = useCallback(() => {
    if (!currentGenerationRef.current) {
      console.log("No active stream to abort.");
      return;
    }
    
    console.log("Aborting current stream...");
    currentGenerationRef.current.abort();
    clearStreamTimeout();
  }, [clearStreamTimeout]);

  const isStreamActive = useCallback((): boolean => {
    return currentGenerationRef.current !== null && !currentGenerationRef.current.signal.aborted;
  }, []);

  // --- Core Stream Processing ---
  const processStream = useCallback(async (
    response: Response,
    messageId: string,
    isThinking: boolean,
    onComplete: (content: string, chunks: number) => void,
    onError: (error: any) => void
  ): Promise<void> => {
    console.log(`[processStream] Starting stream processing for message ${messageId}, isThinking: ${isThinking}`);
    
    let accumulatedContent = '';
    let receivedChunks = 0;
    
    try {
      // Process each chunk from the stream
      for await (const chunk of PromptHandler.streamResponse(response)) {
        console.log(`[processStream] Received chunk ${receivedChunks + 1}: "${chunk}" (length: ${chunk.length})`);
        
        // Check if stream was aborted
        if (currentGenerationRef.current?.signal.aborted) {
          console.log(`[processStream] Stream aborted for message ${messageId}`);
          throw new DOMException('Aborted by user', 'AbortError');
        }
        
        // Reset timeout for each chunk received
        resetStreamTimeout(() => {
          console.warn(`Stream timeout triggered for message ${messageId}`);
          abortCurrentStream();
        });
        
        // Accumulate content
        accumulatedContent += chunk;
        receivedChunks++;
        
        console.log(`[processStream] Accumulated content so far: "${accumulatedContent}" (total length: ${accumulatedContent.length})`);
        
        // Yield control back to React for rendering
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      console.log(`[processStream] Stream complete for message ${messageId}. Final content: "${accumulatedContent}", chunks: ${receivedChunks}`);
      
      // Clear timeout on successful completion
      clearStreamTimeout();
      
      // Call completion callback
      onComplete(accumulatedContent, receivedChunks);
      
    } catch (err) {
      console.error(`[processStream] Stream error for message ${messageId}:`, err);
      
      // Clear timeout on error
      clearStreamTimeout();
      
      // Call error callback
      const error = err instanceof Error ? err : new Error('Unknown stream processing error');
      onError(error);
    }
  }, [resetStreamTimeout, clearStreamTimeout, abortCurrentStream]);

  // --- Cleanup ---
  const cleanup = useCallback(() => {
    // Abort any active stream
    if (currentGenerationRef.current) {
      currentGenerationRef.current.abort();
      currentGenerationRef.current = null;
    }
    
    // Clear any pending timeout
    clearStreamTimeout();
    
    console.log('[useStreamProcessor] Cleanup completed');
  }, [clearStreamTimeout]);

  // --- Return Hook Interface ---
  return {
    // Core streaming
    processStream,
    
    // Abort control
    createAbortController,
    abortCurrentStream,
    isStreamActive,
    
    // Timeout management
    resetStreamTimeout,
    clearStreamTimeout,
    
    // Cleanup
    cleanup
  };
}

// --- Utility Functions ---

/**
 * Creates a stream processor with automatic cleanup
 * Useful for one-time stream operations
 */
export function createStreamProcessor(): StreamProcessor & { dispose: () => void } {
  const processor = useStreamProcessor();
  
  return {
    ...processor,
    dispose: processor.cleanup
  };
}

/**
 * Stream processing with retry logic
 * Handles temporary network issues by retrying failed streams
 */
export async function processStreamWithRetry(
  processor: StreamProcessor,
  response: Response,
  messageId: string,
  isThinking: boolean,
  onComplete: (content: string, chunks: number) => void,
  onError: (error: any) => void,
  maxRetries: number = 3
): Promise<void> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await processor.processStream(response, messageId, isThinking, onComplete, onError);
      return; // Success
    } catch (error) {
      lastError = error;
      
      // Don't retry if aborted by user
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      
      // Don't retry on final attempt
      if (attempt === maxRetries) {
        break;
      }
      
      console.warn(`[processStreamWithRetry] Attempt ${attempt} failed for message ${messageId}, retrying...`, error);
      
      // Wait before retry (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // All retries failed
  throw lastError;
}

// --- Type Guards ---

/**
 * Checks if an error is a stream abort error
 */
export function isStreamAbortError(error: any): error is DOMException {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Checks if an error is a stream timeout error
 */
export function isStreamTimeoutError(error: any): error is Error {
  return error instanceof Error && error.message.includes('timeout');
}

/**
 * Checks if a response is streamable
 */
export function isStreamableResponse(response: Response): boolean {
  return response.ok && response.body !== null;
}
