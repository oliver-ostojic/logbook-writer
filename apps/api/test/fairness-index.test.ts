import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, LogbookStatus } from '@prisma/client';
import { saveLogPreferenceMetadata, type SatisfactionResult } from '../src/services/preference-satisfaction';
import crypto from 'crypto';

const prisma = new PrismaClient();

const TEST_STORE_ID = 987654321; // unlikely to collide

describe('Gini-based fairnessIndex computation', () => {
  let companyId: number;

  beforeAll(async () => {
    // Create a Company and Store required by Logbook
    const company = await prisma.company.create({
      data: { name: 'Test Company' },
    });
    companyId = company.id;

    await prisma.store.create({
      data: {
        id: TEST_STORE_ID,
        name: 'Test Store',
        timezone: 'EST',
        companyId,
      },
    });
  });

  afterAll(async () => {
    // Cleanup created data
    await prisma.logPreferenceMetadata.deleteMany({});
    await prisma.logbook.deleteMany({ where: { storeId: TEST_STORE_ID } });
    await prisma.store.deleteMany({ where: { id: TEST_STORE_ID } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('stores fairnessIndex ≈ 100 when scores are equal across crew', async () => {
    const logbookId = crypto.randomUUID();
    await prisma.logbook.create({
      data: {
        id: logbookId,
        date: new Date('2025-01-01'),
        storeId: TEST_STORE_ID,
        status: LogbookStatus.DRAFT,
        generatedAt: new Date(),
      },
    });

    const satisfactionResults: SatisfactionResult[] = [
      { rolePreferenceId: 1, crewId: 'A', satisfaction: 0.5, met: false, weightApplied: 10 },
      { rolePreferenceId: 2, crewId: 'B', satisfaction: 0.5, met: false, weightApplied: 10 },
    ];

    await saveLogPreferenceMetadata(prisma, logbookId, satisfactionResults);

  const meta = await prisma.logPreferenceMetadata.findUnique({ where: { logbookId } });
  expect(meta).not.toBeNull();
  const fairness = (meta as any).fairnessIndex as number;
  expect(fairness).toBeGreaterThanOrEqual(99.999);
  expect(fairness).toBeLessThanOrEqual(100);
  });

  it('stores fairnessIndex ≈ 50 when one crew has all and the other has none', async () => {
    const logbookId = crypto.randomUUID();
    await prisma.logbook.create({
      data: {
        id: logbookId,
        date: new Date('2025-01-02'),
        storeId: TEST_STORE_ID,
        status: LogbookStatus.DRAFT,
        generatedAt: new Date(),
      },
    });

    // Scores: [10, 0] → Gini = 0.5 → fairnessIndex = 50
    const satisfactionResults: SatisfactionResult[] = [
      { rolePreferenceId: 1, crewId: 'A', satisfaction: 1.0, met: true, weightApplied: 10 },
      { rolePreferenceId: 2, crewId: 'B', satisfaction: 0.0, met: false, weightApplied: 10 },
    ];

    await saveLogPreferenceMetadata(prisma, logbookId, satisfactionResults);

  const meta = await prisma.logPreferenceMetadata.findUnique({ where: { logbookId } });
  expect(meta).not.toBeNull();
  const fairness = (meta as any).fairnessIndex as number;
  expect(fairness).toBeGreaterThan(49.9);
  expect(fairness).toBeLessThan(50.1);
  });
});
