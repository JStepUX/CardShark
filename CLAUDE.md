# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CardShark is an AI chat application with interactive storytelling and character-driven conversations. It uses embedded PNG metadata for character management and supports world/room navigation with NPCs. Built exclusively by AI assistants (~98%).

**Stack:**
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS + PixiJS
- Backend: Python FastAPI + SQLite
- Build: PyInstaller for executable distribution

**Ports:**
- Frontend: 6969
- Backend: 9696

**License:** Proprietary

## Essential Commands

### Development

```bash
# Start both frontend and backend together (RECOMMENDED)
python start.py

# Frontend only
cd frontend
npm install
npm run dev        # Development server on port 6969
npm run build      # Production build
npm test           # Run tests with Jest
npm run test:watch # Watch mode

# Backend only
cd backend
pip install -r requirements.txt
python main.py     # Starts on port 9696
pytest             # Run backend tests
pytest --cov       # Run with coverage
```

### Building

```bash
# Build executable (⚠️ NEVER edit CardShark.spec directly!)
python build.py    # Generates CardShark.spec and builds EXE
```

**CRITICAL:** All build system changes MUST be made in `build.py`, specifically in the `create_spec_file()` function. The `CardShark.spec` file is generated and should never be manually edited.

## Architecture

### Backend Structure

```
backend/
├── main.py                    # FastAPI entry point (~590 lines)
├── *_endpoints.py             # Route handlers (root level)
│   ├── generation_endpoints.py    # LLM generation (streaming, greetings)
│   ├── health_endpoints.py        # Health check and LLM status
│   └── file_upload_endpoints.py   # Image uploads for rich text
├── endpoints/                 # Additional route handlers
│   ├── room_card_endpoints.py
│   └── world_card_endpoints_v2.py
├── services/                  # Business logic layer
│   ├── chat_service.py            # Core chat orchestration
│   ├── character_service.py       # Character CRUD (~1100 lines)
│   ├── character_lore_service.py  # Lore book sync
│   ├── character_sync_service.py  # PNG-to-DB sync at startup
│   ├── world_card_service.py      # World card business logic
│   ├── world_export_service.py    # World ZIP export/import
│   └── room_service.py
├── handlers/                  # Request/response handlers
│   ├── room_card_handler.py
│   ├── character_image_handler.py
│   └── png_metadata_handler.py
├── models/                    # Pydantic data models
└── utils/                     # Helper utilities
    └── cross_drive_static_files.py
```

### Frontend Structure

```
frontend/src/
├── components/       # UI components
│   ├── chat/         # Chat interface (ChatView.tsx, ChatBubble, ChatHeader, etc.)
│   ├── combat/       # Grid combat UI (GridCombatHUD, CombatLogPanel, CombatEndScreen)
│   │   └── pixi/     # Shared PixiJS utilities (TextureCache, AnimationManager, easing)
│   ├── world/        # World navigation and local map
│   │   ├── pixi/     # PixiJS world map (PixiMapModal, WorldMapStage)
│   │   │   └── local/ # Local map tile grid (LocalMapView, EntityCardSprite, etc.)
│   │   ├── PlayViewLayout.tsx  # Unified play view layout
│   │   ├── DayNightSphere.tsx  # Time of day indicator
│   │   └── AffinityHearts.tsx  # NPC relationship display
│   ├── inventory/    # Equipment and inventory management
│   ├── SidePanel/    # Mode-based side panel (world/character/assistant)
│   └── ...
├── views/           # Page-level components
│   ├── WorldCardsView.tsx  # World management
│   └── WorldPlayView.tsx   # Main gameplay orchestrator
├── contexts/        # React context providers
├── hooks/           # Custom React hooks
│   ├── useGridCombat.ts    # Grid combat state management
│   ├── useChatMessages.ts
│   └── ...
├── services/combat/ # Combat engine and support services
│   ├── gridCombatEngine.ts     # Pure reducer-based combat engine
│   ├── gridEnemyAI.ts          # Tactical enemy AI
│   ├── combatMapSync.ts        # Map <-> combat state sync
│   ├── gridCombatAnimations.ts # Combat visual effects
│   └── postCombatNarrative.ts  # AI narrative generation
├── handlers/        # Business logic
│   └── promptHandler.ts
├── api/             # Backend API clients
├── utils/           # Utility modules
│   ├── pathfinding.ts, gridCombatUtils.ts, localMapUtils.ts
│   ├── progressionUtils.ts, affinityUtils.ts, timeUtils.ts
│   └── multiSpeakerParser.ts, worldCardAdapter.ts
└── types/           # TypeScript definitions
    ├── combat.ts, localMap.ts, inventory.ts
    ├── worldCard.ts, worldRuntime.ts
    └── ...
```

