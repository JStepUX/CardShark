# Generation Pipeline Consolidation Spec

**Status:** Proposed | **Date:** 2026-02-12 | **Scope:** Backend + Frontend generation paths

---

## Problem

The generation pipeline has 10 paths built as standalone implementations. Each has its own context building, stop sequences, KoboldCPP handling, and post-processing. This causes inconsistent behavior (some paths strip prefixes, some remove incomplete sentences, some do neither) and makes adding new generation types require duplicating boilerplate across frontend and backend.

## Current State — All Generation Paths

| # | Path | Frontend Entry | Backend Endpoint | KoboldCPP Override | Post-Processing Applied |
|---|------|---------------|-----------------|-------------------|------------------------|
| 1 | New response | `ChatContext.generateResponse()` ~line 1144 | `/api/generate` | `build_story_prompt()` | prefix + incomplete + filter |
| 2 | Regenerate | `ChatContext.regenerateMessage()` ~line 941 | `/api/generate` | `build_story_prompt()` | prefix + incomplete + filter |
| 3 | Continue | `ChatContext.continueResponse()` ~line 1455 | `/api/generate` | `build_story_prompt(continuation_text)` | prefix + incomplete + filter |
| 4 | Regen greeting | `ChatContext.regenerateGreeting()` ~line 1326 | `/api/generate-greeting` | `build_greeting_prompt()` | prefix only (incomplete called in wrong order in ChatStorage) |
| 5 | Impersonate | `ChatContext.impersonateUser()` ~line 1411 | `/api/generate-impersonate` | `build_impersonate_prompt()` | **NONE** |
| 6 | Room content | `RoomPropertiesPanel` ~line 121 | `/api/generate-room-content` | partial (stop seqs only) | **NONE** (some callers do incomplete) |
| 7 | Post-combat | `useCombatManager` ~line 174 | `/api/generate-greeting` (reused) | via greeting endpoint | prefix + incomplete + filter |
| 8 | NPC conversation | `useNPCInteraction` → ChatContext | `/api/generate` | `build_story_prompt()` | prefix + incomplete + filter |
| 9 | Bonded ally | `useNPCInteraction` → ChatContext | `/api/generate` | `build_story_prompt()` | prefix + incomplete + filter |
| 10 | Thin frame | backend-initiated | `/api/context/generate-thin-frame` | partial (stop seqs) | JSON parse + fallback |

**Lore integration:** Only `/api/generate` runs lore matching. All other endpoints skip it.

**Stop sequences:** Each endpoint builds its own inline. No central registry.

---

## Phase 1: Unified Frontend Post-Processing

### Task

Create a single utility function that all generation callbacks use for cleanup. Replace the 3-step inline pattern (`stripCharacterPrefix` → `removeIncompleteSentences` → `filterText`) repeated across ChatContext callbacks.

### Files to Create

**`frontend/src/utils/generationPostProcessing.ts`** — new file:

```typescript
import { stripCharacterPrefix, removeIncompleteSentences } from './contentProcessing';

interface PostProcessOptions {
  characterName: string;
  removeIncomplete: boolean;
  applyContentFilter: boolean;
  filterFn?: (text: string) => string;
}

export function processGeneratedContent(raw: string, opts: PostProcessOptions): string {
  let content = stripCharacterPrefix(raw, opts.characterName);
  if (opts.removeIncomplete) content = removeIncompleteSentences(content);
  if (opts.applyContentFilter && opts.filterFn) content = opts.filterFn(content);
  return content;
}
```

### Files to Modify

Each callback below currently has inline post-processing. Replace with `processGeneratedContent()`.

1. **`frontend/src/contexts/ChatContext.tsx`** — 5 callbacks:
   - `generateResponse` (~line 1277): Replace `stripCharacterPrefix` → `removeIncompleteSentences` → `filterText` with single `processGeneratedContent()` call
   - `regenerateMessage` (~line 1090): Same replacement
   - `continueResponse` (~line 1598): Same replacement (applied to combined `origContent + strippedAppended`)
   - `regenerateGreeting` (~line 1372): Currently only does `stripCharacterPrefix`. Add `removeIncompleteSentences` + `filterText` via the unified function
   - `impersonateUser` (~line 1428): Currently does NO post-processing. The returned `fullResponse` from `ChatStorage.generateImpersonateStream()` is raw. Apply `processGeneratedContent()` before returning to caller

