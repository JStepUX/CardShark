# CardShark Combat System

A modular, turn-based tactical combat system designed for data-driven balancing.

## Architecture Overview

```
frontend/src/
├── types/
│   └── combat.ts           # Type definitions & stat derivation
├── services/combat/
│   ├── combatEngine.ts     # Pure reducer - all combat logic
│   ├── enemyAI.ts          # NPC decision making
│   └── index.ts            # Exports
└── components/combat/
    ├── CombatModal.tsx     # Main UI orchestrator
    ├── BattlefieldGrid.tsx # 2×5 slot grid
    ├── CombatCard.tsx      # Combatant display
    ├── ActionButtons.tsx   # Action bar
    ├── CombatLog.tsx       # Turn history
    ├── InitiativeTracker.tsx
    ├── PlayerHUD.tsx
    └── index.ts

tools/
└── combat-simulator.js     # Balance testing (standalone Node.js)
```

## Design Principles

1. **Pure Reducer Pattern**: The combat engine is a pure function with no side effects:
   ```typescript
   combatReducer(state: CombatState, action: CombatAction)
     => { state: CombatState, events: CombatEvent[] }
   ```
   This makes it fully testable and replayable.

2. **Single Source of Truth**: All stats derive from `monster_level` (1-60). World creators only set one field.

3. **Event-Driven Narration**: Combat emits events that can drive AI narration without coupling the engine to the narrator.

4. **Atomic Combat**: No mid-combat saves. Quit = reset. This keeps state clean.

## Stat Formulas (V1)

All combatant stats derive from level using these formulas:

```javascript
hp      = 20 + (level * 5)           // 25 to 320
damage  = 2 + floor(level / 2)       // 2 to 32
defense = 5 + floor(level / 3)       // 5 to 25
speed   = 3 + floor(level / 10)      // 3 to 9
armor   = floor(level / 15)          // 0 to 4
```

### Reference Table

| Level | HP  | Damage | Defense | Speed | Armor |
|-------|-----|--------|---------|-------|-------|
| 1     | 25  | 2      | 5       | 3     | 0     |
| 5     | 45  | 4      | 6       | 3     | 0     |
| 10    | 70  | 7      | 8       | 4     | 0     |
| 20    | 120 | 12     | 11      | 5     | 1     |
| 30    | 170 | 17     | 15      | 6     | 2     |
| 45    | 245 | 24     | 20      | 7     | 3     |
| 60    | 320 | 32     | 25      | 9     | 4     |

## Combat Flow

### Initiative
At combat start, each combatant rolls: `speed + d6`

Ties broken by: higher base speed → player-controlled → random

### Turn Structure
Each turn, the active combatant has **2 Action Points (AP)**:

| Action    | AP Cost | Ends Turn | Notes |
|-----------|---------|-----------|-------|
| Attack    | 2       | Yes       | Roll d20 + (level/2) vs target defense, damage ±3 variance |
| Defend    | 1       | Yes       | +2 to +4 Defense until next turn (variable) |
| Overwatch | 2       | Yes       | Reaction shot with -1 to -3 accuracy penalty |
| Move      | 1-2     | Maybe     | 1 AP adjacent empty, 2 AP if passing ally |
| Swap      | 1       | No        | Switch with adjacent ally |
| Flee      | 2       | Yes       | Must be at edge (slot 0 or 4) |

### Attack Resolution
```
attackRoll = d20 + floor(attacker.level / 2)
hit = attackRoll >= target.defense + (target.defendBonus if defending)

if (hit):
  damageVariance = d7 - 4          // -3 to +3 variance
  rawDamage = max(1, attacker.damage + damageVariance)
  finalDamage = max(1, rawDamage - target.armor)
  target.hp -= finalDamage
```

### Combat Variability

To keep combat interesting, several mechanics include random variance:

| Mechanic | Variance | Notes |
|----------|----------|-------|
| Damage | ±3 | d7-4 added to base damage |
| Defend | +2 to +4 Defense | Roll d3+1 when defending |
| Overwatch | -1 to -3 accuracy | Penalty applied to reaction shots |

