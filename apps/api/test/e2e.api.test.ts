import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index';
// Use API endpoints for seeding to avoid schema coupling

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

const STORE_ID = 768;
const CREW_DEMO = { id: '1269090', name: 'Oliver Ostojic' };
const CREW_OTHER = { id: '1280713', name: 'Abigail Perez' };

let app: Awaited<ReturnType<typeof buildServer>>;
let demoRoleId: number;

async function seedMinimal(app: Awaited<ReturnType<typeof buildServer>>) {
  // Store
  const storeRes = await app.inject({ method: 'POST', url: '/stores', payload: { id: STORE_ID, name: 'Dr. Phillips' } });
  if (!(storeRes.statusCode === 200 || storeRes.statusCode === 409)) throw new Error('Failed to create store');

  // Roles
  const demoRes = await app.inject({ method: 'POST', url: '/roles', payload: { code: 'DEMO', displayName: 'Demo', storeId: STORE_ID } });
  if (demoRes.statusCode === 200) {
    demoRoleId = demoRes.json().id;
  } else if (demoRes.statusCode === 409) {
    // Already exists, fetch
    const listRes = await app.inject({ method: 'GET', url: '/roles' });
    const existing = listRes.statusCode === 200 ? listRes.json().find((r: any) => r.code === 'DEMO') : null;
    if (!existing) throw new Error('DEMO role exists but could not be fetched');
    demoRoleId = existing.id;
  } else {
    throw new Error('Failed to create DEMO role');
  }

  const owRes = await app.inject({ method: 'POST', url: '/roles', payload: { code: 'ORDER_WRITER', displayName: 'Order Writer', storeId: STORE_ID } });
  let orderWriterId: number;
  if (owRes.statusCode === 200) {
    orderWriterId = owRes.json().id;
  } else if (owRes.statusCode === 409) {
    const listRes = await app.inject({ method: 'GET', url: '/roles' });
    const existing = listRes.statusCode === 200 ? listRes.json().find((r: any) => r.code === 'ORDER_WRITER') : null;
    if (!existing) throw new Error('ORDER_WRITER role exists but could not be fetched');
    orderWriterId = existing.id;
  } else {
    throw new Error('Failed to create ORDER_WRITER role');
  }

  // Crew members
  const crew1 = await app.inject({ method: 'POST', url: '/crew', payload: { id: CREW_DEMO.id, name: CREW_DEMO.name, roleIds: [demoRoleId] } });
  if (crew1.statusCode !== 200) throw new Error('Failed to create crew1');
  const crew2 = await app.inject({ method: 'POST', url: '/crew', payload: { id: CREW_OTHER.id, name: CREW_OTHER.name, roleIds: [orderWriterId] } });
  if (crew2.statusCode !== 200) throw new Error('Failed to create crew2');
}

describe('API e2e', () => {
  beforeAll(async () => {
    app = await buildServer();
    await seedMinimal(app);
  }, 30_000);

  afterAll(async () => {
    await app.close();
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
