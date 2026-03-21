# Tailwind CSS v3 → v4 Upgrade Reference

Source: https://tailwindcss.com/docs/upgrade-guide

## Browser Requirements

- Safari 16.4+
- Chrome 111+
- Firefox 128+

Depends on `@property` and `color-mix()`.

## Automated Upgrade Tool

```bash
npx @tailwindcss/upgrade
```

Requires **Node.js 20+**. Handles ~90% of class renames automatically.

## Build Tool Changes

### Vite (recommended for Vite projects)

```ts
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwindcss()],
});
```

Remove `tailwindcss` and `autoprefixer` from PostCSS config entirely.

### PostCSS (if not using Vite plugin)

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

Remove `postcss-import` and `autoprefixer` (now automatic).

## CSS Import Changes

```css
/* v3 */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* v4 */
@import "tailwindcss";
```

## Content Detection

Automatic in v4 — no `content` array needed. Tailwind detects template files via heuristics.

## Renamed Utilities

| v3 | v4 |
|---|---|
| `shadow-sm` | `shadow-xs` |
| `shadow` | `shadow-sm` |
| `drop-shadow-sm` | `drop-shadow-xs` |
| `drop-shadow` | `drop-shadow-sm` |
| `blur-sm` | `blur-xs` |
| `blur` | `blur-sm` |
| `backdrop-blur-sm` | `backdrop-blur-xs` |
| `backdrop-blur` | `backdrop-blur-sm` |
| `rounded-sm` | `rounded-xs` |
| `rounded` | `rounded-sm` |
| `outline-none` | `outline-hidden` |
| `ring` (bare) | `ring-3` |

## Removed Deprecated Utilities

| Deprecated | Replacement |
|---|---|
| `bg-opacity-*` | Use opacity modifier: `bg-black/50` |
| `text-opacity-*` | `text-black/50` |
| `border-opacity-*` | `border-black/50` |
| `divide-opacity-*` | `divide-black/50` |
| `ring-opacity-*` | `ring-black/50` |
| `placeholder-opacity-*` | `placeholder-black/50` |
| `flex-shrink-*` | `shrink-*` |
| `flex-grow-*` | `grow-*` |
| `overflow-ellipsis` | `text-ellipsis` |
| `decoration-slice` | `box-decoration-slice` |
| `decoration-clone` | `box-decoration-clone` |

## Default Value Changes

### Border Color
- **v3**: `gray-200`
- **v4**: `currentColor`
- Fix: specify color explicitly (`border-gray-200`) or add base style

### Ring Width
- **v3**: `ring` = 3px
- **v4**: `ring` = 1px (use `ring-3` for old behavior)

### Ring Color
- **v3**: blue-500
- **v4**: `currentColor`

### Button Cursor
- **v3**: `cursor: pointer`
- **v4**: `cursor: default`
- Fix: add base style to restore pointer

### Placeholder Color
- **v3**: `gray-400`
- **v4**: current text color at 50% opacity

### Outline
- **v3**: `outline-none` = invisible outline (2px solid transparent)
- **v4**: `outline-hidden` = invisible outline; `outline-none` = `outline-style: none`

## Configuration: JS → CSS

### Theme in CSS

```css
@theme {
  --color-primary: oklch(0.7 0.15 200);
  --font-display: "Satoshi", "sans-serif";
}
```

### Loading legacy JS config

```css
@config "../../tailwind.config.js";
```

**Unsupported in v4**: `corePlugins`, `safelist`, `separator`

## Custom Utilities

```css
/* v3 */
@layer utilities {
  .tab-4 { tab-size: 4; }
}

/* v4 */
@utility tab-4 {
  tab-size: 4;
}
```

## @layer components → @utility

```css
/* v3 */
@layer components {
  .btn { ... }
}

/* v4 */
@utility btn { ... }
```

## theme() → CSS Variables

```css
/* v3 */
background-color: theme(colors.red.500);

/* v4 */
background-color: var(--color-red-500);
```

## Variant Stacking Order

- **v3**: Right to left (`first:*:pt-0`)
- **v4**: Left to right (`*:first:pt-0`)

## Gradient Utility Rename

`bg-gradient-to-*` → `bg-linear-to-*`

## Arbitrary Values with Variables

```html
<!-- v3 -->
<div class="bg-[--brand-color]">

<!-- v4 -->
<div class="bg-(--brand-color)">
```

## Hover on Mobile

Now uses `@media (hover: hover)` — won't trigger on touch devices.

## Transform Properties

Individual properties (`rotate`, `scale`, `translate`) used instead of `transform`.
- `transform-none` → `rotate-none` / `scale-none` / `translate-none`
- `transition-transform` → `transition-[rotate]` / `transition-[scale]` etc.

## Important Modifier

Exclamation mark moves to **end** of class name: `bg-red-500!` (not `!bg-red-500`)

## Space Between / Divide Selector Changes

Selector changed from `:not([hidden]) ~ :not([hidden])` to `:not(:last-child)`.
Consider migrating to `flex flex-col gap-*` or `grid gap-*`.
