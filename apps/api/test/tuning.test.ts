import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
let app: Awaited<ReturnType<typeof buildServer>>;

// Use a unique store id for each test run to avoid conflicts
const STORE_ID = 99999 + Math.floor(Math.random() * 1000);

async function seedCrew() {
  // Clean up any existing test crew first
  await prisma.crew.deleteMany({
    where: { id: { startsWith: 'TUN' } }
  });

  // Ensure store exists
  await prisma.store.upsert({
    where: { id: STORE_ID },
    update: { name: 'Tuning Test Store' },
    create: { id: STORE_ID, name: 'Tuning Test Store' }
  });

  // Create a handful of crew with varied preferences
  const crewPayloads = [
    { id: 'TUN0001', name: 'Alice A', storeId: STORE_ID, prefTask: 'REGISTER' },
    { id: 'TUN0002', name: 'Bob B', storeId: STORE_ID, prefTask: 'PRODUCT' },
    { id: 'TUN0003', name: 'Cara C', storeId: STORE_ID, prefTask: 'PRODUCT', prefFirstHour: 'PRODUCT', prefBreakTiming: -1 },
    { id: 'TUN0004', name: 'Dan D', storeId: STORE_ID, prefTask: 'REGISTER', prefFirstHour: 'REGISTER', prefBreakTiming: 1 },
    { id: 'TUN0005', name: 'Eve E', storeId: STORE_ID }
  ];

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
