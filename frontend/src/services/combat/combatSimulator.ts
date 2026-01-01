// frontend/src/services/combat/combatSimulator.ts
// Monte Carlo combat simulator for balance testing
// Run with: npx ts-node --esm src/services/combat/combatSimulator.ts

import {
  CombatState,
  CombatInitData,
  Combatant,
  deriveCombatStats,
} from '../../types/combat';
import {
  initializeCombat,
  combatReducer,
  getCurrentActor,
  getValidAttackTargets,
} from './combatEngine';
import { getEnemyAction } from './enemyAI';

// =============================================================================
// Simulation Types
// =============================================================================

interface CombatResult {
  playerWon: boolean;
  turnsToResolve: number;
  playerHpRemaining: number;
  playerHpPercent: number;
  totalPlayerDamageDealt: number;
  totalEnemyDamageDealt: number;
  playerMisses: number;
  enemyMisses: number;
  playerHits: number;
  enemyHits: number;
  armorMitigatedDamage: number;
  crushingHits: number;
  marginalHits: number;
}

interface ScenarioConfig {
  playerLevel: number;
  allyLevels: number[];
  enemyLevels: number[];
  iterations: number;
}

interface ScenarioStats {
  config: ScenarioConfig;
  winRate: number;
  avgTurns: number;
  avgPlayerHpRemaining: number;
  avgPlayerHpPercent: number;
  playerMissRate: number;
  enemyMissRate: number;
  avgArmorMitigation: number;
  crushingHitRate: number;
  results: CombatResult[];
}

interface SimulationReport {
  scenarios: ScenarioStats[];
  warnings: string[];
  summary: {
    totalCombats: number;
    overallWinRate: number;
    avgTurnsPerCombat: number;
    levelWherePlayerAlwaysWins: number | null;
    levelWherePlayerAlwaysLoses: number | null;
    missRateRange: { min: number; max: number };
  };
}

// =============================================================================
// Simulation Engine
// =============================================================================

/**
 * Run a single combat to completion and collect stats.
 */
function simulateSingleCombat(config: ScenarioConfig): CombatResult {
  // Build init data
  const initData: CombatInitData = {
    playerData: {
      id: 'player',
      name: 'Player',
      level: config.playerLevel,
      imagePath: null,
    },
    allies: config.allyLevels.map((level, i) => ({
      id: `ally-${i}`,
      name: `Ally ${i + 1}`,
      level,
      imagePath: null,
    })),
    enemies: config.enemyLevels.map((level, i) => ({
      id: `enemy-${i}`,
      name: `Enemy ${i + 1}`,
      level,
      imagePath: null,
    })),
    roomImagePath: null,
    roomName: 'Test Arena',
    playerAdvantage: true,
  };

  let state = initializeCombat(initData);

  // Track stats
  let playerDamageDealt = 0;
  let enemyDamageDealt = 0;
  let playerMisses = 0;
  let enemyMisses = 0;
  let playerHits = 0;
  let enemyHits = 0;
  let armorMitigated = 0;
  let crushingHits = 0;
  let marginalHits = 0;

  const maxTurns = 100; // Safety limit

  // Run combat
  while (state.phase !== 'victory' && state.phase !== 'defeat' && state.turn < maxTurns) {
    const actor = getCurrentActor(state);
    if (!actor) break;

    let action;
    if (actor.isPlayerControlled) {
      // Simple AI for player side: attack lowest HP enemy
      const targets = getValidAttackTargets(state, actor.id);
      if (targets.length > 0) {
        const target = targets.sort((a, b) => a.currentHp - b.currentHp)[0];
        action = { type: 'attack' as const, actorId: actor.id, targetId: target.id };
      } else {
        action = { type: 'defend' as const, actorId: actor.id };
      }
    } else {
      // Enemy AI
      action = getEnemyAction(state);
    }

    if (!action) break;

    // Get pre-action state for comparison
    const preActionState = state;

    // Execute action
    const result = combatReducer(state, action);
    state = result.state;

    // Analyze attack results from log
    const newLogEntries = state.log.slice(preActionState.log.length);
    for (const entry of newLogEntries) {
      if (entry.actionType === 'attack') {
        const isPlayerAttack = preActionState.combatants[entry.actorId]?.isPlayerControlled;

        if (entry.result.hit) {
          if (isPlayerAttack) {
            playerHits++;
            playerDamageDealt += entry.result.damage || 0;
          } else {
            enemyHits++;
            enemyDamageDealt += entry.result.damage || 0;
          }

          // Track hit quality
          if (entry.result.hitQuality === 'crushing') crushingHits++;
          if (entry.result.hitQuality === 'marginal') marginalHits++;
          if (entry.result.hitQuality === 'armor_soak') {
            // Estimate armor mitigation (raw damage - final damage)
            const attacker = preActionState.combatants[entry.actorId];
            if (attacker) {
              armorMitigated += attacker.damage - (entry.result.damage || 0);
            }
          }
        } else {
          if (isPlayerAttack) playerMisses++;
          else enemyMisses++;
        }
      }
    }
  }

  // Find player in final state
  const player = Object.values(state.combatants).find(c => c.isPlayer);
  const playerStats = deriveCombatStats(config.playerLevel);

  return {
    playerWon: state.phase === 'victory',
    turnsToResolve: state.turn,
    playerHpRemaining: player?.currentHp || 0,
    playerHpPercent: player ? (player.currentHp / playerStats.maxHp) * 100 : 0,
    totalPlayerDamageDealt: playerDamageDealt,
    totalEnemyDamageDealt: enemyDamageDealt,
    playerMisses,
    enemyMisses,
    playerHits,
    enemyHits,
    armorMitigatedDamage: armorMitigated,
    crushingHits,
    marginalHits,
  };
}

