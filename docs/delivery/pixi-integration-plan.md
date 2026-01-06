# Pixi.js Integration Plan for CardShark Combat System

**Date**: 2026-01-06 (Updated)
**Branch**: `claude/plan-pixi-integration-gfcMf`
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
- `CombatModal.tsx` - React container
- `CombatCard.tsx` - Basic card display with HP bars
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

**Cost**: 1-2 weeks to reach feature parity, then delete ~500 lines

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
│   ├── CombatModal.tsx              ← OLD (CSS-based, keep as reference)
│   ├── CombatCard.tsx               ← OLD
│   ├── BattlefieldGrid.tsx          ← OLD
│   └── pixi/
│       ├── PixiCombatModal.tsx      ← NEW (pixi.js-based)
│       ├── PixiBattlefield.tsx      ← NEW
│       ├── CombatantSprite.tsx      ← NEW
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

**Decision**: Use `@pixi/react` wrapper library

**Why**:
```tsx
// Declarative API (React-like)
import { Stage, Sprite, Container, Graphics } from '@pixi/react';

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

**Pros**:
- Declarative API (React-like syntax)
- Automatic lifecycle management
- State synchronization built-in
- TypeScript support

**Cons**:
- Additional dependency (~50KB)

---

### 2. Animation System

**Decision**: Start with **Pixi.js ticker only**, add GSAP later if needed

**Why**:
- Pixi.js has built-in animation via `ticker` (60fps loop)
- Simple lerp + easing functions handle most cases
- One less dependency to learn (~150KB saved)
- Prove we need GSAP before adding it

**Pixi.js Animation Example**:
```tsx
// Basic attack animation with ticker
function animateAttack(sprite: PIXI.Sprite, onComplete: () => void) {
  const startY = sprite.y;
  const endY = startY - 80;
  let progress = 0;

  const animate = (delta: number) => {
    progress += delta / 60 * 2; // 2 = speed multiplier

    if (progress >= 1) {
      sprite.y = startY;
      app.ticker.remove(animate);
      onComplete();
      return;
    }

    // Ease out cubic
    const t = 1 - Math.pow(1 - progress, 3);
    sprite.y = startY + (endY - startY) * t;
  };

  app.ticker.add(animate);
}
```

**When to Add GSAP**:
- Complex timeline sequences (wind-up → strike → recoil → return)
- Need advanced easing (elastic, bounce with overshoot)
- Animation code becomes hard to maintain

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
Pixi.js useEffect hook detects change
  ↓
updatePixiStage(stage, newState)
  ↓
Events trigger animations (ticker-based)
```

**State Flow**:
1. **Single source of truth**: `CombatState` in React
2. **Pixi.js stage is view layer**: Reacts to state changes
3. **Events trigger animations**: `CombatEvent[]` → pixi.js animations

---

### 4. Card Rendering

**Decision**: Full pixi.js rendering (sprites + graphics API)

**Card Layers**:
1. **Pixi.js Sprite**: Character portrait (base layer)
2. **Pixi.js Graphics**: HP bar, stat badges, borders
3. **Pixi.js Text**: Name, level, stats

**Example**:
```tsx
function CombatantSprite({ combatant, x, y }) {
  const hpPercent = combatant.currentHp / combatant.maxHp;

  return (
    <Container x={x} y={y}>
      {/* Portrait */}
      <Sprite
        texture={PIXI.Texture.from(combatant.imagePath)}
        width={112}
        height={160}
      />

      {/* HP Bar */}
      <Graphics
        draw={g => {
          g.clear();
          // Background
          g.beginFill(0x333333);
          g.drawRect(8, 140, 96, 8);
          // Fill
          g.beginFill(0xff0000);
          g.drawRect(8, 140, 96 * hpPercent, 8);
          g.endFill();
        }}
      />

      {/* Name */}
      <Text
        text={combatant.name}
        x={56}
        y={150}
        anchor={0.5}
        style={{ fontSize: 12, fill: 0xffffff }}
      />
    </Container>
  );
}
```

