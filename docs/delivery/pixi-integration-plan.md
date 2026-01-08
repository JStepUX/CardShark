# Pixi.js Combat System Specification

**Date**: 2026-01-08
**Status**: Approved for Implementation

## Overview

Replace the current CSS-based combat UI with pixi.js canvas rendering. The combat engine (`combatEngine.ts`) is unchanged - only the rendering layer is replaced.

**Dependencies**:
```json
{
  "pixi.js": "^8.0.0"
}
```

**Bundle impact**: ~150KB gzipped

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ React Component (PixiCombatModal.tsx)                       │
│  - Holds CombatState in useState                            │
│  - Renders action buttons (Tailwind)                        │
│  - Contains <div ref={containerRef}> for canvas             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Pixi.js Application (created in useEffect)                  │
│  - PIXI.Application instance                                │
│  - BattlefieldStage (PIXI.Container)                        │
│  - AnimationManager (ticker-based)                          │
│  - ParticleSystem (object-pooled)                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Combat Engine (unchanged)                                   │
│  - combatReducer(state, action) → { state, events }         │
│  - Pure functions, no rendering logic                       │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. User clicks action button (React)
2. React calls `combatReducer(state, action)`
3. React updates state via `setCombatState(newState)`
4. `useEffect` detects state change
5. Calls `battlefield.updateFromState(newState)`
6. Combat events trigger animations via `AnimationManager`

### File Structure

```
frontend/src/components/combat/
├── CombatModal.tsx           # OLD - keep as fallback until Phase 4
├── CombatCard.tsx            # OLD - delete in Phase 4
├── BattlefieldGrid.tsx       # OLD - delete in Phase 4
└── pixi/
    ├── PixiCombatModal.tsx   # React wrapper, state management, action buttons
    ├── BattlefieldStage.ts   # PIXI.Container subclass, grid layout
    ├── CombatantSprite.ts    # PIXI.Container subclass, card rendering
    ├── AnimationManager.ts   # Ticker-based animation queue
    ├── ParticleSystem.ts     # Object-pooled particle emitter
    └── TextureCache.ts       # Singleton texture loader/cache
```

---

## Component Specifications

### PixiCombatModal.tsx

React component that:
- Initializes PIXI.Application in `useEffect`
- Appends canvas to a div ref
- Holds `CombatState` in `useState`
- Renders action buttons using existing `ActionButtons.tsx`
- Renders combat log using existing `CombatLog.tsx`
- Calls `battlefield.updateFromState()` when state changes
- Cleans up PIXI.Application on unmount

```tsx
interface PixiCombatModalProps {
  initData: CombatInitData;
  onCombatEnd: (result: CombatState['result']) => void;
  onNarratorRequest?: (events: CombatEvent[]) => void;
}
```

**Error handling**: If PIXI.Application fails to initialize, log error and render nothing (parent component should fall back to CSS combat via feature flag).

### BattlefieldStage.ts

PIXI.Container subclass that:
- Creates 10 slot positions (5 enemy row, 5 ally row)
- Manages CombatantSprite instances
- Provides `updateFromState(state: CombatState)` method
- Handles click detection for targeting

**Grid layout**:
```
Enemy Row:    [0] [1] [2] [3] [4]    y = 80

Ally Row:     [0] [1] [2] [3] [4]    y = 400

Slot width: 140px (112px card + 28px gap)
Card size: 112×160px
Stage size: 800×600px
```

**Slot X positions**: `slotX = 120 + (slot * 140)`

### CombatantSprite.ts

PIXI.Container subclass representing one combatant card:

**Visual layers** (bottom to top):
1. Card border (PIXI.Graphics) - amber for allies, red for enemies
2. Portrait (PIXI.Sprite) - character image, 104×108px
3. Gradient overlay (PIXI.Graphics) - for text readability
4. Level badge (PIXI.Graphics + PIXI.Text) - top left
5. Name plate (PIXI.Graphics + PIXI.Text) - bottom
6. HP bar (PIXI.Graphics) - bottom, shows current/max
7. Status icons (PIXI.Graphics) - DEF, OW badges
8. Damage number (PIXI.Text) - floats up and fades, shown on hit

**Methods**:
- `updateFromState(combatant: Combatant)` - sync visuals to state
- `playAttackAnimation(direction: 'up' | 'down'): Promise<void>`
- `playHitAnimation(): Promise<void>`
- `showDamage(amount: number): void`