/**
 * Run multiple iterations of a scenario and aggregate stats.
 */
function simulateScenario(config: ScenarioConfig): ScenarioStats {
  const results: CombatResult[] = [];

  for (let i = 0; i < config.iterations; i++) {
    results.push(simulateSingleCombat(config));
  }

  const wins = results.filter(r => r.playerWon).length;
  const totalPlayerAttacks = results.reduce((sum, r) => sum + r.playerHits + r.playerMisses, 0);
  const totalEnemyAttacks = results.reduce((sum, r) => sum + r.enemyHits + r.enemyMisses, 0);

  return {
    config,
    winRate: wins / results.length,
    avgTurns: results.reduce((sum, r) => sum + r.turnsToResolve, 0) / results.length,
    avgPlayerHpRemaining: results.reduce((sum, r) => sum + r.playerHpRemaining, 0) / results.length,
    avgPlayerHpPercent: results.reduce((sum, r) => sum + r.playerHpPercent, 0) / results.length,
    playerMissRate: totalPlayerAttacks > 0
      ? results.reduce((sum, r) => sum + r.playerMisses, 0) / totalPlayerAttacks
      : 0,
    enemyMissRate: totalEnemyAttacks > 0
      ? results.reduce((sum, r) => sum + r.enemyMisses, 0) / totalEnemyAttacks
      : 0,
    avgArmorMitigation: results.reduce((sum, r) => sum + r.armorMitigatedDamage, 0) / results.length,
    crushingHitRate: totalPlayerAttacks > 0
      ? results.reduce((sum, r) => sum + r.crushingHits, 0) / totalPlayerAttacks
      : 0,
    results,
  };
}

// =============================================================================
// Simulation Presets
// =============================================================================

/**
 * Generate scenarios for a full balance sweep.
 */
function generateBalanceSweepScenarios(): ScenarioConfig[] {
  const scenarios: ScenarioConfig[] = [];
  const iterations = 500; // Per scenario

  // 1v1 at various levels
  for (let level = 1; level <= 60; level += 5) {
    scenarios.push({
      playerLevel: level,
      allyLevels: [],
      enemyLevels: [level],
      iterations,
    });
  }

  // Player vs higher level enemy (level disparity)
  for (let playerLevel = 5; playerLevel <= 30; playerLevel += 5) {
    for (let delta = 5; delta <= 20; delta += 5) {
      scenarios.push({
        playerLevel,
        allyLevels: [],
        enemyLevels: [playerLevel + delta],
        iterations,
      });
    }
  }

  // Player vs lower level enemy
  for (let playerLevel = 20; playerLevel <= 60; playerLevel += 10) {
    for (let delta = 5; delta <= 15; delta += 5) {
      scenarios.push({
        playerLevel,
        allyLevels: [],
        enemyLevels: [Math.max(1, playerLevel - delta)],
        iterations,
      });
    }
  }

  // Outnumbered scenarios (1 vs many)
  for (let level = 5; level <= 30; level += 10) {
    for (let enemyCount = 2; enemyCount <= 5; enemyCount++) {
      scenarios.push({
        playerLevel: level,
        allyLevels: [],
        enemyLevels: Array(enemyCount).fill(level),
        iterations,
      });
    }
  }

  // Party vs enemies (2v2, 2v3, etc.)
  for (let level = 10; level <= 30; level += 10) {
    scenarios.push({
      playerLevel: level,
      allyLevels: [level],
      enemyLevels: [level, level],
      iterations,
    });
    scenarios.push({
      playerLevel: level,
      allyLevels: [level],
      enemyLevels: [level, level, level],
      iterations,
    });
  }

  return scenarios;
}

