const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  try {
    const stores = await p.store.findMany();
    const crew = await p.crew.findMany();
    console.log('Stores:', stores);
    console.log('Crew:', crew);
  } catch (e) {
    console.error('Error inspecting DB', e);
  } finally {
    await p.$disconnect();
  }
})();
