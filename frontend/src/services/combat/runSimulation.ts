#!/usr/bin/env npx ts-node
// Combat Balance Simulator Runner
// Usage: npx ts-node src/services/combat/runSimulation.ts [quick|full|custom]

import {
  runQuickSimulation,
  runFullSimulation,
  runCustomSimulation,
} from './combatSimulator';

// Custom scenarios for specific testing
const customScenarios = [
  // Test the high-level miss rate issue
  { playerLevel: 30, allyLevels: [], enemyLevels: [30], iterations: 500 },
  { playerLevel: 40, allyLevels: [], enemyLevels: [40], iterations: 500 },
  { playerLevel: 50, allyLevels: [], enemyLevels: [50], iterations: 500 },
  { playerLevel: 60, allyLevels: [], enemyLevels: [60], iterations: 500 },

  // Test armor relevance
  { playerLevel: 15, allyLevels: [], enemyLevels: [15], iterations: 500 },
  { playerLevel: 30, allyLevels: [], enemyLevels: [30], iterations: 500 },
  { playerLevel: 45, allyLevels: [], enemyLevels: [45], iterations: 500 },

  // Test level disparity
  { playerLevel: 10, allyLevels: [], enemyLevels: [15], iterations: 500 },
  { playerLevel: 10, allyLevels: [], enemyLevels: [20], iterations: 500 },
  { playerLevel: 10, allyLevels: [], enemyLevels: [25], iterations: 500 },

  // Boss fight simulation (1 vs high level)
  { playerLevel: 20, allyLevels: [], enemyLevels: [35], iterations: 500 },
  { playerLevel: 20, allyLevels: [20], enemyLevels: [35], iterations: 500 },
];

function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'quick';

  console.log(`\n🎮 CardShark Combat Simulator\n`);
  console.log(`Mode: ${mode}`);
  console.log('─'.repeat(50));

  let report;
  const startTime = Date.now();

  switch (mode) {
    case 'quick':
      console.log('Running quick test (8 scenarios, ~800 combats)...\n');
      report = runQuickSimulation();
      break;

    case 'full':
      console.log('Running full balance sweep (60+ scenarios, ~30,000 combats)...\n');
      report = runFullSimulation();
      break;

    case 'custom':
      console.log(`Running custom scenarios (${customScenarios.length} scenarios)...\n`);
      report = runCustomSimulation(customScenarios);
      break;

    default:
      console.log('Usage: npx ts-node runSimulation.ts [quick|full|custom]');
      console.log('');
      console.log('  quick  - Fast test with key scenarios (default)');
      console.log('  full   - Comprehensive balance sweep');
      console.log('  custom - Run custom scenarios defined in this file');
      process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompleted in ${elapsed}s`);

  // Print formatted report
  printReport(report);
}

function printReport(report: ReturnType<typeof runQuickSimulation>) {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║              CARDSHARK COMBAT BALANCE SIMULATION                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Summary
  console.log('📊 SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total combats simulated: ${report.summary.totalCombats.toLocaleString()}`);
  console.log(`Overall win rate: ${(report.summary.overallWinRate * 100).toFixed(1)}%`);
  console.log(`Average turns per combat: ${report.summary.avgTurnsPerCombat.toFixed(1)}`);
  console.log(`Miss rate range: ${(report.summary.missRateRange.min * 100).toFixed(1)}% - ${(report.summary.missRateRange.max * 100).toFixed(1)}%`);
  console.log('');

  // Warnings
  if (report.warnings.length > 0) {
    console.log('⚠️  BALANCE WARNINGS');
    console.log('─'.repeat(70));
    for (const warning of report.warnings) {
      console.log(warning);
    }
    console.log('');
  } else {
    console.log('✅ No major balance warnings detected');
    console.log('');
  }

  // Detailed results table
  console.log('📋 DETAILED RESULTS');
  console.log('─'.repeat(70));
  console.log(
    'Scenario'.padEnd(35) +
    'Win%'.padStart(8) +
    'Turns'.padStart(8) +
    'HP%'.padStart(8) +
    'Miss%'.padStart(8)
  );
  console.log('─'.repeat(70));

  for (const scenario of report.scenarios) {
    const desc = describeScenario(scenario.config).substring(0, 34).padEnd(35);
    const win = `${(scenario.winRate * 100).toFixed(0)}%`.padStart(8);
    const turns = scenario.avgTurns.toFixed(1).padStart(8);
    const hp = `${scenario.avgPlayerHpPercent.toFixed(0)}%`.padStart(8);
    const miss = `${(scenario.playerMissRate * 100).toFixed(0)}%`.padStart(8);
    console.log(`${desc}${win}${turns}${hp}${miss}`);
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('Legend: Win% = player win rate, Turns = avg combat length,');
  console.log('        HP% = avg player HP remaining (wins only), Miss% = player miss rate');
  console.log('');

  // Recommendations
  printRecommendations(report);
}

function describeScenario(config: { playerLevel: number; allyLevels: number[]; enemyLevels: number[] }): string {
  const playerSide = config.allyLevels.length > 0
    ? `P(${config.playerLevel})+${config.allyLevels.length}A`
    : `Player(${config.playerLevel})`;

  const enemySide = config.enemyLevels.length === 1
    ? `Enemy(${config.enemyLevels[0]})`
    : `${config.enemyLevels.length}x E(${config.enemyLevels[0]})`;

  return `${playerSide} vs ${enemySide}`;
}

function printRecommendations(report: ReturnType<typeof runQuickSimulation>) {
  console.log('💡 RECOMMENDATIONS');
  console.log('─'.repeat(70));

  const issues: string[] = [];

  // Check for miss rate issues
  if (report.summary.missRateRange.min < 0.05) {
    issues.push('• Miss rate too low at high levels. Consider:');
    issues.push('  - Cap attack bonus at a lower value');
    issues.push('  - Scale defense faster: defense = 8 + floor(level / 2)');
    issues.push('  - Add a minimum miss chance (e.g., always miss on nat 1-2)');
  }

  // Check for TTK issues
  const avgTurns = report.summary.avgTurnsPerCombat;
  if (avgTurns < 3) {
    issues.push('• Combat resolves too quickly. Consider:');
    issues.push('  - Increase base HP');
    issues.push('  - Reduce damage scaling');
  }
  if (avgTurns > 15) {
    issues.push('• Combat takes too long. Consider:');
    issues.push('  - Reduce HP scaling');
    issues.push('  - Increase damage scaling');
  }

  // Check for armor issues
  const highLevelScenarios = report.scenarios.filter(s => s.config.playerLevel >= 30);
  const avgArmorMitigation = highLevelScenarios.reduce((sum, s) => sum + s.avgArmorMitigation, 0) / (highLevelScenarios.length || 1);
  if (avgArmorMitigation < 5) {
    issues.push('• Armor becomes irrelevant at high levels. Consider:');
    issues.push('  - Increase armor scaling: armor = floor(level / 10)');
    issues.push('  - Add percentage-based damage reduction');
  }

  if (issues.length === 0) {
    console.log('No specific recommendations at this time.');
    console.log('Run the full simulation for more comprehensive analysis.');
  } else {
    for (const issue of issues) {
      console.log(issue);
    }
  }

  console.log('');
}

// Run
main();
