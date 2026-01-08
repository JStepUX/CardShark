# Pixi.js Integration Plan for CardShark Combat System

**Date**: 2026-01-08 (Revised)
**Branch**: `claude/review-combat-system-o2oR8`
**Status**: Planning Phase

## Executive Summary

This plan outlines the integration of pixi.js into CardShark's combat system to enable advanced card game mechanics (Hearthstone/Gwent-style) including card movement, sprite-based attacks, projectiles, and particle effects.

**Key Finding**: Combat is only **10-15% implemented**, making this the **perfect time to build fresh** with pixi.js rather than migrating existing code.

**Strategy**: Build new `PixiCombatModal` in parallel with existing CSS implementation, reach feature parity, then delete old code.

## Table of Contents

1. [Current System Analysis](#current-system-analysis)
2. [Why Build Fresh Instead of Migrate](#why-build-fresh-instead-of-migrate)
3. [Parallel Development Strategy](#parallel-development-strategy)
4. [Technical Decisions](#technical-decisions)
5. [Asset Pipeline](#asset-pipeline)
6. [Build System Changes](#build-system-changes)
7. [Implementation Phases](#implementation-phases)
8. [Risk Assessment](#risk-assessment)
9. [Fallback Strategy](#fallback-strategy)

---

## Current System Analysis

### What's Actually Implemented (Minimal)

Looking at the current combat system:

**✅ Core Engine (~80% of value, 100% reusable)**:
- `combatEngine.ts` - Pure reducer pattern, UI-agnostic
- Combat logic: attack, defend, move, swap, flee, overwatch
- Initiative system, turn management
- Event emission for animations
- **No changes needed** - works with any rendering layer

**✅ Basic CSS UI (~20% complete)**:
- `CombatModal.tsx` - React container (~380 lines)
- `CombatCard.tsx` - Basic card display with HP bars (~220 lines)
- `BattlefieldGrid.tsx` - 2×5 grid layout
- `ActionButtons.tsx`, `CombatLog.tsx`, `PlayerHUD.tsx` - UI chrome
- 2 CSS animations: `melee-attack-up`, `melee-attack-down`

**❌ Not Implemented**:
- Ranged attack visuals (only `weaponType: 'ranged'` field exists)
- Particle effects
- Advanced animations (projectiles, explosions, screen shake)
- Drag-and-drop movement
- Polish (smooth transitions, juice)

**Assessment**: Combat is at **10-15% of a finished system**. Perfect stage to switch rendering approaches.

### Strengths (Advantages for Pixi.js)

1. **Clean Architecture**: Combat engine is pure and stateless
   - Uses reducer pattern: `combatReducer(state, action) => { state, events }`
   - No React dependencies in engine code
   - Can be rendered by CSS, Pixi.js, or even CLI

2. **Event-Based System**: Combat emits events (`CombatEvent[]`)
   - `attack_resolved`, `character_defeated`, `combat_victory`, etc.
   - Easy to hook particle effects and animations to events

3. **Grid-Based Positioning**: Battlefield is 2×5 slots
   - `battlefield.enemySlots[0-4]`, `battlefield.allySlots[0-4]`
   - Easy to map to pixi.js coordinates

4. **Early Stage**: Minimal code to replace (~500 lines of React/CSS)

---

## Why Build Fresh Instead of Migrate

### The Migration Tax

Migrating existing UI code to pixi.js means:
- Converting React components to pixi.js sprites (complex)
- Maintaining two rendering paths during transition (bug-prone)
- Translating CSS animations to pixi.js (tedious)
- Testing hybrid state synchronization (fragile)

**Cost**: 2-3 weeks of careful, incremental migration work

### The Fresh Build Advantage

Building fresh with pixi.js means:
- Design for pixi.js patterns from day 1 (cleaner)
- No CSS baggage or backwards compatibility
- Old version stays functional as reference (safer)
- Rethink UX with canvas capabilities in mind (better)
- Delete old code when done (satisfying)

**Cost**: 2-3 weeks to reach feature parity, then delete ~500 lines

### Decision: Build Fresh ✅

Since combat is only 10-15% complete:
- **Lower Risk**: Old combat keeps working
- **Faster**: No complex migration logic
- **Better**: Design for pixi.js capabilities from start
- **Cleaner**: No hybrid rendering complexity

---

## Parallel Development Strategy

### Architecture

```
Frontend
├── components/combat/
│   ├── CombatModal.tsx              ← OLD (CSS-based, keep as reference/fallback)
│   ├── CombatCard.tsx               ← OLD
│   ├── BattlefieldGrid.tsx          ← OLD
│   └── pixi/
│       ├── PixiCombatModal.tsx      ← NEW (pixi.js-based)
│       ├── PixiBattlefield.ts       ← NEW (vanilla pixi.js class)
│       ├── CombatantSprite.ts       ← NEW (vanilla pixi.js class)
│       ├── ParticleEmitter.ts       ← NEW
│       └── animations/
│           ├── attackAnimation.ts   ← NEW
│           └── particleEffects.ts   ← NEW
└── services/combat/
    ├── combatEngine.ts              ← UNCHANGED (reuse as-is)
    ├── enemyAI.ts                   ← UNCHANGED
    └── combatSimulator.ts           ← UNCHANGED
```

### Feature Flag

```tsx
// WorldPlayView.tsx
const USE_PIXI_COMBAT = true; // Toggle for testing

{combatActive && (
  USE_PIXI_COMBAT ? (
    <PixiCombatModal
      initData={combatInitData}
      onCombatEnd={handleCombatEnd}
      onPixiError={() => setUsePixiCombat(false)} // Fallback on error
    />
  ) : (
    <CombatModal
      initData={combatInitData}
      onCombatEnd={handleCombatEnd}
    />
  )
)}
```

### Development Flow

**Phase 1-3**: Build `PixiCombatModal` to feature parity
- All actions work (attack, move, defend, overwatch, flee)
- Better visuals than CSS version from day 1
- Test both versions side-by-side

**Phase 4**: Delete CSS combat
- Remove `CombatModal.tsx`, `CombatCard.tsx`, `BattlefieldGrid.tsx`
- Remove Tailwind combat animations
- ~500 lines deleted, codebase simplified

---

## Technical Decisions

### 1. React-Pixi Integration Pattern

**Decision**: Start with `@pixi/react`, evaluate after Phase 1

**Phase 1 Evaluation Checkpoint**:
After Phase 1, explicitly answer:
- Is @pixi/react helping or fighting us?
- Are we hitting re-render issues with useCallback patterns?
- Is animation timing precise enough?

**If @pixi/react causes friction**, switch to vanilla pixi.js with refs:

```tsx
// Vanilla approach (fallback if @pixi/react fights us)
function PixiBattlefield({ combatState }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);

  useEffect(() => {
    // Initialize once
    const app = new PIXI.Application();
    app.init({ width: 800, height: 600, backgroundColor: 0x1a1a1a })
      .then(() => {
        containerRef.current?.appendChild(app.canvas);
        appRef.current = app;
      });

    return () => {
      app.destroy(true);
    };
  }, []);

  // Update on state changes
  useEffect(() => {
    if (appRef.current) {
      updateBattlefield(appRef.current.stage, combatState);
    }
  }, [combatState]);

  return <div ref={containerRef} />;
}
```

**@pixi/react approach (try first)**:
```tsx
import { Stage, Container } from '@pixi/react';

function PixiBattlefield({ combatState }) {
  return (
    <Stage width={800} height={600} options={{ backgroundColor: 0x1a1a1a }}>
      <Container>
        {Object.values(combatState.combatants).map(combatant => (
          <CombatantSprite key={combatant.id} combatant={combatant} />
        ))}
      </Container>
    </Stage>
  );
}
```

**Pros of @pixi/react**:
- Declarative API (React-like syntax)
- Automatic lifecycle management
- Familiar patterns for React developers

**Cons of @pixi/react**:
- Additional abstraction layer to debug
- useCallback patterns may cause re-render issues
- Less direct control for precise animation timing

---

### 2. Animation System

**Decision**: Start with **Pixi.js ticker only**, add GSAP later if needed

**Why**:
- Pixi.js has built-in animation via `ticker` (60fps loop)
- Simple lerp + easing functions handle most cases
- One less dependency to learn (~150KB saved)
- Prove we need GSAP before adding it

**Pixi.js Animation Pattern**:
```ts
// Use a class-based approach for complex animations
class AttackAnimation {
  private sprite: PIXI.Container;
  private startY: number;
  private targetY: number;
  private phase: 'windup' | 'strike' | 'return' = 'windup';
  private progress = 0;
  private onComplete: () => void;

  constructor(sprite: PIXI.Container, direction: 'up' | 'down', onComplete: () => void) {
    this.sprite = sprite;
    this.startY = sprite.y;
    this.targetY = sprite.y + (direction === 'up' ? -80 : 80);
    this.onComplete = onComplete;
  }

  update(delta: number): boolean {
    const speed = delta / 60;

    switch (this.phase) {
      case 'windup':
        this.progress += speed * 5;
        if (this.progress >= 1) {
          this.progress = 0;
          this.phase = 'strike';
        }
        // Wind-up motion
        break;

      case 'strike':
        this.progress += speed * 3.33;
        if (this.progress >= 1) {
          this.progress = 0;
          this.phase = 'return';
        }
        // Strike motion with easing
        this.sprite.y = this.startY + (this.targetY - this.startY) * easeOutBack(this.progress);
        break;

      case 'return':
        this.progress += speed * 3.33;
        if (this.progress >= 1) {
          this.sprite.y = this.startY;
          this.onComplete();
          return true; // Animation complete
        }
        this.sprite.y = this.targetY + (this.startY - this.targetY) * easeInQuad(this.progress);
        break;
    }

    return false; // Animation still running
  }
}

// Easing functions
function easeInQuad(t: number): number {
  return t * t;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
```

**When to Add GSAP**:
- Complex timeline sequences become hard to maintain
- Need advanced easing (elastic, bounce with overshoot)
- Animation code exceeds ~300 lines

---

### 3. State Management

**Decision**: Keep existing reducer pattern, React state as single source of truth

**Architecture**:
```
User Action
  ↓
combatReducer(state, action) → { newState, events }
  ↓
React setCombatState(newState)
  ↓
useEffect detects state change
  ↓
Update pixi.js stage imperatively
  ↓
Events trigger animations (ticker-based)
```

**Key Principle**: Pixi.js stage is a **view layer** that reacts to React state. Never store combat state in pixi.js objects.

---

### 4. Memory Management

**Texture Caching**:
```ts
// Load textures once, reuse across combatants
class TextureCache {
  private static cache = new Map<string, PIXI.Texture>();

  static get(path: string): PIXI.Texture {
    if (!this.cache.has(path)) {
      this.cache.set(path, PIXI.Texture.from(path));
    }
    return this.cache.get(path)!;
  }

  static clear(): void {
    this.cache.forEach(texture => texture.destroy());
    this.cache.clear();
  }
}
```

**Object Pooling for Particles**:
```ts
class ParticlePool {
  private pool: PIXI.Sprite[] = [];
  private texture: PIXI.Texture;

  constructor(texture: PIXI.Texture, initialSize = 50) {
    this.texture = texture;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createSprite());
    }
  }

  acquire(): PIXI.Sprite {
    return this.pool.pop() || this.createSprite();
  }

  release(sprite: PIXI.Sprite): void {
    sprite.visible = false;
    sprite.alpha = 1;
    sprite.scale.set(1);
    this.pool.push(sprite);
  }

  private createSprite(): PIXI.Sprite {
    const sprite = new PIXI.Sprite(this.texture);
    sprite.anchor.set(0.5);
    sprite.visible = false;
    return sprite;
  }
}
```

**Cleanup Checklist**:
- [ ] Remove ticker callbacks on unmount
- [ ] Destroy textures when combat ends
- [ ] Clear particle pools
- [ ] Remove event listeners

---

## Asset Pipeline

### Asset Types Needed

1. **Card Sprites**: 112×160px PNG (reuse existing character images)
2. **Particle Textures**: 32×32px PNG (sparks, smoke, blood)
3. **Projectile Sprites**: 16×16px or 32×32px (arrows, fireballs)

### Loading Strategy

**Use Pixi.js Assets API (v8)**:
```ts
import { Assets } from 'pixi.js';

async function loadCombatAssets(combatState: CombatState): Promise<void> {
  const manifest = {
    bundles: [
      {
        name: 'combat',
        assets: [
          // Character images
          ...Object.values(combatState.combatants)
            .filter(c => c.imagePath)
            .map(c => ({ alias: `char-${c.id}`, src: c.imagePath })),
          // Particle textures
          { alias: 'spark', src: '/assets/particles/spark.png' },
          { alias: 'smoke', src: '/assets/particles/smoke.png' },
        ]
      }
    ]
  };

  await Assets.init({ manifest });
  await Assets.loadBundle('combat');
}
```

### Asset Structure

```
frontend/
  public/
    assets/
      particles/
        spark.png          # 32×32 white spark
        smoke.png          # 32×32 smoke puff
      projectiles/
        arrow.png          # 16×16 arrow sprite
        fireball.png       # 32×32 fireball sprite
```

### PyInstaller Integration

**No changes needed** - Vite bundles `public/assets/` into `dist/assets/` automatically, and `build.py` already handles `frontend/dist/*`.

---

## Build System Changes

### 1. Package.json Updates

**New Dependencies**:
```json
{
  "dependencies": {
    "pixi.js": "^8.0.0",
    "@pixi/react": "^7.1.2"
  }
}
```

**Size Impact**:
- `pixi.js`: ~150KB gzipped
- `@pixi/react`: ~15KB gzipped
- **Total**: ~165KB gzipped (acceptable for desktop app)

**GSAP deferred** - add later only if needed (~50KB gzipped)

---

### 2. Vite Configuration

**No changes needed** - current config already supports static asset bundling, TypeScript, and tree-shaking.

---

### 3. PyInstaller Spec File

**No changes needed** - frontend assets already bundled correctly via `build.py`.

---

## Implementation Phases

### Phase 1: Foundation (3-4 days)

**Goal**: Get pixi.js rendering basic battlefield with static cards

**Tasks**:
1. Install dependencies (`pixi.js`, `@pixi/react`)
2. Create `PixiCombatModal.tsx` (React wrapper with error boundary)
3. Create `PixiBattlefield.ts` (pixi.js stage with 2×5 grid)
4. Create `CombatantSprite.ts` (render card with portrait + HP bar)
5. Add feature flag to switch between CSS and Pixi versions
6. Wire up combat state → pixi.js rendering (no animations yet)
7. Add loading state while assets load

**Phase 1 Evaluation Checkpoint**:
- [ ] Is @pixi/react helping or causing friction?
- [ ] Any re-render issues with state updates?
- [ ] Decision: Continue with @pixi/react or switch to vanilla?

**Deliverable**: Static pixi.js battlefield that shows all combatants

**Validation**:
- [ ] Pixi.js canvas renders without errors
- [ ] All combatants appear in correct grid slots
- [ ] HP bars update when state changes
- [ ] Can switch between CSS and Pixi versions with feature flag
- [ ] No performance degradation (<16ms frame time)

---

### Phase 2: Core Actions + Simple Animations (4-5 days)

**Goal**: Implement all combat actions with basic animations

**Tasks**:
1. Implement action buttons (Attack, Defend, Move, Overwatch, Flee)
2. Wire up actions → combat reducer → pixi.js updates
3. Add attack animation (ticker-based: wind-up → strike → return)
4. Add hit reaction animation (shake + brightness flash)
5. Add damage numbers (pixi.js Text with float-up animation)
6. Implement move action (slide to new slot)
7. Add turn indicator (arrow/glow on current actor)

**Deliverable**: Full combat functionality with basic animations

**Validation**:
- [ ] All actions work: attack, defend, move, swap, overwatch, flee
- [ ] Animations play smoothly (60fps)
- [ ] Damage numbers are readable
- [ ] Turn order respects initiative
- [ ] Enemy AI works correctly

---

### Phase 3: Polish + Particle Effects (3-4 days)

**Goal**: Add visual flair and juice

**Tasks**:
1. Create particle texture assets (spark, smoke)
2. Implement `ParticleEmitter` class with object pooling
3. Add hit sparks on successful attacks
4. Add screen shake on critical hits
5. Add status effect indicators (defending, overwatch icons)
6. Add combat log integration
7. Add combat end screen (victory/defeat)
8. Profile and optimize if needed

**Deliverable**: Polished combat that feels impactful

**Validation**:
- [ ] Hit effects appear on attacks
- [ ] Particles despawn cleanly (no memory leaks)
- [ ] Screen shake is noticeable but not nauseating
- [ ] Frame rate stays above 60fps with 10 combatants + particles
- [ ] Combat feels "juicy" and satisfying

---

### Phase 4: Ranged Attacks + Cleanup (3-4 days)

**Goal**: Add projectile sprites and delete old CSS combat

**Tasks**:
1. Create projectile sprite assets (arrow, fireball)
2. Implement `ProjectileSprite` class
3. Add trajectory calculation (arc for arrows, straight for bolts)
4. Animate projectiles (ease-out on launch, ease-in on impact)
5. Trigger hit particles when projectile reaches target
6. **Delete old CSS combat code**:
   - Remove `CombatModal.tsx`, `CombatCard.tsx`, `BattlefieldGrid.tsx`
   - Remove Tailwind combat animations from `tailwind.config.js`
   - Remove feature flag, make pixi.js the only option
7. Update documentation

**Deliverable**: Ranged attacks work, old code deleted

**Files Deleted** (~500 lines):
- `frontend/src/components/combat/CombatModal.tsx`
- `frontend/src/components/combat/CombatCard.tsx`
- `frontend/src/components/combat/BattlefieldGrid.tsx`
- Tailwind animation keyframes

**Validation**:
- [ ] Projectile travels from attacker to target
- [ ] Trajectory looks natural
- [ ] Hit effect triggers on impact
- [ ] Old CSS combat removed from codebase
- [ ] No references to old components remain

---

### Phase 5: Advanced Features (FUTURE)

**Optional enhancements** - defer until after Phase 4:

1. **Drag-and-Drop Movement** (5-7 days)
2. **GSAP Integration** (1-2 days) - only if animation code becomes unwieldy
3. **Sound Effects** (2-3 days)
4. **Advanced Particle Effects** (3-4 days)

---

## Risk Assessment

### High Risk

1. **@pixi/react Abstraction Issues**
   - **Risk**: Declarative wrapper fights imperative animation needs
   - **Mitigation**: Phase 1 evaluation checkpoint; vanilla pixi.js fallback ready
   - **Decision Point**: End of Phase 1

2. **Performance on Low-End Devices**
   - **Risk**: Pixi.js may lag on old PCs
   - **Mitigation**:
     - Profile with Chrome DevTools Performance tab
     - Object pooling for particles
     - Reduce particle density setting
     - Target 60fps minimum

### Medium Risk

3. **State Synchronization Bugs**
   - **Risk**: React state and Pixi.js stage get out of sync
   - **Mitigation**:
     - Single source of truth (React state)
     - Pixi.js is view-only layer
     - Debug overlay showing current state

4. **Asset Loading Failures**
   - **Risk**: Missing textures or failed loads
   - **Mitigation**:
     - Loading screen with progress
     - Fallback to colored rectangles
     - Error boundary with CSS combat fallback

5. **Timeline Slippage**
   - **Risk**: First pixi.js integration has unexpected friction
   - **Mitigation**: Budget 15-20 days total, not 9-13

### Low Risk

6. **Build System Issues**
   - **Risk**: PyInstaller doesn't bundle assets correctly
   - **Mitigation**: Vite handles everything, no PyInstaller changes needed

---

## Fallback Strategy

### Error Boundary

```tsx
// PixiCombatModal.tsx
function PixiCombatModal({ initData, onCombatEnd, onPixiError }: Props) {
  const [error, setError] = useState<Error | null>(null);

  if (error) {
    // Report error and fall back to CSS combat
    console.error('Pixi.js combat failed:', error);
    onPixiError?.();
    return null; // Parent will render CSS fallback
  }

  return (
    <ErrorBoundary onError={setError}>
      <PixiCombatModalInner initData={initData} onCombatEnd={onCombatEnd} />
    </ErrorBoundary>
  );
}
```

### Graceful Degradation

1. **Pixi.js fails to init** → Fall back to CSS combat
2. **Texture fails to load** → Use colored rectangle placeholder
3. **Animation errors** → Skip animation, update state immediately
4. **Performance issues** → Reduce particle count, disable screen shake

### Keep CSS Combat Until Phase 4

Do NOT delete CSS combat until pixi.js version is proven stable:
- All actions working
- No memory leaks
- No performance issues
- Tested on multiple machines

---

## Success Criteria

### Phase 1 (Foundation)
- [ ] Pixi.js canvas renders without errors
- [ ] All combatants appear in correct slots
- [ ] HP bars update when combat state changes
- [ ] Can toggle between CSS and Pixi versions
- [ ] No performance regression (<16ms frame time)
- [ ] **Decision made**: @pixi/react vs vanilla pixi.js

### Phase 2 (Core Actions)
- [ ] All combat actions work identically to CSS version
- [ ] Attack animations are smooth and impactful
- [ ] Damage numbers are readable and satisfying
- [ ] Turn order and initiative work correctly
- [ ] Enemy AI functions properly

### Phase 3 (Polish)
- [ ] Particle effects add visual flair without lag
- [ ] Combat feels "juicy" and responsive
- [ ] Frame rate stays above 60fps with full effects
- [ ] Memory usage is stable (no leaks)

### Phase 4 (Ranged + Cleanup)
- [ ] Ranged attacks show projectile sprites
- [ ] Projectile trajectories look natural
- [ ] Old CSS combat code successfully deleted
- [ ] Codebase is simpler and easier to maintain

---

## Timeline Estimate

| Phase | Duration | Description |
|-------|----------|-------------|
| Phase 1: Foundation | 3-4 days | Basic pixi.js rendering + evaluation |
| Phase 2: Core Actions | 4-5 days | All combat actions + animations |
| Phase 3: Polish | 3-4 days | Particles, juice, effects |
| Phase 4: Ranged + Cleanup | 3-4 days | Projectiles, delete old code |

**Total**: 13-17 days for full pixi.js combat with feature parity and cleanup

**Buffer**: Add 3-5 days for unexpected issues (first pixi.js integration friction)

**Realistic Estimate**: 15-20 days

---

## Appendix: Key Code Patterns

### Pattern 1: Imperative Pixi.js Update

```ts
// Preferred pattern for state → pixi.js sync
function updateBattlefield(stage: PIXI.Container, state: CombatState): void {
  // Update each combatant sprite
  for (const combatant of Object.values(state.combatants)) {
    const sprite = stage.getChildByName(combatant.id) as CombatantSprite;
    if (sprite) {
      sprite.updateFromState(combatant);
    }
  }
}

// CombatantSprite class
class CombatantSprite extends PIXI.Container {
  private hpBar: PIXI.Graphics;
  private portrait: PIXI.Sprite;

  updateFromState(combatant: Combatant): void {
    // Update HP bar
    const hpPercent = combatant.currentHp / combatant.maxHp;
    this.hpBar.clear();
    this.hpBar.rect(0, 0, 96 * hpPercent, 8).fill(0xff0000);

    // Update position if moved
    const targetX = slotToX(combatant.slot);
    if (this.x !== targetX) {
      this.animateMoveTo(targetX);
    }
  }
}
```

### Pattern 2: Animation Manager

```ts
// Centralized animation management
class AnimationManager {
  private app: PIXI.Application;
  private activeAnimations: Set<Animation> = new Set();

  constructor(app: PIXI.Application) {
    this.app = app;
    this.app.ticker.add(this.update, this);
  }

  play(animation: Animation): Promise<void> {
    return new Promise(resolve => {
      animation.onComplete = () => {
        this.activeAnimations.delete(animation);
        resolve();
      };
      this.activeAnimations.add(animation);
    });
  }

  private update(ticker: PIXI.Ticker): void {
    for (const animation of this.activeAnimations) {
      if (animation.update(ticker.deltaTime)) {
        this.activeAnimations.delete(animation);
        animation.onComplete?.();
      }
    }
  }

  destroy(): void {
    this.app.ticker.remove(this.update, this);
    this.activeAnimations.clear();
  }
}
```

### Pattern 3: React Integration with Refs

```tsx
// Clean React/Pixi.js integration
function PixiBattlefield({ combatState, onAction }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiRef = useRef<{
    app: PIXI.Application;
    battlefield: BattlefieldStage;
    animations: AnimationManager;
  } | null>(null);

  // Initialize once
  useEffect(() => {
    const app = new PIXI.Application();

    app.init({
      width: 800,
      height: 600,
      backgroundColor: 0x1a1a1a
    }).then(() => {
      if (!containerRef.current) return;

      containerRef.current.appendChild(app.canvas);

      const battlefield = new BattlefieldStage(app);
      const animations = new AnimationManager(app);

      pixiRef.current = { app, battlefield, animations };

      // Initial render
      battlefield.initialize(combatState);
    });

    return () => {
      pixiRef.current?.animations.destroy();
      app.destroy(true);
    };
  }, []);

  // Update on state changes
  useEffect(() => {
    if (pixiRef.current) {
      pixiRef.current.battlefield.updateFromState(combatState);
    }
  }, [combatState]);

  return <div ref={containerRef} className="w-[800px] h-[600px]" />;
}
```

---

**Document Version**: 3.0 (Revised with evaluation checkpoints and fallback strategy)
**Last Updated**: 2026-01-08
**Authors**: Claude (AI Assistant)
