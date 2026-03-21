# Changelog

All notable changes to CardShark will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).
For earlier history, see `docs/docs/archivedOLD/CHANGELOG.md`.

---

## [Unreleased] - 2026-03-20

### Changed
- Moved agent utility scripts from `agent/` to `scripts/agent/` (all 8 scripts, `_common.sh` PROJECT_ROOT updated)
- Moved `README.md` from `docs/` to project root
- CLAUDE.md rewritten as observability layer (confusion traps, not documentation)
- `_common.sh`: added `extract_signatures()` (TypeScript) and `extract_python_signatures()` (Python) functions
- `health-check.sh`: description updated to reflect jest + pytest (not vitest)

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
