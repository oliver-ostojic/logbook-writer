/**
 * A/B Test: Fairness Tracking Impact
 * 
 * Compares solver outcomes with fairness tracking DISABLED vs ENABLED
 * for dates: 11/25, 12/13, 12/15, 12/16
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STORE_ID = 768;
const TEST_DATES = ['2025-11-25', '2025-12-13', '2025-12-15', '2025-12-16'];
const TRACKED_ROLE_IDS = [29, 37, 38]; // Parking Helms, Wine Demo, Food Demo
const API_URL = 'http://localhost:4000';

interface SolverResult {
  success: boolean;
  logbookId?: string;
  objectiveValue?: number;
}

interface FairnessMetrics {
  roleId: number;
  roleName: string;
  giniCoefficient: number;
  fairnessIndex: number;
  fairnessGrade: string;
  minMph: number;
  maxMph: number;
  avgMph: number;
  stdDeviation: number;
  eligibleCrew: number;
  crewWithMinutes: number;
}

interface DateResult {
  date: string;
  logbookId?: string;
  success: boolean;
  fairnessMetrics: FairnessMetrics[];
}

interface PhaseResult {
  phase: string;
  results: DateResult[];
}

async function runSolver(date: string, saveLogbook: boolean, skipFairnessWeights: boolean = false): Promise<SolverResult> {
  const response = await fetch(`${API_URL}/solver/v2/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID,
      date,
      saveLogbook,
      skipFairnessWeights,  // If true, solver won't apply fairness boost/penalty
      timeLimitSeconds: 60,  // 60s should be enough to find optimal
    }),
  });
  
  const data = await response.json();
  return {
    success: data.success,
    logbookId: data.logbookId,
    objectiveValue: data.objectiveValue,
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
    fairnessGrade: s.fairnessGrade,
    minMph: s.minMinutesPerDay,
    maxMph: s.maxMinutesPerDay,
    avgMph: s.avgMinutesPerDay,
    stdDeviation: s.stdDeviation,
    eligibleCrew: s.eligibleCrew,
    crewWithMinutes: s.crewWithMinutes,
  }));
}

async function clearFairnessData(): Promise<void> {
  await prisma.crewRoleFairnessHistory.deleteMany({ where: { storeId: STORE_ID } });
  await prisma.roleFairnessSnapshot.deleteMany({ where: { storeId: STORE_ID } });
  console.log('  ✓ Cleared fairness history and snapshots');
}

async function deleteLogbooks(): Promise<void> {
  // Delete in order: PreferenceSatisfaction -> LogPreferenceMetadata -> Assignment -> Run -> Logbook
  const logbooks = await prisma.logbook.findMany({
    where: {
      storeId: STORE_ID,
      date: { in: TEST_DATES.map(d => new Date(d)) },
    },
    select: { id: true },
  });
  
  const logbookIds = logbooks.map(l => l.id);
  if (logbookIds.length === 0) {
    console.log('  ✓ No existing logbooks to delete');
    return;
  }
  
  await prisma.preferenceSatisfaction.deleteMany({ where: { logbookId: { in: logbookIds } } });
  await prisma.logPreferenceMetadata.deleteMany({ where: { logbookId: { in: logbookIds } } });
  await prisma.assignment.deleteMany({ where: { logbookId: { in: logbookIds } } });
  await prisma.run.deleteMany({ where: { logbookId: { in: logbookIds } } });
  await prisma.logbook.deleteMany({ where: { id: { in: logbookIds } } });
  
  console.log(`  ✓ Deleted ${logbookIds.length} existing logbooks for test dates`);
}

async function setFairnessTrackerEnabled(enabled: boolean): Promise<void> {
  await prisma.roleFairnessTracker.updateMany({
    where: { storeId: STORE_ID, roleId: { in: TRACKED_ROLE_IDS } },
    data: { enabled },
  });
  console.log(`  ✓ Set fairness tracker enabled=${enabled} for roles ${TRACKED_ROLE_IDS.join(', ')}`);
}

async function runPhase(phaseName: string, applyFairnessWeights: boolean): Promise<PhaseResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PHASE: ${phaseName}`);
  console.log(`Fairness Weights in Objective: ${applyFairnessWeights ? 'ENABLED' : 'DISABLED'}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Setup
  console.log('Setup:');
  await deleteLogbooks();
  await clearFairnessData();
  // Always keep trackers enabled for data collection, just skip weights in solver
  await setFairnessTrackerEnabled(true);
  
  const results: DateResult[] = [];
  const skipFairnessWeights = !applyFairnessWeights;
  
  // Run solver for each date in order
  for (const date of TEST_DATES) {
    console.log(`\n  Running solver for ${date}...`);
    const startTime = Date.now();
    const result = await runSolver(date, true, skipFairnessWeights);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (result.success) {
      console.log(`    ✓ Success in ${elapsed}s (logbookId: ${result.logbookId?.slice(0, 8)}...)`);
      
      // Get fairness snapshots for this date
      const fairnessMetrics = await getFairnessSnapshots(date);
      
      results.push({
        date,
        logbookId: result.logbookId,
        success: true,
        fairnessMetrics,
      });
    } else {
      console.log(`    ✗ Failed`);
      results.push({ date, success: false, fairnessMetrics: [] });
    }
  }
  
  return { phase: phaseName, results };
}

function printFairnessTable(results: DateResult[]): void {
  // Get the last date's fairness metrics (cumulative effect)
  const lastResult = results[results.length - 1];
  if (!lastResult.fairnessMetrics.length) {
    console.log('  No fairness metrics available');
    return;
  }
  
  console.log('\n  Role                | Gini  | Index | Grade | Min   | Max   | Avg   | StdDev | Crew');
  console.log('  ' + '-'.repeat(90));
  
  for (const m of lastResult.fairnessMetrics) {
    const name = m.roleName.padEnd(18).slice(0, 18);
    const gini = m.giniCoefficient.toFixed(3).padStart(5);
    const index = m.fairnessIndex.toFixed(1).padStart(5);
    const grade = m.fairnessGrade.padStart(5);
    const min = m.minMph.toFixed(1).padStart(5);
    const max = m.maxMph.toFixed(1).padStart(5);
    const avg = m.avgMph.toFixed(1).padStart(5);
    const std = m.stdDeviation.toFixed(1).padStart(6);
    const crew = `${m.crewWithMinutes}/${m.eligibleCrew}`.padStart(6);
    
    console.log(`  ${name} | ${gini} | ${index} | ${grade} | ${min} | ${max} | ${avg} | ${std} | ${crew}`);
  }
}

async function main(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         FAIRNESS TRACKING A/B TEST                         ║');
  console.log('║         Dates: 11/25, 12/13, 12/15, 12/16                   ║');
  console.log('║         Tracked Roles: 29, 37, 38                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    // Phase 1: Without fairness tracking
    const baselineResults = await runPhase('BASELINE (No Fairness)', false);
    console.log('\n  Baseline Fairness Metrics (after all dates):');
    printFairnessTable(baselineResults.results);
    
    // Phase 2: With fairness tracking
    const fairnessResults = await runPhase('WITH FAIRNESS TRACKING', true);
    console.log('\n  Fairness-Tracked Metrics (after all dates):');
    printFairnessTable(fairnessResults.results);
    
    // Comparison
    console.log('\n\n' + '='.repeat(60));
    console.log('COMPARISON SUMMARY');
    console.log('='.repeat(60));
    
    const baselineLast = baselineResults.results[baselineResults.results.length - 1];
    const fairnessLast = fairnessResults.results[fairnessResults.results.length - 1];
    
    console.log('\n  Role                | Baseline Gini | Tracked Gini | Improvement');
    console.log('  ' + '-'.repeat(65));
    
    for (const bm of baselineLast.fairnessMetrics) {
      const fm = fairnessLast.fairnessMetrics.find(f => f.roleId === bm.roleId);
      if (fm) {
        const name = bm.roleName.padEnd(18).slice(0, 18);
        const baseGini = bm.giniCoefficient.toFixed(3).padStart(13);
        const fairGini = fm.giniCoefficient.toFixed(3).padStart(12);
        const improvement = ((bm.giniCoefficient - fm.giniCoefficient) * 100).toFixed(1);
        const arrow = fm.giniCoefficient < bm.giniCoefficient ? '↓ BETTER' : 
                      fm.giniCoefficient > bm.giniCoefficient ? '↑ WORSE' : '= SAME';
        console.log(`  ${name} | ${baseGini} | ${fairGini} | ${improvement}% ${arrow}`);
      }
    }
    
    console.log('\n\n✅ A/B Test Complete!\n');
    
  } finally {
    // Restore fairness tracking to enabled
    await setFairnessTrackerEnabled(true);
    await prisma.$disconnect();
  }
}

main().catch(console.error);
