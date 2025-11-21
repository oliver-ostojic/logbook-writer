/*
  assign_shifts_and_prefs.ts

  Goal
  - Connect to Prisma
  - Fetch all Crew
  - Assign shifts across the whole crew using approximate target percentages (largest remainder method)
  - Assign preferences (prefFirstHour, prefTask, prefBreakTiming) using approximate target percentages
  - Set reasonable weights for each preference so they affect the objective but don't dominate structural penalties
  - Update Crew rows in batches

  Assumptions
  - Time is stored as minutes from midnight
  - Crew model has: id, shiftStartMin, shiftEndMin, prefFirstHour, prefFirstHourWeight, prefTask, prefTaskWeight, prefBreakTiming, prefBreakTimingWeight
*/

import { PrismaClient, TaskType } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// ------------------------------
// Algorithm outline (plain language)
// ------------------------------
// 1) Read all crew from DB.
// 2) Define shift distribution as a list of (label, startMin, endMin, percentage).
// 3) Compute a target count of crew for each shift using largest remainder method:
//    - For each shift: raw = totalCrew * percentage
//    - base = floor(raw), fractional = raw - base
//    - Sum bases; assign remaining crew one-by-one to shifts with largest fractional parts
// 4) Shuffle the crew list and assign the first N to the first shift, next M to the second, etc.
// 5) For each preference distribution (prefFirstHour, prefTask, prefBreakTiming):
//    - Normalize the percentages if they don't sum to 100% (or 1.0)
//    - Use the same largest remainder method to compute target counts
//    - Shuffle crew (or reuse current order) and assign categories
// 6) Choose weights in a small band so they matter but don't overpower structure:
//    - prefTaskWeight: 45-55
//    - prefFirstHourWeight: 35-45
//    - prefBreakTimingWeight: 25-35
// 7) Update the DB in batches (transactions of ~100 updates each).

// ------------------------------
// Helpers
// ------------------------------

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type Portion<T> = { key: T; pct: number };

/** Normalize portions so sum of pct becomes 1.0 (proportional scaling). */
function normalizePortions<T>(items: Portion<T>[]): Portion<T>[] {
  const sum = items.reduce((a, b) => a + b.pct, 0);
  if (sum <= 0) return items.map(i => ({ ...i, pct: 0 }));
  return items.map(i => ({ key: i.key, pct: i.pct / sum }));
}

/**
 * Largest Remainder Method (Hamilton apportionment) to allocate integer counts
 * close to target proportions (pct) for a given total.
 */
function allocateCounts<T>(total: number, portions: Portion<T>[]): Array<{ key: T; count: number }>{
  const normalized = normalizePortions(portions);
  const withQuotas = normalized.map(p => {
    const raw = total * p.pct;
    const base = Math.floor(raw);
    return { key: p.key, raw, base, frac: raw - base };
  });
  let sumBase = withQuotas.reduce((a, b) => a + b.base, 0);
  let remaining = Math.max(0, total - sumBase);

  // Distribute remainders by largest fractional parts
  const sortedByFrac = [...withQuotas].sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < remaining; i++) {
    sortedByFrac[i % sortedByFrac.length].base += 1;
  }
  // Restore original order for output
  const baseMap = new Map<T, number>();
  for (const item of sortedByFrac) {
    baseMap.set(item.key, (baseMap.get(item.key) ?? 0) + item.base);
  }
  return normalized.map(p => ({ key: p.key, count: baseMap.get(p.key) ?? 0 }));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ------------------------------
// Shift distribution (minutes from midnight)
// ------------------------------

type ShiftKey =
  | '05-12'
  | '06-13'
  | '10-18'
  | '11-19'
  | '12-20'
  | '13-21'
  | '14-22'
  | '14_30-22'
  | '16-22';

type ShiftDef = { key: ShiftKey | string; startMin: number; endMin: number; pct: number };

let SHIFT_DEFS: ShiftDef[] = [
  { key: '05-12',       startMin:  5 * 60, endMin: 12 * 60, pct: 24.49 },
  { key: '06-13',       startMin:  6 * 60, endMin: 13 * 60, pct: 18.37 },
  { key: '10-18',       startMin: 10 * 60, endMin: 18 * 60, pct: 10.20 },
  { key: '11-19',       startMin: 11 * 60, endMin: 19 * 60, pct:  2.04 },
  { key: '12-20',       startMin: 12 * 60, endMin: 20 * 60, pct:  6.12 },
  { key: '13-21',       startMin: 13 * 60, endMin: 21 * 60, pct:  6.12 },
  { key: '14-22',       startMin: 14 * 60, endMin: 22 * 60, pct: 28.57 },
  { key: '14_30-22',    startMin: 14 * 60 + 30, endMin: 22 * 60, pct:  2.04 },
  { key: '16-22',       startMin: 16 * 60, endMin: 22 * 60, pct:  2.04 },
];