---

## Asset Pipeline

### Asset Types Needed

1. **Card Sprites**: 112×160px PNG (reuse existing character images)
2. **Particle Textures**: 32×32px PNG (sparks, smoke, blood)
3. **Projectile Sprites**: 16×16px or 32×32px (arrows, fireballs)
4. **Effect Sprites**: Sprite sheets for explosions, impacts (optional)

### Loading Strategy

**Use Pixi.js Assets API (v8)**:
```tsx
import { Assets } from 'pixi.js';

// Preload at combat start
async function loadCombatAssets(combatState: CombatState) {
  const assets = [
    // Character images
    ...Object.values(combatState.combatants).map(c => ({
      alias: c.id,
      src: c.imagePath
    })),
    // Particle textures
    { alias: 'spark', src: '/assets/particles/spark.png' },
    { alias: 'explosion', src: '/assets/particles/explosion.png' },
  ];

  await Assets.load(assets);
}
```

### Asset Structure

```
frontend/
  public/
    assets/
      particles/
        spark.png          # 32×32 white spark
        explosion.png      # 64×64 explosion sprite sheet
        smoke.png          # 32×32 smoke puff
        blood-splatter.png # 32×32 blood
      projectiles/
        arrow.png          # 16×16 arrow sprite
        fireball.png       # 32×32 fireball sprite
        lightning-bolt.png # 16×32 lightning
```

### PyInstaller Integration

**Add to `build.py` data files**:
```python
# In create_spec_file():
frontend_datas = [
    ('frontend/dist/*', 'frontend'),
    ('frontend/dist/assets/*', 'frontend/assets'),
    ('frontend/dist/assets/particles/*', 'frontend/assets/particles'),  # NEW
    ('frontend/dist/assets/projectiles/*', 'frontend/assets/projectiles'),  # NEW
]
```

**Vite automatically copies `public/assets/` to `dist/assets/`** - no config changes needed.

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
- `pixi.js`: ~500KB (minified + gzip: ~150KB)
- `@pixi/react`: ~50KB (minified + gzip: ~15KB)
- **Total**: ~165KB gzipped (acceptable for desktop app)

**GSAP deferred** - add later only if needed (~50KB gzipped)

---

### 2. Vite Configuration

**No changes needed** - current config already supports:
- Static asset bundling
- TypeScript
- Tree-shaking
- Code-splitting

Optional optimization (defer to later):
```ts
// vite.config.ts - code-split combat module
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'combat': [
            'pixi.js',
            '@pixi/react',
            './src/services/combat/combatEngine',
            './src/components/combat/pixi/PixiCombatModal',
          ]
        }
      }
    }
  }
});
```

---

### 3. PyInstaller Spec File

**No changes needed** - frontend assets already bundled correctly.

`build.py` already handles `frontend/dist/*` → PyInstaller automatically includes all pixi.js bundles.

---

## Implementation Phases

### Phase 1: Foundation (2-3 days)

**Goal**: Get pixi.js rendering basic battlefield with static cards

**Tasks**:
1. Install dependencies (`pixi.js`, `@pixi/react`)
2. Create `PixiCombatModal.tsx` (empty stage)
3. Create `PixiBattlefield.tsx` (2×5 grid with empty slots)
4. Create `CombatantSprite.tsx` (render card with portrait + HP bar)
5. Add feature flag to switch between CSS and Pixi versions
6. Wire up combat state → pixi.js rendering (no animations yet)

**Deliverable**: Static pixi.js battlefield that shows all combatants

**Files Created**:
- `frontend/src/components/combat/pixi/PixiCombatModal.tsx`
- `frontend/src/components/combat/pixi/PixiBattlefield.tsx`
- `frontend/src/components/combat/pixi/CombatantSprite.tsx`
- `frontend/src/components/combat/pixi/PixiActionButtons.tsx`

