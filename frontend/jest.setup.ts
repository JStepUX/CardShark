// jest.setup.ts

// --- Core Polyfills ---
// MUST be first: Polyfill TextEncoder/TextDecoder needed by libraries like 'undici'
// before they are imported. Requires Node.js v11+ or these polyfills.
if (typeof globalThis.TextEncoder === 'undefined' || typeof globalThis.TextDecoder === 'undefined') {
  console.log('[Jest Setup] Applying TextEncoder/TextDecoder polyfills...');
  const util = require('util');
  globalThis.TextEncoder = util.TextEncoder;
  globalThis.TextDecoder = util.TextDecoder;
}

// --- Web Streams Polyfill ---
// Add ReadableStream, WritableStream, TransformStream if they don't exist globally.
// Needed for src/utils/streamUtils.ts
// Try using Node.js built-in web streams first (available in Node v16.5+)
try {
  // Check if they are already defined (e.g., by a newer JSDOM or Node version)
  if (typeof globalThis.ReadableStream === 'undefined') {
    const { ReadableStream, WritableStream, TransformStream } = require('node:stream/web');
    globalThis.ReadableStream = ReadableStream;
    // Add others only if needed and also missing
    if (typeof globalThis.WritableStream === 'undefined') {
      globalThis.WritableStream = WritableStream;
    }
    if (typeof globalThis.TransformStream === 'undefined') {
      globalThis.TransformStream = TransformStream;
    }
  } else {
    console.log('[Jest Setup] ReadableStream already defined globally.');
  }
} catch (err) {
  // Fallback if 'node:stream/web' is not available (e.g., older Node versions)
  console.warn('[Jest Setup] Failed to load streams from node:stream/web. Consider using a polyfill package if needed.', err);
  // If this fallback is hit and you still get errors, you might need to install
  // a specific polyfill like 'web-streams-polyfill'.
  // Example (requires installation: npm install --save-dev web-streams-polyfill):
  // if (typeof globalThis.ReadableStream === 'undefined') {
  //    console.log('[Jest Setup] Applying ReadableStream polyfill from web-streams-polyfill...');
  //    const { ReadableStream, WritableStream, TransformStream } = require('web-streams-polyfill/ponyfill');
  //    globalThis.ReadableStream = ReadableStream;
  //    globalThis.WritableStream = WritableStream;
  //    globalThis.TransformStream = TransformStream;
  // }
}


// --- JSDOM/Browser Specific Mocks & Polyfills ---

// Mock performance.markResourceTiming (missing in JSDOM, used by undici >= 5.21)
// Ensure we target window.performance if it exists (JSDOM context)
if (typeof window !== 'undefined' && window.performance && typeof window.performance.clearResourceTimings === 'undefined') {

  // @ts-ignore - performance might not have this property according to TS DOM types
  window.performance.markResourceTiming = () => { };
} else if (typeof performance !== 'undefined' && typeof performance.clearResourceTimings === 'undefined') {
  // Fallback for non-window environments, though less likely needed for undici fetch

  performance.clearResourceTimings = () => { };
}


// Mock window.matchMedia (missing in JSDOM)
if (typeof window !== 'undefined' && !window.matchMedia) {

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// Mock URL.createObjectURL/revokeObjectURL (missing/incomplete in JSDOM)
if (typeof URL !== 'undefined') {
  if (!URL.createObjectURL) {

    global.URL.createObjectURL = jest.fn(() => `mock-object-url-${Math.random()}`);
  }
  if (!URL.revokeObjectURL) {
    // Mock revokeObjectURL to do nothing (or log if needed)
    global.URL.revokeObjectURL = jest.fn();
  }
}


// --- Imports (after core polyfills/mocks) ---
import '@testing-library/jest-dom';

// --- Fetch API ---
// Node.js 18+ has native fetch support (globalThis.fetch exists by default)
// No undici polyfill needed for Node.js v25.3.0+
console.log('[Jest Setup] Using native Node.js fetch API.');


// --- Node Compatibility Polyfills ---
if (typeof globalThis.clearImmediate === 'undefined') {
  globalThis.clearImmediate = function (immediateId?: NodeJS.Immediate | number) {
    if (immediateId) {
      return clearTimeout(immediateId as unknown as NodeJS.Timeout);
    }
  };
}

if (typeof globalThis.setImmediate === 'undefined') {
  const setImmediateFn = function (callback: (...args: any[]) => void, ...args: any[]): NodeJS.Immediate {
    return setTimeout(callback, 0, ...args) as unknown as NodeJS.Immediate;
  };
  (setImmediateFn as any).__promisify__ = function (): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, 0);
    });
  };
  globalThis.setImmediate = setImmediateFn as unknown as typeof setImmediate;
}


console.log('[Jest Setup] Setup complete.');