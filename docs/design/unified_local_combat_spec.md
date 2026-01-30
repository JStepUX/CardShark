# Unified Local Map & Combat Specification

## 1. Executive Summary

This specification outlines the architectural transition from the abstract "Combat Stage" (2-row slot system) to a fully realized **Local Map Combat** system. In this new model, the Local Map serves as the single source of truth for both exploration and combat. When combat begins, the map "locks in," and gameplay shifts to a turn-based tactical grid system using the existing PixiJS local map engine.

## 2. Core Concepts

### 2.1 The "Locked-In" Scenario
- **Exploration Mode**: Real-time or free-move interaction. Player moves freely, interacts with NPCs/Objects.
- **Combat Mode**: Triggered by hostility or narrative event.
    - **Lock Down**: Map boundaries are enforced. Exits may be sealed.
    - **Grid Enforcement**: Movement becomes strictly tile-based and turn-ordered.
    - **HUD Transition**: Exploration UI fades out; Combat HUD (Turn Order, AP, Skills) fades in.

### 2.2 Unified Spatial Model
- **Deprecated**: `Battlefield` (5 enemy slots, 5 ally slots).
- **New Truth**: `LocalMapState` is the board. Combatants have `(x, y)` coordinates.
- **Range & Visibility**: Calculated using grid geometry (Manhattan or Chebyshev distance) and terrain flags.

---

## 3. Data Structure Specifications (YAML)

These schemas replace the relevant sections in `types/combat.ts` and extend `types/localMap.ts`.

```yaml
# =============================================================================
# COMBATANT (Updated)
# =============================================================================
Combatant:
  description: "Represents an active participant in combat on the grid."
  fields:
    id: "string (UUID)"
    name: "string"
    level: "number"
    # Position is now synced with LocalMapEntity
    position:
      x: "number (grid col)"
      y: "number (grid row)"
    
    stats:
      currentHp: "number"
      maxHp: "number"
      apRemaining: "number (Action Points)"
      movementRange: "number (Tiles per turn)"
      attackRange: "number (Tiles)"
    
    state:
      isPlayerControlled: "boolean"
      allegiance: "enum: player | ally | enemy"
      isKnockedOut: "boolean"
      isDefending: "boolean"
      isOverwatching: "boolean"
      facing: "enum: north | south | east | west" # Visuals/Backstab mechanics
      
    visuals:
      tokenScale: "number (default 1.0)"
      animationState: "enum: idle | move | attack | hit | die"

# =============================================================================
# COMBAT STATE (Refactored)
# =============================================================================
CombatState:
  description: "The reducer state overlaying the Local Map during battle."
  fields:
    phase: "enum: init | turn_start | input | resolution | victory | defeat"
    turnCount: "number"
    
    # Lookup for fast access; Truth for position stems from here during combat
    # creating a temporary 'lock' on the LocalMapEntity positions.
    combatants: "Map<string, Combatant>" 
    
    # Ordered list for initiative
    initiativeOrder: "List<string> (CombatantIDs)"
    currentTurnIndex: "number"
    
    # Grid Logic Overlays
    activeHazards: "List<HazardZone>" # Acid pools, fire, etc.
    threatZones: "List<TilePosition>" # Computed areas of enemy attack range
    
    # State-specific
    selectedTile: "TilePosition | null"
    targetTile: "TilePosition | null"

# =============================================================================
# LOCAL MAP INTEGRATION
# =============================================================================
LocalMapIntegration:
  description: "How the Map State interacts with Combat State"
  rules:
    - rule: "On Combat Start, convert all LocalMapEntities (Hostile/Player/Ally) into Combatants."
    - rule: "Sync Combatant.position back to LocalMapEntity.position after every Move action."
    - rule: "Pathfinding utilizes LocalMapTileData.traversable and LocalMapTileData.cost."
```

## 4. Mechanics & Logic

### 4.1 Movement Logic
Movement is no longer abstract. It consumes Action Points (AP) based on tile costs.
- **Base Cost**: 1 AP per tile.
- **Difficult Terrain**: 2 AP per tile.
- **Obstacles**: Impassable unless flying/ghost.
- **Pathing**: A* Algorithm implementation required in `utils/pathfinding.ts`.

