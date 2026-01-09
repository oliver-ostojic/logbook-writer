import { PrismaClient } from '@prisma/client';
import { calculateAndStoreFairnessSnapshot } from '../src/services/role-fairness.service';

const prisma = new PrismaClient();

async function main() {
  const storeId = 768;

  // Get all logbooks for this store
  const logbooks = await prisma.logbook.findMany({
    where: { storeId, status: 'PUBLISHED' },
    orderBy: { date: 'desc' },
    take: 10, // Regenerate last 10 dates
    select: { date: true }
  });

  console.log(`Regenerating fairness snapshots for ${logbooks.length} dates...\n`);

  for (const logbook of logbooks) {
    const dateStr = logbook.date.toISOString().split('T')[0];
    console.log(`Processing ${dateStr}...`);

    try {
      await calculateAndStoreFairnessSnapshot(prisma, {
        storeId,
        date: logbook.date,
      });
      console.log(`  ✓ Success\n`);
    } catch (error) {
      console.error(`  ✗ Error: ${error}\n`);
    }
  }

  console.log('Done! Fairness snapshots regenerated.');

  // Show sample BREAK fairness data
  const breakRole = await prisma.role.findFirst({
    where: { storeId, displayName: { contains: 'BREAK', mode: 'insensitive' } },
    select: { id: true, displayName: true }
  });

  if (breakRole) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('BREAK Fairness After Regeneration:');
    console.log('='.repeat(60));

    const snapshots = await prisma.roleFairnessSnapshot.findMany({
      where: { storeId, roleId: breakRole.id },
      orderBy: { date: 'desc' },
      take: 4,
      select: {
        date: true,
        giniCoefficient: true,
        fairnessIndex: true,
        fairnessGrade: true,
        minMinutesPerDay: true,
        maxMinutesPerDay: true,
        avgMinutesPerDay: true,
      }
    });

    snapshots.forEach(s => {
      console.log(`\nDate: ${s.date.toISOString().split('T')[0]}`);
      console.log(`  Fairness: ${s.fairnessIndex.toFixed(1)}% (${s.fairnessGrade})`);
      console.log(`  Gini: ${s.giniCoefficient.toFixed(3)}`);
      console.log(`  Min/Max/Avg per day: ${s.minMinutesPerDay.toFixed(1)} / ${s.maxMinutesPerDay.toFixed(1)} / ${s.avgMinutesPerDay.toFixed(1)}`);
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