// Convert to portions used by allocator
let SHIFT_PORTIONS: Portion<ShiftDef>[] = SHIFT_DEFS.map(s => ({ key: s, pct: s.pct }));

// ------------------------------
// Preference distributions
// ------------------------------

// prefFirstHour: 65% PRODUCT, 35% REGISTER
let PREF_FIRST_HOUR_PORTIONS: Portion<'PRODUCT' | 'REGISTER'>[] = [
  { key: 'PRODUCT',  pct: 65 },
  { key: 'REGISTER', pct: 35 },
];

// prefTask: 85% PRODUCT, 20% REGISTER (note: sums to 105%, we normalize)
let PREF_TASK_PORTIONS: Portion<'PRODUCT' | 'REGISTER'>[] = [
  { key: 'PRODUCT',  pct: 85 },
  { key: 'REGISTER', pct: 20 },
];

// prefBreakTiming: -1 (5%), +1 (95%)
let PREF_BREAK_TIMING_PORTIONS: Portion<-1 | 1>[] = [
  { key: -1, pct: 5 },
  { key:  1, pct: 95 },
];

// Weight bands (kept modest so structure dominates in solver)
function randomPrefTaskWeight() { return randInt(45, 55); }
function randomPrefFirstHourWeight() { return randInt(35, 45); }
function randomPrefBreakTimingWeight() { return randInt(25, 35); }

// ------------------------------
// Main
// ------------------------------

function parseArgs(argv: string[]) {
  // First non-flag arg is optional config path. Support --store=ID filter.
  const out: { configPath?: string; storeId?: number } = {};
  for (const a of argv.slice(2)) {
    if (a.startsWith('--store=')) {
      const v = parseInt(a.split('=')[1], 10);
      if (!Number.isNaN(v)) out.storeId = v;
    } else if (!a.startsWith('-') && !out.configPath) {
      out.configPath = a;
    }
  }
  return out;
}

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h * 60) + (m || 0);
}

function loadConfigIfAny(configPath?: string) {
  if (!configPath) return;
  const abs = path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath);
  if (!fs.existsSync(abs)) {
    console.warn(`Config file not found at ${abs}, using defaults.`);
    return;
  }
  const raw = fs.readFileSync(abs, 'utf-8');
  const cfg = JSON.parse(raw);
  // Shifts: accept either minutes or HH:MM strings
  if (Array.isArray(cfg.shifts)) {
    SHIFT_DEFS = cfg.shifts.map((s: any, idx: number) => {
      const startMin = (typeof s.startMin === 'number') ? s.startMin : parseHHMM(String(s.start));
      const endMin   = (typeof s.endMin === 'number') ? s.endMin : parseHHMM(String(s.end));
      return {
        key: s.key || s.label || `shift_${idx}`,
        startMin,
        endMin,
        pct: Number(s.pct) || 0,
      } as ShiftDef;
    });
    SHIFT_PORTIONS = SHIFT_DEFS.map(s => ({ key: s, pct: s.pct }));
  }
  // Preferences
  if (cfg.prefFirstHour) {
    const p = cfg.prefFirstHour;
    PREF_FIRST_HOUR_PORTIONS = [
      { key: 'PRODUCT',  pct: Number(p.PRODUCT ?? p.product ?? 0) },
      { key: 'REGISTER', pct: Number(p.REGISTER ?? p.register ?? 0) },
    ];
  }
  if (cfg.prefTask) {
    const p = cfg.prefTask;
    PREF_TASK_PORTIONS = [
      { key: 'PRODUCT',  pct: Number(p.PRODUCT ?? p.product ?? 0) },
      { key: 'REGISTER', pct: Number(p.REGISTER ?? p.register ?? 0) },
    ];
  }
  if (cfg.prefBreakTiming) {
    const p = cfg.prefBreakTiming;
    PREF_BREAK_TIMING_PORTIONS = [
      { key: -1, pct: Number(p['-1'] ?? p.minus1 ?? p.earlier ?? 0) },
      { key:  1, pct: Number(p['1']  ?? p.plus1  ?? p.later   ?? 0) },
    ];
  }
}

