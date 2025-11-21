import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../src/index';

const prisma = new PrismaClient();

const STORE_ID = 768;
const DATE_ISO = '2025-11-15';

// Given DEMO crew provided by the user
const DEMO_CREW = [
  { id: '1281401', name: 'Melissa Ochoa' },
  { id: '1269090', name: 'Oliver Ostojic' },
  { id: '1282186', name: 'Shushan Royer' },
  { id: '1283615', name: 'Leo Kelly' },
  { id: '1284237', name: 'Ashley Andrejko' },
  { id: '1284686', name: 'Kelly Mayo' },
  { id: '1287114', name: 'Chase Watts' },
  { id: '1289829', name: 'Leonardo Saenz-Marmol' },
  { id: '1289923', name: 'Andrea Canizares' },
  { id: '1286822', name: 'Alice De Simoni' },
];

// Utility mapping and logger to print scenario details
const NAME_BY_ID = new Map<string, string>(DEMO_CREW.map((c) => [c.id, c.name]));
const NON_DEMO_ID = '1289998';

function nameFor(id: string) {
  return NAME_BY_ID.get(id) ?? (id === NON_DEMO_ID ? 'Non Demo' : id);
}

function logScenario(
  title: string,
  shifts: Array<{ crewId: string; start: string; end: string }>,
  body: any
) {
  // Print helpful context for debugging/inspection
  console.log(`\n=== ${title} ===`);
  console.log(`Date: ${DATE_ISO} | Store: ${STORE_ID}`);
  console.log('Crew shifts:');
  for (const s of shifts) {
    console.log(`- ${nameFor(s.crewId)} (${s.crewId}): ${s.start} -> ${s.end}`);
  }
  if (body?.normalizedShifts) {
    console.log('Normalized shifts:', JSON.stringify(body.normalizedShifts));
  }
  const df = body?.demoFeasible ?? {};
  console.log('Segments:', JSON.stringify(df.segments));
  console.log('Recommended:', JSON.stringify(df.recommended));
  console.log('Availability by hour:', JSON.stringify(df.availByHour));
}

let app: Awaited<ReturnType<typeof buildServer>>;

async function seedDemo() {
  // Store
  await prisma.store.upsert({
    where: { id: STORE_ID },
    update: { name: 'Dr. Phillips' },
    create: { id: STORE_ID, name: 'Dr. Phillips' },
  });

  // Look up existing DEMO role (case-insensitive)
  const demoRole = await prisma.role.findFirst({
    where: { code: { equals: 'DEMO', mode: 'insensitive' } },
  });
  if (!demoRole) {
    throw new Error('Expected DEMO role to exist in database for wizard demo tests');
  }

  // Upsert DEMO crew and attach role
  for (const c of DEMO_CREW) {
    await prisma.crew.upsert({
      where: { id: c.id },
      update: { name: c.name, storeId: STORE_ID },
      create: { id: c.id, name: c.name, storeId: STORE_ID },
    });
    // link role if not already
    await prisma.crewRole.upsert({
      where: { crewId_roleId: { crewId: c.id, roleId: demoRole.id } },
      update: {},
      create: { crewId: c.id, roleId: demoRole.id },
    });
  }

  // A couple of hour rules for the date
  const day = new Date(DATE_ISO);
  day.setHours(0,0,0,0);
  for (const h of [9, 10, 11, 12]) {
    await prisma.hourlyRequirement.upsert({
      where: { storeId_date_hour: { storeId: STORE_ID, date: day, hour: h } },
      update: {},
      create: {
        storeId: STORE_ID,
        date: day,
        hour: h,
        requiredRegister: 1,
        requiredParkingHelm: 0,
        updatedAt: new Date(),
      },
    });
  }
}

