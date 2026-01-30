# CardShark Code Conventions

## File Naming & Organization

### Backend Conventions
- **Endpoint files**: `*_endpoints.py` (e.g., `character_endpoints.py`, `world_endpoints.py`)
- **Handler classes**: `*_handler.py` (e.g., `png_metadata_handler.py`, `chat_handler.py`)
- **Service/Manager classes**: `*_service.py` or `*_manager.py` (e.g., `settings_manager.py`, `world_state_manager.py`)
- **Database models**: `sql_models.py` for SQLAlchemy, `schemas.py` for Pydantic
- **Business logic**: Organized in `handlers/` and `services/` directories
- **Utilities**: Group related functions in `utils/` directory
- **Models**: Pydantic data models in `models/` directory

### Frontend Conventions
- **Components**: PascalCase `.tsx` files (e.g., `ChatView.tsx`, `CharacterGallery.tsx`)
- **Views**: Page-level components in `views/` (e.g., `WorldCardsView.tsx`)
- **Hooks**: `use*` prefix (e.g., `useChatMessages.ts`, `useWorldState.ts`)
- **API clients**: `*Api.ts` suffix (e.g., `worldApi.ts`, `characterApi.ts`)
- **Types**: Defined in `types/` directory with descriptive names
- **Contexts**: React Context providers in `contexts/` directory

## Code Style Guidelines

### Python (Backend)
- **Async/await**: Use for all database operations and API calls
- **FastAPI patterns**: Dependency injection for services and database sessions
- **Pydantic v2**: All request/response validation with proper models
- **Type hints**: Required for all function parameters and returns
- **Error handling**: Custom exceptions from `errors.py`
- **Logging**: Use `log_manager.py` for consistent logging
- **PEP 8**: Follow Python style guidelines

### TypeScript (Frontend)
- **Strict TypeScript**: No `any` types allowed
- **React patterns**: Functional components with hooks only
- **State management**: Context + custom hooks (no external state libraries)
- **Styling**: Tailwind CSS classes - avoid inline styles
- **Error handling**: Proper error boundaries and loading states
- **Testing**: Jest with React Testing Library
- **Debug logging**: Use DEBUG flag constant to gate console.log statements (set to false for production)

### Built-in Utilities (Don't Reinvent)
Before adding a dependency or writing new utility code, check if these already exist:

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

**Do NOT** add packages like `uuid`, `nanoid`, `lodash`, `sanitize-html`, or similar - we have lightweight implementations.

### Component Patterns
- **Mode-based components**: Components that adapt UI based on mode prop (e.g., SidePanel with world/character/assistant modes)
- **Debounced persistence**: Auto-save with debounce for user input (e.g., session notes with 1-2 second delay)
- **Character limits**: Enforce limits with visual feedback (gray → yellow → red as limit approaches)

## Data Handling Patterns

### PNG Metadata System
- **Character storage**: PNG files with embedded JSON metadata using `character_uuid`
- **User profiles**: PNG files with embedded metadata in `/users/` directory
- **Atomic operations**: All file writes use atomic patterns to prevent corruption
- **Validation**: Pydantic models for metadata validation
- **Handler**: Use `png_metadata_handler.py` for all PNG metadata operations

### Chat Persistence (SQLite-based)
- **Database**: SQLite with `chat_session_uuid` as primary identifier
- **API endpoints**: `/api/create-new-chat`, `/api/load-latest-chat`, `/api/append-chat-message`
- **Service layer**: `backend/services/chat_service.py` handles all chat operations
- **Frontend integration**: Use `chat_session_uuid` for all chat API calls
- **Message storage**: All messages stored in database, not files
- **Session settings**: Per-session configuration stored in database:
  - `session_notes`: User-editable notes injected into AI context (2000 char limit)
  - `compression_enabled`: Toggle for automatic message compression
  - Auto-saved with debounce, loaded on session switch

### World Cards System ("Cards All The Way Down")
- **World cards**: `characters/worlds/*.png` with `world_data` extension (V2 Character Card format)
- **Room cards**: `characters/rooms/*.png` with `room_data` extension
- **Grid layout**: Worlds use grid-based room placements with player position tracking
- **Export/import**: `.cardshark.zip` archives for world distribution
- **API integration**: `world_endpoints.py` and `world_card_endpoints_v2.py` provide CRUD operations
- **Local maps**: Each room has a 5x8 tile grid with entity placement, exits, and terrain
- **Player progression**: Per-world XP, level, and gold tracked in world card extensions

