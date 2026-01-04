/**
 * Quadratic Penalties Test
 * 
 * Tests the impact of quadratic vs linear penalties on satisfaction.
 * 
 * Linear (default): penalty = weight * violation_count
 * Quadratic: penalty = weight * violation_count² (punishes large violations more heavily)
 * 
 * Runs 3 days × 3 runs each for both modes to compare.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// Configuration
// ============================================================================
const STORE_ID = 768;
const TEST_DATES = ['2025-11-25', '2025-12-13', '2025-12-15'];
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
  mode: 'linear' | 'quadratic';
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

async function runTuner(date: string, useQuadratic: boolean): Promise<{ response: TunerResponse; solveTimeMs: number }> {
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
        useQuadraticPenalties: useQuadratic,  // <-- NEW SETTING
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

async function runTestSuite(mode: 'linear' | 'quadratic', results: RunResult[]): Promise<void> {
  const useQuadratic = mode === 'quadratic';
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${mode.toUpperCase()} PENALTY MODE`);
  console.log(`${'═'.repeat(60)}`);

  for (const date of TEST_DATES) {
    console.log(`\n  DATE: ${date}`);

    for (let run = 0; run < RUNS_PER_DATE; run++) {
      // Clear data between runs
      await clearTestData();

      process.stdout.write(`    Run ${run + 1}/${RUNS_PER_DATE}...`);

      try {
        const { response, solveTimeMs } = await runTuner(date, useQuadratic);

        if (!response.success) {
          console.log(` ❌ Failed`);
          results.push({
            mode,
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
          mode,
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

        console.log(` ✓ ${(solveTimeMs / 1000).toFixed(1)}s | Sat: ${result.avgSatisfaction.toFixed(1)}% | Met: ${result.preferencesMet}/${result.eligiblePreferences}`);

      } catch (error) {
        console.log(` ❌ Error: ${error}`);
      }
    }
  }
}

function printModeSummary(mode: 'linear' | 'quadratic', runs: RunResult[]): void {
  const successful = runs.filter(r => r.success);
  
  if (successful.length === 0) {
    console.log(`\n  ${mode.toUpperCase()}: No successful runs!`);
    return;
  }

  const avgTime = successful.reduce((a, b) => a + b.solveTimeMs, 0) / successful.length;
  const avgSat = successful.reduce((a, b) => a + b.avgSatisfaction, 0) / successful.length;
  const avgFairness = successful.reduce((a, b) => a + b.fairnessIndex, 0) / successful.length;
  const minSat = Math.min(...successful.map(r => r.avgSatisfaction));
  const maxSat = Math.max(...successful.map(r => r.avgSatisfaction));

  console.log(`\n  ${mode.toUpperCase()} MODE RESULTS:`);
  console.log(`    Successful: ${successful.length}/${runs.length}`);
  console.log(`    Avg Time: ${(avgTime / 1000).toFixed(1)}s`);
  console.log(`    Avg Satisfaction: ${avgSat.toFixed(2)}%`);
  console.log(`    Sat Range: ${minSat.toFixed(1)}% - ${maxSat.toFixed(1)}%`);
  console.log(`    Avg Fairness: ${avgFairness.toFixed(2)}%`);
}

async function main(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║           QUADRATIC vs LINEAR PENALTIES TEST                       ║');
  console.log('║                                                                    ║');
  console.log('║  Linear: penalty = weight × violation_count                        ║');
  console.log('║  Quadratic: penalty = weight × violation_count²                    ║');
  console.log('║                                                                    ║');
  console.log(`║  Config: ${NUM_REGIONS} regions × ${SHOTS_PER_REGION} shots × ${RUNS_PER_DATE} runs/date                      ║`);
  console.log(`║  Dates: ${TEST_DATES.join(', ')}                        ║`);
  console.log(`║  Total runs: ${TEST_DATES.length * RUNS_PER_DATE * 2} (${TEST_DATES.length * RUNS_PER_DATE} per mode)                                  ║`);
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  const results: RunResult[] = [];

  try {
    // Test LINEAR mode first (baseline)
    await runTestSuite('linear', results);
    
    // Test QUADRATIC mode
    await runTestSuite('quadratic', results);

    // Print comparison summary
    console.log('\n\n' + '═'.repeat(70));
    console.log('                 COMPARISON SUMMARY');
    console.log('═'.repeat(70));

    const linearRuns = results.filter(r => r.mode === 'linear');
    const quadraticRuns = results.filter(r => r.mode === 'quadratic');

    printModeSummary('linear', linearRuns);
    printModeSummary('quadratic', quadraticRuns);

    // Compute delta
    const linearSuccess = linearRuns.filter(r => r.success);
    const quadSuccess = quadraticRuns.filter(r => r.success);

    if (linearSuccess.length > 0 && quadSuccess.length > 0) {
      const linearAvgSat = linearSuccess.reduce((a, b) => a + b.avgSatisfaction, 0) / linearSuccess.length;
      const quadAvgSat = quadSuccess.reduce((a, b) => a + b.avgSatisfaction, 0) / quadSuccess.length;
      const delta = quadAvgSat - linearAvgSat;

      console.log(`\n  ${'─'.repeat(50)}`);
      console.log(`  DELTA (Quadratic - Linear):`);
      console.log(`    Satisfaction: ${delta > 0 ? '+' : ''}${delta.toFixed(2)}%`);
      
      if (delta > 0.5) {
        console.log(`    → Quadratic penalties IMPROVED satisfaction! ✅`);
      } else if (delta < -0.5) {
        console.log(`    → Quadratic penalties DECREASED satisfaction ❌`);
      } else {
        console.log(`    → No significant difference detected`);
      }
    }

    console.log('\n\n✅ Quadratic Penalty Test Complete!\n');

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
