/**
 * @file fontConfig.ts
 * @description Single source of truth for all font references in the application.
 *
 * Adding a new font:
 *   1. Place font files in frontend/public/fonts/<FontName>/
 *   2. Add @font-face declarations in frontend/src/styles/fonts.css
 *   3. Add an entry to APP_FONTS below
 *   That's it — the dropdown, CSS variable, and PixiJS all pick it up automatically.
 */

export type AppFont = 'Poppins' | 'OpenDyslexic';

export const APP_FONTS: { id: AppFont; label: string; stack: string }[] = [
  { id: 'Poppins', label: 'Poppins', stack: "'Poppins', system-ui, -apple-system, sans-serif" },
  { id: 'OpenDyslexic', label: 'OpenDyslexic', stack: "'OpenDyslexic', system-ui, -apple-system, sans-serif" },
];

/** Look up the full CSS font-family stack for a given font ID. */
export function getFontStack(font: AppFont): string {
  const entry = APP_FONTS.find(f => f.id === font);
  return entry ? entry.stack : APP_FONTS[0].stack;
}

/**
 * Apply a font globally by setting the --font-app CSS variable on :root.
 * Also sets a data-font attribute for any CSS selectors that need it.
 */
export function applyFont(font: AppFont): void {
  const stack = getFontStack(font);
  document.documentElement.style.setProperty('--font-app', stack);
  document.documentElement.setAttribute('data-font', font);
}

/**
 * Read the current font stack from the CSS variable.
 * Used by PixiJS files that need the runtime font value.
 */
export function getCurrentFont(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--font-app').trim();
  return value || APP_FONTS[0].stack;
}
