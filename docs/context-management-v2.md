# Context Management V2 - Technical Specification

**Version:** 1.0
**Status:** Draft
**Author:** AI Assistant
**Date:** 2026-02-01

---

## Executive Summary

This specification defines a complete refactor of CardShark's context management system. The current implementation suffers from god objects, scattered responsibilities, no caching strategy, and race conditions during room transitions. This refactor introduces a layered architecture with clear separation of concerns, persistent caching, and a unified context assembly pipeline.

### Goals

1. **Fix immediate bugs**: NPC identity loss, image flickering on room transitions
2. **Enable room transition summaries**: Compress previous room context, carry forward adventure log
3. **Enable NPC thin frame generation**: LLM-distilled character summaries during load
4. **Eliminate god objects**: Break apart WorldPlayView, ChatContext, PromptHandler
5. **Establish caching strategy**: Persistent, invalidation-aware context caching
6. **Create clean API boundaries**: Structured context objects, not monolithic strings

### Non-Goals

- Changing the V2 Character Card spec (we extend via `extensions`, not modify)
- Modifying the combat system
- Rewriting the LLM provider adapters
- Changing the SQLite schema (beyond additive columns)

---

## Scope & Phased Delivery

This is a substantial undertaking. To manage risk and deliver value incrementally, we split into **Essential** (must ship) and **Enhancement** (can defer) work.

### Essential (Minimum Viable)

| Deliverable | Solves |
|-------------|--------|
| Loading screen + atomic state updates | Image flickering, NPC flicker |
| Texture preloading in transition flow | Missing images after room change |
| Thin frames in PNG metadata | NPC identity loss on first interaction |
| Room transition summarizer | Context bloat, adventure continuity |
| Adventure log persistence | Narrative thread across rooms |

### Delivery Phases

**Phase 1: Fix the Bugs**
- Loading screen component
- Texture preloading during transition
- Atomic state updates

**Phase 2: Thin Frames**
- Thin frame schema in PNG extensions
- Generate on character save (when description/personality changes)
- Use thin frame instead of truncation for NPC context

**Phase 3: Room Summarization**
- Summarizer service (LLM-based with fallback)
- Adventure log structure and persistence
- Inject into new room context

**Phase 4: Architecture Cleanup**
- Decompose god objects (WorldPlayView, ChatContext, PromptHandler)
- Implement ContextSource layer
- Implement ContextAssembler and ContextSerializer
- Establish clean layer boundaries

---

## Key Design Decisions

These decisions were made during spec review:

### 1. Thin Frames Stored in PNG Metadata

Thin frames are written to the character PNG's `extensions` field for **world portability**. When you share a world, the NPC identities travel with their character cards.

```typescript
// In character card extensions
extensions: {
  // ... existing fields
  cardshark_thin_frame: {
    version: 1,
    generated_at: number,
    archetype: string,
    key_traits: string[],
    speaking_style: string,
    motivation: string,
    appearance_hook: string,
  }
}
```

**Regeneration trigger**: Only when `description` or `personality` fields change during save. Show spinner during generation. Thin frame represents **character identity** only - world state changes (injuries, mood shifts, quest progress) are tracked in world/room state, not thin frame.

### 2. Compression vs Summarization Separation

| System | When | What |
|--------|------|------|
| **Existing compression** | During conversation | Handles context growth within a room |
| **Room summarizer** | On room exit | Distills room's events into adventure log entry |

No changes to existing compression mechanics. Summarizer is additive, fires once at room transition.

### 3. No Skip Button on Loading Screen

Loading screen completes or fails with fallback. No user skip option. If generation is slow:
- Show progress indicators
- Fallback to truncation after timeout (30 seconds)
- Log performance for future optimization

Rationale: Skip creates inconsistent experience. Better to have deterministic behavior.

### 4. Lazy Load, Stagger Inference

**No batch pre-generation.** Thin frames generate:
1. On character save (if description/personality changed)
2. On first room load (for NPCs without thin frames)

Rooms beyond the current one use existing lazy load. World with 36 NPCs across 17 rooms doesn't block on all 36 - only current room's NPCs.

First room target: < 15 seconds on modest hardware (including 3-4 NPC thin frame generations if needed).

---

## Current State Analysis

### Problems Identified

| Problem | Location | Impact |
|---------|----------|--------|
| `buildThinNPCContext()` truncates to first sentence | `worldCardAdapter.ts:276-356` | NPCs lose identity on first interaction |
| Texture preload only runs on mount | `LocalMapView.tsx:963-1145` | Images missing after room transition |
| State updates not atomic | `WorldPlayView.tsx:1641-1692` | Flicker of old NPCs during transition |
| Context rebuilt on every render | `WorldPlayView.tsx` useEffect | Wasted computation, stale closures |
| Compression cache in memory only | `ChatContext.tsx` | Lost on navigation |
| No room transition summarization | N/A | Context bloat, no adventure continuity |
| God objects | `WorldPlayView`, `ChatContext`, `PromptHandler` | Maintenance nightmare |
| Lore matching on every generation | `api_handler.py` | Expensive regex, no caching |

### Current Data Flow

```
User Input → ChatContext → PromptHandler → API Handler → LLM
                ↑               ↑              ↑
            (god object)   (god object)   (lore injection)
```

**Issues:**
- No clear layers
- Mixed responsibilities (state + persistence + API + formatting)
- Context assembly scattered across 4+ files
- No structured context object (monolithic strings)

---

## Proposed Architecture

### Design Principles

1. **Single Responsibility**: Each module does one thing well
2. **Dependency Injection**: No hidden dependencies, explicit interfaces
3. **Immutable Data Flow**: Context objects are immutable snapshots
4. **Cache-First**: Check cache before expensive operations
5. **Fail Gracefully**: Fallbacks for every LLM-dependent operation
6. **Observable State**: Clear state machines with defined transitions

### Architecture (Phases 1-3)

We're adding focused services alongside existing code, not rebuilding layers.

