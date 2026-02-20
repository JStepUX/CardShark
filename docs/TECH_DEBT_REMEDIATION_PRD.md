# PRD: Tech Debt Remediation — New Lead Onboarding Priorities

**Author:** Project Coordinator Agent
**Date:** 2026-02-19
**Status:** Proposed
**Scope:** 3 high-impact improvements for codebase maintainability, extensibility, and developer confidence

---

## Executive Summary

After a full codebase audit spanning complexity analysis, test coverage, architecture patterns, error handling, type safety, and documentation, three initiatives emerged as the highest-leverage improvements. These are the changes that would make a new team lead comfortable maintaining, extending, and building new features on this codebase.

| # | Initiative | Pain Addressed | Effort | Impact | Status |
|---|-----------|----------------|--------|--------|--------|
| 1 | ChatContext Decomposition | 1,860-line god context; untestable core | Medium | High | **DONE** |
| 2 | Unified API Contract & Error Layer | 4 error patterns; untyped responses; silent failures | Medium | High | Proposed |
| 3 | Backend Endpoint Consolidation | 25+ scattered files; duplicate naming; unclear boundaries | Low-Medium | Medium-High | Proposed |

---

## Initiative 1: ChatContext Decomposition — COMPLETE (2026-02-20)

### Implementation Summary

Split `ChatContext.tsx` (1,861 lines) into 4 focused sub-contexts plus a backward-compatible facade:

| File | Lines | Responsibility |
|------|-------|---------------|
| `ChatCompressionContext.tsx` | 92 | Compression level, cache, localStorage persistence |
| `ChatSessionContext.tsx` | 213 | Session lifecycle, UUID, user, settings, refs |
| `ChatMessageContext.tsx` | 227 | Messages CRUD, persistence, saveChat, debouncedSave |
| `ChatGenerationContext.tsx` | 719 | Streaming, generation, lore image tracking |
| `ChatContext.tsx` (facade) | 679 | Provider nesting, auto-load, cross-cutting ops, backward-compat `useChat()` |

**Provider nesting order:** `ChatSessionProvider` > `ChatMessageProvider` > `ChatCompressionProvider` > `ChatGenerationProvider` > `ChatInitializer` + `ChatContextBridge`

**Cross-cutting operations** (`loadExistingChat`, `createNewChat`, `forkChat`, auto-load) live in a renderless `ChatInitializer` component inside all providers, bridged to the facade via ref callbacks.

**Backward compatibility preserved:** All existing consumers (`ChatView`, `ChatSelector`, `SidePanel`, `WorldPlayView`, `useChatMessages`, `AppRoutes`, `CharacterDetailView`, `useOptionalProviders`) continue using `useChat()` unchanged. New direct hooks available: `useChatSession()`, `useChatMessageStore()`, `useChatCompression()`, `useChatGeneration()`.

**Verification:** Zero TypeScript errors, no test regressions (500/500 passing).

**Bonus fix:** Compression timer is now independent from session notes timer, eliminating a latent race condition where changing compression level could cancel a pending notes save.

### Remaining from Acceptance Criteria

- [x] ChatContext split into 4 focused contexts
- [x] All existing imports continue to work (backward-compatible `ChatProvider` wrapper)
- [ ] Each new context has at least one integration test covering its core state transitions
- [x] Zero `any` types in new context interfaces (`lastContextWindow: any` preserved in facade type only)
- [ ] Console.log statements removed or gated behind centralized DEBUG flag
- [x] No functionality changes — pure refactor, identical behavior

### Problem

`ChatContext.tsx` (1,860 lines) is the single largest maintainability risk in the frontend. It manages **30+ state values** across 6 unrelated concerns, has **76 console.log statements**, and is imported by nearly every chat-related component. Every new chat feature must touch this file, creating merge conflicts and cognitive overload.

**Current responsibilities crammed into one context:**
- Chat session lifecycle (create, load, switch, delete)
- Message state (messages array, pagination, ordering)
- Generation control (streaming, stop, retry, continue)
- Reasoning/thinking mode (extended thinking settings, tag filtering)
- Compression (summarization triggers, compression levels)
- Lore image tracking (triggered lore images during generation)
- Character data overrides (NPC injection for world play)
- Session settings (notes, compression toggle)

