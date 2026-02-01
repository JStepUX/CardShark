# Local Map Navigation, Interaction, and Combat System - Improvement Specification

**Created:** 2026-01-31
**Last Updated:** 2026-01-31
**Scope:** High-value improvements for UX, maintainability, and code quality
**Reference:** `.kiro/steering/llms-full.txt` (PixiJS v8 Documentation)

---

## Executive Summary

After analyzing the current implementation against the PixiJS v8 documentation, this specification identifies targeted improvements across three categories: UX, Maintainability, and Code Quality. Each improvement is assessed for impact vs. effort to prioritize high-value changes.

---

## Completed Improvements

### ✅ 1.1 Viewport Culling for Performance
**Completed:** 2026-01-31

Enabled PixiJS culling on layer containers in `LocalMapStage.ts`:
- `backgroundLayer.cullable = true`
- `gridLayer.cullable = true` + `cullableChildren = true`
- `threatZoneLayer.cullable = true`
- `exitLayer.cullable = true`
- `entityShadowLayer.cullable = true`
- `entityLayer.cullable = true` + `cullableChildren = true`
- `effectsLayer.cullable = true`
- `uiLayer.cullable = true`

**Files Changed:** `LocalMapStage.ts` (lines 107-138)

---

### ✅ 1.3 Entity Card Click Responsiveness
**Completed:** 2026-01-31

Expanded hit area by 8px on all sides for better touch targets:
- Added `HIT_AREA_PADDING = 8` constant
- Updated `hitArea` calculation to include padding on all sides

**Files Changed:** `EntityCardSprite.ts` (lines 41, 105-112)

---

### ✅ 3.1 Memory Leak Fix in Animation Callbacks
**Completed:** 2026-01-31

Added tracking for all pending animation frames and timeouts:
- New properties: `pendingAnimationFrames: Set<number>`, `pendingTimeouts: Set<ReturnType<typeof setTimeout>>`, `isDestroyed: boolean`
- Updated `destroy()` to cancel all pending frames and timeouts
- Updated all animation methods to check `isDestroyed` and track frame IDs:
  - `playDamageFlash()` - tracks timeout
  - `playEntranceAnimation()` - tracks rAF
  - `playDeathAnimation()` - tracks rAF
  - `spawnDeathParticles()` - tracks rAF, safe cleanup
  - `playIncapacitationAnimation()` - tracks rAF
  - `playRevivalAnimation()` - tracks rAF
  - `spawnRevivalParticles()` - tracks rAF + timeouts, safe cleanup

**Files Changed:** `EntityCardSprite.ts`

---

### ✅ 3.2 Debug Logging Cleanup
**Completed:** 2026-01-31

Added `DEBUG = false` flag and gated all console.log statements:
- `LocalMapStage.ts` - 8 log statements gated
- `LocalMapView.tsx` - 13 log statements gated
- `useGridCombat.ts` - 15 log statements gated

**Files Changed:** `LocalMapStage.ts`, `LocalMapView.tsx`, `useGridCombat.ts`

---

### ✅ 2.1 Extract Animation System from EntityCardSprite
**Completed:** 2026-01-31

Extracted all animation logic from EntityCardSprite.ts into a dedicated CardAnimationController class:

**New File:** `CardAnimationController.ts` (523 lines)
- Manages animation state, queuing, and memory cleanup
- All animation frames and timeouts tracked for proper cleanup
- Implements: `playEntrance()`, `playMoveTo()`, `playAttack()`, `playDamageFlash()`, `playDeath()`, `playIncapacitation()`, `playRevival()`, `updateBob()`
- Includes particle spawning for death (red) and revival (gold) effects
- Easing functions: `easeOutBounce()`, `easeOutElastic()`, `lerpColor()`

**Refactored:** `EntityCardSprite.ts` (reduced from 1242 to 676 lines)
- Now implements `CardSpriteInterface` for type-safe controller access
- All animation methods delegate to `CardAnimationController`
- Added `getBorder()` method for controller to access border tint
- Constructor initializes controller after visual layers created
- `destroy()` cleans up controller

**Benefits:**
- Animation logic isolated in dedicated class for easier testing and modification
- EntityCardSprite focused on visual structure and state management
- Consistent memory leak prevention via controller's cleanup
- Animation system can be extended independently

**Files Changed:** `EntityCardSprite.ts`, `CardAnimationController.ts`, `index.ts`

---

## Pending Improvements

### 1. UX Improvements

#### 1.2 Add Path Preview Highlighting During Movement (MEDIUM VALUE)

**Current State:**
When player clicks a distant tile, movement begins immediately with no visual preview of the path.

**Improvement:**
Show a path preview (highlighted tiles) on hover when in move mode during combat. The `TileHighlight` type already includes `'path_preview'`.

**Implementation Approach:**
- In `LocalMapView.tsx`, add mouse hover handling during combat move mode
- Calculate path on hover using existing `findPath()` utility
- Highlight intermediate tiles with `'path_preview'` style
- Clear preview on mouseout or click

**Impact:** Medium (better tactical decision-making UX)
**Effort:** Medium (hover state management, pathfinding on hover)

---

### 2. Maintainability Improvements

#### 2.2 Consolidate Duplicate Tile Grid Building Logic (MEDIUM VALUE)

**Current State:**
`LocalMapView.tsx` has duplicate tile grid building code in `buildMapState()` - once for combat mode and once for exploration mode (lines 370-424 and 476-520). The zone type handling is nearly identical.

**Improvement:**
Extract shared logic into a helper function.

