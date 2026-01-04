/**
 * Region Scaling Test: Parallel Tuning Regions Analysis
 * 
 * Tests the tuner with varying number of regions (1-20).
 * Each region = 1 parallel process with different seed + 3 ladder shots.
 * 
 * This tests the OPTIMAL ENGINE setup:
 * - numRegions: 1 → 20 (the variable we're testing)
 * - shotsPerRegion: 3 (fixed - ladder iterations per region)
 * - workersPerRegion: 1 (fixed - deterministic within region)
 * - timeLimitPerShot: 10s (fixed)
 * 
 * For each region count, simulates 10 days by cycling through available dates.
 * 
 * Metrics tracked:
 * 1. Solve time (total, avg, min, max)
 * 2. Role rule satisfaction (eligiblePrefs, met, avgSatisfaction, fairnessIndex)
 * 3. Role fairness Gini coefficients (per tracked role)
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

// Region scaling parameters
const MIN_REGIONS = 1;
const MAX_REGIONS = 20;
const DAYS_PER_TEST = 10;

// Fixed tuner parameters
const SHOTS_PER_REGION = 3;
const WORKERS_PER_REGION = 1;
const TIME_LIMIT_PER_SHOT = 10; // seconds

// ============================================================================
// Types
// ============================================================================
interface TunerResponse {
  success: boolean;
  objectiveValue?: number;
  logbookId?: string;
  metadata?: {
    runtimeMs?: number;
    tuningIterations?: number;
    regionSeed?: number;
    satisfactionScore?: number;
    fairnessIndex?: number;
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

interface RegionTestResult {
  numRegions: number;
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

async function runTuner(
  date: string,
  numRegions: number
): Promise<{ response: TunerResponse; solveTimeMs: number }> {
  const startTime = Date.now();

  const res = await fetch(`${API_URL}/solver/v2/tune`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID,
      date,
      saveLogbook: true,
      tuningConfig: {
        numRegions,
        shotsPerRegion: SHOTS_PER_REGION,
        workersPerRegion: WORKERS_PER_REGION,
        timeLimitPerShot: TIME_LIMIT_PER_SHOT,
        fairnessWeight: 0.5,
      },
      settings: {
        enableHardFairness: true,
        fairnessBoost: 300,
        fairnessPenalty: 300,
      },
    }),
  });

  const solveTimeMs = Date.now() - startTime;
  const data = (await res.json()) as TunerResponse;

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

async function runRegionTest(numRegions: number): Promise<RegionTestResult> {
  const totalSolves = numRegions * SHOTS_PER_REGION;
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Testing with ${numRegions} region${numRegions > 1 ? 's' : ''} (${totalSolves} solver calls per day)`);
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

    const { response, solveTimeMs } = await runTuner(realDate, numRegions);

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
    numRegions,
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

function printLiveSummary(results: RegionTestResult[], roleNames: Map<number, string>): void {
  console.log('\n' + '─'.repeat(130));
  console.log('                                         LIVE RESULTS (updated after each test)');
  console.log('─'.repeat(130));

  // Header
  const roleHeaders = TRACKED_ROLE_IDS.map(id => {
    const name = roleNames.get(id) ?? `Role ${id}`;
    return name.substring(0, 10).padStart(10);
  }).join(' │ ');

  console.log(`│ Regions │ Solves/Day │ Avg Time │ Avg Sat% │ Fair Idx │ ${roleHeaders} │ Avg Gini │`);
  console.log('├─────────┼────────────┼──────────┼──────────┼──────────┼' + '────────────┼'.repeat(TRACKED_ROLE_IDS.length) + '──────────┤');

  // Data rows
  for (const r of results) {
    const regions = r.numRegions.toString().padStart(7);
    const solvesPerDay = (r.numRegions * SHOTS_PER_REGION).toString().padStart(10);
    const avgTime = `${(r.avgSolveTimeMs / 1000).toFixed(1)}s`.padStart(8);
    const avgSat = `${r.avgSatisfaction.toFixed(1)}%`.padStart(8);
    const fairIdx = `${r.avgFairnessIndex.toFixed(1)}%`.padStart(8);
    
    const roleGinis = TRACKED_ROLE_IDS.map(roleId => {
      const gini = r.finalGiniByRole.get(roleId);
      return gini !== undefined ? gini.toFixed(4).padStart(10) : 'N/A'.padStart(10);
    }).join(' │ ');
    
    const avgGini = r.avgGini.toFixed(4).padStart(8);
    
    console.log(`│ ${regions} │ ${solvesPerDay} │ ${avgTime} │ ${avgSat} │ ${fairIdx} │ ${roleGinis} │ ${avgGini} │`);
  }
  
  console.log('└─────────┴────────────┴──────────┴──────────┴──────────┴' + '────────────┴'.repeat(TRACKED_ROLE_IDS.length) + '──────────┘');
  
  // Quick stats
  if (results.length >= 2) {
    const fastest = results.reduce((a, b) => a.avgSolveTimeMs < b.avgSolveTimeMs ? a : b);
    const bestSat = results.reduce((a, b) => a.avgSatisfaction > b.avgSatisfaction ? a : b);
    const bestGini = results.reduce((a, b) => a.avgGini < b.avgGini ? a : b);
    
    console.log(`\n  🏆 Best so far:  Fastest=${fastest.numRegions}r (${(fastest.avgSolveTimeMs/1000).toFixed(1)}s)  |  ` +
      `Best Sat=${bestSat.numRegions}r (${bestSat.avgSatisfaction.toFixed(1)}%)  |  ` +
      `Best Gini=${bestGini.numRegions}r (${bestGini.avgGini.toFixed(4)})`);
  }
  
  console.log(`\n  Progress: ${results.length}/${MAX_REGIONS - MIN_REGIONS + 1} region configs tested`);
}

function printFinalResultsTable(results: RegionTestResult[], roleNames: Map<number, string>): void {
  console.log('\n\n' + '═'.repeat(130));
  console.log('                                    REGION SCALING FINAL RESULTS');
  console.log('═'.repeat(130));

  // Time efficiency table
  console.log('\n┌─────────┬────────────┬─────────────┬───────────┬───────────┬───────────┬─────────┐');
  console.log('│ Regions │ Solves/Day │ Total Time  │ Avg Time  │ Min Time  │ Max Time  │ Success │');
  console.log('├─────────┼────────────┼─────────────┼───────────┼───────────┼───────────┼─────────┤');

  for (const r of results) {
    const regions = r.numRegions.toString().padStart(7);
    const solves = (r.numRegions * SHOTS_PER_REGION).toString().padStart(10);
    const total = `${(r.totalSolveTimeMs / 1000).toFixed(1)}s`.padStart(11);
    const avg = `${(r.avgSolveTimeMs / 1000).toFixed(2)}s`.padStart(9);
    const min = `${(r.minSolveTimeMs / 1000).toFixed(2)}s`.padStart(9);
    const max = `${(r.maxSolveTimeMs / 1000).toFixed(2)}s`.padStart(9);
    const success = `${r.successCount}/${DAYS_PER_TEST}`.padStart(7);
    console.log(`│ ${regions} │ ${solves} │ ${total} │ ${avg} │ ${min} │ ${max} │ ${success} │`);
  }
  console.log('└─────────┴────────────┴─────────────┴───────────┴───────────┴───────────┴─────────┘');

  // Analysis
  console.log('\n' + '─'.repeat(130));
  console.log('ANALYSIS:');

  // Time scaling
  const sortedByTime = [...results].sort((a, b) => a.avgSolveTimeMs - b.avgSolveTimeMs);
  const fastest = sortedByTime[0];
  const slowest = sortedByTime[sortedByTime.length - 1];
  
  console.log(`\n  ⏱️  Time Scaling:`);
  console.log(`     Fastest: ${fastest.numRegions} regions (${(fastest.avgSolveTimeMs / 1000).toFixed(2)}s avg)`);
  console.log(`     Slowest: ${slowest.numRegions} regions (${(slowest.avgSolveTimeMs / 1000).toFixed(2)}s avg)`);
  
  // Time per region analysis
  const timePerRegionFirst = results[0].avgSolveTimeMs / results[0].numRegions;
  const timePerRegionLast = results[results.length - 1].avgSolveTimeMs / results[results.length - 1].numRegions;
  console.log(`     Time/region (1 region): ${(timePerRegionFirst / 1000).toFixed(2)}s`);
  console.log(`     Time/region (${results[results.length - 1].numRegions} regions): ${(timePerRegionLast / 1000).toFixed(2)}s`);
  
  if (timePerRegionLast < timePerRegionFirst * 0.5) {
    console.log(`     ✅ Parallel efficiency: Great! Time per region decreased.`);
  } else if (timePerRegionLast > timePerRegionFirst * 1.5) {
    console.log(`     ⚠️ Parallel overhead: Time per region increased with more regions.`);
  }

  // Satisfaction analysis
  const sortedBySat = [...results].sort((a, b) => b.avgSatisfaction - a.avgSatisfaction);
  const bestSat = sortedBySat[0];
  const worstSat = sortedBySat[sortedBySat.length - 1];
  
  console.log(`\n  ✅ Satisfaction:`);
  console.log(`     Best: ${bestSat.numRegions} regions (${bestSat.avgSatisfaction.toFixed(2)}%)`);
  console.log(`     Worst: ${worstSat.numRegions} regions (${worstSat.avgSatisfaction.toFixed(2)}%)`);
  console.log(`     Δ: ${(bestSat.avgSatisfaction - worstSat.avgSatisfaction).toFixed(2)}%`);

  // Gini analysis
  const sortedByGini = [...results].sort((a, b) => a.avgGini - b.avgGini);
  const bestGini = sortedByGini[0];
  const worstGini = sortedByGini[sortedByGini.length - 1];
  
  console.log(`\n  📊 Fairness (Gini):`);
  console.log(`     Best: ${bestGini.numRegions} regions (${bestGini.avgGini.toFixed(4)})`);
  console.log(`     Worst: ${worstGini.numRegions} regions (${worstGini.avgGini.toFixed(4)})`);

  // Recommendation
  console.log(`\n  💡 RECOMMENDATION:`);
  
  // Find sweet spot (good satisfaction + reasonable time)
  const goodResults = results.filter(r => r.avgSatisfaction >= bestSat.avgSatisfaction * 0.98);
  const sweetSpot = goodResults.reduce((a, b) => a.avgSolveTimeMs < b.avgSolveTimeMs ? a : b);
  
  console.log(`     Sweet Spot: ${sweetSpot.numRegions} regions`);
  console.log(`       - Time: ${(sweetSpot.avgSolveTimeMs / 1000).toFixed(1)}s`);
  console.log(`       - Satisfaction: ${sweetSpot.avgSatisfaction.toFixed(1)}%`);
  console.log(`       - Gini: ${sweetSpot.avgGini.toFixed(4)}`);
  console.log(`       - Solver calls/day: ${sweetSpot.numRegions * SHOTS_PER_REGION}`);
}

async function main(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                                        REGION SCALING TEST                                                                  ║');
  console.log('║                                   (Parallel Tuning Engine)                                                                  ║');
  console.log('║                                                                                                                             ║');
  console.log(`║  Regions: ${MIN_REGIONS} → ${MAX_REGIONS} (each region = 1 parallel process with unique seed)                                                    ║`);
  console.log(`║  Shots per region: ${SHOTS_PER_REGION} (ladder iterations with solution hints)                                                                  ║`);
  console.log(`║  Workers per region: ${WORKERS_PER_REGION} (deterministic within region)                                                                          ║`);
  console.log(`║  Time limit per shot: ${TIME_LIMIT_PER_SHOT}s                                                                                                      ║`);
  console.log(`║  Days per test: ${DAYS_PER_TEST}                                                                                                                    ║`);
  console.log('╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝');

  const roleNames = await getRoleNames();
  console.log(`\nTracked roles: ${TRACKED_ROLE_IDS.map(id => roleNames.get(id) ?? id).join(', ')}`);

  const results: RegionTestResult[] = [];

  try {
    for (let regions = MIN_REGIONS; regions <= MAX_REGIONS; regions++) {
      const result = await runRegionTest(regions);
      results.push(result);
      
      // Print live summary after each test
      printLiveSummary(results, roleNames);
    }

    printFinalResultsTable(results, roleNames);

    console.log('\n\n✅ Region Scaling Test Complete!\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