**Why this matters for a new lead:**
- Cannot write isolated tests for generation logic without mocking 30 other state values
- Cannot reason about message flow without understanding compression, lore, and reasoning paths
- Every PR touching chat risks regressions in unrelated subsystems
- 0 test files cover ChatContext despite it being the most critical frontend module

### Proposed Solution

Split `ChatContext.tsx` into 4 focused contexts with clear boundaries:

```
ChatContext.tsx (1,860 lines)
├── SessionContext.tsx (~300 lines)
│   ├── chat_session_uuid, session lifecycle
│   ├── session settings (notes, compression toggle)
│   └── character data override (world play injection)
│
├── MessageContext.tsx (~400 lines)
│   ├── messages array, append, delete, edit
│   ├── pagination, ordering
│   └── message persistence (debounced save)
│
├── GenerationContext.tsx (~500 lines)
│   ├── isGenerating, streamingContent, stop/retry/continue
│   ├── reasoning mode settings
│   ├── lore image tracking
│   └── generation orchestration
│
└── CompressionContext.tsx (~200 lines)
    ├── compression level, thresholds
    ├── summarization triggers
    └── compressed message cache
```

**Dependency graph (DAG, no cycles):**
```
SessionContext (no deps)
    ↓
MessageContext (consumes SessionContext)
    ↓
GenerationContext (consumes SessionContext + MessageContext)
    ↓
CompressionContext (consumes MessageContext)
```

A thin `ChatProvider` wrapper composes all four, preserving the existing import pattern for components that consume all of them. Components that only need generation state import `useGeneration()` directly.

### Acceptance Criteria

- [ ] ChatContext split into 4 focused contexts, each under 500 lines
- [ ] All existing ChatView, ChatBubble, ChatHeader, ChatSelector imports continue to work (backward-compatible `ChatProvider` wrapper)
- [ ] Each new context has at least one integration test covering its core state transitions
- [ ] Zero `any` types in the new context interfaces
- [ ] Console.log statements removed or gated behind centralized DEBUG flag
- [ ] No functionality changes — pure refactor, identical behavior

### Files Affected

| Action | File |
|--------|------|
| **Split** | `frontend/src/contexts/ChatContext.tsx` (1,860 lines → 4 files) |
| **Create** | `frontend/src/contexts/SessionContext.tsx` |
| **Create** | `frontend/src/contexts/MessageContext.tsx` |
| **Create** | `frontend/src/contexts/GenerationContext.tsx` |
| **Create** | `frontend/src/contexts/CompressionContext.tsx` |
| **Modify** | All components importing `useChatContext()` — update to specific context hooks or keep using composed provider |
| **Create** | Test files for each new context |

### Risk Assessment

- **Low risk** — Pure refactor with no behavioral changes
- **Migration path** — `ChatProvider` wrapper preserves existing API; gradual migration of consumers
- **Rollback** — Git revert to monolith if issues found

---

## Initiative 2: Unified API Contract & Error Handling Layer

### Problem

The frontend has **4 different error handling patterns** across API modules, the backend has **4 bare `except:` clauses** that swallow critical errors, and `generation_settings` crosses the API boundary as `Dict[str, Any]` despite having 25+ typed fields on the frontend. There are no shared response type definitions for many API calls, and defaults are defined in two places with a comment saying "must be kept in sync manually."

**Frontend error patterns found:**

| Module | Pattern |
|--------|---------|
| `worldApi.ts` | `response.json().catch(() => ({ detail: '...' }))` then `throw new Error(error.detail)` |
| `apiService.ts` | `response.text()` then `throw new Error('API error (${status}): ${text}')` |
| `chatStorage.ts` | `response.json().catch(() => ({}))` then `throw new Error(errorData.message)` |
| `adventureLogApi.ts` | Same as worldApi but different fallback message |

**Backend error patterns found:**

