# CardShark Play View Spec - Progress Tracker

**Spec:** `docs/delivery/cardshark_play_view_spec.yaml`
**Version:** 0.1.0
**Started:** 2025-01-25
**Status:** In Progress

---

## Current State Assessment

### What Exists (Already Implemented)

| Feature | Location | Status |
|---------|----------|--------|
| Pixi.js World Map | `components/world/pixi/` | ✅ Complete |
| World map grid (8x6) | `WorldMapStage.ts` | ✅ Complete |
| Room tiles with images | `RoomTile.ts` | ✅ Complete |
| Player token with animations | `PlayerToken.ts` | ✅ Complete |
| Pan/zoom camera | `MapCamera.ts` | ✅ Complete |
| Travel animations | `MapAnimations.ts` | ✅ Complete |
| Turn-based combat engine | `services/combat/` | ✅ Complete |
| **Grid combat engine** | `services/combat/gridCombatEngine.ts` | ✅ Complete |
| **Grid combat AI** | `services/combat/gridEnemyAI.ts` | ✅ Complete |
| **Grid combat HUD** | `components/combat/GridCombatHUD.tsx` | ✅ Complete |
| **useGridCombat hook** | `hooks/useGridCombat.ts` | ✅ Complete |
| **Pathfinding (A*)** | `utils/pathfinding.ts` | ✅ Complete |
| **Grid combat utils** | `utils/gridCombatUtils.ts` | ✅ Complete |
| Pixi combat rendering | `components/combat/pixi/` | ✅ Complete |
| Combatant sprites with HP | `CombatantSprite.ts` | ✅ Complete |
| Combat actions (attack/defend/move/flee) | `combatEngine.ts` | ✅ Complete |
| Enemy AI | `enemyAI.ts` | ✅ Complete |
| NPC affinity tracking | `WorldPlayView.tsx` | ✅ Complete |
| Day/night time cycle | `WorldPlayView.tsx` | ✅ Complete |
| Particle effects | `ParticleSystem.ts` | ✅ Complete |

### Gap Analysis: Spec vs Current Implementation

The spec describes a fundamentally different play paradigm:

| Spec Vision | Current Reality | Gap Severity |
|-------------|-----------------|--------------|
| **Local map view** - Player moves tile-by-tile within rooms | No local map - rooms are conversation contexts only | 🔴 Major |
| **Exit tiles** auto-derived from world adjacency | Modal map with room-click teleportation | 🔴 Major |
| **Entity cards on map** - Player/NPC cards positioned on tiles | No spatial positioning within rooms | 🔴 Major |
| **Threat zones** - Red overlay around hostiles | ✅ Grid combat triggers on proximity (needs debugging) | 🟢 Done |
| **Background images** behind tile grid in local view | World map has backgrounds; "rooms" have no grid | 🟡 Medium |
| **Combat log panel** replacing chat during combat | Combat in modal overlay, chat unchanged | 🟡 Medium |
| **Context menus** on entity/tile click | Combat has action buttons at bottom | 🟡 Medium |
| **Capture/rescue** companion system | Not implemented | 🟢 Future |

### Architecture Decision Required

The spec envisions **two distinct spatial views**:

1. **World Map** (Creator View) - Already exists as modal
   - 8x6 grid showing all rooms
   - Click to set player position

2. **Local Map** (Player View) - **Does NOT exist**
   - Current room rendered as tactical grid
   - Player card moves tile-by-tile
   - NPCs positioned on specific tiles
   - Exits at edges connect to adjacent rooms
   - Threat zones trigger combat on adjacency

**Current flow:** World Map Modal → Click Room → Room becomes chat context
**Spec flow:** Local Map → Move to exit tile → Transition to adjacent room's local map

---

## Phase 1 MVP Tasks

Based on `implementation_priorities.phase_1_mvp` from spec:

### Core Infrastructure

