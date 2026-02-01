# Room Layout Editor Specification

## Overview

This document specifies the Room Layout Editor feature, which allows World Builders to configure spatial elements within rooms: NPC spawn positions, dead zones (water, walls, hazards), and eventually interactive containers.

## Motivation

Currently, NPCs spawn at default positions without World Builder control. This leads to problems like:
- NPCs spawning in water (harbor example)
- No ability to create walkable vs. non-walkable areas
- No spatial awareness for future features (containers, stairs, exits)

## UI Reorganization

### 1. Tool Palette Removal

**Current State**: A floating tool palette panel on the left side of the World Editor containing Edit/Move/Delete tools.

**New State**: Remove the tool palette. Move tool buttons to the existing top bar (alongside zoom controls and reset view button).

```
┌─────────────────────────────────────────────────────────────────┐
│  Edit | Move | Delete          [zoom slider] [Reset View]      │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│                         World Grid                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Rationale**: Frees up horizontal space for the Room Properties panel and the new Layout Editor drawer.

---

### 2. Room Layout Editor Button

**Location**: Room Properties panel title bar, to the LEFT of the dismiss "X" button.

```
┌─────────────────────────────────────────┐
│  Room Properties              [🗺️] [×]  │
│  ───────────────────────────────────────│
│  ...                                    │
└─────────────────────────────────────────┘
```

**Behavior**: 
- Click opens the Room Layout Editor drawer
- Icon: Map/grid icon (🗺️ or similar)
- Tooltip: "Configure Room Layout"

**Why title bar instead of on the cover image**: Rooms without images still need layout configuration. The grid exists in gameplay even without a background image.

---

### 3. Room Layout Editor Drawer

**Position**: Slides in from the RIGHT, pushing the Room Properties panel to the LEFT.

**Layout**:
```
┌─────────────────┐  ┌─────────────────────────────────────┐
│ Room Properties │  │  Room Layout Editor                 │
│ (pushed left)   │  │  ─────────────────────────────────  │
│                 │  │  Tools: [NPCs] [Dead Zones] [...]   │
│                 │  │                                     │
│                 │  │  ┌─────────────────────────────┐    │
│                 │  │  │                             │    │
│                 │  │  │   Room Image + Grid Overlay │    │
│                 │  │  │                             │    │
│                 │  │  │   (1024x2048 portrait)      │    │
│                 │  │  │                             │    │
│                 │  │  │   [NPCs draggable here]     │    │
│                 │  │  │   [Zones paintable here]    │    │
│                 │  │  │                             │    │
│                 │  │  └─────────────────────────────┘    │
│                 │  │                                     │
│                 │  │  NPC List:                          │
│                 │  │  ├─ Emily Thompson      (3, 5)      │
│                 │  │  ├─ Eliza Hartman       (4, 5)      │
│                 │  │  └─ Evil Goblin         (6, 2)      │
│                 │  │                                     │
└─────────────────┘  └─────────────────────────────────────┘
```

---

## Data Model

### RoomLayoutData

New field on room cards to store spatial configuration:

```typescript
interface RoomLayoutData {
  gridSize: {
    cols: number;  // e.g., 8 for 1024px width
    rows: number;  // e.g., 16 for 2048px height
  };
  spawns: SpawnPoint[];
  deadZones: Zone[];
  containers?: Container[];  // Future
  exits?: Exit[];            // Future
}

interface SpawnPoint {
  entityId: string;          // NPC ID
  col: number;
  row: number;
  facing?: 'up' | 'down' | 'left' | 'right';
}

interface Zone {
  type: 'water' | 'wall' | 'hazard' | 'no-spawn';
  cells: Array<{ col: number; row: number }>;
}

// Future additions
interface Container {
  id: string;
  col: number;
  row: number;
  type: 'chest' | 'barrel' | 'crate';
  lootTable?: string;
}

interface Exit {
  col: number;
  row: number;
  targetRoomId: string;
  type: 'door' | 'stairs' | 'portal';
}
```

---

## Implementation Approach

### Lightweight DOM-Based Editor (NOT PixiJS)

The Room Layout Editor should be implemented using React + CSS, NOT PixiJS. This keeps it lightweight and avoids duplicating LocalMapStage logic.

**Components**:
- `RoomLayoutDrawer` - Drawer container, slide-in animation
- `RoomLayoutCanvas` - CSS Grid or Canvas-based grid overlay on room image
- `SpawnMarker` - Draggable NPC position indicators
- `ZonePainter` - Tool for click-drag painting of dead zones

**Key Decisions**:
1. **Shared data, different renderers**: The `RoomLayoutData` is the single source of truth. The editor writes to it, `LocalMapStage` reads from it.
2. **No PixiJS in editor**: Avoids heavy dependency and potential code duplication with gameplay LocalMapStage.
3. **Grid proportional to image**: If image is 1024x2048 (1:2 ratio), grid might be 8x16 tiles.

---

## Tool Modes

### 1. Place NPCs Mode
- Shows list of NPCs assigned to this room
- Drag NPC from list onto grid cell
- Click placed NPC to select, drag to reposition
- Right-click or delete key to remove from position

### 2. Dead Zones Mode
- Select zone type: Water, Wall, Hazard, No-Spawn
- Click and drag to paint cells
- Painted cells shown with colored overlay (blue for water, etc.)
- Click painted cell to un-paint

### 3. Containers Mode (Future)
- Select container type from palette
- Click grid cell to place
- Configure loot table per container

---

## Integration with LocalMapStage

The existing `LocalMapStage` (PixiJS gameplay renderer) should be updated to:

1. **Read spawn positions**: Place NPCs at their configured `(col, row)` instead of default positions
2. **Respect dead zones**: 
   - Prevent NPC/player movement into dead zone cells
   - Visual indicator for hazard zones
   - Water zones might have special traversal rules
3. **Render containers**: When implemented, show interactive container sprites

---

## Phased Implementation

### Phase 1: UI Reorganization
- Remove tool palette
- Add Edit/Move/Delete to top bar
- Add layout button to Room Properties title bar
- Create empty drawer shell

### Phase 2: NPC Positioning
- Implement `RoomLayoutData` schema
- Build grid overlay component
- Drag-and-drop NPC placement
- LocalMapStage reads spawn positions

### Phase 3: Dead Zones
- Zone painting tool
- Visual feedback during painting
- LocalMapStage respects zones for movement

### Phase 4: Containers & Exits (Future)
- Container placement and loot configuration
- Exit/stairs placement linking rooms

---

## Open Questions

1. **Grid size determination**: Fixed 8x16? Or derived from image dimensions? Or configurable per room?
2. **No-image rooms**: Show a solid color background with grid overlay?
3. **Existing NPCs**: Migration path for rooms that already have NPCs but no layout data?

---

## Files Likely Affected

### Frontend
- `frontend/src/views/WorldEditor.tsx` - Remove ToolPalette, add top bar buttons
- `frontend/src/components/world/ToolPalette.tsx` - DELETE or repurpose
- `frontend/src/components/world/RoomPropertiesPanel.tsx` - Add layout button
- `frontend/src/components/world/RoomLayoutDrawer.tsx` - NEW
- `frontend/src/components/world/RoomLayoutCanvas.tsx` - NEW
- `frontend/src/components/world/pixi/local/LocalMapStage.ts` - Read layout data
- `frontend/src/types/localMap.ts` - Add RoomLayoutData types

### Backend
- `backend/models/room_card.py` - Add layout_data field
- Room CRUD endpoints - Handle layout data persistence