### Data Directories

- `characters/` - Character PNG files with embedded metadata
- `characters/worlds/` - World PNG cards (V2 format)
- `characters/rooms/` - Room PNG cards (V2 format)
- `backgrounds/` - Background images with metadata.json
- `users/` - User profile PNGs
- `templates/` - Chat prompt templates (JSON)
- `content_filters/` - Content moderation filters (builtin/ and custom/)
- `logs/` - Application logs
- `cardshark.sqlite` - Main database file

## Core Concepts

### Character System

Characters are stored as PNG files with embedded JSON metadata in the EXIF `chara` field following the **SillyTavern Character Card V2 spec**.

- **Immutable ID:** Each character has a `character_uuid` that persists across renames and re-saves
- **Template tokens:** `{{char}}` and `{{user}}` are resolved at prompt time - never hardcode names
- **Compatibility:** Must maintain SillyTavern V2 spec compliance for ecosystem interoperability

### Chat System (SQLite)

All chat operations require a `chat_session_uuid` after session creation. SQLite is the source of truth; frontend caches state.

**Key Endpoints:**
- `POST /api/create-new-chat` - Create new session (returns `chat_session_uuid`)
- `POST /api/load-latest-chat` - Load existing session
- `POST /api/append-chat-message` - Add message to session
- `POST /api/chat/generate` - Generate AI response (streaming)

**Chat Modes:**
- **Assistant Mode:** Direct API chat without character context
- **Character Mode:** Character-driven chat with full persona

**Session Settings** (stored in database, auto-saved with debounce):
- `session_notes` - User-editable notes injected into AI context (2000 char limit)
- `compression_enabled` - Toggle for automatic message compression

**State flow:** Always handle API errors and refresh on doubt. Frontend state is a cache.

### World Cards System ("Cards All The Way Down")

Worlds and rooms are stored as PNG cards (V2 Character Card format with extensions):

- **World cards:** `characters/worlds/*.png` with `world_data` extension
  - Grid-based layout with room placements (room_uuid + grid_position)
  - Player position tracking
  - Export/import as `.cardshark.zip` archives
- **Room cards:** `characters/rooms/*.png` with `room_data` extension
  - Contains NPCs (referenced by character_uuid), events, descriptions
  - Introduction text and room descriptions
- **NPCs:** Characters assigned to rooms via `character_uuid` reference

**Migration note:** Prior to 2025-12, worlds/rooms used JSON files (`world_state.json`). Now they use PNG cards exclusively. Legacy `world_state_manager.py` references may exist but are deprecated.

### Grid Combat System

Tile-based tactical combat replacing the older slot-based system. Combat takes place on the local map (5x8 grid).

**Architecture:**
- **Engine:** `gridCombatEngine.ts` - Pure reducer: `gridCombatReducer(state, action) => { state, events }`
- **Hook:** `useGridCombat.ts` - React integration, AI turn scheduling, animation triggers
- **AI:** `gridEnemyAI.ts` - Tactical AI with flanking, threat assessment, ranged/melee behavior
- **Map sync:** `combatMapSync.ts` - Converts LocalMapState entities to GridCombatants and back

**Combat flow:**
1. Player enters hostile entity's threat zone on local map
2. `initializeCombatFromMap()` converts entities to GridCombatants
3. Turn-based: initiative order, 4 AP per turn
4. Actions: move (1 AP/tile), attack (2 AP), defend (1 AP), end turn, flee
5. Victory when all enemies defeated; defeat when player KO'd
6. `CombatEndScreen` displays rewards, then `handleCombatContinue` processes results

**Stats:** Single `monster_level` (1-60) determines all stats via `deriveGridCombatStats()`. Weapon type (melee/ranged) affects attack range (1 vs 3-5 tiles).

