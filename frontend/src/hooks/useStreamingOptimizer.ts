import { useCallback, useRef, useEffect } from 'react';

interface StreamingOptimizerOptions {
  bufferSize: number;
  flushInterval: number;
  maxConcurrentUpdates: number;
}

export const useStreamingOptimizer = (options: Partial<StreamingOptimizerOptions> = {}) => {
  const {
    bufferSize = 100,
    flushInterval = 16, // ~60fps (16.67ms)
    maxConcurrentUpdates = 3
  } = options;

  const bufferRef = useRef<string>('');
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const frameRequestRef = useRef<number | null>(null);
  const updateCountRef = useRef(0);
  const isFlushingRef = useRef(false);
  const flushBuffer = useCallback((callback: (content: string) => void, force = false) => {
    if (isFlushingRef.current && !force) return;
    
    // Cancel any pending animation frame when forcing or starting a new flush
    if (frameRequestRef.current) {
      cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
    }
    
    if (bufferRef.current) {
      isFlushingRef.current = true;
      
      frameRequestRef.current = requestAnimationFrame(() => {
        callback(bufferRef.current);
        bufferRef.current = '';
        updateCountRef.current = 0;
        isFlushingRef.current = false;
        frameRequestRef.current = null;
      });
    }
  }, []);

  const addToBuffer = useCallback((chunk: string, callback: (content: string) => void) => {
    bufferRef.current += chunk;
    updateCountRef.current++;

    // Flush conditions
    const shouldFlush = 
      bufferRef.current.length >= bufferSize ||
      updateCountRef.current >= maxConcurrentUpdates;

    if (shouldFlush) {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      flushBuffer(callback);
    } else {
      // Schedule flush if not already scheduled
      if (!flushTimeoutRef.current && !isFlushingRef.current) {
        flushTimeoutRef.current = setTimeout(() => {
          flushBuffer(callback);
          flushTimeoutRef.current = null;
        }, flushInterval);
      }
    }
  }, [bufferSize, maxConcurrentUpdates, flushInterval, flushBuffer]);

  const forceFlush = useCallback((callback: (content: string) => void) => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
    flushBuffer(callback, true);
  }, [flushBuffer]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
      if (frameRequestRef.current) {
        cancelAnimationFrame(frameRequestRef.current);
      }
    };
  }, []);

  return {
    addToBuffer,
    forceFlush,
    hasBuffer: () => bufferRef.current.length > 0
  };
};
