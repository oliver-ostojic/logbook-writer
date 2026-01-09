import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CrewBreakStats {
  crewId: string;
  crewName: string;
  totalMinutes: number;
  assignmentCount: number;
  dates: string[];
}

async function investigateBreakAssignments() {
  const storeId = 768;
  const roleId = 36; // Break role

  console.log('=== BREAK ASSIGNMENT INVESTIGATION ===\n');

  // Date ranges to investigate (2025, not 2024!)
  const dateRanges = [
    { name: '11/25 only', dates: ['2025-11-25'] },
    { name: '11/25 + 12/13', dates: ['2025-11-25', '2025-12-13'] },
    { name: '11/25 to 12/15', dates: ['2025-11-25', '2025-12-13', '2025-12-15'] },
    { name: '11/25 to 12/16', dates: ['2025-11-25', '2025-12-13', '2025-12-15', '2025-12-16'] }
  ];

  // Get all crew for the store
  const allCrew = await prisma.crew.findMany({
    where: { storeId },
    select: { id: true, name: true }
  });

  console.log(`Total crew in store: ${allCrew.length}\n`);

  for (const range of dateRanges) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${range.name.toUpperCase()}`);
    console.log('='.repeat(60));

    // Get all assignments for these dates
    const assignments = await prisma.assignment.findMany({
      where: {
        roleId,
        startTime: {
          gte: new Date(range.dates[0] + 'T00:00:00.000Z'),
          lte: new Date(range.dates[range.dates.length - 1] + 'T23:59:59.999Z')
        }
      },
      include: {
        Crew: {
          select: {
            id: true,
            name: true
          }
        },
        Logbook: {
          select: {
            date: true
          }
        }
      },
      orderBy: [
        { startTime: 'asc' }
      ]
    });

    console.log(`\nTotal break assignments: ${assignments.length}`);

    // Group by crew
    const crewMap = new Map<string, CrewBreakStats>();

    for (const assignment of assignments) {
      const minutes = Math.round((assignment.endTime.getTime() - assignment.startTime.getTime()) / 60000);
      const dateStr = assignment.Logbook.date.toISOString().split('T')[0];

      const existing = crewMap.get(assignment.crewId) || {
        crewId: assignment.crewId,
        crewName: assignment.Crew.name,
        totalMinutes: 0,
        assignmentCount: 0,
        dates: []
      };

      existing.totalMinutes += minutes;
      existing.assignmentCount += 1;
      if (!existing.dates.includes(dateStr)) {
        existing.dates.push(dateStr);
      }

      crewMap.set(assignment.crewId, existing);
    }

    // Convert to array and sort
    const crewStats: CrewBreakStats[] = Array.from(crewMap.values());
    crewStats.sort((a, b) => a.totalMinutes - b.totalMinutes);

    // Calculate distribution stats
    const minutes = crewStats.map(s => s.totalMinutes);
    if (minutes.length === 0) {
      console.log('\n⚠️  NO BREAK ASSIGNMENTS FOUND!\n');
      continue;
    }

    const mean = minutes.reduce((a, b) => a + b, 0) / minutes.length;
    const variance = minutes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / minutes.length;
    const stdDev = Math.sqrt(variance);
    const min = Math.min(...minutes);
    const max = Math.max(...minutes);
    const median = minutes[Math.floor(minutes.length / 2)];

    // Calculate Gini coefficient manually
    let giniSum = 0;
    for (let i = 0; i < minutes.length; i++) {
      for (let j = 0; j < minutes.length; j++) {
        giniSum += Math.abs(minutes[i] - minutes[j]);
      }
    }
    const giniCoefficient = giniSum / (2 * minutes.length * minutes.reduce((a, b) => a + b, 0));

    console.log(`\n📊 DISTRIBUTION STATS:`);
    console.log(`   Crew with breaks: ${crewStats.length} / ${allCrew.length}`);
    console.log(`   Coverage: ${((crewStats.length / allCrew.length) * 100).toFixed(1)}%`);
    console.log(`   Mean: ${mean.toFixed(1)} min`);
    console.log(`   Median: ${median} min`);
    console.log(`   Std Dev: ${stdDev.toFixed(1)} min`);
    console.log(`   Min: ${min} min`);
    console.log(`   Max: ${max} min`);
    console.log(`   Range: ${max - min} min`);
    console.log(`   Gini Coefficient: ${giniCoefficient.toFixed(4)}`);
    console.log(`   Fairness Index: ${((1 - giniCoefficient) * 100).toFixed(1)}%`);

    // Check snapshot
    const lastDate = range.dates[range.dates.length - 1];
    const snapshot = await prisma.roleFairnessSnapshot.findFirst({
      where: {
        roleId,
        date: new Date(lastDate + 'T00:00:00.000Z')
      }
    });

    if (snapshot) {
      console.log(`\n📈 SNAPSHOT DATA (${lastDate}):`);
      console.log(`   Gini Coefficient: ${snapshot.giniCoefficient.toFixed(4)}`);
      console.log(`   Fairness Index: ${snapshot.fairnessIndex.toFixed(1)}%`);
      console.log(`   Fairness Grade: ${snapshot.fairnessGrade}`);
    }

    // Show outliers
    console.log(`\n🔻 BOTTOM 10 (least break minutes):`);
    for (let i = 0; i < Math.min(10, crewStats.length); i++) {
      const s = crewStats[i];
      console.log(`   ${i + 1}. ${s.crewName} (${s.crewId}): ${s.totalMinutes} min (${s.assignmentCount} breaks, ${s.dates.length} days)`);
    }

    console.log(`\n🔺 TOP 10 (most break minutes):`);
    for (let i = Math.max(0, crewStats.length - 10); i < crewStats.length; i++) {
      const s = crewStats[i];
      const rank = i - (crewStats.length - 10) + 1;
      console.log(`   ${rank}. ${s.crewName} (${s.crewId}): ${s.totalMinutes} min (${s.assignmentCount} breaks, ${s.dates.length} days)`);
    }

    // Show crew without breaks
    const crewWithBreaks = new Set(crewStats.map(s => s.crewId));
    const crewWithoutBreaks = allCrew.filter(c => !crewWithBreaks.has(c.id));

    if (crewWithoutBreaks.length > 0) {
      console.log(`\n⚠️  CREW WITH NO BREAKS: ${crewWithoutBreaks.length}`);
      for (const c of crewWithoutBreaks.slice(0, 15)) {
        console.log(`   ${c.name} (${c.id})`);
      }
      if (crewWithoutBreaks.length > 15) {
        console.log(`   ... and ${crewWithoutBreaks.length - 15} more`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('=== INVESTIGATION COMPLETE ===');
  console.log('='.repeat(60) + '\n');
}

investigateBreakAssignments()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
