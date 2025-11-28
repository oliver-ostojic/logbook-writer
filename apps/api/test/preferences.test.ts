import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';

// Chosen store id for tests; idempotent creation handled via POST /stores (409 tolerated)
const STORE_ID = 768;

describe('Crew Preferences API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    // Ensure store exists via API; ignore 409 conflict if already present
    const res = await app.inject({
      method: 'POST',
      url: '/stores',
      payload: { id: STORE_ID, name: 'Test Store' },
    });
    if (![200,409].includes(res.statusCode)) {
      throw new Error(`Failed to create test store: ${res.statusCode} ${res.body}`);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Crew Preferences via Crew CRUD', () => {
    it('creates crew member with initial preferences', async () => {
      const crewId = `PREF${Date.now().toString().slice(-3)}`;
      const res = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId,
          name: 'Test Preferences User',
          storeId: STORE_ID,
          prefFirstHourWeight: 4,
          prefTaskWeight: 3,
          consecutiveProdWeight: 2,
          consecutiveRegWeight: 1,
          prefFirstHour: 'REGISTER',
          prefTask: 'PRODUCT',
        },
      });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.prefFirstHourWeight).toBe(4);
      expect(body.prefTaskWeight).toBe(3);
      expect(body.consecutiveProdWeight).toBe(2);
      expect(body.consecutiveRegWeight).toBe(1);
      expect(body.prefFirstHour).toBe('REGISTER');
      expect(body.prefTask).toBe('PRODUCT');

      // Cleanup via API
      const del = await app.inject({ method: 'DELETE', url: `/crew/${crewId}` });
      expect(del.statusCode).toBe(200);
    });

    it('updates preferences via PUT /crew/:id', async () => {
      const crewId = `PREF${Date.now().toString().slice(-3)}`;
      const create = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: { id: crewId, name: 'Test Preferences Update', storeId: STORE_ID },
      });
      expect(create.statusCode).toBe(200);

      const res = await app.inject({
        method: 'PUT',
        url: `/crew/${crewId}`,
        payload: {
          prefFirstHour: 'REGISTER',
          prefTask: 'PRODUCT',
          prefFirstHourWeight: 4,
          prefTaskWeight: 3,
          consecutiveProdWeight: 120,
          consecutiveRegWeight: 90,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.prefFirstHour).toBe('REGISTER');
      expect(body.prefTask).toBe('PRODUCT');
      expect(body.prefFirstHourWeight).toBe(4);
      expect(body.prefTaskWeight).toBe(3);
      expect(body.consecutiveProdWeight).toBe(120);
      expect(body.consecutiveRegWeight).toBe(90);

      const del = await app.inject({ method: 'DELETE', url: `/crew/${crewId}` });
      expect(del.statusCode).toBe(200);
    });

    it('validates preference weight range (0-4)', async () => {
      // Invalid weight
      const crewId1 = `PREF${Date.now().toString().slice(-3)}`;
      const res1 = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: { id: crewId1, name: 'Test Validation', storeId: STORE_ID, prefFirstHourWeight: 5 },
      });
      expect(res1.statusCode).toBe(400);

      // Valid weight
      const crewId2 = `PREF${(Date.now()+50).toString().slice(-3)}`;
      const res2 = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: { id: crewId2, name: 'Test Validation', storeId: STORE_ID, prefFirstHourWeight: 4 },
      });
      expect(res2.statusCode).toBe(200);

      const del2 = await app.inject({ method: 'DELETE', url: `/crew/${crewId2}` });
      expect(del2.statusCode).toBe(200);
    });

    it('validates preference task enum values', async () => {
      const crewId1 = `PREF${Date.now().toString().slice(-3)}`;
      const invalid = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: { id: crewId1, name: 'Test Enum Validation', storeId: STORE_ID, prefFirstHour: 'INVALID_TASK' },
      });
      expect(invalid.statusCode).toBe(400);

      const crewId2 = `PREF${(Date.now()+60).toString().slice(-3)}`;
      const valid = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: { id: crewId2, name: 'Test Enum Validation', storeId: STORE_ID, prefFirstHour: 'REGISTER' },
      });
      expect(valid.statusCode).toBe(200);
      const del = await app.inject({ method: 'DELETE', url: `/crew/${crewId2}` });
      expect(del.statusCode).toBe(200);
    });

    it('updates both weights and values together', async () => {
      const crewId = `PREF${Date.now().toString().slice(-3)}`;
      const create = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: { id: crewId, name: 'Test Combined Update', storeId: STORE_ID },
      });
      expect(create.statusCode).toBe(200);

      const res = await app.inject({
        method: 'PUT',
        url: `/crew/${crewId}`,
        payload: {
          prefFirstHourWeight: 4,
          prefFirstHour: 'PRODUCT',
          prefTaskWeight: 3,
          prefTask: 'REGISTER',
          consecutiveProdWeight: 150,
          consecutiveRegWeight: 60,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.prefFirstHourWeight).toBe(4);
      expect(body.prefFirstHour).toBe('PRODUCT');
      expect(body.prefTaskWeight).toBe(3);
      expect(body.prefTask).toBe('REGISTER');
      expect(body.consecutiveProdWeight).toBe(150);
      expect(body.consecutiveRegWeight).toBe(60);

      const del = await app.inject({ method: 'DELETE', url: `/crew/${crewId}` });
      expect(del.statusCode).toBe(200);
    });
  });
});