/**
 * Quick test scenarios for rapid iteration.
 */
function generateQuickTestScenarios(): ScenarioConfig[] {
  return [
    // Basic 1v1 at key levels
    { playerLevel: 1, allyLevels: [], enemyLevels: [1], iterations: 100 },
    { playerLevel: 10, allyLevels: [], enemyLevels: [10], iterations: 100 },
    { playerLevel: 30, allyLevels: [], enemyLevels: [30], iterations: 100 },
    { playerLevel: 60, allyLevels: [], enemyLevels: [60], iterations: 100 },

    // Level disparity
    { playerLevel: 10, allyLevels: [], enemyLevels: [15], iterations: 100 },
    { playerLevel: 10, allyLevels: [], enemyLevels: [20], iterations: 100 },

    // Outnumbered
    { playerLevel: 10, allyLevels: [], enemyLevels: [10, 10], iterations: 100 },
    { playerLevel: 10, allyLevels: [], enemyLevels: [10, 10, 10], iterations: 100 },
  ];
}

// =============================================================================
// Report Generation
// =============================================================================

function analyzeResults(scenarios: ScenarioStats[]): SimulationReport {
  const warnings: string[] = [];

  // Find problematic scenarios
  for (const scenario of scenarios) {
    const desc = describeScenario(scenario.config);

    // Win rate warnings
    if (scenario.winRate > 0.95 && scenario.config.enemyLevels[0] >= scenario.config.playerLevel) {
      warnings.push(`🔴 ${desc}: Win rate too high (${(scenario.winRate * 100).toFixed(1)}%) - combat may be too easy`);
    }
    if (scenario.winRate < 0.05 && scenario.config.enemyLevels[0] <= scenario.config.playerLevel) {
      warnings.push(`🔴 ${desc}: Win rate too low (${(scenario.winRate * 100).toFixed(1)}%) - combat may be too hard`);
    }

    // Miss rate warnings
    if (scenario.playerMissRate < 0.05 && scenario.config.playerLevel >= 20) {
      warnings.push(`🟡 ${desc}: Player miss rate only ${(scenario.playerMissRate * 100).toFixed(1)}% - no tension from missing`);
    }
    if (scenario.playerMissRate > 0.5) {
      warnings.push(`🟡 ${desc}: Player miss rate ${(scenario.playerMissRate * 100).toFixed(1)}% - too frustrating`);
    }

    // TTK warnings
    if (scenario.avgTurns < 2) {
      warnings.push(`🟡 ${desc}: Avg ${scenario.avgTurns.toFixed(1)} turns - combat too fast`);
    }
    if (scenario.avgTurns > 20) {
      warnings.push(`🟡 ${desc}: Avg ${scenario.avgTurns.toFixed(1)} turns - combat too slow`);
    }
  }

  // Find level thresholds
  const equalLevelScenarios = scenarios.filter(s =>
    s.config.allyLevels.length === 0 &&
    s.config.enemyLevels.length === 1 &&
    s.config.enemyLevels[0] === s.config.playerLevel
  );

  let levelWherePlayerAlwaysWins: number | null = null;
  let levelWherePlayerAlwaysLoses: number | null = null;

  for (const s of equalLevelScenarios.sort((a, b) => a.config.playerLevel - b.config.playerLevel)) {
    if (s.winRate >= 0.99 && levelWherePlayerAlwaysWins === null) {
      levelWherePlayerAlwaysWins = s.config.playerLevel;
    }
    if (s.winRate <= 0.01 && levelWherePlayerAlwaysLoses === null) {
      levelWherePlayerAlwaysLoses = s.config.playerLevel;
    }
  }

  // Miss rate range
  const missRates = scenarios.map(s => s.playerMissRate).filter(r => r > 0);
  const missRateRange = {
    min: Math.min(...missRates) || 0,
    max: Math.max(...missRates) || 0,
  };

  return {
    scenarios,
    warnings,
    summary: {
      totalCombats: scenarios.reduce((sum, s) => sum + s.config.iterations, 0),
      overallWinRate: scenarios.reduce((sum, s) => sum + s.winRate * s.config.iterations, 0) /
        scenarios.reduce((sum, s) => sum + s.config.iterations, 0),
      avgTurnsPerCombat: scenarios.reduce((sum, s) => sum + s.avgTurns * s.config.iterations, 0) /
        scenarios.reduce((sum, s) => sum + s.config.iterations, 0),
      levelWherePlayerAlwaysWins,
      levelWherePlayerAlwaysLoses,
      missRateRange,
    },
  };
}

