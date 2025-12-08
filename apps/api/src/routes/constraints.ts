import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { startOfDay } from '../utils';

const prisma = new PrismaClient();

type ConstraintPayload = {
  windowConstraints?: Array<{ roleId: number; startHour: number; endHour: number; requiredPerHour: number }>;
  dailyRoleConstraints?: Array<{ roleId: number; crewId: string; requiredHours: number }>;
  hourlyRoleConstraints?: Array<{ roleId: number; hour: number; requiredPerHour: number }>;
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

    const [windowConstraints, dailyRoleConstraints, hourlyRoleConstraints] = await Promise.all([
      prisma.windowRoleConstraint.findMany({
        where: { storeId: sid, date: day },
        select: { roleId: true, startHour: true, endHour: true, requiredPerHour: true },
        orderBy: [{ roleId: 'asc' }],
      }),
      prisma.dailyRoleConstraint.findMany({
        where: { storeId: sid, date: day },
        select: { roleId: true, crewId: true, requiredHours: true },
        orderBy: [{ roleId: 'asc' }, { crewId: 'asc' }],
      }),
      prisma.hourlyRoleConstraint.findMany({
        where: { storeId: sid, date: day },
        select: { roleId: true, hour: true, requiredPerHour: true },
        orderBy: [{ roleId: 'asc' }, { hour: 'asc' }],
      }),
    ]);

    return { windowConstraints, dailyRoleConstraints, hourlyRoleConstraints };
  });

  app.put('/stores/:storeId/constraints', async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const { date, windowConstraints, dailyRoleConstraints, hourlyRoleConstraints } = (req.body || {}) as ConstraintPayload;

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

    const normalizedWindows = (Array.isArray(windowConstraints) ? windowConstraints : [])
        .map((entry) => ({
          roleId: Number(entry.roleId),
          startHour: Number(entry.startHour),
          endHour: Number(entry.endHour),
          requiredPerHour: Math.round(Number(entry.requiredPerHour)),
        }))
      .filter((entry) =>
        Number.isInteger(entry.roleId) &&
        entry.roleId > 0 &&
        Number.isInteger(entry.startHour) &&
        Number.isInteger(entry.endHour) &&
        entry.startHour >= 0 &&
        entry.endHour <= 24 &&
        entry.endHour > entry.startHour &&
        Number.isFinite(entry.requiredPerHour) &&
        entry.requiredPerHour >= 0
      );

    const normalizedDaily = (Array.isArray(dailyRoleConstraints) ? dailyRoleConstraints : [])
      .map((entry) => {
        const roleId = Number(entry.roleId);
        const crewId = typeof entry.crewId === 'string' ? entry.crewId : '';
        const rawRequiredHours = Number(entry.requiredHours);
        const requiredHours = Number.isFinite(rawRequiredHours) ? Math.round(rawRequiredHours * 2) / 2 : NaN;
        return { roleId, crewId, requiredHours };
      })
      .filter((entry) =>
        Number.isInteger(entry.roleId) &&
        entry.roleId > 0 &&
        entry.crewId.length > 0 &&
        Number.isFinite(entry.requiredHours) &&
        entry.requiredHours >= 0.5
      );

    const normalizedHourly = (Array.isArray(hourlyRoleConstraints) ? hourlyRoleConstraints : [])
      .map((entry) => ({
        roleId: Number(entry.roleId),
        hour: Number(entry.hour),
          requiredPerHour: Math.round(Number(entry.requiredPerHour)),
      }))
      .filter((entry) =>
        Number.isInteger(entry.roleId) &&
        entry.roleId > 0 &&
        Number.isInteger(entry.hour) &&
        entry.hour >= 0 &&
        entry.hour <= 23 &&
        Number.isFinite(entry.requiredPerHour) &&
        entry.requiredPerHour >= 0
      );

    await prisma.$transaction(async (tx) => {
      await tx.windowRoleConstraint.deleteMany({ where: { storeId: sid, date: day } });
      if (normalizedWindows.length) {
        await tx.windowRoleConstraint.createMany({
          data: normalizedWindows.map((entry) => ({
            ...entry,
            storeId: sid,
            date: day,
          })),
        });
      }

      await tx.dailyRoleConstraint.deleteMany({ where: { storeId: sid, date: day } });
      if (normalizedDaily.length) {
        await tx.dailyRoleConstraint.createMany({
          data: normalizedDaily.map((entry) => ({
            ...entry,
            storeId: sid,
            date: day,
          })),
        });
      }

      await tx.hourlyRoleConstraint.deleteMany({ where: { storeId: sid, date: day } });
      if (normalizedHourly.length) {
            await tx.hourlyRoleConstraint.createMany({
              data: normalizedHourly.map((entry) => ({
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
        windowConstraints: normalizedWindows.length,
        dailyRoleConstraints: normalizedDaily.length,
        hourlyRoleConstraints: normalizedHourly.length,
      },
    };
  });
}