```
┌─────────────────────────────────────────────────────────────────┐
│  WorldPlayView                                                   │
│  (existing, add transition flow + loading screen)                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ ThinFrame     │   │ Summarization │   │ AdventureLog  │
│ Service       │   │ Service       │   │ Service       │
│ (PNG metadata)│   │ (LLM + fallbk)│   │ (SQLite)      │
└───────────────┘   └───────────────┘   └───────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend: /api/context/* endpoints                               │
│  (thin-frame generation, room summarization)                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Data Structures

### NPCThinFrame

```typescript
interface NPCThinFrame {
  readonly generatedAt: number;
  readonly archetype: string;           // "gruff blacksmith"
  readonly keyTraits: string[];         // Max 3
  readonly speakingStyle: string;       // "formal, uses thee/thou"
  readonly motivation: string;          // What drives them
  readonly appearanceHook: string;      // Most memorable visual
  readonly relationshipToPlayer: string; // Current standing
}
```

### AdventureContext

The cumulative adventure log that persists across room transitions.

```typescript
interface AdventureContext {
  readonly worldUuid: string;
  readonly userUuid: string;
  readonly entries: RoomSummary[];
  readonly currentObjectives: string[];
  readonly totalRoomsVisited: number;
  readonly totalMessageCount: number;
}

interface RoomSummary {
  readonly roomUuid: string;
  readonly roomName: string;
  readonly visitedAt: number;
  readonly departedAt: number;
  readonly messageCount: number;

  // LLM-generated summary
  readonly keyEvents: string[];           // Max 3
  readonly npcsInteracted: NPCInteractionSummary[];
  readonly itemsChanged: ItemChange[];
  readonly unresolvedThreads: string[];   // Max 2, hooks for future
  readonly moodOnDeparture: string;       // "hopeful", "wounded"
}

interface NPCInteractionSummary {
  readonly npcUuid: string;
  readonly npcName: string;
  readonly relationshipChange: 'improved' | 'worsened' | 'neutral';
  readonly notableInteraction: string;    // Max 60 chars
}

interface ItemChange {
  readonly item: string;
  readonly action: 'acquired' | 'used' | 'lost' | 'traded';
}
```

---

## Services

### ThinFrameService

Manages LLM-generated NPC summaries. **Thin frames are stored in PNG metadata** (character card `extensions` field) for world portability.

```typescript
class ThinFrameSource implements ContextSource<NPCThinFrame> {
  private cache: LRUCache<string, NPCThinFrame>;
  private pendingGenerations: Map<string, Promise<NPCThinFrame>>;

  async get(characterUuid: string): Promise<NPCThinFrame | null> {
    // 1. Check memory cache
    if (this.cache.has(characterUuid)) {
      return this.cache.get(characterUuid);
    }

    // 2. Check PNG metadata (via character API)
    const character = await this.characterSource.get(characterUuid);
    const stored = character?.extensions?.cardshark_thin_frame;
    if (stored) {
      this.cache.set(characterUuid, stored);
      return stored;
    }

    // 3. Return null (caller should generate)
    return null;
  }

  async generateAndSave(character: CharacterCard): Promise<NPCThinFrame> {
    // Dedup concurrent generations
    if (this.pendingGenerations.has(character.data.character_uuid)) {
      return this.pendingGenerations.get(character.data.character_uuid)!;
    }

    const promise = this.doGenerate(character);
    this.pendingGenerations.set(character.data.character_uuid, promise);

    try {
      const frame = await promise;
      this.cache.set(character.data.character_uuid, frame);

      // Persist to PNG metadata via character save API
      await this.saveFrameToPNG(character, frame);

      return frame;
    } finally {
      this.pendingGenerations.delete(character.data.character_uuid);
    }
  }

  private async saveFrameToPNG(character: CharacterCard, frame: NPCThinFrame): Promise<void> {
    // Update extensions and save character
    const updatedCard = {
      ...character,
      data: {
        ...character.data,
        extensions: {
          ...character.data.extensions,
          cardshark_thin_frame: {
            version: 1,
            generated_at: Date.now(),
            ...frame,
          }
        }
      }
    };
    await this.characterService.saveCharacter(updatedCard);
  }

  private async doGenerate(character: CharacterCard): Promise<NPCThinFrame> {
    // Call LLM with constrained JSON output
    // Fallback to truncation if generation fails
  }
}
```

**Generation Triggers:**
1. **On character save** - If `description` or `personality` changed, regenerate thin frame before saving PNG
2. **On room load** - If NPC lacks thin frame in metadata, generate and save to PNG

---

## Room Transition Manager

Orchestrates the room transition flow including loading screen.

### State Machine

```
IDLE → INITIATING → SUMMARIZING → LOADING_ASSETS → GENERATING_FRAMES → READY → IDLE
         │              │              │                  │              │
         ▼              ▼              ▼                  ▼              ▼
      (start)    (LLM summary)   (textures)      (NPC thin frames)  (reveal)
```

```typescript
type TransitionPhase =
  | 'idle'
  | 'initiating'      // Gathering info, showing loading screen
  | 'summarizing'     // LLM summarizing previous room
  | 'loading_assets'  // Preloading textures
  | 'generating_frames' // Generating NPC thin frames
  | 'ready';          // All done, can reveal

interface TransitionState {
  phase: TransitionPhase;
  targetRoom: RoomContext | null;
  sourceRoom: RoomContext | null;

  progress: {
    summarization: ProgressStatus;
    assetPreload: ProgressStatus;
    thinFrameGeneration: ProgressStatus;
  };

  error: string | null;
}

type ProgressStatus =
  | { status: 'pending' }
  | { status: 'in_progress'; percent: number }
  | { status: 'complete' }
  | { status: 'failed'; error: string };
```

### Implementation

```typescript
class RoomTransitionManager {
  private state: TransitionState = { phase: 'idle', ... };
  private listeners: Set<(state: TransitionState) => void> = new Set();

  constructor(
    private readonly contextAssembler: ContextAssembler,
    private readonly summarizationService: SummarizationService,
    private readonly thinFrameSource: ThinFrameSource,
    private readonly textureCache: TextureCache,
    private readonly adventureLogSource: AdventureLogSource,
  ) {}

