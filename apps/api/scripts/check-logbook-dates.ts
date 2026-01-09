import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get logbook date range
  const logbooks = await prisma.logbook.findMany({
    select: { date: true },
    orderBy: { date: 'asc' },
  });

  if (logbooks.length === 0) {
    console.log('No logbooks found');
  } else {
    console.log(`Logbook date range: ${logbooks[0].date} to ${logbooks[logbooks.length - 1].date}`);
    console.log(`Total logbooks: ${logbooks.length}`);
  }

  await prisma.$disconnect();
}

main();
