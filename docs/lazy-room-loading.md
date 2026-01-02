# Lazy Room Loading Implementation

**Created:** 2026-01-02  
**Status:** In Progress  
**Priority:** High (Performance Critical)

## Problem Statement

When loading a world, the current implementation fetches **all room cards sequentially**, causing:
- Long load times (N+1 API calls where N = number of rooms)
- Heavy backend processing per room (PNG parsing, base64 decode, JSON parse)
- Unnecessary data fetching (50 rooms loaded when only 1 is needed for gameplay)
- Bloated LLM context (all room data loaded instead of just current room)

## Root Cause Analysis

The `WorldPlayView.tsx` and `WorldEditor.tsx` both have this pattern:

```typescript
for (const placement of worldData.rooms) {
  const roomCard = await roomApi.getRoom(placement.room_uuid); // ← Sequential!
  // ...
}
```

Each room fetch triggers full PNG metadata extraction on the backend.

## Solution: Lazy Loading Architecture

### Key Insight

The **World Card** already stores `instance_npcs` (with `hostile` flags) in `WorldRoomPlacement`. 
The only missing piece for map rendering is **room names**.

### Architecture Overview

```
WORLD LOAD (2 API calls instead of N+1):
├── 1. Fetch World Card
│   └── Contains: grid_size, rooms[], player_position
│       └── Each room has: uuid, position, instance_npcs, instance_name (NEW)
├── 2. Build Map Grid from world_data.rooms (no room fetches!)
└── 3. Fetch ONLY starting room for gameplay context

ROOM TRANSITION (1 API call per navigation):
└── Fetch destination room RoomCard on demand
```

---

## Implementation Phases

### Phase 1: Add Room Names to World Card ✅ DONE

**Goal:** Enable map to render without fetching individual rooms

**Changes Required:**

- [x] **1.1** Add `instance_name?: string` to `WorldRoomPlacement` type
  - File: `frontend/src/types/worldCard.ts`
  - Also added `instance_description` for tooltips
  
- [x] **1.2** Update `WorldEditor.tsx` to populate `instance_name` when placing rooms
  - When a room is added to the grid, store its name in the placement
  - File: `frontend/src/views/WorldEditor.tsx`
  - Updated `handleSave()` to include `instance_name` and `instance_description`

- [x] **1.3** Backend already accepts any fields in extensions (schemaless JSON)
  - No backend changes needed - WorldRoomPlacement is stored in world_data.rooms

- [x] **1.4** MapModal already uses `GridRoom.name` which is populated from stubs
  - No changes needed - `placementToGridRoomStub()` provides `name` from `instance_name`
  - File: `frontend/src/components/world/MapModal.tsx`

---

### Phase 2: Lazy Loading in WorldPlayView ✅ DONE

**Goal:** Load only the current room on world entry

**Changes Required:**

- [x] **2.1** Create lightweight `placementToGridRoomStub()` function
  - File: `frontend/src/utils/roomCardAdapter.ts`
  - Creates GridRoom from WorldRoomPlacement without API call
  - Falls back to "Unknown Room" for legacy worlds without cached names

- [x] **2.2** Refactor `WorldPlayView.tsx` loading:
  - Removed the "load all rooms" loop
  - Build map grid from `world_data.rooms` using `placementToGridRoomStub()`
  - Fetch only the starting room for current gameplay
  - File: `frontend/src/views/WorldPlayView.tsx`

- [x] **2.3** Lazy fetch integrated into `performRoomTransition()`
  - Room data is fetched during navigation
  - Grid is updated with full room data after fetch
  - File: `frontend/src/views/WorldPlayView.tsx`

- [x] **2.4** Update `performRoomTransition()` to lazy-fetch destination room
  - Always fetches full room card for destination
  - Updates grid cache with fetched data
  - File: `frontend/src/views/WorldPlayView.tsx`

---

