import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { startOfDay } from '../utils';
import { type Shift } from '../services/demo-window';

// Import enums using require for runtime access
const { LogbookStatus } = require('@prisma/client');

const prisma = new PrismaClient();

type RunBody = {
  date: string;
  store_id: number;
  shifts: Shift[];
};

export function registerScheduleRoutes(app: FastifyInstance) {
  // Run scheduler (stub engine v0)
  app.post<{ Body: RunBody }>('/schedule/run', async (req, reply) => {
    const { date, store_id, shifts } = req.body;
    const day = startOfDay(new Date(date));

    // Load requirements & coverage
    const coverages = await prisma.dailyRoleCoverage.findMany({ 
      where: { date: day, storeId: store_id }
    });

    // --- Engine placeholder ---
    // For now: ensure a single DRAFT logbook exists per (storeId, date), then return stub metrics.
    let logbook = await prisma.logbook.findFirst({
      where: { date: day, storeId: store_id, status: LogbookStatus.DRAFT },
      orderBy: { createdAt: 'desc' },
    });
    if (!logbook) {
      logbook = await prisma.logbook.create({
        data: {
          id: crypto.randomUUID(),
          date: day,
          storeId: store_id,
          status: LogbookStatus.DRAFT,
          generatedAt: new Date(),
        },
      });
    }

    const run = await prisma.run.create({
      data: {
        id: crypto.randomUUID(),
        date: day,
        storeId: store_id,
        engine: 'greedy-v0',
        seed: 0,
        status: 'FEASIBLE',
        runtimeMs: 1,
        violations: [],
        logbookId: logbook.id,
      }
    });

    // TODO: replace with real assignments using coverages/shifts
    const metrics = { tasks: 0, coverage_hours: 0, required_fulfilled: 0 };

    return { run_id: run.id, logbook_id: logbook.id, violations: [], metrics };
  });

  // Fetch logbook + tasks for a day/store
  app.get('/schedule/logbook', async (req, reply) => {
    const { date, store_id } = (req.query as any) ?? {};
    if (!date || !store_id) return reply.code(400).send({ error: 'date & store_id required' });
    const day = startOfDay(new Date(String(date)));

    const lb = await prisma.logbook.findFirst({
      where: { date: day, storeId: Number(store_id) },
      include: { tasks: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!lb) return reply.code(404).send({ error: 'No logbook for that day/store' });
    return lb;
  });
}