  async transition(params: {
    sourceRoom: RoomContext;
    targetRoom: RoomContext;
    chatMessages: Message[];
    roomNpcs: NPCData[];
    worldUuid: string;
    userUuid: string;
  }): Promise<TransitionResult> {
    this.updateState({ phase: 'initiating', targetRoom: params.targetRoom });

    try {
      // Phase 1: Summarize previous room (if there are messages to summarize)
      if (params.chatMessages.length > 0) {
        this.updateState({ phase: 'summarizing' });
        const summary = await this.summarizePreviousRoom(params);
        await this.adventureLogSource.appendEntry(summary);
      }

      // Phase 2: Preload textures (parallel with phase 3)
      this.updateState({ phase: 'loading_assets' });
      const texturePromise = this.preloadTextures(params.roomNpcs);

      // Phase 3: Generate thin frames for non-hostile NPCs
      this.updateState({ phase: 'generating_frames' });
      const framePromise = this.generateMissingThinFrames(
        params.roomNpcs.filter(n => n.allegiance !== 'hostile')
      );

      // Wait for both
      await Promise.all([texturePromise, framePromise]);

      this.updateState({ phase: 'ready' });

      return {
        success: true,
        adventureLog: await this.adventureLogSource.get(params.worldUuid, params.userUuid),
      };
    } catch (error) {
      this.updateState({ phase: 'idle', error: error.message });
      return { success: false, error: error.message };
    }
  }

  private async summarizePreviousRoom(params): Promise<RoomSummary> {
    return this.summarizationService.summarizeRoom({
      room: params.sourceRoom,
      messages: params.chatMessages,
      npcs: params.roomNpcs,
    });
  }

  private async preloadTextures(npcs: NPCData[]): Promise<void> {
    const paths = npcs
      .map(n => n.imageUrl)
      .filter(Boolean);

    await this.textureCache.preload(paths);
  }

  private async generateMissingThinFrames(npcs: NPCData[]): Promise<void> {
    const missing = npcs.filter(n => !this.thinFrameSource.has(n.character_uuid));

    // Generate in parallel with concurrency limit
    await Promise.all(
      missing.map(n => this.thinFrameSource.generate(n.characterContext))
    );
  }
}
```

---

## Summarization Service

Handles LLM-based context compression with constrained output.

```typescript
class SummarizationService {
  constructor(
    private readonly apiClient: ApiClient,
    private readonly fallbackSummarizer: FallbackSummarizer,
  ) {}

  /**
   * Summarize a room's chat history into structured summary
   */
  async summarizeRoom(params: {
    room: RoomContext;
    messages: Message[];
    npcs: NPCData[];
  }): Promise<RoomSummary> {
    try {
      const response = await this.apiClient.generateStructured({
        schema: RoomSummarySchema,
        prompt: this.buildSummarizationPrompt(params),
        maxTokens: 300,
      });

      return this.parseRoomSummary(response);
    } catch (error) {
      // Fallback: simple extraction without LLM
      return this.fallbackSummarizer.extractRoomSummary(params);
    }
  }

  /**
   * Compress old chat messages
   */
  async compressMessages(params: {
    messages: Message[];
    characterName: string;
    maxTokens: number;
  }): Promise<string> {
    try {
      return await this.apiClient.generate({
        prompt: this.buildCompressionPrompt(params),
        maxTokens: params.maxTokens,
      });
    } catch (error) {
      // Fallback: keep most recent messages as-is
      return this.fallbackSummarizer.truncateMessages(params.messages);
    }
  }

  /**
   * Generate NPC thin frame
   */
  async generateThinFrame(character: CharacterContext): Promise<NPCThinFrame> {
    try {
      const response = await this.apiClient.generateStructured({
        schema: NPCThinFrameSchema,
        prompt: this.buildThinFramePrompt(character),
        maxTokens: 200,
      });

      return this.parseThinFrame(response);
    } catch (error) {
      // Fallback: naive extraction from description
      return this.fallbackSummarizer.extractThinFrame(character);
    }
  }
}
```

### Constrained JSON Schemas

```typescript
// Zod schemas for constrained LLM output

const NPCThinFrameSchema = z.object({
  archetype: z.string().max(30).describe('Brief character archetype, e.g., "gruff blacksmith"'),
  key_traits: z.array(z.string().max(20)).max(3).describe('3 essential personality traits'),
  speaking_style: z.string().max(50).describe('How they speak, e.g., "formal, uses thee/thou"'),
  motivation: z.string().max(80).describe('What drives this character'),
  appearance_hook: z.string().max(60).describe('Most memorable visual detail'),
});

const RoomSummarySchema = z.object({
  key_events: z.array(z.string().max(100)).max(3).describe('Most important things that happened'),
  npcs_interacted: z.array(z.object({
    name: z.string(),
    relationship_change: z.enum(['improved', 'worsened', 'neutral']),
    notable_interaction: z.string().max(60),
  })).optional(),
  items_changed: z.array(z.object({
    item: z.string(),
    action: z.enum(['acquired', 'used', 'lost', 'traded']),
  })).optional(),
  unresolved_threads: z.array(z.string().max(80)).max(2).describe('Hooks for future'),
  mood_on_departure: z.string().max(30).describe('Emotional state when leaving'),
});
```

---

## Backend API Changes

### New Endpoints

```python
# POST /api/context/summarize-room
# Summarize a room's chat history

@router.post("/context/summarize-room")
async def summarize_room(request: RoomSummarizationRequest) -> RoomSummary:
    """
    Generate structured summary of room interactions.
    Uses constrained JSON output when supported by provider.
    """
    pass

# POST /api/context/generate-thin-frame
# Generate NPC thin frame summary

@router.post("/context/generate-thin-frame")
async def generate_thin_frame(request: ThinFrameRequest) -> NPCThinFrame:
    """
    Generate LLM-distilled character summary.
    Uses constrained JSON output when supported by provider.
    """
    pass

# POST /api/context/compress-messages
# Compress chat history

@router.post("/context/compress-messages")
async def compress_messages(request: CompressionRequest) -> CompressedHistory:
    """
    Compress older messages into summary.
    """
    pass
```

### Request/Response Models

```python
class RoomSummarizationRequest(BaseModel):
    room_uuid: str
    room_name: str
    messages: List[ChatMessage]
    npcs: List[NPCInfo]
    api_config: ApiConfig

