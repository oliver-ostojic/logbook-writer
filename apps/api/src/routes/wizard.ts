import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { startOfDay, parseMaybeHM, hourOf, clamp } from '../utils';
import { segmentShiftByRegisterWindow, hhmmToMin, minToHHMM } from '../services/segmentation';
import { suggestDemoWindow, contiguousSegments, loadRulesByHour, type Shift } from '../services/demo-window';
import { normalize as domainNormalize } from '@logbook-writer/domain';
import {
  generateScheduleOptions,
  formatScheduleOption,
  findAllLongestWindows,
  buildAvailability,
  type Shift as OptionShift,
  type Eligibility
} from '../services/schedule-options';

const prisma = new PrismaClient();

type InitBody = {
  date: string; // ISO yyyy-mm-dd or full ISO string
  store_id: number;
  shifts: Shift[];
};

// Deprecated types (requirements, coverage) removed with simplification of wizard API.

type DemoFeasible = {
  segments: Array<{ startHour: number; endHour: number }>; // [start,end) hours where avail>=1 continuously
  recommended: { startHour: number; endHour: number } | null; // longest segment (or null if none)
  availByHour: number[]; // length 24
};

export function registerWizardRoutes(app: FastifyInstance) {
  // Convenience GET to avoid 404 when opening in a browser.
  app.get('/wizard/init', async () => {
    return {
      ok: true,
      message: 'Use POST /wizard/init with JSON body to initialize the wizard.',
      bodyExample: {
        date: '2025-01-01',
        store_id: 1,
        shifts: [
          { crewId: 'A', start: '09:00', end: '17:00' },
          { crewId: 'B', start: '10:00', end: '18:00' },
        ],
      },
      note: 'The frontend wizard UI is at http://localhost:3000/wizard/init',
    };
  });

  // Step 1: init wizard
  app.post<{ Body: InitBody }>('/wizard/init', async (req, reply) => {
    const { date, store_id, shifts } = req.body;
    // Use domain normalization to coerce date and validate crew ids
    const n = domainNormalize({ crews: (shifts || []).map(s => ({ id: s.crewId })), dates: date });
    if (!n.valid) return reply.code(400).send({ error: 'Invalid input', details: n.errors });
    const normDate = n.data!.dates[0];
    const day = startOfDay(normDate);

    // Normalize shifts (snap to hour boundaries for now)
    const normalizedShifts = shifts.map(s => ({
      crewId: s.crewId,
      start: `${clamp(hourOf(s.start), 0, 23).toString().padStart(2,'0')}:00`,
      end: `${clamp(hourOf(s.end), 0, 24).toString().padStart(2,'0')}:00`,
    }));

    // Eligibilities: from implicit many-to-many (CrewMember.roles)
    const crewIds = Array.from(new Set(normalizedShifts.map(s => s.crewId)));
    const crewWithRoles = await prisma.crew.findMany({
      where: { id: { in: crewIds } },
      include: { crewRoles: { include: { role: true } } },
    });
    const eligibilities = crewWithRoles.flatMap((c: any) =>
      c.crewRoles.map((cr: any) => ({ crewId: c.id, roleName: cr.role.code }))
    );

    // Rules by hour
    const rulesByHour = await loadRulesByHour(store_id, day);

    // Build avail[24] and feasible segments
    const { segments, availByHour } = await suggestDemoWindow(normDate, normalizedShifts);
    // Recommended window deprecated – managers choose manually.
    const demoFeasible: DemoFeasible = { segments, recommended: null, availByHour };

    return { normalizedDate: normDate, normalizedShifts, eligibilities, rulesByHour, demoFeasible };
  });

  // Step 1B: compute per-crew PRODUCT/FLEX segments from store register window
  // Input body is same shape as /wizard/init (date, store_id, shifts)
  app.post<{ Body: InitBody }>(
    '/wizard/segments',
    async (req, reply) => {
      const { date, store_id, shifts } = req.body;
      // Normalize and validate input date and crew ids (ids can repeat; we only care about validity here)
      const n = domainNormalize({ crews: (shifts || []).map(s => ({ id: s.crewId })), dates: date });
      if (!n.valid) return reply.code(400).send({ error: 'Invalid input', details: n.errors });
      const normDate = n.data!.dates[0];
      const day = startOfDay(normDate);

      // Load store defaults (minutes since midnight); fallback to 08:00-21:00
      const storeAny = (await prisma.store.findUnique({ where: { id: store_id } })) as any;
      const regStartMin = (storeAny?.regHoursStartMin ?? 480) as number; // 08:00
      const regEndMin = (storeAny?.regHoursEndMin ?? 1260) as number;    // 21:00

      // Normalize shifts to HH:mm bounds and compute per-crew segmentation
      const segmentsByCrew = shifts.map(s => {
        const startMin = hhmmToMin(`${clamp(hourOf(s.start), 0, 23).toString().padStart(2,'0')}:00`);
        const endMin = hhmmToMin(`${clamp(hourOf(s.end), 0, 24).toString().padStart(2,'0')}:00`);
        const seg = segmentShiftByRegisterWindow(startMin, endMin, regStartMin, regEndMin);
        return {
          crewId: s.crewId,
          shift: { start: minToHHMM(startMin), end: minToHHMM(endMin) },
          regWindow: { start: minToHHMM(regStartMin), end: minToHHMM(regEndMin) },
          segments: seg.segments.map(x => ({ start: minToHHMM(x.startMin), end: minToHHMM(x.endMin), kind: x.kind })),
          productMinutes: seg.productMinutes,
          flexMinutes: seg.flexMinutes,
        };
      });

      return { normalizedDate: normDate, date: day, store_id, segmentsByCrew };
    }
  );

  // Deprecated endpoints (/wizard/requirements, /wizard/coverage, /wizard/compute-coverage-combinations, /wizard/store-rules) removed.
}