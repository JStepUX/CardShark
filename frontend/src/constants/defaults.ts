/**
 * @file defaults.ts
 * @description Centralized default values and constants for the frontend application.
 */

export const DEFAULT_BACKGROUND_SETTINGS = {
  background: null,
  transparency: 85,
  fadeLevel: 30,
  disableAnimation: false,
  moodEnabled: false
};

export const DEFAULT_REASONING_SETTINGS = {
  enabled: false,
  visible: false
};

export const GALLERY_DEFAULTS = {
  INITIAL_DISPLAY_COUNT: 20,
  BATCH_SIZE: 15,
  SCROLL_THRESHOLD: 300,
};

export const STALL_DETECTION = {
  TIMEOUT_MS: 8000,
  CHECK_INTERVAL_MS: 1000,
};
