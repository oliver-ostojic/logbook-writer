/*
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index';

 * Manual cleanup script to remove test stores and data from databaseimport { PrismaClient } from '@prisma/client';

 * import { cleanupTestStores, cleanupTestCrew } from './test-cleanup';

 * Usage:

 *   pnpm db:cleanup-testsconst prisma = new PrismaClient();

 *   pnpm tsx test/cleanup-test-stores.tslet app: Awaited<ReturnType<typeof buildServer>>;

 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index';
import { PrismaClient } from '@prisma/client';
import { cleanupTestCrew, disconnectPrisma } from './test-cleanup';

// Use a unique store id for each test run to avoid conflicts
const STORE_ID = 99999 + Math.floor(Math.random() * 1000);
const prisma = new PrismaClient();
let app: Awaited<ReturnType<typeof buildServer>>;

async function seedData() {
  // Clean up any existing test crew first
  await cleanupTestCrew('TUN');

  // Ensure a company exists and create the store linked to it
  const company = await prisma.company.upsert({
    where: { id: 1 },
    update: { name: 'Tuning Test Co' },
    create: { name: 'Tuning Test Co' }
  });

  await prisma.store.upsert({
    where: { id: STORE_ID },
    update: { name: 'Tuning Test Store', companyId: company.id },
    create: { id: STORE_ID, name: 'Tuning Test Store', companyId: company.id }
  });

  // Create a handful of crew with varied preferences
  const crewPayloads = [
    { id: 'TUN0001', name: 'Alice A', storeId: STORE_ID },
    { id: 'TUN0002', name: 'Bob B', storeId: STORE_ID },
    { id: 'TUN0003', name: 'Cara C', storeId: STORE_ID },
    { id: 'TUN0004', name: 'Dan D', storeId: STORE_ID },
    { id: 'TUN0005', name: 'Eve E', storeId: STORE_ID }
  ] as const;

  for (const c of crewPayloads) {
    await prisma.crew.upsert({
      where: { id: c.id },
      update: {},
      create: c as any
    });
  }
}

describe('Tuning preferences endpoint', () => {
  beforeAll(async () => {
    await seedData();
    app = await buildServer();
  }, 30_000);

  afterAll(async () => {
  // Clean up test crew and test store
  await cleanupTestCrew('TUN');
  await prisma.store.deleteMany({ where: { id: STORE_ID } });
    await app.close();
    await prisma.$disconnect();
    await disconnectPrisma();
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
    