### Phase 3: Lazy Loading in WorldEditor ⬜ TODO (Optional)

**Goal:** Same optimization for the editor view

**Note:** WorldEditor still loads all rooms because editing often requires full data.
This is lower priority since editor load time is less critical than gameplay.

**Changes Required:**

- [ ] **3.1** Refactor `WorldEditor.tsx` loading similar to Phase 2
  - Load room summaries instead of full cards for grid display
  - Full room data only needed when editing a room
  - File: `frontend/src/views/WorldEditor.tsx`

- [ ] **3.2** Update `handleRoomUpdate()` to work with lazy-loaded data
  - Only fetch full room card when room is selected for editing
  - File: `frontend/src/views/WorldEditor.tsx`

---

### Phase 4: Context Optimization ⬜ TODO (Future)

**Goal:** Keep LLM context lean

**Changes Required:**

- [ ] **4.1** Only inject current room's description/lore into context
  - Not all 50 rooms' data
  - Review: `frontend/src/utils/worldCardAdapter.ts`

- [ ] **4.2** Consider summarizing visited rooms for context continuity
  - Keep brief summaries of recently visited rooms
  - Prevents context from growing unbounded

---

## Testing Checklist

- [ ] World loads in < 1 second (vs current multi-second load)
- [ ] Map displays correctly with room names and NPC indicators
- [ ] Room navigation works (lazy fetches destination)
- [ ] WorldEditor can still edit room properties
- [ ] Saving world preserves all room data including names
- [ ] NPC hostile indicators still show correctly on map
- [ ] Fast travel works from MapModal
- [ ] Combat still triggers correctly for hostile NPCs

---

## Files Modified

| File | Phase | Status |
|------|-------|--------|
| `frontend/src/types/worldCard.ts` | 1 | ✅ |
| `frontend/src/views/WorldEditor.tsx` | 1 | ✅ |
| `frontend/src/utils/roomCardAdapter.ts` | 2 | ✅ |
| `frontend/src/views/WorldPlayView.tsx` | 2 | ✅ |
| `frontend/src/components/world/MapModal.tsx` | - | No changes needed |
| `frontend/src/types/worldGrid.ts` | - | No changes needed |

---

## Performance Metrics

| Metric | Before | After (Expected) |
|--------|--------|------------------|
| API calls on world load | N+1 (where N = rooms) | 2 |
| World load time | ~3-10s for 20 rooms | < 1s |
| Memory footprint | All rooms loaded | Only current room |
| LLM context size | All room descriptions | Current room only |

---

## Notes & Decisions

- **Why not just parallelize?** Parallelizing still loads unnecessary data. Lazy loading is architecturally correct.
- **Room names in world card:** Small data duplication but enables zero-fetch map rendering.
- **Backward compatibility:** Existing worlds without `instance_name` gracefully fall back (show "Unknown Room").
- **WorldEditor not optimized:** Left as-is for now since editing requires full data access.

---

## Progress Log

### 2026-01-02
- [x] Identified root cause of slow world loading
- [x] Analyzed existing data structures (WorldRoomPlacement has NPC data!)
- [x] Designed lazy loading architecture
- [x] Created this tracking document
- [x] **Phase 1 Complete:** Added `instance_name` and `instance_description` to WorldRoomPlacement
- [x] **Phase 1 Complete:** Updated WorldEditor.handleSave() to cache room names
- [x] **Phase 2 Complete:** Created `placementToGridRoomStub()` adapter function
- [x] **Phase 2 Complete:** Refactored WorldPlayView to use lazy loading
- [x] **Phase 2 Complete:** Updated performRoomTransition() for lazy fetch
- [x] Build verified - no errors
- [ ] **NEEDS TESTING:** New worlds with cached names
- [ ] **NEEDS TESTING:** Legacy worlds (graceful fallback to "Unknown Room")
- [ ] **NEEDS TESTING:** Room navigation with lazy loading

