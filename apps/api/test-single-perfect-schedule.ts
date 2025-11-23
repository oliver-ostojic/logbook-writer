import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, Crew } from '@prisma/client';
import { generateScheduleOptions, formatScheduleOption, type Eligibility, type Shift as CoverageShift } from './src/services/schedule-options';

const prisma = new PrismaClient();

const STORE_ID = 768;
const SAMPLE_SIZE = 55;
const TEST_DATE = '2025-11-22';
const API_BASE = process.env.LOGBOOK_API_BASE ?? 'http://localhost:4000';

type ShiftInput = { crewId: string; start: string; end: string };
type HourlyRequirementInput = { hour: number; requiredRegister: number; requiredProduct: number; requiredParkingHelm: number };
type CoverageSelection = { roleCode: 'DEMO' | 'WINE_DEMO'; startHour: number; endHour: number; requiredCrew: number };

type SolverAssignment = { crewId: string; taskType: string; startTime: number; endTime: number };
type CrewWindow = { crew: Crew; shiftStart: number; shiftEnd: number; duration: number; startHour: number };

function minutesToTime(min: number): string {
  const hours = Math.floor(min / 60).toString().padStart(2, '0');
  const minutes = (min % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function hourToHHmm(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

function buildHourlyRequirements(sampledCrew: Crew[], storeStartMin: number, storeEndMin: number): HourlyRequirementInput[] {
  const startHour = Math.floor(storeStartMin / 60);
  const endHour = Math.ceil(storeEndMin / 60);
  const requirements: HourlyRequirementInput[] = [];

  for (let hour = startHour; hour < endHour; hour++) {
    const windowStart = hour * 60;
    const windowEnd = windowStart + 60;

    const crewInHour = sampledCrew.filter((crew) => {
      const shiftStart = crew.shiftStartMin ?? storeStartMin;
      const shiftEnd = crew.shiftEndMin ?? storeEndMin;
      return shiftStart < windowEnd && shiftEnd > windowStart;
    });

    const registerEligible = crewInHour.length;
    const requiredRegister = Math.min(Math.max(Math.floor(registerEligible * 0.2), 2), registerEligible);

    requirements.push({
      hour,
      requiredRegister,
      requiredProduct: 0,
      requiredParkingHelm: 0,
    });
  }

  return requirements;
}

async function postJSON(path: string, body: Record<string, any>) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`POST ${path} failed: ${message}`);
  }

  return response.json();
}

async function applyCoverageWindow(roleId: number, roleCode: string, selection: CoverageSelection) {
  console.log(`\nApplying coverage for ${roleCode}: ${selection.startHour}:00-${selection.endHour}:00 (need ${selection.requiredCrew}/hr)`);
  await postJSON('/wizard/coverage', {
    date: TEST_DATE,
    store_id: STORE_ID,
    role_id: roleId.toString(),
    windowStart: hourToHHmm(selection.startHour),
    windowEnd: hourToHHmm(selection.endHour),
    requiredPerHour: selection.requiredCrew,
  });
}

async function callScheduleRun(shifts: ShiftInput[]) {
  console.log('\nRunning /schedule/run to capture baseline segmentation summary...');
  const payload = await postJSON('/schedule/run', {
    date: TEST_DATE,
    store_id: STORE_ID,
    shifts,
  });
  console.log('Schedule run metrics:', payload.metrics);
  return payload;
}

async function runSolver(shifts: ShiftInput[], hourlyRequirements: HourlyRequirementInput[], coverageWindows: CoverageSelection[]) {
  const response = await fetch(`${API_BASE}/solve-logbook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: TEST_DATE,
      store_id: STORE_ID,
      shifts,
      hourly_requirements: hourlyRequirements,
      role_requirements: [],
      coverage_windows: coverageWindows.map((cw) => ({
        roleCode: cw.roleCode,
        startMin: cw.startHour * 60,
        endMin: cw.endHour * 60,
        requiredCrew: cw.requiredCrew,
      })),
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Solver request failed: ${message}`);
  }

  return response.json();
}

