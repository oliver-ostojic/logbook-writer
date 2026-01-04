/**
 * LNS Comparison Test
 * 
 * Tests the impact of Large Neighborhood Search (LNS) on satisfaction.
 * Runs 3 days × 3 runs each to compare before (LNS just enabled) vs baseline.
 * 
 * Uses standard tuning engine config:
 * - 10 regions
 * - 3 shots per region (ladder)
 * - 1 worker per region
 * - 10s time limit per shot
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// Configuration
// ============================================================================
const STORE_ID = 768;
const TEST_DATES = ['2025-11-25', '2025-12-13', '2025-12-15'];
const TRACKED_ROLE_IDS = [29, 37, 38];
const API_URL = 'http://localhost:4000';

// Standard tuning config
const NUM_REGIONS = 10;
const SHOTS_PER_REGION = 3;
const WORKERS_PER_REGION = 1;
const TIME_LIMIT_PER_SHOT = 10;
const RUNS_PER_DATE = 3;

// ============================================================================
// Types
// ============================================================================
interface TunerResponse {
  success: boolean;
  objectiveValue?: number;
  metadata?: {
    runtimeMs?: number;
    satisfactionScore?: number;
    fairnessIndex?: number;
  };
}

interface RunResult {
  date: string;
  runIndex: number;
  success: boolean;
  solveTimeMs: number;
  eligiblePreferences: number;
  preferencesMet: number;
  avgSatisfaction: number;
  fairnessIndex: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

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

async function runTuner(date: string): Promise<{ response: TunerResponse; solveTimeMs: number }> {
  const startTime = Date.now();

  const res = await fetch(`${API_URL}/solver/v2/tune`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID,
      date,
      saveLogbook: true,
      tuningConfig: {
        numRegions: NUM_REGIONS,
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

async function getLogbookMetadata(date: string): Promise<{
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

async function main(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              LNS ENABLED - SATISFACTION TEST                   ║');
  console.log('║                                                                ║');
  console.log(`║  Config: ${NUM_REGIONS} regions × ${SHOTS_PER_REGION} shots = ${NUM_REGIONS * SHOTS_PER_REGION} solver calls/day       ║`);
  console.log(`║  Dates: ${TEST_DATES.join(', ')}                       ║`);
  console.log(`║  Runs per date: ${RUNS_PER_DATE}                                          ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const results: RunResult[] = [];

  try {
    for (const date of TEST_DATES) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`DATE: ${date}`);
      console.log(`${'─'.repeat(60)}`);

      for (let run = 0; run < RUNS_PER_DATE; run++) {
        // Clear data between runs
        await clearTestData();

        console.log(`  Run ${run + 1}/${RUNS_PER_DATE}...`);

        try {
          const { response, solveTimeMs } = await runTuner(date);

          if (!response.success) {
            console.log(`    ❌ Failed`);
            results.push({
              date,
              runIndex: run,
              success: false,
              solveTimeMs,
              eligiblePreferences: 0,
              preferencesMet: 0,
              avgSatisfaction: 0,
              fairnessIndex: 0,
            });
            continue;
          }

          const metadata = await getLogbookMetadata(date);

          const result: RunResult = {
            date,
            runIndex: run,
            success: true,
            solveTimeMs,
            eligiblePreferences: metadata?.eligiblePreferences ?? 0,
            preferencesMet: metadata?.preferencesMet ?? 0,
            avgSatisfaction: metadata?.avgSatisfaction ?? 0,
            fairnessIndex: metadata?.fairnessIndex ?? 0,
          };

          results.push(result);

          console.log(`    ✓ ${(solveTimeMs / 1000).toFixed(1)}s | Sat: ${result.avgSatisfaction.toFixed(1)}% | Met: ${result.preferencesMet}/${result.eligiblePreferences}`);

        } catch (error) {
          console.log(`    ❌ Error: ${error}`);
        }
      }
    }

    // Print summary
    console.log('\n\n' + '═'.repeat(70));
    console.log('                    LNS TEST RESULTS SUMMARY');
    console.log('═'.repeat(70));

    const successfulRuns = results.filter(r => r.success);
    
    if (successfulRuns.length === 0) {
      console.log('\n  No successful runs!');
    } else {
      const avgTime = successfulRuns.reduce((a, b) => a + b.solveTimeMs, 0) / successfulRuns.length;
      const avgSat = successfulRuns.reduce((a, b) => a + b.avgSatisfaction, 0) / successfulRuns.length;
      const avgFairness = successfulRuns.reduce((a, b) => a + b.fairnessIndex, 0) / successfulRuns.length;
      const minSat = Math.min(...successfulRuns.map(r => r.avgSatisfaction));
      const maxSat = Math.max(...successfulRuns.map(r => r.avgSatisfaction));

      console.log(`\n  Successful runs: ${successfulRuns.length}/${results.length}`);
      console.log(`\n  ⏱️  Average Time: ${(avgTime / 1000).toFixed(1)}s`);
      console.log(`\n  ✅ Satisfaction:`);
      console.log(`     Average: ${avgSat.toFixed(2)}%`);
      console.log(`     Range: ${minSat.toFixed(1)}% - ${maxSat.toFixed(1)}%`);
      console.log(`\n  📊 Fairness Index: ${avgFairness.toFixed(2)}%`);

      // Per-date breakdown
      console.log(`\n  Per-date breakdown:`);
      for (const date of TEST_DATES) {
        const dateRuns = successfulRuns.filter(r => r.date === date);
        if (dateRuns.length > 0) {
          const dateSat = dateRuns.reduce((a, b) => a + b.avgSatisfaction, 0) / dateRuns.length;
          const dateTime = dateRuns.reduce((a, b) => a + b.solveTimeMs, 0) / dateRuns.length;
          console.log(`     ${date}: ${dateSat.toFixed(1)}% sat, ${(dateTime / 1000).toFixed(1)}s`);
        }
      }
    }

    console.log('\n\n✅ LNS Test Complete!\n');
    console.log('Compare these results against previous runs without LNS:');
    console.log('  - Previous avg satisfaction was ~64-65%');
    console.log('  - If LNS helps, we should see improvement\n');

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
