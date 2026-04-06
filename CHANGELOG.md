# Changelog

All notable changes to CardShark will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).
For earlier history, see `docs/docs/archivedOLD/CHANGELOG.md`.

---

## [Unreleased] - 2026-04-06

### Added
- **Unified instruct templates for KoboldCPP** — KoboldCPP now applies the selected instruct template (ChatML, Llama 3, Gemma, Mistral, etc.) to prompts, matching what all other providers already did. Template tokens are baked into the prompt string before sending to KoboldCPP's native endpoint, while preserving the memory/prompt split for truncation protection. When no template is selected, falls back to the original plain story-mode transcript for backward compatibility.
- **Google Gemma 4 template** — new template (`gemma4`) with `<|turn>system`/`<|turn>user`/`<|turn>model` tokens and dedicated system role support
- **Template schema: `systemSameAsUser` and `outputSequence` fields** — `systemSameAsUser` wraps system content in user tokens for models without a native system role (Gemma 2); `outputSequence` explicitly defines the open assistant turn prefix appended at the end of prompts
- **ThinkingTagFilter: Gemma 4 channel format** — streaming filter now strips `<|channel>thought...<channel|>` blocks in addition to `<think>`/`<thinking>` XML tags
- **Tests** — `test_unified_instruct_templates.py` (34 tests covering output sequence derivation, memory wrapping, systemSameAsUser, template-aware KoboldCPP assembly, legacy endpoint template threading, Gemma 4 thinking filter)

### Changed
- **Template system: all providers use the same formatting pipeline** — `_assemble_kobold()` now dispatches to `_assemble_kobold_instruct()` (template-aware) or `_assemble_kobold_story()` (fallback), eliminating the hard fork between KoboldCPP and instruct providers
- **Legacy endpoints template-aware** — `assemble_greeting`, `assemble_impersonate`, `assemble_room_content`, `assemble_thin_frame` now accept `template_format` and apply it for KoboldCPP when available
- **`_assemble_instruct` uses `outputSequence`** — generation stub now uses the template's output sequence instead of hardcoded `{char_name}:`, improving prompt format consistency for all providers
- **`outputSequence` backfilled** — all 14 built-in templates now have explicit `outputSequence` values

### Removed
- **`clean_memory()` in `kobold_prompt_builder.py`** — dead code; backend assembly bypasses it entirely

## [Previous] - 2026-03-21

### Added
- **Character Images: `is_default` column** — `character_images` table now tracks which secondary image is starred via `is_default` boolean; added in-place ALTER TABLE migration (no DB rebuild)
- **Character Images: set/clear default endpoints** — `PUT /api/character/{uuid}/images/{filename}/set-default` and `DELETE /api/character/{uuid}/images/default`
- **Character Images: shared context** — `CharacterImageContext` provides shared image state between SidePanel and CharacterImageGallery, eliminating drift between independent image lists
- **Tests** — `test_character_image_handler.py` (set/clear default, list includes is_default), `test_database_migrations.py` (ALTER TABLE idempotency), `test_chat_session_pruning.py` (age threshold prevents premature deletion)