### Hit Quality (for narrator hints)
| Quality     | Condition           | Narrator Hint |
|-------------|---------------------|---------------|
| miss        | margin < 0          | Dodge, parry, whiff |
| marginal    | margin 0-2          | Lucky, glancing blow |
| solid       | margin 3-7          | Clean hit |
| crushing    | margin >= 8         | Devastating strike |
| armor_soak  | hit but armor ate it| Clang, stagger |

### Victory/Defeat/Flee
- **Victory**: All enemies knocked out → XP and gold rewards
- **Defeat**: All allies knocked out → Return to start, HP at 25%
- **Fled**: Player successfully escapes → No penalties, enemies remain in room

## Battlefield Layout

```
Enemy Row:    [0] [1] [2] [3] [4]    (top)
              ─────────────────────
Ally Row:     [0] [1] [2] [3] [4]    (bottom)
```

- 5 slots per row, indexed 0-4
- Adjacency = slots N and N±1 in same row
- All enemies are "engaged" with all allies for attack targeting

### Placement
- Player starts at slot 2 (center)
- Allies fill slots 1, 3, 0, 4 (center out)
- Enemies use formation preference (melee clusters center)

## Integration Points

### Initiating Combat (from WorldPlayView)
```typescript
// When player clicks a hostile NPC
const initData: CombatInitData = {
  playerData: { id, name, level, imagePath },
  enemies: [{ id, name, level, imagePath }, ...],
  allies: [],  // Optional party members
  roomImagePath: '/path/to/backdrop.png',
  roomName: 'Dark Cave',
  playerAdvantage: true,  // false if ambushed
};

// Render the modal
<CombatModal initData={initData} onCombatEnd={handleResult} />
```

### Handling Results
```typescript
function handleCombatEnd(result: CombatState['result']) {
  if (result.outcome === 'victory') {
    // Remove defeated NPCs from room
    // Award XP/gold: result.rewards
  } else if (result.outcome === 'defeat') {
    // Reset player position
    // Apply penalties
  }
}
```

### Adding `monster_level` to NPCs
In room placement, set hostile NPCs with a level:
```typescript
const roomNpc: RoomNPC = {
  character_uuid: 'goblin-001',
  role: 'guard',
  hostile: true,
  monster_level: 8,  // This drives all combat stats
};
```

## Known Balance Issues (V1)

Identified via simulation (`node tools/combat-simulator.js full`):

| Issue | Cause | Severity |
|-------|-------|----------|
| 0% miss rate at level 26+ | Attack bonus outpaces defense scaling | Critical |
| 0% win rate vs +5 level enemy | HP/damage gap insurmountable | Critical |
| 0% win rate 1v2 at equal levels | Action economy disadvantage | Harsh |

See `tools/combat-simulator.js` for data-driven balancing.

## Future Enhancements (V2+)

Per the design spec, deferred features include:
- Weapon types (melee/ranged with range rules)
- Items and inventory in combat
- Status effects (poison, stun, bleed)
- Enemy AI archetypes (aggressive, defensive, tactical)
- AOE attacks
- Pre-battle party arrangement
- Combat animations and sound

## Files Reference

| File | Purpose |
|------|---------|
| `types/combat.ts` | All TypeScript interfaces, `deriveCombatStats()` |
| `services/combat/combatEngine.ts` | Pure reducer, initiative, actions, victory check |
| `services/combat/enemyAI.ts` | `getEnemyAction()` - simple lowest-HP targeting |
| `components/combat/CombatModal.tsx` | Main orchestrator, keyboard shortcuts |
| `components/combat/BattlefieldGrid.tsx` | Renders the 2×5 grid |
| `components/combat/CombatCard.tsx` | Individual combatant cards |
| `components/combat/ActionButtons.tsx` | Action bar with AP costs |
| `components/combat/CombatLog.tsx` | Turn history display |
| `tools/combat-simulator.js` | Monte Carlo balance testing |
