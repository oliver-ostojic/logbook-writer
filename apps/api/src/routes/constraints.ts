import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { startOfDay } from '../utils';

const prisma = new PrismaClient();

/**
 * New schema uses:
 * - RoleCoverageWindow: replaces HourlyRoleConstraint + WindowRoleConstraint
 * - CrewRoleQuota: replaces DailyRoleConstraint
 */

type CoverageWindowInput = {
  roleId: number;
  startMin: number;
  endMin: number;
  crewPerTaskLength: number;
};

type CrewQuotaInput = {
  roleId: number;
  crewId: string;
  startMin: number;
  endMin: number;
  requiredMin: number;
};

type ConstraintPayload = {
  coverageWindows?: CoverageWindowInput[];
  crewQuotas?: CrewQuotaInput[];
  date?: string;
};

function parseDate(date: string | undefined) {
  if (!date) return null;
  try {
    return startOfDay(String(date));
  } catch {
    return null;
  }
}

export function registerConstraintRoutes(app: FastifyInstance) {
  // GET constraints for a store/date
  app.get('/stores/:storeId/constraints', async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const { date } = (req.query as { date?: string }) || {};

    if (!storeId || !date) {
      return reply.code(400).send({ error: 'storeId path param and date query (YYYY-MM-DD) are required' });
    }

    const sid = Number(storeId);
    if (!Number.isFinite(sid)) {
      return reply.code(400).send({ error: 'storeId must be a number' });
    }

    const day = parseDate(date);
    if (!day) {
      return reply.code(400).send({ error: 'Invalid date format; expected YYYY-MM-DD' });
    }

    const [coverageWindows, crewQuotas] = await Promise.all([
      prisma.roleCoverageWindow.findMany({
        where: { storeId: sid, date: day },
        select: { roleId: true, startMin: true, endMin: true, crewPerMinute: true, constraintRule: true },
        orderBy: [{ roleId: 'asc' }, { startMin: 'asc' }],
      }),
      prisma.crewRoleQuota.findMany({
        where: { storeId: sid, date: day },
        select: { roleId: true, crewId: true, startMin: true, endMin: true, requiredMin: true },
        orderBy: [{ roleId: 'asc' }, { crewId: 'asc' }],
      }),
    ]);

    return { coverageWindows, crewQuotas };
  });

  // PUT (replace) constraints for a store/date
  app.put('/stores/:storeId/constraints', async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const { date, coverageWindows, crewQuotas } = (req.body || {}) as ConstraintPayload;

    if (!storeId || !date) {
      return reply.code(400).send({ error: 'storeId path param and body.date are required' });
    }

    const sid = Number(storeId);
    if (!Number.isFinite(sid)) {
      return reply.code(400).send({ error: 'storeId must be a number' });
    }

    const day = parseDate(date);
    if (!day) {
      return reply.code(400).send({ error: 'Invalid date format; expected YYYY-MM-DD' });
    }

    // Normalize and validate coverage windows
    const normalizedCoverageWindows = (Array.isArray(coverageWindows) ? coverageWindows : [])
      .map((entry) => ({
        roleId: Number(entry.roleId),
        startMin: Number(entry.startMin),
        endMin: Number(entry.endMin),
        crewPerMinute: Math.round(Number((entry as any).crewPerMinute ?? (entry as any).crewPerTaskLength)),
        constraintRule: (entry as any).constraintRule ?? 'EXACTLY',
      }))
      .filter((entry) =>
        Number.isInteger(entry.roleId) &&
        entry.roleId > 0 &&
        Number.isInteger(entry.startMin) &&
        Number.isInteger(entry.endMin) &&
        entry.startMin >= 0 &&
        entry.endMin <= 1440 && // 24 * 60
        entry.endMin > entry.startMin &&
        Number.isInteger(entry.crewPerMinute) &&
        entry.crewPerMinute >= 0
      );

    // Normalize and validate crew quotas
    const normalizedCrewQuotas = (Array.isArray(crewQuotas) ? crewQuotas : [])
      .map((entry) => ({
        roleId: Number(entry.roleId),
        crewId: typeof entry.crewId === 'string' ? entry.crewId : '',
        startMin: Number(entry.startMin),
        endMin: Number(entry.endMin),
        requiredMin: Math.round(Number(entry.requiredMin)),
      }))
      .filter((entry) =>
        Number.isInteger(entry.roleId) &&
        entry.roleId > 0 &&
        entry.crewId.length > 0 &&
        Number.isInteger(entry.startMin) &&
        Number.isInteger(entry.endMin) &&
        entry.startMin >= 0 &&
        entry.endMin <= 1440 &&
        entry.endMin > entry.startMin &&
        Number.isInteger(entry.requiredMin) &&
        entry.requiredMin > 0
      );

    await prisma.$transaction(async (tx) => {
      // Replace coverage windows
      await tx.roleCoverageWindow.deleteMany({ where: { storeId: sid, date: day } });
      if (normalizedCoverageWindows.length) {
        await tx.roleCoverageWindow.createMany({
          data: normalizedCoverageWindows.map((entry) => ({
            ...entry,
            storeId: sid,
            date: day,
          })),
        });
      }

      // Replace crew quotas
      await tx.crewRoleQuota.deleteMany({ where: { storeId: sid, date: day } });
      if (normalizedCrewQuotas.length) {
        await tx.crewRoleQuota.createMany({
          data: normalizedCrewQuotas.map((entry) => ({
            ...entry,
            storeId: sid,
            date: day,
          })),
        });
      }
    });

    return {
      ok: true,
      counts: {
        coverageWindows: normalizedCoverageWindows.length,
        crewQuotas: normalizedCrewQuotas.length,
      },
    };
  });
}
