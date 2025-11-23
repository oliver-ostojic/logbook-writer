import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index';

 * Manual cleanup script to remove test stores and data from databaseimport { PrismaClient } from '@prisma/client';

 * import { cleanupTestStores, cleanupTestCrew } from './test-cleanup';

 * Usage:

 *   pnpm db:cleanup-testsconst prisma = new PrismaClient();

 *   pnpm tsx test/cleanup-test-stores.tslet app: Awaited<ReturnType<typeof buildServer>>;

 */

// Use a unique store id for each test run to avoid conflicts

import { cleanupTestStores, cleanupTestCrew, disconnectPrisma } from './test-cleanup';const STORE_ID = 99999 + Math.floor(Math.random() * 1000);



async function main() {async function seedCrew() {

  console.log('🧹 Starting manual test data cleanup...\n');  // Clean up any existing test crew first

    await cleanupTestCrew('TUN');

  // Clean up test crew with common prefixes

  console.log('Cleaning up test crew members...');  // Ensure store exists

  await cleanupTestCrew(); // Cleans TUN, TST, TEST prefixes  await prisma.store.upsert({

      where: { id: STORE_ID },

  // Clean up test stores and all related data    update: { name: 'Tuning Test Store' },

  console.log('\nCleaning up test stores...');    create: { id: STORE_ID, name: 'Tuning Test Store' }

  await cleanupTestStores();  });

  

  console.log('🎉 Manual cleanup complete!');  // Create a handful of crew with varied preferences

  await disconnectPrisma();  const crewPayloads = [

}    { id: 'TUN0001', name: 'Alice A', storeId: STORE_ID, prefTask: 'REGISTER' },

    { id: 'TUN0002', name: 'Bob B', storeId: STORE_ID, prefTask: 'PRODUCT' },

main().catch((error) => {    { id: 'TUN0003', name: 'Cara C', storeId: STORE_ID, prefTask: 'PRODUCT', prefFirstHour: 'PRODUCT', prefBreakTiming: -1 },

  console.error('💥 Cleanup failed:', error);    { id: 'TUN0004', name: 'Dan D', storeId: STORE_ID, prefTask: 'REGISTER', prefFirstHour: 'REGISTER', prefBreakTiming: 1 },

  process.exit(1);    { id: 'TUN0005', name: 'Eve E', storeId: STORE_ID }

});  ];


  for (const c of crewPayloads) {
    await prisma.crew.upsert({
      where: { id: c.id },
      update: {},
      create: c
    });
  }
}

describe('Tuning preferences endpoint', () => {
  beforeAll(async () => {
    await seedCrew();
    app = await buildServer();
  }, 30_000);

  afterAll(async () => {
    // Clean up test stores and crew
    await cleanupTestStores();
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /tuning/preferences returns recommendations', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/tuning/preferences?storeId=${STORE_ID}&mode=rarity&min=0&max=50&penaltyScale=8`
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('totalCrew', 5);
    expect(body).toHaveProperty('dimensions');
    expect(body.dimensions).toHaveProperty('prefTask');
    expect(body.dimensions.prefTask).toHaveProperty('recommendations');
    const recs = body.dimensions.prefTask.recommendations;
    // Ensure keys for REGISTER and PRODUCT exist
    expect(recs).toHaveProperty('REGISTER');
    expect(recs).toHaveProperty('PRODUCT');
    // Bounds respected
    expect(recs.REGISTER).toBeGreaterThanOrEqual(0);
    expect(recs.REGISTER).toBeLessThanOrEqual(50);
  });
});