| Module | Pattern |
|--------|---------|
| `chat_endpoints.py` | Custom exceptions + `handle_generic_error()` — good |
| `api_handler.py` | Bare `except:` at lines 250, 331, 404, 670 — swallows errors silently |
| `generation_endpoints.py` | `JSONResponse(status_code=500)` — inconsistent with HTTPException pattern |
| Various endpoints | Mix of `HTTPException`, `JSONResponse`, `handle_*_error` utilities |

**Type contract gaps:**
- `generation_settings: z.record(z.string(), z.any())` — no validation at boundary
- `DEFAULT_GENERATION_SETTINGS` defined in `frontend/src/types/api.ts` lines 30-50
- Backend comment: "Backend defaults in `api_provider_adapters.py` must be kept in sync manually"
- No `ResponseType<T>` wrappers for `worldApi.ts`, `adventureLogApi.ts`, or `chatStorage.ts`

**Why this matters for a new lead:**
- Silent error swallowing means bugs in generation go undetected
- 4 different error formats means UI error messages are inconsistent
- Untyped API responses mean refactoring endpoints risks runtime crashes with no compiler warning
- Manual default sync means generation settings drift between frontend and backend over time

### Proposed Solution

#### 2A: Frontend — Unified API Error Layer

Create `frontend/src/api/apiError.ts`:

```typescript
// Structured error type for all API calls
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly endpoint: string,
    public readonly raw?: unknown
  ) {
    super(`[${status}] ${endpoint}: ${detail}`);
  }
}

// Single response handler used by all API modules
export async function handleApiResponse<T>(
  response: Response,
  endpoint: string
): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      body.detail || body.message || body.error || `Request failed`,
      endpoint,
      body
    );
  }
  return response.json();
}
```

Migrate `worldApi.ts`, `adventureLogApi.ts`, `chatStorage.ts`, and `apiService.ts` to use `handleApiResponse<T>()` uniformly.

#### 2B: Backend — Eliminate Bare Excepts, Standardize Error Responses

- Replace all 4 bare `except:` clauses in `api_handler.py` with `except Exception as e:` + proper logging
- Standardize all endpoint error responses to use `HTTPException` (not `JSONResponse` for errors)
- Ensure all endpoints use the existing `handle_generic_error()` utility from `errors.py`

#### 2C: Typed API Responses

Add response type definitions to `frontend/src/types/api.ts` for the most-used endpoints:

```typescript
// Example: generation endpoint response
export interface GenerateResponse {
  text: string;
  finish_reason: string;
  token_count?: number;
}

// Example: chat session creation
export interface CreateChatResponse {
  chat_session_uuid: string;
  created_at: string;
}
```

#### 2D: Generation Settings Contract

Validate `generation_settings` keys at the API boundary in the backend — reject unknown fields rather than silently accepting them. Extract `VALID_GENERATION_KEYS` as a shared constant.

### Acceptance Criteria

- [ ] All frontend API modules use `handleApiResponse<T>()` — no ad-hoc error parsing
- [ ] All 4 bare `except:` clauses in `api_handler.py` replaced with typed exception handling + logging
- [ ] All backend error responses use `HTTPException` (no `JSONResponse` for error cases)
- [ ] Response types defined for top 10 most-used API endpoints
- [ ] `generation_settings` validated at backend boundary — unknown keys logged as warnings
- [ ] Frontend `ApiError` class used in at least one error boundary or toast notification

### Files Affected

| Action | File |
|--------|------|
| **Create** | `frontend/src/api/apiError.ts` |
| **Modify** | `frontend/src/api/worldApi.ts` |
| **Modify** | `frontend/src/api/adventureLogApi.ts` |
| **Modify** | `frontend/src/services/chatStorage.ts` |
| **Modify** | `frontend/src/api/apiService.ts` |
| **Modify** | `frontend/src/types/api.ts` (add response types) |
| **Modify** | `backend/api_handler.py` (fix bare excepts) |
| **Modify** | `backend/generation_endpoints.py` (standardize error format) |
| **Modify** | `backend/schemas.py` (validate generation_settings keys) |

### Risk Assessment