**Key types:** `GridCombatant` (extends Combatant with position/range), `GridCombatState`, `GridCombatAction`

### Local Map System

PixiJS-rendered tile grid for room-level exploration and combat.

- **Grid:** 5 columns x 8 rows, each tile has terrain type, traversability, highlights
- **Entities:** Player, NPCs, allies rendered as portrait card sprites with allegiance-colored frames
- **Exits:** Edge tiles with directional arrows for room transitions
- **Pathfinding:** A* algorithm in `pathfinding.ts` with terrain cost support
- **Threat zones:** Highlighted tiles around hostile entities showing engagement range
- **Key files:** `LocalMapView.tsx`, `LocalMapStage.ts`, `EntityCardSprite.ts`, `localMapUtils.ts`

### Room Layout Editor

World Builder tool for configuring spatial elements within rooms, accessed via the Layout button in Room Properties panel.

**Purpose:** Configure NPC spawn positions and dead zones for each room card.

**Data Model (`RoomLayoutData`):**
```typescript
interface RoomLayoutData {
  gridSize: { cols: number; rows: number };  // Matches local map grid (5x8)
  spawns: SpawnPoint[];                       // NPC initial positions
  deadZones: Zone[];                          // Water, walls, hazards, no-spawn areas
}
```

**Zone Types:**
- **Water:** Impassable terrain (blocks movement)
- **Wall:** Impassable terrain that also blocks vision
- **Hazard:** Traversable but dangerous terrain
- **No-Spawn:** Blocks NPC auto-placement only (players can walk through)

**Key Files:**
- `RoomLayoutDrawer.tsx` - Drawer component with tool mode tabs (NPCs, Dead Zones)
- `RoomLayoutCanvas.tsx` - CSS Grid editor overlay (not PixiJS)
- `localMap.ts` (types) - `RoomLayoutData`, `SpawnPoint`, `Zone`, `ZoneType`
- `localMapUtils.ts` - `autoPlaceEntities()` respects configured spawns and blocked zones
- `LocalMapView.tsx` - `buildMapState()` applies zone traversability to tile grid
- `room_card.py` (backend) - Pydantic models for persistence

**Integration with LocalMapStage:**
1. `autoPlaceEntities()` uses `layoutData.spawns` for configured positions
2. `buildMapState()` calls `getCellZoneType()` to set tile traversability
3. Water/walls set `traversable=false`, hazards set `terrainType='hazard'`
4. No-spawn zones only block `autoPlaceEntities()`, not player movement

### Inventory and Equipment

- **Types:** `types/inventory.ts` - InventoryItem, CharacterInventory
- **Weapon types:** Melee (range 1, +2 damage) and ranged (range 3-5, +1 damage)
- **Equipment slots:** Weapon and armor (armor is future-use)
- **UI:** `InventoryModal.tsx` for managing equipped items
- **Impact:** Equipped weapon determines combat attack range and bonus damage

### NPC Interaction: Conversation vs Bonding

Two-tier interaction system for NPCs in world play:

- **Conversation (talk):** Lightweight interaction using thin frame context (name + description only). No full character card loaded.
- **Bonding:** Full character card loaded into chat context. Bonded ally follows player between rooms.
- **Thin frames:** `buildThinNPCContext()` creates lightweight NPC summaries so bonded allies "know" about other NPCs in the room.
- **Multi-speaker:** `multiSpeakerParser.ts` detects and parses ally interjections in LLM responses (e.g., `[Aria]: *tugs sleeve* "Ask about the discount!"`)
- **Dual-speaker context:** `buildDualSpeakerContext()` instructs LLM to allow ally participation

### Affinity System

NPC relationship tracking with numeric scores and visual hearts:

- **Scale:** 0-100 with 5 tiers (Hostile, Stranger, Acquaintance, Friend, Best Friend)
- **Sources:** Sentiment analysis from conversations + combat participation rewards
- **Daily cap:** Maximum 60 affinity gain per NPC per day (prevents farming)
- **Display:** `AffinityHearts.tsx` - 0 to 5 hearts with partial fill
- **Key files:** `affinityUtils.ts`, `sentimentAffinityCalculator.ts`, `combatAffinityCalculator.ts`

### Day/Night Cycle

Message-based time progression (not real-time):

