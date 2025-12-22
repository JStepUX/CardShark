# World Card Save Data Loss - Root Cause & Fix

## Issue Summary
When converting a Character card to a World card and then editing it in Build mode, all locations (rooms) were lost after clicking "Save" and navigating back. This prevented users from playing worlds properly.

## Root Cause: Data Model Mismatch

### The Problem
Two incompatible data structures existed between frontend and backend:

**Backend Model** (`backend/models/world_state.py`):
```python
class WorldState(BaseModel):
    locations: Dict[str, Location] = Field(default_factory=dict)  # Dict keyed by "x,y,z"
    current_position: str = "0,0,0"
```

**Frontend Model** (`frontend/src/types/world.ts`):
```typescript
export interface WorldData {
  rooms: Room[];  // Array of rooms
  player_state: {
    current_room_id: string;
  };
}
```

### Why the Load Path Worked ✅
The frontend's `toGridWorldState()` function (in `worldStateApi.ts`) intelligently handles BOTH formats:
```typescript
const rooms: Room[] = worldData.rooms || [];

// If we have 'locations' instead of 'rooms', convert them
if (!worldData.rooms && worldData.locations) {
  Object.entries(worldData.locations).forEach(([name, loc]) => {
    rooms.push({ id: loc.id, name: loc.name, ... });
  });
}
```
This is why the Build editor could load and display the 38 locations correctly.

### Why the Save Path Failed ❌
The frontend's `fromGridWorldState()` function always creates a `WorldData` with `rooms` array:
```typescript
return {
  rooms,  // Array format
  player_state: { current_room_id: ... },
  ...
};
```

The backend's save endpoint tried to directly create a `WorldState`:
```python
world_state = WorldState(**state_data)  # FAILS: state_data has 'rooms', not 'locations'
```

This caused Pydantic validation to fail because:
- Data had `rooms: Room[]` field (array)
- `WorldState` expected `locations: Dict[str, Location]` field (dict)
- Pydantic rejects extra fields and missing required fields
- Result: Save failed, data was lost

## The Fix

### Implementation
Added a conversion layer in `backend/world_endpoints.py` at the `save_world_state_api` endpoint (lines 285-352):

**Step 1: Detect Frontend Format**
```python
if "rooms" in state_data and isinstance(state_data["rooms"], list):
```

**Step 2: Convert Rooms Array → Locations Dict**
For each room:
- Extract x, y coordinates from room (z defaults to 0)
- Create coordinate key: `f"{x},{y},{z}"` (e.g., "0,0,0", "1,2,0")
- Convert `RoomConnection[]` → `explicit_exits: Dict[str, ExitDefinition]`
- Convert `RoomNPC[]` → `npcs: List[str]` (extract character_id)
- Create `Location` object with proper mapping:
  - `room.id` → `location.location_id`
  - `room.name` → `location.name`
  - `room.image_path` → `location.background`
  - `room.x, room.y` → `location.coordinates` as `[x, y, 0]`
- Add to `locations_dict[coord_key]`

**Step 3: Update State Data**
```python
del state_data["rooms"]
state_data["locations"] = locations_dict
```

**Step 4: Convert Player Position**
```python
# Convert player_state.current_room_id to current_position
current_room_id = player_state.get("current_room_id")
if current_room_id:
    for coord_key, location in locations_dict.items():
        if location.location_id == current_room_id:
            state_data["current_position"] = coord_key
```

**Step 5: Proceed with Save**
```python
world_state = WorldState(**state_data)  # Now succeeds!
success = world_card_handler.save_world_state(world_name, world_state)
```

## Data Flow Diagrams

### Before Fix (BROKEN)
```
Character Conversion → WorldState { locations: {...} }
                           ↓
                        [SAVE TO DB]
                           ↓
Build Load → toGridWorldState() → GridWorldState { rooms: [...] } ✅ Works
                           ↓
                     [USER EDITS]
                           ↓
Build Save → fromGridWorldState() → WorldData { rooms: [...] }
                           ↓
                    [POST TO BACKEND]
                           ↓
            WorldState(**state_data) → ❌ VALIDATION ERROR
                           ↓
                   [SAVE FAILS/DATA LOST]
```