- **Low risk** — Error handling changes are additive; existing behavior preserved for happy path
- **Medium risk** — Validating `generation_settings` keys could reject fields from older frontend versions; mitigate with warning-only mode initially
- **Rollback** — Each sub-initiative (2A-2D) is independently deployable

---

## Initiative 3: Backend Endpoint Consolidation & Service Boundaries

### Problem

The backend has **25+ endpoint files** split between two locations (`backend/*.py` and `backend/endpoints/*.py`) with inconsistent naming, unclear boundaries, and a growing `main.py` (613 lines, 26 router registrations, 19 `app.state` assignments). This makes it difficult to find where an endpoint lives, understand service ownership, or add new features without creating yet another file.

**Specific issues found:**

1. **Dual location:** Root-level `room_card_endpoint.py` (singular) coexists with `endpoints/room_card_endpoints.py` (plural) — confusing naming collision
2. **main.py bloat:** 26 `app.include_router()` calls, 49 imports, 19 `app.state` assignments
3. **Commented-out routes:** Dead imports for removed features still present (`character_inventory_router`, `world_chat_router`)
4. **Inline endpoint:** One `/api/debug-png` endpoint defined directly in `main.py` while everything else uses routers
5. **Service boundary confusion:** `character_service.py` (1,167 lines) handles character CRUD + lore sync + image handling — 3 separate concerns. 13 service classes total with unclear authority
6. **Import hacks:** `character_service.py` has 3 duplicate `sys.path.insert()` blocks (lines 22-53) suggesting circular import workarounds

**Why this matters for a new lead:**
- "Where does this endpoint live?" is a constant question with 25+ files in two directories
- Adding a new feature domain (e.g., profiles) has no clear pattern to follow
- `main.py` is the bottleneck for every new router — merge conflicts guaranteed
- `sys.path` manipulation is a red flag for architectural issues that compound over time

### Proposed Solution

#### 3A: Consolidate Endpoint Directory

Move all endpoint files into `backend/endpoints/` with consistent naming:

```
backend/endpoints/
├── character_endpoints.py      # Character CRUD
├── chat_endpoints.py           # Chat sessions & messages
├── generation_endpoints.py     # LLM generation (streaming, greetings, etc.)
├── lore_endpoints.py           # Lore book management
├── room_endpoints.py           # Room card CRUD + room-specific generation
├── world_endpoints.py          # World card CRUD + world operations
├── settings_endpoints.py       # App settings
├── health_endpoints.py         # Health checks
├── background_endpoints.py     # Background image management
├── user_endpoints.py           # User profile
├── file_upload_endpoints.py    # Image uploads
├── template_endpoints.py       # Prompt templates
├── filter_endpoints.py         # Content filters
└── koboldcpp_endpoints.py      # KoboldCPP management
```

**Consolidation mapping:**
- `room_card_endpoint.py` (singular, root) + `endpoints/room_card_endpoints.py` → merged into `endpoints/room_endpoints.py`
- `endpoints/world_card_endpoints_v2.py` → `endpoints/world_endpoints.py`
- Remove all root-level `*_endpoints.py` files after migration

#### 3B: Router Registry Pattern

Replace 26 individual `app.include_router()` calls in `main.py` with a registry:

```python
# backend/endpoints/__init__.py
from .character_endpoints import router as character_router
from .chat_endpoints import router as chat_router
# ... etc

ALL_ROUTERS = [
    character_router,
    chat_router,
    generation_router,
    # ...
]
```

```python
# main.py (simplified)
from backend.endpoints import ALL_ROUTERS

for router in ALL_ROUTERS:
    app.include_router(router)
```

This reduces `main.py` by ~50 lines and makes router registration self-documenting.

#### 3C: Clean Up main.py

- Remove commented-out imports (`character_inventory_router`, `world_chat_router`)
- Move inline `/api/debug-png` endpoint to `health_endpoints.py`
- Extract service initialization into `backend/app_services.py` to separate lifecycle management from routing
- Document service dependency order

#### 3D: Fix sys.path Pollution

