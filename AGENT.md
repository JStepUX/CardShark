# AGENT.md - CardShark Development Guide

## Project Overview

CardShark is a React-based AI chat application with Python FastAPI backend. It specializes in interactive storytelling and character-driven conversations using embedded PNG metadata for character management.

## Architecture

- **Frontend**: React + TypeScript + Vite + Tailwind CSS (Port 6969)
- **Backend**: Python FastAPI (Port 9696)
- **Database**: SQLite for chat persistence
- **Build**: PyInstaller for executable distribution

## Development Environment

### Ports & Services
- **Frontend Dev Server**: http://localhost:6969
- **Backend API**: http://localhost:9696
- **API Base URL**: http://localhost:9696/api/

### Starting Services
```bash
python start.py  # Starts both backend and frontend together
```

### Common Commands
```bash
# Frontend
cd frontend
npm install
npm run dev
npm test
npm run build

# Backend
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
python main.py
pytest  # Run backend tests

# Build executable
python build.py  # Generates CardShark.spec and builds EXE
```

## Critical Build System Rules

**⚠️ NEVER edit `CardShark.spec` directly!** This file is generated by `build.py`.

### Build System Changes:
- **✅ DO**: Edit `create_spec_file()` function in `build.py`
- **❌ DON'T**: Manually edit `CardShark.spec`
- **✅ DO**: Modify hidden imports/data files in `build.py`

### Generated Files (Don't Edit):
- `CardShark.spec` - Generated by `build.py`
- `frontend/dist/*` - Generated by Vite
- `build/` and `dist/` directories

## Key Directories

### Backend (`backend/`)
- `main.py` - FastAPI app entry point
- `*_endpoints.py` - API route handlers
- `*_handler.py` / `*_manager.py` - Business logic
- `models/` - Pydantic data models
- `services/` - Domain services (especially `chat_service.py`)
- `utils/` - Helper utilities

### Frontend (`frontend/src/`)
- `components/` - UI components
- `views/` - Page-level components
- `contexts/` - React context providers
- `hooks/` - Custom React hooks
- `api/` - Backend API clients
- `types/` - TypeScript definitions

### Data Directories
- `worlds/` - World state and data
- `characters/` - Character PNG files with metadata
- `templates/` - Chat templates
- `backgrounds/` - Background images
- `users/` - User profile PNGs
- `logs/` - Application logs

## Core Features

### Character System
- PNG files with embedded JSON metadata
- Unique `character_uuid` for stable identification
- Character cards follow standardized format

### Chat System (SQLite-based)
- **Session Management**: Uses `chat_session_uuid` for persistence
- **Key Endpoints**:
  - `POST /api/create-new-chat` - Creates new session
  - `POST /api/load-latest-chat` - Loads existing session
  - `POST /api/append-chat-message` - Adds message to session
  - `POST /api/chat/generate` - Generates AI response
- **Modes**:
  - **Assistant Mode**: Direct API chat without character
  - **Character Mode**: Character-context chat with full persona

### World Cards System
- Dynamic environments with NPCs and events
- Room-based navigation with state persistence
- Integration with character system for NPCs

## Development Patterns

### React Best Practices
- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks
- Use TypeScript for type safety
- Follow existing state management patterns

### State Management
- `useState` for local component state
- `useReducer` for complex state logic
- Context API for shared state
- Domain-specific storage services:
  - Chat → SQLite via chat API endpoints
  - Settings → `settings_manager.py`
  - Characters → PNG metadata
  - Worlds → `world_state_manager.py`

### API Integration
- Use existing API service patterns
- Handle streaming responses with proper buffering
- Implement optimistic updates for write operations
- Include proper error handling and recovery

### Code Organization
- Group components by domain (chat, settings, templates, etc.)
- Follow existing directory structure
- Use proper imports/exports
- Keep styles close to components

## Chat API Usage Examples

```typescript
// Create new chat session
const response = await apiService.postData('/api/create-new-chat', {
  character_id: 'some_char_id' // Optional for Assistant Mode
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

## Common Issues & Solutions

### Port Conflicts
```bash
ps aux | grep node    # Find Node.js processes
ps aux | grep python  # Find Python processes
kill -9 <PID>         # Kill lingering processes
```

### Build Issues
- **Missing modules in EXE**: Add to `hidden_imports` in `build.py`
- **Missing data files**: Add to `backend_datas` or `frontend_datas` in `build.py`
- **Database issues**: Ensure SQLite database creation/migration is working

### Chat System Issues
- **Messages not appearing**: Check `chat_session_uuid` tracking
- **History not loading**: Verify API calls to chat endpoints
- **Streaming issues**: Check buffer management in message handling

## Decision Framework

When implementing features:
1. **Consistency**: Match existing patterns in codebase
2. **Simplicity**: Choose simplest solution that meets requirements
3. **Performance**: Optimize for chat responsiveness
4. **Extensibility**: Design for future enhancement without overengineering

### Implementation Checklist
- [ ] Does code handle all error states?
- [ ] Is state management optimized to prevent unnecessary re-renders?
- [ ] Are all user inputs properly validated?
- [ ] Does feature gracefully degrade if backend unavailable?
- [ ] Are user interactions properly debounced?
- [ ] Has accessibility been maintained?

## Testing

### Frontend
```bash
cd frontend
npm test  # Jest + React Testing Library
```

### Backend
```bash
cd backend
pytest  # Run all backend tests
```

## Troubleshooting

### Development Environment
- Always use CardShark-specific ports (6969/9696)
- Use `start.py` to launch both services
- Check for zombie processes if services won't start
- Verify `settings.json` configuration

### Build System
- Only modify `build.py` for PyInstaller changes
- Test generated EXE with fresh installations
- Check logs in `logs/` directory for build issues

### Data Persistence
- Chat: Check SQLite database integrity and API endpoints
- Characters: Verify PNG metadata embedding/extraction
- Worlds: Check JSON schema compliance in world state files
- Settings: Verify `settings.json` format and permissions

Remember: Keep solutions simple, follow existing patterns, and prioritize user experience in chat interactions.
