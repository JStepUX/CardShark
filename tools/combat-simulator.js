#!/usr/bin/env node
/**
 * CardShark Combat Balance Simulator
 *
 * A Monte Carlo simulation tool for testing combat balance.
 * Runs thousands of combats and identifies potential issues.
 *
 * Usage:
 *   node tools/combat-simulator.js [quick|full|custom]
 *
 * Examples:
 *   node tools/combat-simulator.js quick   # Fast test (~800 combats)
 *   node tools/combat-simulator.js full    # Full sweep (~30,000 combats)
 *   node tools/combat-simulator.js custom  # Custom scenarios
 */

// =============================================================================
// Combat Stats (mirrors frontend/src/types/combat.ts)
// =============================================================================

function deriveCombatStats(level) {
  const clampedLevel = Math.max(1, Math.min(60, level));
  const hp = 20 + (clampedLevel * 5);

  return {
    hp,
    maxHp: hp,
    damage: 2 + Math.floor(clampedLevel / 2),
    defense: 5 + Math.floor(clampedLevel / 3),
    speed: 3 + Math.floor(clampedLevel / 10),
    armor: Math.floor(clampedLevel / 15),
    weaponType: 'melee',
  };
}

function calculateHitQuality(attackRoll, targetDefense, rawDamage, finalDamage) {
  const margin = attackRoll - targetDefense;
  if (margin < 0) return 'miss';
  if (rawDamage > 2 && finalDamage <= 1) return 'armor_soak';
  if (margin >= 8) return 'crushing';
  if (margin >= 3) return 'solid';
  return 'marginal';
}

// =============================================================================
// Dice Rolling
// =============================================================================

function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function rollD6() {
  return Math.floor(Math.random() * 6) + 1;
}

// =============================================================================
// Combatant Creation
// =============================================================================

function createCombatant(id, name, level, isPlayerControlled, isPlayer, slotPosition) {
  const stats = deriveCombatStats(level);
  return {
    id,
    name,
    level,
    isPlayerControlled,
    isPlayer,
    currentHp: stats.maxHp,
    maxHp: stats.maxHp,
    damage: stats.damage,
    defense: stats.defense,
    speed: stats.speed,
    armor: stats.armor,
    slotPosition,
    apRemaining: 2,
    isDefending: false,
    isOverwatching: false,
    isKnockedOut: false,
  };
}

// =============================================================================
// Combat Simulation
// =============================================================================