**Validation**:
- [ ] Pixi.js canvas renders without errors
- [ ] All combatants appear in correct slots
- [ ] HP bars update when state changes
- [ ] Can switch between CSS and Pixi versions with feature flag
- [ ] No performance degradation

---

### Phase 2: Core Actions + Simple Animations (3-4 days)

**Goal**: Implement all combat actions with basic animations

**Tasks**:
1. Implement action buttons (Attack, Defend, Move, Overwatch, Flee)
2. Wire up actions → combat reducer → pixi.js updates
3. Add basic attack animation (ticker-based: wind-up → strike → return)
4. Add hit reaction animation (shake + brightness flash)
5. Add damage numbers (pixi.js Text with float-up animation)
6. Implement move action (slide to new slot)
7. Add turn indicator (arrow above current actor)

**Deliverable**: Full combat functionality with basic animations

**Files Created**:
- `frontend/src/components/combat/pixi/animations/attackAnimation.ts`
- `frontend/src/components/combat/pixi/animations/hitAnimation.ts`
- `frontend/src/components/combat/pixi/DamageNumber.tsx`

**Validation**:
- [ ] All actions work: attack, defend, move, swap, overwatch, flee
- [ ] Animations play smoothly (60fps)
- [ ] Damage numbers are readable
- [ ] Turn order respects initiative
- [ ] Enemy AI works correctly

---

### Phase 3: Polish + Particle Effects (2-3 days)

**Goal**: Add visual flair and juice

**Tasks**:
1. Create particle texture assets (spark, smoke, blood)
2. Implement `ParticleEmitter` class (ticker-based particle system)
3. Add hit sparks on successful attacks
4. Add blood splatter on killing blows
5. Add screen shake on critical hits (camera shake)
6. Add status effect indicators (defending, overwatch icons)
7. Add combat log integration
8. Add combat end screen (victory/defeat)

**Deliverable**: Polished combat that feels impactful

**Files Created**:
- `frontend/src/components/combat/pixi/ParticleEmitter.ts`
- `frontend/src/components/combat/pixi/effects/hitSparks.ts`
- `frontend/public/assets/particles/*.png`

**Validation**:
- [ ] Hit effects appear on attacks
- [ ] Particles despawn cleanly (no memory leaks)
- [ ] Screen shake is noticeable but not nauseating
- [ ] Frame rate stays above 60fps with 10 combatants
- [ ] Combat feels "juicy" and satisfying

---

### Phase 4: Ranged Attacks + Cleanup (2-3 days)

**Goal**: Add projectile sprites and delete old CSS combat

**Tasks**:
1. Create projectile sprite assets (arrow, fireball)
2. Implement `ProjectileSprite` component
3. Add trajectory calculation (arc for arrows, straight for bolts)
4. Animate projectiles with ticker (ease-out on launch, ease-in on impact)
5. Trigger hit particles when projectile reaches target
6. **Delete old CSS combat code**:
   - Remove `CombatModal.tsx`, `CombatCard.tsx`, `BattlefieldGrid.tsx`
   - Remove Tailwind combat animations from `tailwind.config.js`
   - Remove feature flag, make pixi.js the only option
7. Update documentation

**Deliverable**: Ranged attacks work, old code deleted

**Files Deleted**:
- `frontend/src/components/combat/CombatModal.tsx` (~300 lines)
- `frontend/src/components/combat/CombatCard.tsx` (~200 lines)
- `frontend/src/components/combat/BattlefieldGrid.tsx` (~100 lines)
- Tailwind animations (~50 lines)

**Validation**:
- [ ] Projectile travels from attacker to target
- [ ] Trajectory looks natural (arc for arrows)
- [ ] Hit effect triggers on impact
- [ ] Old CSS combat removed from codebase
- [ ] No references to old components remain

---

### Phase 5: Advanced Features (FUTURE)

**Optional enhancements** - defer until after Phase 4:

