# Backend API Organization Refactoring

**Status:** Phase 1 Complete, Phase 2 Complete, Phase 3.1 Complete, Phase 4 Complete, Phase 3.2 Pending
**Last Updated:** 2026-01-29
**Session Context:** This document captures progress for continuation in future sessions.

---

## Overview

This refactoring addresses backend code organization issues identified in analysis:
- `main.py` was 1,136 lines with embedded classes and inline endpoints
- `chat_endpoints.py` has 1,308 lines with duplicate "reliable" endpoint aliases
- `character_service.py` was 1,220 lines with mixed responsibilities (god object)

---

## Phase 1: High-Impact Extractions from main.py [COMPLETE]

**Result:** main.py reduced from 1,136 lines to 584 lines (49% reduction)

### 1.1 CrossDriveStaticFiles class [COMPLETE]
- **Source:** `main.py:46-96` (51 lines)
- **Destination:** `backend/utils/cross_drive_static_files.py`
- **Import in main.py:** `from backend.utils.cross_drive_static_files import CrossDriveStaticFiles`

### 1.2 Generation endpoints [COMPLETE]
- **Source:** `main.py:522-861` (339 lines)
- **Destination:** `backend/generation_endpoints.py`
- **Endpoints moved:**
  - `POST /api/generate` - streaming LLM generation
  - `POST /api/generate-greeting` - greeting generation
  - `POST /api/generate-impersonate` - user impersonation
  - `POST /api/generate-room-content` - room description generation
- **Setup function:** `setup_generation_router(logger, api_handler)`
- **Import in main.py:** `from backend.generation_endpoints import router as generation_router, setup_generation_router`

### 1.3 Health endpoints [COMPLETE]
- **Source:** `main.py:295-382` (88 lines)
- **Destination:** `backend/health_endpoints.py`
- **Endpoints moved:**
  - `GET /api/health` - health check
  - `GET /api/llm-status` - LLM provider status
- **Setup function:** `setup_health_router(logger, settings_manager, version)`
- **Import in main.py:** `from backend.health_endpoints import router as health_router, setup_health_router`

### 1.4 File upload endpoints [COMPLETE]
- **Source:** `main.py:535-604` (70 lines)
- **Destination:** `backend/file_upload_endpoints.py`
- **Endpoints moved:**
  - `POST /api/upload-image` - image upload for rich text editor
  - `GET /api/uploads/{filename}` - serve uploaded images
- **Setup function:** `setup_file_upload_router(logger)`
- **Import in main.py:** `from backend.file_upload_endpoints import router as file_upload_router, setup_file_upload_router`

### Files Created in Phase 1
```
backend/
├── utils/
│   └── cross_drive_static_files.py  [NEW]
├── generation_endpoints.py          [NEW]
├── health_endpoints.py              [NEW]
└── file_upload_endpoints.py         [NEW]
```

---

## Phase 2: chat_endpoints.py Analysis [COMPLETE - NO CHANGES]

**Decision:** Keep all "reliable" endpoints - they are actively used by frontend.

### Analysis Results

Searched frontend for usage of "reliable" endpoints:
```
frontend/src/services/chatStorage.ts    - reliable-create-chat, reliable-load-chat, reliable-save-chat, reliable-append-message, reliable-delete-chat, reliable-list-chats
frontend/src/contexts/ChatContext.tsx   - reliable-save-chat, reliable-load-chat
frontend/src/components/chat/ChatSelector.tsx - reliable-list-chats, reliable-delete-chat
frontend/src/hooks/useChatMessages.ts   - reliable-save-chat
frontend/src/hooks/chat/useEnhancedChatSession.ts - reliable-save-chat
frontend/src/services/apiService.ts     - reliable-list-chats
```

### Endpoint Analysis

| Endpoint | Type | Used By Frontend | Notes |
|----------|------|------------------|-------|
| `/reliable-create-chat` | Not simple alias | Yes | Has special Generic Assistant handling |
| `/reliable-load-chat` | Not simple alias | Yes | Different error handling (NotFoundException vs None) |
| `/reliable-save-chat` | Simple alias | Yes | Calls `save_chat_endpoint` directly |
| `/reliable-append-message` | Simple alias | Yes | Calls `append_chat_message_endpoint` directly |
| `/reliable-list-chats/{id}` | Different signature | Yes | Uses path param, includes chat_type |
| `/reliable-delete-chat/{id}` | Different signature | Yes | Uses DELETE method + path param |