function simulateCombat(playerLevel, allyLevels, enemyLevels) {
  // Create combatants
  const combatants = {};
  const allySlots = [null, null, null, null, null];
  const enemySlots = [null, null, null, null, null];

  // Player in center
  const player = createCombatant('player', 'Player', playerLevel, true, true, 2);
  combatants['player'] = player;
  allySlots[2] = 'player';

  // Allies around player
  const allyPositions = [1, 3, 0, 4];
  allyLevels.forEach((level, i) => {
    if (i < allyPositions.length) {
      const id = `ally-${i}`;
      const ally = createCombatant(id, `Ally ${i + 1}`, level, true, false, allyPositions[i]);
      combatants[id] = ally;
      allySlots[allyPositions[i]] = id;
    }
  });

  // Enemies centered
  const enemyPositions = [2, 1, 3, 0, 4];
  enemyLevels.forEach((level, i) => {
    if (i < enemyPositions.length) {
      const id = `enemy-${i}`;
      const enemy = createCombatant(id, `Enemy ${i + 1}`, level, false, false, enemyPositions[i]);
      combatants[id] = enemy;
      enemySlots[enemyPositions[i]] = id;
    }
  });

  // Calculate initiative
  const initiativeOrder = Object.values(combatants)
    .map(c => ({ id: c.id, initiative: c.speed + rollD6(), speed: c.speed }))
    .sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      if (b.speed !== a.speed) return b.speed - a.speed;
      return combatants[b.id].isPlayerControlled ? -1 : 1;
    })
    .map(x => x.id);

  // Combat stats
  const stats = {
    playerDamageDealt: 0,
    enemyDamageDealt: 0,
    playerMisses: 0,
    enemyMisses: 0,
    playerHits: 0,
    enemyHits: 0,
    armorMitigated: 0,
    crushingHits: 0,
    marginalHits: 0,
  };

  // Combat loop
  let turn = 0;
  const maxTurns = 100;
  let currentIndex = 0;

  while (turn < maxTurns) {
    // Check win conditions
    const alliesAlive = Object.values(combatants).filter(c => c.isPlayerControlled && !c.isKnockedOut);
    const enemiesAlive = Object.values(combatants).filter(c => !c.isPlayerControlled && !c.isKnockedOut);

    if (enemiesAlive.length === 0) {
      // Victory
      return {
        playerWon: true,
        turnsToResolve: turn,
        playerHpRemaining: combatants['player'].currentHp,
        playerHpPercent: (combatants['player'].currentHp / combatants['player'].maxHp) * 100,
        ...stats,
      };
    }

    if (alliesAlive.length === 0) {
      // Defeat
      return {
        playerWon: false,
        turnsToResolve: turn,
        playerHpRemaining: 0,
        playerHpPercent: 0,
        ...stats,
      };
    }

    // Get current actor
    const actorId = initiativeOrder[currentIndex];
    const actor = combatants[actorId];

    if (actor && !actor.isKnockedOut) {
      // Reset turn state
      actor.apRemaining = 2;
      actor.isDefending = false;

      // Choose target (simple AI: attack lowest HP enemy)
      const targets = Object.values(combatants).filter(
        c => c.isPlayerControlled !== actor.isPlayerControlled && !c.isKnockedOut
      );

      if (targets.length > 0) {
        const target = targets.sort((a, b) => a.currentHp - b.currentHp)[0];

        // Attack roll
        const attackBonus = Math.floor(actor.level / 2);
        const attackRoll = rollD20() + attackBonus;
        const targetDefense = target.defense + (target.isDefending ? 2 : 0);
        const hit = attackRoll >= targetDefense;

        if (hit) {
          const rawDamage = actor.damage;
          const finalDamage = Math.max(1, rawDamage - target.armor);
          const hitQuality = calculateHitQuality(attackRoll, targetDefense, rawDamage, finalDamage);

          target.currentHp = Math.max(0, target.currentHp - finalDamage);
          if (target.currentHp === 0) {
            target.isKnockedOut = true;
          }

          if (actor.isPlayerControlled) {
            stats.playerHits++;
            stats.playerDamageDealt += finalDamage;
          } else {
            stats.enemyHits++;
            stats.enemyDamageDealt += finalDamage;
          }

          if (hitQuality === 'crushing') stats.crushingHits++;
          if (hitQuality === 'marginal') stats.marginalHits++;
          if (hitQuality === 'armor_soak') {
            stats.armorMitigated += rawDamage - finalDamage;
          }
        } else {
          if (actor.isPlayerControlled) stats.playerMisses++;
          else stats.enemyMisses++;
        }
      }
    }

    // Advance turn
    currentIndex++;
    if (currentIndex >= initiativeOrder.length) {
      currentIndex = 0;
      turn++;
    }
  }

  // Timeout - treat as loss
  return {
    playerWon: false,
    turnsToResolve: maxTurns,
    playerHpRemaining: combatants['player'].currentHp,
    playerHpPercent: (combatants['player'].currentHp / combatants['player'].maxHp) * 100,
    ...stats,
  };
}

// =============================================================================
// Scenario Running
// =============================================================================

function runScenario(config) {
  const results = [];

  for (let i = 0; i < config.iterations; i++) {
    results.push(simulateCombat(config.playerLevel, config.allyLevels, config.enemyLevels));
  }

  const wins = results.filter(r => r.playerWon).length;
  const totalPlayerAttacks = results.reduce((sum, r) => sum + r.playerHits + r.playerMisses, 0);
  const totalEnemyAttacks = results.reduce((sum, r) => sum + r.enemyHits + r.enemyMisses, 0);

  return {
    config,
    winRate: wins / results.length,
    avgTurns: results.reduce((sum, r) => sum + r.turnsToResolve, 0) / results.length,
    avgPlayerHpRemaining: results.reduce((sum, r) => sum + r.playerHpRemaining, 0) / results.length,
    avgPlayerHpPercent: results.filter(r => r.playerWon).length > 0
      ? results.filter(r => r.playerWon).reduce((sum, r) => sum + r.playerHpPercent, 0) / results.filter(r => r.playerWon).length
      : 0,
    playerMissRate: totalPlayerAttacks > 0
      ? results.reduce((sum, r) => sum + r.playerMisses, 0) / totalPlayerAttacks
      : 0,
    enemyMissRate: totalEnemyAttacks > 0
      ? results.reduce((sum, r) => sum + r.enemyMisses, 0) / totalEnemyAttacks
      : 0,
    avgArmorMitigation: results.reduce((sum, r) => sum + r.armorMitigated, 0) / results.length,
    crushingHitRate: totalPlayerAttacks > 0
      ? results.reduce((sum, r) => sum + r.crushingHits, 0) / totalPlayerAttacks
      : 0,
  };
}

