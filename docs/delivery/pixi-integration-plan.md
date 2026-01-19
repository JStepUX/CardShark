# CardShark Combat Engine v2 Specification

**Date**: 2026-01-18  
**Status**: Approved for Implementation  
**Vision**: Build the rendering foundation that transforms CardShark from tactical prototype to a genuinely differentiated game

---

## Why We're Building This

The current CSS-based combat system proved the core mechanics work. Players can attack, defend, move, and the tactical decisions matter. But we've hit the ceiling of what CSS animations can deliver.

This isn't a migration—it's building the **real engine** that unlocks:

### Near-Term Capabilities (This Spec)
- Fluid 60fps animations with real impact feel
- Particle effects for hits, deaths, and criticals
- Projectile systems for ranged/magic attacks
- Screen shake and collision feedback

### Future Capabilities (Enabled By This Foundation)
- **Environmental Effects**: Wet ground, ice, fire zones—grid cells with visual state
- **Spell & Status Effects**: Poison pools, bleeding particles, burning auras
- **Stealth & Revelation**: Characters entering combat hidden, traps invisible until triggered
- **Destructible Terrain**: Grid points that can be destroyed, limiting movement options
- **Trap System**: Bear traps, spring traps placed on grid points by stealth characters
- **Side-Switching**: Rogue cards that flip allegiance mid-combat with backstab flourishes
- **Advanced Combat Feedback**: Slash trails, critical hit flashes, combo indicators

The goal: a game with actual tactical depth wrapped in character collection. Real decisions, real consequences, real juice.

---

## Architecture

The combat engine (`combatEngine.ts`) remains unchanged—pure functions, no rendering logic. We're replacing only the rendering layer.

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
│ Pixi.js Application                                         │
│  ├── BattlefieldStage (PIXI.Container)                      │
│  │     └── GridLayer (future: terrain state, traps, zones)  │
│  ├── CombatantLayer (card sprites)                          │
│  ├── EffectsLayer (particles, projectiles, status effects)  │
│  ├── AnimationManager (ticker-based orchestration)          │
│  └── ParticleSystem (object-pooled emitters)                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Combat Engine (unchanged)                                   │
│  - combatReducer(state, action) → { state, events }         │
│  - Pure functions, no rendering logic                       │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**Layered rendering**: Separate containers for grid, combatants, and effects. This enables future features like ground effects rendering below cards, projectiles rendering above, etc.

**Event-driven animations**: Combat events (hit, miss, critical, death) trigger corresponding visual responses. The engine emits events; the renderer interprets them.

**Extensible particle system**: Object-pooled, config-driven. Adding new effect types (poison clouds, ice shards) should be data, not code.

### Data Flow

1. User clicks action button (React)
2. React calls `combatReducer(state, action)`
3. Reducer returns `{ newState, events: CombatEvent[] }`
4. React updates state via `setCombatState(newState)`
5. `useEffect` detects state change, calls `battlefield.updateFromState(newState)`
6. Combat events are passed to `AnimationManager.playSequence(events)`
7. Animations resolve in order, then control returns to player

---

## File Structure

```
frontend/src/components/combat/
├── CombatModal.tsx           # OLD - keep as fallback until Phase 4
├── CombatCard.tsx            # OLD - delete in Phase 4
├── BattlefieldGrid.tsx       # OLD - delete in Phase 4
└── pixi/
    ├── PixiCombatModal.tsx   # React wrapper, state management
    ├── BattlefieldStage.ts   # Main container, grid layout
    ├── CombatantSprite.ts    # Card rendering, per-combatant animations
    ├── AnimationManager.ts   # Ticker-based animation queue
    ├── ParticleSystem.ts     # Object-pooled particle emitter
    ├── ProjectileSprite.ts   # Arrows, fireballs, spell effects
    ├── TextureCache.ts       # Singleton texture loader/cache
    └── effects/              # Future: status effect renderers
        └── (reserved for poison, fire, ice, etc.)
```

---

## Core Components

### PixiCombatModal.tsx

React component responsibilities:
- Initialize PIXI.Application in `useEffect`, append to div ref
- Hold `CombatState` in `useState`
- Render action buttons via existing `ActionButtons.tsx`
- Render combat log via existing `CombatLog.tsx`
- Call `battlefield.updateFromState()` on state changes
- Clean up PIXI.Application on unmount

