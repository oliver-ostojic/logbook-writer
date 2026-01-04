/**
 * 31-Day Gini Coefficient Stability Test
 * 
 * Tests that Gini coefficients (fairness) decrease/stabilize over 31 consecutive days.
 * Uses PRODUCTION ENGINE CONFIG: 14 regions × 3 shots × LNS enabled.
 * 
 * Expected behavior: Gini should decrease rapidly in first ~7-14 days, 
 * then stabilize as fairness converges.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// Configuration - PRODUCTION ENGINE SETTINGS
// ============================================================================
const STORE_ID = 768;
const API_URL = 'http://localhost:4000';

// Production optimal config (tested in region×shots scaling)
const NUM_REGIONS = 14;
const SHOTS_PER_REGION = 3;
const WORKERS_PER_REGION = 1;
const TIME_LIMIT_PER_SHOT = 10;

// Available dates with shift data (cycle through these)
const AVAILABLE_DATES = ['2025-11-25', '2025-12-13', '2025-12-15', '2025-12-16'];
const NUM_DAYS = 31;

// Generate 31 "virtual" days by cycling through available dates
function generateCycledDates(availableDates: string[], numDays: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < numDays; i++) {
    dates.push(availableDates[i % availableDates.length]);
  }
  return dates;
}

const TEST_DATES = generateCycledDates(AVAILABLE_DATES, NUM_DAYS);

// ============================================================================
// Types
// ============================================================================
interface TunerResponse {
  success: boolean;
  objectiveValue?: number;
  message?: string;
  metadata?: {
    runtimeMs?: number;
    satisfactionScore?: number;
    fairnessIndex?: number;
  };
}

interface DayResult {
  day: number;
  date: string;
  success: boolean;
  solveTimeMs: number;
  eligiblePreferences: number;
  preferencesMet: number;
  avgSatisfaction: number;
  fairnessIndex: number;  // This is the Gini-based fairness (higher = fairer)
  giniCoefficient: number; // Derived: 1 - fairnessIndex (lower = fairer)
  roleGinis: RoleGini[];  // Per-role Gini coefficients
}

interface RoleGini {
  roleId: number;
  roleName: string;
  giniCoefficient: number;
  fairnessIndex: number;
  crewCount: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function clearAllTestData(): Promise<void> {
  console.log('Clearing all test data...');
  
  // Clear fairness history
  await prisma.crewRoleFairnessHistory.deleteMany({ where: { storeId: STORE_ID } });
  await prisma.roleFairnessSnapshot.deleteMany({ where: { storeId: STORE_ID } });

  // Clear logbooks for all test dates
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
  
  console.log(`  Cleared ${logbookIds.length} logbooks and fairness history.`);
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

async function getRoleGinis(): Promise<RoleGini[]> {
  // Get the latest RoleFairnessSnapshot for each role
  const snapshots = await prisma.roleFairnessSnapshot.findMany({
    where: { storeId: STORE_ID },
    orderBy: { date: 'desc' },
    include: { Role: true },
  });
  
  // Get unique roles (latest snapshot per role)
  const roleMap = new Map<number, RoleGini>();
  for (const snap of snapshots) {
    if (!roleMap.has(snap.roleId)) {
      // Count crew with history for this role
      const crewCount = await prisma.crewRoleFairnessHistory.groupBy({
        by: ['crewId'],
        where: { storeId: STORE_ID, roleId: snap.roleId },
      });
      
      roleMap.set(snap.roleId, {
        roleId: snap.roleId,
        roleName: snap.Role.displayName,
        giniCoefficient: snap.giniCoefficient,
        fairnessIndex: snap.fairnessIndex,
        crewCount: crewCount.length,
      });
    }
  }
  
  return Array.from(roleMap.values()).sort((a, b) => a.roleName.localeCompare(b.roleName));
}

function printProgressBar(current: number, total: number, width: number = 30): string {
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${current}/${total}`;
}

function printGiniTrend(results: DayResult[]): void {
  console.log('\n' + '═'.repeat(70));
  console.log('  GINI COEFFICIENT TREND (Lower = More Fair)');
  console.log('═'.repeat(70));
  
  // Group by week
  const weeks: DayResult[][] = [];
  for (let i = 0; i < results.length; i += 7) {
    weeks.push(results.slice(i, i + 7));
  }
  
  weeks.forEach((week, weekIdx) => {
    const successfulDays = week.filter(r => r.success);
    if (successfulDays.length === 0) return;
    
    const avgGini = successfulDays.reduce((a, b) => a + b.giniCoefficient, 0) / successfulDays.length;
    const avgSat = successfulDays.reduce((a, b) => a + b.avgSatisfaction, 0) / successfulDays.length;
    
    console.log(`\n  Week ${weekIdx + 1} (Days ${weekIdx * 7 + 1}-${Math.min((weekIdx + 1) * 7, results.length)}):`);
    console.log(`    Avg Gini: ${avgGini.toFixed(4)} | Avg Satisfaction: ${avgSat.toFixed(1)}%`);
    
    // Visual trend for each day in week
    successfulDays.forEach(day => {
      const giniBar = '▓'.repeat(Math.round(day.giniCoefficient * 50));
      const satBar = '█'.repeat(Math.round(day.avgSatisfaction / 2));
      console.log(`    Day ${String(day.day).padStart(2)}: Gini ${day.giniCoefficient.toFixed(4)} ${giniBar}`);
    });
  });
}

function analyzeGiniConvergence(results: DayResult[]): void {
  const successful = results.filter(r => r.success);
  if (successful.length < 7) {
    console.log('\n⚠️  Not enough successful days for convergence analysis.');
    return;
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log('  CONVERGENCE ANALYSIS');
  console.log('═'.repeat(70));
  
  // First week vs last week comparison
  const firstWeek = successful.slice(0, 7);
  const lastWeek = successful.slice(-7);
  
  const firstWeekAvgGini = firstWeek.reduce((a, b) => a + b.giniCoefficient, 0) / firstWeek.length;
  const lastWeekAvgGini = lastWeek.reduce((a, b) => a + b.giniCoefficient, 0) / lastWeek.length;
  const giniReduction = ((firstWeekAvgGini - lastWeekAvgGini) / firstWeekAvgGini) * 100;
  
  const firstWeekAvgSat = firstWeek.reduce((a, b) => a + b.avgSatisfaction, 0) / firstWeek.length;
  const lastWeekAvgSat = lastWeek.reduce((a, b) => a + b.avgSatisfaction, 0) / lastWeek.length;
  
  console.log(`\n  First Week (Days 1-7):`);
  console.log(`    Avg Gini: ${firstWeekAvgGini.toFixed(4)}`);
  console.log(`    Avg Satisfaction: ${firstWeekAvgSat.toFixed(1)}%`);
  
  console.log(`\n  Last Week (Days ${successful.length - 6}-${successful.length}):`);
  console.log(`    Avg Gini: ${lastWeekAvgGini.toFixed(4)}`);
  console.log(`    Avg Satisfaction: ${lastWeekAvgSat.toFixed(1)}%`);
  
  console.log(`\n  Change:`);
  console.log(`    Gini Reduction: ${giniReduction >= 0 ? '+' : ''}${giniReduction.toFixed(2)}% ${giniReduction > 0 ? '✓ (improving)' : '⚠️ (not improving)'}`);
  console.log(`    Satisfaction Δ: ${(lastWeekAvgSat - firstWeekAvgSat).toFixed(1)}%`);
  
  // Calculate day-over-day Gini changes to detect stabilization
  const giniDeltas: number[] = [];
  for (let i = 1; i < successful.length; i++) {
    giniDeltas.push(Math.abs(successful[i].giniCoefficient - successful[i - 1].giniCoefficient));
  }
  
  const firstHalfDeltas = giniDeltas.slice(0, Math.floor(giniDeltas.length / 2));
  const secondHalfDeltas = giniDeltas.slice(Math.floor(giniDeltas.length / 2));
  
  const avgFirstHalfDelta = firstHalfDeltas.reduce((a, b) => a + b, 0) / firstHalfDeltas.length;
  const avgSecondHalfDelta = secondHalfDeltas.reduce((a, b) => a + b, 0) / secondHalfDeltas.length;
  
  console.log(`\n  Stabilization (day-over-day Gini volatility):`);
  console.log(`    First Half Avg Δ: ${avgFirstHalfDelta.toFixed(5)}`);
  console.log(`    Second Half Avg Δ: ${avgSecondHalfDelta.toFixed(5)}`);
  console.log(`    Volatility Reduction: ${(((avgFirstHalfDelta - avgSecondHalfDelta) / avgFirstHalfDelta) * 100).toFixed(1)}%`);
  
  const isStabilizing = avgSecondHalfDelta < avgFirstHalfDelta;
  console.log(`    Status: ${isStabilizing ? '✅ STABILIZING' : '⚠️ NOT YET STABLE'}`);
}

function printRawData(results: DayResult[]): void {
  console.log('\n' + '═'.repeat(70));
  console.log('  RAW DATA');
  console.log('═'.repeat(70));
  console.log('\n  Day | Date       | Time(s) | Sat%   | Fairness | Gini');
  console.log('  ' + '-'.repeat(60));
  
  results.forEach(r => {
    if (r.success) {
      console.log(`  ${String(r.day).padStart(3)} | ${r.date} | ${(r.solveTimeMs / 1000).toFixed(1).padStart(6)} | ${r.avgSatisfaction.toFixed(1).padStart(5)}% | ${r.fairnessIndex.toFixed(4).padStart(8)} | ${r.giniCoefficient.toFixed(4)}`);
    } else {
      console.log(`  ${String(r.day).padStart(3)} | ${r.date} | FAILED`);
    }
  });
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('═'.repeat(70));
  console.log('  31-DAY GINI COEFFICIENT STABILITY TEST');
  console.log('  Production Config: 14 regions × 3 shots × LNS enabled');
  console.log('  Cycling through 4 dates with real shift data');
  console.log('═'.repeat(70));
  console.log(`\n  Store: ${STORE_ID}`);
  console.log(`  Available Dates: ${AVAILABLE_DATES.join(', ')}`);
  console.log(`  Virtual Days: ${NUM_DAYS} (cycling through ${AVAILABLE_DATES.length} dates)`);
  console.log(`  Config: ${NUM_REGIONS} regions × ${SHOTS_PER_REGION} shots × ${TIME_LIMIT_PER_SHOT}s/shot`);
  console.log(`  Expected Runtime: ~${Math.round((NUM_DAYS * 60) / 60)} minutes\n`);

  // Clear all existing test data
  await clearAllTestData();

  const results: DayResult[] = [];
  const startTime = Date.now();

  // Run each day sequentially (fairness accumulates)
  for (let day = 0; day < TEST_DATES.length; day++) {
    const date = TEST_DATES[day];
    
    process.stdout.write(`  ${printProgressBar(day + 1, NUM_DAYS)} Day ${day + 1}: ${date}...`);

    try {
      const { response, solveTimeMs } = await runTuner(date);

      if (!response.success) {
        console.log(` ❌ ${response.message || 'Failed'}`);
        results.push({
          day: day + 1,
          date,
          success: false,
          solveTimeMs,
          eligiblePreferences: 0,
          preferencesMet: 0,
          avgSatisfaction: 0,
          fairnessIndex: 0,
          giniCoefficient: 1,
          roleGinis: [],
        });
        continue;
      }

      const metadata = await getLogbookMetadata(date);
      const fairnessIndex = metadata?.fairnessIndex ?? 0;
      const roleGinis = await getRoleGinis();
      
      const result: DayResult = {
        day: day + 1,
        date,
        success: true,
        solveTimeMs,
        eligiblePreferences: metadata?.eligiblePreferences ?? 0,
        preferencesMet: metadata?.preferencesMet ?? 0,
        avgSatisfaction: metadata?.avgSatisfaction ?? 0,
        fairnessIndex,
        giniCoefficient: 1 - (fairnessIndex / 100), // Convert to 0-1 Gini scale
        roleGinis,
      };

      results.push(result);

      // Print summary line
      console.log(` ✓ ${(solveTimeMs / 1000).toFixed(0)}s | Sat: ${result.avgSatisfaction.toFixed(1)}% | Gini: ${result.giniCoefficient.toFixed(4)}`);
      
      // Print per-role Gini coefficients
      if (roleGinis.length > 0) {
        const roleStr = roleGinis.map(r => `${r.roleName}: ${r.giniCoefficient.toFixed(3)}`).join(' | ');
        console.log(`      Roles: ${roleStr}`);
      }

    } catch (error) {
      console.log(` ❌ Error: ${error}`);
      results.push({
        day: day + 1,
        date,
        success: false,
        solveTimeMs: 0,
        eligiblePreferences: 0,
        preferencesMet: 0,
        avgSatisfaction: 0,
        fairnessIndex: 0,
        giniCoefficient: 1,
        roleGinis: [],
      });
    }
  }

  const totalTimeMs = Date.now() - startTime;

  // Print results
  printRawData(results);
  printGiniTrend(results);
  analyzeGiniConvergence(results);

  // Summary
  const successful = results.filter(r => r.success);
  console.log('\n' + '═'.repeat(70));
  console.log('  SUMMARY');
  console.log('═'.repeat(70));
  console.log(`\n  Total Runtime: ${(totalTimeMs / 1000 / 60).toFixed(1)} minutes`);
  console.log(`  Successful Days: ${successful.length}/${NUM_DAYS}`);
  
  if (successful.length > 0) {
    const avgSolveTime = successful.reduce((a, b) => a + b.solveTimeMs, 0) / successful.length;
    const avgSat = successful.reduce((a, b) => a + b.avgSatisfaction, 0) / successful.length;
    const avgGini = successful.reduce((a, b) => a + b.giniCoefficient, 0) / successful.length;
    const minGini = Math.min(...successful.map(r => r.giniCoefficient));
    const maxGini = Math.max(...successful.map(r => r.giniCoefficient));
    
    console.log(`  Avg Solve Time: ${(avgSolveTime / 1000).toFixed(1)}s`);
    console.log(`  Avg Satisfaction: ${avgSat.toFixed(2)}%`);
    console.log(`  Avg Gini: ${avgGini.toFixed(4)}`);
    console.log(`  Gini Range: ${minGini.toFixed(4)} - ${maxGini.toFixed(4)}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