function describeScenario(config: ScenarioConfig): string {
  const playerSide = config.allyLevels.length > 0
    ? `Player(${config.playerLevel}) + ${config.allyLevels.length} allies`
    : `Player(${config.playerLevel})`;

  const enemySide = config.enemyLevels.length === 1
    ? `Enemy(${config.enemyLevels[0]})`
    : `${config.enemyLevels.length}x Enemy(${config.enemyLevels[0]})`;

  return `${playerSide} vs ${enemySide}`;
}

function formatReport(report: SimulationReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔════════════════════════════════════════════════════════════════════╗');
  lines.push('║              CARDSHARK COMBAT BALANCE SIMULATION                   ║');
  lines.push('╚════════════════════════════════════════════════════════════════════╝');
  lines.push('');

  // Summary
  lines.push('📊 SUMMARY');
  lines.push('─'.repeat(70));
  lines.push(`Total combats simulated: ${report.summary.totalCombats.toLocaleString()}`);
  lines.push(`Overall win rate: ${(report.summary.overallWinRate * 100).toFixed(1)}%`);
  lines.push(`Average turns per combat: ${report.summary.avgTurnsPerCombat.toFixed(1)}`);
  lines.push(`Miss rate range: ${(report.summary.missRateRange.min * 100).toFixed(1)}% - ${(report.summary.missRateRange.max * 100).toFixed(1)}%`);
  lines.push('');

  // Warnings
  if (report.warnings.length > 0) {
    lines.push('⚠️  BALANCE WARNINGS');
    lines.push('─'.repeat(70));
    for (const warning of report.warnings) {
      lines.push(warning);
    }
    lines.push('');
  }

  // Detailed results table
  lines.push('📋 DETAILED RESULTS');
  lines.push('─'.repeat(70));
  lines.push(
    'Scenario'.padEnd(35) +
    'Win%'.padStart(8) +
    'Turns'.padStart(8) +
    'HP%'.padStart(8) +
    'Miss%'.padStart(8)
  );
  lines.push('─'.repeat(70));

  for (const scenario of report.scenarios) {
    const desc = describeScenario(scenario.config).padEnd(35);
    const win = `${(scenario.winRate * 100).toFixed(0)}%`.padStart(8);
    const turns = scenario.avgTurns.toFixed(1).padStart(8);
    const hp = `${scenario.avgPlayerHpPercent.toFixed(0)}%`.padStart(8);
    const miss = `${(scenario.playerMissRate * 100).toFixed(0)}%`.padStart(8);
    lines.push(`${desc}${win}${turns}${hp}${miss}`);
  }

  lines.push('');
  lines.push('─'.repeat(70));
  lines.push('Legend: Win% = player win rate, Turns = avg combat length,');
  lines.push('        HP% = avg player HP remaining (wins only), Miss% = player miss rate');
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// Main Entry Point
// =============================================================================

export function runQuickSimulation(): SimulationReport {
  console.log('Running quick simulation...');
  const scenarios = generateQuickTestScenarios();
  const results = scenarios.map(config => simulateScenario(config));
  return analyzeResults(results);
}

export function runFullSimulation(): SimulationReport {
  console.log('Running full balance sweep (this may take a minute)...');
  const scenarios = generateBalanceSweepScenarios();
  const results = scenarios.map((config, i) => {
    if (i % 10 === 0) {
      console.log(`  Progress: ${i}/${scenarios.length} scenarios...`);
    }
    return simulateScenario(config);
  });
  return analyzeResults(results);
}

export function runCustomSimulation(configs: ScenarioConfig[]): SimulationReport {
  const results = configs.map(config => simulateScenario(config));
  return analyzeResults(results);
}

// CLI entry point
if (typeof process !== 'undefined' && process.argv) {
  const args = process.argv.slice(2);
  const mode = args[0] || 'quick';

  let report: SimulationReport;

  if (mode === 'full') {
    report = runFullSimulation();
  } else if (mode === 'quick') {
    report = runQuickSimulation();
  } else {
    console.log('Usage: npx ts-node combatSimulator.ts [quick|full]');
    process.exit(1);
  }

  console.log(formatReport(report));
}