### 4.2 Range & Targeting
Instead of "Rows", we use Grid Distance.
- **Melee**: Distance <= 1.5 (Adjacent, including diagonals).
- **Ranged**: Distance <= `weaponRange`.
- **Line of Sight (LOS)**: Raycast check against `LocalMapTileData.blocksVision`.

### 4.3 Adjacency Bonuses
Bonuses previously reliant on "Neighbor Slots" now check the 8 surrounding tiles.
- **Flanking**: If an ally is on the opposite side of the target, +Defense Penetration.
- **Support**: Shield/Defend actions apply to adjacent allies only.

## 5. Implementation Roadmap

### Phase 1: Engine Refactor
1.  **Modify `ActionType`**: Add `MoveAction` with `{ path: TilePosition[] }`.
2.  **Update `combatReducer`**:
    - Remove slot-based logic.
    - Implement `verifyMove(start, end, map)` validation.
    - Implement `calculateRange(a, b)` utility.
3.  **Sync Service**: Create `CombatMapSyncService` to hydrate `CombatState` from `LocalMapState`.

### Phase 2: UI/UX Transition
1.  **`LocalMapView` Update**:
    - Add `CombatOverlayLayer` (Grid highlights for range/movement).
    - Render `apRemaining` pips above tokens.
2.  **HUD Redesign**:
    - Port `CombatLogPanel` to the map screen (bottom-left floating).
    - Port `SkillBar` to map screen (bottom-center).

### Phase 3: AI Behavior
1.  **Enemy AI**:
    - Update decision tree: `FindNearestTarget` -> `PathTo` -> `Attack`.
    - Replace random slot selection with spatial threat assessment.

## 6. Technical Requirements for LLM Consumption
*When generating code based on this spec, adhere to the following:*
1.  **Pure Functions**: Keep `combatEngine` pure. Pass `mapData` as an argument to reducers.
2.  **Separation of Concerns**: Rendering (Pixi) must act *only* on state changes. Do not calculate combat logic in Pixi components.
3.  **Testability**: All grid math (Range, LOS, Pathing) must be unit-testable without a browser environment.

---

# Implementation Assessment & Plan

*Added: 2026-01-27*

## 7. Specification Quality Assessment

### 7.1 Strengths
| Aspect | Assessment |
|--------|------------|
| Vision Clarity | **Strong** - "Locked-in scenario" concept is well-articulated |
| Data Structures | **Good** - YAML schemas provide clear type definitions |
| Core Mechanics | **Good** - Movement, range, adjacency bonuses well-defined |
| Phase Roadmap | **Adequate** - High-level phases are sensible |
| LLM Guidelines | **Excellent** - Pure functions, separation of concerns |

### 7.2 Gaps & Missing Details

| Gap | Impact | Resolution |
|-----|--------|------------|
| **No current system acknowledgment** | High - Spec doesn't mention existing 8x5 local map or slot-based combat | Added in Section 8 |
| **HazardZone type undefined** | Medium - Referenced but never specified | Define in implementation |
| **AP economy unspecified** | High - How many AP/turn? Attack costs? | Default: 4 AP/turn, attack=2 AP |
| **Initiative system unclear** | Medium - Does it change from existing? | Keep existing speed-based system |
| **Allegiance mismatch** | Medium - Spec uses `player|ally|enemy`, existing uses `bonded_ally|friendly|neutral|hostile|captured` | Map allegiances at conversion |
| **Companion mechanics** | Medium - Existing companion-follow system not addressed | Companions become allies in combat |
| **Existing pathfinding** | Low - BFS exists in `localMapUtils.ts` | Upgrade to A* with costs |
| **Animation details** | Low - Existing animation system not referenced | Reuse `AnimationManager` pattern |

### 7.3 Compatibility Analysis

**Existing Combat System** (`types/combat.ts`, `combatEngine.ts`):
- Uses `Battlefield` with 5 enemy slots + 5 ally slots
- `CombatPhase`: `pre_battle → initiative → turn_start → awaiting_input → resolving → turn_end → victory/defeat`
- Stats via `deriveCombatStats(level)`: HP, damage, defense, speed, armor
- Actions: attack, defend, move (slot), swap, flee, overwatch, aimed_shot, mark_target, item