```tsx
interface PixiCombatModalProps {
  initData: CombatInitData;
  onCombatEnd: (result: CombatState['result']) => void;
  onNarratorRequest?: (events: CombatEvent[]) => void;
}
```

**Error handling**: If PIXI.Application fails, log error and render nothing. Parent falls back to CSS combat via feature flag.

### BattlefieldStage.ts

PIXI.Container subclass managing the battlefield:
- Creates 10 slot positions (5 enemy row, 5 ally row)
- Manages CombatantSprite instances
- Provides `updateFromState(state: CombatState)` method
- Handles click detection for targeting

**Grid Layout**:
```
Enemy Row:    [0] [1] [2] [3] [4]    y = 80

Ally Row:     [0] [1] [2] [3] [4]    y = 400

Slot width: 140px (112px card + 28px gap)
Card size: 112×160px
Stage size: 800×600px
Slot X positions: slotX = 120 + (slot * 140)
```

**Future-proofing**: Grid slots should be objects, not just positions. This enables:
```ts
interface GridSlot {
  x: number;
  y: number;
  occupant: CombatantSprite | null;
  terrain: TerrainType;        // 'normal' | 'ice' | 'fire' | 'destroyed'
  trap: TrapData | null;       // { type: 'bear' | 'spring', owner: string, visible: boolean }
  effects: GroundEffect[];     // poison pools, sludge, etc.
}
```

### CombatantSprite.ts

PIXI.Container subclass for individual combatant cards.

**Visual layers** (bottom to top):
1. Card border (Graphics) - amber allies, red enemies
2. Portrait (Sprite) - character image, 104×108px
3. Gradient overlay (Graphics) - text readability
4. Level badge (Graphics + Text) - top left
5. Name plate (Graphics + Text) - bottom
6. HP bar (Graphics) - current/max health
7. Status icons (Graphics) - DEF, OW, and future status effects
8. Damage number (Text) - floats up on hit

**Methods**:
```ts
updateFromState(combatant: Combatant): void
playAttackAnimation(direction: 'up' | 'down'): Promise
playHitAnimation(): Promise
showDamage(amount: number, type?: DamageType): void
playDeathAnimation(): Promise
setHighlight(active: boolean): void  // valid target glow
```

**Interactivity**:
- `eventMode = 'static'` for click detection
- Emit `'selected'` event when clicked

### AnimationManager.ts

Orchestrates all animations via PIXI.Ticker:

```ts
class AnimationManager {
  private app: PIXI.Application;
  private queue: Animation[];
  private active: Map;

  constructor(app: PIXI.Application);

  // Play single animation, returns when complete
  play(id: string, animation: Animation): Promise;
  
  // Play sequence of animations (for combat event chains)
  playSequence(animations: Animation[]): Promise;
  
  // Play multiple animations simultaneously
  playParallel(animations: Animation[]): Promise;
  
  cancel(id: string): void;
  cancelAll(): void;
  destroy(): void;
}

interface Animation {
  update(deltaTime: number): boolean;  // returns true when complete
  onComplete?: () => void;
}
```

**Built-in animations**:
| Animation | Duration | Description |
|-----------|----------|-------------|
| AttackAnimation | 600ms | Wind-up → strike → return |
| HitAnimation | 300ms | Shake + flash white |
| MoveAnimation | 400ms | Slide to new slot |
| DamageNumberAnimation | 800ms | Float up + fade |
| DeathAnimation | 500ms | Fade out + grayscale |
| ScreenShakeAnimation | 200ms | Stage container offset ±6px |

### ParticleSystem.ts