**Conclusion:** Removing these endpoints would break the frontend. The duplication is intentional for API evolution.

---

## Phase 3: character_service.py Refactoring [IN PROGRESS]

**Goal:** Split 1,220-line service into focused modules

### Phase 3.1: Lore Service Extraction [COMPLETE]

**Result:** Extracted lore-related methods into a dedicated service

**File Created:** `backend/services/character_lore_service.py` (190 lines)

**Methods Extracted:**
- `sync_character_lore()` - synchronizes lore from character card metadata to database
- `add_lore_entries()` - adds lore entries to existing characters

**Changes to CharacterService:**
1. Added `lore_service` parameter to `__init__`
2. Removed `_sync_character_lore()` method (77 lines)
3. Updated `add_lore_entries()` to delegate to lore service
4. Updated call sites to use `self.lore_service.sync_character_lore()`:
   - `sync_character_file()` - syncs lore during file sync
   - `update_character()` - syncs lore when character is updated (2 call sites)
   - `create_character()` - syncs lore when character is created
   - `save_uploaded_character_card()` - syncs lore when card is uploaded

**Changes to main.py:**
1. Added import: `from backend.services.character_lore_service import CharacterLoreService`
2. Initialize lore service in lifespan: `lore_service = CharacterLoreService(logger=logger)`
3. Pass lore service to CharacterService: `lore_service=lore_service`

**Result:** character_service.py reduced from ~1,220 lines to ~1,145 lines (~75 lines removed)

### Phase 3.2: Directory Service Consolidation [PENDING]

**Recommendation:** Consider consolidating `CharacterService._get_character_dirs()`, `sync_character_file()`, and `sync_character_directories()` into the existing `CharacterSyncService`.

**Key Finding:** `CharacterSyncService` already exists at `backend/services/character_sync_service.py` (275 lines) and handles directory syncing, but:
- Uses hardcoded `Path("characters")` instead of settings
- Does NOT sync lore (now handled by `CharacterLoreService`)
- Is used at startup in `main.py` lifespan

**Future Work:**
1. Update `CharacterSyncService` to use settings for character directory
2. Have `CharacterSyncService` use `CharacterLoreService` for lore sync
3. Deprecate/remove `CharacterService.sync_character_directories()` (already marked deprecated)

---

## Phase 4: Handler/Service Pattern Cleanup [COMPLETE]

### 4.1 export_handler.py (383 lines) [COMPLETE]
- **Source:** `backend/handlers/export_handler.py`
- **Destination:** `backend/services/world_export_service.py`
- **Class Renamed:** `ExportHandler` -> `WorldExportService`
- **Issue:** Contained pure business logic (ZIP orchestration, UUID remapping)
- **Resolution:** Moved to services directory with proper naming

**Files Updated:**
- `backend/endpoints/world_card_endpoints_v2.py` - Updated import to use `WorldExportService`

**Old file deleted:** `backend/handlers/export_handler.py`

### 4.2 world_card_handler_v2.py (659 lines) [COMPLETE]
- **Source:** `backend/handlers/world_card_handler_v2.py`
- **Destination:** `backend/services/world_card_service.py`
- **Class Renamed:** `WorldCardHandlerV2` -> `WorldCardService`
- **Issue:** Handler naming was misleading - this was pure business logic, not HTTP handling
- **Resolution:** Moved to services directory with proper naming

**Files Updated:**
- `backend/endpoints/world_card_endpoints_v2.py` - Updated import to use `WorldCardService`
- `backend/main.py` - Updated import to use `WorldCardService`
- `backend/dependencies.py` - Updated import to use `WorldCardService`
- `backend/services/world_export_service.py` - Updated import to use `WorldCardService`

**Old file deleted:** `backend/handlers/world_card_handler_v2.py`

**Backward Compatibility:** Both new service files include class aliases for backward compatibility:
- `ExportHandler = WorldExportService`
- `WorldCardHandlerV2 = WorldCardService`

---

## Verification Commands

After any changes, verify the app works:

```bash
# Quick import test
python -c "from backend.main import app; print('OK')"

# Full startup test
python start.py
# Then test in browser: http://localhost:6969

# Check specific modules
python -c "import backend.generation_endpoints; import backend.health_endpoints; import backend.file_upload_endpoints; print('All modules OK')"

# Check lore service (Phase 3.1)
python -c "from backend.services.character_lore_service import CharacterLoreService; print('CharacterLoreService OK')"

# Check world services (Phase 4)
python -c "from backend.services.world_card_service import WorldCardService; print('WorldCardService OK')"
python -c "from backend.services.world_export_service import WorldExportService; print('WorldExportService OK')"
```