**Interactivity**:
- `eventMode = 'static'` for click detection
- Emit `'selected'` event when clicked
- Visual highlight when valid target (glow effect)

### AnimationManager.ts

Manages all animations via PIXI.Ticker:

```ts
class AnimationManager {
  private app: PIXI.Application;
  private animations: Map<string, Animation>;

  constructor(app: PIXI.Application);

  play(id: string, animation: Animation): Promise<void>;
  cancel(id: string): void;
  cancelAll(): void;
  destroy(): void;
}

interface Animation {
  update(deltaTime: number): boolean; // returns true when complete
  onComplete?: () => void;
}
```

**Built-in animations**:
- `AttackAnimation` - wind-up → strike → return (0.6s total)
- `HitAnimation` - shake + flash (0.3s)
- `MoveAnimation` - slide to new slot (0.4s)
- `DamageNumberAnimation` - float up + fade (0.8s)
- `DeathAnimation` - fade out + grayscale (0.5s)

### ParticleSystem.ts

Object-pooled particle emitter:

```ts
class ParticleSystem {
  constructor(app: PIXI.Application, container: PIXI.Container);

  emit(config: ParticleConfig): void;
  update(deltaTime: number): void;
  destroy(): void;
}

interface ParticleConfig {
  x: number;
  y: number;
  texture: string;        // 'spark' | 'smoke'
  count: number;          // particles to spawn
  speed: number;          // pixels per second
  lifetime: number;       // seconds
  gravity?: number;       // pixels per second squared
  fadeOut?: boolean;
}
```

**Pool size**: 100 particles pre-allocated

### TextureCache.ts

Singleton for texture management:

```ts
class TextureCache {
  static async preload(paths: string[]): Promise<void>;
  static get(path: string): PIXI.Texture;
  static clear(): void;
}
```

**Preload at combat start**:
- All combatant images
- `spark.png` (32×32 white spark)
- `smoke.png` (32×32 gray smoke)
- `arrow.png` (16×16 arrow projectile)
- `fireball.png` (32×32 fireball projectile)

---

## Animation Specifications

### Attack Animation (Melee)

**Duration**: 600ms total

| Phase | Duration | Motion |
|-------|----------|--------|
| Wind-up | 120ms | Move back 12px, rotate 8°, scale 1.08 |
| Strike | 180ms | Move forward 80px toward target, rotate -12°, scale 1.15 |
| Return | 300ms | Return to start position, rotation 0, scale 1 |

**Easing**:
- Wind-up: `easeInQuad`
- Strike: `easeOutBack` (overshoot for impact feel)
- Return: `easeOutQuad`

**Direction**:
- Ally attacks: move up (negative Y)
- Enemy attacks: move down (positive Y)

### Hit Animation

**Duration**: 300ms

