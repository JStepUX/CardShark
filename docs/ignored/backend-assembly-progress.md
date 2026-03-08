# Backend Prompt Assembly — Progress

**Date:** 2026-03-08
**Status:** Phase 1 COMMITTED · Phase 2 COMPLETE · Phase 3 COMPLETE · Phase 4 COMPLETE · Phase 5 COMPLETE

## What Was Done

Implemented Phase 1 of the prompt assembly migration: the backend now owns complete prompt construction for ALL providers when `backend_assembly: true` is set in the generation payload. This eliminates the split-brain where non-KoboldCPP used the frontend's prompt and KoboldCPP rebuilt from scratch.

### Files Changed

| File | Change | Lines |
|------|--------|-------|
| `backend/services/prompt_assembly_service.py` | **NEW** | ~420 lines |
| `backend/api_handler.py` | Added `backend_assembly` branch | +115 / -0 (net, legacy code re-indented) |
| `frontend/src/services/generation/generationService.ts` | Added new payload fields | +21 / -7 |

### New: `prompt_assembly_service.py`

Single source of truth for prompt construction. Key components:

- **`PromptAssemblyService.assemble()`** — Main entry point. Takes raw ingredients (character_data, chat_history, template_format, compression_level, session_notes, etc.) and returns `AssemblyResult(prompt, memory, stop_sequences, debug_info)`.

- **Field expiration** — Ported from frontend `ContextSerializer.ts`. `FIELD_EXPIRATION_CONFIG` defines when character card fields (scenario, mes_example, first_mes) expire based on compression level and message count. `compute_excluded_fields()` replaces the frontend's manual excluded_fields computation.

- **Two assembly paths, one service:**
  - `_assemble_instruct()` — For non-KoboldCPP: template-based history formatting, `[Session Notes]` wrapper, system_instruction prepended to memory, `</s>` stop sequence.
  - `_assemble_kobold()` — For KoboldCPP: reuses existing `kobold_prompt_builder.py` functions (`fold_system_instruction`, `build_story_prompt`, `build_story_stop_sequences`). Raw post-history passed to `build_story_prompt()` which wraps it in `[...]`.

- **Reuses existing backend code:** `LoreHandler.build_memory()` (unchanged), `kobold_prompt_builder.py` functions (unchanged). No duplication.

### Modified: `api_handler.py`

Added a feature-flagged branch in `stream_generate()` after lore matching:

```
lore matching (unchanged)
    ↓
if backend_assembly:
    → PromptAssemblyService.assemble()
    → loads session_notes from DB
    → extracts compressed_context from frontend prompt (Phase 1 compat)
    → sets prompt, memory, stop_sequence
else:
    → legacy path (unchanged, re-indented under if-block)
    ↓
adapter call (unchanged)
```

The legacy path is preserved exactly as-is for backward compatibility. Old frontends without `backend_assembly` continue to work.

### Modified: `generationService.ts`

Added to the payload:
- `generation_params.backend_assembly: true` — Feature flag
- `generation_params.compression_level` — So backend can compute field expiration
- `generation_params.message_count` — For field expiration thresholds
- `api_config.template_format` — Active template's formatting fields (`userFormat`, `assistantFormat`, `systemFormat`, `memoryFormat`, `stopSequences`)

Frontend still builds the prompt locally (for Context Window Modal display and as fallback). Backend ignores the frontend `prompt` field when `backend_assembly` is true.

## Test Results

```
Backend:  99 passed, 0 failed
Frontend: 475 passed, 6 skipped, 0 failed
TypeScript: clean compilation (tsc --noEmit)
Python: clean compilation (py_compile)
```

Custom integration tests for `PromptAssemblyService`:
- Instruct mode: template formatting, post-history wrapping, stop sequences, ghost suffix
- KoboldCPP mode: story-mode prompt, system instruction folding, `***` separator, clean stops
- Field expiration: aggressive compression correctly excludes scenario/mes_example/first_mes
- Edge cases: no character data (assistant mode), empty chat history

## What's NOT Done Yet (Future Phases)

