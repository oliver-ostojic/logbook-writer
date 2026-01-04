/**
 * Shots Scaling Test: Relay Runs Analysis
 * 
 * Tests varying number of shots (relay runs) per region.
 * Each shot uses the previous best solution as a hint (ladder approach).
 * 
 * Test matrix:
 * - Regions: 2, 12, 14 (best performers from region scaling test)
 * - Shots per region: 1, 3, 5, 7, 10 (the variable we're testing)
 * - Runs per config: 15 (for statistical significance)
 * 
 * Fixed parameters:
 * - workersPerRegion: 1 (deterministic within region)
 * - timeLimitPerShot: 10s
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

// Test matrix
const REGION_COUNTS = [2, 12, 14];
const SHOTS_PER_REGION_VALUES = [3, 5, 7, 10];
const RUNS_PER_CONFIG = 5; // Reduced for faster testing

// Fixed parameters
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

interface RunResult {
  runIndex: number;
  realDate: string;
  success: boolean;
  solveTimeMs: number;
  objectiveValue?: number;
  eligiblePreferences: number;
  preferencesMet: number;
  avgSatisfaction: number;
  fairnessIndex: number;
  giniByRole: Map<number, number>;
}

interface ConfigTestResult {
  numRegions: number;
  shotsPerRegion: number;
  totalSolverCalls: number; // regions * shots
  runResults: RunResult[];
  // Aggregates
  successCount: number;
  totalSolveTimeMs: number;
  avgSolveTimeMs: number;
  minSolveTimeMs: number;
  maxSolveTimeMs: number;
  stdDevSolveTimeMs: number;
  // Satisfaction
  avgSatisfaction: number;
  minSatisfaction: number;
  maxSatisfaction: number;
  stdDevSatisfaction: number;
  // Fairness
  avgFairnessIndex: number;
  avgGiniByRole: Map<number, number>;
  avgGini: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

async function getRoleNames(): Promise<Map<number, string>> {
  const roles = await prisma.role.findMany({
    where: { id: { in: TRACKED_ROLE_IDS } },
    select: { id: true, displayName: true },
  });
  return new Map(roles.map(r => [r.id, r.displayName]));
}

async function clearTestData(): Promise<void> {
  console.log('  Clearing fairness history and snapshots...');
  await prisma.crewRoleFairnessHistory.deleteMany({ where: { storeId: STORE_ID } });
  await prisma.roleFairnessSnapshot.deleteMany({ where: { storeId: STORE_ID } });

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
  numRegions: number,
  shotsPerRegion: number
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
        shotsPerRegion,
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

  return metadata;
}

async function getGiniCoefficients(): Promise<Map<number, number>> {
  const snapshots = await prisma.roleFairnessSnapshot.findMany({
    where: {
      storeId: STORE_ID,
      roleId: { in: TRACKED_ROLE_IDS },
    },
    select: { roleId: true, giniCoefficient: true },
    orderBy: { createdAt: 'desc' },
  });

  const giniMap = new Map<number, number>();
  for (const s of snapshots) {
    if (!giniMap.has(s.roleId)) {
      giniMap.set(s.roleId, s.giniCoefficient);
    }
  }
  return giniMap;
}

async function runConfigTest(
  numRegions: number,
  shotsPerRegion: number,
  configIndex: number,
  totalConfigs: number
): Promise<ConfigTestResult> {
  const totalSolverCalls = numRegions * shotsPerRegion;
  
  console.log(`\n${'─'.repeat(100)}`);
  console.log(`CONFIG ${configIndex}/${totalConfigs}: ${numRegions} regions × ${shotsPerRegion} shots = ${totalSolverCalls} solver calls/day`);
  console.log(`${'─'.repeat(100)}`);

  // Clear data before each config test
  await clearTestData();

  const runResults: RunResult[] = [];

  for (let run = 0; run < RUNS_PER_CONFIG; run++) {
    const dateIndex = run % REAL_DATES.length;
    const realDate = REAL_DATES[dateIndex];

    // Clear between runs
    if (run > 0) {
      await clearTestData();
    }

    console.log(`  Run ${run + 1}/${RUNS_PER_CONFIG} (${realDate})... `);

    try {
      const { response, solveTimeMs } = await runTuner(realDate, numRegions, shotsPerRegion);

      if (!response.success) {
        console.log('❌ Failed');
        runResults.push({
          runIndex: run,
          realDate,
          success: false,
          solveTimeMs,
          eligiblePreferences: 0,
          preferencesMet: 0,
          avgSatisfaction: 0,
          fairnessIndex: 0,
          giniByRole: new Map(),
        });
        continue;
      }

      // Get metadata
      const metadata = await getLogbookMetadata(realDate);
      const gini = await getGiniCoefficients();

      const result: RunResult = {
        runIndex: run,
        realDate,
        success: true,
        solveTimeMs,
        objectiveValue: response.objectiveValue,
        eligiblePreferences: metadata?.eligiblePreferences ?? 0,
        preferencesMet: metadata?.preferencesMet ?? 0,
        avgSatisfaction: metadata?.avgSatisfaction ?? 0,
        fairnessIndex: metadata?.fairnessIndex ?? 0,
        giniByRole: gini,
      };

      runResults.push(result);

      const avgGini = gini.size > 0 
        ? Array.from(gini.values()).reduce((a, b) => a + b, 0) / gini.size 
        : 0;

      console.log(`✓ ${(solveTimeMs / 1000).toFixed(1)}s | Sat: ${result.avgSatisfaction.toFixed(1)}% | Gini: ${avgGini.toFixed(4)}`);

    } catch (error) {
      console.log(`❌ Error: ${error}`);
      runResults.push({
        runIndex: run,
        realDate,
        success: false,
        solveTimeMs: 0,
        eligiblePreferences: 0,
        preferencesMet: 0,
        avgSatisfaction: 0,
        fairnessIndex: 0,
        giniByRole: new Map(),
      });
    }
  }

  // Calculate aggregates
  const successfulRuns = runResults.filter(r => r.success);
  const solveTimes = successfulRuns.map(r => r.solveTimeMs);
  const satisfactions = successfulRuns.map(r => r.avgSatisfaction);

  const avgSolveTime = solveTimes.length > 0 
    ? solveTimes.reduce((a, b) => a + b, 0) / solveTimes.length 
    : 0;
  const avgSatisfaction = satisfactions.length > 0 
    ? satisfactions.reduce((a, b) => a + b, 0) / satisfactions.length 
    : 0;

  // Calculate average Gini per role
  const avgGiniByRole = new Map<number, number>();
  for (const roleId of TRACKED_ROLE_IDS) {
    const ginis = successfulRuns
      .map(r => r.giniByRole.get(roleId))
      .filter((g): g is number => g !== undefined);
    if (ginis.length > 0) {
      avgGiniByRole.set(roleId, ginis.reduce((a, b) => a + b, 0) / ginis.length);
    }
  }

  const avgGini = avgGiniByRole.size > 0 
    ? Array.from(avgGiniByRole.values()).reduce((a, b) => a + b, 0) / avgGiniByRole.size 
    : 0;

  return {
    numRegions,
    shotsPerRegion,
    totalSolverCalls,
    runResults,
    successCount: successfulRuns.length,
    totalSolveTimeMs: solveTimes.reduce((a, b) => a + b, 0),
    avgSolveTimeMs: avgSolveTime,
    minSolveTimeMs: solveTimes.length > 0 ? Math.min(...solveTimes) : 0,
    maxSolveTimeMs: solveTimes.length > 0 ? Math.max(...solveTimes) : 0,
    stdDevSolveTimeMs: calculateStdDev(solveTimes, avgSolveTime),
    avgSatisfaction,
    minSatisfaction: satisfactions.length > 0 ? Math.min(...satisfactions) : 0,
    maxSatisfaction: satisfactions.length > 0 ? Math.max(...satisfactions) : 0,
    stdDevSatisfaction: calculateStdDev(satisfactions, avgSatisfaction),
    avgFairnessIndex: successfulRuns.length > 0 
      ? successfulRuns.map(r => r.fairnessIndex).reduce((a, b) => a + b, 0) / successfulRuns.length 
      : 0,
    avgGiniByRole,
    avgGini,
  };
}

function printResultsTable(results: ConfigTestResult[], roleNames: Map<number, string>): void {
  console.log('\n\n' + '═'.repeat(140));
  console.log('                                         SHOTS SCALING FINAL RESULTS');
  console.log('═'.repeat(140));

  // Header
  const roleHeaders = TRACKED_ROLE_IDS.map(id => (roleNames.get(id) ?? `Role${id}`).substring(0, 10).padStart(12)).join(' │');
  console.log(`\n┌─────────┬───────┬─────────────┬─────────────────────────────┬─────────────────────────────┬${'-'.repeat(12 * 3 + 6)}┬──────────┐`);
  console.log(`│ Regions │ Shots │ Solver Calls│         Time (s)            │       Satisfaction (%)      │${roleHeaders} │ Avg Gini │`);
  console.log(`│         │       │   /day      │   Avg  ±  Std  (min - max)  │   Avg  ±  Std  (min - max)  │${' '.repeat(12 * 3 + 4)}│          │`);
  console.log(`├─────────┼───────┼─────────────┼─────────────────────────────┼─────────────────────────────┼${'-'.repeat(12 * 3 + 6)}┼──────────┤`);

  for (const r of results) {
    const regions = r.numRegions.toString().padStart(7);
    const shots = r.shotsPerRegion.toString().padStart(5);
    const calls = r.totalSolverCalls.toString().padStart(11);
    
    const timeAvg = (r.avgSolveTimeMs / 1000).toFixed(1).padStart(5);
    const timeStd = (r.stdDevSolveTimeMs / 1000).toFixed(1).padStart(5);
    const timeMin = (r.minSolveTimeMs / 1000).toFixed(1).padStart(5);
    const timeMax = (r.maxSolveTimeMs / 1000).toFixed(1).padStart(5);
    
    const satAvg = r.avgSatisfaction.toFixed(1).padStart(5);
    const satStd = r.stdDevSatisfaction.toFixed(1).padStart(5);
    const satMin = r.minSatisfaction.toFixed(1).padStart(5);
    const satMax = r.maxSatisfaction.toFixed(1).padStart(5);
    
    const roleGinis = TRACKED_ROLE_IDS.map(id => {
      const g = r.avgGiniByRole.get(id);
      return g !== undefined ? g.toFixed(4).padStart(10) : 'N/A'.padStart(10);
    }).join(' │ ');
    
    const avgGini = r.avgGini.toFixed(4).padStart(8);
    
    console.log(`│ ${regions} │ ${shots} │ ${calls} │ ${timeAvg} ± ${timeStd} (${timeMin}-${timeMax}) │ ${satAvg} ± ${satStd} (${satMin}-${satMax}) │ ${roleGinis} │ ${avgGini} │`);
  }

  console.log(`└─────────┴───────┴─────────────┴─────────────────────────────┴─────────────────────────────┴${'-'.repeat(12 * 3 + 6)}┴──────────┘`);

  // Analysis
  console.log('\n' + '─'.repeat(140));
  console.log('ANALYSIS BY REGION COUNT:');

  for (const regionCount of REGION_COUNTS) {
    const regionResults = results.filter(r => r.numRegions === regionCount);
    console.log(`\n  📊 ${regionCount} Regions:`);
    
    const sortedByTime = [...regionResults].sort((a, b) => a.avgSolveTimeMs - b.avgSolveTimeMs);
    const sortedBySat = [...regionResults].sort((a, b) => b.avgSatisfaction - a.avgSatisfaction);
    const sortedByGini = [...regionResults].sort((a, b) => a.avgGini - b.avgGini);
    
    console.log(`     Fastest: ${sortedByTime[0].shotsPerRegion} shots (${(sortedByTime[0].avgSolveTimeMs / 1000).toFixed(1)}s)`);
    console.log(`     Best Satisfaction: ${sortedBySat[0].shotsPerRegion} shots (${sortedBySat[0].avgSatisfaction.toFixed(1)}%)`);
    console.log(`     Best Gini: ${sortedByGini[0].shotsPerRegion} shots (${sortedByGini[0].avgGini.toFixed(4)})`);
    
    // Check if more shots = better satisfaction
    const correlation = regionResults.length > 1 
      ? regionResults.map((r, i) => ({ shots: r.shotsPerRegion, sat: r.avgSatisfaction }))
      : [];
    if (correlation.length > 1) {
      const firstSat = correlation[0].sat;
      const lastSat = correlation[correlation.length - 1].sat;
      const improvement = lastSat - firstSat;
      console.log(`     Satisfaction trend (${correlation[0].shots}→${correlation[correlation.length-1].shots} shots): ${improvement >= 0 ? '+' : ''}${improvement.toFixed(2)}%`);
    }
  }

  // Overall recommendation
  console.log('\n' + '─'.repeat(140));
  console.log('OVERALL RECOMMENDATION:');
  
  const sortedByTime = [...results].sort((a, b) => a.avgSolveTimeMs - b.avgSolveTimeMs);
  const sortedBySat = [...results].sort((a, b) => b.avgSatisfaction - a.avgSatisfaction);
  const sortedByGini = [...results].sort((a, b) => a.avgGini - b.avgGini);
  
  console.log(`\n  ⏱️  Fastest: ${sortedByTime[0].numRegions}r × ${sortedByTime[0].shotsPerRegion}s (${(sortedByTime[0].avgSolveTimeMs / 1000).toFixed(1)}s)`);
  console.log(`  ✅ Best Satisfaction: ${sortedBySat[0].numRegions}r × ${sortedBySat[0].shotsPerRegion}s (${sortedBySat[0].avgSatisfaction.toFixed(1)}%)`);
  console.log(`  📊 Best Gini: ${sortedByGini[0].numRegions}r × ${sortedByGini[0].shotsPerRegion}s (${sortedByGini[0].avgGini.toFixed(4)})`);
  
  // Find sweet spot (top 10% satisfaction with fastest time)
  const satThreshold = sortedBySat[0].avgSatisfaction * 0.98;
  const goodResults = results.filter(r => r.avgSatisfaction >= satThreshold);
  const sweetSpot = goodResults.reduce((a, b) => a.avgSolveTimeMs < b.avgSolveTimeMs ? a : b);
  
  console.log(`\n  💡 SWEET SPOT (98% of best satisfaction, fastest time):`);
  console.log(`     Config: ${sweetSpot.numRegions} regions × ${sweetSpot.shotsPerRegion} shots`);
  console.log(`     Time: ${(sweetSpot.avgSolveTimeMs / 1000).toFixed(1)}s ± ${(sweetSpot.stdDevSolveTimeMs / 1000).toFixed(1)}s`);
  console.log(`     Satisfaction: ${sweetSpot.avgSatisfaction.toFixed(1)}% ± ${sweetSpot.stdDevSatisfaction.toFixed(1)}%`);
  console.log(`     Gini: ${sweetSpot.avgGini.toFixed(4)}`);
  console.log(`     Solver calls/day: ${sweetSpot.totalSolverCalls}`);
}

async function main(): Promise<void> {
  console.log('\n╔' + '═'.repeat(138) + '╗');
  console.log('║' + '                                        SHOTS SCALING TEST                                                                         '.substring(0, 138) + '║');
  console.log('║' + '                                   (Relay Runs / Ladder Analysis)                                                                  '.substring(0, 138) + '║');
  console.log('║' + ''.padEnd(138) + '║');
  console.log('║' + `  Regions tested: ${REGION_COUNTS.join(', ')}`.padEnd(138) + '║');
  console.log('║' + `  Shots per region: ${SHOTS_PER_REGION_VALUES.join(', ')}`.padEnd(138) + '║');
  console.log('║' + `  Runs per config: ${RUNS_PER_CONFIG} (for statistical significance)`.padEnd(138) + '║');
  console.log('║' + `  Total configurations: ${REGION_COUNTS.length * SHOTS_PER_REGION_VALUES.length}`.padEnd(138) + '║');
  console.log('║' + `  Total runs: ${REGION_COUNTS.length * SHOTS_PER_REGION_VALUES.length * RUNS_PER_CONFIG}`.padEnd(138) + '║');
  console.log('╚' + '═'.repeat(138) + '╝');

  const roleNames = await getRoleNames();
  console.log(`\nTracked roles: ${TRACKED_ROLE_IDS.map(id => roleNames.get(id) ?? id).join(', ')}`);

  const results: ConfigTestResult[] = [];
  const totalConfigs = REGION_COUNTS.length * SHOTS_PER_REGION_VALUES.length;
  let configIndex = 0;

  try {
    for (const regions of REGION_COUNTS) {
      for (const shots of SHOTS_PER_REGION_VALUES) {
        configIndex++;
        const result = await runConfigTest(regions, shots, configIndex, totalConfigs);
        results.push(result);
        
        // Live summary
        console.log(`\n  Summary: ${regions}r × ${shots}s = ${(result.avgSolveTimeMs / 1000).toFixed(1)}s avg, ${result.avgSatisfaction.toFixed(1)}% sat, ${result.avgGini.toFixed(4)} gini`);
      }
    }

    printResultsTable(results, roleNames);

    console.log('\n\n✅ Shots Scaling Test Complete!\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
