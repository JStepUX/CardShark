import { SyntaxHighlightSettings, DEFAULT_SYNTAX_HIGHLIGHT_SETTINGS } from '../../../types/settings';

// Store the current highlighting settings globally
let currentSettings: SyntaxHighlightSettings = DEFAULT_SYNTAX_HIGHLIGHT_SETTINGS;

// Update the current settings
export const updateHighlightSettings = (settings: SyntaxHighlightSettings) => {
  currentSettings = settings;
};

// Get the current settings
export const getHighlightSettings = (): SyntaxHighlightSettings => {
  return currentSettings;
};