### After Fix (WORKING)
```
Character Conversion → WorldState { locations: {...} }
                           ↓
                        [SAVE TO DB]
                           ↓
Build Load → toGridWorldState() → GridWorldState { rooms: [...] } ✅
                           ↓
                     [USER EDITS]
                           ↓
Build Save → fromGridWorldState() → WorldData { rooms: [...] }
                           ↓
                    [POST TO BACKEND]
                           ↓
            🔧 CONVERSION LAYER 🔧
            rooms[] → locations{}
            current_room_id → current_position
                           ↓
            WorldState(**state_data) → ✅ SUCCESS
                           ↓
                    [SAVE SUCCEEDS]
```

## Field Mappings

### Room → Location
| Frontend (Room)        | Backend (Location)     | Notes                          |
|------------------------|------------------------|--------------------------------|
| `id`                   | `location_id`          | Unique identifier              |
| `name`                 | `name`                 | Display name                   |
| `description`          | `description`          | Room description               |
| `introduction`         | `introduction`         | First visit text               |
| `image_path`           | `background`           | Background image filename      |
| `x, y`                 | `coordinates [x,y,0]`  | Grid position                  |
| `connections[]`        | `explicit_exits{}`     | Array → Dict by direction      |
| `npcs[].character_id`  | `npcs[]`               | RoomNPC → string list          |

### Player State
| Frontend                            | Backend               |
|-------------------------------------|-----------------------|
| `player_state.current_room_id`      | `current_position`    |
| Room ID (e.g., "room-123")          | Coordinate (e.g., "0,0,0") |

## Testing Verification

To verify this fix works:

1. ✅ **Convert Character to World**: Character with lore book → World card with N locations
2. ✅ **Load in Build**: World card loads with N locations visible on grid
3. ✅ **Edit World**: Add images, modify descriptions, rearrange rooms
4. ✅ **Save**: Click "Save" button (should succeed)
5. ✅ **Navigate Back**: Click "Go Back" to Play/Build screen
6. ✅ **Verify Persistence**: World still shows N locations (not 0)
7. ✅ **Load in Build Again**: All edits preserved (images, descriptions, etc.)
8. ✅ **Play World**: Can click "Play" and enter world with all locations intact

## Files Modified

- **`backend/world_endpoints.py`** (lines 285-352)
  - Added conversion layer in `save_world_state_api()` endpoint
  - Converts `rooms` array → `locations` dict
  - Converts `current_room_id` → `current_position`
  - Preserves all room data (images, NPCs, connections, etc.)

## Alternative Solutions Considered

1. **Change Backend Model to Use Rooms Array**: Would require massive refactoring across entire backend
2. **Change Frontend Model to Use Locations Dict**: Would require refactoring all UI components
3. **Create Bidirectional Adapter Pattern**: More complex, unnecessary for this use case

**Chosen Solution**: Add conversion layer at API boundary (backend save endpoint)
- ✅ Minimal code changes
- ✅ Preserves existing architecture
- ✅ Works with both data formats
- ✅ No breaking changes to other parts of codebase

## Future Improvements

1. **Standardize on Single Data Model**: Consider migrating to one unified model across frontend/backend
2. **Add Schema Versioning**: Support migrations between different WorldState versions
3. **Improve Error Messages**: Surface validation errors more clearly to users
4. **Add Data Validation Tests**: Unit tests for conversion logic

## Related Files

- `backend/models/world_state.py` - Backend data models
- `frontend/src/types/world.ts` - Frontend data models
- `frontend/src/utils/worldStateApi.ts` - Frontend conversion utilities
- `backend/world_card_handler.py` - World card persistence logic
- `.agent/world-room-transition-logic.md` - World play session documentation
