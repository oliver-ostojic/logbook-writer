import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

async function analyzeFairnessNormalized() {
  const storeId = 768;
  const roleId = 36; // Break role

  console.log('=== FAIRNESS ANALYSIS (NORMALIZED BY DAYS WORKED) ===\n');

  const dates = ['2025-11-25', '2025-12-13', '2025-12-15', '2025-12-16'];

  for (const dateStr of dates) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`DATE: ${dateStr} (with 14-day lookback)`);
    console.log('='.repeat(60));

    const date = new Date(dateStr + 'T00:00:00.000Z');
    const lookbackDays = 14;

    // Calculate lookback window
    const windowStart = new Date(date);
    windowStart.setDate(windowStart.getDate() - lookbackDays);

    console.log(`Window: ${windowStart.toISOString().split('T')[0]} to ${dateStr}`);

    // Get logbooks in the window
    const logbooks = await prisma.logbook.findMany({
      where: {
        storeId,
        date: {
          gte: windowStart,
          lte: date,
        },
        status: { in: ['DRAFT', 'PUBLISHED'] },
      },
      select: {
        date: true,
        Assignment: {
          where: { roleId },
          select: {
            crewId: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    console.log(`Logbooks found: ${logbooks.length}`);

    // Get role minutes by crew and date
    const roleMinutesData: Array<{ crewId: string; minutesAssigned: number; date: Date }> = [];

    for (const logbook of logbooks) {
      const minutesByCrew = new Map<string, number>();

      for (const assignment of logbook.Assignment) {
        const minutes = (assignment.endTime.getTime() - assignment.startTime.getTime()) / (1000 * 60);
        const current = minutesByCrew.get(assignment.crewId) ?? 0;
        minutesByCrew.set(assignment.crewId, current + minutes);
      }

      for (const [crewId, minutes] of minutesByCrew.entries()) {
        roleMinutesData.push({
          crewId,
          minutesAssigned: minutes,
          date: logbook.date,
        });
      }
    }

    // Get shift history for all crew in the lookback window
    const shiftRecords = await prisma.shift.findMany({
      where: {
        storeId,
        date: {
          gte: windowStart,
          lte: date,
        },
      },
      select: {
        crewId: true,
        date: true,
        startMin: true,
        endMin: true,
      },
    });

    console.log(`Shifts found: ${shiftRecords.length}`);

    // Calculate total shift minutes and days worked per crew
    const totalShiftMinutesByCrew = new Map<string, number>();
    const daysWorkedByCrew = new Map<string, Set<string>>();

    for (const shift of shiftRecords) {
      const shiftMinutes = shift.endMin - shift.startMin;
      const current = totalShiftMinutesByCrew.get(shift.crewId) ?? 0;
      totalShiftMinutesByCrew.set(shift.crewId, current + shiftMinutes);

      const dateStr = shift.date.toISOString().split('T')[0];
      if (!daysWorkedByCrew.has(shift.crewId)) {
        daysWorkedByCrew.set(shift.crewId, new Set());
      }
      daysWorkedByCrew.get(shift.crewId)!.add(dateStr);
    }

    // Get eligible crew
    const eligibleCrew = await prisma.crewRole.findMany({
      where: {
        roleId,
        Crew: { storeId },
      },
      select: { crewId: true, Crew: { select: { name: true } } },
    });

    const eligibleCrewIds = new Set(eligibleCrew.map(c => c.crewId));
    const crewNames = new Map(eligibleCrew.map(c => [c.crewId, c.Crew.name]));

    console.log(`Eligible crew: ${eligibleCrewIds.size}`);

    // Aggregate: total role minutes per crew
    const roleMinutesByCrew = new Map<string, number>();

    for (const record of roleMinutesData) {
      if (!eligibleCrewIds.has(record.crewId)) continue;
      const current = roleMinutesByCrew.get(record.crewId) ?? 0;
      roleMinutesByCrew.set(record.crewId, current + record.minutesAssigned);
    }

    // Calculate minutes per day worked for each crew
    const minutesPerDayList: number[] = [];
    const crewDetails: Array<{ crewId: string; name: string; roleMinutes: number; daysWorked: number; minutesPerDay: number }> = [];

    for (const crewId of eligibleCrewIds) {
      const roleMinutes = roleMinutesByCrew.get(crewId) ?? 0;
      const totalShiftMinutes = totalShiftMinutesByCrew.get(crewId) ?? 0;

      // Skip crew who didn't work at all in lookback window
      if (totalShiftMinutes === 0) continue;

      const daysWorked = daysWorkedByCrew.get(crewId)?.size ?? 0;
      const minPerDay = daysWorked > 0 ? roleMinutes / daysWorked : 0;

      minutesPerDayList.push(minPerDay);
      crewDetails.push({
        crewId,
        name: crewNames.get(crewId) || 'Unknown',
        roleMinutes,
        daysWorked,
        minutesPerDay: minPerDay,
      });
    }

    crewDetails.sort((a, b) => a.minutesPerDay - b.minutesPerDay);

    // Calculate fairness metrics
    const gini = calculateGini(minutesPerDayList);
    const fairnessIndex = 100 * (1 - gini);

    console.log(`\n📊 CALCULATED METRICS (matching service logic):`);
    console.log(`   Crew who worked: ${minutesPerDayList.length}`);
    console.log(`   Gini Coefficient: ${gini.toFixed(4)}`);
    console.log(`   Fairness Index: ${fairnessIndex.toFixed(1)}%`);

    // Get snapshot
    const snapshot = await prisma.roleFairnessSnapshot.findFirst({
      where: { roleId, date },
    });

    if (snapshot) {
      console.log(`\n📈 SNAPSHOT DATA (from database):`);
      console.log(`   Gini Coefficient: ${snapshot.giniCoefficient.toFixed(4)}`);
      console.log(`   Fairness Index: ${snapshot.fairnessIndex.toFixed(1)}%`);
      console.log(`   Fairness Grade: ${snapshot.fairnessGrade}`);

      const giniDiff = Math.abs(gini - snapshot.giniCoefficient);
      if (giniDiff > 0.001) {
        console.log(`\n⚠️  MISMATCH: Calculated Gini differs by ${giniDiff.toFixed(4)}`);
      } else {
        console.log(`\n✅ MATCH: Calculated Gini matches snapshot!`);
      }
    }

    // Show crew distribution
    console.log(`\n🔻 BOTTOM 10 (least minutes per day worked):`);
    for (let i = 0; i < Math.min(10, crewDetails.length); i++) {
      const c = crewDetails[i];
      console.log(`   ${i + 1}. ${c.name}: ${c.minutesPerDay.toFixed(1)} min/day (${c.roleMinutes} total, ${c.daysWorked} days)`);
    }

    console.log(`\n🔺 TOP 10 (most minutes per day worked):`);
    for (let i = Math.max(0, crewDetails.length - 10); i < crewDetails.length; i++) {
      const c = crewDetails[i];
      const rank = i - (crewDetails.length - 10) + 1;
      console.log(`   ${rank}. ${c.name}: ${c.minutesPerDay.toFixed(1)} min/day (${c.roleMinutes} total, ${c.daysWorked} days)`);
    }

    // Show distribution histogram
    const histogram = new Map<number, number>();
    for (const mpd of minutesPerDayList) {
      const rounded = Math.round(mpd);
      histogram.set(rounded, (histogram.get(rounded) || 0) + 1);
    }

    console.log(`\n📊 DISTRIBUTION HISTOGRAM (minutes per day):`);
    const sortedBuckets = Array.from(histogram.entries()).sort((a, b) => a[0] - b[0]);
    for (const [mpd, count] of sortedBuckets) {
      const bar = '█'.repeat(Math.ceil(count / 2));
      console.log(`   ${mpd.toString().padStart(3)} min/day: ${count.toString().padStart(2)} crew ${bar}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('=== ANALYSIS COMPLETE ===');
  console.log('='.repeat(60) + '\n');
}

analyzeFairnessNormalized()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
