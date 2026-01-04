/**
 * Fairness Weight Tuning Test
 * 
 * Tests different combinations of fairness boost/penalty weights to find
 * the optimal balance between fairness and preference satisfaction.
 * 
 * Parameters tested:
 * - FAIRNESS_BOOST: Reward for assigning under-represented crew (z < 0)
 * - FAIRNESS_PENALTY: Penalty for assigning over-represented crew (z > 0)
 * 
 * Metrics measured:
 * - Gini coefficient (lower = more fair)
 * - Objective value (higher = better preferences)
 * - Preference satisfaction rate
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STORE_ID = 768;
const TEST_DATES = ['2025-11-25', '2025-12-13', '2025-12-15', '2025-12-16'];
const TRACKED_ROLE_IDS = [29, 37, 38]; // Parking Helms, Wine Demo, Food Demo
const API_URL = 'http://localhost:4000';

// Weight configurations to test
// Format: [boost, penalty]
const WEIGHT_CONFIGS = [
  [0, 0],       // Baseline - no fairness
  [200, 200],   // Previous best
  [300, 200],   // Higher boost
  [300, 300],   // Symmetric 300
  [400, 300],   // Higher boost
  [400, 400],   // Symmetric 400
  [500, 400],   // Higher boost  
  [500, 500],   // Symmetric 500
];

interface SolverResult {
  success: boolean;
  objectiveValue?: number;
  solveTimeMs: number;
}

interface FairnessMetrics {
  roleId: number;
  roleName: string;
  giniCoefficient: number;
}

interface SatisfactionMetrics {
  eligible: number;
  satisfied: number;
  satisfactionRate: number;
}

interface ConfigResult {
  boost: number;
  penalty: number;
  avgGini: number;
  avgObjective: number;
  avgSatisfactionRate: number;
  totalSolveTimeMs: number;
  roleGinis: Map<number, number>;
  success: boolean;
}

async function runSolver(
  date: string, 
  fairnessBoost: number, 
  fairnessPenalty: number
): Promise<SolverResult> {
  const startTime = Date.now();
  
  const response = await fetch(`${API_URL}/solver/v2/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID,
      date,
      saveLogbook: true,
      skipFairnessWeights: fairnessBoost === 0 && fairnessPenalty === 0,
      timeLimitSeconds: 60,
      settings: {
        fairnessBoost,
        fairnessPenalty,
      },
    }),
  });
  
  const solveTimeMs = Date.now() - startTime;
  const data = await response.json();
  
  // Python solver returns objectiveScore in metadata, not as top-level objectiveValue
  const objectiveValue = data.objectiveValue ?? data.metadata?.objectiveScore;
  
  return {
    success: data.success,
    objectiveValue,
    solveTimeMs,
  };
}

async function getRoleNames(): Promise<Map<number, string>> {
  const roles = await prisma.role.findMany({
    where: { id: { in: TRACKED_ROLE_IDS } },
    select: { id: true, displayName: true },
  });
  return new Map(roles.map(r => [r.id, r.displayName]));
}

async function getFairnessSnapshots(date: string): Promise<FairnessMetrics[]> {
  const roleNames = await getRoleNames();
  const snapshots = await prisma.roleFairnessSnapshot.findMany({
    where: {
      storeId: STORE_ID,
      date: new Date(date),
      roleId: { in: TRACKED_ROLE_IDS },
    },
  });
  
  return snapshots.map(s => ({
    roleId: s.roleId,
    roleName: roleNames.get(s.roleId) || 'Unknown',
    giniCoefficient: s.giniCoefficient,
  }));
}

async function getSatisfactionMetrics(date: string): Promise<SatisfactionMetrics | null> {
  // Get the logbook for this date
  const logbook = await prisma.logbook.findFirst({
    where: {
      storeId: STORE_ID,
      date: new Date(date),
    },
    select: { id: true },
  });
  
  if (!logbook) return null;
  
  // Get preference metadata
  const metadata = await prisma.logPreferenceMetadata.findUnique({
    where: { logbookId: logbook.id },
    select: { eligiblePreferences: true, preferencesMet: true, percentMet: true },
  });
  
  if (!metadata) return null;
  
  return {
    eligible: metadata.eligiblePreferences,
    satisfied: metadata.preferencesMet,
    satisfactionRate: metadata.percentMet,
  };
}

async function clearTestData(): Promise<void> {
  await prisma.crewRoleFairnessHistory.deleteMany({ where: { storeId: STORE_ID } });
  await prisma.roleFairnessSnapshot.deleteMany({ where: { storeId: STORE_ID } });
  
  const logbooks = await prisma.logbook.findMany({
    where: {
      storeId: STORE_ID,
      date: { in: TEST_DATES.map(d => new Date(d)) },
    },
    select: { id: true },
  });
  
  const logbookIds = logbooks.map(l => l.id);
  if (logbookIds.length > 0) {
    await prisma.preferenceSatisfaction.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.logPreferenceMetadata.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.assignment.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.run.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.logbook.deleteMany({ where: { id: { in: logbookIds } } });
  }
}

async function testWeightConfig(boost: number, penalty: number): Promise<ConfigResult> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Testing: Boost=${boost}, Penalty=${penalty}`);
  console.log(`${'─'.repeat(60)}`);
  
  await clearTestData();
  
  let totalObjective = 0;
  let totalSolveTimeMs = 0;
  let totalSatisfactionRate = 0;
  let successCount = 0;
  
  for (const date of TEST_DATES) {
    console.log(`  ${date}: `);
    const result = await runSolver(date, boost, penalty);
    
    if (result.success) {
      // Get satisfaction metrics for this date
      const satisfaction = await getSatisfactionMetrics(date);
      const satRate = satisfaction?.satisfactionRate ?? 0;
      
      console.log(`    ✓ ${(result.solveTimeMs / 1000).toFixed(1)}s, obj=${result.objectiveValue}, sat=${satRate.toFixed(1)}%`);
      totalObjective += result.objectiveValue || 0;
      totalSatisfactionRate += satRate;
      successCount++;
    } else {
      console.log(`    ✗ FAILED`);
    }
    
    totalSolveTimeMs += result.solveTimeMs;
  }
  
  // Get final fairness after all dates
  const lastDate = TEST_DATES[TEST_DATES.length - 1];
  const fairnessMetrics = await getFairnessSnapshots(lastDate);
  
  const roleGinis = new Map<number, number>();
  for (const m of fairnessMetrics) {
    roleGinis.set(m.roleId, m.giniCoefficient);
  }
  
  const avgGini = fairnessMetrics.length > 0
    ? fairnessMetrics.reduce((sum, f) => sum + f.giniCoefficient, 0) / fairnessMetrics.length
    : 0;
  
  const avgObjective = successCount > 0 ? totalObjective / successCount : 0;
  const avgSatisfactionRate = successCount > 0 ? totalSatisfactionRate / successCount : 0;
  
  console.log(`  → Avg Gini: ${avgGini.toFixed(4)}, Avg Obj: ${avgObjective.toFixed(0)}, Avg Sat: ${avgSatisfactionRate.toFixed(1)}%`);
  
  return {
    boost,
    penalty,
    avgGini,
    avgObjective,
    avgSatisfactionRate,
    totalSolveTimeMs,
    roleGinis,
    success: successCount === TEST_DATES.length,
  };
}

function printResultsTable(results: ConfigResult[]): void {
  const roleNames = new Map([
    [29, 'PH'],
    [37, 'Wine'],
    [38, 'Food'],
  ]);
  
  console.log('\n\n' + '═'.repeat(120));
  console.log('FAIRNESS WEIGHT TUNING RESULTS');
  console.log('═'.repeat(120));
  
  // Find baseline
  const baseline = results.find(r => r.boost === 0 && r.penalty === 0);
  const baselineGini = baseline?.avgGini ?? 0;
  const baselineObj = baseline?.avgObjective ?? 0;
  const baselineSat = baseline?.avgSatisfactionRate ?? 0;
  
  console.log('\n  Boost | Penalty | Avg Gini | Δ Gini    | Satisfy% | Δ Sat%   | Avg Obj    | PH Gini | Wine Gini | Food Gini');
  console.log('  ' + '─'.repeat(115));
  
  for (const r of results) {
    const boost = r.boost.toString().padStart(5);
    const penalty = r.penalty.toString().padStart(7);
    const avgGini = r.avgGini.toFixed(4).padStart(8);
    
    const giniDiff = r.avgGini - baselineGini;
    const giniDiffStr = (giniDiff >= 0 ? '+' : '') + giniDiff.toFixed(4);
    const giniDiffPad = giniDiffStr.padStart(9);
    
    // avgSatisfactionRate is already a percentage (e.g., 66.14)
    const satisfyPct = r.avgSatisfactionRate.toFixed(1).padStart(8);
    
    const satDiff = r.avgSatisfactionRate - baselineSat;
    const satDiffStr = (satDiff >= 0 ? '+' : '') + satDiff.toFixed(1);
    const satDiffPad = satDiffStr.padStart(8);
    
    const avgObj = r.avgObjective.toFixed(0).padStart(10);
    
    const phGini = (r.roleGinis.get(29) ?? 0).toFixed(3).padStart(7);
    const wineGini = (r.roleGinis.get(37) ?? 0).toFixed(3).padStart(9);
    const foodGini = (r.roleGinis.get(38) ?? 0).toFixed(3).padStart(9);
    
    // Highlight best
    let notes = '';
    if (r.boost === 0 && r.penalty === 0) notes = ' (baseline)';
    else if (giniDiff < -0.02 && satDiff >= -1) notes = ' ✅ GOOD';
    else if (giniDiff < -0.02) notes = ' ↓ Better Gini';
    else if (giniDiff > 0.02) notes = ' ↑ WORSE';
    
    console.log(`  ${boost} | ${penalty} | ${avgGini} | ${giniDiffPad} | ${satisfyPct} | ${satDiffPad} | ${avgObj} | ${phGini} | ${wineGini} | ${foodGini}${notes}`);
  }
  
  // Analysis
  console.log('\n\n' + '─'.repeat(120));
  console.log('ANALYSIS');
  console.log('─'.repeat(120));
  
  // Best fairness
  const sortedByGini = [...results].sort((a, b) => a.avgGini - b.avgGini);
  const bestFairness = sortedByGini[0];
  
  // Best satisfaction
  const sortedBySat = [...results].sort((a, b) => b.avgSatisfactionRate - a.avgSatisfactionRate);
  const bestSatisfaction = sortedBySat[0];
  
  // Best objective (excluding baseline)
  const nonBaseline = results.filter(r => !(r.boost === 0 && r.penalty === 0));
  const sortedByObj = [...nonBaseline].sort((a, b) => b.avgObjective - a.avgObjective);
  const bestPreferences = sortedByObj[0];
  
  // Best balance (Pareto optimal - low Gini, high satisfaction)
  // Normalize and combine scores
  const minGini = Math.min(...results.map(r => r.avgGini));
  const maxGini = Math.max(...results.map(r => r.avgGini));
  const minSat = Math.min(...results.map(r => r.avgSatisfactionRate));
  const maxSat = Math.max(...results.map(r => r.avgSatisfactionRate));
  
  const scored = results.map(r => {
    const giniScore = maxGini > minGini ? (maxGini - r.avgGini) / (maxGini - minGini) : 0;
    const satScore = maxSat > minSat ? (r.avgSatisfactionRate - minSat) / (maxSat - minSat) : 0;
    // Weight fairness and satisfaction equally
    const combinedScore = 0.5 * giniScore + 0.5 * satScore;
    return { ...r, combinedScore };
  });
  const bestBalance = scored.sort((a, b) => b.combinedScore - a.combinedScore)[0];
  
  // Note: avgSatisfactionRate is already a percentage (e.g., 66.14), not a ratio
  console.log(`\n  BEST FAIRNESS:     Boost=${bestFairness.boost}, Penalty=${bestFairness.penalty} (Gini: ${bestFairness.avgGini.toFixed(4)}, Satisfy: ${bestFairness.avgSatisfactionRate.toFixed(1)}%)`);
  console.log(`  BEST SATISFACTION: Boost=${bestSatisfaction.boost}, Penalty=${bestSatisfaction.penalty} (Satisfy: ${bestSatisfaction.avgSatisfactionRate.toFixed(1)}%, Gini: ${bestSatisfaction.avgGini.toFixed(4)})`);
  console.log(`  BEST BALANCE:      Boost=${bestBalance.boost}, Penalty=${bestBalance.penalty} (Gini: ${bestBalance.avgGini.toFixed(4)}, Satisfy: ${bestBalance.avgSatisfactionRate.toFixed(1)}%)`);
  
  // Check if there's a clear winner
  const giniImprovement = baselineGini - bestBalance.avgGini;
  const satLoss = baselineSat - bestBalance.avgSatisfactionRate;
  
  console.log(`\n  Best Balance vs Baseline:`);
  console.log(`    Fairness: ${giniImprovement > 0 ? '✅' : '❌'} ${(giniImprovement * 100).toFixed(2)}% ${giniImprovement > 0 ? 'better' : 'worse'} Gini`);
  console.log(`    Satisfaction: ${satLoss <= 0 ? '✅' : '⚠️'} ${Math.abs(satLoss).toFixed(2)}% ${satLoss <= 0 ? 'better' : 'worse'}`);
  
  if (giniImprovement > 0.02 && satLoss <= 1) {
    console.log('\n  ✅ RECOMMENDATION: Use the "Best Balance" config - significant fairness gain with minimal satisfaction cost.');
  } else if (giniImprovement > 0.02 && satLoss <= 3) {
    console.log('\n  ⚠️  NOTE: Best Balance trades some satisfaction for fairness. Consider if tradeoff is acceptable.');
  } else if (giniImprovement <= 0.02) {
    console.log('\n  ℹ️  INFO: Fairness weights have minimal impact. The schedule may already be fairly balanced.');
  } else {
    console.log('\n  ❌ WARNING: Significant satisfaction cost for fairness gains. May want to use lower weights.');
  }
}

async function main(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    FAIRNESS WEIGHT TUNING TEST                             ║');
  console.log('║                                                                            ║');
  console.log('║  Testing boost/penalty combinations to find optimal fairness weights       ║');
  console.log('║  Dates: 11/25, 12/13, 12/15, 12/16                                         ║');
  console.log('║  Tracked Roles: Parking Helms, Wine Demo, Food Demo                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  
  console.log(`\n  Configs to test: ${WEIGHT_CONFIGS.length}`);
  console.log(`  Solver runs: ${WEIGHT_CONFIGS.length * TEST_DATES.length}`);
  console.log(`  Estimated time: ${((WEIGHT_CONFIGS.length * TEST_DATES.length * 60) / 60).toFixed(0)} minutes\n`);
  
  const results: ConfigResult[] = [];
  
  try {
    for (const [boost, penalty] of WEIGHT_CONFIGS) {
      const result = await testWeightConfig(boost, penalty);
      results.push(result);
    }
    
    printResultsTable(results);
    
    console.log('\n\n✅ Weight Tuning Test Complete!\n');
    
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