### Combat System (Grid-Based)
- **Engine**: `gridCombatEngine.ts` - pure reducer pattern, tile-based positioning
- **Hook**: `useGridCombat.ts` - React hook managing combat state, AI turns, map sync
- **AI**: `gridEnemyAI.ts` - tactical AI with flanking, threat assessment, ranged behavior
- **Map sync**: `combatMapSync.ts` - bidirectional sync between LocalMapState and GridCombatState
- **Animations**: `gridCombatAnimations.ts` - combat visual effects on local map
- **Types**: `types/combat.ts` - GridCombatant, GridCombatState, GridCombatAction
- **Stat derivation**: Single `monster_level` (1-60) determines all combat stats via `deriveGridCombatStats()`
- **AP economy**: 4 AP per turn; move=1/tile, attack=2, defend=1

### Inventory System
- **Types**: `types/inventory.ts` - InventoryItem, CharacterInventory, weapon subtypes
- **Equipment**: Weapon slot (melee/ranged) and armor slot
- **Weapon types**: Melee (range 1) vs ranged (range 3-5), affects combat behavior
- **Defaults**: Starter iron sword and short bow
- **UI**: `InventoryModal.tsx` for equipment management

### Affinity System
- **Types**: `types/worldRuntime.ts` - NPCRelationship, AffinityTier (0-100 scale, 5 tiers)
- **Sources**: Sentiment-based (conversation analysis) and combat-based (ally participation)
- **Daily cap**: Maximum 60 affinity gain per NPC per day (prevents farming)
- **Utilities**: `affinityUtils.ts`, `sentimentAffinityCalculator.ts`, `combatAffinityCalculator.ts`
- **Display**: `AffinityHearts.tsx` - 0-5 hearts with partial fill

### NPC Interaction System
- **Conversation**: Lightweight talk with thin frame context (name, description only)
- **Bonding**: Full character card loaded, ally follows player between rooms
- **Thin frames**: `buildThinNPCContext()` - lightweight NPC summaries for ally room awareness
- **Multi-speaker**: `multiSpeakerParser.ts` - parses LLM responses for bonded ally interjections
- **Dual-speaker context**: `buildDualSpeakerContext()` - enables ally participation in conversations

### Day/Night Cycle
- **Time state**: `types/worldRuntime.ts` - TimeState (day counter, timeOfDay 0.0-1.0)
- **Progression**: Message-based (default 50 messages per day cycle)
- **UI**: `DayNightSphere.tsx` - rotating icon showing time of day
- **Utilities**: `timeUtils.ts` - time advancement and day detection

### Progression System
- **XP**: Level-based formula (100 * level^1.5 per level)
- **Gold**: Enemy drops (level * 5 per enemy)
- **Level-up**: Stat changes displayed in combat end screen
- **Persistence**: Stored in world card extensions (player_xp, player_level, player_gold)
- **Utilities**: `progressionUtils.ts` - XP thresholds, level calculation, gold drops

### API Communication Patterns
- **RESTful design**: Consistent endpoint naming and HTTP methods
- **Streaming responses**: Server-sent events for real-time AI chat
- **Error responses**: Standardized error formats with proper HTTP status codes
- **Request validation**: All requests validated with Pydantic schemas
- **Response formatting**: Consistent JSON response structures

### Persistence Architecture
- **Domain separation**: Each data type has dedicated storage mechanism
- **Atomic operations**: All critical writes use atomic file operations
- **Debounced saves**: Performance optimization for frequent updates
- **Validation patterns**: Schema validation before persistence
- **Error recovery**: Robust error handling with fallback strategies

## Assistant Mode vs Character Mode

### Assistant Mode
- **No character required**: Direct API communication without character context
- **Minimal payload**: User message + basic system prompt + API settings
- **Session management**: Still uses `chat_session_uuid` but without character association
- **UI indication**: Clear mode indicator in chat interface

### Character Mode  
- **Rich context**: Character description, personality, lore entries included
- **Character association**: `chat_session_uuid` linked to `character_id`
- **Full payload**: Complete character context sent to AI providers
- **Seamless switching**: Can load character without losing chat context

## Development Workflow Patterns

### Backend Development
- **Router organization**: Each feature area has dedicated FastAPI router
- **Service layer**: Business logic separated from HTTP handling
- **Dependency injection**: Services injected via FastAPI dependencies
- **Testing**: pytest with asyncio support and coverage reporting

### Frontend Development
- **Feature organization**: Components grouped by functionality
- **API abstraction**: Dedicated API client modules
- **Context usage**: React Context for state management
- **Type safety**: Comprehensive TypeScript usage throughout