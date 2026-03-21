# CardShark Project Structure

## Root Directory Organization

### Core Application
- `backend/` - Python FastAPI server with modular endpoint structure
- `frontend/` - React TypeScript application with Vite build system
- `start.py` - Development server launcher (runs both frontend and backend)
- `build.py` - Production build script with PyInstaller executable creation

### Data Directories
- `characters/` - Character PNG files with embedded metadata and UUIDs
- `characters/worlds/` - World PNG cards (V2 format with world_data extensions)
- `characters/rooms/` - Room PNG cards (V2 format with room_data extensions)
- `backgrounds/` - Background images with metadata.json for chat customization
- `users/` - User profile PNGs with embedded metadata
- `templates/` - Chat prompt templates in JSON format
- `content_filters/` - Content moderation filters (builtin/ and custom)
- `uploads/` - User-uploaded files and rich text editor images

### Configuration & Logs
- `settings.json` - Global application configuration
- `logs/` - Build and runtime logs for debugging
- `cardshark.sqlite` - Main SQLite database file

## Backend Structure (`backend/`)

### Core Files
- `main.py` - FastAPI app initialization, middleware, and route registration
- `database.py` - SQLAlchemy database setup and session management
- `sql_models.py` - Database table definitions
- `schemas.py` - Pydantic models for API request/response validation
- `dependencies.py` - FastAPI dependency injection setup

### Endpoint Modules (Routers)
- `*_endpoints.py` - FastAPI routers for specific feature areas:
  - `character_endpoints.py` - Character CRUD and metadata operations
  - `chat_endpoints.py` - Chat session management and message handling
  - `world_endpoints.py` - World Cards system APIs
  - `settings_endpoints.py` - Application configuration
  - `template_endpoints.py` - Prompt template management
  - `room_endpoints.py` - Chat room management
  - `background_endpoints.py` - Background image handling
  - `content_filter_endpoints.py` - Content moderation APIs
  - `generation_endpoints.py` - LLM generation (streaming, greetings, impersonation)
  - `health_endpoints.py` - Health check and LLM status
  - `file_upload_endpoints.py` - Image uploads for rich text editor

### Business Logic (`handlers/`, `services/`)
- `handlers/` - Request/response handlers for specific domains:
  - `background_api.py` - Background image operations
  - `character_image_handler.py` - Character image management
  - `room_card_handler.py` - Room card operations
  - `world_card_chat_handler.py` - World card chat integration
  - `world_chat_handler.py` - World chat operations
- `services/` - Business logic services:
  - `character_service.py` - Character CRUD and management
  - `character_lore_service.py` - Lore book synchronization
  - `character_sync_service.py` - PNG-to-database synchronization
  - `character_indexing_service.py` - Character search indexing
  - `chat_service.py` - Chat session orchestration
  - `world_card_service.py` - World card business logic
  - `world_export_service.py` - World ZIP export/import
  - `adventure_log_service.py` - Adventure log persistence (Context Management V2)
  - `summarization_service.py` - LLM-based room summarization (Context Management V2)
- `utils/` - Utility functions and helpers
  - `cross_drive_static_files.py` - Static file serving across drives
- `models/` - Pydantic data models
- `errors.py` - Custom exception definitions

### Specialized Components
- `png_metadata_handler.py` - PNG EXIF metadata reading/writing
- `api_handler.py` - AI provider integration and streaming
- `koboldcpp_manager.py` - KoboldCPP local AI integration
- `settings_manager.py` - Configuration file management

## Frontend Structure (`frontend/src/`)

### Core Application
- `main.tsx` - React application entry point
- `App.tsx` - Main component with routing setup
- `index.css` - Global Tailwind CSS styles