| Effect | Implementation |
|--------|----------------|
| Shake | Oscillate X ±4px, 3 cycles |
| Flash | Tint white (#FFFFFF) at 0ms, fade to normal by 200ms |

**Trigger**: When attack resolves, target plays hit animation

### Damage Number

**Duration**: 800ms

| Property | Start | End |
|----------|-------|-----|
| Y offset | 0 | -40px |
| Alpha | 1 | 0 |
| Scale | 1.2 | 0.8 |

**Style**: Bold, red (#FF4444), 24px, drop shadow

### Move Animation

**Duration**: 400ms

**Easing**: `easeInOutQuad`

Slide from current slot X to target slot X.

### Screen Shake (Critical Hit)

**Duration**: 200ms

**Implementation**: Offset entire stage container randomly ±6px each frame, return to (0,0) at end.

**Trigger**: When `hitQuality === 'critical'`

---

## Particle Specifications

### Hit Sparks

**Trigger**: On successful attack hit

**Config**:
```ts
{
  x: targetSprite.x,
  y: targetSprite.y + 60,
  texture: 'spark',
  count: 8,
  speed: 120,
  lifetime: 0.4,
  gravity: 200,
  fadeOut: true
}
```

### Death Smoke

**Trigger**: When combatant HP reaches 0

**Config**:
```ts
{
  x: targetSprite.x,
  y: targetSprite.y + 80,
  texture: 'smoke',
  count: 12,
  speed: 40,
  lifetime: 0.8,
  gravity: -50,  // rises
  fadeOut: true
}
```

---

## Projectile Specifications (Phase 4)

### Arrow (Ranged Physical)

**Size**: 16×16px
**Trajectory**: Parabolic arc (apex at midpoint)
**Duration**: 400ms
**Rotation**: Point toward target, adjust during flight

### Fireball (Ranged Magic)

**Size**: 32×32px
**Trajectory**: Straight line
**Duration**: 300ms
**Effect**: Emit spark particles during flight (2 per frame)

---

## Implementation Phases

### Phase 1: Static Rendering (3-4 days)

**Goal**: Pixi.js canvas shows all combatants in correct positions

**Tasks**:
1. `npm install pixi.js`
2. Create `TextureCache.ts`
3. Create `CombatantSprite.ts` (no animations)
4. Create `BattlefieldStage.ts`
5. Create `PixiCombatModal.tsx` with feature flag
6. Wire up state → `updateFromState()`

**Done when**: Can toggle feature flag and see static battlefield with all combatants, HP bars update when state changes.

### Phase 2: Combat Actions (4-5 days)

**Goal**: All actions work with animations

**Tasks**:
1. Create `AnimationManager.ts`
2. Implement `AttackAnimation`
3. Implement `HitAnimation`
4. Implement `DamageNumberAnimation`
5. Implement `MoveAnimation`
6. Wire up click targeting
7. Connect to existing `ActionButtons.tsx`
8. Add turn indicator (bouncing arrow above current actor)

**Done when**: Can complete full combat using pixi.js version, all animations play smoothly.

### Phase 3: Polish (3-4 days)

**Goal**: Combat feels impactful

**Tasks**:
1. Create particle assets (`spark.png`, `smoke.png`)
2. Create `ParticleSystem.ts`
3. Add hit sparks
4. Add death smoke
5. Add screen shake on critical hits
6. Add status icons (DEF, OW badges)
7. Profile and optimize if >16ms frame time

**Done when**: Combat feels "juicy", particles work, no performance issues.

### Phase 4: Ranged + Cleanup (3-4 days)

**Goal**: Ranged attacks work, old code deleted

**Tasks**:
1. Create projectile assets (`arrow.png`, `fireball.png`)
2. Create `ProjectileSprite.ts`
3. Implement arc trajectory for arrows
4. Implement straight trajectory for magic
5. Delete `CombatModal.tsx`, `CombatCard.tsx`, `BattlefieldGrid.tsx`
6. Remove CSS combat animations from Tailwind config
7. Remove feature flag (pixi.js is now the only option)

**Done when**: Ranged attacks show projectiles, ~500 lines of old code deleted.

---

## Cleanup Checklist

Before merging each phase, verify:

- [ ] No console errors or warnings
- [ ] Frame time <16ms (check Chrome DevTools Performance)
- [ ] No memory growth over 5-minute combat (check DevTools Memory)
- [ ] All ticker callbacks removed on unmount
- [ ] All event listeners removed on unmount
- [ ] TextureCache.clear() called on combat end

---

## Easing Functions

Include these in a `utils/easing.ts` file:

```ts
export function easeInQuad(t: number): number {
  return t * t;
}

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
```

---

## Asset Checklist

Create these files in `frontend/public/assets/`:

```
assets/
  particles/
    spark.png      # 32×32, white circle with soft edges
    smoke.png      # 32×32, gray cloud shape, semi-transparent
  projectiles/
    arrow.png      # 16×16, simple arrow pointing right
    fireball.png   # 32×32, orange/red fireball
```

**Note**: Assets can be simple placeholders initially. Polish later.

---

## Timeline

| Phase | Days | Cumulative |
|-------|------|------------|
| Phase 1: Static | 3-4 | 3-4 days |
| Phase 2: Actions | 4-5 | 7-9 days |
| Phase 3: Polish | 3-4 | 10-13 days |
| Phase 4: Ranged | 3-4 | 13-17 days |

**Buffer**: 3-5 days for unexpected issues

**Total estimate**: 15-20 days

---

## Success Criteria

The implementation is complete when:

1. All combat actions work (attack, defend, move, swap, overwatch, flee)
2. Animations play at 60fps
3. Particles spawn and despawn without memory leaks
4. Ranged attacks show projectile travel
5. Old CSS combat code is deleted (~500 lines removed)
6. No feature flag needed (pixi.js is the only combat renderer)
