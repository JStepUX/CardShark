# Per-User World Progress ("Load Game")

**Created:** 2026-02-01
**Status:** Draft
**Scope:** Store world playthrough progress per-user, enabling multiple save slots via UserSelect

---

## Problem Statement

Currently, world progress (XP, level, gold, affinity, room position, inventory, time state) is stored directly in the world card's PNG metadata. This means:

1. Only one playthrough can exist per world
2. Starting fresh requires manually resetting or re-importing the world
3. No way to share a world template without sharing progress
4. Progress can be lost during world card updates

## Solution

Store world progress in SQLite keyed by `(world_uuid, user_uuid)`. Add UserSelect to WorldLauncher so users pick which "save slot" (user profile) to use when entering a world.

**User Experience:**
- Click "Play World" on WorldLauncher
- UserSelect modal opens
- Pick existing user → loads their progress (or fresh start if first time)
- Pick/create new user → fresh playthrough
- World card PNG stays clean (template only, no runtime state)

---

## Design Principles

1. **Keep it simple** - No reset buttons, no complex UI. Users are cheap; just pick a different user for a fresh run.
2. **Robust to UUID drift** - Orphaned progress rows are fine; they just won't load. No cascading deletes, no foreign key constraints that break things.
3. **Graceful fallback** - If no progress exists for `(world_uuid, user_uuid)`, start fresh with defaults.
4. **Backward compatible** - Existing worlds with embedded progress continue working (migrate on first play).

---

## Data Model

### New SQLite Table: `world_user_progress`

```sql
CREATE TABLE world_user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    world_uuid TEXT NOT NULL,
    user_uuid TEXT NOT NULL,

    -- Progression
    player_xp INTEGER DEFAULT 0,
    player_level INTEGER DEFAULT 1,
    player_gold INTEGER DEFAULT 0,

    -- State
    current_room_uuid TEXT,
    bonded_ally_uuid TEXT,
    time_state_json TEXT,           -- JSON: TimeState
    npc_relationships_json TEXT,    -- JSON: Record<string, NPCRelationship>
    player_inventory_json TEXT,     -- JSON: CharacterInventory
    ally_inventory_json TEXT,       -- JSON: CharacterInventory
    room_states_json TEXT,          -- JSON: Record<string, RoomInstanceState>

    -- Metadata
    last_played_at TEXT,            -- ISO timestamp
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    UNIQUE(world_uuid, user_uuid)
);

CREATE INDEX idx_wup_world ON world_user_progress(world_uuid);
CREATE INDEX idx_wup_user ON world_user_progress(user_uuid);
```

**Note:** No foreign key constraints. If a world or user is deleted, orphaned rows remain harmless. They'll never match a lookup and can be cleaned up lazily if needed.

### Pydantic Model

```python
class WorldUserProgress(BaseModel):
    world_uuid: str
    user_uuid: str
    player_xp: int = 0
    player_level: int = 1
    player_gold: int = 0
    current_room_uuid: Optional[str] = None
    bonded_ally_uuid: Optional[str] = None
    time_state: Optional[TimeState] = None
    npc_relationships: Optional[Dict[str, NPCRelationship]] = None
    player_inventory: Optional[CharacterInventory] = None
    ally_inventory: Optional[CharacterInventory] = None
    room_states: Optional[Dict[str, RoomInstanceState]] = None
    last_played_at: Optional[str] = None
```

---

## API Endpoints

### `GET /api/world/{world_uuid}/progress/{user_uuid}`

Returns progress for the given world+user combo.

**Response (200):**
```json
{
    "success": true,
    "data": {
        "player_xp": 150,
        "player_level": 3,
        "player_gold": 45,
        "current_room_uuid": "abc-123",
        "time_state": { ... },
        "npc_relationships": { ... },
        ...
    }
}
```

**Response (404):** No progress exists → frontend uses defaults (fresh start).

### `PUT /api/world/{world_uuid}/progress/{user_uuid}`

