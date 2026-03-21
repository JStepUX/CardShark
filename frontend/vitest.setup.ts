import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// --- Core Polyfills ---
// TextEncoder/TextDecoder — likely already available in Node 22+ but kept as safety net
if (typeof globalThis.TextEncoder === 'undefined' || typeof globalThis.TextDecoder === 'undefined') {
  const { TextEncoder, TextDecoder } = await import('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}

// --- Web Streams Polyfill ---
if (typeof globalThis.ReadableStream === 'undefined') {
  try {
    const streams = await import('node:stream/web');
    globalThis.ReadableStream = streams.ReadableStream as typeof globalThis.ReadableStream;
    if (typeof globalThis.WritableStream === 'undefined') {
      globalThis.WritableStream = streams.WritableStream as typeof globalThis.WritableStream;
    }
    if (typeof globalThis.TransformStream === 'undefined') {
      globalThis.TransformStream = streams.TransformStream as typeof globalThis.TransformStream;
    }
  } catch {
    console.warn('[Vitest Setup] Failed to load streams from node:stream/web.');
  }
}

// --- JSDOM/Browser Mocks ---

// Mock performance.markResourceTiming (missing in JSDOM, used by undici >= 5.21)
if (typeof window !== 'undefined' && window.performance && typeof window.performance.clearResourceTimings === 'undefined') {
  // @ts-ignore
  window.performance.markResourceTiming = () => {};
} else if (typeof performance !== 'undefined' && typeof performance.clearResourceTimings === 'undefined') {
  performance.clearResourceTimings = () => {};
}

// Mock window.matchMedia (missing in JSDOM)
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Mock URL.createObjectURL/revokeObjectURL (missing/incomplete in JSDOM)
if (typeof URL !== 'undefined') {
  if (!URL.createObjectURL) {
    global.URL.createObjectURL = vi.fn(() => `mock-object-url-${Math.random()}`);
  }
  if (!URL.revokeObjectURL) {
    global.URL.revokeObjectURL = vi.fn();
  }
}

// --- Node Compatibility Polyfills ---
if (typeof globalThis.clearImmediate === 'undefined') {
  globalThis.clearImmediate = function (immediateId?: NodeJS.Immediate | number) {
    if (immediateId) {
      return clearTimeout(immediateId as unknown as NodeJS.Timeout);
    }
  };
}

if (typeof globalThis.setImmediate === 'undefined') {
  const setImmediateFn = function (callback: (...args: unknown[]) => void, ...args: unknown[]): NodeJS.Immediate {
    return setTimeout(callback, 0, ...args) as unknown as NodeJS.Immediate;
  };
  (setImmediateFn as Record<string, unknown>).__promisify__ = function (): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, 0);
    });
  };
  globalThis.setImmediate = setImmediateFn as unknown as typeof setImmediate;
}