**Existing Local Map System** (`types/localMap.ts`, `localMapUtils.ts`):
- 8×5 grid with `LocalMapEntity` positions
- BFS pathfinding (no terrain costs)
- Threat zone calculation (adjacent to hostiles)
- Entity allegiances: `player | bonded_ally | friendly | neutral | hostile | captured`

**Key Insight**: Systems are well-isolated. We can create a **bridge layer** rather than wholesale replacement.

---

## 8. Current System Inventory

### 8.1 Files to Modify

| File | Change Type | Purpose |
|------|-------------|---------|
| `frontend/src/types/combat.ts` | Extend | Add grid position, AP fields to Combatant |
| `frontend/src/types/localMap.ts` | Extend | Add terrain cost, blocksVision to tiles |
| `frontend/src/services/combat/combatEngine.ts` | Major refactor | Grid-based actions, range calculations |
| `frontend/src/services/combat/enemyAI.ts` | Refactor | Spatial pathfinding decisions |
| `frontend/src/utils/localMapUtils.ts` | Extend | A* pathfinding, LOS calculation |

### 8.2 Files to Create

| File | Purpose |
|------|---------|
| `frontend/src/utils/pathfinding.ts` | A* algorithm with terrain costs |
| `frontend/src/utils/gridCombatUtils.ts` | Range, LOS, flanking calculations |
| `frontend/src/services/combat/combatMapSync.ts` | LocalMapState ↔ CombatState bridge |
| `frontend/src/components/combat/GridCombatOverlay.tsx` | Combat UI overlay for local map |

### 8.3 Files to Eventually Deprecate

| File | Reason |
|------|--------|
| `PixiCombatModal.tsx` | Replaced by in-map combat |
| `BattlefieldStage.ts` | Slot-based rendering no longer needed |

---

## 9. Detailed Implementation Plan

### Phase 1: Foundation (Grid Utilities)
**Goal**: Pure functions for grid math, testable without UI

- [ ] **Task 1.1**: Create `utils/pathfinding.ts`
  - A* algorithm with terrain cost support
  - `findPathWithCost(start, end, grid, maxAP)` → returns path or null
  - Unit tests with mock grids

- [ ] **Task 1.2**: Create `utils/gridCombatUtils.ts`
  - `calculateDistance(a, b, metric)` - Manhattan or Chebyshev
  - `checkLineOfSight(from, to, grid)` - Bresenham raycast
  - `getValidMoveTargets(position, ap, grid)` - Reachable tiles
  - `getValidAttackTargets(position, range, grid, combatants)` - Targetable enemies
  - `checkFlanking(attacker, target, allies)` - Flanking bonus check

- [ ] **Task 1.3**: Extend `types/localMap.ts`
  - Add `cost?: number` to `LocalMapTileData` (default 1)
  - Add `blocksVision?: boolean` to `LocalMapTileData`
  - Add `blocksMovement?: boolean` to `LocalMapTileData`

### Phase 2: Combat Engine Refactor
**Goal**: Grid-aware combat reducer

- [ ] **Task 2.1**: Extend `types/combat.ts`
  - Add `position: TilePosition` to `Combatant`
  - Add `apRemaining: number` to `CombatantStats`
  - Add `movementRange: number` to `CombatantStats`
  - Add `attackRange: number` to `CombatantStats`
  - Define `GridMoveAction = { type: 'grid_move', path: TilePosition[] }`
  - Define `GridAttackAction = { type: 'grid_attack', targetId: string }`

- [ ] **Task 2.2**: Create `services/combat/combatMapSync.ts`
  - `hydrateFromLocalMap(mapState: LocalMapState)` → `Combatant[]`
  - `syncToLocalMap(combatants, mapState)` → updated `LocalMapState`
  - Map allegiances: `hostile → enemy`, `bonded_ally|friendly → ally`, `player → player`

- [ ] **Task 2.3**: Refactor `combatEngine.ts`
  - Add `gridReducer` alongside existing reducer (feature flag)
  - `processGridMove(state, action, mapGrid)` - validate path, deduct AP
  - `processGridAttack(state, action, mapGrid)` - validate range/LOS, apply damage
  - Keep existing slot logic behind `LEGACY_SLOT_COMBAT` flag

- [ ] **Task 2.4**: Refactor `enemyAI.ts`
  - `chooseGridAction(combatant, state, mapGrid)` → action
  - Priority: attack if in range → move toward nearest target → defend

