import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../src/index';
import { startOfDay } from '../src/utils';

const prisma = new PrismaClient();

const STORE_ID = 768;
const DATE_ISO = '2025-11-15';

let app: Awaited<ReturnType<typeof buildServer>>;
let demoRoleId: number;
let orderWriterRoleId: number;

async function seedCoverageTest() {
  // Store
  await prisma.store.upsert({
    where: { id: STORE_ID },
    update: { name: 'Dr. Phillips' },
    create: { id: STORE_ID, name: 'Dr. Phillips' },
  });

  // Roles
  const demoRole = await prisma.role.upsert({
    where: { code: 'DEMO' },
    update: {},
    create: { code: 'DEMO', displayName: 'Demo' },
  });
  demoRoleId = demoRole.id;

  const orderWriterRole = await prisma.role.upsert({
    where: { code: 'ORDER_WRITER' },
    update: {},
    create: { code: 'ORDER_WRITER', displayName: 'Order Writer' },
  });
  orderWriterRoleId = orderWriterRole.id;

  // Clean any existing coverage rows for the day
  const day = startOfDay(DATE_ISO);
  await prisma.coverageWindow.deleteMany({ where: { date: day, storeId: STORE_ID } });
}

describe('Wizard Coverage - POST /wizard/coverage', () => {
  beforeAll(async () => {
    await seedCoverageTest();
    app = await buildServer();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('creates coverage for a day/role/store', async () => {
    const payload = {
      date: DATE_ISO,
      store_id: STORE_ID,
      role_id: demoRoleId,
      windowStart: '09:00',
      windowEnd: '17:00',
      requiredPerHour: 2,
    };

    const res = await app.inject({ method: 'POST', url: '/wizard/coverage', payload });
  expect(res.statusCode).toBe(200);
  // Response may include additional metadata (e.g., normalizedDate); assert minimally
  expect(res.json()).toEqual(expect.objectContaining({ ok: true }));

    const day = startOfDay(DATE_ISO);
    const row = await prisma.coverageWindow.findUnique({
      where: { storeId_date_roleId: { date: day, storeId: STORE_ID, roleId: demoRoleId } },
    });
    expect(row).toBeTruthy();
    expect(row?.requiredPerHour).toBe(2);
  // Window sanity: both on the same date as row.date and proper order, duration 8h
  expect(row!.startHour).toBe(9);
  expect(row!.endHour).toBe(17);
  expect(row!.date.toISOString().slice(0,10)).toBe(DATE_ISO);
  });

  it('upserts existing coverage for same (date, storeId, roleId)', async () => {
    // First insert
    await app.inject({
      method: 'POST', url: '/wizard/coverage',
      payload: {
        date: DATE_ISO,
        store_id: STORE_ID,
        role_id: demoRoleId,
        windowStart: '10:00',
        windowEnd: '16:00',
        requiredPerHour: 1,
      }
    });

    // Update
    const res2 = await app.inject({
      method: 'POST', url: '/wizard/coverage',
      payload: {
        date: DATE_ISO,
        store_id: STORE_ID,
        role_id: demoRoleId,
        windowStart: '11:00',
        windowEnd: '18:00',
        requiredPerHour: 3,
      }
    });
    expect(res2.statusCode).toBe(200);

    const day = startOfDay(DATE_ISO);
    const row = await prisma.coverageWindow.findUnique({
      where: { storeId_date_roleId: { date: day, storeId: STORE_ID, roleId: demoRoleId } },
    });
    expect(row).toBeTruthy();
    expect(row!.requiredPerHour).toBe(3);
  // New window should reflect last post (duration 7h)
  expect(row!.endHour - row!.startHour).toBe(7);
  });

  it('defaults requiredPerHour to 1 when omitted', async () => {
    const payload = {
      date: DATE_ISO,
      store_id: STORE_ID,
      role_id: orderWriterRoleId,
      windowStart: '08:00',
      windowEnd: '12:00',
      // requiredPerHour omitted
    } as const;

    const res = await app.inject({ method: 'POST', url: '/wizard/coverage', payload });
    expect(res.statusCode).toBe(200);

    const day = startOfDay(DATE_ISO);
    const row = await prisma.coverageWindow.findUnique({
      where: { storeId_date_roleId: { date: day, storeId: STORE_ID, roleId: orderWriterRoleId } },
    });
    expect(row).toBeTruthy();
    expect(row!.requiredPerHour).toBe(1);
  });

  it('rejects invalid window where end <= start', async () => {
    const res = await app.inject({
      method: 'POST', url: '/wizard/coverage',
      payload: { date: DATE_ISO, store_id: STORE_ID, role_id: demoRoleId, windowStart: '12:00', windowEnd: '12:00' }
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeDefined();
  });

  it('accepts ISO datetime strings for windowStart/windowEnd', async () => {
    const ws = '2025-11-15T09:00:00.000Z';
    const we = '2025-11-15T15:00:00.000Z';
    const res = await app.inject({
      method: 'POST', url: '/wizard/coverage',
      payload: { date: DATE_ISO, store_id: STORE_ID, role_id: demoRoleId, windowStart: ws, windowEnd: we, requiredPerHour: 2 }
    });
    expect(res.statusCode).toBe(200);

    const day = startOfDay(DATE_ISO);
    const row = await prisma.coverageWindow.findUnique({
      where: { storeId_date_roleId: { date: day, storeId: STORE_ID, roleId: demoRoleId } },
    });
    expect(row).toBeTruthy();
    expect(row!.startHour).toBe(9);
    expect(row!.endHour).toBe(15);
  });

  it('creates independent rows for different roles on same date/store', async () => {
    const day = startOfDay(DATE_ISO);

  await prisma.coverageWindow.deleteMany({ where: { date: day, storeId: STORE_ID } });

    const p1 = app.inject({ method: 'POST', url: '/wizard/coverage', payload: { date: DATE_ISO, store_id: STORE_ID, role_id: demoRoleId, windowStart: '09:00', windowEnd: '12:00' } });
    const p2 = app.inject({ method: 'POST', url: '/wizard/coverage', payload: { date: DATE_ISO, store_id: STORE_ID, role_id: orderWriterRoleId, windowStart: '13:00', windowEnd: '16:00' } });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);

  const rows = await prisma.coverageWindow.findMany({ where: { date: day, storeId: STORE_ID } });
    expect(rows.length).toBe(2);
    const byRole = new Map(rows.map(r => [r.roleId, r]));
    expect(byRole.get(demoRoleId)).toBeTruthy();
    expect(byRole.get(orderWriterRoleId)).toBeTruthy();
  });
});
