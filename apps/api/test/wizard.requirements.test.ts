import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../src/index';
import { startOfDay } from '../src/utils';

const prisma = new PrismaClient();

const STORE_ID = 768;
const DATE_ISO = '2025-11-15';

// Test crew and roles
const TEST_CREW = [
  { id: '1281401', name: 'Melissa Ochoa' },
  { id: '1269090', name: 'Oliver Ostojic' },
  { id: '1282186', name: 'Shushan Royer' },
];

let app: Awaited<ReturnType<typeof buildServer>>;
let demoRoleId: string;
let orderWriterRoleId: string;

async function seedRequirementsTest() {
  // Store
  await prisma.store.upsert({
    where: { id: STORE_ID },
    update: { name: 'Dr. Phillips' },
    create: { id: STORE_ID, name: 'Dr. Phillips', minRegisterHours: 2, maxRegisterHours: 8 },
  });

  // Create roles
  const demoRole = await prisma.role.upsert({
    where: { name: 'DEMO' },
    update: {},
    create: { name: 'DEMO' },
  });
  demoRoleId = demoRole.id;

  const orderWriterRole = await prisma.role.upsert({
    where: { name: 'ORDER_WRITER' },
    update: {},
    create: { name: 'ORDER_WRITER' },
  });
  orderWriterRoleId = orderWriterRole.id;

  // Upsert test crew
  for (const c of TEST_CREW) {
    await prisma.crewMember.upsert({
      where: { id: c.id },
      update: { name: c.name, storeId: STORE_ID },
      create: { id: c.id, name: c.name, storeId: STORE_ID },
    });
  }

  // Clean up any existing requirements for the test date
  const day = startOfDay(DATE_ISO);
  await prisma.dailyRoleRequirement.deleteMany({
    where: { date: day, storeId: STORE_ID },
  });
}

