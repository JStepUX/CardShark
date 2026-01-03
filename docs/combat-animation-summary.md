# Combat Animation Update - Vertical Attacks

## 🎯 Fixed: Vertical Attack Direction

The animations now match your **vertical battlefield layout**:

```
┌─────────────────────────────┐
│   ENEMY ROW (Top)           │
│   [E] [E] [E] [E] [E]       │  ← Enemies attack DOWNWARD ↓
│                             │
│   ─────────────────────     │  ← Divider
│                             │
│   [P] [P] [P] [P] [P]       │  ← Players attack UPWARD ↑
│   PLAYER ROW (Bottom)       │
└─────────────────────────────┘
```

## Animation Behavior

### Player Attacking Enemy (Bottom → Top)
1. **Wind-up**: Card dips down 12px with forward tilt (8deg)
2. **Strike**: Card lunges **UPWARD** 80px toward enemy with backward tilt (-12deg)
3. **Recoil**: Slight pullback at 70px
4. **Return**: Smooth return to original position

### Enemy Attacking Player (Top → Bottom)
1. **Wind-up**: Card lifts up 12px with backward tilt (-8deg)
2. **Strike**: Card lunges **DOWNWARD** 80px toward player with forward tilt (12deg)
3. **Recoil**: Slight pullback at 70px
4. **Return**: Smooth return to original position

### Target Hit Reaction (Same for both)
- Shakes side-to-side (12px)
- Bright flash (1.8x brightness)
- Rotates slightly during shake

## Technical Changes

### Files Modified:
1. **`CombatCard.tsx`**:
   - Added `isEnemyRow` prop
   - Uses `animate-melee-attack-up` for players
   - Uses `animate-melee-attack-down` for enemies

2. **`BattlefieldGrid.tsx`**:
   - Passes `isEnemyRow` flag to each card

3. **`tailwind.config.js`**:
   - Replaced horizontal `melee-attack` with:
     - `melee-attack-up` (translateY: -80px)
     - `melee-attack-down` (translateY: +80px)

## Try It Now!

The animations should now:
- ✅ Move **vertically** (up/down) instead of horizontally
- ✅ Match the battlefield layout (enemies above, players below)
- ✅ Feel like cards are "jumping" toward their targets
- ✅ Have proper wind-up and recoil for impact

The 80px movement should be enough to visually "reach" toward the opposite row!