// =============================================================================
// Scenario Presets
// =============================================================================

function getQuickScenarios() {
  return [
    { playerLevel: 1, allyLevels: [], enemyLevels: [1], iterations: 200 },
    { playerLevel: 10, allyLevels: [], enemyLevels: [10], iterations: 200 },
    { playerLevel: 30, allyLevels: [], enemyLevels: [30], iterations: 200 },
    { playerLevel: 60, allyLevels: [], enemyLevels: [60], iterations: 200 },
    { playerLevel: 10, allyLevels: [], enemyLevels: [15], iterations: 200 },
    { playerLevel: 10, allyLevels: [], enemyLevels: [20], iterations: 200 },
    { playerLevel: 10, allyLevels: [], enemyLevels: [10, 10], iterations: 200 },
    { playerLevel: 10, allyLevels: [], enemyLevels: [10, 10, 10], iterations: 200 },
  ];
}

function getFullScenarios() {
  const scenarios = [];
  const iterations = 300;

  // 1v1 at various levels
  for (let level = 1; level <= 60; level += 5) {
    scenarios.push({ playerLevel: level, allyLevels: [], enemyLevels: [level], iterations });
  }

  // Level disparity
  for (let playerLevel = 5; playerLevel <= 30; playerLevel += 5) {
    for (let delta = 5; delta <= 20; delta += 5) {
      scenarios.push({ playerLevel, allyLevels: [], enemyLevels: [playerLevel + delta], iterations });
    }
  }

  // Outnumbered
  for (let level = 5; level <= 30; level += 10) {
    for (let count = 2; count <= 4; count++) {
      scenarios.push({ playerLevel: level, allyLevels: [], enemyLevels: Array(count).fill(level), iterations });
    }
  }

  // Party vs enemies
  for (let level = 10; level <= 30; level += 10) {
    scenarios.push({ playerLevel: level, allyLevels: [level], enemyLevels: [level, level], iterations });
  }

  return scenarios;
}

function getCustomScenarios() {
  return [
    // High level miss rate test
    { playerLevel: 30, allyLevels: [], enemyLevels: [30], iterations: 500 },
    { playerLevel: 40, allyLevels: [], enemyLevels: [40], iterations: 500 },
    { playerLevel: 50, allyLevels: [], enemyLevels: [50], iterations: 500 },
    { playerLevel: 60, allyLevels: [], enemyLevels: [60], iterations: 500 },

    // Boss fight simulation
    { playerLevel: 20, allyLevels: [], enemyLevels: [35], iterations: 500 },
    { playerLevel: 20, allyLevels: [20], enemyLevels: [35], iterations: 500 },
    { playerLevel: 20, allyLevels: [20, 20], enemyLevels: [35], iterations: 500 },
  ];
}

// =============================================================================
// Reporting
// =============================================================================

function describeScenario(config) {
  const playerSide = config.allyLevels.length > 0
    ? `P(${config.playerLevel})+${config.allyLevels.length}A`
    : `Player(${config.playerLevel})`;

  const enemySide = config.enemyLevels.length === 1
    ? `Enemy(${config.enemyLevels[0]})`
    : `${config.enemyLevels.length}x E(${config.enemyLevels[0]})`;

  return `${playerSide} vs ${enemySide}`;
}

