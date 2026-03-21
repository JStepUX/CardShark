# Jest to Vitest Migration Plan

## Context

Key facts that inform decisions during migration:

- 2 `.tsx` tests are `describe.skip`'d because `ts-jest`'s JSX transform conflicts with React 18. Vitest reuses the Vite/SWC pipeline, so these unblock automatically.
- The project maintains `vite.config.ts` for dev/build AND `jest.config.cjs` + `tsconfig.test.json` for tests. Vitest collapses these — config, path aliases, and transforms all come from the existing Vite config.
- The project is `"type": "module"` but Jest forces CommonJS via `tsconfig.test.json`. Vitest runs ESM natively, eliminating the mismatch.
- 5 Jest-specific dependencies become unnecessary: `jest`, `jest-environment-jsdom`, `ts-jest`, `@types/jest`, `identity-obj-proxy`.

**Scope:** 21 test files, ~6,200 lines. No snapshot tests. No `@testing-library/react` usage (referenced in setup but not installed).

---

## Current State Inventory

### Configuration Files

| File | Role |
|------|------|
| `frontend/jest.config.cjs` | Jest configuration (preset: ts-jest, env: jsdom) |
| `frontend/tsconfig.test.json` | Test-only TypeScript config (CommonJS, `"jsx": "react"`) |
| `frontend/jest.setup.ts` | Setup: polyfills (TextEncoder, ReadableStream, setImmediate), jsdom mocks (matchMedia, URL.createObjectURL), `@testing-library/jest-dom` import |
| `frontend/jest.setup.console.js` | Console mock suppression (unused in config -- not in `setupFilesAfterSetup`) |
| `frontend/__mocks__/fileMock.ts` | Static asset mock (`export default 'test-file-stub'`) |
| `frontend/vite.config.ts` | Existing Vite config (SWC React plugin, path aliases, proxy) |

### Dependencies (Jest-specific)

| Package | Version | Vitest Equivalent |
|---------|---------|-------------------|
| `jest` | ^29.7.0 | `vitest` |
| `jest-environment-jsdom` | ^29.7.0 | `@vitest/jsdom` (or `happy-dom`) |
| `ts-jest` | ^29.1.1 | Not needed (Vite handles transforms) |
| `@types/jest` | ^29.5.14 | Not needed (`vitest` ships its own types) |
| `identity-obj-proxy` | ^3.0.0 | Not needed (Vite CSS handling or inline config) |

### Test Scripts (package.json)

```json
"test": "jest --config jest.config.cjs",
"test:watch": "jest --watch --config jest.config.cjs",
"test:coverage": "jest --coverage --config jest.config.cjs"
```

### Test Files (21 files, ~6,200 lines)