### Phase 3: UI Integration
**Goal**: Combat overlay on local map

- [ ] **Task 3.1**: Create `components/combat/GridCombatOverlay.tsx`
  - Movement range highlight (blue tiles)
  - Attack range highlight (red tiles)
  - Valid target indicators
  - Current combatant indicator (glow/pulse)

- [ ] **Task 3.2**: Modify `LocalMapView.tsx`
  - Add `combatMode: boolean` prop
  - When `combatMode=true`:
    - Disable free movement
    - Show `GridCombatOverlay`
    - Click handlers dispatch combat actions instead of move
  - Render AP pips above player entity

- [ ] **Task 3.3**: Create `components/combat/GridCombatHUD.tsx`
  - Turn order bar (top)
  - Action buttons (End Turn, Attack, Defend, Items)
  - Floating combat log (bottom-left, reuse `CombatLogPanel` logic)
  - Phase indicator

- [ ] **Task 3.4**: Combat mode transition in `WorldPlayView.tsx`
  - Detect threat zone entry → trigger combat
  - Fade exploration UI → show combat HUD
  - On victory/defeat → fade back to exploration

### Phase 4: Polish & AI
**Goal**: Complete experience

- [ ] **Task 4.1**: Enhanced enemy AI
  - Threat assessment: prioritize low-HP targets
  - Positioning: maintain attack range, avoid flanking
  - Use terrain: prefer cover tiles (future)

- [ ] **Task 4.2**: Animations
  - Movement animation along path (step-by-step)
  - Attack animation toward target tile
  - Hit/death effects at position

- [ ] **Task 4.3**: Testing & balance
  - Integration tests for combat flow
  - Balance AP costs vs. grid size (8×5)
  - Tune enemy AI aggression

---

## 10. Progress Tracker

| Task | Status | Notes |
|------|--------|-------|
| 1.1 Pathfinding utility | ✅ Complete | `utils/pathfinding.ts` - A*, terrain costs, reachability |
| 1.2 Grid combat utils | ✅ Complete | `utils/gridCombatUtils.ts` - distance, LOS, flanking |
| 1.3 Extend localMap types | ✅ Complete | Added cost, blocksVision, coverValue, new highlights |
| 2.1 Extend combat types | ✅ Complete | `GridCombatant`, `GridCombatAction`, `deriveGridCombatStats` |
| 2.2 Combat map sync | ✅ Complete | `services/combat/combatMapSync.ts` - hydrate, sync, cleanup |
| 2.3 Combat engine refactor | ✅ Complete | `services/combat/gridCombatEngine.ts` - new grid reducer |
| 2.4 Enemy AI refactor | ✅ Complete | `services/combat/gridEnemyAI.ts` - spatial AI decisions |
| 3.1 Grid combat overlay | ✅ Complete | Tile highlights via existing map system |
| 3.2 LocalMapView combat mode | ✅ Complete | `hooks/useGridCombat.ts` integration hook |
| 3.3 Grid combat HUD | ✅ Complete | `components/combat/GridCombatHUD.tsx` |
| 3.4 Combat mode transition | ✅ Complete | Integrated into WorldPlayView |
| 4.1 Enhanced enemy AI | ⏸️ Deferred | Basic AI functional |
| 4.2 Animations | ✅ Complete | `services/combat/gridCombatAnimations.ts` |
| 4.3 Testing & balance | ⬜ Not Started | |

**Legend**: ⬜ Not Started | 🔄 In Progress | ✅ Complete | ⏸️ Blocked

---

## 11. Open Questions

1. **Grid size**: Keep 8×5 or expand for combat tactical depth?
2. **AP per turn**: Default to 4? Should vary by combatant speed stat?
3. **Attack AP cost**: 2 AP for basic attack? All remaining AP for power attack?
4. **Companion behavior**: AI-controlled ally or player-controlled second unit?
5. **Retreat mechanic**: Can players flee mid-combat? Exit tile requirement?

---

## 12. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Feature flag complexity | Medium | Medium | Clean interface between old/new systems |
| Grid too small for tactics | Medium | High | Consider 10×6 or dynamic sizing |
| AI pathfinding performance | Low | Medium | Cache paths, limit search depth |
| Animation timing issues | Medium | Low | Queue-based animation system (exists) |
| Breaking existing saves | Low | High | Version combat state, migration path |

