import { PrismaClient } from '@prisma/client';
import { startOfDay, hourOf, clamp } from '../utils';

const prisma = new PrismaClient();

export type Shift = { crewId: string; start: string; end: string };

export function contiguousSegments(avail: number[], threshold = 1) {
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

export async function suggestDemoWindow(dateISO: string, shifts: Shift[]) {
  startOfDay(new Date(dateISO)); // retain for future day-based filtering
  // Fetch ALL roles matching 'demo' case-insensitively to avoid picking a later duplicate
  // Some tests (CRUD) may create an additional 'DEMO' role without crew assignments which was
  // previously selected by findFirst(), resulting in empty availability.
  const demoRoles = await prisma.role.findMany({
    where: { name: { equals: 'demo', mode: 'insensitive' } },
    include: { crewMembers: true },
  });
  // Union all crew member IDs across any matching demo roles
  const demoCrewSet = new Set(
    demoRoles.flatMap((r: any) => (r.crewMembers ?? []).map((cm: any) => cm.crewMemberId))
  );
  // If multiple demo roles exist, prefer the one with most crew for recommended metadata (not strictly needed now)
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

export async function loadRulesByHour(storeId: number, day: Date) {
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