### Fixed
- **Image Gallery: star no longer overwrites card PNG** — starring a secondary image sets a DB flag only; unstarring fully reverts to the original portrait. Previously, starring called `handleImageChange()` which permanently overwrote the card PNG, making unstar irreversible
- **Image Gallery: SidePanel stays in sync** — SidePanel and Info tab gallery now consume the same `CharacterImageContext`; uploads/deletes in either propagate to both immediately
- **Image Gallery: SidePanel resolves effective portrait** — when a secondary image is starred, SidePanel shows it as the main preview; when cleared, reverts to card PNG
- **Image Gallery: preview clears on character switch** — `selectedSecondaryImage` resets when `characterUuid` changes, preventing stale secondary-image URLs from one character leaking into another
- **Chat sessions: pruning age threshold** — `get_recent_chat_sessions` now only prunes sessions older than 1 hour with ≤1 message; previously pruned all such sessions regardless of age, causing a race condition that deleted brand-new sessions before the first message was saved
- **Database: non-destructive migration** — `is_default` column added via ALTER TABLE instead of schema version bump that would have deleted the entire database (including non-rebuildable chat history and world progress)
- **Combat: weapon null guards** — `getWeaponAPCost`, `doesWeaponEndTurn`, `getWeaponAttackRange` now use `!= null` (was `!== undefined`), fixing silent attack failures when weapon properties were explicitly `null`
- **Combat: inventory stacking** — `addItemToInventory` `stackCount` guard aligned to `!= null` for consistency
- **Combat: config constants wired** — `difficultMove` AP cost and `incapacitationChancePercent` in `gridCombatEngine.ts` now read from centralized config instead of hardcoded literals
- **Camera: pan mode stale closure** — `handleTileClick` in `LocalMapView` now reads `isPanModeRef.current` instead of stale `isPanMode` state, preventing movement during pan mode
- **Room transition: dep array** — `swapVisibleRoomState` had 3 phantom deps and was missing `clearBondedAlly`; fixed
- **Room transition: double-click guard** — `handleNavigate` now checks `isTransitioning` to prevent concurrent room transitions
- **Room transition: dead 'ready' phase** — removed `'ready'` from `TransitionPhase` (was set then immediately overwritten by `finally` block)
- **Session hydration: stale closure** — `hydrateFromWorldLoadResult` no longer captures mutable reducer state; null-coalescing moved into reducer's `hydrate` case
- **Inventory modal: missing deps** — `handleInventoryChange` now includes `setPlayerInventory`/`setAllyInventory` in useCallback deps
- **Timer leak** — `raceWithTimeout` now clears the timeout when the promise resolves first
- **Hydration: unmemoized callback** — `dismissMissingRoomWarning` wrapped in `useCallback`
- **DevTools: type narrowing** — `setLocalMapStateCache` param widened from `(state: null)` to `(state: LocalMapState | null)`
- **Companion stats: hardcoded HP** — `buildLocalMapCompanion` now uses `deriveGridCombatStats(playerLevel)` instead of hardcoded `level: 1, hp: 80`; allies scale with player level

### Removed
- Dead API surface `replaceRoomStates` and `snapshotRoomState` from `useWorldPlaySession` (exported but never consumed)
- Unused `setActiveNpcId`/`setActiveNpcName`/`setActiveNpcCard` props from `useRoomTransition` options

### Added
- Tests for `worldPlaySessionReducer` hydrate case (6 tests), `buildLocalMapCompanion` level scaling (6 tests), `raceWithTimeout` timer cleanup (3 tests)

