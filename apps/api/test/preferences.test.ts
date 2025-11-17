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
        minRegisterHours: 2,
        maxRegisterHours: 7,
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /crew/:id/preferences', () => {
    it('updates preference weights', async () => {
      // Create a crew member
      const createRes = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'PREF001',
          name: 'Test Preferences User',
          storeId: STORE_ID,
        },
      });
      expect(createRes.statusCode).toBe(200);

      // Update preferences
      const res = await app.inject({
        method: 'POST',
        url: '/crew/PREF001/preferences',
        payload: {
          prefFirstHourWeight: 4,
          prefTaskWeight: 3,
          prefBlocksizeProdWeight: 2,
          prefBlocksizeRegWeight: 1,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.prefFirstHourWeight).toBe(4);
      expect(body.prefTaskWeight).toBe(3);
      expect(body.prefBlocksizeProdWeight).toBe(2);
      expect(body.prefBlocksizeRegWeight).toBe(1);

      // Cleanup
      await prisma.crewMember.delete({ where: { id: 'PREF001' } });
    });

    it('updates preference values', async () => {
      // Create a crew member
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'PREF002',
          name: 'Test Preferences User 2',
          storeId: STORE_ID,
        },
      });

      // Update preferences
      const res = await app.inject({
        method: 'POST',
        url: '/crew/PREF002/preferences',
        payload: {
          prefFirstHour: 'REGISTER',
          prefTask: 'PRODUCT',
          prefBlocksizeProd: 120,
          prefBlocksizeReg: 90,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.prefFirstHour).toBe('REGISTER');
      expect(body.prefTask).toBe('PRODUCT');
      expect(body.prefBlocksizeProd).toBe(120);
      expect(body.prefBlocksizeReg).toBe(90);

      // Cleanup
      await prisma.crewMember.delete({ where: { id: 'PREF002' } });
    });

    it('validates weight range (1-4)', async () => {
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'PREF003',
          name: 'Test Validation',
          storeId: STORE_ID,
        },
      });

      // Test weight < 1
      const res1 = await app.inject({
        method: 'POST',
        url: '/crew/PREF003/preferences',
        payload: {
          prefFirstHourWeight: 0,
        },
      });
      expect(res1.statusCode).toBe(400);
      expect(res1.json().error).toContain('must be between 1 and 4');

      // Test weight > 4
      const res2 = await app.inject({
        method: 'POST',
        url: '/crew/PREF003/preferences',
        payload: {
          prefTaskWeight: 5,
        },
      });
      expect(res2.statusCode).toBe(400);
      expect(res2.json().error).toContain('must be between 1 and 4');

      // Cleanup
      await prisma.crewMember.delete({ where: { id: 'PREF003' } });
    });

    it('validates positive block sizes', async () => {
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'PREF004',
          name: 'Test Block Size Validation',
          storeId: STORE_ID,
        },
      });

      // Test negative block size
      const res1 = await app.inject({
        method: 'POST',
        url: '/crew/PREF004/preferences',
        payload: {
          prefBlocksizeProd: -10,
        },
      });
      expect(res1.statusCode).toBe(400);
      expect(res1.json().error).toContain('must be > 0');

      // Test zero block size
      const res2 = await app.inject({
        method: 'POST',
        url: '/crew/PREF004/preferences',
        payload: {
          prefBlocksizeReg: 0,
        },
      });
      expect(res2.statusCode).toBe(400);
      expect(res2.json().error).toContain('must be > 0');

      // Cleanup
      await prisma.crewMember.delete({ where: { id: 'PREF004' } });
    });

    it('returns 404 for non-existent crew', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/crew/NOEXIST/preferences',
        payload: {
          prefFirstHourWeight: 4,
        },
      });
      expect(res.statusCode).toBe(404);
    });

    it('updates both weights and values together', async () => {
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'PREF005',
          name: 'Test Combined Update',
          storeId: STORE_ID,
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/crew/PREF005/preferences',
        payload: {
          prefFirstHourWeight: 4,
          prefFirstHour: 'PRODUCT',
          prefTaskWeight: 3,
          prefTask: 'REGISTER',
          prefBlocksizeProdWeight: 2,
          prefBlocksizeProd: 150,
          prefBlocksizeRegWeight: 1,
          prefBlocksizeReg: 60,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.prefFirstHourWeight).toBe(4);
      expect(body.prefFirstHour).toBe('PRODUCT');
      expect(body.prefTaskWeight).toBe(3);
      expect(body.prefTask).toBe('REGISTER');
      expect(body.prefBlocksizeProdWeight).toBe(2);
      expect(body.prefBlocksizeProd).toBe(150);
      expect(body.prefBlocksizeRegWeight).toBe(1);
      expect(body.prefBlocksizeReg).toBe(60);

      // Cleanup
      await prisma.crewMember.delete({ where: { id: 'PREF005' } });
    });
  });

  describe('POST /crew - create with preferences', () => {
    it('creates crew member with initial preferences', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'PREF006',
          name: 'User With Initial Prefs',
          storeId: STORE_ID,
          prefFirstHourWeight: 4,
          prefFirstHour: 'REGISTER',
          prefTaskWeight: 2,
          prefTask: 'PRODUCT',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.prefFirstHourWeight).toBe(4);
      expect(body.prefFirstHour).toBe('REGISTER');
      expect(body.prefTaskWeight).toBe(2);
      expect(body.prefTask).toBe('PRODUCT');

      // Cleanup
      await prisma.crewMember.delete({ where: { id: 'PREF006' } });
    });
  });

  describe('PUT /crew/:id - update with preferences', () => {
    it('updates preferences via general update endpoint', async () => {
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'PREF007',
          name: 'Test General Update',
          storeId: STORE_ID,
        },
      });

      const res = await app.inject({
        method: 'PUT',
        url: '/crew/PREF007',
        payload: {
          prefFirstHourWeight: 3,
          prefBlocksizeProd: 100,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.prefFirstHourWeight).toBe(3);
      expect(body.prefBlocksizeProd).toBe(100);

      // Cleanup
      await prisma.crewMember.delete({ where: { id: 'PREF007' } });
    });
  });
});
