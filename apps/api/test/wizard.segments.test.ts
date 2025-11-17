import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../src/index';

const prisma = new PrismaClient();

const STORE_ID = 768;

let app: Awaited<ReturnType<typeof buildServer>>;

describe('Wizard Segments - POST /wizard/segments', () => {
  beforeAll(async () => {
    // Ensure store exists with defaults (08:00-21:00)
    await prisma.store.upsert({
      where: { id: STORE_ID },
      update: { name: 'Dr. Phillips' },
      create: { id: STORE_ID, name: 'Dr. Phillips', minRegisterHours: 2, maxRegisterHours: 8 },
    });
    app = await buildServer();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('returns PRODUCT edges and FLEX inside window per crew', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wizard/segments',
      payload: {
        date: '2025-11-15',
        store_id: STORE_ID,
        shifts: [
          { crewId: 'A', start: '05:00', end: '22:00' },
          { crewId: 'B', start: '10:00', end: '12:00' },
        ],
      }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.segmentsByCrew).toHaveLength(2);
    const a = body.segmentsByCrew.find((x: any) => x.crewId === 'A');
    const b = body.segmentsByCrew.find((x: any) => x.crewId === 'B');
    expect(a.segments).toEqual([
      { start: '05:00', end: '08:00', kind: 'PRODUCT' },
      { start: '08:00', end: '21:00', kind: 'FLEX' },
      { start: '21:00', end: '22:00', kind: 'PRODUCT' },
    ]);
    expect(b.segments).toEqual([
      { start: '10:00', end: '12:00', kind: 'FLEX' },
    ]);
    expect(a.productMinutes).toBe(240);
    expect(a.flexMinutes).toBe(13 * 60);
  });
});
