const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logbooks = await prisma.logbook.findMany({ 
    where: { 
      date: new Date('2025-11-25'),
      storeId: 768 
    },
    select: { id: true, date: true, createdAt: true, status: true }
  });
  console.log('Found', logbooks.length, 'logbooks for 11/25:');
  console.log(JSON.stringify(logbooks, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
