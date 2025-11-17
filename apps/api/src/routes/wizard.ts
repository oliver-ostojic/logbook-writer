import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { startOfDay, parseMaybeHM, hourOf, clamp } from '../utils';
import { segmentShiftByRegisterWindow, hhmmToMin, minToHHMM } from '../services/segmentation';
import { suggestDemoWindow, contiguousSegments, loadRulesByHour, type Shift } from '../services/demo-window';
import { normalize as domainNormalize } from '@logbook-writer/domain';

const prisma = new PrismaClient();

type InitBody = {
  date: string; // ISO yyyy-mm-dd or full ISO string
  store_id: number;
  shifts: Shift[];
};

type RequirementsBody = {
  date: string;
  store_id: number;
  requirements: Array<{
    crewId: string;
    roleId: string;
    requiredHours: number;
  }>;
};

type CoverageBody = {
  date: string;
  store_id: number;
  role_id: string; // UUID for DEMO role
  windowStart: string; // ISO or HH:mm
  windowEnd: string;   // ISO or HH:mm
  requiredPerHour?: number; // default 1
};

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
    const crewWithRoles = await prisma.crewMember.findMany({
      where: { id: { in: crewIds } },
      include: { roles: { include: { role: true } } },
    });
    const eligibilities = crewWithRoles.flatMap((c: any) =>
      c.roles.map((r: any) => ({ crewId: c.id, roleName: r.role.name }))
    );

    // Rules by hour
    const rulesByHour = await loadRulesByHour(store_id, day);

    // Build avail[24] and feasible segments
  const { availByHour } = await suggestDemoWindow(normDate, normalizedShifts);
    const segments = contiguousSegments(availByHour, 1);
    const recommended =
      segments.reduce<{ startHour:number; endHour:number } | null>(
        (best, seg) =>
          best && (best.endHour - best.startHour) >= (seg.endHour - seg.startHour)
            ? best
            : seg,
        null
      );

    const demoFeasible: DemoFeasible = { segments, recommended, availByHour };

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

  // Step 2A: upsert per-crew role requirements
  app.post<{ Body: RequirementsBody }>('/wizard/requirements', async (req, reply) => {
    const { date, store_id, requirements } = req.body;
    // Normalize and validate date and provided crew ids
    const n = domainNormalize({ crews: (requirements || []).map(r => ({ id: r.crewId })), dates: date });
    if (!n.valid) return reply.code(400).send({ error: 'Invalid input', details: n.errors });
    const normDate = n.data!.dates[0];
    const day = startOfDay(normDate);
    // Upsert by unique (date, storeId, crewId, roleId)
    const ops = requirements.map((r) =>
      prisma.dailyRoleRequirement.upsert({
        where: {
          date_storeId_crewId_roleId: {
            date: day,
            storeId: store_id,
            crewId: r.crewId,
            roleId: r.roleId,
          },
        },
        update: {
          requiredHours: r.requiredHours,
        },
        create: {
          id: crypto.randomUUID(),
          date: day,
          storeId: store_id,
          crewId: r.crewId,
          roleId: r.roleId,
          requiredHours: r.requiredHours,
        },
      })
    );

    await prisma.$transaction(ops);
    return { ok: true, normalizedDate: normDate, upserted: ops.length };
  });

  // Step 2B: upsert DEMO coverage (per-day/per-role)
  app.post<{ Body: CoverageBody }>('/wizard/coverage', async (req, reply) => {
    const { date, store_id, role_id, windowStart, windowEnd, requiredPerHour } = req.body;
    // Normalize and validate date only
    const n = domainNormalize({ dates: date });
    if (!n.valid) return reply.code(400).send({ error: 'Invalid input', details: n.errors });
    const normDate = n.data!.dates[0];
    const day = startOfDay(normDate);
    const ws = parseMaybeHM(day, windowStart);
    const we = parseMaybeHM(day, windowEnd);
    if (!ws || !we || ws >= we) return reply.code(400).send({ error: 'Invalid window' });

    await prisma.dailyRoleCoverage.upsert({
      where: { date_storeId_roleId: { date: day, storeId: store_id, roleId: role_id } },
      update: { windowStart: ws, windowEnd: we, requiredPerHour: requiredPerHour ?? 1 },
      create: {
        id: crypto.randomUUID(),
        date: day, storeId: store_id, roleId: role_id,
        windowStart: ws, windowEnd: we, requiredPerHour: requiredPerHour ?? 1,
        createdBy: 'mate-demo', // TODO: from auth
      }
    });

    return { ok: true, normalizedDate: normDate };
  });
}