- **Phase 2:** Move compression to backend (currently still frontend-side; backend extracts compressed summary from the frontend's prompt string as a bridge)
- **Phase 3:** Backend loads chat history from SQLite (currently frontend still sends `chat_history` in payload)
- **Phase 4:** Unify legacy endpoints (greeting, impersonate, room content, thin frame)
- **Phase 5:** Delete dead frontend code (compressionService, ContextSerializer memory building, contextBuilder, etc.)

## How to Verify

1. **Quick syntax check:**
   ```bash
   python -c "import py_compile; py_compile.compile('backend/services/prompt_assembly_service.py', doraise=True)"
   python -c "import py_compile; py_compile.compile('backend/api_handler.py', doraise=True)"
   cd frontend && npx tsc --noEmit
   ```

2. **Run test suites:**
   ```bash
   cd backend && pytest
   cd frontend && npm test -- --watchAll=false
   ```

3. **Manual E2E test:** Start the app (`python start.py`), chat with a character. The frontend now sends `backend_assembly: true` — check backend logs for `"Backend assembly complete"` messages. Compare generation quality against previous behavior.

4. **Disable feature flag:** To revert to legacy behavior without reverting code, remove `backend_assembly: true` from the payload in `generationService.ts:476`. The backend falls through to the unchanged legacy path.

## Architecture Notes

- **Session notes from DB:** The backend now loads session notes directly from the `chat_sessions` table instead of relying on the frontend to embed them in the prompt string. DB value takes precedence over any frontend-sent value.

- **Compressed context bridge:** During Phase 1, compression still runs on the frontend. The backend extracts the compressed summary from the frontend's prompt using `extract_block('[Previous Events Summary]', '[End Summary')`. This bridge will be removed in Phase 2 when compression moves server-side.

- **Template format in payload:** Rather than sharing a template JSON file between frontend and backend (which would require build system changes), the frontend sends the active template's formatting fields in `api_config.template_format`. This is simpler for Phase 1; Phase 3+ can move to shared template files if desired.

## Commit History

- **Phase 1:** `76d00bb` — Backend prompt assembly service: unified server-side prompt construction for all providers, gated by backend_assembly flag
- **Phase 2:** `pending` — Backend compression service: server-side context compression with per-session caching, replacing Phase 1 extract_block bridge
- **Phase 3:** `pending` — Backend loads chat history from SQLite: eliminates large payload transfers for normal generation
- **Phase 4:** `pending` — Unify legacy endpoints: greeting, impersonate, room content, thin frame routed through PromptAssemblyService
- **Phase 5:** `pending` — Delete dead frontend code: compressionService.ts, compression UI plumbing, dead generation pipeline parameters

### Review fixes included in Phase 1 commit
- Removed duplicate ConnectionError SSE yield in `api_handler.py` (was sending error event twice)
- Added `session_notes` to frontend payload as fallback when DB lookup fails
- Removed redundant `.replace()` calls subsumed by `re.sub(IGNORECASE)` in two locations
- Narrowed `except Exception` to re-raise `ImportError`/`ModuleNotFoundError` in `_build_memory`
- Removed unnecessary type cast for `_generation_type` access

---

## Phase 2: Move Compression to Backend

**Status:** COMPLETE

**Goal:** Compression currently runs on the frontend (`compressionService.ts`). Move it server-side so the backend owns the full prompt pipeline. Remove the Phase 1 bridge that extracts compressed context from the frontend's prompt string.

**Depends on:** Phase 1 (done)

### Files Changed

| File | Change | Lines |
|------|--------|-------|
| `backend/services/compression_service.py` | **NEW** | ~240 lines |
| `backend/api_handler.py` | Replaced Phase 1 bridge with CompressionService call | +18 / -10 |
| `frontend/src/services/generation/generationService.ts` | Skip frontend compression (backend owns it) | +10 / -10 |
| `backend/tests/test_compression_service.py` | **NEW** | ~290 lines (17 tests) |

### New: `compression_service.py`

Server-side compression with per-session caching. Mirrors the frontend's `orchestrateCompression()` logic.

- **`CompressionService.compress_if_needed()`** — Main entry point. Takes chat_history, compression_level, message_count, api_config, character/user names, session UUID. Returns `CompressionResult(compressed_context, messages_for_formatting)`.

- **Decision logic** — Same thresholds as frontend: `COMPRESSION_THRESHOLD=20` (don't compress below), `RECENT_WINDOW=10` (keep verbatim), `COMPRESSION_REFRESH_THRESHOLD=20` (re-compress stale cache).

- **LLM call** — Uses `requests.post` (sync, non-streaming) directly with the adapter's `prepare_headers()` and provider-specific endpoint/payload construction. Same compression prompt as frontend (past tense, third person, preserve key events/decisions/relationships/facts).

- **Per-session cache** — In-memory dict keyed by `chat_session_uuid`. Cache validity: same compression_level + message count within refresh threshold. Stale GC available via `gc_stale_sessions()`.

- **Provider support** — KoboldCPP (`/api/generate` non-streaming), OpenAI/OpenRouter/Featherless/Ollama (chat completions with `stream=false`), Claude (messages API with `stream=false`).

- **Failure handling** — On LLM error or timeout, returns empty compressed_context and full chat_history (graceful degradation).

### Modified: `api_handler.py`

- **Replaced Phase 1 bridge:** The `extract_block('[Previous Events Summary]', '[End Summary')` call that extracted compressed context from the frontend's prompt string is replaced with `self.compression_service.compress_if_needed()`.

- **CompressionService singleton:** Lazy-initialized on `ApiHandler` via a property, same lifecycle as the handler.

- **History trimming fix:** Phase 1 passed ALL messages to the assembler even when compression was active (the compressed summary was redundant with the full history). Phase 2 fixes this: `compression_result.messages_for_formatting` contains only the recent window when compression is active.

### Modified: `generationService.ts`

- **Skipped `orchestrateCompression()`:** The frontend no longer calls the compression orchestrator or embeds the `[Previous Events Summary]...[End Summary]` block in the prompt string. The backend handles all compression logic.

- **Full `chat_history` still sent:** `contextMessages` (all messages) sent in payload as before — the backend decides what to compress and what to format verbatim.

- **Removed unused import:** `orchestrateCompression` import commented out. `onCompressionStart`/`onCompressionEnd` callbacks no longer destructured.

### Test Results

```
Backend:  116 passed (99 existing + 17 new), 0 failed
Frontend: 475 passed, 6 skipped, 0 failed
TypeScript: clean compilation (tsc --noEmit)
Python: clean compilation (py_compile)
```

Compression service tests cover:
- Decision logic: compression_level='none', below threshold, at threshold, above threshold, recent window slice
- Cache: hit (skip LLM), miss on level change, stale after refresh threshold, valid within threshold, explicit invalidation, GC
- Failure: LLM exception → full history fallback, LLM returns None → full history fallback
- Message formatting: role mapping, HTML stripping, double-newline separation
- Session isolation: different sessions get independent caches

### Architecture Notes

- **Phase 1 bridge removed:** No more `extract_block()` parsing of the frontend prompt string. The backend generates its own compression summaries via a direct non-streaming LLM call.

- **History trimming:** When compression is active, only the recent RECENT_WINDOW (10) messages are formatted into the prompt. Old messages are replaced by the compressed summary. This properly reduces context window usage — Phase 1 had a bug where the full history was still formatted alongside the summary.

- **Frontend `compressionService.ts` still exists:** Not deleted (that's Phase 5). It's just no longer called when `backend_assembly=true`. The `orchestrateCompression()` function and its types remain available for the legacy path or Context Window Modal.

## Phase 3: Backend Loads Chat History from SQLite

**Status:** COMPLETE

**Goal:** The frontend currently sends `chat_history` in the payload. The backend should load it directly from SQLite using `chat_session_uuid`, eliminating large payload transfers.

**Depends on:** Phase 1 (done)

### Files Changed

| File | Change | Lines |
|------|--------|-------|
| `backend/services/chat_service.py` | Added `get_chat_messages_for_generation()` | +30 |
| `backend/api_handler.py` | Phase 3 DB loading branch + message_count from loaded history | +18 / -4 |
| `frontend/src/services/generation/generationService.ts` | `backendHistory` option, conditional `chat_history` omission | +12 / -3 |
| `frontend/src/contexts/ChatGenerationContext.tsx` | Set `backendHistory: true` for normal generation | +1 |
| `frontend/src/utils/generationOrchestrator.ts` | Set `backendHistory: true` (disabled for continuation) | +1 |
| `backend/tests/test_chat_history_loading.py` | **NEW** | ~250 lines (13 tests) |

### New: `get_chat_messages_for_generation()` in `chat_service.py`

Lightweight query function that loads chat messages from SQLite for LLM generation:

- Returns `List[Dict[str, str]]` with just `{role, content}` keys
- Filters out `thinking` role messages (not sent to LLM)
- Filters out non-`complete` status messages (`generating`, `error`)
- Resolves message variations: uses `metadata_json.current_variation` index into `metadata_json.variations[]` when present
- Ordered by `sequence_number ASC, timestamp ASC` (same as existing query)

### Modified: `api_handler.py`

Added Phase 3 DB loading branch early in `stream_generate()`, before lore matching:

```
extract chat_history from payload
    ↓
if backend_assembly AND chat_history is empty:
    → load from DB via get_chat_messages_for_generation()
    ↓
(rest of pipeline uses loaded chat_history)
```

- **"Prefer payload, fallback to DB" pattern:** If the frontend sends `chat_history` (continuation, regen, etc.), the backend uses the payload version. If `chat_history` is absent (normal generation with `backendHistory: true`), the backend loads from SQLite.
- **`message_count` from loaded history:** Computed as `len(chat_history)` instead of trusting the frontend's `message_count` field. Compression and assembly services both receive the authoritative count.

### Modified: `generationService.ts`

- Added `backendHistory?: boolean` option to `GenerateChatOptions`
- When `backendHistory=true`: `chat_history` and `message_count` are omitted from the payload
- `contextMessages` still required (used locally for Context Window Modal display and prompt building)

### Modified: Callers

- **`ChatGenerationContext.tsx`**: Normal generation sets `backendHistory: true`
- **`generationOrchestrator.ts`**: Sets `backendHistory: true` unless `continuationText` is present (continuation needs payload history for the synthetic system prompt)
- **Other callers unchanged**: `useChatContinuation`, `useChatMessages` (regen/variation/NPC intro) continue sending `chat_history` in the payload

### Test Results

```
Backend:  129 passed (116 existing + 13 new), 0 failed
Frontend: 475 passed, 6 skipped, 0 failed
TypeScript: clean compilation (tsc --noEmit)
Python: clean compilation (py_compile)
```

Phase 3 tests cover:
- Basic load: user/assistant messages in order
- Filtering: thinking role, error status, generating status excluded
- System messages: preserved (only thinking filtered)
- Variations: resolves active variation, falls back on missing/out-of-bounds index
- Edge cases: empty session, nonexistent session, empty content
- Ordering: sequence_number respected
- Isolation: sessions don't leak messages

### Architecture Notes

- **Payload reduction:** For a 200-message conversation, the normal generation payload drops from ~200KB to ~5KB (character data + API config only). Special flows (continuation, regen) still send the full history when needed.

- **Variation resolution on backend:** The `get_chat_messages_for_generation()` function resolves variations at query time, matching the frontend's `contextBuilder.ts` behavior where `variations[currentVariation]` takes precedence over `content`.

- **DB session lifecycle:** A dedicated `SessionLocal()` session is opened and closed for the history query, matching the existing pattern for session notes and lore loading in `api_handler.py`.

- **Legacy path unchanged:** When `backend_assembly=false`, the code still reads `chat_history` from the payload. Old frontends continue to work.

## Phase 4: Unify Legacy Endpoints

**Status:** COMPLETE

**Goal:** Greeting, impersonate, room content, and thin frame endpoints currently have their own prompt-building logic. Route them through `PromptAssemblyService` via specialized assembly methods.

**Depends on:** Phase 1 (done)

### Files Changed

| File | Change | Lines |
|------|--------|-------|
| `backend/services/prompt_assembly_service.py` | Added 4 assembly methods + shared helper | +290 |
| `backend/endpoints/generation_endpoints.py` | Feature-flagged `backend_assembly` path for all 4 endpoints | +120 / -8 (restructured) |
| `backend/tests/test_legacy_endpoint_assembly.py` | **NEW** | ~380 lines (41 tests) |

### New Assembly Methods on `PromptAssemblyService`

Four specialized methods that centralize prompt construction for legacy endpoints, replacing per-endpoint KoboldCPP override blocks:

- **`assemble_greeting()`** — Greeting/combat narrative generation. Takes character_data, generation_instruction, partial_message, is_kobold. Builds lightweight character memory (system_prompt + description/personality/scenario), constructs prompt with turn marker or partial continuation.

- **`assemble_impersonate()`** — User impersonation. Takes character_data, messages, generation_instruction, partial_message, user_name, is_kobold. Formats last 10 messages as conversation context, constructs prompt with user turn marker.

- **`assemble_room_content()`** — Room description/introduction generation. Takes world_context, room_context, field_type, existing_text, user_prompt, is_kobold. Builds memory from world/room data, constructs field-specific generation instructions.

- **`assemble_thin_frame()`** — NPC thin frame JSON extraction. Takes character_data, is_kobold. Constructs structured JSON extraction prompt with character description/personality (truncated to 1500 chars).

Shared helper: **`_build_character_memory()`** — Lightweight memory builder from character card fields (no lore, compression, or field expiration). Used by greeting and impersonate methods.

### Modified: `generation_endpoints.py`

All four endpoints now use `PromptAssemblyService` exclusively — no feature flag, no legacy fallback. The inline prompt-building code and per-endpoint KoboldCPP override blocks have been deleted (~260 lines removed).

Key differences from the main `assemble()` method:
- No compression (these are one-shot generations, not multi-turn chats)
- No lore matching (greeting/impersonate do character context, not full lore)
- No DB history loading (impersonate gets messages from the request payload)
- No field expiration (all character fields are always included)
- KoboldCPP handling is fully internal to each method

### Test Results

```
Backend:  170 passed (129 existing + 41 new), 0 failed
Frontend: TypeScript clean compilation (tsc --noEmit)
Python: clean compilation (py_compile) for both changed files
```

Phase 4 tests cover (41 tests):
- **Greeting** (9 tests): instruct basic prompt, partial message, stop sequences, memory construction, KoboldCPP story memory with folded instruction, KoboldCPP greeting prompt, KoboldCPP clean stops, minimal character data
- **Impersonate** (9 tests): instruct conversation history formatting, partial message continuation, stop sequences, memory with instruction, KoboldCPP plain transcript format, KoboldCPP stops, memory separator, empty messages, custom user name
- **Room content** (10 tests): description vs introduction field types, existing text continuation, user prompt guidance, NPC names in memory, instruct/KoboldCPP stop sequences, KoboldCPP instruction folding, empty contexts
- **Thin frame** (9 tests): character info in prompt, instruction in memory, instruct/KoboldCPP stops, KoboldCPP memory separator, nested vs flat data handling, long description truncation
- **Shared helper** (4 tests): field inclusion, empty/null character data, minimal character, no system_prompt

### Architecture Notes

- **No feature flag:** Unlike the main `/api/generate` endpoint (which still has a `backend_assembly` flag for Phase 1-3 logic), these four endpoints always use the assembly service. The legacy inline code has been deleted entirely.

- **Specialized vs general assembly:** Rather than forcing these diverse endpoints through the general `assemble()` method (which expects chat_history, compression, lore, etc.), each gets a focused method. This avoids adding complexity to the general path and keeps the specialized logic readable.

- **KoboldCPP handling centralized:** The per-endpoint `if is_kobold_provider()` override blocks are now inside the assembly methods. The endpoints no longer need to import or call `kobold_prompt_builder` functions directly.

## Phase 5: Delete Dead Frontend Code

**Status:** COMPLETE

**Goal:** Remove frontend code that's been superseded by backend assembly: `compressionService.ts`, compression UI plumbing (`isCompressing`, `CompressedContextCache`), and dead callback parameters threaded through the generation pipeline.

**Depends on:** Phases 2–4 complete, legacy path no longer needed

### Files Changed

| File | Change | Lines |
|------|--------|-------|
| `frontend/src/services/generation/compressionService.ts` | **DELETED** | ~180 lines removed |
| `frontend/src/services/generation/index.ts` | Removed barrel exports for deleted compressionService | -8 |
| `frontend/src/services/generation/generationService.ts` | Removed `CompressedContextCache` import, dead compression block, dead options fields | -35 |
| `frontend/src/utils/generationOrchestrator.ts` | Removed `CompressedContextCache` import, dead fields from `GenerationConfig` | -12 |
| `frontend/src/contexts/ChatGenerationContext.tsx` | Removed compression plumbing from all 3 generation paths | -18 |
| `frontend/src/contexts/ChatCompressionContext.tsx` | Removed `isCompressing`, `compressedContextCache`, `invalidateCompressionCache` | -30 |
| `frontend/src/contexts/ChatContext.tsx` | Removed `CompressedContextCache` import, dead context interface fields, cache invalidation calls | -20 |
| `frontend/src/components/chat/ChatView.tsx` | Removed `isCompressing` from `useChat()` destructuring | -2 |
| `frontend/src/components/chat/ChatInputArea.tsx` | Removed `isCompressing` prop and compression indicator UI | -15 |
| `frontend/src/services/chat/chatTypes.ts` | Removed `CompressedContextCache` interface definition | -12 |

### Deleted: `compressionService.ts`

Entirely dead after Phase 2 moved compression to the backend. Contained:

- `orchestrateCompression()` — Main entry point, no longer called when `backend_assembly=true`
- `compressMessages()` — LLM call for compression summary
- `formatMessagesForCompression()` — Message formatting for compression prompt
- Constants: `COMPRESSION_THRESHOLD`, `RECENT_WINDOW`, `COMPRESSION_REFRESH_THRESHOLD`
- Type: `CompressedContextCache` (re-exported, also defined in `chatTypes.ts`)

### Removed: Compression UI Plumbing

The frontend had state and callbacks for tracking compression progress. After Phase 2, the backend runs compression synchronously during generation — these were never triggered:

- **`isCompressing` state** — Boolean in `ChatCompressionContext`, consumed by `ChatView` and `ChatInputArea` to show a compression indicator. Since `onCompressionStart`/`onCompressionEnd` callbacks were removed from the generation pipeline, this was permanently `false`.

- **`compressedContextCache` state** — `CompressedContextCache | null` in `ChatCompressionContext`, threaded through `ChatContext` → `generationOrchestrator` → `generationService`. Backend owns its own per-session cache in `CompressionService`; the frontend cache was never read or written.

- **`invalidateCompressionCache()`** — Function in `ChatCompressionContext` that set `compressedContextCache` to `null`. Called from `ChatContext` on `loadExistingChat`, `createNewChat`, `forkChat`. Removed along with the cache state it operated on.

- **Compression indicator UI** — JSX in `ChatInputArea` that rendered a spinning loader with "Compressing context..." text when `isCompressing` was true. Never visible since Phase 2.

### Removed: Dead Generation Pipeline Parameters

These fields were threaded through the generation call chain but never read after Phase 2:

- `GenerateChatOptions.compressedContextCache` — Removed from interface and all callers
- `GenerateChatOptions.onCompressionStart` — Removed from interface and all callers
- `GenerateChatOptions.onCompressionEnd` — Removed from interface and all callers
- `GenerationConfig.compressedContextCache` — Removed from orchestrator interface
- `GenerationConfig.onCompressionStart` — Removed from orchestrator interface
- `GenerationConfig.onCompressionEnd` — Removed from orchestrator interface
- `onPayloadReady` callback: `compressedContextCache` field removed from the callback payload

Dead code block in `generationService.ts` that computed `compressedContextBlock` and `messagesToFormat` was removed. The function now passes `contextMessages` directly to `formatChatHistory()` and `''` for the compressed context block in `assemblePrompt()`.

### NOT Removed (Still Live)

These files were investigated and confirmed still actively used:

- **`ContextSerializer.ts`** — `getTemplate()`, `createMemoryContext()`, `replaceVariables()`, `stripHtmlTags()` still imported by `generationService.ts`, `chatUtils.ts`, and `useContextSnapshot.ts`. `createMemoryContext` powers the Context Window Modal display.

- **`contextBuilder.ts`** — `buildContextMessages()` still imported by `generationOrchestrator.ts`, `ChatGenerationContext.tsx`, and `useChatMessages.ts` for building the message array sent to generation.

- **`compressionLevel` state in `ChatCompressionContext`** — Still sent in the generation payload (`generation_params.compression_level`) for backend field expiration decisions. The context was simplified to only expose `compressionLevel` and `setCompressionLevel`.

- **`CompressionLevel` type in `chatTypes.ts`** — Still used by `ChatCompressionContext`, `ContextManagementDropdown`, and sent in generation payload.

- **`CompressedContextCache` in `types/context.ts`** — Part of the planned (unintegrated) context serialization system, not the backend-assembly dead code. Left alone.

- **`useContextSnapshot.ts`** — Never imported by any component but part of a planned feature. Not in scope for backend-assembly cleanup.

### Test Results

```
Backend:  170 passed, 0 failed (unchanged — no backend changes in Phase 5)
Frontend: 475 passed, 6 skipped, 0 failed (matches pre-change baseline exactly)
TypeScript: clean compilation (tsc --noEmit)
```

No tests were deleted — `compressionService.ts` had no dedicated test file. The 6 skipped frontend tests are the same baseline skips present before Phase 5.

### Architecture Notes

- **`ChatCompressionContext` simplified:** Went from 5 exported values (`compressionLevel`, `setCompressionLevel`, `isCompressing`, `compressedContextCache`, `invalidateCompressionCache`) to 2 (`compressionLevel`, `setCompressionLevel`). The context now serves a single purpose: storing the user's compression level preference to send to the backend.

- **Generation pipeline cleaned:** The 3 generation paths in `ChatGenerationContext.tsx` (`regenerateMessage`, `generateResponse`, `continueResponse`) each had 3 dead fields removed from their config objects. The `generationOrchestrator` no longer accepts or forwards compression state.

- **No behavioral changes:** All deletions were dead code paths. The `backend_assembly=true` flag is the only active path, and all compression/assembly logic runs server-side. The frontend's role is now: (1) send generation parameters, (2) stream the response, (3) display context window info via `ContextSerializer`.

- **Remaining frontend assembly code:** `ContextSerializer.ts` and `contextBuilder.ts` remain because they serve the Context Window Modal (display-only) and message array construction. These are NOT dead — they just no longer participate in the generation payload's prompt/memory construction.

## Summary: Migration Complete

All 5 phases of the backend assembly migration are complete:

| Phase | What | Status |
|-------|------|--------|
| 1 | Backend prompt assembly service | COMMITTED (`76d00bb`) |
| 2 | Backend compression service | COMPLETE (uncommitted) |
| 3 | Backend loads chat history from SQLite | COMPLETE (uncommitted) |
| 4 | Unify legacy endpoints | COMPLETE (uncommitted) |
| 5 | Delete dead frontend code | COMPLETE (uncommitted) |

**Net result:** The backend now owns the complete prompt pipeline — prompt construction, field expiration, compression, chat history loading, and all legacy endpoint assembly. The frontend sends generation parameters and streams the response. Frontend-only code retained for Context Window Modal display and message array construction.