| File | Lines | Jest APIs Used |
|------|-------|---------------|
| `components/world/pixi/local/LocalMapStage.test.ts` | 856 | `jest.mock` (5), `jest.fn` (52), `jest.clearAllMocks` |
| `services/context/ContextSerializer.test.ts` | 695 | Pure assertions only |
| `services/context/ContextAssembler.test.ts` | 691 | Pure assertions only |
| `components/combat/pixi/AnimationManager.test.ts` | 571 | `jest.mock`, `jest.fn` (25) |
| `services/thinFrameService.test.ts` | 555 | `jest.mock`, `jest.fn`, `jest.useFakeTimers`, `jest.runAllTimers`, `jest.clearAllMocks` |
| `components/world/pixi/MapCamera.test.ts` | 517 | `jest.fn`, `jest.spyOn`, `expect.any` |
| `components/world/pixi/local/EntityCardSprite.test.ts` | 489 | `jest.mock` (2), `jest.fn` (21), `jest.clearAllMocks` |
| `services/context/sources/CharacterSource.test.ts` | 486 | Pure assertions only |
| `components/world/pixi/local/CardAnimationController.test.ts` | 480 | `jest.mock`, `jest.fn` (20), `jest.spyOn`, `jest.useFakeTimers`, `jest.advanceTimersByTime`, `as jest.Mock` (5) |
| `services/context/ContextCache.test.ts` | 343 | Pure assertions only |
| `components/combat/pixi/TextureCache.test.ts` | 308 | `jest.mock`, `jest.fn` (8), `expect.stringContaining` |
| `components/combat/pixi/easing.test.ts` | 232 | Pure assertions only |
| `utils/koboldTransformer.test.ts` | 192 | `jest.fn`, `jest.resetAllMocks`, `as jest.Mock`, `expect.objectContaining` |
| `__tests__/file-size.test.ts` | 185 | `fail()` (3 usages) |
| `utils/contentProcessing.test.ts` | 152 | Pure assertions only |
| `worldplay/roomTransition.test.ts` | 132 | Pure assertions only |
| `services/backgroundService.spec.ts` | 89 | `jest.fn`, `as jest.Mock` (5), `expect.any` |
| `utils/streamUtils.test.ts` | 83 | `jest.fn`, `mockResolvedValue` |
| `components/__tests__/RichTextEditor.test.tsx` | 37 | `describe.skip` (BROKEN -- ts-jest JSX issue) |
| `utils/generateUUID.test.ts` | 35 | Pure assertions only |
| `components/__tests__/TabNavigation.test.tsx` | 25 | `describe.skip` (BROKEN -- ts-jest JSX issue) |

### Jest API Usage Summary

| API | Occurrences | Files |
|-----|-------------|-------|
| `jest.fn()` | 138 | 10 files |
| `jest.mock()` | 11 calls | 5 files |
| `toHaveBeenCalled*` | 39 | 10 files |
| `mockReturnValue` / `mockResolvedValue` / `mockImplementation` | 28 | 6 files |
| `as jest.Mock` type casts | 13 | 3 files |
| `jest.spyOn()` | 3 | 2 files |
| `jest.useFakeTimers()` / `jest.useRealTimers()` | 4 | 2 files |
| `jest.advanceTimersByTime()` | 3 | 1 file |
| `jest.runAllTimers()` | 7 | 1 file |
| `jest.clearAllMocks()` / `jest.resetAllMocks()` | 4 | 3 files |
| `fail()` | 3 | 1 file |
| `expect.objectContaining` / `expect.any` / `expect.stringContaining` | 17 | 6 files |
| `describe.skip` | 2 | 2 files |
| Snapshot tests | 0 | -- |
| Custom matchers (`expect.extend`) | 0 | -- |
| `jest.requireActual` | 0 | -- |

---

## API Mapping Table (Jest to Vitest)

Most Jest APIs have **drop-in Vitest equivalents**. The `jest` global becomes `vi`.

| Jest | Vitest | Notes |
|------|--------|-------|
| `jest.fn()` | `vi.fn()` | Identical API |
| `jest.mock('module', factory)` | `vi.mock('module', factory)` | Hoisted automatically in Vitest; see notes below |
| `jest.spyOn(obj, 'method')` | `vi.spyOn(obj, 'method')` | Identical API |
| `jest.useFakeTimers()` | `vi.useFakeTimers()` | Identical API |
| `jest.useRealTimers()` | `vi.useRealTimers()` | Identical API |
| `jest.advanceTimersByTime(ms)` | `vi.advanceTimersByTime(ms)` | Identical API |
| `jest.runAllTimers()` | `vi.runAllTimers()` | Identical API |
| `jest.clearAllMocks()` | `vi.clearAllMocks()` | Identical API |
| `jest.resetAllMocks()` | `vi.resetAllMocks()` | Identical API |
| `as jest.Mock` | `as Mock` (import from vitest) | `import { Mock } from 'vitest'` or use `vi.mocked()` |
| `mockReturnValue()` | `mockReturnValue()` | Same (on mock instances) |
| `mockResolvedValue()` | `mockResolvedValue()` | Same |
| `mockImplementation()` | `mockImplementation()` | Same |
| `fail(msg)` | `expect.unreachable(msg)` or `throw new Error(msg)` | `fail()` doesn't exist in Vitest; see Phase 2 notes |
| `describe` / `it` / `test` / `expect` | Same | Available as globals (configurable) |
| `describe.skip` / `it.skip` | Same | Identical API |
| `beforeEach` / `afterEach` / `beforeAll` / `afterAll` | Same | Identical API |
| `expect.any()` | `expect.any()` | Identical |
| `expect.objectContaining()` | `expect.objectContaining()` | Identical |
| `expect.stringContaining()` | `expect.stringContaining()` | Identical |
| `toHaveBeenCalled()` | `toHaveBeenCalled()` | Identical |
| `toHaveBeenCalledWith()` | `toHaveBeenCalledWith()` | Identical |
| `toHaveBeenCalledTimes()` | `toHaveBeenCalledTimes()` | Identical |

