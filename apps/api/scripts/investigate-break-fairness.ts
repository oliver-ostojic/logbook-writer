import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface BreakStats {
  dateRange: string;
  crewId: string;
  totalMinutes: number;
  daysWorked: number;
  avgMinutesPerDay: number;
}

async function investigateBreakFairness() {
  // Assuming store ID - adjust if needed
  const storeId = 768;

  console.log('=== BREAK ROLE FAIRNESS INVESTIGATION ===\n');

  // 1. Check BREAK role fairness tracker settings
  console.log('1. BREAK Role Fairness Tracker Settings:');
  const breakRole = await prisma.role.findFirst({
    where: {
      storeId,
      displayName: 'Break'
    },
    include: {
      RoleFairnessTracker: true
    }
  });

  if (!breakRole) {
    console.log('ERROR: BREAK role not found!');
    return;
  }

  console.log(`   Role ID: ${breakRole.id}`);
  console.log(`   Fairness Tracker Enabled: ${breakRole.RoleFairnessTracker?.enabled}`);
  console.log(`   Lookback Days: ${breakRole.RoleFairnessTracker?.lookbackDays}`);
  console.log();

  const roleId = breakRole.id;

  // Date ranges to investigate
  const dateRanges = [
    { name: '11/25 only', start: '2024-11-25', end: '2024-11-25' },
    { name: '11/25 + 12/13', start: '2024-11-25', end: '2024-12-13' },
    { name: '11/25 to 12/15', start: '2024-11-25', end: '2024-12-15' },
    { name: '11/25 to 12/16', start: '2024-11-25', end: '2024-12-16' }
  ];

  for (const range of dateRanges) {
    console.log(`\n=== ${range.name.toUpperCase()} ===`);

    // Get all crew break minutes in this range
    const history = await prisma.crewRoleFairnessHistory.findMany({
      where: {
        roleId,
        date: {
          gte: new Date(range.start),
          lte: new Date(range.end)
        }
      },
      include: {
        Crew: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [
        { date: 'asc' },
        { crewId: 'asc' }
      ]
    });

    // Aggregate by crew
    const crewMap = new Map<string, { totalMinutes: number; dates: Set<string> }>();

    for (const record of history) {
      const existing = crewMap.get(record.crewId) || { totalMinutes: 0, dates: new Set() };
      existing.totalMinutes += record.minutesAssigned;
      existing.dates.add(record.date.toISOString().split('T')[0]);
      crewMap.set(record.crewId, existing);
    }

    // Calculate stats
    const crewStats: BreakStats[] = [];
    for (const [crewId, data] of crewMap.entries()) {
      crewStats.push({
        dateRange: range.name,
        crewId,
        totalMinutes: data.totalMinutes,
        daysWorked: data.dates.size,
        avgMinutesPerDay: data.totalMinutes / data.dates.size
      });
    }

    crewStats.sort((a, b) => a.totalMinutes - b.totalMinutes);

    // Distribution stats
    const minutes = crewStats.map(s => s.totalMinutes);
    const mean = minutes.reduce((a, b) => a + b, 0) / minutes.length;
    const variance = minutes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / minutes.length;
    const stdDev = Math.sqrt(variance);
    const min = Math.min(...minutes);
    const max = Math.max(...minutes);
    const median = minutes[Math.floor(minutes.length / 2)];

    console.log(`\n   Crew Count: ${crewStats.length}`);
    console.log(`   Mean: ${mean.toFixed(2)} min`);
    console.log(`   Median: ${median} min`);
    console.log(`   Std Dev: ${stdDev.toFixed(2)} min`);
    console.log(`   Min: ${min} min`);
    console.log(`   Max: ${max} min`);
    console.log(`   Range: ${max - min} min`);

    // Show Gini coefficient from snapshot
    const snapshot = await prisma.roleFairnessSnapshot.findFirst({
      where: {
        roleId,
        date: new Date(range.end)
      }
    });

    if (snapshot) {
      console.log(`\n   Gini Coefficient: ${snapshot.giniCoefficient.toFixed(4)}`);
      console.log(`   Fairness Index: ${snapshot.fairnessIndex.toFixed(4)}`);
      console.log(`   Fairness Grade: ${snapshot.fairnessGrade}`);
    }

    // Show outliers (bottom 5 and top 5)
    console.log(`\n   Bottom 5 Crew (least break minutes):`);
    for (let i = 0; i < Math.min(5, crewStats.length); i++) {
      const s = crewStats[i];
      console.log(`      ${s.crewId}: ${s.totalMinutes} min (${s.daysWorked} days, ${s.avgMinutesPerDay.toFixed(1)} min/day)`);
    }

    console.log(`\n   Top 5 Crew (most break minutes):`);
    for (let i = Math.max(0, crewStats.length - 5); i < crewStats.length; i++) {
      const s = crewStats[i];
      console.log(`      ${s.crewId}: ${s.totalMinutes} min (${s.daysWorked} days, ${s.avgMinutesPerDay.toFixed(1)} min/day)`);
    }

    // Check for crew with 0 minutes
    const allCrew = await prisma.crew.findMany({
      where: { storeId },
      select: { id: true }
    });

    const crewWithBreaks = new Set(crewStats.map(s => s.crewId));
    const crewWithoutBreaks = allCrew.filter(c => !crewWithBreaks.has(c.id));

    if (crewWithoutBreaks.length > 0) {
      console.log(`\n   ⚠️  Crew with NO breaks: ${crewWithoutBreaks.length}`);
      for (const c of crewWithoutBreaks.slice(0, 10)) {
        console.log(`      ${c.id}`);
      }
    }
  }

  console.log('\n=== INVESTIGATION COMPLETE ===\n');
}

investigateBreakFairness()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
