import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeRole(roleId: number, roleName: string) {
  const STORE_ID = 768;
  const latestDate = new Date('2025-12-16');
  const lookbackDays = 30;
  const windowStart = new Date(latestDate);
  windowStart.setDate(windowStart.getDate() - lookbackDays);

  // Get eligible crew for this role
  const eligibleCrew = await prisma.crewRole.findMany({
    where: { roleId },
    include: { Crew: { select: { id: true, name: true, storeId: true } } },
  });
  const eligibleCrewInStore = eligibleCrew.filter((c) => c.Crew.storeId === STORE_ID);
  const eligibleIds = new Set(eligibleCrewInStore.map((c) => c.crewId));

  // Get role history in lookback
  const roleHistory = await prisma.crewRoleFairnessHistory.findMany({
    where: {
      storeId: STORE_ID,
      roleId,
      date: { gte: windowStart, lte: latestDate },
    },
  });

  // Get shift history in lookback for eligible crew only
  const shifts = await prisma.shift.findMany({
    where: {
      storeId: STORE_ID,
      date: { gte: windowStart, lte: latestDate },
      crewId: { in: [...eligibleIds] },
    },
    include: { Crew: { select: { name: true } } },
  });

  // Calculate total shift hours per crew
  const crewShiftHours: Map<string, { name: string; hours: number }> = new Map();
  for (const shift of shifts) {
    const current = crewShiftHours.get(shift.crewId) || {
      name: shift.Crew?.name || shift.crewId,
      hours: 0,
    };
    current.hours += (shift.endMin - shift.startMin) / 60;
    crewShiftHours.set(shift.crewId, current);
  }

  // Calculate total role minutes per crew
  const crewRoleMinutes: Map<string, number> = new Map();
  for (const record of roleHistory) {
    const current = crewRoleMinutes.get(record.crewId) || 0;
    crewRoleMinutes.set(record.crewId, current + record.minutesAssigned);
  }

  // Calculate min/hr for eligible crew who worked
  let withZero = 0;
  let withAssignment = 0;
  const minPerHourValues: number[] = [];

  for (const [crewId, shiftData] of crewShiftHours) {
    if (!eligibleIds.has(crewId)) continue;
    const roleMin = crewRoleMinutes.get(crewId) || 0;
    const minPerHour = shiftData.hours > 0 ? roleMin / shiftData.hours : 0;
    minPerHourValues.push(minPerHour);
    if (roleMin === 0) withZero++;
    else withAssignment++;
  }

  // Gini
  const n = minPerHourValues.length;
  const mean = n > 0 ? minPerHourValues.reduce((a, b) => a + b, 0) / n : 0;
  let gini = 0;
  if (n > 0 && mean > 0) {
    let sumDiffs = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        sumDiffs += Math.abs(minPerHourValues[i] - minPerHourValues[j]);
      }
    }
    gini = sumDiffs / (2 * n * n * mean);
  }

  console.log(`\n=== ${roleName} (ID: ${roleId}) ===`);
  console.log(`Eligible crew in store: ${eligibleCrewInStore.length}`);
  console.log(`Eligible crew who worked in lookback: ${crewShiftHours.size}`);
  console.log(`  - With assignment: ${withAssignment} (${((withAssignment / n) * 100).toFixed(0)}%)`);
  console.log(`  - With 0 min/hr:   ${withZero} (${((withZero / n) * 100).toFixed(0)}%) ❌`);
  console.log(`Mean min/hr: ${mean.toFixed(3)}`);
  console.log(`Gini: ${gini.toFixed(4)}`);
}

async function main() {
  console.log('=== Role Fairness Analysis: Who is getting 0 min/hr? ===\n');

  await analyzeRole(29, 'Parking Helms');
  await analyzeRole(38, 'Food Demo');
  await analyzeRole(37, 'Wine Demo');

  await prisma.$disconnect();
}

main();