1. **Drag-and-Drop Movement** (5-7 days)
   - Pointer events for card dragging
   - Snap-to-slot physics
   - Highlight valid drop targets

2. **GSAP Integration** (1-2 days)
   - Add `gsap` dependency if animation code becomes unwieldy
   - Convert complex sequences to timelines

3. **Sound Effects** (2-3 days)
   - Integrate Howler.js
   - Attack sounds, hit sounds, victory fanfare

4. **Advanced Particle Effects** (3-4 days)
   - Sprite sheet explosions
   - Trailing effects (motion blur)
   - Area-of-effect visuals

---

## Risk Assessment

### High Risk

1. **Performance on Low-End Devices**
   - **Risk**: Pixi.js may lag on old PCs
   - **Mitigation**:
     - Profile with Chrome DevTools Performance tab
     - Target 60fps minimum, test on low-end hardware
     - Add settings toggle to reduce particle density
     - Use object pooling for particles (reuse sprites)

2. **Learning Curve**
   - **Risk**: Team unfamiliar with pixi.js patterns
   - **Mitigation**:
     - Start simple (static rendering first)
     - Reference pixi.js examples and docs
     - Iterate on feedback from testing

### Medium Risk

3. **State Synchronization Bugs**
   - **Risk**: React state and Pixi.js stage get out of sync
   - **Mitigation**:
     - Use single source of truth (React state)
     - Write unit tests for state sync logic
     - Add debug overlay showing current state

4. **Asset Loading Failures**
   - **Risk**: Missing textures or failed loads
   - **Mitigation**:
     - Add loading screen with progress bar
     - Fallback to colored rectangles if textures fail
     - Validate asset paths in build process

### Low Risk

5. **Build System Issues**
   - **Risk**: PyInstaller doesn't bundle assets correctly
   - **Mitigation**:
     - Test bundled EXE after each phase
     - Vite already handles static assets correctly
     - No PyInstaller changes needed (frontend bundles everything)

---

## Success Criteria

### Phase 1 (Foundation)
- [ ] Pixi.js canvas renders without errors
- [ ] All combatants appear in correct slots
- [ ] HP bars update when combat state changes
- [ ] Can toggle between CSS and Pixi versions
- [ ] No performance regression (<16ms frame time)

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
| Phase 1: Foundation | 2-3 days | Basic pixi.js rendering |
| Phase 2: Core Actions | 3-4 days | All combat actions + animations |
| Phase 3: Polish | 2-3 days | Particles, juice, effects |
| Phase 4: Ranged + Cleanup | 2-3 days | Projectiles, delete old code |

**Total**: 9-13 days for full pixi.js combat with feature parity and cleanup

**Future** (optional): Phase 5 adds 5-10 days for advanced features

---

## Appendix: Code Examples

### Example 1: PixiCombatModal (Phase 1)

```tsx
// frontend/src/components/combat/pixi/PixiCombatModal.tsx
import { useState, useCallback } from 'react';
import { Stage } from '@pixi/react';
import { CombatState, CombatInitData } from '../../../types/combat';
import { initializeCombat, combatReducer } from '../../../services/combat/combatEngine';
import { PixiBattlefield } from './PixiBattlefield';

interface PixiCombatModalProps {
  initData: CombatInitData;
  onCombatEnd: (result: CombatState['result']) => void;
}

export function PixiCombatModal({ initData, onCombatEnd }: PixiCombatModalProps) {
  const [combatState, setCombatState] = useState<CombatState>(() =>
    initializeCombat(initData)
  );

  const handleAction = useCallback((action: CombatAction) => {
    const { state: newState, events } = combatReducer(combatState, action);
    setCombatState(newState);

    // Check for combat end
    if (newState.phase === 'victory' || newState.phase === 'defeat') {
      setTimeout(() => onCombatEnd(newState.result), 2000);
    }
  }, [combatState, onCombatEnd]);

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="relative">
        {/* Pixi.js Canvas */}
        <Stage width={800} height={600} options={{ backgroundColor: 0x1a1a1a }}>
          <PixiBattlefield combatState={combatState} onAction={handleAction} />
        </Stage>

        {/* React UI Overlay (action buttons, log, etc.) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          {/* Action buttons go here */}
        </div>
      </div>
    </div>
  );
}
```

