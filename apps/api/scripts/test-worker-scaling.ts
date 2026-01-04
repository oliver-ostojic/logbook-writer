/**
 * Worker Scaling Test: CPU Core Utilization vs Fairness
 * 
 * Tests solver with 10-20 workers, incrementing by 1 each iteration.
 * Measures: solve time, objective value, and role fairness (Gini coefficient)
 * 
 * Hypothesis: More workers might find better preference solutions,
 * but could potentially hurt fairness since fairness is a soft objective.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STORE_ID = 768;
const TEST_DATES = ['2025-11-25', '2025-12-13', '2025-12-15', '2025-12-16'];
const TRACKED_ROLE_IDS = [29, 37, 38]; // Parking Helms, Wine Demo, Food Demo
const API_URL = 'http://localhost:4000';
const MIN_WORKERS = 10;
const MAX_WORKERS = 20;

interface SolverResult {
  success: boolean;
  logbookId?: string;
  objectiveValue?: number;
  solveTimeMs: number;
}

interface FairnessMetrics {
  roleId: number;
  roleName: string;
  giniCoefficient: number;
  fairnessIndex: number;
}

interface DateResult {
  date: string;
  success: boolean;
  objectiveValue?: number;
  solveTimeMs: number;
}

interface WorkerTestResult {
  numWorkers: number;
  totalSolveTimeMs: number;
  avgSolveTimeMs: number;
  dateResults: DateResult[];
  // Fairness metrics after all 4 dates
  finalFairness: FairnessMetrics[];
  avgGini: number;
}

async function runSolver(date: string, numWorkers: number): Promise<SolverResult> {
  const startTime = Date.now();
  
  const response = await fetch(`${API_URL}/solver/v2/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID,
      date,
      saveLogbook: true,  // Save to trigger fairness tracking
      timeLimitSeconds: 60,
      numWorkers,
    }),
  });
  
  const solveTimeMs = Date.now() - startTime;
  const data = await response.json();
  
  return {
    success: data.success,
    logbookId: data.logbookId,
    objectiveValue: data.objectiveValue,
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
    fairnessIndex: s.fairnessIndex,
  }));
}

async function clearTestData(): Promise<void> {
  // Clear fairness data
  await prisma.crewRoleFairnessHistory.deleteMany({ where: { storeId: STORE_ID } });
  await prisma.roleFairnessSnapshot.deleteMany({ where: { storeId: STORE_ID } });
  
  // Delete logbooks for test dates
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

async function setFairnessEnabled(enabled: boolean): Promise<void> {
  await prisma.roleFairnessTracker.updateMany({
    where: { storeId: STORE_ID, roleId: { in: TRACKED_ROLE_IDS } },
    data: { enabled },
  });
}

async function runWorkerTest(numWorkers: number): Promise<WorkerTestResult> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Testing with ${numWorkers} workers...`);
  console.log(`${'─'.repeat(60)}`);
  
  // Clear data before this test
  await clearTestData();
  await setFairnessEnabled(true);  // Keep fairness enabled to measure its behavior
  
  const dateResults: DateResult[] = [];
  let totalSolveTimeMs = 0;
  
  for (const date of TEST_DATES) {
    process.stdout.write(`  ${date}: `);
    const result = await runSolver(date, numWorkers);
    
    if (result.success) {
      console.log(`✓ ${(result.solveTimeMs / 1000).toFixed(1)}s, obj=${result.objectiveValue}`);
    } else {
      console.log(`✗ FAILED`);
    }
    
    dateResults.push({
      date,
      success: result.success,
      objectiveValue: result.objectiveValue,
      solveTimeMs: result.solveTimeMs,
    });
    
    totalSolveTimeMs += result.solveTimeMs;
  }
  
  // Get final fairness after all dates
  const lastDate = TEST_DATES[TEST_DATES.length - 1];
  const finalFairness = await getFairnessSnapshots(lastDate);
  
  const avgGini = finalFairness.length > 0
    ? finalFairness.reduce((sum, f) => sum + f.giniCoefficient, 0) / finalFairness.length
    : 0;
  
  console.log(`  → Total time: ${(totalSolveTimeMs / 1000).toFixed(1)}s, Avg Gini: ${avgGini.toFixed(4)}`);
  
  return {
    numWorkers,
    totalSolveTimeMs,
    avgSolveTimeMs: totalSolveTimeMs / TEST_DATES.length,
    dateResults,
    finalFairness,
    avgGini,
  };
}

function printResultsTable(results: WorkerTestResult[]): void {
  console.log('\n\n' + '═'.repeat(80));
  console.log('WORKER SCALING RESULTS');
  console.log('═'.repeat(80));
  
  // Summary table
  console.log('\n  Workers | Total Time | Avg Time | Avg Gini  | Δ Gini vs 10 | Notes');
  console.log('  ' + '─'.repeat(72));
  
  const baseline = results.find(r => r.numWorkers === MIN_WORKERS);
  const baselineGini = baseline?.avgGini ?? 0;
  
  for (const r of results) {
    const workers = r.numWorkers.toString().padStart(7);
    const totalTime = `${(r.totalSolveTimeMs / 1000).toFixed(1)}s`.padStart(10);
    const avgTime = `${(r.avgSolveTimeMs / 1000).toFixed(1)}s`.padStart(8);
    const avgGini = r.avgGini.toFixed(4).padStart(9);
    
    const giniDiff = r.avgGini - baselineGini;
    const giniDiffStr = (giniDiff >= 0 ? '+' : '') + giniDiff.toFixed(4);
    const giniDiffPad = giniDiffStr.padStart(12);
    
    let notes = '';
    if (r.numWorkers === MIN_WORKERS) notes = '(baseline)';
    else if (giniDiff < -0.01) notes = '↓ BETTER fairness';
    else if (giniDiff > 0.01) notes = '↑ WORSE fairness';
    
    console.log(`  ${workers} | ${totalTime} | ${avgTime} | ${avgGini} | ${giniDiffPad} | ${notes}`);
  }
  
  // Per-role breakdown
  console.log('\n\nPer-Role Gini Coefficients:');
  console.log('  Workers | Parking Helms | Wine Demo | Food Demo');
  console.log('  ' + '─'.repeat(55));
  
  for (const r of results) {
    const workers = r.numWorkers.toString().padStart(7);
    const roleGinis = TRACKED_ROLE_IDS.map(roleId => {
      const fm = r.finalFairness.find(f => f.roleId === roleId);
      return fm ? fm.giniCoefficient.toFixed(4).padStart(13) : 'N/A'.padStart(13);
    });
    console.log(`  ${workers} | ${roleGinis.join(' | ')}`);
  }
  
  // Find optimal
  console.log('\n\n' + '─'.repeat(80));
  
  const sortedByGini = [...results].sort((a, b) => a.avgGini - b.avgGini);
  const bestFairness = sortedByGini[0];
  
  const sortedByTime = [...results].sort((a, b) => a.avgSolveTimeMs - b.avgSolveTimeMs);
  const fastest = sortedByTime[0];
  
  console.log('RECOMMENDATIONS:');
  console.log(`  Best Fairness: ${bestFairness.numWorkers} workers (Gini: ${bestFairness.avgGini.toFixed(4)})`);
  console.log(`  Fastest:       ${fastest.numWorkers} workers (${(fastest.avgSolveTimeMs / 1000).toFixed(1)}s avg)`);
  
  // Check if more workers hurts fairness
  const firstHalf = results.slice(0, 5);
  const secondHalf = results.slice(5);
  const avgGiniFirstHalf = firstHalf.reduce((s, r) => s + r.avgGini, 0) / firstHalf.length;
  const avgGiniSecondHalf = secondHalf.reduce((s, r) => s + r.avgGini, 0) / secondHalf.length;
  
  if (avgGiniSecondHalf > avgGiniFirstHalf + 0.005) {
    console.log(`\n⚠️  FINDING: More workers (${MIN_WORKERS + 5}+) appears to hurt fairness!`);
    console.log(`    Avg Gini (10-14 workers): ${avgGiniFirstHalf.toFixed(4)}`);
    console.log(`    Avg Gini (15-20 workers): ${avgGiniSecondHalf.toFixed(4)}`);
  } else if (avgGiniSecondHalf < avgGiniFirstHalf - 0.005) {
    console.log(`\n✅ FINDING: More workers improves fairness!`);
  } else {
    console.log(`\n≈  FINDING: Worker count has minimal impact on fairness.`);
  }
}

async function main(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    WORKER SCALING + FAIRNESS TEST                          ║');
  console.log('║                                                                            ║');
  console.log('║  Testing: 10 → 20 workers, +1 increment                                    ║');
  console.log('║  Dates: 11/25, 12/13, 12/15, 12/16                                         ║');
  console.log('║  Measuring: Solve time, Objective value, Role fairness (Gini)              ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  
  const results: WorkerTestResult[] = [];
  
  try {
    for (let workers = MIN_WORKERS; workers <= MAX_WORKERS; workers++) {
      const result = await runWorkerTest(workers);
      results.push(result);
    }
    
    printResultsTable(results);
    
    console.log('\n\n✅ Worker Scaling Test Complete!\n');
    
  } finally {
    // Restore fairness tracking
    await setFairnessEnabled(true);
    await prisma.$disconnect();
  }
}

main().catch(console.error);