**Implementation Approach:**
```typescript
function buildTileGrid(
    config: LocalMapConfig,
    layoutData?: RoomLayoutData
): LocalMapTileData[][] {
    const tiles: LocalMapTileData[][] = [];
    for (let y = 0; y < config.gridHeight; y++) {
        tiles[y] = [];
        for (let x = 0; x < config.gridWidth; x++) {
            const zoneType = getCellZoneType(layoutData, x, y);
            tiles[y][x] = createTileFromZone(x, y, zoneType);
        }
    }
    return tiles;
}
```

**Impact:** Medium (DRY, fewer places for bugs)
**Effort:** Low (straightforward extraction)

---

#### 2.3 Use RenderGroups for Static vs Dynamic Content (MEDIUM VALUE)

**Current State:**
`LocalMapStage.ts` creates separate layers (backgroundLayer, gridLayer, etc.) but all are updated every frame through the same render pass.

**Improvement:**
Use PixiJS RenderGroups to separate static (background, grid) from dynamic (entities, effects) content.

**Reference (llms-full.txt):**
```typescript
const staticContent = new Container({
    isRenderGroup: true,
});
```

**Implementation Approach:**
- Mark `backgroundLayer` and `gridLayer` as `isRenderGroup: true` after initial setup
- Keep `entityLayer` and `effectsLayer` in the main render pass
- Only rebuild static render group when room changes, not every frame

**Impact:** Medium (GPU-side optimization for static content)
**Effort:** Medium (need to understand when static content actually changes)

---

#### 2.4 Formalize Combat Event Contract (MEDIUM VALUE)

**Current State:**
`CombatEvent` types in `combat.ts` use loose `data` typing. The `useGridCombat.ts` hook processes events with inline type assertions and string checks.

**Improvement:**
Create discriminated union types for combat events with explicit data shapes.

**Implementation Approach:**
```typescript
interface MoveCompletedEvent {
    type: 'move_completed';
    actorId: string;
    data: {
        path: TilePosition[];
        actorName: string;
        apSpent: number;
    };
}

interface AttackResolvedEvent {
    type: 'attack_resolved';
    actorId: string;
    targetId: string;
    data: {
        hitQuality: HitQuality;
        finalDamage: number;
        // ...
    };
}

type CombatEvent = MoveCompletedEvent | AttackResolvedEvent | ...;
```

**Impact:** Medium (type safety catches bugs at compile time)
**Effort:** Medium (type definition work)

---

### 3. Code Quality Improvements

#### 3.3 Consolidate Pathfinding Implementations (MEDIUM VALUE)

**Current State:**
There are two pathfinding implementations:
1. `localMapUtils.ts`: Simple BFS `findPath()` for exploration movement
2. `pathfinding.ts`: A* with cost support for combat movement

Both are used in different contexts, which can cause subtle behavior differences.

**Improvement:**
Consolidate into a single pathfinding module with configuration options.

**Implementation Approach:**
- Deprecate `localMapUtils.findPath()`
- Use `pathfinding.ts` everywhere with appropriate options
- The exploration code can call: `findPath(start, goal, grid, { maxCost: Infinity })`

**Impact:** Medium (single source of truth for pathfinding behavior)
**Effort:** Low (swap function calls, add defaults)

---

#### 3.4 Add Type Safety to Texture Loading (MEDIUM VALUE)

**Current State:**
`TextureCache.get()` returns `PIXI.Texture` but callers don't handle the case where a texture failed to load and returns a fallback.

**Improvement:**
Make the fallback case explicit in the return type or add a method to check if texture is valid.

**Implementation Approach:**
```typescript
interface TextureCacheResult {
    texture: PIXI.Texture;
    isFallback: boolean;
}

// Or add a check method
if (TextureCache.isMissing(imagePath)) {
    // Handle missing texture case
}
```

**Impact:** Medium (explicit handling of missing assets)
**Effort:** Low (type changes, optional visual indicator for fallback)

---

## Priority Summary (Pending Items)

### High Priority (High Impact)
~~1. **2.1** Extract Animation System - maintainability cornerstone~~ **COMPLETED**

### Medium Priority (Medium Impact)
2. **2.2** Consolidate Tile Grid Logic - DRY principle
3. **3.3** Consolidate Pathfinding - consistency
4. **1.2** Path Preview Highlighting - nice-to-have UX
5. **2.4** Formalize Event Types - type safety

### Lower Priority
6. **2.3** RenderGroups - GPU optimization
7. **3.4** Texture Loading Type Safety - edge case handling

---

## Non-Recommendations

The following were considered but NOT recommended:

### Using pixi-react
The `llms-full.txt` mentions React integration, but the current manual PIXI management in `LocalMapView.tsx` provides:
- More control over canvas lifecycle
- Easier cleanup of resources
- No additional dependency

The current pattern works well and switching would require significant refactoring with unclear benefit.

### PixiJS Layout Library
Mentioned in the ecosystem docs, but the 5x8 grid layout is simple enough that flexbox-style layout would be overkill. The current manual positioning is clear and performant.

### Using PixiJS Filters for Highlights
The current Graphics-based highlights are efficient for the simple rectangle/border use case. Full GPU filters would be overkill.

---

## Implementation Notes

When implementing remaining improvements:

1. **Test on multiple zoom levels** - Verify behavior at min/max zoom
2. **Verify combat flow** - Animation timing changes could affect combat pacing
3. **Check mobile touch targets** - Continue testing on touch devices
4. **Preserve existing behavior** - These are refinements, not redesigns