Object-pooled particle emitter for performance:

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
  texture: string;        // 'spark' | 'smoke' | 'blood' | 'ice' | 'fire'
  count: number;
  speed: number;          // pixels per second
  lifetime: number;       // seconds
  gravity?: number;       // pixels per second squared
  fadeOut?: boolean;
  tint?: number;          // color tint for variety
  spread?: number;        // emission angle spread in radians
}
```

**Pool size**: 100 particles pre-allocated (expandable for heavy effects)

### TextureCache.ts

Singleton texture manager:

```ts
class TextureCache {
  static async preload(paths: string[]): Promise;
  static get(path: string): PIXI.Texture;
  static clear(): void;
}
```

**Preload at combat start**:
- All combatant portraits
- Particle textures: `spark.png`, `smoke.png`
- Projectile textures: `arrow.png`, `fireball.png`
- Future: status effect icons, terrain overlays

---

## Animation Specifications

### Attack Animation (Melee)

**Duration**: 600ms total

| Phase | Duration | Motion |
|-------|----------|--------|
| Wind-up | 120ms | Back 12px, rotate 8°, scale 1.08 |
| Strike | 180ms | Forward 80px toward target, rotate -12°, scale 1.15 |
| Return | 300ms | Return to origin, rotation 0, scale 1 |

**Easing**:
- Wind-up: `easeInQuad`
- Strike: `easeOutBack` (overshoot for impact)
- Return: `easeOutQuad`

**Direction**: Allies attack up (-Y), enemies attack down (+Y)

### Hit Animation

**Duration**: 300ms

| Effect | Implementation |
|--------|----------------|
| Shake | Oscillate X ±4px, 3 cycles |
| Flash | Tint white (#FFFFFF) at 0ms, fade to normal by 200ms |

### Damage Number

**Duration**: 800ms

| Property | Start | End |
|----------|-------|-----|
| Y offset | 0 | -40px |
| Alpha | 1 | 0 |
| Scale | 1.2 | 0.8 |

**Style**: Bold, 24px, drop shadow
- Normal damage: red (#FF4444)
- Critical: gold (#FFD700), larger scale
- Healing: green (#44FF44)
- Blocked: gray (#888888)

### Screen Shake (Critical Hit)

**Duration**: 200ms  
**Implementation**: Offset entire stage ±6px random per frame, return to (0,0)  
**Trigger**: `hitQuality === 'critical'`

### Move Animation

**Duration**: 400ms  
**Easing**: `easeInOutQuad`  
**Motion**: Slide from current slot X to target slot X

---

## Particle Specifications

### Hit Sparks

**Trigger**: Successful attack hit

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

### Critical Hit Sparks

**Trigger**: Critical hit

```ts
{
  x: targetSprite.x,
  y: targetSprite.y + 60,
  texture: 'spark',
  count: 16,           // More particles
  speed: 180,          // Faster
  lifetime: 0.5,
  gravity: 150,
  fadeOut: true,
  tint: 0xFFD700       // Gold tint
}
```

### Death Smoke

**Trigger**: HP reaches 0

```ts
{
  x: targetSprite.x,
  y: targetSprite.y + 80,
  texture: 'smoke',
  count: 12,
  speed: 40,
  lifetime: 0.8,
  gravity: -50,        // Rises
  fadeOut: true
}
```

---

## Projectile Specifications

### Arrow (Ranged Physical)

**Size**: 16×16px  
**Trajectory**: Parabolic arc, apex at midpoint  
**Duration**: 400ms  
**Rotation**: Points toward target, adjusts during flight  
**Trail**: Optional spark particles every 50ms

### Fireball (Ranged Magic)

**Size**: 32×32px  
**Trajectory**: Straight line  
**Duration**: 300ms  
**Effect**: Emit 2 spark particles per frame during flight  
**Impact**: Larger particle burst on hit

---

## Post-Combat Narrative Handoff

When combat ends, the bound companion reacts automatically, bridging mechanics back to narrative.

### Combat Summary

```ts
interface CombatSummary {
  outcome: 'victory' | 'defeat' | 'fled';
  roundsElapsed: number;
  enemiesDefeated: string[];      // ["Gnoll Scout", "Gnoll Warrior x2"]
  alliesDamaged: string[];        // ["Kira took 12 damage"]
  notableMoments: string[];       // ["Kira landed the killing blow"]
  lootFound: string[];            // ["Obsidian Dagger", "12 copper"]
}
```

### Inference Timing

```
├── Last enemy dies
│   └── [Victory state - don't trigger yet]
├── Death animation (500ms)
├── Loot popup appears
│   └── [START inference with full context]
├── Player reviews/closes loot
│   └── [Inference completes - cached]
└── Combat modal closes
    └── [Companion reaction appears instantly]
```

---

## Implementation Phases

### Phase 1: Static Rendering (3-4 days)

**Goal**: Pixi canvas shows combatants correctly, state updates work

**Tasks**:
1. `npm install pixi.js` (v8.0.0, ~150KB gzipped)
2. Create `TextureCache.ts`
3. Create `CombatantSprite.ts` (no animations yet)
4. Create `BattlefieldStage.ts` with grid slot structure
5. Create `PixiCombatModal.tsx` with feature flag
6. Wire `updateFromState()` to sync visuals

**Done when**: Feature flag toggles to Pixi view, all combatants render, HP bars update on state change.

### Phase 2: Combat Actions (4-5 days)

**Goal**: Full combat playable with animations

**Tasks**:
1. Create `AnimationManager.ts`
2. Implement AttackAnimation, HitAnimation
3. Implement DamageNumberAnimation
4. Implement MoveAnimation
5. Wire click targeting to existing ActionButtons
6. Add turn indicator (bouncing arrow above current actor)
7. Handle animation sequencing for attack → hit → damage number

**Done when**: Can complete full combat in Pixi version, animations play smoothly at 60fps.

### Phase 3: Polish & Particles (3-4 days)

**Goal**: Combat feels impactful and juicy

**Tasks**:
1. Create particle assets (spark.png, smoke.png)
2. Create `ParticleSystem.ts` with object pooling
3. Add hit sparks on successful attacks
4. Add death smoke on kills
5. Add screen shake on critical hits
6. Add status icons (DEF, OW badges)
7. Performance profiling—target <16ms frame time

**Done when**: Combat has visceral feedback, particles work, no performance issues.

### Phase 4: Ranged & Cleanup (3-4 days)

**Goal**: Ranged attacks work, legacy code removed

**Tasks**:
1. Create projectile assets (arrow.png, fireball.png)
2. Create `ProjectileSprite.ts`
3. Implement arc trajectory for arrows
4. Implement straight trajectory + particle trail for magic
5. Delete `CombatModal.tsx`, `CombatCard.tsx`, `BattlefieldGrid.tsx`
6. Remove CSS combat animations from Tailwind config
7. Remove feature flag—Pixi is now the only renderer

**Done when**: Ranged attacks show projectiles, ~500 lines legacy code deleted.

---

## Future Phases (Post-Launch)

These aren't in scope now, but the architecture supports them:

### Phase 5: Environmental & Status Effects
- Grid slot terrain states (ice, fire, poison)
- Ground effect rendering below combatant layer
- Status effect particles (burning aura, poison drip)
- Bleeding damage tick visuals

### Phase 6: Stealth & Traps
- Hidden combatant rendering (silhouette or invisible)
- Reveal animation on first action
- Trap placement UI during stealth
- Trap trigger animation when enemy steps on grid slot

### Phase 7: Advanced Combat
- Backstab animation for side-switching rogues
- Destructible grid point visuals
- Combo indicators
- Slash/strike trail effects

---

## Technical Requirements

### Dependencies

```json
{
  "pixi.js": "^8.0.0"
}
```

Bundle impact: ~150KB gzipped

### Easing Functions

Include in `utils/easing.ts`:

```ts
export const easeInQuad = (t: number) => t * t;
export const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
export const easeInOutQuad = (t: number) => 
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
```

### Asset Checklist

```
frontend/public/assets/
  particles/
    spark.png      # 32×32, white circle, soft edges
    smoke.png      # 32×32, gray cloud, semi-transparent
  projectiles/
    arrow.png      # 16×16, arrow pointing right
    fireball.png   # 32×32, orange/red fireball
```

Assets can be placeholders initially—polish later.

### Performance Targets

- Frame time: <16ms (60fps)
- No memory growth over 5-minute combat session
- All ticker callbacks removed on unmount
- All event listeners removed on unmount
- `TextureCache.clear()` called on combat end

### Cleanup Checklist (Per Phase)

- [ ] No console errors or warnings
- [ ] Frame time <16ms (Chrome DevTools Performance)
- [ ] No memory leaks (Chrome DevTools Memory)
- [ ] Proper cleanup on unmount
- [ ] Feature flag works both directions

---

## Success Criteria

The implementation is complete when:

1. All combat actions work (attack, defend, move, swap, overwatch, flee)
2. Animations play at consistent 60fps
3. Particles spawn/despawn without memory leaks
4. Ranged attacks show projectile travel
5. Old CSS combat code deleted (~500 lines removed)
6. Architecture supports future phases without major refactoring
7. It *feels good* to play