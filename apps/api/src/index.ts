import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient, Prisma } from '@prisma/client';
// Import enums using require for runtime access
const { LogbookStatus, TaskType } = require('@prisma/client');
// --- Types for request bodies ---
type Shift = { crewId: string; start: string; end: string };

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

type RunBody = {
  date: string;
  store_id: number;
  shifts: Shift[];
};

type DemoFeasible = {
  segments: Array<{ startHour: number; endHour: number }>; // [start,end) hours where avail>=1 continuously
  recommended: { startHour: number; endHour: number } | null; // longest segment (or null if none)
  availByHour: number[]; // length 24
};

// --- util helpers ---
const prisma = new PrismaClient();

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseMaybeHM(date: Date, value?: string | null): Date | null {
  if (!value) return null;
  // If it's already an ISO datetime
  if (/T/.test(value)) return new Date(value);
  // Expect HH:mm
  const [h, m] = value.split(':').map(Number);
  const dt = startOfDay(date);
  dt.setHours(h || 0, m || 0, 0, 0);
  return dt;
}

function hourOf(hhmm: string): number {
  const [h] = hhmm.split(':').map(Number);
  return h || 0;
}

// To normalize hour within [lo, hi]
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// Returns e.g. [{hour:8, requiredRegisters:2, minProduct:1, minParking:0, maxParking:null}, ...]
async function loadRulesByHour(storeId: number, day: Date) {
  const rules = await prisma.storeHourRule.findMany({
    where: { storeId, date: day },
    orderBy: { hour: 'asc' },
  });
  return rules.map((r: any) => ({
    hour: r.hour,
    requiredRegisters: r.requiredRegisters,
    minProduct: r.minProduct,
    minParking: r.minParking,
    maxParking: r.maxParking,
  }));
}

function contiguousSegments(avail: number[], threshold = 1) {
  const segs: { startHour: number; endHour: number }[] = [];
  let s = -1;
  for (let h = 0; h < 24; h++) {
    const ok = avail[h] >= threshold;
    if (ok && s === -1) s = h;
    if (!ok && s !== -1) { segs.push({ startHour: s, endHour: h }); s = -1; }
  }
  if (s !== -1) segs.push({ startHour: s, endHour: 24 });
  return segs;
}

// Suggest a DEMO window (longest contiguous hours with availability >= 1 among DEMO-eligible crew)
async function suggestDemoWindow(dateISO: string, shifts: Shift[]) {
  const day = startOfDay(new Date(dateISO));
  // Fetch the DEMO role & its eligible crew
  const demoRole = await prisma.role.findFirst({
    where: { name: { equals: 'demo', mode: 'insensitive' } },
    include: { crewMembers: true },
  });
  // Create a set of crew IDs eligible for DEMO
  const demoCrewSet = new Set((demoRole?.crewMembers ?? []).map((c: any) => c.crewMemberId));
  // Create hourly availability map
  const avail = Array(24).fill(0);
  // Fill availability map
  for (const s of shifts) {
    if (!demoCrewSet.has(s.crewId)) continue;
    // Clamp start/end hours
    const sh = clamp(hourOf(s.start), 0, 23);
    const eh = clamp(hourOf(s.end), 0, 24);
    // Add the availability to the map, for each available hour for a crew member
    for (let h = sh; h < eh; h++) avail[h] += 1;
  }
  
  const segs = contiguousSegments(avail, 1);
  // pick longest as recommended
  let recommended = null as {startHour:number; endHour:number} | null;
  let best = -1;
  for (const seg of segs) {
    const len = seg.endHour - seg.startHour;
    if (len > best) { best = len; recommended = seg; }
  }
  return { segments: segs, recommended, availByHour: avail };
}

// --- Fastify app ---
export async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  // Health / stub
  app.get('/me', async () => ({ id: '1269090', role: 'Crew Member' }));

  // Step 1: init wizard
  app.post<{ Body: InitBody }>('/wizard/init', async (req, reply) => {
    const { date, store_id, shifts } = req.body;
    const day = startOfDay(new Date(date));

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
    const { availByHour } = await suggestDemoWindow(date, normalizedShifts);
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

    return { normalizedShifts, eligibilities, rulesByHour, demoFeasible };
  });

  // Step 2A: upsert per-crew role requirements
  app.post<{ Body: RequirementsBody }>('/wizard/requirements', async (req, reply) => {
    const { date, store_id, requirements } = req.body;
    const day = startOfDay(new Date(date));
    // Upsert by unique (date, storeId, crewId, roleId)
    // Note: windowStart/windowEnd are currently NOT stored on DailyRoleRequirement schema
    // If needed later, add those columns to the Prisma model and extend this logic.
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
    return { ok: true, upserted: ops.length };
  });

  // Step 2B: upsert DEMO coverage (per-day/per-role)
  app.post<{ Body: CoverageBody }>('/wizard/coverage', async (req, reply) => {
    const { date, store_id, role_id, windowStart, windowEnd, requiredPerHour } = req.body;
    const day = startOfDay(new Date(date));
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
        createdBy: 'mate-demo',
      }
    });

    return { ok: true };
  });

  // Run scheduler (stub engine v0)
  app.post<{ Body: RunBody }>('/schedule/run', async (req, reply) => {
    const { date, store_id, shifts } = req.body;
    const day = startOfDay(new Date(date));

    // Load requirements & coverage
    const coverages = await prisma.dailyRoleCoverage.findMany({ 
      where: { date: day, storeId: store_id }, 
      include: { role: true } 
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

  return app;
}

// Bootstrap if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildServer().then(app => {
    const port = Number(process.env.PORT ?? 4000);
    app.listen({ port, host: '0.0.0.0' }).catch(err => {
      app.log.error(err);
      process.exit(1);
    });
  });
}