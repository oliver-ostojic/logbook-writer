/**
 * 31-Day Gini Coefficient Test with Real DB
 * 
 * This test:
 * 1. Copies shift data from 4 real dates to synthetic Jan 1-31, 2025 dates
 * 2. Runs the solver on each synthetic date with saveLogbook: true
 * 3. Lets real DB fairness history accumulate
 * 4. Reads Gini coefficients from RoleFairnessSnapshot (computed by the system)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Real dates with shift data (rotate through these)
const REAL_DATES = [
  '2025-11-25',
  '2025-12-13', 
  '2025-12-15',
  '2025-12-16'
];

const STORE_ID = 768;
const TRACKED_ROLE_IDS = [29, 37, 38]; // Parking Helms, Wine Demo, Food Demo

async function getShiftDataForDate(realDate: string): Promise<any[]> {
  const shifts = await prisma.shift.findMany({
    where: {
      storeId: STORE_ID,
      date: new Date(realDate),
    },
    include: {
      Crew: {
        include: {
          CrewRole: true
        }
      }
    }
  });
  return shifts;
}

async function createSyntheticShifts(syntheticDate: string, realDate: string): Promise<void> {
  // Get shifts from real date
  const realShifts = await getShiftDataForDate(realDate);
  
  if (realShifts.length === 0) {
    console.log(`  No shifts found for real date ${realDate}`);
    return;
  }

  // Delete any existing shifts for synthetic date
  await prisma.shift.deleteMany({
    where: {
      storeId: STORE_ID,
      date: new Date(syntheticDate)
    }
  });

  // Find and delete any existing logbook entries for synthetic date
  const existingLogbooks = await prisma.logbook.findMany({
    where: {
      storeId: STORE_ID,
      date: new Date(syntheticDate)
    },
    select: { id: true }
  });
  
  if (existingLogbooks.length > 0) {
    const logbookIds = existingLogbooks.map(l => l.id);
    await prisma.assignment.deleteMany({
      where: { logbookId: { in: logbookIds } }
    });
    await prisma.preferenceSatisfaction.deleteMany({
      where: { logbookId: { in: logbookIds } }
    });
    await prisma.run.deleteMany({
      where: { logbookId: { in: logbookIds } }
    });
    await prisma.logPreferenceMetadata.deleteMany({
      where: { logbookId: { in: logbookIds } }
    });
    await prisma.logbook.deleteMany({
      where: { id: { in: logbookIds } }
    });
  }

  // Create new shifts for synthetic date
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
  
  // Copy coverage windows from real date to synthetic date
  const realCoverageWindows = await prisma.roleCoverageWindow.findMany({
    where: {
      storeId: STORE_ID,
      date: new Date(realDate)
    }
  });
  
  // Delete existing coverage windows for synthetic date
  await prisma.roleCoverageWindow.deleteMany({
    where: {
      storeId: STORE_ID,
      date: new Date(syntheticDate)
    }
  });
  
  // Create coverage windows for synthetic date
  for (const cw of realCoverageWindows) {
    await prisma.roleCoverageWindow.create({
      data: {
        storeId: STORE_ID,
        date: new Date(syntheticDate),
        roleId: cw.roleId,
        startMin: cw.startMin,
        endMin: cw.endMin,
        crewPerMinute: cw.crewPerMinute,
        constraintRule: cw.constraintRule,
      }
    });
  }
  
  // Copy crew role quotas from real date to synthetic date
  const realQuotas = await prisma.crewRoleQuota.findMany({
    where: {
      storeId: STORE_ID,
      date: new Date(realDate)
    }
  });
  
  // Delete existing quotas for synthetic date
  await prisma.crewRoleQuota.deleteMany({
    where: {
      storeId: STORE_ID,
      date: new Date(syntheticDate)
    }
  });
  
  // Create quotas for synthetic date
  for (const q of realQuotas) {
    await prisma.crewRoleQuota.create({
      data: {
        storeId: STORE_ID,
        date: new Date(syntheticDate),
        roleId: q.roleId,
        crewId: q.crewId,
        startMin: q.startMin,
        endMin: q.endMin,
        requiredMin: q.requiredMin,
      }
    });
  }
  
  console.log(`  Copied ${realShifts.length} shifts, ${realCoverageWindows.length} coverage windows, ${realQuotas.length} quotas from ${realDate} to ${syntheticDate}`);
}

async function runSolverForDate(date: string): Promise<any> {
  // Use the tuning endpoint - production config is applied server-side
  const response = await fetch('http://localhost:4000/solver/v2/tune', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID,
      date: date,
      saveLogbook: true, // KEY: This enables real DB fairness tracking!
      // tuningConfig uses PRODUCTION_TUNING_CONFIG defaults from solver.config.ts
    })
  });
  
  if (!response.ok) {
    throw new Error(`Solver failed: ${response.status} ${await response.text()}`);
  }
  
  return response.json();
}

async function getFairnessFromSnapshots(date: string): Promise<Map<number, { roleName: string; gini: number; eligibleCrew: number; crewWithMinutes: number }>> {
  const snapshots = await prisma.roleFairnessSnapshot.findMany({
    where: {
      storeId: STORE_ID,
      roleId: { in: TRACKED_ROLE_IDS },
      date: new Date(date)
    },
    include: {
      Role: true
    }
  });

  const result = new Map<number, { roleName: string; gini: number; eligibleCrew: number; crewWithMinutes: number }>();
  
  for (const snapshot of snapshots) {
    result.set(snapshot.roleId, {
      roleName: snapshot.Role.displayName,
      gini: snapshot.giniCoefficient,
      eligibleCrew: snapshot.eligibleCrew,
      crewWithMinutes: snapshot.crewWithMinutes
    });
  }
  
  return result;
}

interface PreferenceStats {
  eligiblePreferences: number;
  preferencesMet: number;
  percentMet: number;
  avgSatisfaction: number;
  fairnessIndex: number;
  fairnessGrade: string;
}

async function getPreferenceStatsFromLogbook(date: string): Promise<PreferenceStats | null> {
  const logbook = await prisma.logbook.findFirst({
    where: {
      storeId: STORE_ID,
      date: new Date(date)
    },
    include: {
      LogPreferenceMetadata: true
    }
  });

  if (!logbook?.LogPreferenceMetadata) {
    return null;
  }

  const meta = logbook.LogPreferenceMetadata;
  return {
    eligiblePreferences: meta.eligiblePreferences,
    preferencesMet: meta.preferencesMet,
    percentMet: meta.percentMet,
    avgSatisfaction: meta.avgSatisfaction,
    fairnessIndex: meta.fairnessIndex,
    fairnessGrade: meta.fairnessGrade,
  };
}

async function cleanup() {
  // Clean up synthetic dates (June 1-30, 2025)
  console.log('\n🧹 Cleaning up synthetic data...');
  
  const syntheticDates = [];
  for (let day = 1; day <= 30; day++) {
    syntheticDates.push(new Date(`2025-06-${day.toString().padStart(2, '0')}`));
  }
  
  // Delete shifts
  const deletedShifts = await prisma.shift.deleteMany({
    where: {
      storeId: STORE_ID,
      date: { in: syntheticDates }
    }
  });
  
  // Find logbooks first to delete dependent records
  const logbooks = await prisma.logbook.findMany({
    where: {
      storeId: STORE_ID,
      date: { in: syntheticDates }
    },
    select: { id: true }
  });
  const logbookIds = logbooks.map(l => l.id);

  // Delete dependent records first
  if (logbookIds.length > 0) {
    await prisma.assignment.deleteMany({
      where: { logbookId: { in: logbookIds } }
    });
    await prisma.preferenceSatisfaction.deleteMany({
      where: { logbookId: { in: logbookIds } }
    });
    await prisma.run.deleteMany({
      where: { logbookId: { in: logbookIds } }
    });
    await prisma.logPreferenceMetadata.deleteMany({
      where: { logbookId: { in: logbookIds } }
    });
  }
  
  // Now delete logbooks
  const deletedLogbooks = await prisma.logbook.deleteMany({
    where: {
      storeId: STORE_ID,
      date: { in: syntheticDates }
    }
  });
  
  // Delete fairness history for these dates
  const deletedFairness = await prisma.crewRoleFairnessHistory.deleteMany({
    where: {
      storeId: STORE_ID,
      date: { in: syntheticDates }
    }
  });
  
  // Delete fairness snapshots for these dates
  const deletedSnapshots = await prisma.roleFairnessSnapshot.deleteMany({
    where: {
      storeId: STORE_ID,
      date: { in: syntheticDates }
    }
  });
  
  // Delete coverage windows for synthetic dates
  const deletedCoverageWindows = await prisma.roleCoverageWindow.deleteMany({
    where: {
      storeId: STORE_ID,
      date: { in: syntheticDates }
    }
  });
  
  // Delete crew role quotas for synthetic dates
  const deletedQuotas = await prisma.crewRoleQuota.deleteMany({
    where: {
      storeId: STORE_ID,
      date: { in: syntheticDates }
    }
  });
  
  console.log(`  Deleted ${deletedShifts.count} shifts, ${deletedLogbooks.count} logbooks`);
  console.log(`  Deleted ${deletedFairness.count} fairness records, ${deletedSnapshots.count} snapshots`);
  console.log(`  Deleted ${deletedCoverageWindows.count} coverage windows, ${deletedQuotas.count} quotas`);
}

async function main() {
  console.log('🎯 31-Day Gini Coefficient Test with Real DB');
  console.log('=' .repeat(60));
  console.log(`Store: ${STORE_ID}`);
  console.log(`Tracked Roles: ${TRACKED_ROLE_IDS.join(', ')}`);
  console.log(`Real dates: ${REAL_DATES.join(', ')}`);
  console.log('');

  const results: {
    day: number;
    date: string;
    overallGini: number;
    roleGinis: { [key: string]: number };
    solveDuration: number;
    prefStats: PreferenceStats | null;
  }[] = [];

  try {
    // Run 30 days starting June 1, 2025 (no prior history in lookback window)
    for (let day = 1; day <= 30; day++) {
      const syntheticDate = `2025-06-${day.toString().padStart(2, '0')}`;
      const realDateIdx = (day - 1) % REAL_DATES.length;
      const realDate = REAL_DATES[realDateIdx];
      
      console.log(`\n📅 Day ${day}: ${syntheticDate} (from ${realDate})`);
      
      // Create synthetic shifts
      await createSyntheticShifts(syntheticDate, realDate);
      
      // Run solver
      const startTime = Date.now();
      const solverResult = await runSolverForDate(syntheticDate);
      const duration = Date.now() - startTime;
      
      console.log(`  ✅ Solved in ${(duration / 1000).toFixed(1)}s`);
      
      // Get fairness from snapshots (computed by the system)
      const snapshots = await getFairnessFromSnapshots(syntheticDate);
      
      const roleGinis: { [key: string]: number } = {};
      let totalGini = 0;
      let roleCount = 0;
      
      for (const [roleId, data] of snapshots) {
        roleGinis[data.roleName] = data.gini;
        totalGini += data.gini;
        roleCount++;
      }
      
      const avgGini = roleCount > 0 ? totalGini / roleCount : 0;
      
      // Get preference satisfaction stats from logbook metadata
      const prefStats = await getPreferenceStatsFromLogbook(syntheticDate);
      
      results.push({
        day,
        date: syntheticDate,
        overallGini: avgGini,
        roleGinis,
        solveDuration: duration,
        prefStats
      });
      
      // Print results
      console.log(`  📊 Avg Role Gini: ${avgGini.toFixed(4)}`);
      for (const [roleName, gini] of Object.entries(roleGinis)) {
        console.log(`     ${roleName}: ${gini.toFixed(4)}`);
      }
      
      // Print preference satisfaction
      if (prefStats) {
        console.log(`  🎯 Preferences: ${prefStats.preferencesMet}/${prefStats.eligiblePreferences} met (${prefStats.percentMet.toFixed(1)}%) | Avg: ${prefStats.avgSatisfaction.toFixed(1)}% | Fairness: ${prefStats.fairnessGrade}`);
      }
    }
    
    // Final summary
    console.log('\n' + '=' .repeat(60));
    console.log('📈 FINAL SUMMARY');
    console.log('=' .repeat(60));
    
    console.log('\n--- ROLE FAIRNESS (Gini Coefficients) ---');
    console.log('Day | Overall Gini | Parking Helms | Wine Demo | Food Demo');
    console.log('-'.repeat(65));
    
    for (const r of results) {
      const ph = r.roleGinis['Parking Helms']?.toFixed(4) || 'N/A';
      const wd = r.roleGinis['Wine Demo']?.toFixed(4) || 'N/A';
      const fd = r.roleGinis['Food Demo']?.toFixed(4) || 'N/A';
      console.log(`${r.day.toString().padStart(3)} | ${r.overallGini.toFixed(4)}       | ${ph}        | ${wd}    | ${fd}`);
    }
    
    console.log('\n--- CREW ROLE RULE SATISFACTION ---');
    console.log('Day | Prefs Met | % Met  | Avg Sat | Fairness');
    console.log('-'.repeat(50));
    
    for (const r of results) {
      if (r.prefStats) {
        const p = r.prefStats;
        console.log(`${r.day.toString().padStart(3)} | ${p.preferencesMet.toString().padStart(4)}/${p.eligiblePreferences.toString().padEnd(4)} | ${p.percentMet.toFixed(1).padStart(5)}% | ${p.avgSatisfaction.toFixed(1).padStart(5)}%  | ${p.fairnessGrade.padStart(2)}`);
      } else {
        console.log(`${r.day.toString().padStart(3)} | N/A`);
      }
    }
    
    // Show improvement
    if (results.length >= 2) {
      const first = results[0];
      const last = results[results.length - 1];
      const improvement = ((first.overallGini - last.overallGini) / first.overallGini * 100);
      
      console.log('\n📉 Gini Improvement:');
      console.log(`  Day 1 Gini:  ${first.overallGini.toFixed(4)}`);
      console.log(`  Day 30 Gini: ${last.overallGini.toFixed(4)}`);
      console.log(`  Reduction:   ${improvement.toFixed(1)}%`);
      
      if (first.prefStats && last.prefStats) {
        console.log('\n🎯 Preference Satisfaction:');
        console.log(`  Day 1:  ${first.prefStats.percentMet.toFixed(1)}% met, ${first.prefStats.avgSatisfaction.toFixed(1)}% avg`);
        console.log(`  Day 30: ${last.prefStats.percentMet.toFixed(1)}% met, ${last.prefStats.avgSatisfaction.toFixed(1)}% avg`);
      }
      
      if (last.overallGini < 0.2) {
        console.log('\n✅ SUCCESS: Gini reached target range (<0.2)');
      } else if (last.overallGini < 0.3) {
        console.log('\n⚠️ PARTIAL: Gini in acceptable range (<0.3)');
      } else {
        console.log('\n❌ NEEDS WORK: Gini still too high (>0.3)');
      }
    }
    
  } finally {
    // Cleanup
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch(console.error);
