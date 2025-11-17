import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { startOfDay, hourOf, clamp } from '../utils';
import { type Shift } from '../services/demo-window';
import { segmentShiftByRegisterWindow, hhmmToMin, minToHHMM } from '../services/segmentation';

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

    // Load store register window defaults
    const storeAny = (await prisma.store.findUnique({ where: { id: store_id } })) as any;
    const regStartMin = (storeAny?.regHoursStartMin ?? 480) as number; // 08:00
    const regEndMin = (storeAny?.regHoursEndMin ?? 1260) as number;    // 21:00

    // Load requirements & coverage from wizard steps
    const requirements = await prisma.dailyRoleRequirement.findMany({ 
      where: { date: day, storeId: store_id }
    });
    const coverages = await prisma.dailyRoleCoverage.findMany({ 
      where: { date: day, storeId: store_id }
    });

    // Normalize shifts and compute PRODUCT/FLEX segmentation per crew
    const normalizedShifts = shifts.map(s => ({
      crewId: s.crewId,
      start: `${clamp(hourOf(s.start), 0, 23).toString().padStart(2,'0')}:00`,
      end: `${clamp(hourOf(s.end), 0, 24).toString().padStart(2,'0')}:00`,
    }));

    const segmentedShifts = normalizedShifts.map(s => {
      const startMin = hhmmToMin(s.start);
      const endMin = hhmmToMin(s.end);
      const seg = segmentShiftByRegisterWindow(startMin, endMin, regStartMin, regEndMin);
      return {
        crewId: s.crewId,
        shift: { start: s.start, end: s.end },
        segments: seg.segments.map(x => ({ 
          start: minToHHMM(x.startMin), 
          end: minToHHMM(x.endMin), 
          kind: x.kind 
        })),
        productMinutes: seg.productMinutes,
        flexMinutes: seg.flexMinutes,
      };
    });

    // --- Engine placeholder ---
    // TODO: pass segmentedShifts + requirements + coverages to real engine
    // Engine will allocate FLEX time to REGISTER/roles/breaks based on requirements/coverages
    
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

    // TODO: replace with real assignments using segmentedShifts/requirements/coverages
    // For now return stub metrics + segmentation summary for debugging
    const totalProductMin = segmentedShifts.reduce((a, s) => a + s.productMinutes, 0);
    const totalFlexMin = segmentedShifts.reduce((a, s) => a + s.flexMinutes, 0);
    const metrics = { 
      tasks: 0, 
      coverage_hours: coverages.length,
      required_fulfilled: requirements.length,
      total_product_hours: totalProductMin / 60,
      total_flex_hours: totalFlexMin / 60,
    };

    return { 
      run_id: run.id, 
      logbook_id: logbook.id, 
      violations: [], 
      metrics,
      // Include segmentation for debugging/validation until engine is integrated
      segmentedShifts,
    };
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
