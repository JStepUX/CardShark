// Lightweight performance utilities for CardShark frontend

// Simple debounce utility
export const debounce = <T extends (...args: any[]) => any>(
  fn: T, 
  delay: number
): T => {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return ((...args: any[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  }) as T;
};

// Simple throttle utility
export const throttle = <T extends (...args: any[]) => any>(
  fn: T, 
  delay: number
): T => {
  let inThrottle = false;
  return ((...args: any[]) => {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, delay);
    }
  }) as T;
};

// Check if user prefers reduced motion
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Simple streaming buffer for chat
export interface StreamingBuffer {
  addChunk: (chunk: string) => void;
  flush: () => string;
  hasContent: () => boolean;
}

export const createStreamingBuffer = (flushCallback: (content: string) => void): StreamingBuffer => {
  let buffer = '';
  let timeoutId: NodeJS.Timeout | null = null;
  const flush = (): string => {
    const content = buffer;
    buffer = '';
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (content) {
      flushCallback(content);
    }
    return content;
  };

  const addChunk = (chunk: string) => {
    buffer += chunk;
    
    // Auto-flush after 100ms or when buffer gets large
    if (timeoutId) clearTimeout(timeoutId);
    if (buffer.length > 100) {
      flush();
    } else {
      timeoutId = setTimeout(flush, 100);
    }
  };

  return {
    addChunk,
    flush,
    hasContent: () => buffer.length > 0
  };
};