### Key Differences to Watch

1. **`vi.mock()` hoisting:** Vitest hoists `vi.mock()` calls to the top of the file automatically (like Jest), but the factory function cannot reference variables declared in the outer scope unless wrapped in `vi.hoisted()`. Several test files (e.g., `LocalMapStage.test.ts`) declare tracking variables like `createdTiles` before `jest.mock()` -- these may need `vi.hoisted()` wrappers.

2. **`fail()` removal:** Jest provides a global `fail()` via Jasmine. Vitest does not. The 3 usages in `file-size.test.ts` need replacement with `throw new Error(msg)` or a custom helper.

3. **`as jest.Mock` casts:** Replace with `vi.mocked(fn)` (type-safe wrapper) or `as Mock` with `import { Mock } from 'vitest'`. The `vi.mocked()` approach is preferred as it preserves the original function's type signature.

4. **`global.fetch = jest.fn()`:** Replace with `vi.stubGlobal('fetch', vi.fn())` or continue assigning directly (both work, but `vi.stubGlobal` auto-restores).

---

## Config Migration

### Current: `jest.config.cjs` + `tsconfig.test.json`

The Jest config uses `ts-jest` preset, jsdom environment, CSS/asset module mappers, and a dedicated `tsconfig.test.json` that forces CommonJS + old-style JSX.

### Target: `vitest.config.ts`

```typescript
/// <reference types="vitest/config" />
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    // Environment
    environment: 'jsdom',

    // Setup files (migrated from jest.setup.ts)
    setupFiles: ['./vitest.setup.ts'],

    // Test file patterns (same as Jest)
    include: ['src/**/*.{test,spec}.{ts,tsx}'],

    // Excluded paths (same as Jest testPathIgnorePatterns)
    exclude: [
      'node_modules',
      'src/__tests__/mockFactory.ts',
      'src/__tests__/msw/**',
      'src/utils/testHelpers/**',
    ],

    // Coverage
    coverage: {
      exclude: ['node_modules', '__mocks__'],
    },

    // Globals (optional: avoids needing `import { describe, it, expect } from 'vitest'`)
    globals: true,

    // CSS handling (replaces identity-obj-proxy)
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
}));
```

**What this inherits from `vite.config.ts`:**
- `@vitejs/plugin-react-swc` -- handles TSX/JSX transform (fixes the broken component tests)
- Path aliases (`@/`, `@features/`, `@shared/`, `@core/`) -- automatically available in tests
- No need for `moduleNameMapper` or `transform` config

### Setup File: `vitest.setup.ts`

Migrated from `jest.setup.ts`. Changes:
- Replace `jest.fn()` calls with `vi.fn()`
- Remove `require()` calls in favor of ESM imports (no more CommonJS workaround)
- Remove `@testing-library/jest-dom` import (not installed; add `@testing-library/jest-dom` to devDependencies if matchers are actually needed, or remove the dead import)
- TextEncoder/TextDecoder polyfills likely unnecessary with modern Node 22 + Vitest's jsdom, but can be kept as safety net

### TypeScript Config

- **Delete `tsconfig.test.json`** entirely. Vitest doesn't need a separate TS config -- it uses Vite's transform pipeline which reads `tsconfig.json` directly.
- Add `"types": ["vitest/globals"]` to `tsconfig.json` `compilerOptions` (if using `globals: true`).