- [x] **1.1 Local Map Component** - Create `LocalMapStage.ts` (Pixi) ✅
  - Renders current room as tactical grid (8x5 default)
  - Supports background image behind grid
  - Grid lines subtle with dashed borders
  - Layer hierarchy: background → grid → entities → UI
  - **Files:** `components/world/pixi/local/LocalMapStage.ts`

- [x] **1.2 Entity Card Sprites** - Create `EntityCardSprite.ts` ✅
  - Player card with gold frame (#FFD700)
  - NPC cards with allegiance-based frames (blue/gray/red)
  - Level badge (top-left circular)
  - Status badges (heart for bonded, skull for hostile)
  - Drop shadows for floating effect
  - HP bar (combat mode only)
  - **Files:** `components/world/pixi/local/EntityCardSprite.ts`

- [x] **1.3 Tile System** - Create `LocalMapTile.ts` ✅
  - Dashed border grid lines
  - Highlight states: none, player_position, valid_movement, threat_zone, attack_range, exit
  - Exit tile with directional arrow icon
  - Pulse animation for player position
  - **Files:** `components/world/pixi/local/LocalMapTile.ts`

- [x] **1.4 Types & Utilities** ✅
  - `types/localMap.ts` - All type definitions and color constants
  - `utils/localMapUtils.ts` - Exit derivation, threat zones, pathfinding

- [x] **1.5 React Integration** ✅
  - `LocalMapView.tsx` - React wrapper component
  - Integrates with WorldPlayView props
  - Handles tile clicks, entity clicks, exit navigation

### Exit System

- [x] **1.6 Auto-generated Exits** - Derive from world topology ✅
  - `deriveExitsFromWorld()` in localMapUtils.ts
  - Checks adjacent tiles in world grid
  - Generates exit tiles at fixed edge positions
  - Exit visualization with directional arrows
  - **Files:** `utils/localMapUtils.ts`

- [ ] **1.7 Room Transition** - Exit tile interaction
  - Click exit → path to exit → transition animation
  - `getSpawnPosition()` calculates opposite edge entry
  - **Status:** Logic exists, needs WorldPlayView integration

### Combat Integration

- [x] **1.6 Threat Zone Visualization** ✅
  - `calculateThreatZones()` in localMapUtils.ts
  - Render red semi-transparent overlay
  - Always visible during exploration

- [x] **1.7 Adjacency Combat Trigger** ✅ (needs debugging)
  - `handleEnterThreatZone` in WorldPlayView.tsx
  - Calls `gridCombat.startCombat()` from useGridCombat hook
  - **Issue:** `localMapStateCache` may be null - needs `onMapStateChange` callback

- [x] **1.8 Combat Log Panel** ✅
  - `CombatLogPanel.tsx` component exists
  - Integrated in WorldPlayView - switches from ChatView when `isInCombat`
  - Turn order from `gridCombat.combatState.initiativeOrder`

- [x] **1.9 Grid Combat Engine** ✅ (NEW)
  - `gridCombatEngine.ts` - Pure reducer pattern
  - `gridEnemyAI.ts` - Spatial AI with pathfinding
  - `useGridCombat.ts` - React state management
  - `GridCombatHUD.tsx` - Action buttons, turn order, log overlay

### UI Updates

- [ ] **1.9 Context Menu System**
  - Click entity → show action menu
  - Click tile → show move option (if valid)
  - Click exit → show travel/flee option
  - Position near click location

- [ ] **1.10 Combat Resolution States**
  - Victory: Remove defeated enemies, update world state
  - Flee: Transition to exit target, enemies persist
  - Defeat: Respawn at world origin (0,0)

---

## Phase 2: Companion Depth (Future)

- [ ] Captured companion state (lock icon, persisted position)
- [ ] Companion choice modal after rescue
- [ ] Companion auto-revive on victory

## Phase 3: NPC Behavior (Future)

- [ ] Neutral NPC combat AI (flee toward exits)
- [ ] Neutral reaction to attacks
- [ ] Variable threat ranges per enemy type

## Phase 4: Expanded Systems (Future)

- [ ] Ranged attack implementation
- [ ] Affinity card summons
- [ ] Skills and items
- [ ] Inventory system
- [ ] Contract types
- [ ] Terrain effects
- [ ] Line of sight

---

## Implementation Notes

### Key Files to Create

```
frontend/src/components/world/pixi/local/
├── LocalMapStage.ts        # Main local map Pixi stage
├── LocalMapTile.ts         # Individual tile rendering
├── EntityCardSprite.ts     # Character cards on map
├── ExitTile.ts             # Special exit tile rendering
├── ThreatZoneOverlay.ts    # Red danger zone rendering
└── LocalMapCamera.ts       # Pan/zoom for local view (reuse MapCamera?)
```

### Key Files to Modify

- `WorldPlayView.tsx` - Add local map mode, exit handling
- `WorldMapStage.ts` - May need to coordinate with local view
- `PixiMapModal.ts` - May become local map viewer instead of/alongside modal

### State Management Considerations

- Need to track player position at tile level (not just room)
- NPC positions within room (assigned by creator or auto-placed?)
- Exit targets derived at runtime from world adjacency
- Combat mode as state in WorldPlayView (already partially exists)

### Questions to Resolve

1. **Grid size per room** - Fixed (6x6)? Variable? Creator-defined?
2. **NPC positioning** - Auto-placed or creator-defined tiles?
3. **Local map vs modal** - Replace world map modal with local view always shown?
4. **Pathfinding** - Simple A* or allow diagonal movement?

---

## Session Log

### 2025-01-25 - Initial Assessment

- Read full spec (1266 lines)
- Explored existing codebase thoroughly
- Identified major architectural gap: no local map view exists
- Current system is "room as context" not "room as spatial grid"
- Created this progress tracker

### 2025-01-25 - Architecture Decision & Visual Reference

**Decision:** Option B - Unified View
- Local map IS the always-visible play view
- World map accessible via button/hotkey
- User provided visual mockup for reference

**Visual Spec (from mockup page_1.png):**

```
┌─────────────────────────────────────────────────────────────┐
│ Header: World -> Room                    Journal    Time    │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    LOCAL MAP                         │   │
│  │  ┌───┬───┬───┬───┬───┬───┬───┬───┐                  │   │
│  │  │[P]│   │   │   │ ⬆ │   │   │[H]│ ← Exit + Hostile │   │
│  │  ├───┼───┼───┼───┼───┼───┼───┼───┤                  │   │
│  │  │ ♥ │[C]│   │   │   │   │   │███│ ← Threat zone    │   │
│  │  ├───┼───┼───┼───┼───┼───┼───┼───┤                  │   │
│  │  │   │   │   │▓▓▓│▓▓▓│   │   │███│ ← Player glow    │   │
│  │  ├───┼───┼───┼───┼───┼───┼───┼───┤                  │   │
│  │  │   │   │   │▓▓▓│▓▓▓│   │   │   │                  │   │
│  │  ├───┼───┼───┼───┼───┼───┼───┼───┤                  │   │
│  │  │[F]│   │   │   │   │[N]│   │   │                  │   │
│  │  └───┴───┴───┴───┴───┴───┴───┴───┘                  │   │
│  │  Background image (tavern) visible through grid     │   │
│  └──────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  EXPLORATION: Chat Panel                      │
│  │  NPC    │  Conversation with current NPC                │
│  │ Portrait│  ─────────────────────────────────────────    │
│  │Mirabelle│  [Input field.........................]       │
│  └─────────┘                                               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  COMBAT: Combat Log Panel                     │
│  │ Turn    │  Combat Turn #1                               │
│  │ Order   │  BigStinky Orc hit Mirabelle for 3 hp!       │
│  │ ○ ● ○   │  BigStinky Orc hit Duncan for 5 hp!          │
│  └─────────┘  (no input field during combat)               │
└─────────────────────────────────────────────────────────────┘

Legend:
[P] = Player card (gold frame, level 10)
[C] = Companion card (blue frame + ♥ heart badge, level 12)
[F] = Friendly NPC (blue frame, level 7)
[N] = Neutral NPC (gray frame, level 5, near campfire)
[H] = Hostile NPC (red frame + skull, level 8, hooded figure)
███ = Threat zone (red semi-transparent)
▓▓▓ = Player position highlight (yellow/gold glow)
 ⬆  = Exit tile (door icon at top center)
```

**Card Visual Specs (from mockup):**
- Cards span ~1.5 tiles visually (larger than grid cell)
- Level badge: circular, top-left corner, allegiance-colored background
- Status badges: heart (bonded), skull (hostile)
- HP bars: horizontal pill under card (combat mode only)
- Drop shadows for depth/floating effect
- Rounded corners on card frames

**Grid Specs (from mockup):**
- 8 columns x 5 rows visible
- Subtle dashed grid lines (dark, low opacity)
- Background image shows through grid
- Tiles roughly square

**Combat Mode Changes (from mockup):**
- HP bars appear under ALL combatants (red pill bars)
- Chat panel → Combat log panel
- Turn order: 3 portrait circles at bottom, current turn highlighted
- Combat log shows action feed: "Combat Turn #1", damage events

**Starting Implementation:** LocalMapStage.ts + EntityCardSprite.ts

### 2025-01-25 - Core Components Created

**Files Created:**
```
frontend/src/types/localMap.ts                           # Types + color constants
frontend/src/utils/localMapUtils.ts                      # Exit derivation, threat zones, pathfinding
frontend/src/components/world/pixi/local/
├── index.ts                                             # Exports
├── LocalMapStage.ts                                     # Main Pixi stage
├── LocalMapTile.ts                                      # Individual tiles
├── EntityCardSprite.ts                                  # Character cards
└── LocalMapView.tsx                                     # React wrapper
```

**Completed:**
- [x] LocalMapStage with layer hierarchy (background → grid → entities → UI)
- [x] EntityCardSprite with allegiance colors, level badge, status badges, HP bar
- [x] LocalMapTile with dashed borders, highlight states, exit icons
- [x] deriveExitsFromWorld() - auto-generates exits from world topology
- [x] calculateThreatZones() - finds tiles adjacent to hostiles
- [x] autoPlaceEntities() - positions NPCs on grid
- [x] findPath() - BFS pathfinding
- [x] LocalMapView React component

**Next Steps:**
1. Integrate LocalMapView into WorldPlayView.tsx
2. Replace/augment current map modal with local map as primary view
3. Wire up combat mode toggle to show HP bars
4. Test exit navigation between rooms

### 2025-01-25 - Layout Components Created

**Additional Files Created:**
```
frontend/src/components/world/PlayViewLayout.tsx         # New unified layout
frontend/src/components/combat/CombatLogPanel.tsx        # Combat log (replaces chat)
```

**PlayViewLayout Structure:**
```
┌─────────────────────────────────────────────────────┐
│ Header: World -> Room              Journal    Time  │
├─────────────────────────────────────────────────────┤
│                                                     │
│              LOCAL MAP (Pixi Canvas)                │
│              - 8x5 grid with background             │
│              - Entity cards on tiles                │
│              - Threat zones visible                 │
│              - Exits at edges                       │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [Portrait] Chat Panel (exploration)                │
│             OR Combat Log (combat)                  │
│             ────────────────────────                │
│             [Input field / Action hints]            │
└─────────────────────────────────────────────────────┘
```

**CombatLogPanel Features:**
- Turn order portraits (horizontal row)
- Current turn highlighted with golden ring
- Combat action feed with formatted messages
- No input field (turn-based, not chat-based)

**Current Status:**
All Pixi components and React wrappers created. Ready for integration.

**Remaining Integration Work:**
1. ~~Modify WorldPlayView.tsx to use PlayViewLayout~~ ✅
2. ~~Pass correct props from WorldPlayView state to LocalMapView~~ ✅
3. ~~Handle exit click → room transition flow~~ ✅
4. ~~Handle threat zone entry → combat trigger~~ ✅
5. ~~Switch between ChatView and CombatLogPanel based on combat state~~ ✅

### 2025-01-25 - WorldPlayView Integration Complete

**Changes to WorldPlayView.tsx:**
- Added imports for LocalMapView, PlayViewLayout, CombatLogPanel
- Added state: `playerTilePosition`, `entryDirection`
- Added handlers: `handleLocalMapTileClick`, `handleLocalMapEntityClick`, `handleLocalMapExitClick`, `handleEnterThreatZone`
- Removed SidePanel from render (replaced by LocalMapView)
- Removed unused `isPanelCollapsed` state
- Entity clicks now use existing `handleSelectNpc` for full NPC selection flow

**Layout:**
- PlayViewLayout renders: Header → LocalMapView → ChatView/CombatLogPanel
- World Map Modal accessible via header breadcrumb click
- No feature flag - this is the only layout now

**TypeScript:** Compiles successfully

**Ready for Testing:**
- Start dev server with `npm run dev` in frontend/
- Navigate to a world in play mode
- Should see new layout with tactical grid + chat below

### 2027-01-27 - Unified Grid Combat System Implementation

**Objective:** Replace abstract slot-based combat with tactical grid combat on the local map.

**Reference Spec:** `docs/design/unified_local_combat_spec.md`

**Files Created (10 new files, ~2500 lines):**

```
frontend/src/utils/
├── pathfinding.ts              # A* algorithm with terrain costs, reachability
├── gridCombatUtils.ts          # Distance (Manhattan/Chebyshev/Euclidean), LOS raycast, flanking

frontend/src/services/combat/
├── combatMapSync.ts            # LocalMapState ↔ GridCombatState bridge
├── gridCombatEngine.ts         # Grid combat reducer (pure function)
├── gridEnemyAI.ts              # Spatial AI: pathfinding, target prioritization
├── gridCombatAnimations.ts     # Animation queue, easing, interpolation

frontend/src/components/combat/
├── GridCombatHUD.tsx           # Turn order bar, action buttons, combat log overlay

frontend/src/hooks/
├── useGridCombat.ts            # React state management, AI turn execution
```

**Files Modified:**

| File | Changes |
|------|---------|
| `types/localMap.ts` | Added `cost`, `blocksVision`, `coverValue` to tiles; new highlights (`selected_target`, `active_combatant`, `path_preview`) |
| `types/combat.ts` | Added `GridCombatant`, `GridCombatAction`, `GridCombatState`, `deriveGridCombatStats()`, `GRID_AP_COSTS` |
| `views/WorldPlayView.tsx` | Integrated `useGridCombat` hook, `GridCombatHUD` overlay, combat click handlers |

**System Architecture:**

```
Player enters threat zone
        ↓
handleEnterThreatZone()
        ↓
useGridCombat.startCombat(localMapState, playerId)
        ↓
initializeCombatFromMap() → GridCombatState
        ↓
┌─────────────────────────────────────────┐
│           COMBAT LOOP                   │
│                                         │
│  Player Turn:                           │
│    GridCombatHUD shows actions          │
│    Click tile → gridCombat.handleTileClick()
│    Click enemy → gridCombat.handleEntityClick()
│    Actions dispatch to gridCombatReducer()
│                                         │
│  Enemy Turn:                            │
│    gridEnemyAI.executeAITurn()          │
│    AI decides: attack > move > defend   │
│    Actions dispatch with delay          │
│                                         │
│  Check victory/defeat after each action │
└─────────────────────────────────────────┘
        ↓
onCombatEnd() → cleanup defeated entities
```

**AP Economy:**
- 4 AP per turn (reset at turn start)
- Move: 1 AP per tile (2 AP for difficult terrain)
- Attack: 2 AP (ends turn)
- Defend: 1 AP (+3 defense until next turn)

**Combat Formulas:**
- Attack: d20 + floor(level/2) + flanking(+2) vs target.defense
- Damage: actor.damage ± d7-3 - target.armor (min 1)
- Flanking: ally on opposite side of target grants +2 to hit

**Key Integration Points:**

1. `WorldPlayView.tsx` line ~100: `useGridCombat` hook initialization
2. `WorldPlayView.tsx` line ~1285: `handleEnterThreatZone` starts combat
3. `WorldPlayView.tsx` line ~1500: `GridCombatHUD` renders when `isInCombat`

**Known Issue:** Combat not triggering on threat zone entry.

**Likely Causes to Investigate:**
1. `localMapStateCache` may be null when `handleEnterThreatZone` fires
2. Need to expose `LocalMapState` from `LocalMapView` via callback
3. The `onEnterThreatZone` prop may not be wired correctly in current LocalMapView

**Next Steps:**
1. Add `onMapStateChange` callback to `LocalMapView` to populate `localMapStateCache`
2. Verify threat zone calculation is triggering `onEnterThreatZone`
3. Add console logs to trace combat initialization flow

---

### 2025-01-25 - Critical Integration Fixes

**Problem Identified:** Local map was displaying white rectangles instead of character portraits.

**Root Causes Found:**
1. `LocalMapView` didn't receive resolved NPC data (`roomNpcs` with `imageUrl`)
2. Player image path used non-existent `currentUser.imagePath` property
3. NPC images were explicitly set to `undefined` in `buildMapState()`
4. Fallback for missing images was plain white texture

**Fixes Applied:**

1. **LocalMapView.tsx:**
   - Added `roomNpcs?: ResolvedNPC[]` prop to receive resolved NPC data
   - Modified `buildMapState()` to use `roomNpcs` when available (with `imageUrl`)
   - Added `roomNpcs` to useCallback dependency array

2. **WorldPlayView.tsx:**
   - Fixed player image: `currentUser.filename` → `/api/user-image/${filename}`
   - Fixed companion image: Uses `roomNpcs[].imageUrl` as primary source
   - Now passes `roomNpcs={roomNpcs}` prop to LocalMapView

3. **localMapUtils.ts:**
   - Added `level?: number` to `autoPlaceEntities()` NPC interface
   - Entity HP now scales with level: `30 + level * 10`

4. **EntityCardSprite.ts:**
   - Improved no-image fallback: dark colored placeholder instead of white
   - Uses allegiance color tint for visual distinction

**Data Flow (Fixed):**
```
WorldPlayView                    LocalMapView                    EntityCardSprite
─────────────────────────────────────────────────────────────────────────────────
roomNpcs (with imageUrl)   →    roomNpcs prop              →    imagePath
resolveNpcDisplayData()         buildMapState()                 TextureCache.get()
```

**TypeScript:** Compiles successfully

---

## Quick Reference

### Spec Section Locations

| Section | Lines | Status |
|---------|-------|--------|
| Map System | 33-240 | 📖 Read |
| Creator vs Player Views | 246-319 | 📖 Read |
| Entity Card System | 327-450 | 📖 Read |
| Game Modes | 457-591 | 📖 Read |
| Combat System | 598-821 | 📖 Read |
| Companion System | 828-918 | 📖 Read |
| Affinity System | 925-971 | 📖 Read |
| Contracts System | 978-1026 | 📖 Read (Future) |
| UI Layout | 1032-1128 | 📖 Read |
| World State Persistence | 1134-1176 | 📖 Read |
| Implementation Priorities | 1182-1263 | 📖 Read |

### Color Reference (from spec)

| Allegiance | Frame Color | Badge Color |
|------------|-------------|-------------|
| Player | #FFD700 (gold) | #FFD700 |
| Bonded Ally | #3B82F6 (blue) | #3B82F6 |
| Friendly | #3B82F6 (blue) | #3B82F6 |
| Neutral | #6B7280 (gray) | #6B7280 |
| Hostile | #EF4444 (red) | #EF4444 |
| Captured | #3B82F6 (blue) | #6B7280 (gray) |

### Threat Zone Color
- `rgba(239, 68, 68, 0.4)` - Red semi-transparent
