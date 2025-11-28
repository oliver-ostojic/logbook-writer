import { PrismaClient } from '@prisma/client';
import { startOfDay, hourOf, clamp } from '../utils';

// NOTE: This service now only computes raw availability & contiguous segments for DEMO crew.
// The "recommended" window (longest segment) has been deprecated; managers select windows manually.
// We retain role-based filtering (only DEMO crew contribute) but omit recommendation logic entirely.

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
  startOfDay(new Date(dateISO)); // reserved for future day-based filtering
  // Fetch DEMO roles and associated crew via new relation names
  const demoRoles = await prisma.role.findMany({
    where: { code: 'DEMO' },
    include: { crewRoles: { include: { crew: true } } },
  });
  const demoCrewSet = new Set(
    demoRoles.flatMap((r: any) => (r.crewRoles ?? []).map((cr: any) => cr.crew.id))
  );
  const avail = Array(24).fill(0);
  for (const s of shifts) {
    if (!demoCrewSet.has(s.crewId)) continue;
    const sh = clamp(hourOf(s.start), 0, 23);
    const eh = clamp(hourOf(s.end), 0, 24);
    for (let h = sh; h < eh; h++) avail[h] += 1;
  }
  const segments = contiguousSegments(avail, 1);
  // Deprecated: recommended longest segment (manager decides manually)
  return { segments, availByHour: avail };
}

export async function loadRulesByHour(storeId: number, day: Date) {
  // Schema has evolved; legacy hourlyRequirement table may be removed.
  // Return empty array until new constraint retrieval logic is implemented.
  return [] as Array<{ hour: number; requiredRegisters: number; minProduct: number; minParking: number; maxParking: number }>;
}
