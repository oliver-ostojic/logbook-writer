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
  const { breakWindowStart, breakWindowEnd, reqShiftLengthForBreak } = store;

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

  const breakRoleIds = new Set<number>();
  const breakRoles = await prisma.role.findMany({
    where: { storeId: store.id, code: { in: ['BREAK', 'MEAL_BREAK'] } },
    select: { id: true },
  });
  breakRoles.forEach(r => breakRoleIds.add(r.id));

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

  let timingMet = 0;
  let timingNoBreak = 0;
  let timingTooShort = 0;
  let timingWindowInvalid = 0;

  for (const p of timingPrefs) {
    const crewAssign = (byCrew.get(p.crewId) || []).sort((a,b)=>+a.startTime-+b.startTime);
    if (crewAssign.length === 0) continue;
    const shiftStart = +crewAssign[0].startTime;
    const shiftEnd = +crewAssign[crewAssign.length-1].endTime;
    const shiftLenMin = (shiftEnd - shiftStart) / (60*1000);
    if (shiftLenMin < reqShiftLengthForBreak) timingTooShort++;
  const breakAssign = crewAssign.find(a => breakRoleIds.has(a.roleId));
  if (!breakAssign) timingNoBreak++;
    const eStart = shiftStart + breakWindowStart*60*1000;
    const lStart = shiftStart + breakWindowEnd*60*1000;
    if (lStart <= eStart) timingWindowInvalid++;
    if (p.met) timingMet++;
  }

  console.log('Logbook:', logbook.id);
  console.log('FIRST_HOUR -> met:', fhMet, '/', fhTotal);
  console.log('Preferred hour distribution:', Object.fromEntries(preferredHourDist));
  console.log('First assignment hour distribution:', Object.fromEntries(hourDist));
  console.log('TIMING -> met:', timingMet, '/', timingPrefs.length);
  console.log('Timing diagnostics:', { timingNoBreak, timingTooShort, timingWindowInvalid });
  console.log('Store break config:', { breakWindowStart, breakWindowEnd, reqShiftLengthForBreak });
}

main().finally(()=>prisma.$disconnect());