### Example 2: CombatantSprite (Phase 1)

```tsx
// frontend/src/components/combat/pixi/CombatantSprite.tsx
import { useCallback } from 'react';
import { Container, Sprite, Graphics, Text } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { Combatant } from '../../../types/combat';

interface CombatantSpriteProps {
  combatant: Combatant;
  x: number;
  y: number;
  isCurrentTurn: boolean;
  onClick?: () => void;
}

export function CombatantSprite({
  combatant,
  x,
  y,
  isCurrentTurn,
  onClick
}: CombatantSpriteProps) {
  const hpPercent = combatant.currentHp / combatant.maxHp;

  const drawCard = useCallback((g: PIXI.Graphics) => {
    g.clear();

    // Border (glow if current turn)
    if (isCurrentTurn) {
      g.lineStyle(4, 0x4A90E2, 1);
    } else {
      g.lineStyle(2, combatant.isPlayerControlled ? 0xFFA500 : 0xFF0000, 1);
    }
    g.drawRoundedRect(0, 0, 112, 160, 8);
  }, [isCurrentTurn, combatant.isPlayerControlled]);

  const drawHP = useCallback((g: PIXI.Graphics) => {
    g.clear();

    // Background
    g.beginFill(0x333333);
    g.drawRoundedRect(8, 140, 96, 8, 4);

    // HP Fill
    const fillColor = hpPercent > 0.5 ? 0x00FF00 : hpPercent > 0.25 ? 0xFFAA00 : 0xFF0000;
    g.beginFill(fillColor);
    g.drawRoundedRect(8, 140, 96 * hpPercent, 8, 4);
    g.endFill();
  }, [hpPercent]);

  return (
    <Container x={x} y={y} interactive={!!onClick} pointerdown={onClick}>
      {/* Card border */}
      <Graphics draw={drawCard} />

      {/* Portrait */}
      {combatant.imagePath && (
        <Sprite
          image={combatant.imagePath}
          x={4}
          y={4}
          width={104}
          height={108}
        />
      )}

      {/* Name */}
      <Text
        text={combatant.name}
        x={56}
        y={116}
        anchor={0.5}
        style={{
          fontSize: 12,
          fill: 0xFFFFFF,
          fontWeight: 'bold',
          dropShadow: true,
          dropShadowDistance: 1
        }}
      />

      {/* HP Bar */}
      <Graphics draw={drawHP} />

      {/* HP Text */}
      <Text
        text={`${combatant.currentHp}/${combatant.maxHp}`}
        x={56}
        y={144}
        anchor={0.5}
        style={{
          fontSize: 10,
          fill: 0xFFFFFF,
          fontWeight: 'bold'
        }}
      />

      {/* Level Badge */}
      <Container x={4} y={4}>
        <Graphics
          draw={(g) => {
            g.clear();
            g.beginFill(0x000000, 0.8);
            g.drawRoundedRect(0, 0, 20, 16, 4);
            g.endFill();
          }}
        />
        <Text
          text={String(combatant.level)}
          x={10}
          y={8}
          anchor={0.5}
          style={{ fontSize: 10, fill: 0xFFFFFF, fontWeight: 'bold' }}
        />
      </Container>
    </Container>
  );
}
```

### Example 3: Attack Animation (Phase 2)

