# World Card Implementation Plan

> **Document Version:** 1.0

> **Strategy:** Treat "World Cards" as a specialized type of "Character Card" using the V2 Spec `extensions` field.

## 1. Architecture Overview

### Data Storage

- **Characters:** `characters/` (PNG files with V2 metadata) -> `characters` table
- **World Assets:** `world_assets/{world_uuid}/` (Room images, backgrounds)
- **Database:** Reuse `characters` table. No new tables for World state.

### Core Concept

- **Single Card Type:** Characters and Worlds use identical storage.
- **Discriminator:** `data.extensions.card_type` ("character" | "world").
- **Data Structure:** World-specific data (Rooms, PlayerState, Settings) lives in `data.extensions.world_data`.

## 2. Data Models (Pydantic & TypeScript)

### Backend (`backend/models/world_data.py`)

New file defining the World schema.

- **Enums:** `NarratorVoice`, `TimeSystem`
- **Models:** `RoomConnection`, `RoomNPC`, `Room`, `PlayerState`, `WorldSettings`
- **Root:** `WorldData` (contains rooms, settings, player_state)

### Backend Updates (`backend/models/character_data.py`)

- Update `CharacterCoreData` to include `extensions: Dict[str, Any]`.
- Ensure `extensions` handles `card_type` and `world_data`.

### Frontend (`frontend/src/types/world.ts` & `character.ts`)

- Replicate Pydantic models in TypeScript.
- Extend `CharacterExtensions` to include `card_type` and `world_data`.

## 3. Implementation Steps

### Phase 1: Schema & Foundation

Establish data models without breaking existing functionality.

1.  [x] Create `backend/models/world_data.py`.
2.  [x] Update `backend/models/character_data.py` to include `extensions`.
3.  [x] Update `backend/character_validator.py`:
    - [x] Modify `create_empty_character` to accept `card_type`.
    - [x] Populate `extensions.world_data` default structure if `card_type="world"`.
4.  [x] Update `frontend/src/types/` definitions.

### Phase 2: Gallery Integration

Make World cards visible and distinguishable.

1.  [x] Update `CharacterGallery.tsx`:
    - [x] Add filter (All / Character / World).
    - [x] Add visual badge for World cards.
    - [x] Route World card clicks to `/world/:uuid/launcher`.
2.  [x] Create `WorldLauncher.tsx` (Stub with Play/Build buttons).

### Phase 3: World Builder

CRUD for World structure.

1.  Create `backend/world_asset_handler.py` for managing `world_assets/` images.
2.  Create `backend/world_card_handler.py` for business logic (if needed beyond generic character updates).
3.  Frontend:
    - `WorldBuilder.tsx` (Main view).
    - `RoomEditor.tsx` (Room details, image upload).
    - `WorldMap.tsx` (Visual graph).
4.  Implement API endpoints for asset upload (`POST /api/world-assets/...`).

### Phase 4: World Play

Interact with the World.

1.  Create `WorldPlay.tsx`.
2.  Implement `WorldPlayContext.tsx` for runtime state.
3.  Implement navigation and basic game loop.
4.  Integrate Chat:
    - World Card = Narrator.
    - NPC in Room = Character Card.

## 4. Risks & Mitigations

- **PNG Size:** Keep assets external (in `world_assets/`), only store text/references in PNG metadata.
- **Migration:** This is a fresh implementation. Old `world_state.json` files will be deprecated.

## 5. File Structure

```
backend/
  models/
    world_data.py      <-- NEW
    character_data.py  <-- UPDATE
  character_validator.py <-- UPDATE
  world_asset_handler.py <-- NEW
frontend/
  src/
    types/
      world.ts         <-- NEW
    components/
      CharacterGallery.tsx <-- UPDATE
    views/
      WorldLauncher.tsx <-- NEW
      WorldBuilder.tsx  <-- NEW
```