class NPCThinFrame(BaseModel):
    archetype: str = Field(max_length=30)
    key_traits: List[str] = Field(max_items=3)
    speaking_style: str = Field(max_length=50)
    motivation: str = Field(max_length=80)
    appearance_hook: str = Field(max_length=60)

class RoomSummary(BaseModel):
    room_uuid: str
    room_name: str
    visited_at: int
    departed_at: int
    message_count: int
    key_events: List[str] = Field(max_items=3)
    npcs_interacted: Optional[List[NPCInteractionSummary]]
    items_changed: Optional[List[ItemChange]]
    unresolved_threads: List[str] = Field(max_items=2)
    mood_on_departure: str = Field(max_length=30)
```

### Provider Adapter Changes

Add structured output support to provider adapters:

```python
class ApiProviderAdapter:
    def supports_structured_output(self) -> bool:
        """Whether this provider supports JSON schema constraints."""
        return False

    def prepare_structured_request(
        self,
        prompt: str,
        schema: Dict[str, Any],
        generation_settings: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Prepare request with JSON schema constraint."""
        raise NotImplementedError

class OpenAIAdapter(ApiProviderAdapter):
    def supports_structured_output(self) -> bool:
        return True

    def prepare_structured_request(self, prompt, schema, settings):
        return {
            "model": settings.get('model', 'gpt-4'),
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "structured_output",
                    "schema": schema,
                    "strict": True
                }
            },
            "max_tokens": settings.get('max_tokens', 300),
        }
```

---

## Database Changes

### New Tables

```sql
-- Adventure log entries (room summaries)
CREATE TABLE adventure_log_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    world_uuid TEXT NOT NULL,
    user_uuid TEXT NOT NULL,
    room_uuid TEXT NOT NULL,
    room_name TEXT NOT NULL,
    visited_at INTEGER NOT NULL,
    departed_at INTEGER,
    message_count INTEGER DEFAULT 0,
    summary_json TEXT,  -- JSON blob of RoomSummary
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(world_uuid, user_uuid, room_uuid, visited_at)
);

CREATE INDEX idx_adventure_log_world_user
ON adventure_log_entries(world_uuid, user_uuid);
```

**Note:** Thin frames are stored in PNG metadata (`extensions.cardshark_thin_frame`), not SQLite. This enables world portability - when sharing a world, NPC identities travel with their character cards.

### Schema Additions to Existing Tables

```sql
-- Add to chat_sessions table
ALTER TABLE chat_sessions ADD COLUMN compressed_history TEXT;
ALTER TABLE chat_sessions ADD COLUMN last_compressed_at INTEGER DEFAULT 0;
ALTER TABLE chat_sessions ADD COLUMN context_snapshot_json TEXT;
```

---

## Frontend Component Changes

### New Components

```
frontend/src/
├── components/
│   └── transition/
│       ├── LoadingScreen.tsx       # Full-screen loading overlay
│       ├── TransitionProgress.tsx  # Progress indicators
│       └── TransitionPhaseIcon.tsx # Phase-specific icons
├── services/
│   └── context/
│       ├── ContextAssembler.ts     # Assembles context from sources
│       ├── ContextSerializer.ts    # Converts to LLM format
│       ├── ContextCache.ts         # LRU cache with persistence
│       └── sources/
│           ├── CharacterSource.ts
│           ├── WorldSource.ts
│           ├── RoomSource.ts
│           ├── LoreSource.ts
│           ├── SessionSource.ts
│           ├── AdventureLogSource.ts
│           └── ThinFrameSource.ts
├── managers/
│   └── RoomTransitionManager.ts    # Orchestrates transitions
└── hooks/
    ├── useContextSnapshot.ts       # Hook for accessing context
    ├── useRoomTransition.ts        # Hook for transition state
    └── useAdventureLog.ts          # Hook for adventure history
```

### LoadingScreen Component

No skip button - loading completes or fails with automatic fallback after timeout.

```typescript
interface LoadingScreenProps {
  visible: boolean;
  targetRoomName: string;
  phase: TransitionPhase;
  progress: TransitionProgress;
  flavorText?: string;  // Optional travel narrative
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  visible,
  targetRoomName,
  phase,
  progress,
  flavorText,
}) => {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-8 max-w-md w-full border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-2">
          Traveling to {targetRoomName}...
        </h2>

        {flavorText && (
          <p className="text-gray-400 text-sm mb-6 italic">
            {flavorText}
          </p>
        )}

        <div className="space-y-3">
          <TransitionProgress
            label="Summarizing journey"
            status={progress.summarization}
            active={phase === 'summarizing'}
          />
          <TransitionProgress
            label="Preparing the scene"
            status={progress.assetPreload}
            active={phase === 'loading_assets'}
          />
          <TransitionProgress
            label="Meeting the locals"
            status={progress.thinFrameGeneration}
            active={phase === 'generating_frames'}
          />
        </div>
      </div>
    </div>
  );
};
```

**Timeout behavior:** If any phase exceeds 30 seconds, fallback to truncation and continue. No user intervention needed.

---

## Migration Strategy

### Phase 1: Loading Screen & Texture Fix (Essential)

**Goal:** Fix immediate bugs with minimal architecture changes.

1. Add `isTransitioning` state to WorldPlayView
2. Create LoadingScreen component
3. Move texture preloading into `performRoomTransition`
4. Make state updates atomic (room + npcs together)
5. Add progress tracking for loading phases

**Bug fixes achieved:** Image flickering, NPC flicker, state race conditions

**Estimated scope:** ~500 lines changed, 2 new components

### Phase 2: NPC Thin Frames (Essential)

**Goal:** Fix NPC identity loss with portable thin frames.

1. Define thin frame schema in `extensions.cardshark_thin_frame`
2. Add thin frame generation to character save flow (when description/personality changes)
3. Add spinner to Basic Info save button during generation
4. Update `buildThinNPCContext()` to use thin frame from PNG metadata
5. Add generation during room load for NPCs missing thin frames
6. Add backend endpoint `/api/context/generate-thin-frame`

**Bug fix achieved:** NPC identity preservation

**Estimated scope:** ~400 lines changed, 1 new endpoint, 1 new service

### Phase 3: Room Summarization (Essential)

**Goal:** Compress context on room transition, build adventure log.

1. Create `adventure_log_entries` table
2. Add SummarizationService with LLM + fallback
3. Add backend endpoint `/api/context/summarize-room`
4. Integrate summarization into loading screen flow
5. Create AdventureLogSource for persistence
6. Inject adventure log into new room context

**Feature achieved:** Room transition summaries, adventure continuity

**Estimated scope:** ~600 lines changed, 1 new table, 2 new services

### Phase 4: Architecture Cleanup

**Goal:** Put our toys away. Decompose god objects, establish clean layers.

1. Create `services/context/` directory structure
2. Implement ContextSource interfaces for all data types
3. Implement ContextAssembler (pure functions combining sources)
4. Implement ContextSerializer (converts to LLM format)
5. Extract logic from WorldPlayView into focused hooks
6. Extract logic from ChatContext into sources
7. Extract logic from PromptHandler into ContextSerializer
8. Deprecate old functions with console warnings
9. Remove deprecated code after testing

**Benefit:** Maintainability, testability, < 300 lines per file

**Estimated scope:** Large refactor, ~2000 lines moved/rewritten

---

## Phase 4: Full Architecture (Cleanup)

This section documents the target architecture for Phase 4. After Phases 1-3 deliver essential functionality, Phase 4 refactors the codebase to this structure.

### Target Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                          │
│  WorldPlayView, ChatView, LoadingScreen                          │
│  (React components - UI only, no business logic)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATION LAYER                         │
│  useWorldSession, useChatSession, useRoomTransition              │
│  (Hooks that coordinate between services)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CONTEXT ASSEMBLY LAYER                      │
│  ContextAssembler, ContextSerializer                             │
│  (Pure functions - builds context from sources)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CONTEXT SOURCES LAYER                       │
│  CharacterSource, WorldSource, RoomSource, LoreSource,           │
│  SessionSource, AdventureLogSource, ThinFrameSource              │
│  (Data access - fetches and caches raw data)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PERSISTENCE LAYER                           │
│  SQLite, LocalStorage, PNG Metadata                              │
│  (Storage backends)                                              │
└─────────────────────────────────────────────────────────────────┘
```

### ContextSnapshot (Immutable)

The fundamental unit of context passed to LLM calls. Replaces monolithic memory strings.

```typescript
interface ContextSnapshot {
  readonly id: string;                    // Unique snapshot ID
  readonly timestamp: number;             // Creation time
  readonly version: number;               // Schema version for migrations

  // Source data (what we're working with)
  readonly character: CharacterContext | null;
  readonly world: WorldContext | null;
  readonly room: RoomContext | null;
  readonly npcs: NPCContext[];
  readonly lore: LoreContext;
  readonly session: SessionContext;
  readonly adventure: AdventureContext;

  // Computed (derived from sources)
  readonly estimatedTokens: number;
  readonly compressionLevel: CompressionLevel;
}

type CompressionLevel = 'none' | 'light' | 'moderate' | 'aggressive';
```

### CharacterContext

```typescript
interface CharacterContext {
  readonly uuid: string;
  readonly name: string;
  readonly description: string;
  readonly personality: string;
  readonly scenario: string;
  readonly systemPrompt: string;
  readonly exampleDialogue: string;
  readonly postHistoryInstructions: string;
  readonly creatorNotes: string;

  // Expiration metadata
  readonly fieldExpiration: FieldExpirationConfig;
}

interface FieldExpirationConfig {
  readonly exampleDialogueExpiresAt: number;  // Message count
  readonly scenarioExpiresAt: number;
  readonly creatorNotesExpiresAt: number;
}
```

### WorldContext

```typescript
interface WorldContext {
  readonly uuid: string;
  readonly name: string;
  readonly description: string;
  readonly scenario: string;
  readonly currentDay: number;
  readonly timeOfDay: number;  // 0.0 - 1.0
}
```

### RoomContext

```typescript
interface RoomContext {
  readonly uuid: string;
  readonly name: string;
  readonly description: string;
  readonly introduction: string;
  readonly atmosphere: string;
  readonly exits: RoomExit[];
}

interface RoomExit {
  readonly direction: 'north' | 'south' | 'east' | 'west';
  readonly targetRoomUuid: string;
  readonly targetRoomName: string;
}
```

### NPCContext

```typescript
interface NPCContext {
  readonly uuid: string;
  readonly name: string;
  readonly allegiance: 'friendly' | 'neutral' | 'hostile';
  readonly relationshipTier: AffinityTier;
  readonly affinityScore: number;

  // Full context (for bonded ally or active conversation target)
  readonly fullCard: CharacterContext | null;

  // Thin frame (LLM-generated summary for background awareness)
  readonly thinFrame: NPCThinFrame | null;
}
```

### LoreContext

```typescript
interface LoreContext {
  readonly activeEntries: LoreEntry[];
  readonly stickyEntries: LoreEntry[];    // Persist across messages
  readonly totalTokens: number;
  readonly budgetRemaining: number;
}
```

### SessionContext

```typescript
interface SessionContext {
  readonly uuid: string;
  readonly notes: string;                  // User-editable
  readonly messageCount: number;
  readonly compressionEnabled: boolean;
  readonly lastCompressedAt: number;       // Message count when last compressed
  readonly compressedHistory: string;      // Summarized older messages
}
```

### Context Source Interface

Each source is responsible for fetching and caching one type of data.

```typescript
interface ContextSource<T> {
  // Get cached value or fetch fresh
  get(id: string): Promise<T | null>;

  // Force refresh from storage
  refresh(id: string): Promise<T | null>;

  // Invalidate cache entry
  invalidate(id: string): void;

  // Check if cache entry exists and is valid
  has(id: string): boolean;
}
```

### Source Implementations

| Source | Cache Strategy | Invalidation Triggers |
|--------|---------------|----------------------|
| `CharacterSource` | LRU (50 entries) | Character edited, PNG re-imported |
| `WorldSource` | Single entry (current world) | World changed |
| `RoomSource` | LRU (10 entries) | Room edited |
| `LoreSource` | Per-character, message-keyed | Character changed, lore edited |
| `SessionSource` | Single entry (current session) | Session changed, explicit save |
| `AdventureLogSource` | Per-world-user pair | Room transition, explicit save |
| `ThinFrameSource` | LRU (30 entries) | Character edited |

### ContextAssembler

Pure functions that combine sources into a ContextSnapshot.

```typescript
class ContextAssembler {
  constructor(
    private readonly characterSource: CharacterSource,
    private readonly worldSource: WorldSource,
    private readonly roomSource: RoomSource,
    private readonly loreSource: LoreSource,
    private readonly sessionSource: SessionSource,
    private readonly adventureLogSource: AdventureLogSource,
    private readonly thinFrameSource: ThinFrameSource,
  ) {}

  /**
   * Assemble context for standard chat (no world)
   */
  async assembleChat(params: {
    characterUuid: string;
    sessionUuid: string;
    messageCount: number;
  }): Promise<ContextSnapshot> {
    const [character, session, lore] = await Promise.all([
      this.characterSource.get(params.characterUuid),
      this.sessionSource.get(params.sessionUuid),
      this.loreSource.get(params.characterUuid),
    ]);

    return this.buildSnapshot({
      character,
      world: null,
      room: null,
      npcs: [],
      lore,
      session,
      adventure: null,
    });
  }

  /**
   * Assemble context for world play (room narrator mode)
   */
  async assembleWorldNarrator(params: {
    worldUuid: string;
    roomUuid: string;
    userUuid: string;
    sessionUuid: string;
  }): Promise<ContextSnapshot> {
    const [world, room, session, adventure] = await Promise.all([
      this.worldSource.get(params.worldUuid),
      this.roomSource.get(params.roomUuid),
      this.sessionSource.get(params.sessionUuid),
      this.adventureLogSource.get(params.worldUuid, params.userUuid),
    ]);

    return this.buildSnapshot({
      character: world,  // World card as character
      world,
      room,
      npcs: [],
      lore: null,
      session,
      adventure,
    });
  }

  /**
   * Assemble context for NPC conversation (thin frame)
   */
  async assembleNPCConversation(params: {
    npcUuid: string;
    worldUuid: string;
    roomUuid: string;
    userUuid: string;
    sessionUuid: string;
    bondedAllyUuid: string | null;
    otherNpcUuids: string[];
  }): Promise<ContextSnapshot> {
    // Fetch NPC thin frame + world + room + adventure
    // Build NPC awareness for others in room
  }

  /**
   * Assemble context for bonded ally (full context)
   */
  async assembleBondedAlly(params: {
    allyUuid: string;
    worldUuid: string;
    roomUuid: string;
    userUuid: string;
    sessionUuid: string;
    otherNpcUuids: string[];
  }): Promise<ContextSnapshot> {
    // Fetch ally full card + world + room + thin frames for others
  }

  private buildSnapshot(sources: SourceData): ContextSnapshot {
    // Pure function: combine sources, estimate tokens, determine compression
  }
}
```

### ContextSerializer

Converts ContextSnapshot to LLM-ready format.

```typescript
class ContextSerializer {
  /**
   * Serialize to memory string for LLM
   */
  toMemoryString(snapshot: ContextSnapshot, template: PromptTemplate): string {
    const sections: string[] = [];

    // Adventure log (if world play)
    if (snapshot.adventure && snapshot.adventure.entries.length > 0) {
      sections.push(this.serializeAdventureLog(snapshot.adventure));
    }

    // World context
    if (snapshot.world) {
      sections.push(this.serializeWorld(snapshot.world));
    }

    // Room context
    if (snapshot.room) {
      sections.push(this.serializeRoom(snapshot.room));
    }

    // Character context (with field expiration applied)
    if (snapshot.character) {
      sections.push(this.serializeCharacter(
        snapshot.character,
        snapshot.session.messageCount
      ));
    }

    // NPC awareness
    if (snapshot.npcs.length > 0) {
      sections.push(this.serializeNPCAwareness(snapshot.npcs));
    }

    // Lore entries
    if (snapshot.lore.activeEntries.length > 0) {
      sections.push(this.serializeLore(snapshot.lore));
    }

    // Session notes
    if (snapshot.session.notes) {
      sections.push(this.serializeSessionNotes(snapshot.session.notes));
    }

    // Compressed history (if any)
    if (snapshot.session.compressedHistory) {
      sections.push(this.serializeCompressedHistory(
        snapshot.session.compressedHistory
      ));
    }

    return sections.join('\n\n');
  }

  private serializeAdventureLog(adventure: AdventureContext): string {
    // Format: "Previously in your adventure: ..."
  }

  private serializeNPCAwareness(npcs: NPCContext[]): string {
    // Format each NPC's thin frame for background awareness
  }
}
```

### Phase 4 File Structure

```
frontend/src/
├── services/context/
│   ├── index.ts                    # Public exports
│   ├── ContextAssembler.ts         # Combines sources into snapshots
│   ├── ContextSerializer.ts        # Converts snapshots to LLM format
│   ├── ContextCache.ts             # LRU cache with persistence
│   └── sources/
│       ├── index.ts
│       ├── CharacterSource.ts
│       ├── WorldSource.ts
│       ├── RoomSource.ts
│       ├── LoreSource.ts
│       ├── SessionSource.ts
│       ├── AdventureLogSource.ts
│       └── ThinFrameSource.ts
├── hooks/
│   ├── useContextSnapshot.ts       # Hook for accessing context
│   ├── useWorldSession.ts          # Extracted from WorldPlayView
│   └── useChatSession.ts           # Extracted from ChatContext
└── types/
    └── context.ts                  # All context-related types
```

### God Object Decomposition

#### WorldPlayView.tsx (~2000 lines → ~400 lines)

Extract into:
- `useWorldSession.ts` - World state, room navigation, NPC management
- `useGridCombat.ts` - Already exists, keep as-is
- `useRoomTransition.ts` - Transition flow (Phase 1)
- `useNPCInteraction.ts` - Conversation/bonding logic
- `useAdventureLog.ts` - Adventure log access

#### ChatContext.tsx (~500 lines → ~150 lines)

Extract into:
- `SessionSource.ts` - Session state persistence
- `useChatSession.ts` - Chat generation orchestration
- `useMessageHistory.ts` - Message CRUD

#### PromptHandler.ts (~1000 lines → deprecate)

Replace with:
- `ContextAssembler.ts` - Context building
- `ContextSerializer.ts` - LLM format conversion
- Keep template loading as standalone utility

---

## Testing Strategy

### Unit Tests

```typescript
describe('ContextAssembler', () => {
  it('assembles chat context with character and session', async () => {
    const snapshot = await assembler.assembleChat({
      characterUuid: 'char-1',
      sessionUuid: 'session-1',
      messageCount: 10,
    });

    expect(snapshot.character).toBeDefined();
    expect(snapshot.session).toBeDefined();
    expect(snapshot.world).toBeNull();
  });

  it('applies field expiration based on message count', async () => {
    const snapshot = await assembler.assembleChat({
      characterUuid: 'char-1',
      sessionUuid: 'session-1',
      messageCount: 50,  // Past expiration threshold
    });

    // Example dialogue should be expired
    expect(snapshot.character.exampleDialogue).toBe('');
  });
});

describe('RoomTransitionManager', () => {
  it('transitions through all phases in order', async () => {
    const phases: TransitionPhase[] = [];
    manager.subscribe(state => phases.push(state.phase));

    await manager.transition({ ... });

    expect(phases).toEqual([
      'initiating',
      'summarizing',
      'loading_assets',
      'generating_frames',
      'ready',
    ]);
  });

  it('handles summarization failure gracefully', async () => {
    summarizationService.summarizeRoom.mockRejectedValue(new Error('LLM failed'));

    const result = await manager.transition({ ... });

    expect(result.success).toBe(true);  // Should continue with fallback
  });
});

describe('SummarizationService', () => {
  it('uses fallback when LLM fails', async () => {
    apiClient.generateStructured.mockRejectedValue(new Error('API error'));

    const summary = await service.summarizeRoom({ ... });

    expect(summary).toBeDefined();
    expect(fallbackSummarizer.extractRoomSummary).toHaveBeenCalled();
  });
});
```

### Integration Tests

```typescript
describe('Room Transition Flow', () => {
  it('preserves NPC images after transition', async () => {
    // Enter world
    await enterWorld(testWorld);

    // Navigate to room with NPCs
    await navigateToRoom(testRoom);

    // Verify NPCs have images
    const npcSprites = screen.getAllByTestId('entity-sprite');
    for (const sprite of npcSprites) {
      expect(sprite).not.toHaveStyle({ backgroundColor: 'white' });
    }

    // Navigate to another room
    await navigateToRoom(anotherRoom);

    // Navigate back
    await navigateToRoom(testRoom);

    // Verify NPCs still have images
    const npcSpritesAfter = screen.getAllByTestId('entity-sprite');
    for (const sprite of npcSpritesAfter) {
      expect(sprite).not.toHaveStyle({ backgroundColor: 'white' });
    }
  });

  it('generates adventure log entries on room transition', async () => {
    await enterWorld(testWorld);
    await navigateToRoom(roomA);

    // Have a conversation
    await sendMessage('Hello');
    await waitForResponse();

    // Navigate away
    await navigateToRoom(roomB);

    // Check adventure log
    const log = await getAdventureLog(testWorld.uuid, testUser.uuid);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].roomName).toBe(roomA.name);
  });
});
```

### E2E Tests

```typescript
describe('World Play E2E', () => {
  it('maintains NPC identity across room transitions', async () => {
    // Enter world with NPC "Marcus the Blacksmith"
    await page.goto('/world/test-world');

    // Click on Marcus
    await page.click('[data-npc-name="Marcus"]');

    // Send greeting
    await page.fill('[data-testid="chat-input"]', 'Hello!');
    await page.click('[data-testid="send-button"]');

    // Wait for response
    await page.waitForSelector('[data-testid="assistant-message"]');

    // Verify Marcus responds as Marcus (not generic NPC)
    const response = await page.textContent('[data-testid="assistant-message"]');
    expect(response).toContain('Marcus');  // Or other identity markers
    expect(response).not.toContain('I am an NPC');  // No generic responses
  });

  it('shows loading screen during room transition', async () => {
    await page.goto('/world/test-world');

    // Click room exit
    await page.click('[data-testid="exit-north"]');

    // Loading screen should appear
    await page.waitForSelector('[data-testid="loading-screen"]');
    expect(await page.isVisible('[data-testid="loading-screen"]')).toBe(true);

    // Wait for transition
    await page.waitForSelector('[data-testid="loading-screen"]', { state: 'hidden' });

    // New room should be loaded
    expect(await page.textContent('[data-testid="room-name"]')).toBe('New Room');
  });
});
```

---

## Performance Considerations

### Caching Strategy

| Cache | Size | TTL | Persistence |
|-------|------|-----|-------------|
| CharacterSource | 50 entries | Session | Memory |
| RoomSource | 10 entries | Session | Memory |
| ThinFrameSource | 30 entries | Permanent | PNG metadata |
| AdventureLogSource | Per world/user | Permanent | SQLite |
| TextureCache | 100 textures | Session | Memory |

**ThinFrameSource special handling:** Memory cache is read-through from PNG metadata. Regeneration only occurs when description/personality changes on save.

### Parallel Operations

During room transition, run in parallel:
- Texture preloading
- Thin frame generation (with concurrency limit of 3)

Summarization must complete before transition (sequential).

### Token Budget

| Context Section | Max Tokens | Priority |
|-----------------|------------|----------|
| System prompt | 500 | Highest |
| Character description | 400 | High |
| Adventure log | 300 | Medium |
| Room description | 200 | Medium |
| NPC awareness | 150 | Medium |
| Lore entries | 300 | Variable |
| Session notes | 200 | Low |
| Compressed history | 500 | Low |

Total budget: ~2500 tokens for context, leaving room for conversation.

---

## Fallback Strategies

### LLM Unavailable

| Operation | Fallback |
|-----------|----------|
| Room summarization | Extract key messages by keyword matching |
| Thin frame generation | Truncate description to first 2 sentences |
| Message compression | Keep N most recent messages |

### Slow Generation

If thin frame generation takes > 30 seconds total:
- Use truncation fallback for remaining NPCs
- Log slow generation for performance analysis
- NPCs get proper thin frames on next visit (lazy regeneration)

### Database Unavailable

- In-memory caching continues to work
- Persistence disabled until reconnection
- User warned of potential data loss

---

## Security Considerations

### Data Isolation

- Adventure logs scoped by world_uuid AND user_uuid
- Thin frames are character-specific (shared across users)
- Session data isolated by chat_session_uuid

### Input Validation

- All schema fields have max lengths
- Zod validation on frontend and Pydantic on backend
- LLM outputs validated against schema before storage

### Rate Limiting

- Thin frame generation: max 10 per minute per user
- Room summarization: max 5 per minute per user
- Applies to LLM calls, not cache hits

---

## Success Metrics

### Bug Fixes

- [ ] NPC images persist after room transition (0 reports of missing images)
- [ ] NPCs maintain identity on first interaction (0 reports of fabricated identity)
- [ ] No flicker of old NPCs during transition

### Feature Delivery

- [ ] Loading screen appears during room transitions
- [ ] Adventure log accumulates across room visits
- [ ] Adventure log injected into LLM context
- [ ] Thin frames generated for friendly NPCs

### Performance

- [ ] Room transition < 10 seconds on average hardware
- [ ] Context assembly < 100ms (cache hit)
- [ ] Memory usage stable (no leaks from caching)

### Code Quality (Phase 4)

- [ ] WorldPlayView reduced to < 500 lines (UI only)
- [ ] ChatContext reduced to < 200 lines (state only)
- [ ] PromptHandler deprecated, replaced by ContextAssembler + ContextSerializer
- [ ] No god objects (max 300 lines per file)
- [ ] All context logic in `services/context/` layer
- [ ] Test coverage > 80% for new code

---

## Appendix A: File Inventory (What Changes)

### Phase 1-3 Files (Essential)

```
frontend/src/
├── components/transition/           # NEW
│   ├── LoadingScreen.tsx            # Full-screen loading overlay
│   └── TransitionProgress.tsx       # Progress bar component
├── services/                        # NEW
│   ├── ThinFrameService.ts          # Thin frame generation + caching
│   ├── SummarizationService.ts      # Room summarization
│   └── AdventureLogService.ts       # Adventure log persistence
├── hooks/                           # NEW
│   └── useRoomTransition.ts         # Transition state management
└── types/
    └── context.ts                   # NEW - Thin frame, adventure log types

backend/
├── endpoints/
│   └── context_endpoints.py         # NEW - /api/context/* endpoints
├── services/
│   ├── summarization_service.py     # NEW
│   ├── thin_frame_service.py        # NEW
│   └── adventure_log_service.py     # NEW
└── models/
    └── adventure_log.py             # NEW - Pydantic models
```

### Modified Files (Phase 1-3)

```
frontend/src/
├── views/WorldPlayView.tsx          # Add transition flow, loading screen
├── utils/worldCardAdapter.ts        # Update buildThinNPCContext to use PNG metadata
├── components/world/pixi/local/
│   └── LocalMapView.tsx             # Texture preload coordination
├── components/SidePanel/
│   └── BasicInfoGreetings.tsx       # Add spinner for thin frame generation on save
└── types/
    ├── schema.ts                    # Add cardshark_thin_frame to extensions
    └── worldRuntime.ts              # Add adventure log types

backend/
├── api_provider_adapters.py         # Add structured JSON output support
├── services/character_service.py    # Thin frame generation on save
└── handlers/png_metadata_handler.py # Read/write thin frame from extensions
```

### Phase 4 Files (Cleanup)

```
frontend/src/
├── services/context/                # NEW - Full context layer
│   ├── index.ts
│   ├── ContextAssembler.ts
│   ├── ContextSerializer.ts
│   ├── ContextCache.ts
│   └── sources/
│       ├── index.ts
│       ├── CharacterSource.ts
│       ├── WorldSource.ts
│       ├── RoomSource.ts
│       ├── LoreSource.ts
│       ├── SessionSource.ts
│       ├── AdventureLogSource.ts
│       └── ThinFrameSource.ts
└── hooks/
    ├── useContextSnapshot.ts        # NEW
    ├── useWorldSession.ts           # NEW - Extracted from WorldPlayView
    ├── useChatSession.ts            # NEW - Extracted from ChatContext
    ├── useNPCInteraction.ts         # NEW - Extracted from WorldPlayView
    └── useMessageHistory.ts         # NEW - Extracted from ChatContext
```

### Refactored in Phase 4

```
frontend/src/
├── views/WorldPlayView.tsx          # ~2000 lines → ~400 lines (UI only)
├── contexts/ChatContext.tsx         # ~500 lines → ~150 lines (state only)
└── handlers/promptHandler.ts        # ~1000 lines → deprecated
```

### Deprecated After Phase 4

```
frontend/src/
├── utils/worldCardAdapter.ts        # buildThinNPCContext becomes thin wrapper
└── handlers/promptHandler.ts        # createMemoryContext (parts extracted)
```

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Context Snapshot** | Immutable object containing all context for an LLM call |
| **Thin Frame** | LLM-generated summary of an NPC's key characteristics |
| **Adventure Log** | Cumulative history of room visits and interactions |
| **Room Summary** | Structured summary of what happened in a room |
| **Context Source** | Service that fetches and caches one type of context data |
| **Transition Phase** | Stage of the room transition process |
| **Field Expiration** | Character fields that drop out of context after N messages |

---

## Appendix C: Resolved Design Decisions

These questions were raised during spec creation and resolved:

| Question | Resolution |
|----------|------------|
| Thin frame refresh policy | Regenerate only when `description` or `personality` changes on save. Thin frame = identity only. World state tracked separately. |
| Adventure log pruning | TBD - defer until we see actual log sizes in practice |
| Skip behavior | **No skip button.** Loading completes or auto-fallbacks after 30s timeout. |
| Multi-world support | Thin frames stored in PNG metadata, shared across all worlds. They represent character identity, not world-specific state. |
| Offline pre-generation | **No.** Lazy load only. Generate on first room load or on character save. |

---

*End of Specification*
