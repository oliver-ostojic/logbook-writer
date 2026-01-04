/**
 * Test: Warmstart Hints Performance
 * 
 * Compares solver performance with and without warmstart hints.
 * Uses CrewRoleRule-based satisfaction (the real metric) via logbook save.
 * 
 * Test Plan:
 * 1. Run 12/13 cold (no hints) - 3 runs
 * 2. Run 12/15 cold (no hints) - 3 runs  
 * 3. Run 12/15 warm (using 12/13's assignments as hints) - 3 runs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:4000';
const STORE_ID = 768;
const TIME_LIMIT = 60;  // 60 seconds per solve
const NUM_WORKERS = 10;

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
  success: boolean;
  timeMs: number;
  satisfaction: number;  // From CrewRoleRule-based calculation
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
    // Delete related records first (cascade manually)
    await prisma.assignment.deleteMany({ where: { logbookId: logbook.id } });
    await prisma.preferenceSatisfaction.deleteMany({ where: { logbookId: logbook.id } });
    await prisma.logPreferenceMetadata.deleteMany({ where: { logbookId: logbook.id } });
    await prisma.logbook.delete({ where: { id: logbook.id } });
  }
}

async function runSolver(
  date: string,
  solutionHint?: SolverAssignment[]
): Promise<{ result: RunResult; assignments: SolverAssignment[] }> {
  // Delete any existing logbook for this date first
  await deleteLogbook(date);
  
  const body: Record<string, unknown> = {
    storeId: STORE_ID,
    date,
    timeLimitSeconds: TIME_LIMIT,
    numWorkers: NUM_WORKERS,
    saveLogbook: true,  // Save logbook to get real satisfaction
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
  
  // Get real satisfaction from database (CrewRoleRule-based)
  const satisfaction = await getSatisfactionFromDb(date);

  return {
    result: {
      success: data.success,
      timeMs: data.metadata?.runtimeMs ?? 0,
      satisfaction,
      objectiveValue: data.objectiveValue,
      numAssignments: data.assignments?.length ?? 0,
    },
    assignments: data.assignments ?? [],
  };
}

interface TestResults {
  coldHintSource: RunResult[];
  coldBaseline: RunResult[];
  warmStart: RunResult[];
}

async function runTest(): Promise<TestResults> {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                 WARMSTART HINTS TEST                               ║
║                                                                    ║
║  Test Plan:                                                        ║
║  1. Solve 12/13 cold (get hints)                                   ║
║  2. Solve 12/15 cold (baseline)                                    ║
║  3. Solve 12/15 warm (using 12/13 hints)                           ║
║                                                                    ║
║  Config: ${TIME_LIMIT}s time limit × ${NUM_WORKERS} workers                             ║
║  Satisfaction: CrewRoleRule-based (real metric)                    ║
╚════════════════════════════════════════════════════════════════════╝
`);

  const runsPerMode = 3;
  let hintsFrom1213: SolverAssignment[] = [];
  
  const results: TestResults = {
    coldHintSource: [],
    coldBaseline: [],
    warmStart: [],
  };

  // ═══════════════════════════════════════════════════════════════
  // PART 1: Solve 12/13 to get hints
  // ═══════════════════════════════════════════════════════════════
  console.log(`${'═'.repeat(60)}`);
  console.log(`  STEP 1: Solve 2025-12-13 (cold) to get hints`);
  console.log(`${'═'.repeat(60)}\n`);

  for (let run = 1; run <= runsPerMode; run++) {
    process.stdout.write(`    Run ${run}/${runsPerMode}... `);
    
    try {
      const { result, assignments } = await runSolver('2025-12-13');
      
      // Save assignments from first run to use as hints
      if (run === 1) {
        hintsFrom1213 = assignments;
      }
      
      results.coldHintSource.push(result);
      console.log(`✓ ${(result.timeMs / 1000).toFixed(1)}s | Sat: ${result.satisfaction.toFixed(1)}% | Assigns: ${result.numAssignments}`);
    } catch (error) {
      console.log(`❌ Error: ${error}`);
    }
  }

  console.log(`\n  📦 Saved ${hintsFrom1213.length} assignments as hints for 12/15\n`);

  // ═══════════════════════════════════════════════════════════════
  // PART 2: Solve 12/15 COLD (baseline)
  // ═══════════════════════════════════════════════════════════════
  console.log(`${'═'.repeat(60)}`);
  console.log(`  STEP 2: Solve 2025-12-15 COLD (no hints) - baseline`);
  console.log(`${'═'.repeat(60)}\n`);

  for (let run = 1; run <= runsPerMode; run++) {
    process.stdout.write(`    Run ${run}/${runsPerMode}... `);
    
    try {
      const { result } = await runSolver('2025-12-15');
      results.coldBaseline.push(result);
      console.log(`✓ ${(result.timeMs / 1000).toFixed(1)}s | Sat: ${result.satisfaction.toFixed(1)}% | Assigns: ${result.numAssignments}`);
    } catch (error) {
      console.log(`❌ Error: ${error}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PART 3: Solve 12/15 WARM (with hints from 12/13)
  // ═══════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  STEP 3: Solve 2025-12-15 WARM (with ${hintsFrom1213.length} hints)`);
  console.log(`${'═'.repeat(60)}\n`);

  for (let run = 1; run <= runsPerMode; run++) {
    process.stdout.write(`    Run ${run}/${runsPerMode}... `);
    
    try {
      const { result } = await runSolver('2025-12-15', hintsFrom1213);
      results.warmStart.push(result);
      console.log(`✓ ${(result.timeMs / 1000).toFixed(1)}s | Sat: ${result.satisfaction.toFixed(1)}% | Assigns: ${result.numAssignments}`);
    } catch (error) {
      console.log(`❌ Error: ${error}`);
    }
  }

  return results;
}

function printSummary(results: TestResults): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS SUMMARY`);
  console.log(`${'═'.repeat(60)}\n`);

  const avg = (arr: number[]): number => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  
  const coldHintSourceTimes = results.coldHintSource.map(r => r.timeMs);
  const coldHintSourceSats = results.coldHintSource.map(r => r.satisfaction);
  
  const coldBaselineTimes = results.coldBaseline.map(r => r.timeMs);
  const coldBaselineSats = results.coldBaseline.map(r => r.satisfaction);
  
  const warmStartTimes = results.warmStart.map(r => r.timeMs);
  const warmStartSats = results.warmStart.map(r => r.satisfaction);

  console.log(`  12/13 Cold (hint source):`);
  console.log(`    Avg Time: ${(avg(coldHintSourceTimes) / 1000).toFixed(1)}s`);
  console.log(`    Avg Satisfaction: ${avg(coldHintSourceSats).toFixed(1)}%`);
  
  console.log(`\n  12/15 Cold (baseline):`);
  console.log(`    Avg Time: ${(avg(coldBaselineTimes) / 1000).toFixed(1)}s`);
  console.log(`    Avg Satisfaction: ${avg(coldBaselineSats).toFixed(1)}%`);
  
  console.log(`\n  12/15 Warm (with hints):`);
  console.log(`    Avg Time: ${(avg(warmStartTimes) / 1000).toFixed(1)}s`);
  console.log(`    Avg Satisfaction: ${avg(warmStartSats).toFixed(1)}%`);

  // Calculate deltas
  const timeDelta = avg(warmStartTimes) - avg(coldBaselineTimes);
  const satDelta = avg(warmStartSats) - avg(coldBaselineSats);
  
  console.log(`\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  WARMSTART IMPACT (vs cold baseline):`);
  console.log(`    Time Delta: ${timeDelta > 0 ? '+' : ''}${(timeDelta / 1000).toFixed(1)}s (${timeDelta > 0 ? 'SLOWER' : 'FASTER'})`);
  console.log(`    Satisfaction Delta: ${satDelta > 0 ? '+' : ''}${satDelta.toFixed(1)}% (${satDelta > 0 ? 'BETTER' : satDelta < 0 ? 'WORSE' : 'SAME'})`);
  console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

async function saveResults(results: TestResults): Promise<void> {
  const fs = await import('fs');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const filename = `apps/api/scripts/results/warmstart-hints-${timestamp}.json`;
  
  fs.writeFileSync(filename, JSON.stringify({
    timestamp: new Date().toISOString(),
    config: { storeId: STORE_ID, timeLimit: TIME_LIMIT, numWorkers: NUM_WORKERS },
    results,
  }, null, 2));
  
  console.log(`\n  📁 Results saved to: ${filename}`);
}

async function main() {
  try {
    const results = await runTest();
    printSummary(results);
    await saveResults(results);
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
