# Pixi.js Integration Plan for CardShark Combat System

**Date**: 2026-01-06
**Branch**: `claude/plan-pixi-integration-gfcMf`
**Status**: Planning Phase

## Executive Summary

This plan outlines the integration of pixi.js into CardShark's combat system to enable advanced card game mechanics (Hearthstone/Gwent-style) including card movement, sprite-based attacks, projectiles, and particle effects.

**Key Finding**: The current combat system architecture is **well-suited for pixi.js integration** due to its pure reducer-based engine that separates game logic from rendering.

## Table of Contents

1. [Current System Analysis](#current-system-analysis)
2. [Integration Approaches](#integration-approaches)
3. [Recommended Approach](#recommended-approach)
4. [Technical Decisions](#technical-decisions)
5. [Asset Pipeline](#asset-pipeline)
6. [Build System Changes](#build-system-changes)
7. [Migration Strategy](#migration-strategy)
8. [Risk Assessment](#risk-assessment)
9. [Implementation Phases](#implementation-phases)

---

## Current System Analysis

### Strengths (Advantages for Pixi.js Integration)

1. **Clean Architecture**: Combat engine (`combatEngine.ts`) is pure, stateless, and UI-agnostic
   - Uses reducer pattern: `combatReducer(state, action) => { state, events }`
   - No React dependencies in engine code
   - Perfect for integration with any rendering layer (React, Pixi.js, or both)

2. **Event-Based System**: Combat already emits events (`CombatEvent[]`)
   - `attack_resolved`, `character_defeated`, `combat_victory`, etc.
   - Easy to hook particle effects and animations to these events

3. **CSS Animation Foundation**: Existing melee animations use Tailwind
   - `animate-melee-attack-up`, `animate-melee-attack-down`, `take-hit`
   - 600ms duration, GPU-accelerated transforms
   - **Migration path**: Keep CSS for UI chrome, add pixi.js for card/battlefield rendering

4. **Grid-Based Positioning**: Battlefield is 2×5 slots
   - `battlefield.enemySlots[0-4]`, `battlefield.allySlots[0-4]`
   - Easy to map to pixi.js coordinates

### Current Limitations

1. **CSS Animations**: Cannot do complex sprite trails, particle effects, or physics
2. **No Drag-and-Drop**: Card movement is click-based (select action → click slot)
3. **Static Card Rendering**: PNG images with CSS overlays (HP bars, damage numbers)
4. **Ranged Attacks Not Implemented**: Architecture exists (`weaponType: 'ranged'`) but no visuals

---

## Integration Approaches

### Option A: Hybrid Approach (React UI + Pixi.js Battlefield) ⭐ RECOMMENDED

**Architecture**:
```
┌─────────────────────────────────────────┐
│ CombatModal (React)                     │
│  ├─ ActionButtons (React/Tailwind)      │
│  ├─ PlayerHUD (React/Tailwind)          │
│  ├─ CombatLog (React/Tailwind)          │
│  ├─ InitiativeTracker (React/Tailwind)  │
│  └─ PixiBattlefield (Pixi.js Canvas)    │  ← NEW
│      ├─ Card Sprites                    │
│      ├─ Particle Effects                │
│      ├─ Projectile Trails               │
│      └─ Battlefield Grid                │
└─────────────────────────────────────────┘
```

**Pros**:
- Minimal disruption to existing UI
- Leverage React for complex UI (buttons, modals, logs)
- Leverage Pixi.js for visual effects and animations
- Incremental migration path
- Keep Tailwind styling for UI chrome

**Cons**:
- Two rendering systems to coordinate
- Need to sync React state → Pixi.js stage
- Potential performance overhead (mitigated by React memoization)

**Best For**: CardShark's use case (complex UI + visual combat)

---

### Option B: Full Pixi.js Rewrite

**Architecture**:
```
┌─────────────────────────────────────────┐
│ CombatModal (React - container only)    │
│  └─ PixiCombatView (Pixi.js Canvas)     │
│      ├─ Card Sprites                    │
│      ├─ Action Buttons (Pixi.js UI)     │
│      ├─ HUD (Pixi.js Text/Sprites)      │
│      ├─ Combat Log (Pixi.js Text)       │
│      └─ Particle Effects                │
└─────────────────────────────────────────┘
```

**Pros**:
- Unified rendering system
- Better performance (single canvas, no DOM overhead)
- More game-like feel

**Cons**:
- **Large refactor**: Rewrite all UI components in Pixi.js
- Lose Tailwind styling benefits
- Lose React ecosystem (accessibility, forms, routing)
- Higher complexity for UI interactions (buttons, tooltips, modals)
- **Not recommended for CardShark**: The app is primarily a chat/card management tool with combat as one feature

---

### Option C: Incremental (CSS → CSS + Particles → Pixi.js)

**Phase 1**: Add pixi.js for particle effects only
```tsx
<BattlefieldGrid> {/* React/CSS */}
  <PixiParticleLayer /> {/* Pixi.js overlay for explosions, trails */}
</BattlefieldGrid>
```

**Phase 2**: Migrate card rendering to Pixi.js sprites

**Phase 3**: Add drag-and-drop physics

**Pros**:
- Lowest risk, gradual rollout
- Can ship incremental improvements
- Validate approach before full commitment

**Cons**:
- Longer timeline
- Temporary complexity managing both systems
- Need to maintain CSS animations during transition

---

## Recommended Approach

### ✅ Hybrid Approach (Option A) with Incremental Rollout (Option C strategy)

**Rationale**:
1. CardShark is a **multi-purpose app** (chat, character management, world building) where combat is one feature
2. React/Tailwind excels at UI chrome (modals, forms, settings)
3. Pixi.js excels at visual effects and animations
4. Incremental rollout reduces risk and allows for course correction

**Migration Path**:
1. **Phase 1**: Pixi.js particle effects overlay (explosions, hit sparks)
2. **Phase 2**: Pixi.js card sprites (replace CombatCard React component)
3. **Phase 3**: Drag-and-drop movement with physics
4. **Phase 4**: Ranged attack projectiles with sprite trails

---

## Technical Decisions

### 1. React-Pixi Integration Pattern

**Decision**: Use `@pixi/react` wrapper library

**Why**:
```tsx
// With @pixi/react
import { Stage, Sprite, Container } from '@pixi/react';

function PixiBattlefield({ combatState }) {
  return (
    <Stage width={800} height={600}>
      <Container>
        {Object.values(combatState.combatants).map(combatant => (
          <CombatantSprite key={combatant.id} combatant={combatant} />
        ))}
      </Container>
    </Stage>
  );
}
```

**Pros**:
- Declarative API (React-like syntax)
- Automatic lifecycle management
- State synchronization handled by library
- TypeScript support

**Cons**:
- Additional dependency (~50KB)
- Less control than manual Pixi.js
- Potential bugs in wrapper library

**Alternative**: Manual Pixi.js with `useEffect` hooks
```tsx
function PixiBattlefield({ combatState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<PIXI.Application>();

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize Pixi.js application
    const app = new PIXI.Application({
      view: canvasRef.current,
      width: 800,
      height: 600,
    });
    appRef.current = app;

    return () => app.destroy();
  }, []);

  useEffect(() => {
    // Update stage when combatState changes
    if (!appRef.current) return;
    updatePixiStage(appRef.current.stage, combatState);
  }, [combatState]);

  return <canvas ref={canvasRef} />;
}
```

**Recommendation**: Start with `@pixi/react` for faster iteration, migrate to manual if needed

---

### 2. Animation System

**Decision**: Use **GSAP** (GreenSock Animation Platform) for tweening

**Why**:
- Industry-standard animation library (used by Hearthstone)
- Powerful easing functions and timelines
- Integrates well with Pixi.js
- Better performance than CSS for complex sequences

**Example**:
```tsx
import gsap from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';

// Register Pixi.js plugin
gsap.registerPlugin(PixiPlugin);
PixiPlugin.registerPIXI(PIXI);

// Animate card attack
gsap.timeline()
  .to(cardSprite, {
    pixi: { y: "-=100", rotation: -15, scaleX: 1.2, scaleY: 1.2 },
    duration: 0.3,
    ease: "back.out(1.7)"
  })
  .to(cardSprite, {
    pixi: { y: "+=100", rotation: 0, scaleX: 1, scaleY: 1 },
    duration: 0.3,
    ease: "power2.in"
  });
```

**Alternatives**:
- **Pixi.js Tweenjs**: Lightweight, but less powerful
- **CSS animations**: Can't animate Pixi.js sprites
- **Manual lerp**: Too low-level, reinventing the wheel

---

### 3. State Management

**Decision**: Keep existing reducer pattern, sync to Pixi.js stage

**Architecture**:
```
User Action
  ↓
combatReducer(state, action)
  ↓
{ newState, events }
  ↓
React setCombatState(newState)
  ↓
Pixi.js useEffect hook detects state change
  ↓
updatePixiStage(stage, newState)
  ↓
GSAP animations triggered by events
```

**State Flow**:
1. **Single source of truth**: `CombatState` in React
2. **Pixi.js stage is view layer**: Reacts to state changes
3. **Events trigger animations**: `CombatEvent[]` → GSAP timelines

**Example**:
```tsx
function PixiBattlefield({ combatState, events }) {
  const stageRef = useRef<PIXI.Container>();

  // Update stage when state changes
  useEffect(() => {
    if (!stageRef.current) return;
    syncStageToCombatState(stageRef.current, combatState);
  }, [combatState]);

  // Trigger animations when events fire
  useEffect(() => {
    events.forEach(event => {
      if (event.type === 'attack_resolved') {
        playAttackAnimation(event.actorId, event.targetId);
      }
    });
  }, [events]);

  // ...
}
```

---

### 4. Card Rendering

**Decision**: Hybrid approach - Pixi.js sprites for cards, HTML overlay for complex UI

**Card Layers**:
1. **Pixi.js Sprite**: Character portrait (base layer)
2. **Pixi.js Graphics**: HP bar, stat badges
3. **HTML Overlay** (optional): Complex tooltips, status effects with icons

**Why hybrid**:
- Pixi.js: Fast rendering, easy transforms (position, rotation, scale)
- HTML: Better typography, accessibility, rich content

**Example**:
```tsx
function CombatantSprite({ combatant }) {
  return (
    <Container x={slotToX(combatant.slotPosition)} y={slotToY(...)}>
      {/* Portrait */}
      <Sprite
        texture={PIXI.Texture.from(combatant.imagePath)}
        width={112}
        height={160}
      />

      {/* HP Bar (Pixi.js Graphics) */}
      <Graphics
        draw={g => {
          g.clear();
          g.beginFill(0x333333);
          g.drawRect(0, 140, 112, 8);
          g.beginFill(0xff0000);
          const hpWidth = (combatant.currentHp / combatant.maxHp) * 112;
          g.drawRect(0, 140, hpWidth, 8);
          g.endFill();
        }}
      />
    </Container>
  );
}
```

---

## Asset Pipeline

### Asset Types Needed

1. **Card Sprites**: 112×160px PNG (same as current)
2. **Particle Textures**: 32×32px PNG (sparks, smoke, blood)
3. **Projectile Sprites**: 16×16px or 32×32px (arrows, fireballs)
4. **Effect Sprites**: Sprite sheets for explosions, impacts

### Loading Strategy

**Option 1**: Preload all assets at combat start
```tsx
useEffect(() => {
  const loader = PIXI.Loader.shared;

  // Load character images
  combatState.combatants.forEach(c => {
    if (c.imagePath) {
      loader.add(c.id, c.imagePath);
    }
  });

  // Load particle textures
  loader.add('spark', '/assets/particles/spark.png');
  loader.add('explosion', '/assets/particles/explosion.png');

  loader.load(() => {
    setAssetsLoaded(true);
  });
}, []);
```

**Option 2**: Lazy load as needed (current approach)
- React already loads images via `<img src={combatant.imagePath}>`
- Can reuse loaded images: `PIXI.Texture.from(imagePath)`

**Recommendation**: Option 2 for character images, Option 1 for effect assets

---

### PyInstaller Integration

**Challenge**: Bundle Pixi.js assets with executable

**Solution**: Add to `build.py` data files
```python
# In create_spec_file():
frontend_datas = [
    ('frontend/dist/*', 'frontend'),
    ('frontend/dist/assets/*', 'frontend/assets'),
    ('frontend/dist/assets/particles/*', 'frontend/assets/particles'),  # NEW
]
```

**Asset Structure**:
```
frontend/
  public/
    assets/
      particles/
        spark.png
        explosion.png
        smoke.png
        blood-splatter.png
      projectiles/
        arrow.png
        fireball.png
        lightning-bolt.png
```

**Vite Config**: Ensure assets are copied to dist
```ts
// vite.config.ts (already configured correctly)
build: {
  outDir: 'dist',
  assetsDir: 'assets',
  // Assets in public/ are automatically copied to dist/
}
```

---

## Build System Changes

### 1. Package.json Updates

**New Dependencies**:
```json
{
  "dependencies": {
    "pixi.js": "^8.0.0",          // Latest stable (2024)
    "@pixi/react": "^7.1.2",      // React wrapper
    "gsap": "^3.12.5"             // Animation library
  }
}
```

**Size Impact**:
- `pixi.js`: ~500KB (minified)
- `@pixi/react`: ~50KB
- `gsap`: ~150KB
- **Total**: ~700KB added to bundle

**Mitigation**:
- Enable tree-shaking (Vite does this automatically)
- Use `pixi.js-legacy` only if needed for older browsers
- Consider code-splitting combat module

---

### 2. Vite Configuration

**No changes needed** - current config already supports static assets

Optional optimization:
```ts
// vite.config.ts
export default defineConfig({
  // ...
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'combat': [
            'pixi.js',
            '@pixi/react',
            'gsap',
            './src/services/combat/combatEngine',
            './src/components/combat/PixiBattlefield',
          ]
        }
      }
    }
  }
});
```

---

### 3. PyInstaller Spec File

**Update `build.py` → `create_spec_file()`**:

```python
hidden_imports = [
    # ... existing imports ...

    # No new hidden imports needed for pixi.js
    # (it's bundled in frontend JS, not a Python module)
]

# Asset files already configured correctly
frontend_datas = [
    ('frontend/dist/*', 'frontend'),
    ('frontend/dist/assets/*', 'frontend/assets'),
    # Pixi.js assets will be in dist/assets/ automatically
]
```

**No changes needed** - frontend build already bundles everything into `dist/`

---

## Migration Strategy

### Phase 1: Foundation (1-2 days)

**Goal**: Set up Pixi.js infrastructure without breaking existing combat

**Tasks**:
1. Install dependencies (`pixi.js`, `@pixi/react`, `gsap`)
2. Create `PixiBattlefield.tsx` component (renders empty stage)
3. Add to `CombatModal.tsx` as overlay (hidden by default)
4. Create `usePixiSync` hook to sync combat state → Pixi.js stage
5. Add dev toggle to switch between CSS and Pixi.js rendering

**Deliverable**: Working Pixi.js canvas that mirrors CSS battlefield (no animations yet)

**Files Created**:
- `frontend/src/components/combat/pixi/PixiBattlefield.tsx`
- `frontend/src/components/combat/pixi/CombatantSprite.tsx`
- `frontend/src/hooks/usePixiSync.ts`

**Validation**:
- [ ] Pixi.js canvas renders 2×5 grid
- [ ] Combatant sprites appear in correct slots
- [ ] HP bars update when state changes
- [ ] No performance degradation

---

### Phase 2: Particle Effects (2-3 days)

**Goal**: Add visual flair to existing animations

**Tasks**:
1. Create particle texture assets (spark, smoke, blood)
2. Implement `ParticleEmitter` class (wraps Pixi.js ParticleContainer)
3. Hook particle effects to combat events:
   - `attack_resolved` → Hit sparks
   - `character_defeated` → Blood splatter
   - `combat_victory` → Confetti burst
4. Add screen shake on critical hits

**Deliverable**: Combat feels more impactful with particle effects

**Files Created**:
- `frontend/src/components/combat/pixi/ParticleEmitter.ts`
- `frontend/src/components/combat/pixi/effects/HitSparks.ts`
- `frontend/public/assets/particles/*.png`

**Validation**:
- [ ] Hit sparks appear on successful attacks
- [ ] Particles despawn after animation
- [ ] No memory leaks (particles are cleaned up)
- [ ] Frame rate stays above 60fps

---

### Phase 3: Card Sprites (3-5 days)

**Goal**: Replace React `<CombatCard>` with Pixi.js sprites

**Tasks**:
1. Migrate card rendering to `CombatantSprite.tsx`
2. Implement HP bar, stat badges, status icons in Pixi.js
3. Add GSAP animations for attack/defend/move
4. Implement damage number pop-up (Pixi.js Text with float-up animation)
5. Test with all existing combat actions

**Deliverable**: CSS `CombatCard` component is no longer used

**Files Modified**:
- `frontend/src/components/combat/pixi/CombatantSprite.tsx` (expand)
- `frontend/src/components/combat/pixi/DamageNumber.tsx` (new)
- `frontend/src/components/combat/BattlefieldGrid.tsx` (remove, replaced by PixiBattlefield)

**Validation**:
- [ ] All card stats visible (HP, damage, defense, level)
- [ ] Status effects display correctly (defending, overwatch)
- [ ] Damage numbers float up and fade out
- [ ] Knocked out cards show "KO" overlay
- [ ] Current turn indicator works

---

### Phase 4: Ranged Attacks (2-3 days)

**Goal**: Implement projectile sprites for ranged weapons

**Tasks**:
1. Create projectile sprite assets (arrow, fireball, etc.)
2. Implement `ProjectileSprite` component
3. Add trajectory calculation (start position → target position)
4. Animate projectile with GSAP (ease-in for acceleration, ease-out on impact)
5. Trigger hit particles when projectile reaches target
6. Update combat engine to support `weaponType: 'ranged'` in stats

**Deliverable**: Ranged attacks show projectile sprites

**Files Created**:
- `frontend/src/components/combat/pixi/ProjectileSprite.tsx`
- `frontend/src/components/combat/pixi/effects/ProjectileTrail.ts`
- `frontend/public/assets/projectiles/*.png`

**Validation**:
- [ ] Projectile travels from attacker to target
- [ ] Trajectory accounts for Y-axis difference (top row vs bottom row)
- [ ] Hit effect triggers on impact
- [ ] Multiple projectiles can be in-flight simultaneously

---

### Phase 5: Drag-and-Drop (5-7 days) - FUTURE

**Goal**: Replace click-to-move with drag-and-drop physics

**Tasks**:
1. Implement Pixi.js pointer events (`pointerdown`, `pointermove`, `pointerup`)
2. Add card drag state (lift, follow cursor, snap to slot)
3. Highlight valid drop targets during drag
4. Add physics (spring-back if dropped on invalid target)
5. Update combat reducer to accept drag-drop actions

**Deliverable**: Players can drag cards to move them

**Note**: This phase is **optional** and can be deferred. Current click-based movement works fine.

---

## Risk Assessment

### High Risk

1. **Performance on Low-End Devices**
   - **Risk**: Pixi.js + React dual rendering may lag on old PCs
   - **Mitigation**:
     - Profile with Chrome DevTools Performance tab
     - Add settings toggle to disable particle effects
     - Use Pixi.js performance tips (sprite pools, texture atlases)

2. **Build System Complexity**
   - **Risk**: PyInstaller may not bundle Pixi.js assets correctly
   - **Mitigation**:
     - Test bundled EXE after each phase
     - Validate asset paths work in both dev and production
     - Document asset loading pattern

### Medium Risk

3. **State Synchronization Bugs**
   - **Risk**: React state and Pixi.js stage get out of sync
   - **Mitigation**:
     - Use single source of truth (React state)
     - Write unit tests for state sync logic
     - Add debug overlay showing current state

4. **Animation Timing Issues**
   - **Risk**: GSAP animations overlap or block user input
   - **Mitigation**:
     - Use event-driven architecture (combat events → animations)
     - Add animation queue to prevent overlap
     - Ensure actions are only processed after animations complete

### Low Risk

5. **Dependency Maintenance**
   - **Risk**: `@pixi/react` or `gsap` breaking changes in future
   - **Mitigation**:
     - Pin dependency versions in `package.json`
     - Monitor changelogs before updating
     - Test thoroughly after dependency updates

---

## Implementation Phases - Summary

| Phase | Duration | Goal | Risk | Priority |
|-------|----------|------|------|----------|
| Phase 1: Foundation | 1-2 days | Pixi.js setup, empty stage | Low | MUST HAVE |
| Phase 2: Particle Effects | 2-3 days | Hit sparks, explosions | Medium | SHOULD HAVE |
| Phase 3: Card Sprites | 3-5 days | Replace CSS cards | Medium | MUST HAVE |
| Phase 4: Ranged Attacks | 2-3 days | Projectile sprites | Low | SHOULD HAVE |
| Phase 5: Drag-and-Drop | 5-7 days | Physics-based movement | High | NICE TO HAVE |

**Total Time Estimate**: 13-20 days for Phases 1-4

---

## Success Criteria

### Phase 1 (Foundation)
- [ ] Pixi.js canvas renders without errors
- [ ] Combat state syncs correctly to stage
- [ ] No performance regression
- [ ] Dev toggle switches between CSS and Pixi.js

### Phase 2 (Particles)
- [ ] Hit effects appear on attacks
- [ ] Particles don't leak memory
- [ ] Frame rate stays above 60fps with 10 combatants

### Phase 3 (Card Sprites)
- [ ] All combat UI works identically to CSS version
- [ ] Damage numbers are readable and impactful
- [ ] Animations feel smooth and responsive

### Phase 4 (Ranged Attacks)
- [ ] Projectiles travel smoothly from attacker to target
- [ ] Hit detection is visually accurate
- [ ] Multiple projectiles can be active simultaneously

---

## Open Questions

1. **Do we want sound effects?**
   - If yes, need to integrate Howler.js or similar
   - Asset loading becomes more complex
   - PyInstaller bundling needs audio files

2. **Mobile support?**
   - Current combat is desktop-only
   - Touch events for drag-and-drop?
   - Performance on mobile browsers?

3. **Accessibility?**
   - Screen reader support for combat log
   - Keyboard-only controls?
   - High-contrast mode?

4. **Multiplayer in future?**
   - If yes, animations need to be deterministic
   - Combat state must be serializable
   - Need network sync strategy

---

## Conclusion

**Recommendation**: Proceed with **Hybrid Approach (Option A)** using incremental rollout strategy.

**Next Steps**:
1. Get user approval on this plan
2. Create task tickets for Phase 1
3. Set up feature branch
4. Begin implementation with Phase 1 (Foundation)

**Estimated Timeline**: 2-3 weeks for Phases 1-4 (excludes drag-and-drop)

---

## Appendix: Code Examples

### Example 1: PixiBattlefield Component (Phase 1)

```tsx
// frontend/src/components/combat/pixi/PixiBattlefield.tsx
import { useEffect, useRef } from 'react';
import { Stage, Container } from '@pixi/react';
import { CombatState } from '../../../types/combat';
import { CombatantSprite } from './CombatantSprite';

interface PixiBattlefieldProps {
  combatState: CombatState;
  width: number;
  height: number;
}

export function PixiBattlefield({ combatState, width, height }: PixiBattlefieldProps) {
  return (
    <Stage width={width} height={height} options={{ backgroundColor: 0x1a1a1a }}>
      <Container>
        {/* Enemy Row */}
        <Container y={50}>
          {combatState.battlefield.enemySlots.map((id, slotIndex) => {
            if (!id) return null;
            const combatant = combatState.combatants[id];
            return (
              <CombatantSprite
                key={id}
                combatant={combatant}
                slotIndex={slotIndex}
                isEnemyRow={true}
              />
            );
          })}
        </Container>

        {/* Ally Row */}
        <Container y={250}>
          {combatState.battlefield.allySlots.map((id, slotIndex) => {
            if (!id) return null;
            const combatant = combatState.combatants[id];
            return (
              <CombatantSprite
                key={id}
                combatant={combatant}
                slotIndex={slotIndex}
                isEnemyRow={false}
              />
            );
          })}
        </Container>
      </Container>
    </Stage>
  );
}
```

### Example 2: Particle Emitter (Phase 2)

```tsx
// frontend/src/components/combat/pixi/effects/HitSparks.ts
import * as PIXI from 'pixi.js';
import gsap from 'gsap';

export function createHitSparks(x: number, y: number, container: PIXI.Container) {
  const sparkTexture = PIXI.Texture.from('/assets/particles/spark.png');

  // Create 10-15 spark particles
  const sparkCount = Math.floor(Math.random() * 6) + 10;

  for (let i = 0; i < sparkCount; i++) {
    const spark = new PIXI.Sprite(sparkTexture);
    spark.anchor.set(0.5);
    spark.x = x;
    spark.y = y;
    spark.scale.set(Math.random() * 0.5 + 0.5);
    spark.rotation = Math.random() * Math.PI * 2;

    container.addChild(spark);

    // Random velocity
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 50 + 30;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    // Animate spark
    gsap.timeline()
      .to(spark, {
        x: x + vx,
        y: y + vy,
        alpha: 0,
        duration: 0.5,
        ease: 'power2.out',
        onComplete: () => {
          container.removeChild(spark);
          spark.destroy();
        }
      });
  }
}
```

### Example 3: Attack Animation with GSAP (Phase 3)

```tsx
// frontend/src/components/combat/pixi/animations/attackAnimation.ts
import gsap from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';
import * as PIXI from 'pixi.js';

gsap.registerPlugin(PixiPlugin);
PixiPlugin.registerPIXI(PIXI);

export function playMeleeAttack(
  attackerSprite: PIXI.Container,
  targetSprite: PIXI.Container,
  direction: 'up' | 'down'
) {
  const originalY = attackerSprite.y;
  const lunge = direction === 'up' ? -80 : 80;

  return gsap.timeline()
    // Wind-up
    .to(attackerSprite, {
      pixi: {
        y: originalY + (direction === 'up' ? 12 : -12),
        rotation: direction === 'up' ? 8 : -8,
        scaleX: 1.08,
        scaleY: 1.08
      },
      duration: 0.2,
      ease: 'power2.in'
    })
    // Strike
    .to(attackerSprite, {
      pixi: {
        y: originalY + lunge,
        rotation: direction === 'up' ? -12 : 12,
        scaleX: 1.15,
        scaleY: 1.15
      },
      duration: 0.3,
      ease: 'back.out(1.7)'
    })
    // Return
    .to(attackerSprite, {
      pixi: {
        y: originalY,
        rotation: 0,
        scaleX: 1,
        scaleY: 1
      },
      duration: 0.3,
      ease: 'power2.in'
    });
}
```

---

**Document Version**: 1.0
**Last Updated**: 2026-01-06
**Author**: Claude (AI Assistant)
