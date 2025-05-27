# Changelog

## [UNRELEASED] / [Version X.Y.Z] - YYYY-MM-DD

### Added
- New feature X.
- New endpoint Y.

### Changed
- Updated behavior of Z.

### Fixed
- Resolved bug A in component B.

---

## Chat Persistence & API Overhaul - 2025-05-27

This update focuses on the implementation of chat persistence using SQLite, significant backend API enhancements, and frontend corrections for robust chat functionality.

### Added
- Core SQLite-Based Chat Persistence:
    - Chat history is now stored in an SQLite database ([`cardshark.sqlite`](cardshark.sqlite)).
    - Introduced `chat_session_uuid` to manage and identify individual chat sessions.
- New Backend API Endpoints for chat operations:
    - `/api/create-new-chat`
    - `/api/load-latest-chat`
    - `/api/save-chat`
    - `/api/append-chat-message`
    - `/api/chat/generate`
- Developed [`backend/services/chat_service.py`](backend/services/chat_service.py) to handle database interactions for chat.
- New Pydantic models in [`backend/schemas.py`](backend/schemas.py) for chat-related data structures.

### Changed
- Improved error handling in frontend ([`frontend/src/services/chatStorage.ts`](frontend/src/services/chatStorage.ts), [`frontend/src/hooks/useChatMessages.ts`](frontend/src/hooks/useChatMessages.ts)) for API responses, such as `null` returns from `/api/load-latest-chat`.
- Code Hygiene: Resolved unused variable and parameter warnings in frontend TypeScript files:
    - [`frontend/src/handlers/promptHandler.ts`](frontend/src/handlers/promptHandler.ts)
    - [`frontend/src/services/chatStorage.ts`](frontend/src/services/chatStorage.ts)
    - [`frontend/src/hooks/useChatMessages.ts`](frontend/src/hooks/useChatMessages.ts)

### Fixed
- Resolved a 500 error on `/api/generate-greeting` due to an SSL configuration issue.
- Frontend Client Corrections for API Integration & State Management in [`frontend/src/services/chatStorage.ts`](frontend/src/services/chatStorage.ts) and [`frontend/src/hooks/useChatMessages.ts`](frontend/src/hooks/useChatMessages.ts):
    - Correctly construct payloads for the new chat API endpoints.
    - Reliably manage `chat_session_uuid` (capture, local storage, and inclusion in API requests).

---