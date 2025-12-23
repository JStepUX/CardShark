# CardShark Project Structure

## Root Directory Organization

### Core Application
- `backend/` - Python FastAPI server with modular endpoint structure
- `frontend/` - React TypeScript application with Vite build system
- `start.py` - Development server launcher (runs both frontend and backend)
- `build.py` - Production build script with PyInstaller executable creation

### Data Directories
- `characters/` - Character PNG files with embedded metadata and UUIDs
- `worlds/` - World state JSON files, images, and location-specific chats
- `backgrounds/` - Background images with metadata.json for chat customization
- `users/` - User profile PNGs with embedded metadata
- `templates/` - Chat prompt templates in JSON format
- `content_filters/` - Content moderation filters (builtin/ and custom)
- `uploads/` - User-uploaded files and rich text editor images
- `chats/` - Chat history storage (JSONL/JSON files organized by character)

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

### Business Logic (`handlers/`, `services/`)
- `handlers/` - Core business logic classes
- `services/` - Service layer for complex operations
- `utils/` - Utility functions and helpers
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
  - `ChatView.tsx` - Main chat interface
  - `CharacterGallery.tsx` - Character browsing and selection
  - `WorldMap.tsx` - World Cards navigation interface
  - `APISettingsView.tsx` - AI provider configuration
  - `SidePanel/` - Unified side panel with mode-based rendering
    - `SidePanel.tsx` - Main container with world/character/assistant modes
    - `SessionNotes.tsx` - Auto-saving notes with character limit
    - `CompressionToggle.tsx` - Message compression toggle
    - `types.ts` - TypeScript definitions
- `views/` - Page-level components
  - `WorldCardsView.tsx` - World management interface
  - `WorldPlayView.tsx` - World gameplay interface
- `contexts/` - React Context providers for state management
- `hooks/` - Custom React hooks for shared logic
- `api/` - API client modules for backend communication
- `types/` - TypeScript type definitions and interfaces

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
- **PNG metadata embedding** - Characters stored as PNG files with JSON metadata
- **Streaming chat responses** - Server-sent events for real-time AI responses
- **File-based persistence** - JSON files for world state, chat history
- **Database normalization** - SQLite for relational data (users, rooms, sessions)