import { PrismaClient } from '@prisma/client';

/*
Quick investigation script to trace FIRST_HOUR and TIMING preference signals end-to-end.
- Prints counts, intValue distributions, shift lengths, presence of breaks, and satisfaction reasons.
Run with: pnpm ts-node apps/api/scripts/analyze-preference-pipeline.ts
*/

const prisma = new PrismaClient();

async function main() {
  const store = await prisma.store.findFirst({});
  if (!store) {
    console.error('No store found');
    return;
  }
  const roles = await prisma.role.findMany({ where: { storeId: store.id } });

  const roleWindowMap = new Map<number, { startOffsetMin?: number; endOffsetMin?: number; minShiftLength?: number }>();
  roles.forEach(role => {
    roleWindowMap.set(role.id, {
      startOffsetMin: (role as any).windowStartOffsetMin ?? undefined,
      endOffsetMin: (role as any).windowEndOffsetMin ?? undefined,
      minShiftLength: (role as any).minShiftLengthForRoleAccess ?? undefined,
    });
  });

  // Most recent logbook
  const logbook = await prisma.logbook.findFirst({
    where: { storeId: store.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!logbook) {
    console.error('No logbook found');
    return;
  }

  const assignments = await prisma.assignment.findMany({
    where: { logbookId: logbook.id },
    include: { role: true },
    orderBy: [{ crewId: 'asc' }, { startTime: 'asc' }],
  });

  const prefs = await prisma.preferenceSatisfaction.findMany({
    where: { logbookId: logbook.id },
    include: { rolePreference: true },
  });

  const byCrew = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const arr = byCrew.get(a.crewId) || [] as any[];
    arr.push(a);
    byCrew.set(a.crewId, arr);
  }

  const firstHourPrefs = prefs.filter(p => p.rolePreference.preferenceType === 'FIRST_HOUR');
  const timingPrefs = prefs.filter(p => p.rolePreference.preferenceType === 'TIMING');

  const hourDist = new Map<number, number>();
  const preferredHourDist = new Map<number, number>();
  let fhMet = 0;
  let fhTotal = firstHourPrefs.length;

  // Load preferred hours from CrewPreference
  const crewPrefMap = new Map<string, number>();
  const crewPrefRecords = await prisma.crewPreference.findMany({
    where: { rolePreferenceId: { in: firstHourPrefs.map(p => p.rolePreferenceId) } },
    select: { crewId: true, rolePreferenceId: true, intValue: true }
  });
  for (const cp of crewPrefRecords) {
    if (cp.intValue != null) {
      crewPrefMap.set(`${cp.crewId}-${cp.rolePreferenceId}`, cp.intValue);
      preferredHourDist.set(cp.intValue, (preferredHourDist.get(cp.intValue) || 0) + 1);
    }
  }

  for (const p of firstHourPrefs) {
    const prefHour = crewPrefMap.get(`${p.crewId}-${p.rolePreferenceId}`) ?? null;
    const crewAssign = (byCrew.get(p.crewId) || []).sort((a,b)=>+a.startTime-+b.startTime);
    const first = crewAssign[0];
    const firstHour = first ? first.startTime.getHours() : null;
    if (firstHour != null) hourDist.set(firstHour, (hourDist.get(firstHour) || 0) + 1);
    if (p.met) fhMet++;
  }

  const crewShiftMap = new Map<string, { startMin: number; endMin: number }>();
  for (const assignment of assignments) {
    const minuteStart = assignment.startTime.getHours() * 60 + assignment.startTime.getMinutes();
    const minuteEnd = assignment.endTime.getHours() * 60 + assignment.endTime.getMinutes();
    const existing = crewShiftMap.get(assignment.crewId);
    if (!existing) {
      crewShiftMap.set(assignment.crewId, { startMin: minuteStart, endMin: minuteEnd });
    } else {
      existing.startMin = Math.min(existing.startMin, minuteStart);
      existing.endMin = Math.max(existing.endMin, minuteEnd);
    }
  }

  let timingMet = 0;
  let timingNoAssignment = 0;
  let timingTooShort = 0;
  let timingWindowInvalid = 0;

  for (const p of timingPrefs) {
    const crewAssign = (byCrew.get(p.crewId) || []).sort((a,b)=>+a.startTime-+b.startTime);
    if (crewAssign.length === 0) continue;
    const roleId = p.rolePreference.roleId;
    if (!roleId) continue;

    const shiftBounds = crewShiftMap.get(p.crewId);
    if (!shiftBounds) continue;

    const roleWindow = roleWindowMap.get(roleId);
    const minShiftLength = roleWindow?.minShiftLength ?? 0;
    const shiftLength = shiftBounds.endMin - shiftBounds.startMin;
    if (minShiftLength > 0 && shiftLength < minShiftLength) {
      timingTooShort++;
      continue;
    }

    const targetAssignment = crewAssign.find(a => a.roleId === roleId);
    if (!targetAssignment) {
      timingNoAssignment++;
      continue;
    }

    const earliestStart = shiftBounds.startMin + (roleWindow?.startOffsetMin ?? 0);
    const latestStart = roleWindow?.endOffsetMin != null
      ? shiftBounds.startMin + roleWindow.endOffsetMin
      : shiftBounds.endMin;

    if (latestStart <= earliestStart) {
      timingWindowInvalid++;
      continue;
    }

    if (p.met) timingMet++;
  }

  console.log('Logbook:', logbook.id);
  console.log('FIRST_HOUR -> met:', fhMet, '/', fhTotal);
  console.log('Preferred hour distribution:', Object.fromEntries(preferredHourDist));
  console.log('First assignment hour distribution:', Object.fromEntries(hourDist));
  console.log('TIMING -> met:', timingMet, '/', timingPrefs.length);
  console.log('Timing diagnostics:', { timingNoAssignment, timingTooShort, timingWindowInvalid });
}

main().finally(()=>prisma.$disconnect());
