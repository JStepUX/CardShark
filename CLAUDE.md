The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue.

## System Architecture — CONTEXT.md

`CONTEXT.md` defines the system: tech stack, domain terms, API contracts, state machines, and invariants. **Read it before making assumptions about how the system works** — especially packaging (browser-served SPA, not Electron), persistence (PNG EXIF metadata, not a traditional DB for characters), or API structure. When your task involves architecture, cross-layer changes, or unfamiliar parts of the system, start there.

## Core Values
1. I don't want to be right; I want to do right.
2. Be kind to future you.
3. Don't build systems that require diligence. Build systems that catch you when you're not diligent.
4. Half-measures are confusing to future agents — commit fully.
5. The agent doesn't know what it doesn't know. Build the check, don't trust the self-report.
6. Let friction drive the architecture, not speculation.
7. Ship what you'd sign.

## Agent Utility Scripts (`scripts/agent/`) — CHECK THESE BEFORE MULTI-STEP TOOL CALLS

Bash scripts that collapse common multi-tool-call patterns into single invocations. **Before chaining 3+ tool calls for file reading, import tracing, grepping, or health checking, check if one of these scripts already does it.** Run via `bash scripts/agent/<script>.sh`.

| Script | Purpose | Usage |
|--------|---------|-------|
| `file-context.sh` | File content + resolved import signatures | `file-context.sh <path> [--no-imports]` |
| `codebase-snapshot.sh` | Project tree, git log, scripts, file counts | `codebase-snapshot.sh` |
| `related-files.sh` | Grep for term + imports/context per match | `related-files.sh <term> [dir]` |
| `git-context.sh` | Status, diffs, branch info for commits/PRs | `git-context.sh [base-branch]` |
| `health-check.sh` | tsc + vitest + pytest (parallel) + git + TODO counts | `health-check.sh` |
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

## KoboldCPP Template System — Dual-Path Assembly

`PromptAssemblyService._assemble_kobold()` dispatches to **two sub-methods** based on whether `template_format` is present:

- **`_assemble_kobold_instruct()`** — when a template is selected: wraps memory in template tokens, formats chat history with instruct tokens, uses template-derived stop sequences. The KoboldCPP `memory`/`prompt` split is preserved for truncation protection.
- **`_assemble_kobold_story()`** — when no template is selected: plain `Name: message` transcript, `***` separator, hardcoded story-mode stops. This is the legacy behavior.

**The template is not applied by KoboldCPP** — CardShark bakes all instruct tokens into the prompt string before sending to the native `/api/extra/generate/stream` endpoint. The `outputSequence` field in `templates.json` defines the open assistant turn (e.g., `<start_of_turn>model\n`). Empty `outputSequence` means "derive from `assistantFormat`," not "no prefix."

## Test Runners

- **Frontend:** Vitest (`npm test` from `frontend/`). Config in `frontend/vitest.config.ts`. Uses Vite's SWC pipeline + `jsdom`. **Mock stability warning:** When mocking React context hooks (e.g. `useAPIConfig`, `useSettings`) for components that use `useEffect`, the mock must return **stable object references** (define the mock data in module scope, not inline). React 18 concurrent mode will infinite-loop on fresh object refs from hook mocks, causing vitest to hang silently at "RUN" with no output.
- **Backend:** pytest (`pytest` from `backend/`). Python + FastAPI. Smoke tests in `backend/tests/smoke/` use in-memory SQLite with patched side effects.
- **Build:** `python build.py` generates `CardShark.spec` fresh each run.
- **Monolith gate:** `file-size.test.ts` fails if any source file exceeds 1000 lines (allowlist in the test file).