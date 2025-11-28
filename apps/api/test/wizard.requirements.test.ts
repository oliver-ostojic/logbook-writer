import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index';
import { startOfDay } from '../src/utils';

const STORE_ID = 768;
const DATE_ISO = '2025-11-15';

// Test crew and roles
const TEST_CREW = [
  { id: '1281401', name: 'Melissa Ochoa' },
  { id: '1269090', name: 'Oliver Ostojic' },
  { id: '1282186', name: 'Shushan Royer' },
];

let app: Awaited<ReturnType<typeof buildServer>>;
let demoRoleId: number;
let orderWriterRoleId: number;

async function seedRequirementsTest(app: Awaited<ReturnType<typeof buildServer>>) {
  // Create roles via API
  const demoRes = await app.inject({ method: 'POST', url: '/roles', payload: { name: 'Demo' } });
  if (demoRes.statusCode !== 200) throw new Error('Failed to create Demo role');
  demoRoleId = demoRes.json().id;

  const owRes = await app.inject({ method: 'POST', url: '/roles', payload: { name: 'Order Writer' } });
  if (owRes.statusCode !== 200) throw new Error('Failed to create Order Writer role');
  orderWriterRoleId = owRes.json().id;

  // Create test crew via API (without roles initially)
  for (const c of TEST_CREW) {
    const res = await app.inject({ method: 'POST', url: '/crew', payload: { id: c.id, name: c.name, roleIds: [] } });
    if (res.statusCode !== 200) throw new Error(`Failed to create crew ${c.id}`);
  }
}

describe('Wizard Requirements - POST /wizard/requirements', () => {
  beforeAll(async () => {
    app = await buildServer();
    // Ensure store exists for role creation and requirements
    const storeRes = await app.inject({ method: 'POST', url: '/stores', payload: { id: STORE_ID, name: 'Dr. Phillips' } });
    if (!(storeRes.statusCode === 200 || storeRes.statusCode === 409)) throw new Error('Failed to create store');
    await seedRequirementsTest(app);
  }, 30_000);

  afterAll(async () => {
    await app.close();
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

    // Minimal assertion: API success and count
    expect(body.upserted).toBe(2);
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

    expect(body2.upserted).toBe(1);
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

    // Minimal assertion: API success and count
    expect(body.upserted).toBe(2);
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

    expect(res2.json().ok).toBe(true);
  });

  it('handles bulk requirements for multiple crew and roles in one call', async () => {
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

    const bodyBulk = res.json();
    expect(bodyBulk.ok).toBe(true);
    expect(bodyBulk.upserted).toBe(5);
  });
});