### Feature Organization
- `components/` - Reusable UI components
  - `chat/` - Chat interface components
    - `ChatView.tsx` - Main chat interface
    - `ChatBubble.tsx`, `ChatHeader.tsx`, `ChatInputArea.tsx` - Chat sub-components
  - `combat/` - Grid combat system components
    - `GridCombatHUD.tsx` - Combat action buttons and status display
    - `CombatLogPanel.tsx` - Turn-by-turn combat log
    - `CombatEndScreen.tsx` - Victory/defeat results with rewards display
    - `pixi/` - Shared PixiJS utilities (TextureCache, AnimationManager, ParticleSystem, easing)
  - `world/` - World navigation and local map
    - `PlayViewLayout.tsx` - Unified play view layout (map + chat side-by-side)
    - `AffinityHearts.tsx` - NPC relationship heart display
    - `DayNightSphere.tsx` - Time of day rotating icon
    - `NPCShowcase.tsx`, `NPCCard.tsx` - NPC interaction components
    - `PartyGatherModal.tsx` - Ally gathering for room transitions
    - `RoomLayoutDrawer.tsx` - Room layout editor drawer for NPC spawns and dead zones
    - `RoomLayoutCanvas.tsx` - CSS Grid editor overlay for room spatial configuration
    - `pixi/` - PixiJS world map rendering
      - `PixiMapModal.tsx` - World map modal
      - `WorldMapStage.ts` - World grid renderer
      - `local/` - Local map (room-level tile grid)
        - `LocalMapView.tsx` - React wrapper for local map
        - `LocalMapStage.ts` - Pixi stage for tile grid
        - `LocalMapTile.ts` - Individual tile rendering
        - `EntityCardSprite.ts` - NPC/player portrait cards on grid
        - `CardAnimationController.ts` - Animation system for entity cards (entrance, movement, attack, death, revival, particles)
        - `CombatParticleSystem.ts` - Combat visual effects
  - `inventory/` - Equipment and inventory management
    - `InventoryModal.tsx` - Inventory UI
  - `SidePanel/` - Unified side panel with mode-based rendering
  - `CharacterGallery.tsx` - Character browsing and selection
  - `APISettingsView.tsx` - AI provider configuration
- `views/` - Page-level components
  - `WorldCardsView.tsx` - World management interface
  - `WorldPlayView.tsx` - Main gameplay orchestrator (local map, chat, combat, inventory)
- `contexts/` - React Context providers for state management
- `hooks/` - Custom React hooks for shared logic
  - `useGridCombat.ts` - Grid combat state management and AI turn execution
  - `useWorldSession.ts` - World card loading, progress, runtime state
  - `useRoomTransition.ts` - Room navigation state machine, asset preloading
  - `useNPCInteraction.ts` - Conversation, bonding, multi-speaker parsing
  - `useAdventureLog.ts` - Adventure context injection into session
  - `useContextSnapshot.ts` - Context assembly and serialization
  - `useScrollToBottom.ts`, `useEmotionDetection.ts`, `useChatMessages.ts`, etc.
- `services/combat/` - Combat engine and support services
  - `gridCombatEngine.ts` - Pure reducer-based grid combat engine
  - `gridEnemyAI.ts` - Tactical enemy AI with flanking and range awareness
  - `gridCombatAnimations.ts` - Combat animation sequences
  - `combatMapSync.ts` - LocalMapState <-> GridCombatState synchronization
  - `postCombatNarrative.ts` - AI narrative generation after combat
  - `combatResultContext.ts` - Structured combat results for AI context
- `services/context/` - Context Management V2 (layered architecture)
  - `ContextAssembler.ts` - Pure functions for assembling context snapshots
  - `ContextSerializer.ts` - Converts context to LLM-ready format
  - `ContextCache.ts` - TTL-based caching with presets
  - `sources/` - Data access layer for context components
    - `CharacterSource.ts` - Character card caching
    - `WorldSource.ts` - World card with progression
    - `RoomSource.ts` - Room card with NPC instance state
    - `SessionSource.ts` - Chat session state
    - `LoreSource.ts` - Lore entries and triggered images
    - `AdventureLogSource.ts` - Room summaries for narrative continuity
    - `ThinFrameSource.ts` - NPC thin frame generation and caching
