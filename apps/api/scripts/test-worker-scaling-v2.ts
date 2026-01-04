/**
 * Worker Scaling Test v2: CPU Core Utilization Analysis
 * 
 * Tests solver with varying worker counts (1-10 by default).
 * For each worker count, simulates 10 days by cycling through available dates.
 * 
 * Metrics tracked per worker count:
 * 1. Solve time (total, avg, min, max)
 * 2. Role rule satisfaction (eligiblePrefs, met, avgSatisfaction, fairnessIndex)
 * 3. Role fairness Gini coefficients (per tracked role)
 * 
 * Uses the simulation approach: cycles through 4 real dates to simulate 10 days,
 * accumulating fairness history between runs.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// Configuration
// ============================================================================
const STORE_ID = 768;
const REAL_DATES = ['2025-11-25', '2025-12-13', '2025-12-15', '2025-12-16'];
const TRACKED_ROLE_IDS = [29, 37, 38]; // Parking Helms, Wine Demo, Food Demo
const API_URL = 'http://localhost:4000';

const MIN_WORKERS = 1;
const MAX_WORKERS = 20;
const DAYS_PER_TEST = 10;

// ============================================================================
// Types
// ============================================================================
interface SolverResponse {
  success: boolean;
  objectiveValue?: number;
  logbookId?: string;
  metadata?: {
    runtimeMs?: number;
    constraintAnalysis?: unknown;
  };
}

interface DayResult {
  day: number;
  realDate: string;
  success: boolean;
  solveTimeMs: number;
  objectiveValue?: number;
  // Role rule satisfaction
  eligiblePreferences: number;
  preferencesMet: number;
  avgSatisfaction: number;
  fairnessIndex: number;
  // Gini per role
  giniByRole: Map<number, number>;
}

interface WorkerTestResult {
  numWorkers: number;
  dayResults: DayResult[];
  // Aggregates
  successCount: number;
  totalSolveTimeMs: number;
  avgSolveTimeMs: number;
  minSolveTimeMs: number;
  maxSolveTimeMs: number;
  // Role rule satisfaction averages
  avgEligiblePrefs: number;
  avgPreferencesMet: number;
  avgSatisfaction: number;
  avgFairnessIndex: number;
  // Final Gini per role (day 10)
  finalGiniByRole: Map<number, number>;
  avgGini: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getRoleNames(): Promise<Map<number, string>> {
  const roles = await prisma.role.findMany({
    where: { id: { in: TRACKED_ROLE_IDS } },
    select: { id: true, displayName: true },
  });
  return new Map(roles.map(r => [r.id, r.displayName]));
}

async function clearAllTestData(): Promise<void> {
  console.log('  Clearing fairness history and snapshots...');
  await prisma.crewRoleFairnessHistory.deleteMany({ where: { storeId: STORE_ID } });
  await prisma.roleFairnessSnapshot.deleteMany({ where: { storeId: STORE_ID } });

  // Delete logbooks for test dates
  const logbooks = await prisma.logbook.findMany({
    where: {
      storeId: STORE_ID,
      date: { in: REAL_DATES.map(d => new Date(d)) },
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
  console.log('  ✓ Cleared');
}

async function runSolver(
  date: string,
  numWorkers: number
): Promise<{ response: SolverResponse; solveTimeMs: number }> {
  const startTime = Date.now();

  const res = await fetch(`${API_URL}/solver/v2/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID,
      date,
      saveLogbook: true, // Save to trigger fairness tracking
      timeLimitSeconds: 60,
      numWorkers,
      settings: {
        enableHardFairness: true,
        fairnessBoost: 300,
        fairnessPenalty: 300,
      },
    }),
  });

  const solveTimeMs = Date.now() - startTime;
  const data = (await res.json()) as SolverResponse;

  return { response: data, solveTimeMs };
}

async function getLogbookMetadata(
  date: string
): Promise<{
  eligiblePreferences: number;
  preferencesMet: number;
  avgSatisfaction: number;
  fairnessIndex: number;
} | null> {
  const logbook = await prisma.logbook.findFirst({
    where: { storeId: STORE_ID, date: new Date(date) },
    select: { id: true },
  });
  if (!logbook) return null;

  const metadata = await prisma.logPreferenceMetadata.findUnique({
    where: { logbookId: logbook.id },
    select: {
      eligiblePreferences: true,
      preferencesMet: true,
      avgSatisfaction: true,
      fairnessIndex: true,
    },
  });

  return metadata ?? null;
}

async function getFairnessSnapshots(date: string): Promise<Map<number, number>> {
  const snapshots = await prisma.roleFairnessSnapshot.findMany({
    where: {
      storeId: STORE_ID,
      date: new Date(date),
      roleId: { in: TRACKED_ROLE_IDS },
    },
  });

  const giniByRole = new Map<number, number>();
  for (const s of snapshots) {
    giniByRole.set(s.roleId, s.giniCoefficient);
  }
  return giniByRole;
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function runWorkerTest(numWorkers: number): Promise<WorkerTestResult> {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Testing with ${numWorkers} worker${numWorkers > 1 ? 's' : ''}`);
  console.log(`${'═'.repeat(70)}`);

  // Clear data before this test
  await clearAllTestData();

  const dayResults: DayResult[] = [];

  for (let day = 1; day <= DAYS_PER_TEST; day++) {
    // Cycle through real dates
    const realDate = REAL_DATES[(day - 1) % REAL_DATES.length];
    process.stdout.write(`  Day ${day.toString().padStart(2)} (${realDate}): `);

    // Delete existing logbook for this date before re-solving
    const existingLogbook = await prisma.logbook.findFirst({
      where: { storeId: STORE_ID, date: new Date(realDate) },
      select: { id: true },
    });
    if (existingLogbook) {
      await prisma.preferenceSatisfaction.deleteMany({ where: { logbookId: existingLogbook.id } });
      await prisma.logPreferenceMetadata.deleteMany({ where: { logbookId: existingLogbook.id } });
      await prisma.assignment.deleteMany({ where: { logbookId: existingLogbook.id } });
      await prisma.run.deleteMany({ where: { logbookId: existingLogbook.id } });
      await prisma.logbook.deleteMany({ where: { id: existingLogbook.id } });
    }

    const { response, solveTimeMs } = await runSolver(realDate, numWorkers);

    if (response.success) {
      const metadata = await getLogbookMetadata(realDate);
      const giniByRole = await getFairnessSnapshots(realDate);

      const avgGini = giniByRole.size > 0
        ? [...giniByRole.values()].reduce((a, b) => a + b, 0) / giniByRole.size
        : 0;

      console.log(
        `✓ ${(solveTimeMs / 1000).toFixed(1)}s | ` +
        `sat=${metadata?.avgSatisfaction?.toFixed(1) ?? 'N/A'}% | ` +
        `fair=${metadata?.fairnessIndex?.toFixed(1) ?? 'N/A'}% | ` +
        `gini=${avgGini.toFixed(4)}`
      );

      dayResults.push({
        day,
        realDate,
        success: true,
        solveTimeMs,
        objectiveValue: response.objectiveValue,
        eligiblePreferences: metadata?.eligiblePreferences ?? 0,
        preferencesMet: metadata?.preferencesMet ?? 0,
        avgSatisfaction: metadata?.avgSatisfaction ?? 0,
        fairnessIndex: metadata?.fairnessIndex ?? 0,
        giniByRole,
      });
    } else {
      console.log(`✗ FAILED after ${(solveTimeMs / 1000).toFixed(1)}s`);
      dayResults.push({
        day,
        realDate,
        success: false,
        solveTimeMs,
        eligiblePreferences: 0,
        preferencesMet: 0,
        avgSatisfaction: 0,
        fairnessIndex: 0,
        giniByRole: new Map(),
      });
    }
  }

  // Calculate aggregates
  const successResults = dayResults.filter(d => d.success);
  const successCount = successResults.length;
  const solveTimes = dayResults.map(d => d.solveTimeMs);
  const totalSolveTimeMs = solveTimes.reduce((a, b) => a + b, 0);
  const avgSolveTimeMs = totalSolveTimeMs / dayResults.length;
  const minSolveTimeMs = Math.min(...solveTimes);
  const maxSolveTimeMs = Math.max(...solveTimes);

  const avgEligiblePrefs = successCount > 0
    ? successResults.reduce((s, d) => s + d.eligiblePreferences, 0) / successCount
    : 0;
  const avgPreferencesMet = successCount > 0
    ? successResults.reduce((s, d) => s + d.preferencesMet, 0) / successCount
    : 0;
  const avgSatisfaction = successCount > 0
    ? successResults.reduce((s, d) => s + d.avgSatisfaction, 0) / successCount
    : 0;
  const avgFairnessIndex = successCount > 0
    ? successResults.reduce((s, d) => s + d.fairnessIndex, 0) / successCount
    : 0;

  // Final Gini (last successful day)
  const lastSuccess = successResults[successResults.length - 1];
  const finalGiniByRole = lastSuccess?.giniByRole ?? new Map();
  const avgGini = finalGiniByRole.size > 0
    ? [...finalGiniByRole.values()].reduce((a, b) => a + b, 0) / finalGiniByRole.size
    : 0;

  console.log(`\n  Summary: ${successCount}/${DAYS_PER_TEST} succeeded | ` +
    `Avg time: ${(avgSolveTimeMs / 1000).toFixed(1)}s | ` +
    `Avg sat: ${avgSatisfaction.toFixed(1)}% | ` +
    `Final Gini: ${avgGini.toFixed(4)}`);

  return {
    numWorkers,
    dayResults,
    successCount,
    totalSolveTimeMs,
    avgSolveTimeMs,
    minSolveTimeMs,
    maxSolveTimeMs,
    avgEligiblePrefs,
    avgPreferencesMet,
    avgSatisfaction,
    avgFairnessIndex,
    finalGiniByRole,
    avgGini,
  };
}

function printLiveSummary(results: WorkerTestResult[], roleNames: Map<number, string>): void {
  // Clear screen and move cursor to top for live update effect
  console.log('\n' + '─'.repeat(120));
  console.log('                                    LIVE RESULTS (updated after each test)');
  console.log('─'.repeat(120));

  // Header
  const roleHeaders = TRACKED_ROLE_IDS.map(id => {
    const name = roleNames.get(id) ?? `Role ${id}`;
    return name.substring(0, 10).padStart(10);
  }).join(' │ ');

  console.log(`│ Workers │ Avg Time │ Avg Sat% │ Fair Idx │ ${roleHeaders} │ Avg Gini │`);
  console.log('├─────────┼──────────┼──────────┼──────────┼' + '────────────┼'.repeat(TRACKED_ROLE_IDS.length) + '──────────┤');

  // Data rows
  for (const r of results) {
    const workers = r.numWorkers.toString().padStart(7);
    const avgTime = `${(r.avgSolveTimeMs / 1000).toFixed(1)}s`.padStart(8);
    const avgSat = `${r.avgSatisfaction.toFixed(1)}%`.padStart(8);
    const fairIdx = `${r.avgFairnessIndex.toFixed(1)}%`.padStart(8);
    
    const roleGinis = TRACKED_ROLE_IDS.map(roleId => {
      const gini = r.finalGiniByRole.get(roleId);
      return gini !== undefined ? gini.toFixed(4).padStart(10) : 'N/A'.padStart(10);
    }).join(' │ ');
    
    const avgGini = r.avgGini.toFixed(4).padStart(8);
    
    console.log(`│ ${workers} │ ${avgTime} │ ${avgSat} │ ${fairIdx} │ ${roleGinis} │ ${avgGini} │`);
  }
  
  console.log('└─────────┴──────────┴──────────┴──────────┴' + '────────────┴'.repeat(TRACKED_ROLE_IDS.length) + '──────────┘');
  
  // Quick stats
  if (results.length >= 2) {
    const fastest = results.reduce((a, b) => a.avgSolveTimeMs < b.avgSolveTimeMs ? a : b);
    const bestSat = results.reduce((a, b) => a.avgSatisfaction > b.avgSatisfaction ? a : b);
    const bestGini = results.reduce((a, b) => a.avgGini < b.avgGini ? a : b);
    
    console.log(`\n  🏆 Best so far:  Fastest=${fastest.numWorkers}w (${(fastest.avgSolveTimeMs/1000).toFixed(1)}s)  |  ` +
      `Best Sat=${bestSat.numWorkers}w (${bestSat.avgSatisfaction.toFixed(1)}%)  |  ` +
      `Best Gini=${bestGini.numWorkers}w (${bestGini.avgGini.toFixed(4)})`);
  }
  
  console.log(`\n  Progress: ${results.length}/${MAX_WORKERS - MIN_WORKERS + 1} worker configs tested`);
}

function printResultsTable(results: WorkerTestResult[], roleNames: Map<number, string>): void {
  console.log('\n\n' + '═'.repeat(100));
  console.log('                              WORKER SCALING RESULTS');
  console.log('═'.repeat(100));

  // Time table
  console.log('\n┌─────────┬─────────────┬───────────┬───────────┬───────────┬─────────┐');
  console.log('│ Workers │ Total Time  │ Avg Time  │ Min Time  │ Max Time  │ Success │');
  console.log('├─────────┼─────────────┼───────────┼───────────┼───────────┼─────────┤');

  for (const r of results) {
    const workers = r.numWorkers.toString().padStart(7);
    const total = `${(r.totalSolveTimeMs / 1000).toFixed(1)}s`.padStart(11);
    const avg = `${(r.avgSolveTimeMs / 1000).toFixed(2)}s`.padStart(9);
    const min = `${(r.minSolveTimeMs / 1000).toFixed(2)}s`.padStart(9);
    const max = `${(r.maxSolveTimeMs / 1000).toFixed(2)}s`.padStart(9);
    const success = `${r.successCount}/${DAYS_PER_TEST}`.padStart(7);
    console.log(`│ ${workers} │ ${total} │ ${avg} │ ${min} │ ${max} │ ${success} │`);
  }
  console.log('└─────────┴─────────────┴───────────┴───────────┴───────────┴─────────┘');

  // Role rule satisfaction table
  console.log('\n┌─────────┬───────────────┬─────────────┬─────────────┬───────────────┐');
  console.log('│ Workers │ Eligible Prefs│ Prefs Met   │ Avg Sat (%) │ Fairness Idx  │');
  console.log('├─────────┼───────────────┼─────────────┼─────────────┼───────────────┤');

  for (const r of results) {
    const workers = r.numWorkers.toString().padStart(7);
    const eligible = r.avgEligiblePrefs.toFixed(1).padStart(13);
    const met = r.avgPreferencesMet.toFixed(1).padStart(11);
    const sat = r.avgSatisfaction.toFixed(2).padStart(11);
    const fair = r.avgFairnessIndex.toFixed(2).padStart(13);
    console.log(`│ ${workers} │ ${eligible} │ ${met} │ ${sat} │ ${fair} │`);
  }
  console.log('└─────────┴───────────────┴─────────────┴─────────────┴───────────────┘');

  // Gini by role table
  const roleHeaders = TRACKED_ROLE_IDS.map(id => {
    const name = roleNames.get(id) ?? `Role ${id}`;
    return name.substring(0, 12).padStart(12);
  }).join(' │ ');
  
  console.log('\n┌─────────┬' + '──────────────┬'.repeat(TRACKED_ROLE_IDS.length - 1) + '──────────────┬───────────┐');
  console.log(`│ Workers │ ${roleHeaders} │ Avg Gini  │`);
  console.log('├─────────┼' + '──────────────┼'.repeat(TRACKED_ROLE_IDS.length - 1) + '──────────────┼───────────┤');

  for (const r of results) {
    const workers = r.numWorkers.toString().padStart(7);
    const roleGinis = TRACKED_ROLE_IDS.map(roleId => {
      const gini = r.finalGiniByRole.get(roleId);
      return gini !== undefined ? gini.toFixed(4).padStart(12) : 'N/A'.padStart(12);
    }).join(' │ ');
    const avgGini = r.avgGini.toFixed(4).padStart(9);
    console.log(`│ ${workers} │ ${roleGinis} │ ${avgGini} │`);
  }
  console.log('└─────────┴' + '──────────────┴'.repeat(TRACKED_ROLE_IDS.length - 1) + '──────────────┴───────────┘');

  // Analysis
  console.log('\n' + '─'.repeat(100));
  console.log('ANALYSIS:');

  // Find fastest
  const sortedByTime = [...results].sort((a, b) => a.avgSolveTimeMs - b.avgSolveTimeMs);
  const fastest = sortedByTime[0];
  const slowest = sortedByTime[sortedByTime.length - 1];
  const speedup = slowest.avgSolveTimeMs / fastest.avgSolveTimeMs;

  console.log(`\n  ⏱️  Time:`);
  console.log(`     Fastest: ${fastest.numWorkers} workers (${(fastest.avgSolveTimeMs / 1000).toFixed(2)}s avg)`);
  console.log(`     Slowest: ${slowest.numWorkers} worker${slowest.numWorkers > 1 ? 's' : ''} (${(slowest.avgSolveTimeMs / 1000).toFixed(2)}s avg)`);
  console.log(`     Speedup: ${speedup.toFixed(2)}x`);

  // Find best satisfaction
  const sortedBySat = [...results].sort((a, b) => b.avgSatisfaction - a.avgSatisfaction);
  const bestSat = sortedBySat[0];
  console.log(`\n  ✅ Best Satisfaction: ${bestSat.numWorkers} workers (${bestSat.avgSatisfaction.toFixed(2)}%)`);

  // Find best fairness
  const sortedByFair = [...results].sort((a, b) => b.avgFairnessIndex - a.avgFairnessIndex);
  const bestFair = sortedByFair[0];
  console.log(`  ⚖️  Best Fairness Index: ${bestFair.numWorkers} workers (${bestFair.avgFairnessIndex.toFixed(2)}%)`);

  // Find best Gini
  const sortedByGini = [...results].sort((a, b) => a.avgGini - b.avgGini);
  const bestGini = sortedByGini[0];
  console.log(`  📊 Best Gini (lowest): ${bestGini.numWorkers} workers (${bestGini.avgGini.toFixed(4)})`);

  // Check if more workers helps or hurts
  const firstHalf = results.slice(0, Math.floor(results.length / 2));
  const secondHalf = results.slice(Math.floor(results.length / 2));
  
  const avgTimeFirst = firstHalf.reduce((s, r) => s + r.avgSolveTimeMs, 0) / firstHalf.length;
  const avgTimeSecond = secondHalf.reduce((s, r) => s + r.avgSolveTimeMs, 0) / secondHalf.length;
  
  const avgGiniFirst = firstHalf.reduce((s, r) => s + r.avgGini, 0) / firstHalf.length;
  const avgGiniSecond = secondHalf.reduce((s, r) => s + r.avgGini, 0) / secondHalf.length;

  console.log(`\n  📈 Trend Analysis (${MIN_WORKERS}-${Math.floor((MIN_WORKERS + MAX_WORKERS) / 2)} vs ${Math.floor((MIN_WORKERS + MAX_WORKERS) / 2) + 1}-${MAX_WORKERS} workers):`);
  
  if (avgTimeSecond < avgTimeFirst * 0.9) {
    console.log(`     Time: ↓ More workers = FASTER (${((1 - avgTimeSecond / avgTimeFirst) * 100).toFixed(1)}% improvement)`);
  } else if (avgTimeSecond > avgTimeFirst * 1.1) {
    console.log(`     Time: ↑ More workers = SLOWER (${((avgTimeSecond / avgTimeFirst - 1) * 100).toFixed(1)}% slower)`);
  } else {
    console.log(`     Time: ≈ No significant difference`);
  }

  if (avgGiniSecond < avgGiniFirst * 0.95) {
    console.log(`     Gini: ↓ More workers = BETTER fairness`);
  } else if (avgGiniSecond > avgGiniFirst * 1.05) {
    console.log(`     Gini: ↑ More workers = WORSE fairness`);
  } else {
    console.log(`     Gini: ≈ No significant difference`);
  }
}

async function main(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           WORKER SCALING TEST v2                                               ║');
  console.log('║                                                                                                ║');
  console.log(`║  Workers: ${MIN_WORKERS} → ${MAX_WORKERS}                                                                              ║`);
  console.log(`║  Days per test: ${DAYS_PER_TEST} (cycling through ${REAL_DATES.length} real dates)                                            ║`);
  console.log('║  Metrics: Solve time, Role rule satisfaction, Fairness (Gini per role)                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════════════════════╝');

  const roleNames = await getRoleNames();
  console.log(`\nTracked roles: ${TRACKED_ROLE_IDS.map(id => roleNames.get(id) ?? id).join(', ')}`);

  const results: WorkerTestResult[] = [];

  try {
    for (let workers = MIN_WORKERS; workers <= MAX_WORKERS; workers++) {
      const result = await runWorkerTest(workers);
      results.push(result);
      
      // Print live summary after each test
      printLiveSummary(results, roleNames);
    }

    printResultsTable(results, roleNames);

    console.log('\n\n✅ Worker Scaling Test Complete!\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