---

## Migration Phases

### Phase 0: Preparation

**Goal:** Green baseline before any changes.

- [x] Run current Jest suite, record pass/fail baseline.
  - **Result:** All 22 suites FAIL — `jest.setup.ts` imports `@testing-library/jest-dom` which isn't installed. This is pre-existing, not a regression.
- [x] Verify which tests pass, which are skipped.
  - **Result:** 0 pass, 22 fail, all from the dead import. 2 `.tsx` tests are `describe.skip` but fail before reaching that point.
- [x] Git commit current state — no uncommitted test changes needed.

### Phase 1: Install and Configure Vitest

**Goal:** Vitest runs alongside Jest; no test files modified yet.

- [x] Install `vitest` + `@vitest/coverage-v8` (v4.1.0).

- [x] Create `frontend/vitest.config.ts` — extends `vite.config.ts` via `mergeConfig`, jsdom env, `globals: true`, CSS modules non-scoped.

- [x] Create `frontend/vitest.setup.ts` — migrated from `jest.setup.ts`:
  - `jest.fn()` → `vi.fn()`, `require()` → `await import()`, dead `@testing-library/jest-dom` import removed.

- [x] Add `test:vitest`, `test:vitest:watch`, `test:vitest:coverage` scripts to `package.json`.

- [x] Add `"types": ["vitest/globals"]` to `tsconfig.json`.

- [x] Verify Vitest starts and finds test files:
  - **Result:** 6 suites pass (pure-assertion tests), 2 skipped (`.tsx`), 13 fail with `jest is not defined` — expected, Phase 2 will fix.

### Phase 2: Migrate Test Files — COMPLETE

**Result:** 19 suites pass, 2 skipped, 457 tests green.

- [x] **Step 2a:** Global `jest.*` → `vi.*` replacement across 14 files. Added `import { vi } from 'vitest'` to each.
- [x] **Step 2b:** `as jest.Mock` → `as Mock` (imported from vitest) in backgroundService, koboldTransformer, CardAnimationController.
- [x] **Step 2c:** `fail()` → `throw new Error()` in file-size.test.ts (3 occurrences).
- [x] **Step 2d:** `vi.hoisted()` applied in LocalMapStage (createdTiles, createdEntityCards), EntityCardSprite (mockGraphicsInstance, mockTextInstance, mockSpriteInstance, mockBlurFilterInstance), TextureCache (loadCalls, loadShouldFail, loadDelay). Vitest quirk discovered: arrow functions in `vi.fn()` cannot be used with `new` — converted to `function` declarations for constructor mocks.
- [x] **Step 2e (partial):** EntityCardSprite — deleted `status badges`, `HP bar visibility`, `animation methods` blocks (12 inert tests removed). streamUtils — rewrote `createKoboldStreamWrapper` tests with real assertions on chunk data, DONE sentinel, and empty-stream behavior.
- [ ] **Step 2e (deferred):** CardAnimationController `not.toThrow()` assertions and LocalMapStage `toBeDefined()` assertions — weak but not vacuously true. Deferred to Phase 4.
- [x] **Step 2f:** `.tsx` tests left as `describe.skip` — they're placeholders with no real assertions. Un-skipping is Phase 4 work.
- [x] **Step 2g:** `global.fetch` → `vi.stubGlobal('fetch', vi.fn())` in backgroundService, thinFrameService, CharacterSource, koboldTransformer.

### Phase 3: Verify and Clean Up — COMPLETE

- [x] Full suite green: 19 passed, 2 skipped, 457 tests.
- [x] Deleted Jest artifacts: `jest.config.cjs`, `tsconfig.test.json`, `jest.setup.ts`, `jest.setup.console.js`.
- [x] Uninstalled: `jest`, `jest-environment-jsdom`, `ts-jest`, `@types/jest`, `identity-obj-proxy`. jsdom still available as transitive dep.
- [x] Updated `package.json` scripts: `test` → `vitest run`, `test:watch` → `vitest`, `test:coverage` → `vitest run --coverage`.
- [x] Updated `scripts/agent/health-check.sh`: detection pattern and command.
- [x] Updated `scripts/agent/test-scan.sh`: comment + mock density regex.
- [x] Updated `CLAUDE.md`: test runner docs.
- [x] Final verification: `npm test` → 19 passed, 2 skipped, 457 tests green.