- **Config:** 50 messages = 1 full day cycle (configurable via TimeConfig)
- **Time of day:** 0.0 (dawn) to 1.0 (midnight), advances per message
- **UI:** `DayNightSphere.tsx` - rotating icon showing current time
- **Impact:** Affinity daily caps reset on new day
- **Key files:** `timeUtils.ts`, `types/worldRuntime.ts` (TimeState, TimeConfig)

### Progression System

XP, gold, and leveling for world gameplay:

- **XP formula:** Next level requires `100 * level^1.5` XP
- **XP sources:** Kill enemy (level * 10), incapacitate (level * 5)
- **Gold:** Enemy drops (level * 5 per enemy)
- **Level-up:** Triggers stat recalculation, displayed in CombatEndScreen
- **Persistence:** Stored in world card extensions (player_xp, player_level, player_gold)
- **Key files:** `progressionUtils.ts`, `types/worldCard.ts` (WorldData)

## Built-in Utilities (Don't Reinvent the Wheel)

Before adding dependencies, check if these already exist:

| Need | Use | Location |
|------|-----|----------|
| UUID generation | `generateUUID()` | `frontend/src/utils/generateUUID.ts` |
| Character UUID | `getCharacterUUID()` | `frontend/src/utils/generateUUID.ts` |
| UUID validation | `uuidUtils.ts` | `frontend/src/utils/uuidUtils.ts` |
| Debounce | `debounce(fn, delay)` | `frontend/src/utils/performance.ts` |
| Throttle | `throttle(fn, delay)` | `frontend/src/utils/performance.ts` |
| HTML to text | `htmlToText()`, `htmlToPlainText()` | `frontend/src/utils/contentUtils.ts` |
| Text to HTML | `textToHtmlParagraphs()` | `frontend/src/utils/contentUtils.ts` |
| Sanitize HTML | `sanitizeHtml()` | `frontend/src/utils/contentUtils.ts` |
| Create messages | `MessageUtils.createUserMessage()` | `frontend/src/utils/messageUtils.ts` |
| Debounced save | `MessageUtils.createDebouncedSave()` | `frontend/src/utils/messageUtils.ts` |
| Pathfinding | `findPath()`, `getReachableTiles()` | `frontend/src/utils/pathfinding.ts` |
| Combat math | `calculateDistance()`, `hasLineOfSight()` | `frontend/src/utils/gridCombatUtils.ts` |
| XP/Level | `calculateXPForNextLevel()`, `checkLevelUp()` | `frontend/src/utils/progressionUtils.ts` |
| Affinity | `calculateAffinityTier()`, `updateRelationshipAffinity()` | `frontend/src/utils/affinityUtils.ts` |
| Time | `advanceTime()`, `createDefaultTimeState()` | `frontend/src/utils/timeUtils.ts` |
| Multi-speaker | `parseMultiSpeakerResponse()` | `frontend/src/utils/multiSpeakerParser.ts` |
| Local map | `getSpawnPosition()`, `generateLocalMapState()` | `frontend/src/utils/localMapUtils.ts` |
| Combat stats | `deriveGridCombatStats()`, `createGridCombatant()` | `frontend/src/types/combat.ts` |
| Inventory | `createDefaultInventory()`, `equipWeapon()` | `frontend/src/types/inventory.ts` |

**Do NOT** add packages like `uuid`, `nanoid`, `lodash`, `sanitize-html` - we have lightweight implementations.

## Code Style & Conventions

### Python (Backend)
- **Async/await:** Use for all database operations and API calls
- **Type hints:** Required for all function parameters and returns
- **FastAPI patterns:** Dependency injection for services and database sessions
- **Pydantic v2:** All request/response validation with proper models
- **Error handling:** Custom exceptions from `errors.py`
- **Logging:** Use `log_manager.py` for consistent logging
- **File naming:** `*_endpoints.py`, `*_handler.py`, `*_service.py` or `*_manager.py`

### TypeScript (Frontend)
- **Strict TypeScript:** No `any` types allowed
- **React patterns:** Functional components with hooks only (no classes)
- **State management:** Context + custom hooks (no external state libraries)
- **Styling:** Tailwind CSS classes - avoid inline styles
- **Debug logging:** Use DEBUG flag constant to gate console.log statements (false for production)
- **File naming:** PascalCase for components (`.tsx`), camelCase for utilities (`.ts`)
- **Hooks:** `use*` prefix (e.g., `useChatMessages.ts`)