### Changed
- **Tailwind CSS v3 → v4**: Migrated from Tailwind 3.3.5 to 4.2.2. Automated class renames across 88 component files (`outline-none`→`outline-hidden`, `bg-gradient-to-*`→`bg-linear-to-*`, `flex-grow`→`grow`, `shadow-sm`→`shadow-xs`, `bg-opacity-*`→opacity modifiers). Config moved from `tailwind.config.js` to CSS `@theme` block in `global.css`. PostCSS plugin updated to `@tailwindcss/postcss`; `autoprefixer` removed (now built-in).
- **Node.js minimum**: Now requires Node.js 20+ (Tailwind v4's Oxide engine dependency). Enforced via `engines` field in `frontend/package.json`.
- **Browser requirement note**: `start.py` now prints minimum browser versions (Chrome 111+, Firefox 128+, Safari 16.4+) at startup before opening the browser.

### Fixed
- **Dialog stacking**: Added `relative` to Dialog content wrapper so it renders above the backdrop overlay (Tailwind v4 CSS layer ordering change caused dialogs to appear behind the blackout)
- **Button `outline` variant**: Restored `'outline'` variant name after upgrade tool incorrectly renamed it to `'outline-solid'` (confused TypeScript string literal with CSS utility class)
- **Ring width on form controls**: Added explicit `focus:ring-2` to 14 checkbox/input elements across 12 files that relied on Tailwind v3's implicit 3px ring width default (v4 changed default to 1px)
- **Stale test fixtures**: Updated `session.test.ts` helpers to match current `TimeState` (dropped `currentPeriod`/`periodsPerDay`/`messagesPerPeriod`, added `messagesInDay`/`timeOfDay`/`lastMessageTimestamp`) and `CharacterInventory` (dropped `maxSlots`/`gold`, added `equippedWeapon`/`equippedArmor`) interfaces. Pre-existing type errors, not caused by migration.

### Removed
- `frontend/tailwind.config.js` — replaced by CSS `@theme` block in `global.css`
- `autoprefixer` devDependency — now handled internally by `@tailwindcss/postcss`

- **Migrated frontend test runner from Jest to Vitest** — 21 test files, 469 tests passing
  - `jest.*` → `vi.*` across all test files; `vi.hoisted()` for mock variable scoping
  - Deleted `jest.config.cjs`, `tsconfig.test.json`, `jest.setup.ts`; removed 5 Jest devDependencies
  - Created `vitest.config.ts` (extends `vite.config.ts`), `vitest.setup.ts`, `src/vitest.d.ts`
  - Installed `@testing-library/react` + `@testing-library/jest-dom`; wired jest-dom matchers
  - Un-skipped 2 `.tsx` component tests (were broken by ts-jest JSX conflict)
  - Deleted 12 inert EntityCardSprite tests (assertions validated mocks, not behavior)
  - Rewrote `createKoboldStreamWrapper` tests with real data assertions
  - Strengthened CardAnimationController weak assertions (`not.toThrow()` → state checks)
  - Updated `health-check.sh`, `test-scan.sh`, `test-adversary.md`, `test-auditor.md` for Vitest
- `CLAUDE.md`: test runner reference updated from Jest to Vitest

### Added
- `docs/vitest-migration-plan.md` — phased migration plan with self-mocking test audit
- `frontend/src/components/__tests__/TabNavigation.test.tsx` — 7 tests (tab rendering, switching, null data, readOnly)
- `frontend/src/components/__tests__/RichTextEditor.test.tsx` — 5 tests (container, cursor styles, className, useEditor config)

---

## [Unreleased] - 2026-03-20

### Changed
- Moved agent utility scripts from `agent/` to `scripts/agent/` (all 8 scripts, `_common.sh` PROJECT_ROOT updated)
- Moved `README.md` from `docs/` to project root
- CLAUDE.md rewritten as observability layer (confusion traps, not documentation)
- `_common.sh`: added `extract_signatures()` (TypeScript) and `extract_python_signatures()` (Python) functions
- `health-check.sh`: description updated to reflect jest + pytest

### Added
- `CHANGELOG.md` at project root (fresh start, archived history preserved)
- `docs/vendor/` and `docs/vendor/reference/` — post-cutoff package documentation structure
- `.claude/skills/pre-commit-qa/SKILL.md` — mandatory 6-point quality gate for pre-commit checks
- `.claude/agents/test-adversary.md` — adversarial test writer agent (Sonnet, targets boundary/error/edge/concurrency)
- `.claude/agents/test-auditor.md` — test quality auditor agent (Haiku, gap analysis with RED/YELLOW/GREEN classification)
- `scripts/agent/test-scan.sh` — test gap analysis for Python backend + Jest frontend
- `scripts/agent/extract-interfaces.sh` — type signature extraction (TypeScript AWK + Python signatures)
- `scripts/agent/read-docs.sh` — post-cutoff package awareness (scans npm + pip, Context7 pointers)
- `frontend/src/__tests__/file-size.test.ts` — monolith detector (1000-line limit, 5 grandfathered files)

### Fixed
- `read-docs.sh --audit`: no longer aborts on first package lookup miss (`set -euo pipefail` + grep interaction)
- `test-scan.sh`: backend coverage scan no longer reports false negatives (`ls | grep` replaced with `compgen -G`)
- `read-docs.sh`: cutoff registry corrected from `@vitejs/plugin-react` to `@vitejs/plugin-react-swc`
- `.gitignore` + `frontend/.gitignore`: removed rules that silently ignored `__tests__/`, `*.test.ts`, `jest*.*`, `__mocks__`, and `scripts/` — new test files were invisible to git