describe('Wizard Init - DEMO feasibility', () => {
  beforeAll(async () => {
    await seedDemo();
    app = await buildServer();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('normalizes shift times to whole hours', async () => {
    const payload = {
      date: DATE_ISO,
      store_id: STORE_ID,
      shifts: [ { crewId: DEMO_CREW[0].id, start: '09:30', end: '11:45' } ],
    };
    const res = await app.inject({
      method: 'POST', url: '/wizard/init',
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('normalizes shift times to whole hours', payload.shifts, body);
    expect(body.normalizedShifts).toEqual([
      { crewId: DEMO_CREW[0].id, start: '09:00', end: '11:00' },
    ]);
  });

  it('produces one contiguous segment when availability covers 9-12 across DEMO crew', async () => {
    const A = DEMO_CREW[1].id; // 9-12
    const B = DEMO_CREW[2].id; // 10-12
    const C = DEMO_CREW[3].id; // 11-12
    const payload = {
      date: DATE_ISO, store_id: STORE_ID,
      shifts: [
        { crewId: A, start: '09:00', end: '12:00' },
        { crewId: B, start: '10:00', end: '12:00' },
        { crewId: C, start: '11:00', end: '12:00' },
      ],
    };
    const res = await app.inject({
      method: 'POST', url: '/wizard/init',
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('one contiguous segment 9-12 across DEMO crew', payload.shifts, body);
    expect(Array.isArray(body.demoFeasible.segments)).toBe(true);
    expect(body.demoFeasible.segments).toEqual([{ startHour: 9, endHour: 12 }]);
    expect(body.demoFeasible.recommended).toEqual({ startHour: 9, endHour: 12 });
    // availability should be >=1 for 9,10,11 hours
    expect(body.demoFeasible.availByHour[9]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[10]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[11]).toBeGreaterThanOrEqual(1);
  });

  it('handles disjoint segments and picks the earliest longest segment', async () => {
    const A = DEMO_CREW[4].id; // 09-10
    const B = DEMO_CREW[5].id; // 12-13
    const payload = {
      date: DATE_ISO, store_id: STORE_ID,
      shifts: [
        { crewId: A, start: '09:00', end: '10:00' },
        { crewId: B, start: '12:00', end: '13:00' },
      ],
    };
    const res = await app.inject({
      method: 'POST', url: '/wizard/init',
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('disjoint segments pick earliest longest (tie)', payload.shifts, body);
    expect(body.demoFeasible.segments).toEqual([
      { startHour: 9, endHour: 10 },
      { startHour: 12, endHour: 13 },
    ]);
    // tie on length 1 hour each, current implementation keeps the first
    expect(body.demoFeasible.recommended).toEqual({ startHour: 9, endHour: 10 });
  });

  it('returns no segments when none of the shifted crew are DEMO-eligible', async () => {
    // create a non-DEMO crew
    const nonDemoId = '1289998';
    await prisma.crew.upsert({
      where: { id: nonDemoId },
      update: { name: 'Non Demo', storeId: STORE_ID },
      create: { id: nonDemoId, name: 'Non Demo', storeId: STORE_ID },
    });

    const payload = {
      date: DATE_ISO, store_id: STORE_ID,
      shifts: [ { crewId: nonDemoId, start: '09:00', end: '11:00' } ],
    };
    const res = await app.inject({
      method: 'POST', url: '/wizard/init',
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('no segments for non-DEMO-only shifts', payload.shifts, body);
    expect(body.demoFeasible.segments.length).toBe(0);
    expect(body.demoFeasible.recommended).toBeNull();
  });

  it('includes eligibilities mapping roles for crew present in the request', async () => {
    const a = DEMO_CREW[6].id;
    const b = DEMO_CREW[7].id;
    const payload = {
      date: DATE_ISO, store_id: STORE_ID,
      shifts: [ { crewId: a, start: '09:00', end: '10:00' }, { crewId: b, start: '10:00', end: '11:00' } ],
    };
    const res = await app.inject({
      method: 'POST', url: '/wizard/init',
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('eligibilities for crew in request', payload.shifts, body);
    const elig = body.eligibilities as Array<{ crewId: string; roleName: string }>;
    // every provided crew has DEMO eligibility
    const byCrew = new Map<string, string[]>(Object.entries(
      elig.reduce((acc, e) => { (acc[e.crewId] ||= []).push(e.roleName); return acc; }, {} as Record<string,string[]>)
    ));
    expect(byCrew.get(a)).toBeTruthy();
    expect(byCrew.get(a)!.some(r => r.toUpperCase() === 'DEMO')).toBe(true);
    expect(byCrew.get(b)).toBeTruthy();
    expect(byCrew.get(b)!.some(r => r.toUpperCase() === 'DEMO')).toBe(true);
  });

  it('counts overlapping availability by hour (two DEMO crew on the same hour)', async () => {
    const a = DEMO_CREW[8].id; // 10-12
    const b = DEMO_CREW[9].id; // 10-11
    const payload = {
      date: DATE_ISO, store_id: STORE_ID,
      shifts: [
        { crewId: a, start: '10:00', end: '12:00' },
        { crewId: b, start: '10:00', end: '11:00' },
      ],
    };
    const res = await app.inject({
      method: 'POST', url: '/wizard/init',
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('overlap counts (two on 10-11)', payload.shifts, body);
    expect(body.demoFeasible.availByHour[10]).toBeGreaterThanOrEqual(2);
    expect(body.demoFeasible.availByHour[11]).toBeGreaterThanOrEqual(1);
  });

  it('supports all-day availability (00:00-24:00) and returns one full-day segment', async () => {
    const id = DEMO_CREW[0].id;
    const payload = {
      date: DATE_ISO, store_id: STORE_ID,
      shifts: [ { crewId: id, start: '00:00', end: '24:00' } ],
    };
    const res = await app.inject({
      method: 'POST', url: '/wizard/init',
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('all-day availability (00-24)', payload.shifts, body);
    expect(body.demoFeasible.segments).toEqual([{ startHour: 0, endHour: 24 }]);
    expect(body.demoFeasible.recommended).toEqual({ startHour: 0, endHour: 24 });
    expect(body.demoFeasible.availByHour[0]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[23]).toBeGreaterThanOrEqual(1);
  });

  it('returns empty availability when shifts array is empty', async () => {
    const payload = { date: DATE_ISO, store_id: STORE_ID, shifts: [] };
    const res = await app.inject({
      method: 'POST', url: '/wizard/init',
      payload: payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('empty shifts yields empty availability', payload.shifts, body);
    expect(body.demoFeasible.segments.length).toBe(0);
    expect(body.demoFeasible.recommended).toBeNull();
    expect(body.demoFeasible.availByHour.every((n: number) => n === 0)).toBe(true);
  });

  it('normalizes and clamps invalid times to legal bounds (25:00-26:00 -> 23:00-24:00)', async () => {
    const id = DEMO_CREW[1].id;
    const payload = {
      date: DATE_ISO, store_id: STORE_ID,
      shifts: [ { crewId: id, start: '25:00', end: '26:00' } ],
    };
    const res = await app.inject({
      method: 'POST', url: '/wizard/init',
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('invalid times clamped to 23-24', payload.shifts, body);
    expect(body.normalizedShifts).toEqual([
      { crewId: id, start: '23:00', end: '24:00' },
    ]);
    // availability at 23 should be at least 1
    expect(body.demoFeasible.availByHour[23]).toBeGreaterThanOrEqual(1);
  });

  it('ignores non-DEMO crew when mixed with DEMO shifts in the same payload', async () => {
    // Ensure a non-DEMO role and crew with that role exist
    const nonDemoRole = await prisma.role.upsert({
      where: { code: 'OrderWriter' },
      update: {},
      create: { code: 'OrderWriter', displayName: 'Order Writer' },
    });
    const nonDemoId = '1289998';
    await prisma.crew.upsert({
      where: { id: nonDemoId },
      update: { name: 'Non Demo', storeId: STORE_ID },
      create: { id: nonDemoId, name: 'Non Demo', storeId: STORE_ID },
    });
    await prisma.crewRole.upsert({
      where: { crewId_roleId: { crewId: nonDemoId, roleId: nonDemoRole.id } },
      update: {},
      create: { crewId: nonDemoId, roleId: nonDemoRole.id },
    });

    const demoId = DEMO_CREW[1].id; // 09-11
    const payload = {
      date: DATE_ISO, store_id: STORE_ID,
      shifts: [
        { crewId: demoId, start: '09:00', end: '11:00' },
        { crewId: nonDemoId, start: '09:00', end: '12:00' },
      ],
    };
    const res = await app.inject({
      method: 'POST', url: '/wizard/init',
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('mixed DEMO and non-DEMO shifts', payload.shifts, body);
    // Non-DEMO crew should not contribute; segment ends at 11:00
    expect(body.demoFeasible.segments).toEqual([{ startHour: 9, endHour: 11 }]);
    expect(body.demoFeasible.availByHour[9]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[10]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[11]).toBe(0);
  });

  it('reports exact availability counts when 3 DEMO crew overlap on the same hour', async () => {
    const a = DEMO_CREW[0].id;
    const b = DEMO_CREW[1].id;
    const c = DEMO_CREW[2].id;
    const payload = {
      date: DATE_ISO, store_id: STORE_ID,
      shifts: [
        { crewId: a, start: '10:00', end: '11:00' },
        { crewId: b, start: '10:00', end: '11:00' },
        { crewId: c, start: '10:00', end: '11:00' },
      ],
    };
    const res = await app.inject({
      method: 'POST', url: '/wizard/init',
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('exact availability count (3 overlapping at 10)', payload.shifts, body);
    expect(body.demoFeasible.segments).toEqual([{ startHour: 10, endHour: 11 }]);
    expect(body.demoFeasible.availByHour[10]).toBe(3);
  });

  it('recommends the longest segment even if it starts later', async () => {
    const a = DEMO_CREW[3].id; // 09-10 (1 hour)
    const b = DEMO_CREW[4].id; // 12-14 (2 hours)
    const payload = {
      date: DATE_ISO, store_id: STORE_ID,
      shifts: [
        { crewId: a, start: '09:00', end: '10:00' },
        { crewId: b, start: '12:00', end: '14:00' },
      ],
    };
    const res = await app.inject({
      method: 'POST', url: '/wizard/init',
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('longest segment recommended (later)', payload.shifts, body);
    expect(body.demoFeasible.segments).toEqual([
      { startHour: 9, endHour: 10 },
      { startHour: 12, endHour: 14 },
    ]);
    expect(body.demoFeasible.recommended).toEqual({ startHour: 12, endHour: 14 });
  });

  it('uses all DEMO crew with realistic 8-hour shifts within store hours (08:00-21:00)', async () => {
    // Build 8-hour shifts entirely within 08-21 store hours, using all DEMO crew
    const shifts = [
      { crewId: DEMO_CREW[0].id, start: '08:00', end: '16:00' }, // 8-16
      { crewId: DEMO_CREW[1].id, start: '08:00', end: '16:00' }, // 8-16
      { crewId: DEMO_CREW[2].id, start: '09:00', end: '17:00' }, // 9-17
      { crewId: DEMO_CREW[3].id, start: '09:00', end: '17:00' }, // 9-17
      { crewId: DEMO_CREW[4].id, start: '10:00', end: '18:00' }, // 10-18
      { crewId: DEMO_CREW[5].id, start: '11:00', end: '19:00' }, // 11-19
      { crewId: DEMO_CREW[6].id, start: '12:00', end: '20:00' }, // 12-20
      { crewId: DEMO_CREW[7].id, start: '13:00', end: '21:00' }, // 13-21
      { crewId: DEMO_CREW[8].id, start: '13:00', end: '21:00' }, // 13-21
      { crewId: DEMO_CREW[9].id, start: '12:00', end: '20:00' }, // 12-20
    ];

    const payload = { date: DATE_ISO, store_id: STORE_ID, shifts };
    const res = await app.inject({ method: 'POST', url: '/wizard/init', payload });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('all DEMO crew with 8-hour shifts (08-21 coverage)', payload.shifts, body);

    // Expect a single continuous feasible segment from 08 to 21
    expect(body.demoFeasible.segments).toEqual([{ startHour: 8, endHour: 21 }]);
    expect(body.demoFeasible.recommended).toEqual({ startHour: 8, endHour: 21 });

    // Boundary checks: outside hours 7 and 21 should be 0; edges should be >=1
    expect(body.demoFeasible.availByHour[7]).toBe(0);
    expect(body.demoFeasible.availByHour[8]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[20]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[21]).toBe(0);

    // A couple of representative overlaps in the middle of the day
    // 10:00 should have at least those started at 08, 09, 10
    expect(body.demoFeasible.availByHour[10]).toBeGreaterThanOrEqual(3);
    // 13:00 should be near a peak due to many overlapping (09-17, 10-18, 11-19, 12-20, 13-21 x2)
    expect(body.demoFeasible.availByHour[13]).toBeGreaterThanOrEqual(6);
  });

  it('uses all DEMO crew with chunked 8-hour shifts (08-16 x4, 10-18 x3, 12-20 x3)', async () => {
    // Groups start together to create step-changes in availability
    const shifts = [
      // 08-16 (4 crew)
      { crewId: DEMO_CREW[0].id, start: '08:00', end: '16:00' },
      { crewId: DEMO_CREW[1].id, start: '08:00', end: '16:00' },
      { crewId: DEMO_CREW[2].id, start: '08:00', end: '16:00' },
      { crewId: DEMO_CREW[3].id, start: '08:00', end: '16:00' },
      // 10-18 (3 crew)
      { crewId: DEMO_CREW[4].id, start: '10:00', end: '18:00' },
      { crewId: DEMO_CREW[5].id, start: '10:00', end: '18:00' },
      { crewId: DEMO_CREW[6].id, start: '10:00', end: '18:00' },
      // 12-20 (3 crew)
      { crewId: DEMO_CREW[7].id, start: '12:00', end: '20:00' },
      { crewId: DEMO_CREW[8].id, start: '12:00', end: '20:00' },
      { crewId: DEMO_CREW[9].id, start: '12:00', end: '20:00' },
    ];

    const payload = { date: DATE_ISO, store_id: STORE_ID, shifts };
    const res = await app.inject({ method: 'POST', url: '/wizard/init', payload });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('chunked 8-hour shifts (groups at 08,10,12)', payload.shifts, body);

    // Continuous coverage from 08 to 20
    expect(body.demoFeasible.segments).toEqual([{ startHour: 8, endHour: 20 }]);
    expect(body.demoFeasible.recommended).toEqual({ startHour: 8, endHour: 20 });

    // Step checks: 8 >= 4, 10 >= 7, 12 >= 10, tailing off later
    expect(body.demoFeasible.availByHour[8]).toBeGreaterThanOrEqual(4);
    expect(body.demoFeasible.availByHour[10]).toBeGreaterThanOrEqual(7);
    expect(body.demoFeasible.availByHour[12]).toBeGreaterThanOrEqual(10);
    expect(body.demoFeasible.availByHour[19]).toBeGreaterThanOrEqual(3);
    expect(body.demoFeasible.availByHour[20]).toBe(0);
  });

  it('uses all DEMO crew with left-leaning 8-hour shifts (more morning coverage)', async () => {
    // Heavily weighted to earlier starts; coverage ends earlier
    const shifts = [
      // 08-16 (6 crew)
      { crewId: DEMO_CREW[0].id, start: '08:00', end: '16:00' },
      { crewId: DEMO_CREW[1].id, start: '08:00', end: '16:00' },
      { crewId: DEMO_CREW[2].id, start: '08:00', end: '16:00' },
      { crewId: DEMO_CREW[3].id, start: '08:00', end: '16:00' },
      { crewId: DEMO_CREW[4].id, start: '08:00', end: '16:00' },
      { crewId: DEMO_CREW[5].id, start: '08:00', end: '16:00' },
      // 09-17 (4 crew)
      { crewId: DEMO_CREW[6].id, start: '09:00', end: '17:00' },
      { crewId: DEMO_CREW[7].id, start: '09:00', end: '17:00' },
      { crewId: DEMO_CREW[8].id, start: '09:00', end: '17:00' },
      { crewId: DEMO_CREW[9].id, start: '09:00', end: '17:00' },
    ];

    const payload = { date: DATE_ISO, store_id: STORE_ID, shifts };
    const res = await app.inject({ method: 'POST', url: '/wizard/init', payload });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('left-leaning 8-hour shifts (morning-heavy)', payload.shifts, body);

    // Continuous coverage from 08 to 17
    expect(body.demoFeasible.segments).toEqual([{ startHour: 8, endHour: 17 }]);
    expect(body.demoFeasible.recommended).toEqual({ startHour: 8, endHour: 17 });

    // Peak overlap around 09-15 should be high (10 at 09..15)
    expect(body.demoFeasible.availByHour[9]).toBeGreaterThanOrEqual(10);
    expect(body.demoFeasible.availByHour[15]).toBeGreaterThanOrEqual(10);
    // Tapering towards the end
    expect(body.demoFeasible.availByHour[16]).toBeGreaterThanOrEqual(4);
    expect(body.demoFeasible.availByHour[17]).toBe(0);
  });

  it('uses all DEMO crew with right-leaning 8-hour shifts (more evening coverage)', async () => {
    // Heavily weighted to later starts; coverage begins later and extends to close
    const shifts = [
      // 12-20 (4 crew)
      { crewId: DEMO_CREW[0].id, start: '12:00', end: '20:00' },
      { crewId: DEMO_CREW[1].id, start: '12:00', end: '20:00' },
      { crewId: DEMO_CREW[2].id, start: '12:00', end: '20:00' },
      { crewId: DEMO_CREW[3].id, start: '12:00', end: '20:00' },
      // 13-21 (6 crew)
      { crewId: DEMO_CREW[4].id, start: '13:00', end: '21:00' },
      { crewId: DEMO_CREW[5].id, start: '13:00', end: '21:00' },
      { crewId: DEMO_CREW[6].id, start: '13:00', end: '21:00' },
      { crewId: DEMO_CREW[7].id, start: '13:00', end: '21:00' },
      { crewId: DEMO_CREW[8].id, start: '13:00', end: '21:00' },
      { crewId: DEMO_CREW[9].id, start: '13:00', end: '21:00' },
    ];

    const payload = { date: DATE_ISO, store_id: STORE_ID, shifts };
    const res = await app.inject({ method: 'POST', url: '/wizard/init', payload });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('right-leaning 8-hour shifts (evening-heavy)', payload.shifts, body);

    // Continuous coverage from 12 to 21
    expect(body.demoFeasible.segments).toEqual([{ startHour: 12, endHour: 21 }]);
    expect(body.demoFeasible.recommended).toEqual({ startHour: 12, endHour: 21 });

    // Early boundary should be empty; ramp up later
    expect(body.demoFeasible.availByHour[11]).toBe(0);
    expect(body.demoFeasible.availByHour[12]).toBeGreaterThanOrEqual(4);
    expect(body.demoFeasible.availByHour[13]).toBeGreaterThanOrEqual(10);
    expect(body.demoFeasible.availByHour[20]).toBeGreaterThanOrEqual(6);
    expect(body.demoFeasible.availByHour[21]).toBe(0);
  });

  it('uses all DEMO crew with a morning gap (no 08:00 starts) resulting in coverage 09:00-21:00', async () => {
    // No one starts at 08:00; earliest start is 09:00
    const shifts = [
      // 09-17 (3 crew)
      { crewId: DEMO_CREW[0].id, start: '09:00', end: '17:00' },
      { crewId: DEMO_CREW[1].id, start: '09:00', end: '17:00' },
      { crewId: DEMO_CREW[2].id, start: '09:00', end: '17:00' },
      // 10-18 (3 crew)
      { crewId: DEMO_CREW[3].id, start: '10:00', end: '18:00' },
      { crewId: DEMO_CREW[4].id, start: '10:00', end: '18:00' },
      { crewId: DEMO_CREW[5].id, start: '10:00', end: '18:00' },
      // 11-19 (2 crew)
      { crewId: DEMO_CREW[6].id, start: '11:00', end: '19:00' },
      { crewId: DEMO_CREW[7].id, start: '11:00', end: '19:00' },
      // 13-21 (2 crew)
      { crewId: DEMO_CREW[8].id, start: '13:00', end: '21:00' },
      { crewId: DEMO_CREW[9].id, start: '13:00', end: '21:00' },
    ];

    const payload = { date: DATE_ISO, store_id: STORE_ID, shifts };
    const res = await app.inject({ method: 'POST', url: '/wizard/init', payload });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('morning gap (no 08:00 starts) -> segment 09-21', payload.shifts, body);

    expect(body.demoFeasible.segments).toEqual([{ startHour: 9, endHour: 21 }]);
    expect(body.demoFeasible.recommended).toEqual({ startHour: 9, endHour: 21 });
    expect(body.demoFeasible.availByHour[8]).toBe(0);
    expect(body.demoFeasible.availByHour[9]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[20]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[21]).toBe(0);
  });

  it('uses all DEMO crew with an evening gap (no 13:00 starts) resulting in coverage 08:00-20:00', async () => {
    // No one starts at 13:00; latest start is 12:00 so last end is 20:00
    const shifts = [
      // 08-16 (4 crew)
      { crewId: DEMO_CREW[0].id, start: '08:00', end: '16:00' },
      { crewId: DEMO_CREW[1].id, start: '08:00', end: '16:00' },
      { crewId: DEMO_CREW[2].id, start: '08:00', end: '16:00' },
      { crewId: DEMO_CREW[3].id, start: '08:00', end: '16:00' },
      // 10-18 (3 crew)
      { crewId: DEMO_CREW[4].id, start: '10:00', end: '18:00' },
      { crewId: DEMO_CREW[5].id, start: '10:00', end: '18:00' },
      { crewId: DEMO_CREW[6].id, start: '10:00', end: '18:00' },
      // 12-20 (3 crew)
      { crewId: DEMO_CREW[7].id, start: '12:00', end: '20:00' },
      { crewId: DEMO_CREW[8].id, start: '12:00', end: '20:00' },
      { crewId: DEMO_CREW[9].id, start: '12:00', end: '20:00' },
    ];

    const payload = { date: DATE_ISO, store_id: STORE_ID, shifts };
    const res = await app.inject({ method: 'POST', url: '/wizard/init', payload });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('evening gap (no 13:00 starts) -> segment 08-20', payload.shifts, body);

    expect(body.demoFeasible.segments).toEqual([{ startHour: 8, endHour: 20 }]);
    expect(body.demoFeasible.recommended).toEqual({ startHour: 8, endHour: 20 });
    expect(body.demoFeasible.availByHour[8]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[19]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[20]).toBe(0);
  });

  it('uses all DEMO crew with both morning and evening gaps (no 08:00 or 13:00 starts) -> segment 09:00-20:00', async () => {
    // No 08:00 and no 13:00 start shifts
    const shifts = [
      // 09-17 (4 crew)
      { crewId: DEMO_CREW[0].id, start: '09:00', end: '17:00' },
      { crewId: DEMO_CREW[1].id, start: '09:00', end: '17:00' },
      { crewId: DEMO_CREW[2].id, start: '09:00', end: '17:00' },
      { crewId: DEMO_CREW[3].id, start: '09:00', end: '17:00' },
      // 10-18 (3 crew)
      { crewId: DEMO_CREW[4].id, start: '10:00', end: '18:00' },
      { crewId: DEMO_CREW[5].id, start: '10:00', end: '18:00' },
      { crewId: DEMO_CREW[6].id, start: '10:00', end: '18:00' },
      // 12-20 (3 crew)
      { crewId: DEMO_CREW[7].id, start: '12:00', end: '20:00' },
      { crewId: DEMO_CREW[8].id, start: '12:00', end: '20:00' },
      { crewId: DEMO_CREW[9].id, start: '12:00', end: '20:00' },
    ];

    const payload = { date: DATE_ISO, store_id: STORE_ID, shifts };
    const res = await app.inject({ method: 'POST', url: '/wizard/init', payload });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('both edges gapped (no 08:00 or 13:00) -> segment 09-20', payload.shifts, body);

    expect(body.demoFeasible.segments).toEqual([{ startHour: 9, endHour: 20 }]);
    expect(body.demoFeasible.recommended).toEqual({ startHour: 9, endHour: 20 });
    expect(body.demoFeasible.availByHour[8]).toBe(0);
    expect(body.demoFeasible.availByHour[9]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[19]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[20]).toBe(0);
  });

  it('uses all DEMO crew with 5-hour morning shifts (08:00-13:00) creating afternoon gap', async () => {
    // All crew work morning only; no afternoon coverage
    const shifts = [
      { crewId: DEMO_CREW[0].id, start: '08:00', end: '13:00' },
      { crewId: DEMO_CREW[1].id, start: '08:00', end: '13:00' },
      { crewId: DEMO_CREW[2].id, start: '08:00', end: '13:00' },
      { crewId: DEMO_CREW[3].id, start: '09:00', end: '14:00' },
      { crewId: DEMO_CREW[4].id, start: '09:00', end: '14:00' },
      { crewId: DEMO_CREW[5].id, start: '09:00', end: '14:00' },
      { crewId: DEMO_CREW[6].id, start: '10:00', end: '15:00' },
      { crewId: DEMO_CREW[7].id, start: '10:00', end: '15:00' },
      { crewId: DEMO_CREW[8].id, start: '11:00', end: '16:00' },
      { crewId: DEMO_CREW[9].id, start: '11:00', end: '16:00' },
    ];

    const payload = { date: DATE_ISO, store_id: STORE_ID, shifts };
    const res = await app.inject({ method: 'POST', url: '/wizard/init', payload });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('5-hour morning shifts (08-16) -> single segment', payload.shifts, body);

    expect(body.demoFeasible.segments).toEqual([{ startHour: 8, endHour: 16 }]);
    expect(body.demoFeasible.recommended).toEqual({ startHour: 8, endHour: 16 });
    expect(body.demoFeasible.availByHour[7]).toBe(0);
    expect(body.demoFeasible.availByHour[8]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[15]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[16]).toBe(0);
  });

  it('uses all DEMO crew with 5-hour evening shifts (16:00-21:00) creating morning gap', async () => {
    // All crew work evening only; no morning coverage
    const shifts = [
      { crewId: DEMO_CREW[0].id, start: '16:00', end: '21:00' },
      { crewId: DEMO_CREW[1].id, start: '16:00', end: '21:00' },
      { crewId: DEMO_CREW[2].id, start: '16:00', end: '21:00' },
      { crewId: DEMO_CREW[3].id, start: '15:00', end: '20:00' },
      { crewId: DEMO_CREW[4].id, start: '15:00', end: '20:00' },
      { crewId: DEMO_CREW[5].id, start: '15:00', end: '20:00' },
      { crewId: DEMO_CREW[6].id, start: '14:00', end: '19:00' },
      { crewId: DEMO_CREW[7].id, start: '14:00', end: '19:00' },
      { crewId: DEMO_CREW[8].id, start: '13:00', end: '18:00' },
      { crewId: DEMO_CREW[9].id, start: '13:00', end: '18:00' },
    ];

    const payload = { date: DATE_ISO, store_id: STORE_ID, shifts };
    const res = await app.inject({ method: 'POST', url: '/wizard/init', payload });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('5-hour evening shifts (13-21) -> single segment', payload.shifts, body);

    expect(body.demoFeasible.segments).toEqual([{ startHour: 13, endHour: 21 }]);
    expect(body.demoFeasible.recommended).toEqual({ startHour: 13, endHour: 21 });
    expect(body.demoFeasible.availByHour[12]).toBe(0);
    expect(body.demoFeasible.availByHour[13]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[20]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[21]).toBe(0);
  });

  it('uses all DEMO crew with split 5-hour shifts (08-13 and 16-21) creating midday gap -> two segments', async () => {
    // Half crew work morning, half work evening; midday gap 13-16
    const shifts = [
      // Morning crew (5 crew: 08-13)
      { crewId: DEMO_CREW[0].id, start: '08:00', end: '13:00' },
      { crewId: DEMO_CREW[1].id, start: '08:00', end: '13:00' },
      { crewId: DEMO_CREW[2].id, start: '08:00', end: '13:00' },
      { crewId: DEMO_CREW[3].id, start: '09:00', end: '14:00' },
      { crewId: DEMO_CREW[4].id, start: '09:00', end: '14:00' },
      // Evening crew (5 crew: 15-20 and 16-21)
      { crewId: DEMO_CREW[5].id, start: '15:00', end: '20:00' },
      { crewId: DEMO_CREW[6].id, start: '15:00', end: '20:00' },
      { crewId: DEMO_CREW[7].id, start: '16:00', end: '21:00' },
      { crewId: DEMO_CREW[8].id, start: '16:00', end: '21:00' },
      { crewId: DEMO_CREW[9].id, start: '16:00', end: '21:00' },
    ];

    const payload = { date: DATE_ISO, store_id: STORE_ID, shifts };
    const res = await app.inject({ method: 'POST', url: '/wizard/init', payload });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    logScenario('split 5-hour shifts (morning + evening) -> TWO segments', payload.shifts, body);

    // Expect two distinct segments with a gap in between
    expect(body.demoFeasible.segments).toEqual([
      { startHour: 8, endHour: 14 },
      { startHour: 15, endHour: 21 },
    ]);
    // Recommended should be the longest (both are same length, so first by tie-break)
    expect(body.demoFeasible.recommended).toEqual({ startHour: 8, endHour: 14 });

    // Boundary checks: gap at 14-15
    expect(body.demoFeasible.availByHour[13]).toBeGreaterThanOrEqual(1);
    expect(body.demoFeasible.availByHour[14]).toBe(0);
    expect(body.demoFeasible.availByHour[15]).toBeGreaterThanOrEqual(1);
  });
});