### Component Patterns
- **Mode-based components:** Components that adapt UI based on mode prop (e.g., SidePanel with world/character/assistant modes)
- **Debounced persistence:** Auto-save with debounce for user input (e.g., session notes with 1-2 second delay)
- **Character limits:** Enforce limits with visual feedback (gray → yellow → red as limit approaches)

## Development Patterns

### State Management

- **Local state:** `useState` for component-specific state
- **Complex state:** `useReducer` for multi-step state logic
- **Shared state:** Context API (ChatContext, CharacterContext, etc.)
- **Persistence:**
  - Chat → SQLite (via `/api/chat/*` endpoints)
  - Settings → `settings_manager.py` → `settings.json`
  - Characters/Worlds/Rooms → PNG metadata
  - Session settings → SQLite (session_notes, compression_enabled)

### API Integration

- Use existing patterns in `frontend/src/api/`
- Handle streaming responses with proper buffering
- Implement optimistic updates for writes
- Include comprehensive error handling
- Standardized error formats with proper HTTP status codes

### Build System Changes

When adding dependencies to the PyInstaller build:

1. Edit `build.py`, NOT `CardShark.spec`
2. Add hidden imports to `hidden_imports` list in `create_spec_file()`
3. Add data files to `backend_datas` or `frontend_datas` in `create_spec_file()`
4. Test the generated EXE after changes

## Chat API Usage Example

```typescript
// Create new chat session
const response = await apiService.postData('/api/create-new-chat', {
  character_id: 'optional_char_id' // null for Assistant Mode
});
const { chat_session_uuid } = response;

// Load existing chat
const chatData = await apiService.postData('/api/load-latest-chat', {
  character_id: 'some_char_id'
});

// Append message
await apiService.postData('/api/append-chat-message', {
  chat_session_uuid: chat_session_uuid,
  message: {
    role: 'user',
    content: 'Hello!',
    timestamp: Date.now()
  }
});

// Generate AI response
const response = await apiService.postData('/api/chat/generate', {
  chat_session_uuid: chat_session_uuid,
  prompt_data: { /* generation parameters */ }
});
```

## Key Invariants

1. **chat_session_uuid required:** All chat operations post-creation must include `chat_session_uuid`
2. **character_uuid immutable:** Set once, never changed. Survives renames and re-saves
3. **V2 format compatibility:** All character/world/room metadata must follow SillyTavern V2 spec
4. **Template tokens:** Never hardcode character/user names; use `{{char}}` and `{{user}}`
5. **Atomic file operations:** All critical writes use atomic patterns to prevent corruption

## Complexity Warnings

### ChatView.tsx
Has too many responsibilities: rendering, emotion detection, scroll management, hotkeys, settings, backgrounds. Consider decomposition when modifying.

### Template System
Changes ripple across multiple layers: `api_config` → `prompt_handler` → `character_context` → LLM request. Trace the full path before modifying.

### PNG Metadata
Binary format with ecosystem constraints. Breaking V2 spec compatibility affects SillyTavern import/export. Always test roundtrip with external tools.

### State Synchronization
Frontend vs backend state can diverge. SQLite is source of truth; frontend is cache. Handle silent failures by refreshing state on error or uncertainty.

### WorldPlayView.tsx
The main gameplay orchestrator (~2000+ lines). Manages: local map, grid combat, NPC interactions, bonding, room transitions, day/night cycle, affinity, progression, inventory, multi-speaker, combat end screen. Consider decomposition when modifying. Key state flows:
- Room transition: navigate -> party gather -> load room -> spawn entities on local map
- Combat: threat zone entry -> initializeCombatFromMap -> useGridCombat -> CombatEndScreen -> handleCombatContinue
- NPC interaction: conversation (thin frame) -> bonding (full card) -> multi-speaker context

### Grid Combat Engine
Pure reducer pattern (`gridCombatReducer`). Changes to combat mechanics must go through actions dispatched to the reducer. Do not mutate state directly. The engine handles: movement, attacks (melee/ranged), defense, fleeing, initiative, knockouts, revives, overwatch zones.

