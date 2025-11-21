const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    const rows = await prisma.$queryRawUnsafe("SELECT column_name, column_default FROM information_schema.columns WHERE table_name='Store'");
    console.table(rows);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
