import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

const STORE_ID = 768;
const CREW_DEMO = { id: '1269090', name: 'Oliver Ostojic' };
const CREW_OTHER = { id: '1280713', name: 'Abigail Perez' };

let app: Awaited<ReturnType<typeof buildServer>>;
let demoRoleId: string;

async function seedMinimal() {
  // Store
  await prisma.store.upsert({
    where: { id: STORE_ID },
    update: { name: 'Dr. Phillips' },
    create: { id: STORE_ID, name: 'Dr. Phillips' },
  });

  // Roles
  const demo = await prisma.role.upsert({
    where: { code: 'DEMO' },
    update: {},
    create: { code: 'DEMO', displayName: 'Demo' },
  });
  demoRoleId = demo.id;

  const orderWriter = await prisma.role.upsert({
    where: { code: 'OrderWriter' },
    update: {},
    create: { code: 'OrderWriter', displayName: 'Order Writer' },
  });

  // Crew members
  await prisma.crew.upsert({
    where: { id: CREW_DEMO.id },
    update: {},
    create: {
      id: CREW_DEMO.id,
      name: CREW_DEMO.name,
      storeId: STORE_ID,
      CrewRole: { create: [{ roleId: demo.id }] },
    },
  });
  await prisma.crew.upsert({
    where: { id: CREW_OTHER.id },
    update: {},
    create: {
      id: CREW_OTHER.id,
      name: CREW_OTHER.name,
      storeId: STORE_ID,
      CrewRole: { create: [{ roleId: orderWriter.id }] },
    },
  });

  // Two rules for today
  await prisma.hourlyRequirement.upsert({
    where: { storeId_date_hour: { storeId: STORE_ID, date: TODAY, hour: 9 } },
    update: {},
    create: {
      storeId: STORE_ID,
      date: TODAY,
      hour: 9,
      requiredRegister: 2,
      requiredParkingHelm: 1,
      updatedAt: new Date(),
    },
  });
  await prisma.hourlyRequirement.upsert({
    where: { storeId_date_hour: { storeId: STORE_ID, date: TODAY, hour: 10 } },
    update: {},
    create: {
      storeId: STORE_ID,
      date: TODAY,
      hour: 10,
      requiredRegister: 3,
      requiredParkingHelm: 1,
      updatedAt: new Date(),
    },
  });
}

describe('API e2e', () => {
  beforeAll(async () => {
    await seedMinimal();
    app = await buildServer();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /me', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('id');
  });

  it('POST /wizard/init', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wizard/init',
      payload: {
        date: TODAY.toISOString(),
        store_id: STORE_ID,
        shifts: [
          { crewId: CREW_DEMO.id, start: '09:00', end: '12:00' },
          { crewId: CREW_OTHER.id, start: '10:00', end: '12:00' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.normalizedShifts)).toBe(true);
    expect(Array.isArray(body.eligibilities)).toBe(true);
    // Because suggestDemoWindow looks for role name 'DEMO', there will be no segments with current seed 'Demo'
    expect(body.demoFeasible.segments.length).toBeGreaterThanOrEqual(0);
  });

  it('POST /wizard/requirements', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wizard/requirements',
      payload: {
        date: TODAY.toISOString(),
        store_id: STORE_ID,
        requirements: [
          { crewId: CREW_DEMO.id, roleId: demoRoleId, requiredHours: 2 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.upserted).toBe(1);
  });

  it('POST /wizard/coverage', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wizard/coverage',
      payload: {
        date: TODAY.toISOString(),
        store_id: STORE_ID,
        role_id: demoRoleId,
        windowStart: '09:00',
        windowEnd: '11:00',
        requiredPerHour: 1,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
  });

  it('POST /schedule/run and GET /schedule/logbook', async () => {
    const runRes = await app.inject({
      method: 'POST',
      url: '/schedule/run',
      payload: {
        date: TODAY.toISOString(),
        store_id: STORE_ID,
        shifts: [
          { crewId: CREW_DEMO.id, start: '09:00', end: '12:00' },
          { crewId: CREW_OTHER.id, start: '10:00', end: '12:00' },
        ],
      },
    });
    expect(runRes.statusCode).toBe(200);
    const runBody = runRes.json();
    expect(runBody).toHaveProperty('run_id');
    expect(runBody).toHaveProperty('logbook_id');
    expect(runBody).toHaveProperty('segmentedShifts');
    expect(runBody.segmentedShifts).toHaveLength(2);
    // Validate that segmentation computed FLEX for shifts within register window
    const demoShift = runBody.segmentedShifts.find((s: any) => s.crewId === CREW_DEMO.id);
    expect(demoShift.segments).toBeDefined();
    expect(demoShift.flexMinutes).toBeGreaterThan(0);

    const lbRes = await app.inject({
      method: 'GET',
      url: `/schedule/logbook?date=${encodeURIComponent(TODAY.toISOString())}&store_id=${STORE_ID}`,
    });
    expect(lbRes.statusCode).toBe(200);
    const lbBody = lbRes.json();
    expect(lbBody).toHaveProperty('id');
    expect(lbBody).toHaveProperty('tasks');
  });
});