Upserts progress. Called on room transitions, combat end, etc.

**Request Body:** `WorldUserProgress` (partial updates OK)

**Response (200):**
```json
{ "success": true }
```

### `GET /api/world/{world_uuid}/progress-summary`

Returns summary of all users who have played this world (for future "save slot" display).

**Response:**
```json
{
    "success": true,
    "data": [
        { "user_uuid": "...", "user_name": "Alice", "player_level": 5, "last_played_at": "..." },
        { "user_uuid": "...", "user_name": "Bob", "player_level": 2, "last_played_at": "..." }
    ]
}
```

---

## Frontend Changes

### WorldLauncher.tsx

1. "Play World" button opens UserSelect modal instead of navigating directly
2. On user selection:
   - Store selected `user_uuid` in route state or context
   - Navigate to `/world/{uuid}/play` with user context
3. Show optional badge on users with existing progress for this world (nice-to-have)

### WorldPlayView.tsx

1. On mount, read `user_uuid` from route/context
2. Call `GET /api/world/{world_uuid}/progress/{user_uuid}`
3. If 404: initialize with fresh defaults
4. If 200: hydrate state from response
5. On state changes (room transition, combat end, etc.): call `PUT` to persist

### Migration Path

On first play with the new system:
1. Check if world card has embedded progress in `world_data` extensions
2. If yes AND no SQLite row exists: migrate to SQLite for the selected user
3. Clear embedded progress from world card (optional, can leave for backup)

---

## Tasks

### PUWP-01: Database Schema & Service
**Scope:** Backend
**Deliverables:**
- SQLite migration for `world_user_progress` table
- `WorldUserProgressService` with CRUD operations
- Pydantic models

### PUWP-02: API Endpoints
**Scope:** Backend
**Deliverables:**
- `GET/PUT /api/world/{world_uuid}/progress/{user_uuid}`
- `GET /api/world/{world_uuid}/progress-summary`
- Integration with existing world card endpoints

### PUWP-03: WorldLauncher UserSelect Integration
**Scope:** Frontend
**Deliverables:**
- Add UserSelect modal trigger to "Play World" button
- Pass selected user_uuid to play route
- Handle modal open/close/selection flow

### PUWP-04: WorldPlayView Progress Loading
**Scope:** Frontend
**Deliverables:**
- Load progress from API on mount
- Fallback to defaults on 404
- Hydrate existing state hooks from loaded data

### PUWP-05: WorldPlayView Progress Saving
**Scope:** Frontend
**Deliverables:**
- Debounced auto-save on state changes
- Save triggers: room transition, combat end, affinity change, inventory change
- Handle save errors gracefully (don't crash the game)

### PUWP-06: Migration & Cleanup
**Scope:** Full-stack
**Deliverables:**
- Migrate existing world_data progress to SQLite on first play
- Remove embedded progress from world card after migration (optional)
- Test backward compatibility

---

## Out of Scope

- Reset/delete progress button (users are cheap, just pick a new one)
- Progress comparison UI
- Cloud sync
- Multiple simultaneous sessions

---

## Testing Strategy

- Unit tests for `WorldUserProgressService`
- Integration test: fresh user → play → save → reload → verify state
- Integration test: existing user → resume → verify state loads
- Migration test: world with embedded progress → first play → verify migration
- Orphan handling: delete user → verify world play still works (just starts fresh)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| UUID mismatch from world re-import | No FK constraints; orphaned rows are harmless |
| Large JSON columns slow queries | Index on (world_uuid, user_uuid) covers all lookups |
| Race condition on concurrent saves | Last-write-wins is acceptable; single player app |
| Migration corrupts embedded data | Copy-on-migrate, don't delete original until verified |

---

## Success Criteria

1. User can select profile before playing world
2. Progress persists across sessions per-user
3. Different users have independent progress
4. Existing worlds continue working
5. No data loss on world card updates
