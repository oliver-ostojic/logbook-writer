import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const targetDates = [new Date('2025-12-13'), new Date('2025-12-15')];

  for (const targetDate of targetDates) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Analyzing 14-day lookback for ${targetDate.toISOString().split('T')[0]}`);
    console.log('='.repeat(60));

    // Calculate lookback window
    const windowStart = new Date(targetDate);
    windowStart.setDate(windowStart.getDate() - 14);

    console.log(`Lookback window: ${windowStart.toISOString().split('T')[0]} to ${targetDate.toISOString().split('T')[0]}`);

    // Get all logbooks in the lookback window
    const logbooks = await prisma.logbook.findMany({
      where: {
        storeId: 768,
        date: { gte: windowStart, lte: targetDate },
        status: { in: ['PUBLISHED', 'DRAFT'] }
      },
      select: { id: true, date: true, status: true }
    });

    console.log(`\nFound ${logbooks.length} logbooks in lookback window:`);
    logbooks.sort((a, b) => a.date.getTime() - b.date.getTime()).forEach(lb => {
      console.log(`  ${lb.date.toISOString().split('T')[0]} (${lb.status})`);
    });

    // Get all shifts in the lookback window
    const shifts = await prisma.shift.findMany({
      where: {
        storeId: 768,
        date: { gte: windowStart, lte: targetDate }
      },
      select: { crewId: true, date: true }
    });

    // Group shifts by crew
    const crewDaysWorked = new Map<string, Set<string>>();
    shifts.forEach(s => {
      const dateStr = s.date.toISOString().split('T')[0];
      if (!crewDaysWorked.has(s.crewId)) {
        crewDaysWorked.set(s.crewId, new Set());
      }
      crewDaysWorked.get(s.crewId)!.add(dateStr);
    });

    console.log(`\n${crewDaysWorked.size} unique crew worked in the lookback window`);

    // Get break assignments in the lookback window
    const breakAssignments = await prisma.assignment.findMany({
      where: {
        Logbook: {
          storeId: 768,
          date: { gte: windowStart, lte: targetDate },
          status: { in: ['PUBLISHED', 'DRAFT'] }
        },
        roleId: 36  // Break role
      },
      select: {
        crewId: true,
        startTime: true,
        endTime: true,
        Logbook: {
          select: { date: true }
        }
      }
    });

    // Calculate total break minutes per crew
    const crewBreakMinutes = new Map<string, number>();
    breakAssignments.forEach(a => {
      const start = new Date(a.startTime);
      const end = new Date(a.endTime);
      const mins = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
      crewBreakMinutes.set(a.crewId, (crewBreakMinutes.get(a.crewId) || 0) + mins);
    });

    // Calculate minutes per day worked for each crew
    const crewMinutesPerDay: { crewId: string; breakMins: number; daysWorked: number; minPerDay: number }[] = [];
    crewDaysWorked.forEach((daysSet, crewId) => {
      const breakMins = crewBreakMinutes.get(crewId) || 0;
      const daysWorked = daysSet.size;
      const minPerDay = daysWorked > 0 ? breakMins / daysWorked : 0;
      crewMinutesPerDay.push({ crewId, breakMins, daysWorked, minPerDay });
    });

    // Sort by minPerDay
    crewMinutesPerDay.sort((a, b) => a.minPerDay - b.minPerDay);

    console.log(`\nBreak minutes per day worked (sample):`);
    const samples = [
      ...crewMinutesPerDay.slice(0, 5),   // Bottom 5
      ...crewMinutesPerDay.slice(-5)     // Top 5
    ];

    samples.forEach(c => {
      console.log(`  ${c.crewId}: ${c.breakMins} mins total / ${c.daysWorked} days = ${c.minPerDay.toFixed(1)} min/day`);
    });

    // Calculate Gini coefficient
    const values = crewMinutesPerDay.map(c => c.minPerDay);
    const gini = calculateGini(values);
    console.log(`\nCalculated Gini: ${gini.toFixed(4)}`);
    console.log(`Fairness Index: ${(100 * (1 - gini)).toFixed(1)}%`);

    // Distribution summary
    const withZero = values.filter(v => v === 0).length;
    const with30 = values.filter(v => v >= 29 && v <= 31).length;
    console.log(`\nDistribution:`);
    console.log(`  ${withZero} crew with 0 min/day`);
    console.log(`  ${with30} crew with ~30 min/day`);
    console.log(`  ${values.length} total crew in calculation`);
  }
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
