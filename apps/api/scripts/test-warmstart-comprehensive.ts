/**
 * Comprehensive Warmstart Hints Test
 * 
 * Duration: ~30 minutes
 * 
 * Test Sections:
 * 1. SAME-DAY RE-SOLVE: Cold A → Cold B vs Cold A → Warm C (best use case)
 * 2. TIME-CONSTRAINED: 15s and 30s limits (where hints should shine)
 * 3. STATISTICAL: 5 dates × 5 runs per mode with std dev
 * 
 * Metrics tracked:
 * - Time to solution
 * - Satisfaction % (CrewRoleRule-based)
 * - First solution time (if available)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:4000';
const STORE_ID = 768;
const NUM_WORKERS = 10;

// Test dates - spread across different days
const TEST_DATES = [
  '2025-11-25',
  '2025-12-13', 
  '2025-12-15',
  '2025-12-16',
  '2025-12-17',
];

interface SolverAssignment {
  crewId: string;
  roleId: number;
  startMinute: number;
  endMinute: number;
}

interface SolverResponse {
  success: boolean;
  status: string;
  objectiveValue: number;
  logbookId?: string;
  assignments: SolverAssignment[];
  metadata: {
    runtimeMs: number;
  };
}

interface RunResult {
  date: string;
  mode: 'cold' | 'warm';
  timeLimit: number;
  success: boolean;
  timeMs: number;
  satisfaction: number;
  objectiveValue: number;
  numAssignments: number;
}

// Get satisfaction from the database (CrewRoleRule-based)
async function getSatisfactionFromDb(date: string): Promise<number> {
  const logbook = await prisma.logbook.findFirst({
    where: { storeId: STORE_ID, date: new Date(date) },
    select: { id: true },
  });
  
  if (!logbook) return 0;
  
  const metadata = await prisma.logPreferenceMetadata.findUnique({
    where: { logbookId: logbook.id },
    select: { avgSatisfaction: true },
  });
  
  return metadata?.avgSatisfaction ?? 0;
}

// Delete logbook for a date (cleanup between runs)
async function deleteLogbook(date: string): Promise<void> {
  const logbook = await prisma.logbook.findFirst({
    where: { storeId: STORE_ID, date: new Date(date) },
    select: { id: true },
  });
  
  if (logbook) {
    await prisma.assignment.deleteMany({ where: { logbookId: logbook.id } });
    await prisma.preferenceSatisfaction.deleteMany({ where: { logbookId: logbook.id } });
    await prisma.logPreferenceMetadata.deleteMany({ where: { logbookId: logbook.id } });
    await prisma.logbook.delete({ where: { id: logbook.id } });
  }
}

async function runSolver(
  date: string,
  timeLimit: number,
  solutionHint?: SolverAssignment[]
): Promise<{ result: RunResult; assignments: SolverAssignment[] }> {
  await deleteLogbook(date);
  
  const body: Record<string, unknown> = {
    storeId: STORE_ID,
    date,
    timeLimitSeconds: timeLimit,
    numWorkers: NUM_WORKERS,
    saveLogbook: true,
  };

  if (solutionHint && solutionHint.length > 0) {
    body.solutionHint = solutionHint;
  }

  const res = await fetch(`${API_URL}/solver/v2/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as SolverResponse;
  const satisfaction = await getSatisfactionFromDb(date);

  return {
    result: {
      date,
      mode: solutionHint ? 'warm' : 'cold',
      timeLimit,
      success: data.success,
      timeMs: data.metadata?.runtimeMs ?? 0,
      satisfaction,
      objectiveValue: data.objectiveValue,
      numAssignments: data.assignments?.length ?? 0,
    },
    assignments: data.assignments ?? [],
  };
}

// Statistical helpers
function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  const squareDiffs = arr.map(x => Math.pow(x - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

function tTest(group1: number[], group2: number[]): { tStat: number; significant: boolean } {
  const n1 = group1.length;
  const n2 = group2.length;
  const mean1 = mean(group1);
  const mean2 = mean(group2);
  const var1 = stdDev(group1) ** 2;
  const var2 = stdDev(group2) ** 2;
  
  const pooledSE = Math.sqrt(var1 / n1 + var2 / n2);
  const tStat = pooledSE > 0 ? (mean1 - mean2) / pooledSE : 0;
  
  // Rough significance check (|t| > 2 for ~95% confidence with df > 10)
  return { tStat, significant: Math.abs(tStat) > 2 };
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: Same-Day Re-Solve Test
// ═══════════════════════════════════════════════════════════════════
async function testSameDayResolve(): Promise<{
  coldBaseline: RunResult[];
  warmResolve: RunResult[];
}> {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  SECTION 1: SAME-DAY RE-SOLVE TEST`);
  console.log(`  (Does warm-starting help when re-solving the same day?)`);
  console.log(`${'═'.repeat(70)}\n`);

  const testDate = '2025-12-15';
  const timeLimit = 30;
  const runs = 5;
  
  const coldBaseline: RunResult[] = [];
  const warmResolve: RunResult[] = [];

  for (let i = 0; i < runs; i++) {
    console.log(`  Run ${i + 1}/${runs}:`);
    
    // Step 1: Solve cold to get hints
    process.stdout.write(`    Cold solve A (get hints)... `);
    const { result: coldA, assignments: hintsA } = await runSolver(testDate, timeLimit);
    console.log(`✓ ${(coldA.timeMs / 1000).toFixed(1)}s | Sat: ${coldA.satisfaction.toFixed(1)}%`);
    
    // Step 2: Solve cold again (baseline for comparison)
    process.stdout.write(`    Cold solve B (baseline)... `);
    const { result: coldB } = await runSolver(testDate, timeLimit);
    coldBaseline.push(coldB);
    console.log(`✓ ${(coldB.timeMs / 1000).toFixed(1)}s | Sat: ${coldB.satisfaction.toFixed(1)}%`);
    
    // Step 3: Solve warm (using A's hints)
    process.stdout.write(`    Warm solve C (with hints)... `);
    const { result: warmC } = await runSolver(testDate, timeLimit, hintsA);
    warmResolve.push(warmC);
    console.log(`✓ ${(warmC.timeMs / 1000).toFixed(1)}s | Sat: ${warmC.satisfaction.toFixed(1)}%`);
    
    console.log('');
  }

  // Summary
  const coldSats = coldBaseline.map(r => r.satisfaction);
  const warmSats = warmResolve.map(r => r.satisfaction);
  const coldTimes = coldBaseline.map(r => r.timeMs);
  const warmTimes = warmResolve.map(r => r.timeMs);
  
  console.log(`  ┌─────────────────────────────────────────────────────────────┐`);
  console.log(`  │ SAME-DAY RE-SOLVE RESULTS                                   │`);
  console.log(`  ├─────────────────────────────────────────────────────────────┤`);
  console.log(`  │ Cold B:  Sat ${mean(coldSats).toFixed(1)}% ± ${stdDev(coldSats).toFixed(1)}  |  Time ${(mean(coldTimes)/1000).toFixed(1)}s ± ${(stdDev(coldTimes)/1000).toFixed(1)}s │`);
  console.log(`  │ Warm C:  Sat ${mean(warmSats).toFixed(1)}% ± ${stdDev(warmSats).toFixed(1)}  |  Time ${(mean(warmTimes)/1000).toFixed(1)}s ± ${(stdDev(warmTimes)/1000).toFixed(1)}s │`);
  console.log(`  │ Delta:   ${mean(warmSats) - mean(coldSats) >= 0 ? '+' : ''}${(mean(warmSats) - mean(coldSats)).toFixed(1)}%                    |  ${mean(warmTimes) - mean(coldTimes) >= 0 ? '+' : ''}${((mean(warmTimes) - mean(coldTimes))/1000).toFixed(1)}s            │`);
  console.log(`  └─────────────────────────────────────────────────────────────┘`);

  return { coldBaseline, warmResolve };
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 2: Time-Constrained Test
// ═══════════════════════════════════════════════════════════════════
async function testTimeConstrained(): Promise<{
  results15s: { cold: RunResult[]; warm: RunResult[] };
  results30s: { cold: RunResult[]; warm: RunResult[] };
}> {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  SECTION 2: TIME-CONSTRAINED TEST`);
  console.log(`  (Do hints help more when time is limited?)`);
  console.log(`${'═'.repeat(70)}\n`);

  const testDate = '2025-12-13';
  const runs = 4;
  
  const results15s = { cold: [] as RunResult[], warm: [] as RunResult[] };
  const results30s = { cold: [] as RunResult[], warm: [] as RunResult[] };

  // First get hints with a longer solve
  console.log(`  Getting hints (60s solve)...`);
  const { assignments: hints } = await runSolver(testDate, 60);
  console.log(`  ✓ Got ${hints.length} assignments as hints\n`);

  for (const timeLimit of [15, 30]) {
    console.log(`  Testing ${timeLimit}s time limit:`);
    const results = timeLimit === 15 ? results15s : results30s;
    
    for (let i = 0; i < runs; i++) {
      process.stdout.write(`    Run ${i + 1}/${runs} Cold... `);
      const { result: cold } = await runSolver(testDate, timeLimit);
      results.cold.push(cold);
      console.log(`✓ ${cold.satisfaction.toFixed(1)}%`);
      
      process.stdout.write(`    Run ${i + 1}/${runs} Warm... `);
      const { result: warm } = await runSolver(testDate, timeLimit, hints);
      results.warm.push(warm);
      console.log(`✓ ${warm.satisfaction.toFixed(1)}%`);
    }
    console.log('');
  }

  // Summary
  for (const [label, results] of [['15s', results15s], ['30s', results30s]] as const) {
    const coldSats = results.cold.map(r => r.satisfaction);
    const warmSats = results.warm.map(r => r.satisfaction);
    const delta = mean(warmSats) - mean(coldSats);
    
    console.log(`  ${label}: Cold ${mean(coldSats).toFixed(1)}% ± ${stdDev(coldSats).toFixed(1)} → Warm ${mean(warmSats).toFixed(1)}% ± ${stdDev(warmSats).toFixed(1)} (Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%)`);
  }

  return { results15s, results30s };
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 3: Multi-Date Statistical Test
// ═══════════════════════════════════════════════════════════════════
async function testMultiDateStatistical(): Promise<{
  allCold: RunResult[];
  allWarm: RunResult[];
}> {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  SECTION 3: MULTI-DATE STATISTICAL TEST`);
  console.log(`  (Is the improvement statistically significant?)`);
  console.log(`${'═'.repeat(70)}\n`);

  const timeLimit = 30;
  const runsPerDate = 3;  // 5 dates × 3 runs × 2 modes = 30 solves
  
  const allCold: RunResult[] = [];
  const allWarm: RunResult[] = [];

  for (const date of TEST_DATES) {
    console.log(`  Date: ${date}`);
    
    // Get hints first
    const { assignments: hints } = await runSolver(date, timeLimit);
    
    for (let run = 0; run < runsPerDate; run++) {
      process.stdout.write(`    Run ${run + 1}/${runsPerDate}... `);
      
      const { result: cold } = await runSolver(date, timeLimit);
      allCold.push(cold);
      
      const { result: warm } = await runSolver(date, timeLimit, hints);
      allWarm.push(warm);
      
      console.log(`Cold: ${cold.satisfaction.toFixed(1)}% | Warm: ${warm.satisfaction.toFixed(1)}%`);
    }
    console.log('');
  }

  // Statistical analysis
  const coldSats = allCold.map(r => r.satisfaction);
  const warmSats = allWarm.map(r => r.satisfaction);
  const { tStat, significant } = tTest(warmSats, coldSats);

  console.log(`  ┌─────────────────────────────────────────────────────────────┐`);
  console.log(`  │ STATISTICAL ANALYSIS (${allCold.length} samples per group)              │`);
  console.log(`  ├─────────────────────────────────────────────────────────────┤`);
  console.log(`  │ Cold: ${mean(coldSats).toFixed(2)}% ± ${stdDev(coldSats).toFixed(2)}%                                  │`);
  console.log(`  │ Warm: ${mean(warmSats).toFixed(2)}% ± ${stdDev(warmSats).toFixed(2)}%                                  │`);
  console.log(`  │ Delta: ${(mean(warmSats) - mean(coldSats)).toFixed(2)}%                                       │`);
  console.log(`  │ t-statistic: ${tStat.toFixed(3)}                                      │`);
  console.log(`  │ Significant (p<0.05): ${significant ? 'YES ✓' : 'NO ✗'}                              │`);
  console.log(`  └─────────────────────────────────────────────────────────────┘`);

  return { allCold, allWarm };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║           COMPREHENSIVE WARMSTART HINTS TEST                         ║
║                                                                      ║
║  Duration: ~30 minutes                                               ║
║  Store: ${STORE_ID}                                                          ║
║  Workers: ${NUM_WORKERS}                                                         ║
║                                                                      ║
║  Sections:                                                           ║
║  1. Same-Day Re-Solve (best use case for hints)                      ║
║  2. Time-Constrained (15s, 30s limits)                               ║
║  3. Multi-Date Statistical (significance testing)                    ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  const startTime = Date.now();
  
  try {
    // Run all sections
    const section1 = await testSameDayResolve();
    const section2 = await testTimeConstrained();
    const section3 = await testMultiDateStatistical();

    // Final summary
    const elapsedMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  FINAL SUMMARY`);
    console.log(`${'═'.repeat(70)}\n`);
    
    console.log(`  Total test time: ${elapsedMin} minutes`);
    console.log(`  Total solver calls: ${
      section1.coldBaseline.length * 3 +  // A, B, C per run
      section2.results15s.cold.length * 2 + section2.results15s.warm.length * 2 +
      section3.allCold.length + section3.allWarm.length + TEST_DATES.length
    }`);

    // Save results
    const fs = await import('fs');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `apps/api/scripts/results/warmstart-comprehensive-${timestamp}.json`;
    
    fs.writeFileSync(filename, JSON.stringify({
      timestamp: new Date().toISOString(),
      config: { storeId: STORE_ID, numWorkers: NUM_WORKERS, testDates: TEST_DATES },
      section1_sameDayResolve: section1,
      section2_timeConstrained: section2,
      section3_multiDateStatistical: section3,
    }, null, 2));
    
    console.log(`\n  📁 Results saved to: ${filename}`);

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
