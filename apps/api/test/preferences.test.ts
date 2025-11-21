import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../src/index';

const prisma = new PrismaClient();
const STORE_ID = 768;

describe('Crew Preferences API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();

    // Ensure store exists
      await prisma.store.upsert({
        where: { id: STORE_ID },
        update: {},
        create: {
          id: STORE_ID,
          name: 'Test Store',
        },
      });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
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

      // Cleanup
      await prisma.crew.delete({ where: { id: crewId } });
    });

    it('updates preferences via PUT /crew/:id', async () => {
      // Create crew first
      const crewId = `PREF${Date.now().toString().slice(-3)}`;
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId,
          name: 'Test Preferences Update',
          storeId: STORE_ID,
        },
      });

      // Update preferences
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

      // Cleanup
      await prisma.crew.delete({ where: { id: crewId } });
    });

    it('validates preference weight range (0-4)', async () => {
      // Test weight > 4 (should fail validation)
      const timestamp1 = Date.now();
      const crewId1 = `PREF${timestamp1.toString().slice(-3)}`;
      const res1 = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId1,
          name: 'Test Validation',
          storeId: STORE_ID,
          prefFirstHourWeight: 5, // Invalid
        },
      });
      expect(res1.statusCode).toBe(400);

      // Test valid weight
      const timestamp2 = Date.now() + 100; // Ensure unique ID
      const crewId2 = `PREF${timestamp2.toString().slice(-3)}`;
      const res2 = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId2,
          name: 'Test Validation',
          storeId: STORE_ID,
          prefFirstHourWeight: 4, // Valid
        },
      });
      expect(res2.statusCode).toBe(200);

      // Cleanup
      await prisma.crew.delete({ where: { id: crewId1 } }).catch(() => {});
      await prisma.crew.delete({ where: { id: crewId2 } });
    });

    it('validates preference task enum values', async () => {
      // Test invalid enum value
      const crewId1 = `PREF${Date.now().toString().slice(-3)}`;
      const res1 = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId1,
          name: 'Test Enum Validation',
          storeId: STORE_ID,
          prefFirstHour: 'INVALID_TASK', // Invalid
        },
      });
      expect(res1.statusCode).toBe(400);

      // Test valid enum value
      const crewId2 = `PREF${(Date.now() + 1).toString().slice(-3)}`;
      const res2 = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId2,
          name: 'Test Enum Validation',
          storeId: STORE_ID,
          prefFirstHour: 'REGISTER', // Valid
        },
      });
      expect(res2.statusCode).toBe(200);

      // Cleanup
      await prisma.crew.delete({ where: { id: crewId1 } }).catch(() => {});
      await prisma.crew.delete({ where: { id: crewId2 } });
    });

    it('updates both weights and values together', async () => {
      // Create crew
      const crewId = `PREF${Date.now().toString().slice(-3)}`;
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId,
          name: 'Test Combined Update',
          storeId: STORE_ID,
        },
      });

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

      // Cleanup
      await prisma.crew.delete({ where: { id: crewId } });
    });
  });
});