### Combat-Map Synchronization
`combatMapSync.ts` bridges LocalMapState and GridCombatState. During combat, GridCombatState owns entity positions. After combat, results sync back. Breaking this sync causes entity position desync.

## Common Issues

**Port conflicts:**
```bash
# Windows
netstat -ano | findstr :6969
netstat -ano | findstr :9696
taskkill /PID <PID> /F
```

**Build issues:**
- Missing modules in EXE → Add to `hidden_imports` in `build.py`
- Missing data files → Add to `backend_datas`/`frontend_datas` in `build.py`
- Database issues → Check SQLite migration scripts

**Chat system issues:**
- Messages not appearing → Verify `chat_session_uuid` tracking
- History not loading → Check API endpoint responses
- Streaming issues → Inspect buffer management in message handlers

## Project Policy & Workflow

### Task-Driven Development (from .cursorrules)

- **No code changes without an agreed-upon task**
- All tasks must be associated with a Product Backlog Item (PBI)
- Task documentation: `docs/delivery/<PBI-ID>/<PBI-ID>-<TASK-ID>.md`
- PBI details: `docs/delivery/<PBI-ID>/prd.md`
- One task InProgress per PBI at a time
- Task status must be synchronized between task file and task index

### File Creation Policy

Do not create files outside:
- PBI structure (`docs/delivery/<PBI-ID>/prd.md`)
- Task structure (`docs/delivery/<PBI-ID>/<PBI-ID>-<TASK-ID>.md`)
- Source code required for implementation

Unless explicitly approved by the user.

### Constants and DRY Principles

- Use named constants for magic numbers and repeated values
- Define information in a single location, reference elsewhere
- Task details live in task files, not duplicated in PBIs
- Avoid duplication across documentation

### Testing Strategy

- Test proportional to complexity and risk
- Integration tests for multi-component features (start here for complex features)
- Mock external third-party services at app boundary (e.g., OpenAI, Claude)
- Use real instances for internal infrastructure (database, queues) in tests
- Each PBI requires an "E2E CoS Test" task for holistic testing
- Task-level test plans documented in task files under "## Test Plan"

### External Package Research

For any proposed tasks involving external packages:
1. Research documentation to avoid hallucinations
2. Create `<task-id>-<package>-guide.md` with fresh cache of API usage
3. Date-stamp and link to original docs
4. Include example snippets in project language

## Reference Documentation

### Essential Reading
- **CONTEXT.md** - System definition, domain terms, API contracts, state machines, file graph
  - Read this FIRST for understanding the system architecture
  - Contains state machine diagrams for chat sessions, modes, and world navigation
  - Defines all domain terms (Character, User, Chat, World, Room, NPC, Lore, Template)
  - Complete API endpoint contracts with request/response schemas
  - Entry points for modifying each major system area

- **AGENT.md** - Original development guide (predecessor to this file)
  - More detailed development patterns and troubleshooting
  - Implementation checklist and decision framework

- **.kiro/steering/conventions.md** - Detailed code conventions and patterns
  - Complete list of built-in utilities
  - Component patterns and best practices
  - Assistant Mode vs Character Mode details

- **.kiro/steering/product.md** - Product overview and core features
  - Target use cases and architecture philosophy

- **.kiro/steering/structure.md** - Detailed project structure
  - Directory organization and file purposes
  - Key architectural patterns and data flow

- **.kiro/steering/tech.md** - Technology stack details
  - All dependencies and their purposes
  - Setup commands for each component

### Policy Documentation
- **docs/.cursorrules** - Complete project policy and workflow rules
  - Task-driven development process
  - PBI and task management workflows
  - Testing strategy and documentation requirements
  - Version control and commit message formats

### When to Read What
- **Starting new feature:** Read CONTEXT.md for entry points, then relevant .kiro/steering docs
- **Modifying chat system:** CONTEXT.md (state machines + API contracts) + AGENT.md
- **Modifying world/room system:** CONTEXT.md (domain terms + file graph) + structure.md
- **Adding dependencies:** conventions.md (check built-in utilities first)
- **Build issues:** AGENT.md (troubleshooting) + this file (build commands)
- **Understanding architecture:** CONTEXT.md + structure.md + product.md
- **Creating tasks/PBIs:** docs/.cursorrules (complete workflow)