async function main() {
  const { configPath, storeId } = parseArgs(process.argv);
  loadConfigIfAny(configPath);
  console.log('Fetching crew...');
  const crew = await prisma.crewMember.findMany({ 
    where: storeId ? { storeId } : undefined,
    orderBy: { id: 'asc' },
  });
  const N = crew.length;
  if (N === 0) {
    console.log('No crew found. Nothing to assign.');
    return;
  }
  console.log(`Crew count: ${N}${storeId ? ` (storeId=${storeId})` : ''}`);

  // 1) Allocate shift counts using largest remainder method
  const shiftAllocations = allocateCounts(N, SHIFT_PORTIONS);
  // Create a flat assignment queue of shift defs repeated by their counts
  const shiftQueue: ShiftDef[] = [];
  for (const { key: def, count } of shiftAllocations) {
    for (let i = 0; i < count; i++) shiftQueue.push(def);
  }
  // Safety: if due to rounding mismatch, adjust
  while (shiftQueue.length < N) {
    // Add one more of the largest pct shift
    const mostCommon = [...SHIFT_DEFS].sort((a,b) => b.pct - a.pct)[0];
    shiftQueue.push(mostCommon);
  }
  if (shiftQueue.length > N) shiftQueue.length = N;

  // Shuffle crew and shifts so assignment is randomized but matches counts
  const crewShuffled = shuffleInPlace([...crew]);
  const shiftsShuffled = shuffleInPlace(shiftQueue);

  // 2) Allocate preferences counts
  const firstHourAlloc = allocateCounts(N, PREF_FIRST_HOUR_PORTIONS);
  const taskAlloc      = allocateCounts(N, PREF_TASK_PORTIONS);
  const breakAlloc     = allocateCounts(N, PREF_BREAK_TIMING_PORTIONS);

  // Build assignment arrays for each preference
  const expand = <T,>(alloc: Array<{ key: T; count: number }>): T[] => {
    const arr: T[] = [];
    for (const a of alloc) for (let i = 0; i < a.count; i++) arr.push(a.key);
    return arr;
  };
  let firstHourVals = shuffleInPlace(expand(firstHourAlloc));
  let taskVals      = shuffleInPlace(expand(taskAlloc));
  let breakVals     = shuffleInPlace(expand(breakAlloc));

  // Adjust lengths if rounding mismatches occurred
  const pad = <T,>(arr: T[], fill: T) => { while (arr.length < N) arr.push(fill); if (arr.length > N) arr.length = N; };
  pad(firstHourVals, 'PRODUCT');
  pad(taskVals, 'PRODUCT');
  pad(breakVals, 1 as 1);

  // 3) Build updates per crew in order
  const updates = crewShuffled.map((c, idx) => {
    const shift = shiftsShuffled[idx];
    const prefFirstHour = firstHourVals[idx];
    const prefTask = taskVals[idx];
    const prefBreakTiming = breakVals[idx];

    return prisma.crewMember.update({
      where: { id: c.id },
      data: {
        shiftStartMin: shift.startMin,
        shiftEndMin: shift.endMin,
        prefFirstHour: prefFirstHour as TaskType,
        prefFirstHourWeight: randomPrefFirstHourWeight(),
        prefTask: prefTask as TaskType,
        prefTaskWeight: randomPrefTaskWeight(),
        prefBreakTiming,
        prefBreakTimingWeight: randomPrefBreakTimingWeight(),
      },
    });
  });

  // 4) Execute updates in batches
  const BATCH = 100;
  console.log(`Updating ${updates.length} crew in batches of ${BATCH}...`);
  for (let i = 0; i < updates.length; i += BATCH) {
    const slice = updates.slice(i, i + BATCH);
    await prisma.$transaction(slice);
    console.log(`Updated ${Math.min(i + BATCH, updates.length)} / ${updates.length}`);
  }

  // Log a summary
  const summary = new Map<string, number>();
  for (const def of SHIFT_DEFS) summary.set(def.key, 0);
  for (const s of shiftsShuffled) summary.set(s.key, (summary.get(s.key) || 0) + 1);
  console.log('\nShift assignment summary:');
  for (const def of SHIFT_DEFS) {
    const cnt = summary.get(def.key) || 0;
    const pct = ((cnt / N) * 100).toFixed(2);
    console.log(` - ${def.key} -> ${cnt} (${pct}%)`);
  }

  console.log('\nDone.');
}

main()
  .catch(err => {
    console.error('Error assigning shifts/preferences:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
