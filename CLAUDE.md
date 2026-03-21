The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue.

## Core Values
1. I don't want to be right; I want to do right.
2. Be kind to future you.
3. Don't build systems that require diligence. Build systems that catch you when you're not diligent.
4. Half-measures are confusing to future agents — commit fully.
5. The agent doesn't know what it doesn't know. Build the check, don't trust the self-report.
6. Let friction drive the architecture, not speculation.

## Agent Utility Scripts (`scripts/agent/`) — CHECK THESE BEFORE MULTI-STEP TOOL CALLS

Bash scripts that collapse common multi-tool-call patterns into single invocations. **Before chaining 3+ tool calls for file reading, import tracing, grepping, or health checking, check if one of these scripts already does it.** Run via `bash scripts/agent/<script>.sh`.

| Script | Purpose | Usage |
|--------|---------|-------|
| `file-context.sh` | File content + resolved import signatures | `file-context.sh <path> [--no-imports]` |
| `codebase-snapshot.sh` | Project tree, git log, scripts, file counts | `codebase-snapshot.sh` |
| `related-files.sh` | Grep for term + imports/context per match | `related-files.sh <term> [dir]` |
| `git-context.sh` | Status, diffs, branch info for commits/PRs | `git-context.sh [base-branch]` |
| `health-check.sh` | tsc + jest + pytest (parallel) + git + TODO counts | `health-check.sh` |
| `trace-imports.sh` | Who imports a file/symbol (2-level) | `trace-imports.sh <file-or-symbol>` |
| `schema-dump.sh` | DB tables + API route map | `schema-dump.sh` |
| `test-scan.sh` | Test gap analysis + metrics | `test-scan.sh [--scope backend\|frontend\|all]` |
| `extract-interfaces.sh` | Type signature extraction | `extract-interfaces.sh <file-or-dir> [--awk]` |
| `read-docs.sh` | Vendor docs + Context7 pointers for post-cutoff packages | `read-docs.sh <package-or-phase>` |
| `context-validate.sh` | Validate CONTEXT.md file paths + API routes against live codebase | `context-validate.sh` |

Shared utilities live in `_common.sh` (project root detection, colors, `resolve_import()`, `extract_imports()`, `extract_signatures()`).

## Working Outside Training Data — Read Before You Write

Some installed packages are beyond the agent's May 2025 training cutoff. **Before writing code that touches an unfamiliar package, check if documentation exists.** The `health-check.sh` script will warn you about uncovered packages automatically.

```bash
bash scripts/agent/read-docs.sh <package>   # training familiarity + relevant docs + Context7 pointers
bash scripts/agent/read-docs.sh --audit     # scan all packages, flag what's undocumented
bash scripts/agent/read-docs.sh --index     # list all vendored docs
```

Docs live in `docs/vendor/` (migration) and `docs/vendor/reference/` (durable API reference). For packages not vendored, use Context7 MCP (`resolve-library-id` → `query-docs`). The cutoff registry in `read-docs.sh` defines what's known vs. unknown — update it when the agent's training data advances.

## Test Runners

- **Frontend:** Jest (`npm test` from `frontend/`). Config in `frontend/jest.config.cjs`. Uses `ts-jest` + `jsdom`.
- **Backend:** pytest (`pytest` from `backend/`). Python + FastAPI. Smoke tests in `backend/tests/smoke/` use in-memory SQLite with patched side effects.
- **Build:** `python build.py` generates `CardShark.spec` — never edit the spec directly.
- **Monolith gate:** `file-size.test.ts` fails if any source file exceeds 1000 lines (allowlist in the test file).