function analyzeResults(results) {
  const warnings = [];

  for (const r of results) {
    const desc = describeScenario(r.config);

    // Win rate warnings
    if (r.winRate > 0.95 && r.config.enemyLevels[0] >= r.config.playerLevel) {
      warnings.push(`🔴 ${desc}: Win rate ${(r.winRate * 100).toFixed(0)}% - too easy`);
    }
    if (r.winRate < 0.05 && r.config.enemyLevels[0] <= r.config.playerLevel) {
      warnings.push(`🔴 ${desc}: Win rate ${(r.winRate * 100).toFixed(0)}% - too hard`);
    }

    // Miss rate warnings
    if (r.playerMissRate < 0.05 && r.config.playerLevel >= 20) {
      warnings.push(`🟡 ${desc}: Miss rate ${(r.playerMissRate * 100).toFixed(0)}% - no tension`);
    }

    // TTK warnings
    if (r.avgTurns < 2) {
      warnings.push(`🟡 ${desc}: ${r.avgTurns.toFixed(1)} turns avg - too fast`);
    }
    if (r.avgTurns > 20) {
      warnings.push(`🟡 ${desc}: ${r.avgTurns.toFixed(1)} turns avg - too slow`);
    }
  }

  const missRates = results.map(r => r.playerMissRate).filter(r => r > 0);

  return {
    totalCombats: results.reduce((sum, r) => sum + r.config.iterations, 0),
    overallWinRate: results.reduce((sum, r) => sum + r.winRate * r.config.iterations, 0) /
      results.reduce((sum, r) => sum + r.config.iterations, 0),
    avgTurns: results.reduce((sum, r) => sum + r.avgTurns * r.config.iterations, 0) /
      results.reduce((sum, r) => sum + r.config.iterations, 0),
    missRateRange: { min: Math.min(...missRates) || 0, max: Math.max(...missRates) || 0 },
    warnings,
  };
}

function printReport(results, analysis) {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║              CARDSHARK COMBAT BALANCE SIMULATION                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log('📊 SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total combats: ${analysis.totalCombats.toLocaleString()}`);
  console.log(`Overall win rate: ${(analysis.overallWinRate * 100).toFixed(1)}%`);
  console.log(`Avg turns: ${analysis.avgTurns.toFixed(1)}`);
  console.log(`Miss rate range: ${(analysis.missRateRange.min * 100).toFixed(0)}% - ${(analysis.missRateRange.max * 100).toFixed(0)}%`);
  console.log('');

  if (analysis.warnings.length > 0) {
    console.log('⚠️  BALANCE WARNINGS');
    console.log('─'.repeat(70));
    analysis.warnings.forEach(w => console.log(w));
    console.log('');
  }

  console.log('📋 DETAILED RESULTS');
  console.log('─'.repeat(70));
  console.log(
    'Scenario'.padEnd(30) +
    'Win%'.padStart(8) +
    'Turns'.padStart(8) +
    'HP%'.padStart(8) +
    'Miss%'.padStart(8)
  );
  console.log('─'.repeat(70));

  for (const r of results) {
    const desc = describeScenario(r.config).substring(0, 29).padEnd(30);
    const win = `${(r.winRate * 100).toFixed(0)}%`.padStart(8);
    const turns = r.avgTurns.toFixed(1).padStart(8);
    const hp = `${r.avgPlayerHpPercent.toFixed(0)}%`.padStart(8);
    const miss = `${(r.playerMissRate * 100).toFixed(0)}%`.padStart(8);
    console.log(`${desc}${win}${turns}${hp}${miss}`);
  }

  console.log('');
  console.log('Legend: HP% = avg HP remaining on wins, Miss% = player miss rate');
  console.log('');
}

// =============================================================================
// Main
// =============================================================================

function main() {
  const mode = process.argv[2] || 'quick';

  console.log(`\n🎮 CardShark Combat Simulator`);
  console.log(`Mode: ${mode}`);
  console.log('─'.repeat(50));

  let scenarios;
  switch (mode) {
    case 'quick':
      console.log('Running quick test...\n');
      scenarios = getQuickScenarios();
      break;
    case 'full':
      console.log('Running full sweep (this takes a minute)...\n');
      scenarios = getFullScenarios();
      break;
    case 'custom':
      console.log('Running custom scenarios...\n');
      scenarios = getCustomScenarios();
      break;
    default:
      console.log('Usage: node combat-simulator.js [quick|full|custom]');
      console.log('');
      console.log('  quick  - Fast test with key scenarios (default)');
      console.log('  full   - Comprehensive balance sweep');
      console.log('  custom - Boss fights and edge cases');
      process.exit(1);
  }

  const startTime = Date.now();
  const results = scenarios.map((config, i) => {
    if (i % 10 === 0 && scenarios.length > 20) {
      process.stdout.write(`  ${i}/${scenarios.length}...\r`);
    }
    return runScenario(config);
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompleted in ${elapsed}s`);

  const analysis = analyzeResults(results);
  printReport(results, analysis);
}

main();