function calculateStats(values: number[]): { mean: number; stdDev: number; variance: number; min: number; max: number } {
  if (!values.length) return { mean: 0, stdDev: 0, variance: 0, min: 0, max: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return { mean, stdDev, variance, min: Math.min(...values), max: Math.max(...values) };
}

async function analyzePreferenceSatisfaction(crewIds: string[], assignments: SolverAssignment[]) {
  const crew = await prisma.crew.findMany({
    where: { id: { in: crewIds } },
    select: {
      id: true,
      prefFirstHour: true,
      prefTask: true,
      prefBreakTiming: true,
    },
  });

  const perCrew = crew.map((c) => {
    const crewAssignments = assignments.filter((a) => a.crewId === c.id).sort((a, b) => a.startTime - b.startTime);
    const firstAssignment = crewAssignments[0];
    const firstHourSatisfied = firstAssignment && c.prefFirstHour
      ? (c.prefFirstHour === 'PRODUCT' && firstAssignment.taskType === 'PRODUCT') ||
        (c.prefFirstHour === 'REGISTER' && firstAssignment.taskType === 'REGISTER')
      : false;

    const taskCounts = new Map<string, number>();
    crewAssignments.forEach((a) => {
      if (a.taskType !== 'MEAL_BREAK') {
        taskCounts.set(a.taskType, (taskCounts.get(a.taskType) || 0) + 1);
      }
    });
    const dominantTask = Array.from(taskCounts.entries()).reduce((a, b) => (a[1] > b[1] ? a : b), ['', 0])[0];
    const taskSatisfied = c.prefTask
      ? (c.prefTask === 'PRODUCT' && dominantTask === 'PRODUCT') ||
        (c.prefTask === 'REGISTER' && dominantTask === 'REGISTER')
      : false;

    const breakAssignment = crewAssignments.find((a) => a.taskType === 'MEAL_BREAK');
    const breakSatisfied = breakAssignment && c.prefBreakTiming !== null
      ? (c.prefBreakTiming < 0 && breakAssignment.startTime < 540) ||
        (c.prefBreakTiming > 0 && breakAssignment.startTime >= 540)
      : false;

    const totalPreferences = [c.prefFirstHour, c.prefTask, c.prefBreakTiming !== null].filter(Boolean).length;
    const totalSatisfied = [firstHourSatisfied, taskSatisfied, breakSatisfied].filter(Boolean).length;
    const satisfactionRate = totalPreferences > 0 ? totalSatisfied / totalPreferences : 0;

    return {
      crewId: c.id,
      firstHourSatisfied,
      taskSatisfied,
      breakSatisfied,
      totalSatisfied,
      totalPreferences,
      satisfactionRate,
    };
  });

  const stats = calculateStats(perCrew.map((c) => c.satisfactionRate));
  return { perCrew, stats };
}

function buildCoverageSelections(option: any): CoverageSelection[] {
  const selections: CoverageSelection[] = [];
  if (option?.demoWindow) {
    selections.push({ roleCode: 'DEMO', startHour: option.demoWindow.startHour, endHour: option.demoWindow.endHour, requiredCrew: 1 });
  }
  if (option?.wineDemoWindow) {
    selections.push({ roleCode: 'WINE_DEMO', startHour: option.wineDemoWindow.startHour, endHour: option.wineDemoWindow.endHour, requiredCrew: 1 });
  }
  return selections;
}

function buildChunkedSchedule(assignments: SolverAssignment[], sampledCrew: Crew[], slotMinutes = 30) {
  const crewWindows: CrewWindow[] = sampledCrew
    .map((crew) => {
      const shiftStart = crew.shiftStartMin ?? 480;
      const shiftEnd = crew.shiftEndMin ?? 1260;
      return {
        crew,
        shiftStart,
        shiftEnd,
        duration: Math.max(0, shiftEnd - shiftStart),
        startHour: Math.floor((crew.shiftStartMin ?? 480) / 60),
      };
    })
    .filter((entry) => entry.shiftEnd > entry.shiftStart)
    .sort((a, b) => a.shiftStart - b.shiftStart || b.duration - a.duration);

  if (!crewWindows.length) return [];

  const assignmentsByCrew = new Map<string, SolverAssignment[]>();
  assignments.forEach((assignment) => {
    if (!assignmentsByCrew.has(assignment.crewId)) assignmentsByCrew.set(assignment.crewId, []);
    assignmentsByCrew.get(assignment.crewId)!.push(assignment);
  });

  const cohorts = new Map<number, CrewWindow[]>();
  crewWindows.forEach((window) => {
    const list = cohorts.get(window.startHour) ?? [];
    list.push(window);
    cohorts.set(window.startHour, list);
  });

  const nameWidth = 20;
  const labelWidth = 5;
  const chunks: string[] = [];

  Array.from(cohorts.entries())
    .sort(([hourA], [hourB]) => hourA - hourB)
    .forEach(([hour, windows]) => {
      const cohortStart = Math.min(...windows.map((w) => w.shiftStart));
      const cohortEnd = Math.max(...windows.map((w) => w.shiftEnd));
      const slotCount = Math.ceil((cohortEnd - cohortStart) / slotMinutes);
      const slotLabels = Array.from({ length: slotCount }, (_, idx) => minutesToTime(cohortStart + idx * slotMinutes).padEnd(labelWidth, ' '));

      chunks.push(`\n== ${minutesToTime(hour * 60)} cohort (${windows.length} crew) ==`);
      chunks.push(`${'Crew'.padEnd(nameWidth)} | ${slotLabels.join(' | ')}`);

      windows.forEach(({ crew }) => {
        const slots = new Array(slotCount).fill(' '.repeat(labelWidth));
        const crewAssignments = (assignmentsByCrew.get(crew.id) || []).sort((a, b) => a.startTime - b.startTime);

        crewAssignments.forEach((assignment) => {
          for (let t = assignment.startTime; t < assignment.endTime; t += slotMinutes) {
            const idx = Math.floor((t - cohortStart) / slotMinutes);
            if (idx >= 0 && idx < slotCount) {
              const label = assignment.taskType === 'MEAL_BREAK'
                ? 'MEAL'
                : assignment.taskType.substring(0, labelWidth).toUpperCase();
              slots[idx] = label.padEnd(labelWidth, ' ');
            }
          }
        });

        chunks.push(`${crew.name.padEnd(nameWidth)} | ${slots.join(' | ')}`);
      });
    });

  return chunks;
}

function generateVisualizationHtml(assignments: SolverAssignment[], sampledCrew: Crew[]) {
  const crewWindows: CrewWindow[] = sampledCrew
    .map((crew) => {
      const shiftStart = crew.shiftStartMin ?? 480;
      const shiftEnd = crew.shiftEndMin ?? 1260;
      return {
        crew,
        shiftStart,
        shiftEnd,
        duration: Math.max(0, shiftEnd - shiftStart),
        startHour: Math.floor((crew.shiftStartMin ?? 480) / 60),
      };
    })
    .filter((entry) => entry.shiftEnd > entry.shiftStart)
    .sort((a, b) => a.shiftStart - b.shiftStart || b.duration - a.duration);

  if (!crewWindows.length) return null;

  const assignmentsByCrew = new Map<string, SolverAssignment[]>();
  assignments.forEach((assignment) => {
    if (!assignmentsByCrew.has(assignment.crewId)) assignmentsByCrew.set(assignment.crewId, []);
    assignmentsByCrew.get(assignment.crewId)!.push(assignment);
  });

  const minStart = Math.min(...crewWindows.map((c) => c.shiftStart));
  const maxEnd = Math.max(...crewWindows.map((c) => c.shiftEnd));
  const range = Math.max(1, maxEnd - minStart);
  const hourLabels = [] as string[];
  for (let mins = minStart; mins <= maxEnd; mins += 60) {
    hourLabels.push(minutesToTime(mins));
  }

  const colorMap: Record<string, string> = {
    PRODUCT: '#4CAF50',
    REGISTER: '#1976D2',
    REGIS: '#1976D2',
    PARKING: '#8D6E63',
    PARKI: '#8D6E63',
    DEMO: '#F9A825',
    WINE_DEMO: '#C2185B',
    WINE_: '#C2185B',
    FLEX: '#9E9E9E',
    MEAL_BREAK: '#FF7043',
    MEAL: '#FF7043',
  };

  const rowsHtml = crewWindows
    .map(({ crew }) => {
      const items = (assignmentsByCrew.get(crew.id) || []).sort((a, b) => a.startTime - b.startTime);
      const blocks = items
        .map((assignment) => {
          const left = ((assignment.startTime - minStart) / range) * 100;
          const width = ((assignment.endTime - assignment.startTime) / range) * 100;
          const label = assignment.taskType.replace('_', ' ');
          const color = colorMap[assignment.taskType] ?? '#607D8B';
          return `<div class="task" style="left:${left}%;width:${width}%;background:${color}" title="${label} (${minutesToTime(assignment.startTime)}-${minutesToTime(assignment.endTime)})">${label}</div>`;
        })
        .join('');
      return `<div class="row"><div class="crew-name">${crew.name}</div><div class="timeline">${blocks}</div></div>`;
    })
    .join('\n');

  const axis = hourLabels
    .map((label) => `<div class="tick"><span>${label}</span></div>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Perfect Schedule Timeline</title>
    <style>
      body { font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif; background: #0d1117; color: #f5f5f5; margin: 0; padding: 32px; }
      h1 { margin-top: 0; }
      .axis { display: grid; grid-template-columns: repeat(${hourLabels.length - 1}, 1fr); gap: 0; margin-left: 160px; border-bottom: 1px solid rgba(255,255,255,0.15); }
      .axis .tick { text-align: left; font-size: 12px; color: rgba(255,255,255,0.7); position: relative; }
      .axis .tick::after { content: ''; position: absolute; left: 0; bottom: -4px; width: 1px; height: 8px; background: rgba(255,255,255,0.2); }
      .rows { margin-top: 12px; }
      .row { display: flex; align-items: center; margin-bottom: 8px; gap: 16px; }
      .crew-name { width: 140px; text-align: right; font-size: 13px; color: rgba(255,255,255,0.85); }
      .timeline { position: relative; flex: 1; height: 32px; background: rgba(255,255,255,0.05); border-radius: 6px; overflow: hidden; }
      .task { position: absolute; top: 4px; bottom: 4px; border-radius: 4px; font-size: 11px; text-transform: capitalize; padding-left: 4px; display: flex; align-items: center; color: #0d1117; letter-spacing: 0.3px; }
      .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; font-size: 12px; }
      .legend-item { display: flex; align-items: center; gap: 6px; }
      .legend-swatch { width: 12px; height: 12px; border-radius: 3px; }
    </style>
  </head>
  <body>
    <h1>Perfect Schedule Timeline (${sampledCrew.length} crew)</h1>
    <div class="axis">${axis}</div>
    <div class="rows">${rowsHtml}</div>
    <div class="legend">
      ${Object.entries(colorMap)
        .filter(([key]) => !key.endsWith('_'))
        .map(([key, color]) => `<div class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${key.toLowerCase()}</div>`)
        .join('')}
    </div>
  </body>
</html>`;
}

function writeVisualizationFile(assignments: SolverAssignment[], sampledCrew: Crew[]) {
  const html = generateVisualizationHtml(assignments, sampledCrew);
  if (!html) return null;
  const outputPath = path.resolve(process.cwd(), 'perfect-schedule.html');
  fs.writeFileSync(outputPath, html, 'utf-8');
  return outputPath;
}

async function main() {
  console.log('🧪 Starting single perfect-schedule test...');
  const store = await prisma.store.findUnique({
    where: { id: STORE_ID },
    select: { id: true, regHoursStartMin: true, regHoursEndMin: true },
  });

  if (!store) throw new Error(`Store ${STORE_ID} not found`);

  const allCrew = await prisma.crew.findMany({
    where: { storeId: STORE_ID },
    include: { CrewRole: { include: { Role: true } } },
  });
  if (allCrew.length < SAMPLE_SIZE) throw new Error(`Not enough crew (need ${SAMPLE_SIZE}, found ${allCrew.length})`);

  shuffleInPlace(allCrew);
  const sampledCrew = allCrew.slice(0, SAMPLE_SIZE);

  console.log(`\nSampled ${SAMPLE_SIZE} crew members:`);
  sampledCrew.forEach((c, idx) => console.log(`${idx + 1}. ${c.id} - ${c.name}`));

  const shifts: ShiftInput[] = sampledCrew.map((crew) => {
    const startMin = crew.shiftStartMin ?? store.regHoursStartMin;
    const endMin = crew.shiftEndMin ?? store.regHoursEndMin;
    return { crewId: crew.id, start: minutesToTime(startMin), end: minutesToTime(endMin) };
  });

  const coverageShifts: CoverageShift[] = shifts.map((shift) => ({ ...shift }));
  const eligibilities: Eligibility[] = sampledCrew.flatMap((crew) =>
    crew.CrewRole.map((cr) => ({ crewId: crew.id, roleId: cr.roleId.toString(), roleName: cr.Role?.code ?? 'UNKNOWN' }))
  );

  const roleMap = await prisma.role.findMany({
    where: { storeId: STORE_ID, code: { in: ['DEMO', 'WINE_DEMO'] } },
  });
  const demoRole = roleMap.find((r) => r.code === 'DEMO');
  const wineRole = roleMap.find((r) => r.code === 'WINE_DEMO');
  if (!demoRole || !wineRole) throw new Error('DEMO or WINE_DEMO role not configured for store');

  const scheduleOptions = generateScheduleOptions(demoRole.id.toString(), wineRole.id.toString(), eligibilities, coverageShifts);
  if (scheduleOptions.length === 0) {
    console.warn('No valid DEMO/WINE coverage combinations found; falling back to 1-hour windows at 11:00 and 15:00');
  } else {
    console.log(`\nTop schedule option:\n${formatScheduleOption(scheduleOptions[0])}`);
  }

  const bestOption = scheduleOptions[0];
  let coverageSelections: CoverageSelection[] = buildCoverageSelections(bestOption);
  if (!coverageSelections.length) {
    coverageSelections = [{ roleCode: 'DEMO', startHour: 11, endHour: 12, requiredCrew: 1 }];
  }
  if (!coverageSelections.find((c) => c.roleCode === 'WINE_DEMO')) {
    coverageSelections.push({ roleCode: 'WINE_DEMO', startHour: 15, endHour: 16, requiredCrew: 1 });
  }

  for (const selection of coverageSelections) {
    const roleId = selection.roleCode === 'DEMO' ? demoRole.id : wineRole.id;
    await applyCoverageWindow(roleId, selection.roleCode, selection);
  }

  const hourlyRequirements = buildHourlyRequirements(sampledCrew, store.regHoursStartMin, store.regHoursEndMin);
  console.log('\nHourly requirements (REGISTER focus):');
  hourlyRequirements.forEach((hr) => console.log(`Hour ${hr.hour}: need ${hr.requiredRegister} registers`));

  await callScheduleRun(shifts);

  console.log('\nCalling solver for full logbook...');
  const solverResponse = await runSolver(shifts, hourlyRequirements, coverageSelections);
  const metadata = solverResponse.solver?.metadata;
  const assignments: SolverAssignment[] = solverResponse.solver?.assignments ?? [];

  console.log('\nSolver Outcome:');
  console.log(`Status: ${metadata?.status}`);
  console.log(`Objective Score: ${metadata?.objectiveScore}`);
  console.log(`Assignments: ${metadata?.numAssignments}`);
  if (metadata?.violations?.length) {
    console.log('Violations:');
    metadata.violations.forEach((v: string) => console.log(` - ${v}`));
  }

  if (assignments.length) {
    const preferenceResults = await analyzePreferenceSatisfaction(sampledCrew.map((c) => c.id), assignments);
    console.log('\nPreference Satisfaction Summary:');
    console.log(`Mean: ${(preferenceResults.stats.mean * 100).toFixed(1)}% | StdDev: ${(preferenceResults.stats.stdDev * 100).toFixed(1)}% | Min: ${(preferenceResults.stats.min * 100).toFixed(0)}% | Max: ${(preferenceResults.stats.max * 100).toFixed(0)}%`);

  console.log('\nShift cohorts (grouped by clock-in time):');
  const timelineRows = buildChunkedSchedule(assignments, sampledCrew);
  timelineRows.forEach((row) => console.log(row));

    const htmlPath = writeVisualizationFile(assignments, sampledCrew);
    if (htmlPath) {
      console.log(`\nInteractive visualization: file://${htmlPath}`);
    }
  } else {
    console.log('No assignments returned; cannot render logbook timeline.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });