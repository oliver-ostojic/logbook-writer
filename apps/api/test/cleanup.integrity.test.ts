import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { cleanupTestStores, cleanupTestCrew, disconnectPrisma } from './test-cleanup';

const prisma = new PrismaClient();
const TEST_COMPANY_NAME = 'Cleanup Test Company';
const STORE_ID_BASE = 99999;

describe('Cleanup utilities remove all test data', () => {
  beforeAll(async () => {
    // Seed a test company and two stores
    const company = await prisma.company.create({
      data: { name: TEST_COMPANY_NAME },
    });

    // Create two test stores
    for (let i = 0; i < 2; i++) {
      const storeId = STORE_ID_BASE + i;
      await prisma.store.upsert({
        where: { id: storeId },
        update: { name: `Tuning Test Store ${i}`, companyId: company.id },
        create: { id: storeId, name: `Tuning Test Store ${i}`, companyId: company.id },
      });
      // Seed crew for each store
      await prisma.crew.create({
        data: { id: `TUN00${i}A`, name: `Crew ${i}A`, storeId },
      });
      await prisma.crew.create({
        data: { id: `TUN00${i}B`, name: `Crew ${i}B`, storeId },
      });
      // Seed roles and role preferences
      const role = await prisma.role.create({
        data: { storeId, code: `ROLE_${i}`, displayName: `Role ${i}` },
      });
      await prisma.rolePreference.create({
        data: { storeId, roleId: role.id, preferenceType: 'FAVORITE', baseWeight: 1 },
      });
      // Seed shifts
      const day = new Date(Date.UTC(2025, 10, 22, 0, 0, 0, 0));
      await prisma.shift.create({
        data: { storeId, date: day, crewId: `TUN00${i}A`, startMin: 540, endMin: 1080 },
      });
    }
  }, 30_000);

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('deletes all seeded test stores, crew, roles, preferences, shifts, and orphan companies', async () => {
    // Run crew cleanup first (prefix TUN)
    await cleanupTestCrew('TUN');
    // Then store cleanup
    await cleanupTestStores();

    // Assert no test stores remain
    const remainingStores = await prisma.store.findMany({
      where: {
        OR: [
          { id: { gte: STORE_ID_BASE } },
          { name: { contains: 'Tuning Test Store', mode: 'insensitive' } },
        ],
      },
    });
    expect(remainingStores.length).toBe(0);

    // Assert no test crew remain
    const remainingCrew = await prisma.crew.findMany({
      where: { id: { startsWith: 'TUN' } },
    });
    expect(remainingCrew.length).toBe(0);

    // Assert no leftover shifts for test store ids
    const remainingShifts = await prisma.shift.findMany({
      where: { storeId: { gte: STORE_ID_BASE } },
    });
    expect(remainingShifts.length).toBe(0);

    // Assert no leftover roles and role preferences for test store ids
    const remainingRoles = await prisma.role.findMany({
      where: { storeId: { gte: STORE_ID_BASE } },
    });
    expect(remainingRoles.length).toBe(0);
    const remainingRolePrefs = await prisma.rolePreference.findMany({
      where: { storeId: { gte: STORE_ID_BASE } },
    });
    expect(remainingRolePrefs.length).toBe(0);

    // Assert orphan test company is deleted (no stores remain)
    const orphanCompanies = await prisma.company.findMany({
      where: { name: { contains: 'Test', mode: 'insensitive' }, stores: { none: {} } },
    });
    expect(orphanCompanies.length).toBe(0);
  });
});
