# Combat Animation System

## Overview
The combat animation system provides visual feedback for attacks using CSS animations. It's designed to be extensible for future features like ranged projectile trails.

## Architecture

### Animation Flow
1. **User selects attack** → Action button clicked
2. **Animation triggered** → `CombatModal` sets `attackingId` and `beingAttackedId`
3. **CSS animations play** → Cards animate via Tailwind classes
4. **Damage resolves** → After 400ms, combat state updates and damage numbers appear
5. **Animation clears** → State resets, ready for next action

### Component Hierarchy
```
CombatModal (manages animation state)
  ↓ passes attackingId, beingAttackedId
BattlefieldGrid (routes to correct cards)
  ↓ passes isAttacking, isBeingAttacked
CombatCard (applies CSS animation classes)
```

## Current Animations

### Melee Attack (`animate-melee-attack`)
- **Duration**: 600ms
- **Effect**: Card lifts, tilts, lunges forward 40px, then returns
- **Easing**: `cubic-bezier(0.34, 1.56, 0.64, 1)` for satisfying bounce
- **Keyframes**:
  - 0%: Normal position
  - 20%: Lift up 8px, tilt back -5deg (wind-up)
  - 50%: Lunge forward 40px, tilt forward 8deg (strike)
  - 70%: Slight recoil at 35px
  - 100%: Return to normal

### Take Hit (`animate-take-hit`)
- **Duration**: 400ms
- **Effect**: Card shakes side-to-side with brightness flash
- **Easing**: `ease-out`
- **Keyframes**:
  - 0%: Normal
  - 25%: Shake left -8px, brighten 1.5x (impact flash)
  - 50%: Shake right 6px, brighten 1.3x
  - 75%: Shake left -4px, brighten 1.1x
  - 100%: Return to normal

## Timing Details

- **Animation trigger**: Immediate when attack action is executed
- **Damage resolution**: 400ms after animation starts (overlaps with animation end)
- **Total perceived duration**: ~600ms (smooth, doesn't slow gameplay)
- **Damage number display**: Appears when combat state updates (at 400ms mark)

## Future Extensions

### Ranged Attacks (Planned)
When implementing ranged attacks:

1. **Check weapon type** in `CombatModal.executeAction()`:
   ```tsx
   if (attacker?.weaponType === 'ranged') {
     // Trigger projectile animation instead
     setProjectileAnimation({ from: actorId, to: targetId });
   }
   ```

2. **Create projectile component**:
   - Render a `<div>` that animates from attacker position to target
   - Use `position: absolute` with calculated coordinates
   - Remove after animation completes

3. **Projectile animation**:
   - Calculate start/end positions from card refs
   - Animate using CSS `translate` or Framer Motion
   - Trigger `take-hit` on target when projectile arrives

### Other Potential Animations
- **Critical hits**: Screen shake, red flash overlay
- **Healing**: Green particle burst, upward float
- **Buffs/Debuffs**: Colored aura pulse around card
- **Knockouts**: Card falls backward with rotation
- **Dodge/Miss**: Target card sways to side

## Performance Notes

- All animations use GPU-accelerated properties (`transform`, `filter`)
- No layout thrashing (no changes to `width`, `height`, `top`, `left`)
- Animations respect `prefers-reduced-motion` (Tailwind handles this automatically)
- State updates are batched to prevent unnecessary re-renders

## Accessibility

- Animations are purely visual enhancement
- Combat mechanics work identically with or without animations
- Damage numbers and combat log provide text-based feedback
- Future: Add setting to disable animations for motion sensitivity

## Files Modified

- `frontend/tailwind.config.js` - Animation definitions
- `frontend/src/components/combat/CombatCard.tsx` - Animation props and classes
- `frontend/src/components/combat/BattlefieldGrid.tsx` - Animation prop passing
- `frontend/src/components/combat/CombatModal.tsx` - Animation state management
