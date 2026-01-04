/**
 * BASE_BOOST Comparison Test
 * 
 * Tests different fairnessBaseBoost values to find the optimal balance
 * between Gini convergence speed and preference satisfaction.
 * 
 * Baseline (from 30-day test with BASE_BOOST=10000):
 * - Day 11 Gini: ~0.26 (stabilization point)
 * - Day 30 Gini: ~0.19
 * - Satisfaction: ~60%
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Test configuration
const STORE_ID = 768;
const TRACKED_ROLE_IDS = [29, 37, 38]; // Parking Helms, Wine Demo, Food Demo
const DAYS_TO_TEST = 31; // Full month test for stabilization analysis

// Real dates with shift data (rotate through these)
const REAL_DATES = [
  '2025-11-25',
  '2025-12-13', 
  '2025-12-15',
  '2025-12-16'
];

// BASE_BOOST values to test - just 740 for long-term analysis
const BASE_BOOST_VALUES = [740];

interface TestResult {
  baseBoost: number;
  dayResults: {
    day: number;
    avgGini: number;
    roleGinis: { [key: string]: number };
    prefsMet: number;
    prefsTotal: number;
    percentMet: number;
    avgSatisfaction: number;
  }[];
  stabilizationDay: number;
  finalGini: number;
  avgSatisfaction: number;
}

async function getShiftDataForDate(realDate: string): Promise<any[]> {
  return prisma.shift.findMany({
    where: {
      storeId: STORE_ID,
      date: new Date(realDate),
    }
  });
}

async function createSyntheticShifts(syntheticDate: string, realDate: string): Promise<void> {
  const realShifts = await getShiftDataForDate(realDate);
  if (realShifts.length === 0) return;

  // Delete existing
  await prisma.shift.deleteMany({
    where: { storeId: STORE_ID, date: new Date(syntheticDate) }
  });

  // Delete existing logbooks
  const existingLogbooks = await prisma.logbook.findMany({
    where: { storeId: STORE_ID, date: new Date(syntheticDate) },
    select: { id: true }
  });
  
  if (existingLogbooks.length > 0) {
    const logbookIds = existingLogbooks.map(l => l.id);
    await prisma.assignment.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.preferenceSatisfaction.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.run.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.logPreferenceMetadata.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.logbook.deleteMany({ where: { id: { in: logbookIds } } });
  }

  // Create shifts
  for (const shift of realShifts) {
    await prisma.shift.create({
      data: {
        storeId: STORE_ID,
        date: new Date(syntheticDate),
        crewId: shift.crewId,
        startMin: shift.startMin,
        endMin: shift.endMin,
      }
    });
  }

  // Copy coverage windows
  const realCoverageWindows = await prisma.roleCoverageWindow.findMany({
    where: { storeId: STORE_ID, date: new Date(realDate) }
  });
  
  await prisma.roleCoverageWindow.deleteMany({
    where: { storeId: STORE_ID, date: new Date(syntheticDate) }
  });
  
  for (const cw of realCoverageWindows) {
    await prisma.roleCoverageWindow.create({
      data: {
        storeId: STORE_ID,
        roleId: cw.roleId,
        date: new Date(syntheticDate),
        startMin: cw.startMin,
        endMin: cw.endMin,
        crewPerMinute: cw.crewPerMinute,
        constraintRule: cw.constraintRule,
      }
    });
  }

  // Copy quotas
  const realQuotas = await prisma.crewRoleQuota.findMany({
    where: { storeId: STORE_ID, date: new Date(realDate) }
  });
  
  await prisma.crewRoleQuota.deleteMany({
    where: { storeId: STORE_ID, date: new Date(syntheticDate) }
  });
  
  for (const quota of realQuotas) {
    await prisma.crewRoleQuota.create({
      data: {
        storeId: STORE_ID,
        crewId: quota.crewId,
        roleId: quota.roleId,
        date: new Date(syntheticDate),
        startMin: quota.startMin,
        endMin: quota.endMin,
        requiredMin: quota.requiredMin,
      }
    });
  }
}

async function runSolverWithBaseBoost(date: string, baseBoost: number): Promise<any> {
  const response = await fetch('http://localhost:4000/solver/v2/tune', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID,
      date: date,
      saveLogbook: true,
      settings: {
        fairnessBaseBoost: baseBoost,  // Override the config value
      }
    })
  });
  
  if (!response.ok) {
    throw new Error(`Solver failed: ${response.status} ${await response.text()}`);
  }
  
  return response.json();
}

async function getFairnessFromSnapshots(date: string): Promise<Map<number, { roleName: string; gini: number }>> {
  const snapshots = await prisma.roleFairnessSnapshot.findMany({
    where: {
      storeId: STORE_ID,
      roleId: { in: TRACKED_ROLE_IDS },
      date: new Date(date)
    },
    include: { Role: true }
  });

  const result = new Map<number, { roleName: string; gini: number }>();
  for (const snapshot of snapshots) {
    result.set(snapshot.roleId, {
      roleName: snapshot.Role.displayName,
      gini: snapshot.giniCoefficient,
    });
  }
  return result;
}

async function getPreferenceStats(date: string): Promise<{ met: number; total: number; percentMet: number; avgSatisfaction: number } | null> {
  const logbook = await prisma.logbook.findFirst({
    where: { storeId: STORE_ID, date: new Date(date) },
    include: { LogPreferenceMetadata: true }
  });

  if (!logbook?.LogPreferenceMetadata) return null;
  
  const meta = logbook.LogPreferenceMetadata;
  return {
    met: meta.preferencesMet,
    total: meta.eligiblePreferences,
    percentMet: meta.percentMet,
    avgSatisfaction: meta.avgSatisfaction,
  };
}

async function clearFairnessHistory(): Promise<void> {
  await prisma.crewRoleFairnessHistory.deleteMany({ where: { storeId: STORE_ID } });
  await prisma.roleFairnessSnapshot.deleteMany({ where: { storeId: STORE_ID } });
}

async function cleanupSyntheticData(startMonth: string): Promise<void> {
  const syntheticDates = [];
  for (let day = 1; day <= DAYS_TO_TEST; day++) {
    syntheticDates.push(new Date(`${startMonth}-${day.toString().padStart(2, '0')}`));
  }
  
  await prisma.shift.deleteMany({ where: { storeId: STORE_ID, date: { in: syntheticDates } } });
  
  const logbooks = await prisma.logbook.findMany({
    where: { storeId: STORE_ID, date: { in: syntheticDates } },
    select: { id: true }
  });
  const logbookIds = logbooks.map(l => l.id);

  if (logbookIds.length > 0) {
    await prisma.assignment.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.preferenceSatisfaction.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.run.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.logPreferenceMetadata.deleteMany({ where: { logbookId: { in: logbookIds } } });
    await prisma.logbook.deleteMany({ where: { id: { in: logbookIds } } });
  }
  
  await prisma.roleCoverageWindow.deleteMany({ where: { storeId: STORE_ID, date: { in: syntheticDates } } });
  await prisma.crewRoleQuota.deleteMany({ where: { storeId: STORE_ID, date: { in: syntheticDates } } });
  await prisma.crewRoleFairnessHistory.deleteMany({ where: { storeId: STORE_ID, date: { in: syntheticDates } } });
  await prisma.roleFairnessSnapshot.deleteMany({ where: { storeId: STORE_ID, date: { in: syntheticDates } } });
}

function detectStabilization(ginis: number[], threshold: number = 0.02): number {
  // Find first day where 3 consecutive days have change < threshold
  for (let i = 2; i < ginis.length; i++) {
    const d1 = Math.abs(ginis[i] - ginis[i-1]);
    const d2 = Math.abs(ginis[i-1] - ginis[i-2]);
    if (d1 < threshold && d2 < threshold) {
      return i - 1; // Return the middle day of stability
    }
  }
  return ginis.length; // Never stabilized
}

async function runTestForBaseBoost(baseBoost: number, monthOffset: number): Promise<TestResult> {
  // Use different synthetic months for each test to avoid conflicts
  // Supports up to 12 tests (months 3-14, wrapping to next year if needed)
  const monthNum = 3 + monthOffset;
  const year = monthNum > 12 ? 2026 : 2025;
  const month = monthNum > 12 ? monthNum - 12 : monthNum;
  const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Testing BASE_BOOST = ${baseBoost}`);
  console.log(`${'='.repeat(60)}`);
  
  // Clear fairness history for fresh start
  await clearFairnessHistory();
  
  const dayResults: TestResult['dayResults'] = [];
  
  for (let day = 1; day <= DAYS_TO_TEST; day++) {
    const syntheticDate = `${monthStr}-${day.toString().padStart(2, '0')}`;
    const realDateIdx = (day - 1) % REAL_DATES.length;
    const realDate = REAL_DATES[realDateIdx];
    
    process.stdout.write(`  Day ${day}: `);
    
    await createSyntheticShifts(syntheticDate, realDate);
    
    const startTime = Date.now();
    await runSolverWithBaseBoost(syntheticDate, baseBoost);
    const duration = (Date.now() - startTime) / 1000;
    
    const snapshots = await getFairnessFromSnapshots(syntheticDate);
    const prefStats = await getPreferenceStats(syntheticDate);
    
    const roleGinis: { [key: string]: number } = {};
    let totalGini = 0;
    let roleCount = 0;
    
    for (const [roleId, data] of snapshots) {
      roleGinis[data.roleName] = data.gini;
      totalGini += data.gini;
      roleCount++;
    }
    
    const avgGini = roleCount > 0 ? totalGini / roleCount : 0;
    
    dayResults.push({
      day,
      avgGini,
      roleGinis,
      prefsMet: prefStats?.met ?? 0,
      prefsTotal: prefStats?.total ?? 0,
      percentMet: prefStats?.percentMet ?? 0,
      avgSatisfaction: prefStats?.avgSatisfaction ?? 0,
    });
    
    console.log(`Gini=${avgGini.toFixed(3)} | Sat=${(prefStats?.percentMet ?? 0).toFixed(1)}% (${duration.toFixed(0)}s)`);
  }
  
  // Clean up
  await cleanupSyntheticData(monthStr);
  
  // Calculate summary stats
  const ginis = dayResults.map(d => d.avgGini);
  const stabilizationDay = detectStabilization(ginis);
  
  return {
    baseBoost,
    dayResults,
    stabilizationDay,
    finalGini: ginis[ginis.length - 1],
    avgSatisfaction: dayResults.reduce((sum, d) => sum + d.avgSatisfaction, 0) / dayResults.length,
  };
}

async function main() {
  console.log('🔬 BASE_BOOST Comparison Test');
  console.log('=' .repeat(60));
  console.log(`Store: ${STORE_ID}`);
  console.log(`Days per test: ${DAYS_TO_TEST}`);
  console.log(`BASE_BOOST values: ${BASE_BOOST_VALUES.join(', ')}`);
  console.log('');
  
  const results: TestResult[] = [];
  
  try {
    for (let i = 0; i < BASE_BOOST_VALUES.length; i++) {
      const result = await runTestForBaseBoost(BASE_BOOST_VALUES[i], i);
      results.push(result);
    }
    
    // Final comparison
    console.log('\n' + '=' .repeat(70));
    console.log('📊 COMPARISON SUMMARY');
    console.log('=' .repeat(70));
    
    console.log('\n BASE_BOOST | Stabilizes | Final Gini | Avg Satisfaction | Efficiency');
    console.log('-'.repeat(70));
    
    for (const r of results) {
      const efficiency = ((0.83 - r.finalGini) / (64 - r.avgSatisfaction)).toFixed(1);
      console.log(
        ` ${r.baseBoost.toString().padStart(8)} | ` +
        `Day ${r.stabilizationDay.toString().padStart(2)}     | ` +
        `${r.finalGini.toFixed(4)}     | ` +
        `${r.avgSatisfaction.toFixed(1)}%            | ` +
        `${efficiency}`
      );
    }
    
    console.log('\n📈 Gini Convergence by Day:');
    console.log('Day |' + BASE_BOOST_VALUES.map(b => ` BB=${b}`.padStart(10)).join(' |'));
    console.log('-'.repeat(5 + BASE_BOOST_VALUES.length * 12));
    
    for (let day = 0; day < DAYS_TO_TEST; day++) {
      const row = results.map(r => r.dayResults[day]?.avgGini.toFixed(4) || 'N/A');
      console.log(`${(day + 1).toString().padStart(3)} |` + row.map(g => g.padStart(10)).join(' |'));
    }
    
    // Predictions vs Reality
    console.log('\n🎯 Predictions vs Reality:');
    console.log('BASE_BOOST | Predicted Gini | Actual Gini | Predicted Sat | Actual Sat');
    console.log('-'.repeat(70));
    
    const predictions: { [key: number]: { gini: number; sat: number } } = {
      10000: { gini: 0.19, sat: 60 },
      7500: { gini: 0.22, sat: 62 },
      5000: { gini: 0.28, sat: 65 },
      2500: { gini: 0.40, sat: 70 },
    };
    
    for (const r of results) {
      const pred = predictions[r.baseBoost];
      if (pred) {
        const giniDiff = r.finalGini - pred.gini;
        const satDiff = r.avgSatisfaction - pred.sat;
        console.log(
          `${r.baseBoost.toString().padStart(10)} | ` +
          `${pred.gini.toFixed(2).padStart(14)} | ` +
          `${r.finalGini.toFixed(4).padStart(11)} | ` +
          `${pred.sat.toString().padStart(13)}% | ` +
          `${r.avgSatisfaction.toFixed(1)}%`
        );
      }
    }
    
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