2. **`frontend/src/hooks/useCombatManager.ts`** — `generatePostCombatNarrative` (~line 225):
   - Currently applies `stripCharacterPrefix` + `removeIncompleteSentences` inline. Replace with `processGeneratedContent()`

3. **`frontend/src/components/world/RoomPropertiesPanel.tsx`** — `handleWriteForMe` (~line 121):
   - Currently no post-processing on streaming completion. Add `removeIncompleteSentences()` on the final accumulated content before setting state. No `stripCharacterPrefix` needed (no character name in room content). No `filterText` needed.

### Build Options for `processGeneratedContent` in Each Callback

In ChatContext, the options are:
```typescript
const postProcessOpts = {
  characterName: charName,
  removeIncomplete: settingsRef.current?.remove_incomplete_sentences !== false,
  applyContentFilter: shouldUseClientFiltering,
  filterFn: filterText,
};
```

For combat narrative (useCombatManager), `characterName` comes from the narrator card. `removeIncomplete` should be true. `applyContentFilter` should be false (narrative content doesn't go through content filter).

For room content, only `removeIncomplete: true` matters; `characterName: ''` and `applyContentFilter: false`.

### Verification

- `npx tsc --noEmit` must pass after all changes
- Grep for `stripCharacterPrefix` in ChatContext.tsx — should only appear in the import, not inline in callbacks
- Grep for `removeIncompleteSentences` in ChatContext.tsx — should only appear in the import, not inline in callbacks

---

## Phase 2: Backend Generation Service

### Task

Create a `GenerationService` class that owns the shared pipeline: memory building → lore matching → prompt construction → provider formatting → streaming. Each endpoint becomes a thin wrapper that constructs a config object and delegates.

### Files to Create

**`backend/services/generation_service.py`** — new file.

Define a `GenerationConfig` dataclass:

```python
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class GenerationConfig:
    generation_type: str                    # 'chat' | 'greeting' | 'impersonate' | 'room_content' | 'thin_frame'
    api_config: dict
    character_data: Optional[dict] = None
    messages: list = field(default_factory=list)
    partial_message: str = ''               # impersonate prefix
    continuation_text: str = ''             # continue prefix
    system_instruction: str = ''
    session_notes: str = ''
    include_lore: bool = False
    stop_sequences: Optional[list] = None   # None = auto from generation_type
    max_tokens: Optional[int] = None
    custom_prompt: Optional[str] = None     # post-combat, room content
    user_name: str = 'User'
```

The `GenerationService` class must do these steps in order:

1. **Build memory** from `character_data` using existing `lore_handler.build_memory()` (currently called at `api_handler.py` ~line 772)
2. **Match lore** if `include_lore=True` using `LoreHandler.match_lore_entries()` (currently at `api_handler.py` ~line 720-741)
3. **Build prompt** from `messages` using the appropriate formatter (story mode for KoboldCPP, template-based for others)
4. **Apply continuation/partial prefix** if `continuation_text` or `partial_message` present
5. **Resolve stop sequences** from registry (see Phase 4) or use `stop_sequences` if explicitly provided
6. **Delegate streaming** to the existing `api_handler.stream_generate()` — pass the fully-constructed `stream_request_data` dict

### Files to Modify

**`backend/generation_endpoints.py`** — simplify all 5 endpoints:

Each endpoint currently has 80-150 lines of context assembly. After refactoring, each should be ~20-30 lines: parse request → build `GenerationConfig` → call `generation_service.stream_generate(config)` → return `StreamingResponse`.

Endpoints to refactor:
- `generate()` at line 40 — `GenerationConfig(generation_type='chat', include_lore=True, ...)`
- `generate_greeting()` at line 62 — `GenerationConfig(generation_type='greeting', messages=[], ...)`
- `generate_impersonate()` at line 184 — `GenerationConfig(generation_type='impersonate', partial_message=..., ...)`
- `generate_room_content()` at line 312 — `GenerationConfig(generation_type='room_content', custom_prompt=..., ...)`
- `generate_thin_frame()` at line 501 — `GenerationConfig(generation_type='thin_frame', max_tokens=300, ...)`

**`backend/api_handler.py`** — `stream_generate()` (~line 534):

The current `stream_generate()` is ~500 lines handling everything. After Phase 2, the context building (memory, lore, KoboldCPP rebuild) moves to `GenerationService`. `stream_generate()` becomes a pure streaming executor that receives a fully-built request and yields chunks through the provider adapter + thinking tag filter.

### Migration Strategy

Refactor one endpoint at a time. After each endpoint, verify that:
1. Normal chat generation still works
2. KoboldCPP output matches pre-refactor (compare terminal output)
3. Streaming works without interruption

Start with `/api/generate-greeting` (simplest) → `/api/generate-impersonate` → `/api/generate-room-content` → `/api/generate` (most complex, do last).

---

## Phase 3: Centralized KoboldCPP Handling

### Task

Move KoboldCPP story-mode formatting from endpoint-level `if is_kobold:` blocks into the provider adapter layer.

### Current Locations of KoboldCPP Handling

All in `backend/api_handler.py` `stream_generate()`:
- Lines 794-867: Main chat — `fold_system_instruction()`, `build_story_prompt()`, `build_story_stop_sequences()`, context budget debugger
- These blocks are also replicated in `generation_endpoints.py` for greeting (line 155-168), impersonate (line 282-308), room content (line 408-416), thin frame (line 596)

All builder functions live in `backend/kobold_prompt_builder.py`:
- `build_story_prompt()` (line 78) — chat transcript formatter
- `build_greeting_prompt()` (line 127) — greeting turn marker
- `build_impersonate_prompt()` (line 139) — impersonate transcript + turn marker
- `build_room_content_prompt()` (line 179) — room content formatter
- `clean_memory()` (line 191) — strips instruct tokens from memory
- `fold_system_instruction()` (line 249) — folds system instruction into memory
- `build_story_stop_sequences()` (line 115) — chat stop sequences

### Files to Modify

**`backend/api_provider_adapters.py`** — add a `prepare_context()` method to the KoboldCPP adapter class:

```python
def prepare_context(self, generation_type: str, memory: str, prompt: str,
                    messages: list, char_name: str, user_name: str,
                    system_instruction: str = '', continuation_text: str = '',
                    partial_message: str = '') -> dict:
    """Convert any generation context to KoboldCPP story format.

    Returns dict with keys: memory, prompt, stop_sequence
    """
    memory = clean_memory(memory)
    if system_instruction:
        memory = fold_system_instruction(system_instruction, memory)
    if memory and not memory.rstrip().endswith('***'):
        memory = memory.rstrip() + '\n***'

    if generation_type == 'chat':
        prompt = build_story_prompt(messages, char_name, user_name, continuation_text)
    elif generation_type == 'greeting':
        prompt = build_greeting_prompt(char_name, partial_message)
    elif generation_type == 'impersonate':
        prompt = build_impersonate_prompt(messages, char_name, user_name, partial_message)
    elif generation_type == 'room_content':
        prompt = build_room_content_prompt(...)

    stop_sequence = build_story_stop_sequences(char_name, user_name)
    # ... per-type overrides for stop sequences

    return {'memory': memory, 'prompt': prompt, 'stop_sequence': stop_sequence}
```

**`backend/api_handler.py`** — remove the `if is_kobold:` block (~lines 794-867) from `stream_generate()`. The `GenerationService` (Phase 2) calls `adapter.prepare_context()` before streaming.

**`backend/generation_endpoints.py`** — remove all per-endpoint `if is_kobold:` blocks (lines 155-168, 282-308, 408-416, 596).

### Depends On

Phase 2 (GenerationService) must be complete first. The service orchestrates calling `adapter.prepare_context()` when the provider is KoboldCPP.

---

## Phase 4: Stop Sequence Registry

### Task

Define all stop sequences in one place. Currently each endpoint constructs its own inline.

### Files to Create

**`backend/stop_sequences.py`** — new file:

```python
"""Centralized stop sequence definitions for all generation types."""

def get_stop_sequences(generation_type: str, char_name: str, user_name: str = 'User',
                       is_kobold: bool = False) -> list[str]:
    """Return stop sequences for the given generation type and provider."""

    if is_kobold:
        return _KOBOLD_SEQUENCES.get(generation_type, _KOBOLD_SEQUENCES['chat'])(char_name, user_name)
    return _DEFAULT_SEQUENCES.get(generation_type, _DEFAULT_SEQUENCES['chat'])(char_name, user_name)

_DEFAULT_SEQUENCES = {
    'chat': lambda c, u: [f"{u}:", "User:"],
    'greeting': lambda c, u: [f"{u}:", "User:"],
    'impersonate': lambda c, u: [f"{c}:", f"\n{c}: "],
    'room_content': lambda c, u: ["[END]", "---"],
    'thin_frame': lambda c, u: ["```", "\n\n\n"],
}