### Phase 4: Post-Migration Improvements (optional)

Not required for the migration but enabled by it:

- [x] **Un-skip and implement `.tsx` component tests.**
  - TabNavigation: 7 tests — renders tabs, switches content, handles null data, verifies readOnly fields.
  - RichTextEditor: 5 tests — renders container, cursor styles for editable/readOnly, custom className, useEditor called with correct options. Tiptap mocked at boundary.
- [x] **Enable `@testing-library/jest-dom` matchers.** Installed `@testing-library/jest-dom` + `@testing-library/react`. Added `import '@testing-library/jest-dom/vitest'` to `vitest.setup.ts`.
- [x] **Strengthen weak CardAnimationController assertions.** Replaced 3 `not.toThrow()` tests with state/callback assertions.
- [ ] **In-source testing.** Vitest supports `if (import.meta.vitest)` blocks for unit tests co-located with source code.
- [ ] **Coverage thresholds.** Configure `coverage.thresholds` in `vitest.config.ts`.
- [ ] **Browser mode.** Vitest supports `@vitest/browser` for real-browser component tests instead of jsdom.

**Final result: 21 suites pass, 0 skipped, 469 tests green.**

---

## Self-Mocking Test Audit

Several tests mock their own data so heavily that the assertions validate the mock setup rather than production logic. These should be **rewritten or deleted** during Phase 2 rather than carried over — migrating a test that can't catch regressions is wasted effort.

### Critical — tests that survive deletion of the code under test

**`EntityCardSprite.test.ts`** — 3 describe blocks are inert:
- **Status badges** (lines 216-245): All 4 tests assert `expect(card).toBeDefined()` after calling badge-related methods. You could delete all badge rendering and every test still passes.
- **HP bar visibility** (lines 247-279): Calls `setShowHpBar(true/false)` then asserts the card object exists. The entire `setShowHpBar` implementation could be removed.
- **Animation methods** (lines 362-423): Every test asserts `typeof card.animateMoveTo === 'function'`. TypeScript compilation already guarantees this — zero behavioral coverage.

**`streamUtils.test.ts`** (lines 47-82) — `createKoboldStreamWrapper`:
- Key assertion: `expect(value || new Uint8Array()).toBeDefined()` — vacuously true since `new Uint8Array()` is always defined regardless of what `value` is.
- Remaining assertions only confirm mock functions were called, not that data flows correctly through the wrapper.

### Partial — weak assertions that dilute coverage

**`CardAnimationController.test.ts`** (lines 183-207):
- Movement/attack animation tests only assert `not.toThrow()`. Any reimplementation of the move/attack logic passes these unchanged.
- The rest of this file (damage flash, revival, incapacitation) is solid.

**`LocalMapStage.test.ts`** — scattered across the file:
- `expect(stage).toBeDefined()` (lines 293-305)
- `expect(() => ...).not.toThrow()` (lines 341-345, 816-826)
- `typeof pan.x === 'number'` (lines 674-685) — any number including 0 from an unimplemented stub passes
- The wiring tests (mock coordination between tiles/entities/particles) are legitimately useful.

### Recommended action per file

| File | Action | Rationale |
|------|--------|-----------|
| `EntityCardSprite.test.ts` | Delete inert blocks, keep highlight/constructor/getId tests | 3 describe blocks add zero coverage |
| `streamUtils.test.ts` | Rewrite `createKoboldStreamWrapper` test with real stream data assertions | Current test is vacuously true |
| `CardAnimationController.test.ts` | Replace `not.toThrow()` animation tests with sprite-state assertions | Methods exist but behavior is untested |
| `LocalMapStage.test.ts` | Replace `toBeDefined()`/`not.toThrow()` with state assertions | Keep the mock-coordination tests |

