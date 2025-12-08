const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  try {
    const crew = await p.crew.findMany({ select: { id: true, name: true, storeId: true } });
    console.log(JSON.stringify(crew, null, 2));
  } catch (e) {
    console.error('Error listing crew', e);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