_KOBOLD_SEQUENCES = {
    'chat': lambda c, u: [f"{u}:", f"\n{u} ", f"\n{c}: "],
    'greeting': lambda c, u: [f"{u}:", f"\n{u} "],
    'impersonate': lambda c, u: [f"{c}:", f"\n{c}: "],
    'room_content': lambda c, u: ["[END]", "---"],
    'thin_frame': lambda c, u: ["```", "\n\n\n"],
}
```

### Files to Modify

- **`backend/kobold_prompt_builder.py`** — remove `build_story_stop_sequences()` (line 115). Import from `stop_sequences.py` instead.
- **`backend/generation_endpoints.py`** — replace inline stop sequence construction in all 5 endpoints with `get_stop_sequences()` calls.
- **`backend/api_handler.py`** — replace inline stop sequence in `stream_generate()` with registry call.

### Depends On

Phase 2 ideally, but can be done independently if you just replace inline constructions with registry calls in the existing endpoints.

---

## Phase 5: Dead Code Cleanup

### Task

Audit and remove vestigial generation logic in `frontend/src/hooks/useChatMessages.ts`.

### Investigation Steps

1. Read `frontend/src/hooks/useChatMessages.ts` fully
2. Identify all functions that deal with generation (sending messages, streaming, post-processing)
3. For each, grep the codebase to confirm whether it's imported/called anywhere
4. Functions that are only called from within `useChatMessages.ts` itself AND are not exported, or are exported but never imported elsewhere, are candidates for removal

### Known Dead Code

- `removeIncompleteSentences` usage at ~line 247 — this is in a `setGenerationComplete` callback. Verify if `setGenerationComplete` is ever called. ChatView uses `ChatContext` for generation, not `useChatMessages`.
- Any `generateResponse`/`regenerateMessage`/`continueResponse` implementations in this hook — ChatView uses the versions from `ChatContext.tsx`

### Files to Modify

- **`frontend/src/hooks/useChatMessages.ts`** — remove dead generation functions, unused imports
- Possibly **`frontend/src/services/chatStorage.ts`** — verify which `generate*Stream` functions are still called and by whom

### Verification

- `npx tsc --noEmit` must pass
- Grep for any removed function names across the entire `frontend/src/` tree to confirm zero remaining references

---

## Execution Order

```
Phase 1 ←──── standalone, do first (quickest win, fixes post-processing gaps)
Phase 5 ←──── standalone, do alongside Phase 1 (cleanup)
Phase 2 ←──── standalone, do second (biggest architectural impact)
Phase 3 ←──── requires Phase 2
Phase 4 ←──── requires Phase 2 (or do standalone with current endpoints)
```

## Verification Checklist (All Phases)

After each phase, verify:

- [ ] `npx tsc --noEmit` passes (frontend)
- [ ] `python -m pytest backend/` passes (if tests exist)
- [ ] Start app with `python start.py` — no crashes
- [ ] Chat generation works (send message, get streaming response)
- [ ] Regenerate works (click regenerate, get new variation)
- [ ] Continue works (click continue, response appends to existing text mid-stream)
- [ ] Impersonate works (click impersonate, get user-voice response)
- [ ] Greeting regen works (in CharacterDetailView greetings tab)
- [ ] KoboldCPP: terminal output shows clean story-mode transcript (no instruct tokens, no ChatML)
- [ ] KoboldCPP: stop sequences work (generation stops at user turn, doesn't run on)