### Tests confirmed solid — migrate as-is

`AnimationManager`, `ContextCache`, `ContextSerializer`, `ContextAssembler`, `CharacterSource`, `thinFrameService`, `TextureCache`, `MapCamera`, `easing`, `roomTransition`, `contentProcessing`, `koboldTransformer`, `generateUUID`, `backgroundService`, `file-size` — all test real logic against real or appropriately-bounded data.

---

## Risk Areas and Mitigation

### Risk 1: `vi.mock()` Hoisting Breaks Variable References
**Severity:** Medium
**Files affected:** `LocalMapStage.test.ts` (most complex), `thinFrameService.test.ts`, up to 3 others
**Mitigation:** Use `vi.hoisted()` to declare variables that mock factories depend on. Test each file individually after migration. This is the most likely source of breakage.

### Risk 2: `fail()` Not Available
**Severity:** Low
**Files affected:** `file-size.test.ts` only (3 usages)
**Mitigation:** Replace with `throw new Error(msg)`. Semantically identical in test context.

### Risk 3: jsdom Behavioral Differences
**Severity:** Low
**Details:** Vitest uses the same `jsdom` package as Jest. The polyfills in `jest.setup.ts` for TextEncoder, ReadableStream, matchMedia, URL.createObjectURL should transfer directly. Node 22 may not even need most of them.
**Mitigation:** Keep polyfills in `vitest.setup.ts` initially, remove them one-by-one after verifying tests still pass.

### Risk 4: CSS Module Handling
**Severity:** Low
**Details:** Jest uses `identity-obj-proxy` to mock CSS imports. Vitest has built-in CSS handling with `css.modules.classNameStrategy`. If any test actually asserts on CSS class names (unlikely -- no such assertions found in the codebase), the behavior may differ.
**Mitigation:** Configure `css: false` in vitest config to skip CSS processing entirely, or use `css.modules.classNameStrategy: 'non-scoped'` for identity-like behavior.

### Risk 5: `__dirname` / `require()` in Setup File
**Severity:** Low
**Details:** `jest.setup.ts` uses `require('util')` and `require('node:stream/web')` -- CommonJS patterns that work under ts-jest's CJS transform but won't work in Vitest's ESM environment.
**Mitigation:** Replace with ESM `import` statements in `vitest.setup.ts`.

### Risk 6: Agent Scripts Reference Jest
**Severity:** Low
**Files affected:** `scripts/agent/health-check.sh`, `scripts/agent/test-scan.sh`
**Mitigation:** Update grep patterns and command invocations as part of Phase 3 cleanup.

---

## Rollback Plan

The migration is fully reversible at any point before Phase 3 cleanup:

1. **During Phase 1-2:** Jest config and test scripts remain untouched. Remove `vitest.config.ts`, `vitest.setup.ts`, and the `test:vitest*` scripts. Uninstall `vitest` and `@vitest/coverage-v8`. The project returns to its pre-migration state.

2. **After Phase 3 cleanup:** Restore from git. The migration should be done in a single commit (or a short branch) to make this trivial:
   ```bash
   git revert <migration-commit>
   npm install
   ```

**Recommendation:** Do the entire migration on a feature branch. Merge only after full green suite.

---

## File Change Summary

### Files to Create
- `frontend/vitest.config.ts`
- `frontend/vitest.setup.ts`

### Files to Modify
- `frontend/package.json` (scripts, devDependencies)
- `frontend/tsconfig.json` (add `"types": ["vitest/globals"]`)
- All 21 test files (`jest.*` -> `vi.*`)
- `scripts/agent/health-check.sh` (jest -> vitest references)
- `CLAUDE.md` (test runner documentation)

### Files to Delete
- `frontend/jest.config.cjs`
- `frontend/tsconfig.test.json`
- `frontend/jest.setup.ts`
- `frontend/jest.setup.console.js`