describe('Wizard Requirements - POST /wizard/requirements', () => {
  beforeAll(async () => {
    await seedRequirementsTest();
    app = await buildServer();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('creates new requirements for crew-role pairs', async () => {
    const payload = {
      date: DATE_ISO,
      store_id: STORE_ID,
      requirements: [
        { crewId: TEST_CREW[0].id, roleId: demoRoleId, requiredHours: 3 },
        { crewId: TEST_CREW[1].id, roleId: orderWriterRoleId, requiredHours: 2 },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/wizard/requirements',
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.upserted).toBe(2);

    // Verify in DB
    const day = startOfDay(DATE_ISO);
    const reqs = await prisma.dailyRoleRequirement.findMany({
      where: { date: day, storeId: STORE_ID },
    });
    expect(reqs.length).toBe(2);
    expect(reqs.find(r => r.crewId === TEST_CREW[0].id)?.requiredHours).toBe(3);
    expect(reqs.find(r => r.crewId === TEST_CREW[1].id)?.requiredHours).toBe(2);
  });

  it('upserts (updates) existing requirements when called again', async () => {
    // First insert
    const payload1 = {
      date: DATE_ISO,
      store_id: STORE_ID,
      requirements: [
        { crewId: TEST_CREW[0].id, roleId: demoRoleId, requiredHours: 3 },
      ],
    };

    await app.inject({
      method: 'POST',
      url: '/wizard/requirements',
      payload: payload1,
    });

    // Update with different hours
    const payload2 = {
      date: DATE_ISO,
      store_id: STORE_ID,
      requirements: [
        { crewId: TEST_CREW[0].id, roleId: demoRoleId, requiredHours: 5 },
      ],
    };

    const res2 = await app.inject({
      method: 'POST',
      url: '/wizard/requirements',
      payload: payload2,
    });

    expect(res2.statusCode).toBe(200);
    const body2 = res2.json();
    expect(body2.ok).toBe(true);
    expect(body2.upserted).toBe(1);

    // Verify updated in DB
    const day = startOfDay(DATE_ISO);
    const req = await prisma.dailyRoleRequirement.findUnique({
      where: {
        date_storeId_crewId_roleId: {
          date: day,
          storeId: STORE_ID,
          crewId: TEST_CREW[0].id,
          roleId: demoRoleId,
        },
      },
    });
    expect(req?.requiredHours).toBe(5); // Updated from 3 to 5
  });

  it('handles multiple requirements for the same crew with different roles', async () => {
    const payload = {
      date: DATE_ISO,
      store_id: STORE_ID,
      requirements: [
        { crewId: TEST_CREW[2].id, roleId: demoRoleId, requiredHours: 2 },
        { crewId: TEST_CREW[2].id, roleId: orderWriterRoleId, requiredHours: 4 },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/wizard/requirements',
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.upserted).toBe(2);

    // Verify in DB - same crew, different roles
    const day = startOfDay(DATE_ISO);
    const reqs = await prisma.dailyRoleRequirement.findMany({
      where: { date: day, storeId: STORE_ID, crewId: TEST_CREW[2].id },
    });
    expect(reqs.length).toBe(2);
    expect(reqs.find(r => r.roleId === demoRoleId)?.requiredHours).toBe(2);
    expect(reqs.find(r => r.roleId === orderWriterRoleId)?.requiredHours).toBe(4);
  });

  it('handles empty requirements array', async () => {
    const payload = {
      date: DATE_ISO,
      store_id: STORE_ID,
      requirements: [],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/wizard/requirements',
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.upserted).toBe(0);
  });

  it('persists requirements with correct unique composite key (date, storeId, crewId, roleId)', async () => {
    const day = startOfDay(DATE_ISO);

    // Clear existing
    await prisma.dailyRoleRequirement.deleteMany({
      where: { date: day, storeId: STORE_ID },
    });

    const payload = {
      date: DATE_ISO,
      store_id: STORE_ID,
      requirements: [
        { crewId: TEST_CREW[0].id, roleId: demoRoleId, requiredHours: 3 },
      ],
    };

    await app.inject({
      method: 'POST',
      url: '/wizard/requirements',
      payload,
    });

    // Try to insert the exact same requirement - should upsert (not duplicate)
    const res2 = await app.inject({
      method: 'POST',
      url: '/wizard/requirements',
      payload,
    });

    expect(res2.statusCode).toBe(200);

    // Verify only one record exists
    const reqs = await prisma.dailyRoleRequirement.findMany({
      where: {
        date: day,
        storeId: STORE_ID,
        crewId: TEST_CREW[0].id,
        roleId: demoRoleId,
      },
    });
    expect(reqs.length).toBe(1);
    expect(reqs[0].requiredHours).toBe(3);
  });

  it('handles bulk requirements for multiple crew and roles in one call', async () => {
    const day = startOfDay(DATE_ISO);

    // Clear existing
    await prisma.dailyRoleRequirement.deleteMany({
      where: { date: day, storeId: STORE_ID },
    });

    const payload = {
      date: DATE_ISO,
      store_id: STORE_ID,
      requirements: [
        { crewId: TEST_CREW[0].id, roleId: demoRoleId, requiredHours: 2 },
        { crewId: TEST_CREW[0].id, roleId: orderWriterRoleId, requiredHours: 3 },
        { crewId: TEST_CREW[1].id, roleId: demoRoleId, requiredHours: 4 },
        { crewId: TEST_CREW[1].id, roleId: orderWriterRoleId, requiredHours: 1 },
        { crewId: TEST_CREW[2].id, roleId: demoRoleId, requiredHours: 5 },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/wizard/requirements',
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.upserted).toBe(5);

    // Verify all in DB
    const reqs = await prisma.dailyRoleRequirement.findMany({
      where: { date: day, storeId: STORE_ID },
    });
    expect(reqs.length).toBe(5);

    // Spot check a couple
    const melissa_demo = reqs.find(r => r.crewId === TEST_CREW[0].id && r.roleId === demoRoleId);
    expect(melissa_demo?.requiredHours).toBe(2);

    const oliver_ow = reqs.find(r => r.crewId === TEST_CREW[1].id && r.roleId === orderWriterRoleId);
    expect(oliver_ow?.requiredHours).toBe(1);
  });
});
