---
name: pre-commit-qa
description: >
  A mandatory quality gate that enforces test coverage, documentation,
  spec archival, and commit hygiene after any implementation work. Use this skill
  whenever code changes are complete and about to be committed — trigger on phrases
  like "I'm done", "ready to commit", "finished implementing", "task complete",
  "wrap up", "ship it", "PR ready", or any signal that implementation is finished
  and the work is moving toward version control. Also trigger when reviewing
  someone else's completed work before merge. This skill should fire even if the
  user doesn't explicitly ask for a quality check — if implementation just finished,
  this gate applies. Do NOT skip steps. Do NOT self-certify. Every item requires
  evidence.
---

# Pre-Commit Quality Assurance Gate

You just finished implementation work. Before anything gets committed, you must
walk through every item below and either demonstrate compliance or flag the gap.
No item is optional. No item is self-certifying — each requires you to show your
work (file paths, command output, diff snippets).

If you cannot satisfy an item, say so explicitly and explain why. Do not silently
skip items or claim compliance without evidence.

---

## 1. Test Coverage

Changes to code must have corresponding test coverage. The goal is to catch
regressions — if the code you just wrote were reverted or broken, at least one
test should fail.

**Rules:**
- Prefer real data over mocks. Mocks are acceptable only when external services
  make real data impractical (e.g., LLM API calls to OpenAI/Claude/KoboldCPP).
  If you reach for a mock, justify it.
- Every changed function or endpoint should have at least one test that exercises
  the new behavior.
- "Coverage" means behavioral coverage, not line-count coverage. A test that
  imports a module without asserting anything is not coverage.
- Backend tests go in `backend/tests/` (unit) or `backend/tests/smoke/` (integration).
  Frontend tests use Jest with files matching `*.test.ts` or `*.test.tsx`.

**Evidence required:** List the test files you created or modified, and for each,
state what behavior it validates. If no tests were written, explain why the
changes are exempt (e.g., documentation-only changes, config-only changes).

---

## 2. Test Execution

Tests must actually run and pass. Writing tests without executing them is worse
than not writing them — it creates false confidence.

**Commands:**
```bash
# Frontend (from frontend/)
npm test

# Backend (from backend/)
pytest
```

**Rules:**
- Run the full test suite, not just the new tests. Your changes may have broken
  something upstream.
- If any tests fail, fix them before proceeding. Do not commit with known
  failures unless explicitly agreed with the developer and documented in the
  commit message.

**Evidence required:** Paste or summarize the test runner output showing all
tests passing (or document agreed-upon exceptions).

---

## 3. Spec Archival

If this work was driven by a spec document (typically in `docs/delivery/` or
project root), the spec must be moved to `docs/ignored/` after completion.
This keeps the active spec directory clean for future work sessions and
preserves the spec as a historical artifact.

**Rules:**
- Only move the spec if the work described in it is fully complete — not
  partially done.
- The move should be a `git mv`, not a copy-and-delete, so history is preserved.
- If the spec was only partially completed, leave it in place and note which
  sections remain.

**Evidence required:** State the spec filename and confirm it was moved, or
confirm that no spec was driving this work.

---

## 4. Documentation Updates

The following project documents must be reviewed for necessary updates based on
the work just completed. "Reviewed" means you actually opened the file and
checked whether your changes require an update — not that you assumed they don't.

| Document | Path | Update when... |
|---|---|---|
| CLAUDE.md | `CLAUDE.md` | Something surprised you or would surprise a future agent |
| CONTEXT.md | `CONTEXT.md` | API contracts, state machines, domain terms, or entry points changed |
| Changelog | `CHANGELOG.md` | Any user-facing or developer-facing change (always) |
| README | `README.md` | Setup steps, dependencies, or project overview changed |
| Agent Scripts | `scripts/agent/` | Files moved/renamed, module patterns changed, or grep targets changed |
| Build Config | `build.py` | New dependencies, hidden imports, or data files needed in EXE |

**Rules:**
- CHANGELOG.md must always be updated. Every committed change gets a changelog
  entry. Use Keep-a-Changelog format (`### Added`, `### Changed`, `### Fixed`).
  Entries should be specific enough to be useful six months from now.
- CLAUDE.md is an observability layer — add entries when something about the
  codebase surprised you or would surprise a future agent. Don't document
  workarounds; flag the confusion so the root cause can be fixed.
- CONTEXT.md documents API contracts and state machines. If you added or changed
  endpoints, request/response shapes, or state transitions, update it.
- For agent utility scripts, "reviewed" means executed — not eyeballed. Run each
  script that could be affected by your changes and confirm it produces non-empty,
  plausible output. A script that silently returns nothing is worse than a missing
  script.
- For `build.py`: if you added Python packages or new data files that must ship
  in the PyInstaller EXE, add them to `hidden_imports` or `backend_datas`/
  `frontend_datas` in `create_spec_file()`. Never edit `CardShark.spec` directly.
- Do not add boilerplate entries. Documentation updates should be specific enough
  that a developer reading them six months from now understands what changed.

**Evidence required:** For each document, state whether it was updated or why it
was skipped.

---

## 5. Commit Hygiene

Work must be broken into logical, well-written, digestible commits. One giant
commit with "implemented feature X" is not acceptable.

**Rules:**
- Each commit should represent one logical unit of change. A good heuristic: if
  you'd struggle to write a clear, specific commit message, the commit is
  probably too broad.
- Commit messages should reference the relevant spec or ticket when one exists.
- Refactors, new features, tests, and documentation updates should generally be
  separate commits (unless they're so tightly coupled that separating them would
  make either commit non-functional).
- A commit should not touch more than ~15 files unless it's a rename, refactor,
  or migration. If it does, consider splitting it.

**Evidence required:** List the planned commits with their messages before
executing them. The developer should approve the commit plan.

---

## 6. Git Tracking

Before committing, verify the actual state of the working tree. Do not rely on
memory of what you changed — use git commands to confirm.

**Rules:**
- Run `git status` and `git diff --stat` to enumerate all modified, added, and
  deleted files. Compare this list against your mental model of what changed. If
  there are unexpected files, investigate before committing.
- Run `git diff` (or `git diff <file>`) on any file you're unsure about to
  verify the change is intentional and complete.
- Check for untracked files that should be staged (new source files, new test
  files) and files that should NOT be staged (`.env`, credentials, build
  artifacts, `CardShark.spec`, editor temp files, `__pycache__/`).
- Confirm no partial changes are left unstaged. If a file has both staged and
  unstaged changes, either stage the rest or stash it — mixed state leads to
  broken commits.
- Run `git log --oneline -3` to confirm you're building on the expected base
  commit and branch.

**Evidence required:** Paste or summarize the `git status` output. Flag any
surprises (unexpected files, missing files, files you expected to change but
didn't).

---

## Output Format

After walking through all six items, produce a summary table:

```
| # | Check                | Status | Notes                          |
|---|----------------------|--------|--------------------------------|
| 1 | Test Coverage        | ✅ / ❌ | [brief note]                  |
| 2 | Tests Executed       | ✅ / ❌ | [brief note]                  |
| 3 | Spec Archived        | ✅ / ⬜ | [⬜ = N/A, no spec]           |
| 4 | Docs Updated         | ✅ / ❌ | [which docs touched]          |
| 5 | Commit Plan Approved | ✅ / ❌ | [number of planned commits]   |
| 6 | Git Tracking         | ✅ / ❌ | [unexpected files? clean tree?]|
```

If any item is ❌, do not proceed to commit. Resolve the gap first.
