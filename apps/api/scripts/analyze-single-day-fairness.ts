import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function calculateGini(values: number[]): number {
  if (values.length === 0) return 0;

  let giniSum = 0;
  const total = values.reduce((a, b) => a + b, 0);

  if (total === 0) return 0;

  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < values.length; j++) {
      giniSum += Math.abs(values[i] - values[j]);
    }
  }

  return giniSum / (2 * values.length * total);
}

async function analyzeSingleDayFairness() {
  const storeId = 768;
  const roleId = 36; // Break role

  console.log('=== SINGLE-DAY BREAK FAIRNESS ANALYSIS ===\n');

  const dates = ['2025-11-25', '2025-12-13', '2025-12-15', '2025-12-16'];

  // Get all crew for the store
  const allCrew = await prisma.crew.findMany({
    where: { storeId },
    select: { id: true }
  });

  console.log(`Total crew in store: ${allCrew.length}\n`);

  for (const dateStr of dates) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`DATE: ${dateStr}`);
    console.log('='.repeat(60));

    // Get assignments for this single day
    const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
    const endOfDay = new Date(dateStr + 'T23:59:59.999Z');

    const assignments = await prisma.assignment.findMany({
      where: {
        roleId,
        startTime: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        Crew: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    console.log(`Total break assignments: ${assignments.length}`);

    // Group by crew and calculate minutes
    const crewMinutes = new Map<string, number>();

    for (const assignment of assignments) {
      const minutes = Math.round((assignment.endTime.getTime() - assignment.startTime.getTime()) / 60000);
      const existing = crewMinutes.get(assignment.crewId) || 0;
      crewMinutes.set(assignment.crewId, existing + minutes);
    }

    // For Gini calculation, we need to include ALL crew (including those with 0 minutes)
    const allMinutes: number[] = [];

    for (const crew of allCrew) {
      const minutes = crewMinutes.get(crew.id) || 0;
      allMinutes.push(minutes);
    }

    allMinutes.sort((a, b) => a - b);

    // Calculate stats
    const crewWithBreaks = Array.from(crewMinutes.keys()).length;
    const total = allMinutes.reduce((a, b) => a + b, 0);
    const mean = total / allMinutes.length;
    const nonZero = allMinutes.filter(m => m > 0);
    const min = Math.min(...nonZero);
    const max = Math.max(...nonZero);

    console.log(`\n📊 SINGLE-DAY DISTRIBUTION:`);
    console.log(`   Crew with breaks: ${crewWithBreaks} / ${allCrew.length}`);
    console.log(`   Coverage: ${((crewWithBreaks / allCrew.length) * 100).toFixed(1)}%`);
    console.log(`   Mean (all crew): ${mean.toFixed(1)} min`);
    console.log(`   Min (non-zero): ${min} min`);
    console.log(`   Max (non-zero): ${max} min`);

    // Calculate Gini coefficient (including zeros)
    const gini = calculateGini(allMinutes);
    const fairnessIndex = (1 - gini) * 100;

    console.log(`\n📈 CALCULATED METRICS:`);
    console.log(`   Gini Coefficient: ${gini.toFixed(4)}`);
    console.log(`   Fairness Index: ${fairnessIndex.toFixed(1)}%`);

    // Get snapshot data
    const snapshot = await prisma.roleFairnessSnapshot.findFirst({
      where: {
        roleId,
        date: startOfDay
      }
    });

    if (snapshot) {
      console.log(`\n📊 SNAPSHOT DATA (from database):`);
      console.log(`   Gini Coefficient: ${snapshot.giniCoefficient.toFixed(4)}`);
      console.log(`   Fairness Index: ${snapshot.fairnessIndex.toFixed(1)}%`);
      console.log(`   Fairness Grade: ${snapshot.fairnessGrade}`);

      const giniDiff = Math.abs(gini - snapshot.giniCoefficient);
      if (giniDiff > 0.001) {
        console.log(`\n⚠️  MISMATCH: Calculated Gini differs by ${giniDiff.toFixed(4)}`);
      } else {
        console.log(`\n✅ MATCH: Calculated Gini matches snapshot`);
      }
    } else {
      console.log(`\n❌ NO SNAPSHOT FOUND`);
    }

    // Show distribution of break minutes
    const histogram = new Map<number, number>();
    for (const minutes of allMinutes) {
      histogram.set(minutes, (histogram.get(minutes) || 0) + 1);
    }

    console.log(`\n📊 DISTRIBUTION HISTOGRAM:`);
    const sortedBuckets = Array.from(histogram.entries()).sort((a, b) => a[0] - b[0]);
    for (const [minutes, count] of sortedBuckets) {
      const bar = '█'.repeat(Math.ceil(count / 2));
      console.log(`   ${minutes.toString().padStart(3)} min: ${count.toString().padStart(2)} crew ${bar}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('=== ANALYSIS COMPLETE ===');
  console.log('='.repeat(60) + '\n');
}

analyzeSingleDayFairness()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
