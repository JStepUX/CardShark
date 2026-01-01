# CardShark Development Tools

## Combat Balance Simulator

`combat-simulator.js` - A Monte Carlo simulation tool for testing combat balance.

### Why Use This?

You can't manually playtest every combination of:
- Player levels 1-60
- Enemy levels 1-60
- 1v1, 1v2, 1v3, 1v4, 1v5 scenarios
- Party compositions (2v2, 2v3, etc.)

The simulator runs thousands of combats in seconds and identifies balance problems automatically.

### Usage

```bash
# Quick test - 8 key scenarios, ~1,600 combats, <1 second
node tools/combat-simulator.js quick

# Full sweep - 48 scenarios, ~14,400 combats, ~1 second
node tools/combat-simulator.js full

# Custom scenarios - boss fights, edge cases
node tools/combat-simulator.js custom
```

### Reading the Output

```
╔════════════════════════════════════════════════════════════════════╗
║              CARDSHARK COMBAT BALANCE SIMULATION                   ║
╚════════════════════════════════════════════════════════════════════╝

📊 SUMMARY
──────────────────────────────────────────────────────────────────────
Total combats: 14,400
Overall win rate: 13.7%
Avg turns: 7.8
Miss rate range: 5% - 52%
```

**Key Metrics:**
- **Win rate**: Should be ~45-55% for equal-level 1v1
- **Avg turns**: 4-10 is healthy; <3 is too fast, >15 is too slow
- **Miss rate range**: 15-30% is ideal; 0% means no tension

### Warning Types

```
🔴 Critical - Something is broken
   Example: "Win rate 0% - too hard" for equal-level fights

🟡 Warning - Potential issue
   Example: "Miss rate 0% - no tension" at high levels
```

### Detailed Results Table

```
Scenario                          Win%   Turns     HP%   Miss%
──────────────────────────────────────────────────────────────────────
Player(10) vs Enemy(10)            44%     9.9     15%     10%
```

- **Win%**: Player win rate (should be ~45-55% for equal level)
- **Turns**: Average combat length
- **HP%**: Average HP remaining when player wins
- **Miss%**: How often player attacks miss

### Customizing Scenarios

Edit the `getCustomScenarios()` function in `combat-simulator.js`:

```javascript
function getCustomScenarios() {
  return [
    // Test a boss fight
    { playerLevel: 20, allyLevels: [20, 20], enemyLevels: [40], iterations: 500 },

    // Test low-level swarm
    { playerLevel: 5, allyLevels: [], enemyLevels: [3, 3, 3, 3], iterations: 500 },

    // Test level 1 experience
    { playerLevel: 1, allyLevels: [], enemyLevels: [1], iterations: 1000 },
  ];
}
```

Then run: `node tools/combat-simulator.js custom`

### Testing Formula Changes

To test alternative balance formulas:

1. Open `combat-simulator.js`
2. Find the `deriveCombatStats()` function
3. Modify the formulas
4. Run the simulation
5. Compare results

Example - testing higher defense scaling:
```javascript
// Original
defense: 5 + Math.floor(clampedLevel / 3),

// Test: Match attack bonus growth
defense: 5 + Math.floor(clampedLevel / 2),
```

### Current Balance Issues (V1)

The simulator identified these problems:

| Issue | Data | Root Cause |
|-------|------|------------|
| Miss rate → 0% at level 26+ | Every high-level scenario | Attack bonus outpaces defense |
| Level +5 = unwinnable | 0% win rate across all tests | HP/damage gap too large |
| 1v2 = impossible | 0% even at equal levels | Action economy imbalance |

### Interpreting Results for Design

**If miss rate is too low:**
- Increase defense scaling
- Cap attack bonus
- Add minimum miss chance (nat 1-2 always miss)

**If combats are too fast:**
- Increase HP scaling
- Decrease damage scaling
- Add damage reduction mechanics

**If level disparity is too punishing:**
- Flatten HP/damage curves
- Add comeback mechanics (crits, desperation)
- Increase armor effectiveness

**If outnumbered scenarios are impossible:**
- Add AOE abilities
- Reduce enemy damage
- Add crowd control effects

### Integration with Combat Engine

The simulator mirrors the actual combat engine formulas. When you change `types/combat.ts`:

```typescript
// In frontend/src/types/combat.ts
export function deriveCombatStats(level: number): CombatStats {
  const hp = 20 + (level * 5);  // Change this formula
  // ...
}
```

Also update `combat-simulator.js`:
```javascript
// In tools/combat-simulator.js
function deriveCombatStats(level) {
  const hp = 20 + (level * 5);  // Keep in sync
  // ...
}
```

This duplication is intentional - the simulator is standalone and doesn't require the TypeScript build system.

### Performance

| Mode | Scenarios | Combats | Time |
|------|-----------|---------|------|
| quick | 8 | ~1,600 | <0.2s |
| full | 48 | ~14,400 | <0.5s |
| custom | varies | varies | varies |

The simulator can run 50,000+ combats per second on modern hardware.