```tsx
// frontend/src/components/combat/pixi/animations/attackAnimation.ts
import * as PIXI from 'pixi.js';

/**
 * Animate a melee attack using pixi.js ticker
 */
export function animateAttack(
  sprite: PIXI.Container,
  direction: 'up' | 'down',
  onComplete: () => void
): void {
  const app = sprite.parent as any; // Get application instance
  const startY = sprite.y;
  const targetY = startY + (direction === 'up' ? -80 : 80);

  let phase = 0; // 0 = wind-up, 1 = strike, 2 = return
  let progress = 0;

  const animate = (delta: number) => {
    const speed = delta / 60 * 3; // Speed multiplier

    if (phase === 0) {
      // Wind-up (0.2s)
      progress += speed * 5;
      if (progress >= 1) {
        progress = 0;
        phase = 1;
      }
      const t = easeInQuad(progress);
      sprite.y = startY + (direction === 'up' ? 12 : -12) * t;
      sprite.rotation = (direction === 'up' ? 0.14 : -0.14) * t; // ~8 degrees
      sprite.scale.set(1 + 0.08 * t);

    } else if (phase === 1) {
      // Strike (0.3s)
      progress += speed * 3.33;
      if (progress >= 1) {
        progress = 0;
        phase = 2;
      }
      const t = easeOutBack(progress); // Bounce effect
      sprite.y = startY + (targetY - startY) * t;
      sprite.rotation = (direction === 'up' ? -0.21 : 0.21) * t; // ~-12 degrees
      sprite.scale.set(1 + 0.15 * t);

    } else {
      // Return (0.3s)
      progress += speed * 3.33;
      if (progress >= 1) {
        sprite.y = startY;
        sprite.rotation = 0;
        sprite.scale.set(1);
        app.ticker.remove(animate);
        onComplete();
        return;
      }
      const t = easeInQuad(progress);
      sprite.y = targetY + (startY - targetY) * t;
      sprite.rotation = (direction === 'up' ? -0.21 : 0.21) * (1 - t);
      sprite.scale.set(1.15 - 0.15 * t);
    }
  };

  app.ticker.add(animate);
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

### Example 4: Particle Emitter (Phase 3)

```tsx
// frontend/src/components/combat/pixi/ParticleEmitter.ts
import * as PIXI from 'pixi.js';

interface Particle {
  sprite: PIXI.Sprite;
  vx: number;
  vy: number;
  life: number;
}

export class ParticleEmitter {
  private app: PIXI.Application;
  private container: PIXI.Container;
  private particles: Particle[] = [];
  private texture: PIXI.Texture;

  constructor(app: PIXI.Application, container: PIXI.Container, texturePath: string) {
    this.app = app;
    this.container = container;
    this.texture = PIXI.Texture.from(texturePath);

    // Start update loop
    this.app.ticker.add(this.update, this);
  }

  /**
   * Emit particles at a position
   */
  emit(x: number, y: number, count: number = 10): void {
    for (let i = 0; i < count; i++) {
      const sprite = new PIXI.Sprite(this.texture);
      sprite.anchor.set(0.5);
      sprite.x = x;
      sprite.y = y;
      sprite.scale.set(Math.random() * 0.5 + 0.5);
      sprite.rotation = Math.random() * Math.PI * 2;

      this.container.addChild(sprite);

      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 50 + 30;

      this.particles.push({
        sprite,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0
      });
    }
  }

  /**
   * Update particles (called by ticker)
   */
  private update(delta: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Update position
      p.sprite.x += p.vx * delta / 60;
      p.sprite.y += p.vy * delta / 60;

      // Apply gravity
      p.vy += 150 * delta / 60;

      // Fade out
      p.life -= delta / 60 * 2;
      p.sprite.alpha = p.life;

      // Remove dead particles
      if (p.life <= 0) {
        this.container.removeChild(p.sprite);
        p.sprite.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.app.ticker.remove(this.update, this);
    this.particles.forEach(p => {
      this.container.removeChild(p.sprite);
      p.sprite.destroy();
    });
    this.particles = [];
  }
}
```

---

**Document Version**: 2.0 (Fresh Build Strategy)
**Last Updated**: 2026-01-06
**Author**: Claude (AI Assistant)