- `services/thinFrameService.ts` - NPC thin frame generation with fallback
- `utils/` - Utility modules
  - `pathfinding.ts` - A* pathfinding for grid movement
  - `gridCombatUtils.ts` - Distance, LOS, flanking calculations
  - `localMapUtils.ts` - Local map generation and entity placement
  - `progressionUtils.ts` - XP, leveling, gold calculations
  - `affinityUtils.ts` - NPC relationship management
  - `sentimentAffinityCalculator.ts` - Conversation sentiment analysis
  - `combatAffinityCalculator.ts` - Combat-based affinity changes
  - `multiSpeakerParser.ts` - Multi-speaker LLM response parsing
  - `timeUtils.ts` - Day/night cycle time management
  - `worldCardAdapter.ts` - Thin frames, dual-speaker context building
- `api/` - API client modules for backend communication
- `types/` - TypeScript type definitions
  - `combat.ts` - Combat types (GridCombatant, GridCombatState, stats derivation)
  - `localMap.ts` - Tile grid types (TilePosition, LocalMapState, terrain, highlights, RoomLayoutData)
  - `inventory.ts` - Item and equipment types
  - `worldCard.ts` - World card V2 types with progression extensions
  - `worldRuntime.ts` - Runtime types (affinity, time, player state)
  - `context.ts` - Context Management V2 types (ContextSnapshot, ContextSource, ContextMode)
  - `transition.ts` - Room transition state machine types
  - `adventureLog.ts` - Adventure log and room summary types
  - `schema.ts` - NPCThinFrame schema in PNG extensions
- `components/transition/` - Room transition UI
  - `LoadingScreen.tsx` - Full-screen loading overlay during transitions
  - `TransitionProgress.tsx` - Progress bar for transition phases

### Build Configuration
- `vite.config.ts` - Vite build configuration with aliases
- `tailwind.config.js` - Tailwind CSS customization
- `jest.config.cjs` - Jest testing configuration
- `package.json` - Dependencies and npm scripts

## Key Architectural Patterns

### Backend Patterns
- **Router-based endpoints** - Each feature area has its own FastAPI router
- **Service layer separation** - Business logic separated from HTTP handling
- **Dependency injection** - Services injected via FastAPI dependencies
- **Standardized responses** - Consistent error handling and response formats

### Frontend Patterns
- **Context + Hooks** - State management without external libraries
- **Feature-based organization** - Components grouped by functionality
- **API abstraction** - Dedicated API client modules
- **Type-safe development** - Comprehensive TypeScript usage

### Data Flow
- **PNG metadata embedding** - Characters, worlds, and rooms stored as PNG files with JSON metadata
- **Streaming chat responses** - Server-sent events for real-time AI responses
- **PNG-based world persistence** - World cards store grid layout, room placements, and player progression
- **Database normalization** - SQLite for relational data (users, rooms, sessions)
- **Combat state flow** - LocalMapState -> GridCombatState (during combat) -> sync back to LocalMapState
- **Affinity flow** - Conversation sentiment + combat outcomes -> NPC relationship updates (daily capped)

### Context Management V2 Architecture
Layered architecture for LLM context assembly (see `.kiro/steering/context-management-v2.md` for full spec):

```
PRESENTATION LAYER
  WorldPlayView, ChatView, LoadingScreen
  (React components - UI only)
           │
           ▼
ORCHESTRATION LAYER
  useWorldSession, useRoomTransition, useNPCInteraction, useContextSnapshot
  (Hooks that coordinate between services)
           │
           ▼
CONTEXT ASSEMBLY LAYER
  ContextAssembler, ContextSerializer
  (Pure functions - builds context from sources)
           │
           ▼
CONTEXT SOURCES LAYER
  CharacterSource, WorldSource, RoomSource, SessionSource,
  LoreSource, AdventureLogSource, ThinFrameSource
  (Data access - fetches and caches raw data)
           │
           ▼
PERSISTENCE LAYER
  SQLite, PNG Metadata
```

**Key concepts:**
- **ContextSnapshot** - Immutable object containing all context for an LLM call
- **NPCThinFrame** - LLM-generated NPC summary stored in PNG extensions for identity preservation
- **AdventureLog** - Room summaries for narrative continuity across transitions
- **Transition state machine** - IDLE → INITIATING → SUMMARIZING → LOADING_ASSETS → GENERATING_FRAMES → READY