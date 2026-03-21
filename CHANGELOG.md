# Changelog

All notable changes to CardShark will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).
For earlier history, see `docs/docs/archivedOLD/CHANGELOG.md`.

---

## [Unreleased] - 2026-03-21

### Fixed
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