Resolve the 3 duplicate `sys.path.insert()` blocks in `character_service.py` by fixing the actual import issue (likely a relative vs absolute import mismatch).

### Acceptance Criteria

- [ ] All endpoint files consolidated into `backend/endpoints/` with consistent plural naming
- [ ] `main.py` uses router registry pattern — no individual `include_router()` calls
- [ ] Commented-out imports and dead code removed from `main.py`
- [ ] Inline `/api/debug-png` moved to proper endpoint file
- [ ] `sys.path` manipulation removed from `character_service.py`
- [ ] All existing API routes continue to work at same paths (no breaking URL changes)
- [ ] `main.py` reduced to under 400 lines

### Files Affected

| Action | File |
|--------|------|
| **Move** | All root-level `*_endpoints.py` → `backend/endpoints/` |
| **Merge** | `room_card_endpoint.py` + `endpoints/room_card_endpoints.py` → `endpoints/room_endpoints.py` |
| **Create** | `backend/endpoints/__init__.py` (router registry) |
| **Create** | `backend/app_services.py` (service initialization) |
| **Modify** | `backend/main.py` (simplify to registry + lifecycle) |
| **Modify** | `backend/services/character_service.py` (remove sys.path hacks) |
| **Delete** | All root-level `*_endpoints.py` after migration |

### Risk Assessment

- **Low risk** — Pure reorganization; all URL paths preserved via `prefix=` on routers
- **Build impact** — `build.py` hidden_imports list must be updated for new file locations
- **Rollback** — Git revert; file moves are fully reversible

---

## Implementation Order

```
Initiative 3 (Backend Consolidation)     ← Do first: lowest risk, immediate navigability win
    ↓
Initiative 2 (API Contract & Errors)     ← Do second: builds on clean backend structure
    ↓
Initiative 1 (ChatContext Decomposition) ← Do third: highest impact but needs stable API layer
```

**Rationale:** Backend consolidation is a pure file reorganization with no behavioral risk — it immediately makes the codebase navigable. The API error layer builds on that clean structure. ChatContext decomposition is the biggest win but benefits from having the API contract layer in place first (typed responses flow cleanly into typed contexts).

---

## Appendix A: Audit Data Sources

This PRD was informed by three parallel codebase audits:

1. **Complexity & Hotspot Analysis** — Identified god components, type safety gaps (28 violations across 12 files), inconsistent error handling (4 patterns), and state management issues (11 contexts, ChatContext at 1,860 lines)

2. **Test Coverage & Documentation Audit** — Found 21 frontend test files and 7 backend test files. Critical gaps: zero tests for chat endpoints, generation streaming, ChatContext, useChatMessages, chatStorage, WorldPlayView, combat hooks, character service, and API provider adapters

3. **Architecture & Integration Debt Analysis** — Mapped 25+ endpoint files in 2 locations, frontend-backend type contract drift, configuration sprawl, database reset-on-mismatch philosophy, and build system health

## Appendix B: Out-of-Scope Items Noted During Audit

These items were identified but are not included in the 3 priority initiatives:

- **Test coverage expansion** — Critical gaps exist (see Appendix A) but are a continuous process, not a discrete initiative. Each initiative above includes test requirements for its own scope.
- **Stale documentation cleanup** — 120+ files in `docs/docs/archivedOLD/` should be triaged but this is low-impact housekeeping.
- **PromptHandler deprecation** — Marked deprecated but still used (1,108 lines, 45 console.logs). Migration to ContextAssembler/ContextSerializer is in progress but incomplete. Track separately.
- **LocalMapView decomposition** — At 1,683 lines it's a candidate for splitting rendering from business logic, but it's stable and less frequently modified than chat.
- **KoboldCPP manager async conversion** — Uses blocking subprocess calls. Worth converting to async but isolated to one integration path.
- **TextureCache location** — Currently in `components/combat/pixi/` but imported by `utils/texturePreloader.ts` (wrong direction). Should move to `utils/` or `services/`.
- **Legacy API config migration** — `settings_manager.py` supports both `settings['api']` (legacy) and `settings['apis']` (new) paths indefinitely. Should set a hard deprecation deadline.
