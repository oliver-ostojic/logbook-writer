import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const dates = [new Date('2025-12-13'), new Date('2025-12-15'), new Date('2025-12-16')];

  for (const date of dates) {
    const logbook = await prisma.logbook.findFirst({
      where: { storeId: 768, date, status: 'PUBLISHED' },
      select: { id: true }
    });

    if (!logbook) {
      console.log('No logbook for', date.toISOString().split('T')[0]);
      continue;
    }

    const assignments = await prisma.assignment.findMany({
      where: { logbookId: logbook.id, roleId: 36 },
      select: { crewId: true, startTime: true, endTime: true }
    });

    const minutes: Record<number, number> = {};
    assignments.forEach(a => {
      const start = new Date(a.startTime);
      const end = new Date(a.endTime);
      const mins = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
      minutes[mins] = (minutes[mins] || 0) + 1;
    });

    const shifts = await prisma.shift.findMany({
      where: { storeId: 768, date },
      select: { crewId: true }
    });

    const dateStr = date.toISOString().split('T')[0];
    const coverage = (assignments.length / shifts.length * 100).toFixed(1);
    console.log(`\n${dateStr}`);
    console.log(`  ${assignments.length} breaks assigned to crew`);
    console.log(`  ${shifts.length} crew worked`);
    console.log(`  ${coverage}% coverage`);
    console.log(`  Minutes distribution:`, minutes);
  }
}

main().finally(() => prisma.$disconnect());