---

## Files Modified Summary

### Phase 1 Changes to main.py

**Imports added:**
```python
from backend.utils.cross_drive_static_files import CrossDriveStaticFiles
from backend.generation_endpoints import router as generation_router, setup_generation_router
from backend.health_endpoints import router as health_router, setup_health_router
from backend.file_upload_endpoints import router as file_upload_router, setup_file_upload_router
```

**Setup calls added (after handler initialization):**
```python
setup_generation_router(logger, api_handler)
setup_health_router(logger, settings_manager, VERSION)
setup_file_upload_router(logger)
```

**Router includes added:**
```python
app.include_router(health_router)
app.include_router(generation_router)
app.include_router(file_upload_router)
```

### Phase 3.1 Changes

**New file created:** `backend/services/character_lore_service.py`

**Changes to main.py:**
```python
# Import added
from backend.services.character_lore_service import CharacterLoreService

# In lifespan function
lore_service = CharacterLoreService(logger=logger)
app.state.lore_service = lore_service

# CharacterService initialization updated
app.state.character_service = CharacterService(
    db_session_generator=db_session_generator,
    png_handler=png_handler,
    settings_manager=settings_manager,
    logger=logger,
    lore_service=lore_service,  # NEW
)
```

**Changes to character_service.py:**
```python
# __init__ signature updated
def __init__(self, db_session_generator, png_handler, settings_manager, logger, character_indexing_service=None, lore_service=None):
    # ...
    self.lore_service = lore_service

# _sync_character_lore() method REMOVED (77 lines)

# add_lore_entries() now delegates to lore_service
def add_lore_entries(self, character_uuid: str, entries_data: List[Dict], write_to_png: bool = True):
    if not self.lore_service:
        self.logger.log_error("Lore service not available. Cannot add lore entries.")
        return False
    with self._get_session_context() as db:
        result = self.lore_service.add_lore_entries(character_uuid, entries_data, db)
        if result and write_to_png:
            self.update_character(character_uuid, {}, write_to_png=True)
        return result

# All _sync_character_lore() calls replaced with:
if self.lore_service:
    self.lore_service.sync_character_lore(...)
```

---

## Next Steps for New Session

1. **Phase 3.2: Consider consolidating directory sync into CharacterSyncService**
   - Update CharacterSyncService to read from settings
   - Integrate CharacterLoreService for lore sync
   - Deprecate CharacterService.sync_character_directories()

2. **Consider additional handler/service cleanup:**
   - `backend/handlers/room_card_handler.py` - Could be renamed to `room_card_service.py`
   - `backend/handlers/world_card_chat_handler.py` - Chat-specific handler, appropriate in handlers/
   - `backend/handlers/png_metadata_handler.py` - Core utility, appropriate in handlers/

---

## Files Created/Modified Summary

### Phase 1
| File | Status | Lines |
|------|--------|-------|
| `backend/utils/cross_drive_static_files.py` | NEW | ~50 |
| `backend/generation_endpoints.py` | NEW | ~340 |
| `backend/health_endpoints.py` | NEW | ~90 |
| `backend/file_upload_endpoints.py` | NEW | ~70 |
| `backend/main.py` | MODIFIED | 584 (was 1,136) |

### Phase 3.1
| File | Status | Lines |
|------|--------|-------|
| `backend/services/character_lore_service.py` | NEW | ~190 |
| `backend/services/character_service.py` | MODIFIED | ~1,145 (was ~1,220) |
| `backend/main.py` | MODIFIED | +5 lines for lore service |

### Phase 4
| File | Status | Notes |
|------|--------|-------|
| `backend/services/world_export_service.py` | NEW | Renamed from `handlers/export_handler.py` |
| `backend/services/world_card_service.py` | NEW | Renamed from `handlers/world_card_handler_v2.py` |
| `backend/handlers/export_handler.py` | DELETED | Moved to services/ |
| `backend/handlers/world_card_handler_v2.py` | DELETED | Moved to services/ |
| `backend/endpoints/world_card_endpoints_v2.py` | MODIFIED | Updated imports |
| `backend/main.py` | MODIFIED | Updated imports |
| `backend/dependencies.py` | MODIFIED | Updated imports |
