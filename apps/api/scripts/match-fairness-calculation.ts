import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * This script replicates the exact fairness calculation logic from role-fairness.service.ts
 */
async function main() {
  const targetDate = new Date('2025-12-15');
  const storeId = 768;
  const roleId = 36; // Break role
  const lookbackDays = 14;

  console.log(`Analyzing fairness for ${targetDate.toISOString().split('T')[0]}`);
  console.log(`Lookback: ${lookbackDays} days`);

  // Calculate lookback window
  const windowStart = new Date(targetDate);
  windowStart.setDate(windowStart.getDate() - lookbackDays);

  console.log(`Window: ${windowStart.toISOString().split('T')[0]} to ${targetDate.toISOString().split('T')[0]}`);

  // Step 1: Get eligible crew (those with CrewRole for this role)
  const eligibleCrew = await prisma.crewRole.findMany({
    where: {
      roleId,
      Role: { storeId }
    },
    select: { crewId: true }
  });
  const eligibleCrewIds = new Set(eligibleCrew.map(cr => cr.crewId));
  console.log(`\n${eligibleCrewIds.size} eligible crew for Break role`);

  // Step 2: Get role minutes data (from assignments since no tracker)
  const logbooks = await prisma.logbook.findMany({
    where: {
      storeId,
      date: { gte: windowStart, lte: targetDate },
      status: { in: ['DRAFT', 'PUBLISHED'] }
    },
    select: {
      id: true,
      date: true,
      Assignment: {
        where: { roleId },
        select: {
          crewId: true,
          startTime: true,
          endTime: true
        }
      }
    }
  });

  console.log(`\nFound ${logbooks.length} logbooks in lookback`);
  logbooks.forEach(lb => console.log(`  - ${lb.date.toISOString().split('T')[0]}: ${lb.Assignment.length} break assignments`));

  const roleMinutesByCrew = new Map<string, number>();
  for (const lb of logbooks) {
    for (const assignment of lb.Assignment) {
      const start = new Date(assignment.startTime);
      const end = new Date(assignment.endTime);
      const mins = (end.getTime() - start.getTime()) / (1000 * 60);
      roleMinutesByCrew.set(
        assignment.crewId,
        (roleMinutesByCrew.get(assignment.crewId) || 0) + mins
      );
    }
  }

  // Step 3: Get shift data (days worked per crew)
  const shifts = await prisma.shift.findMany({
    where: {
      storeId,
      date: { gte: windowStart, lte: targetDate }
    },
    select: { crewId: true, date: true }
  });

  const totalShiftMinutesByCrew = new Map<string, number>();
  const daysWorkedByCrew = new Map<string, Set<string>>();

  for (const shift of shifts) {
    const dateStr = shift.date.toISOString().split('T')[0];
    if (!daysWorkedByCrew.has(shift.crewId)) {
      daysWorkedByCrew.set(shift.crewId, new Set());
    }
    daysWorkedByCrew.get(shift.crewId)!.add(dateStr);

    // Note: We don't have shift duration here, but it's only used to filter out crew who didn't work
    // Setting a non-zero value to indicate they worked
    totalShiftMinutesByCrew.set(shift.crewId, 1);
  }

  // Step 4: Calculate minutes per day worked for each ELIGIBLE crew
  const minutesPerDay: number[] = [];
  const crewDetails: Array<{ crewId: string; roleMinutes: number; daysWorked: number; minPerDay: number }> = [];

  for (const crewId of eligibleCrewIds) {
    const roleMinutes = roleMinutesByCrew.get(crewId) ?? 0;
    const totalShiftMinutes = totalShiftMinutesByCrew.get(crewId) ?? 0;

    // Skip crew who didn't work at all in lookback window
    if (totalShiftMinutes === 0) {
      console.log(`  Skipping ${crewId}: didn't work in lookback`);
      continue;
    }

    const daysWorked = daysWorkedByCrew.get(crewId)?.size ?? 0;
    const minPerDay = daysWorked > 0 ? roleMinutes / daysWorked : 0;

    minutesPerDay.push(minPerDay);
    crewDetails.push({ crewId, roleMinutes, daysWorked, minPerDay });
  }

  // Sort by minPerDay
  crewDetails.sort((a, b) => a.minPerDay - b.minPerDay);

  console.log(`\n${minutesPerDay.length} crew included in fairness calculation`);
  console.log(`\nSample crew (bottom 10):`);
  crewDetails.slice(0, 10).forEach(c => {
    console.log(`  ${c.crewId}: ${c.roleMinutes} break mins / ${c.daysWorked} days = ${c.minPerDay.toFixed(1)} min/day`);
  });

  console.log(`\nSample crew (top 10):`);
  crewDetails.slice(-10).forEach(c => {
    console.log(`  ${c.crewId}: ${c.roleMinutes} break mins / ${c.daysWorked} days = ${c.minPerDay.toFixed(1)} min/day`);
  });

  // Step 5: Calculate Gini coefficient
  const gini = calculateGini(minutesPerDay);
  const fairnessIndex = 100 * (1 - gini);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Calculated Gini: ${gini.toFixed(4)}`);
  console.log(`Calculated Fairness Index: ${fairnessIndex.toFixed(1)}%`);
  console.log(`Database Snapshot Gini: 0.4269`);
  console.log(`Database Snapshot Fairness: 57.3%`);
  console.log('='.repeat(60));

  // Distribution analysis
  const withZero = minutesPerDay.filter(v => v < 1).length;
  const with30 = minutesPerDay.filter(v => v >= 29 && v <= 31).length;
  const withOther = minutesPerDay.length - withZero - with30;

  console.log(`\nDistribution:`);
  console.log(`  ${withZero} crew with 0 min/day`);
  console.log(`  ${with30} crew with ~30 min/day`);
  console.log(`  ${withOther} crew with other values`);
  console.log(`  Min: ${Math.min(...minutesPerDay).toFixed(1)}, Max: ${Math.max(...minutesPerDay).toFixed(1)}, Avg: ${(minutesPerDay.reduce((a, b) => a + b, 0) / minutesPerDay.length).toFixed(1)}`);
}

function calculateGini(values: number[]): number {
  if (values.length === 0) return 0;

  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, v) => sum + v, 0);

  if (total === 0) return 0;

  let sumOfDifferences = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumOfDifferences += Math.abs(sorted[i] - sorted[j]);
    }
  }

  return sumOfDifferences / (2 * n * total);
}

main().finally(() => prisma.$disconnect());
