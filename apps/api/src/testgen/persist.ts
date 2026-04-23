import { PrismaClient } from '@prisma/client';
import { DayPayload } from './types';

const prisma = new PrismaClient();

export async function persistDayPayload(
  storeId: number,
  date: Date,
  payload: DayPayload,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const keepIds = new Set(payload.shifts.map(s => s.crewId));

    if (keepIds.size === 0) {
      await tx.shift.deleteMany({ where: { storeId, date } });
    } else {
      await tx.shift.deleteMany({
        where: { storeId, date, crewId: { notIn: Array.from(keepIds) } },
      });
    }

    for (const s of payload.shifts) {
      const updated = await tx.shift.updateMany({
        where: { storeId, date, crewId: s.crewId },
        data: { startMin: s.startMin, endMin: s.endMin },
      });
      if (updated.count === 0) {
        await tx.shift.create({
          data: { storeId, date, crewId: s.crewId, startMin: s.startMin, endMin: s.endMin },
        });
      }
    }

    await tx.roleCoverageWindow.deleteMany({ where: { storeId, date } });
    if (payload.coverageWindows.length > 0) {
      await tx.roleCoverageWindow.createMany({
        data: payload.coverageWindows.map(w => ({
          storeId,
          date,
          roleId: w.roleId,
          startMin: w.startMin,
          endMin: w.endMin,
          crewPerMinute: w.crewPerTaskLength,
          constraintRule: w.constraintRule as any,
        })),
      });
    }

    await tx.crewRoleQuota.deleteMany({ where: { storeId, date } });
    if (payload.crewQuotas.length > 0) {
      await tx.crewRoleQuota.createMany({
        data: payload.crewQuotas.map(q => ({
          storeId,
          date,
          roleId: q.roleId,
          crewId: q.crewId,
          startMin: q.startMin,
          endMin: q.endMin,
          requiredMin: q.requiredMin,
        })),
      });
    }
  });
}
