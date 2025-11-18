/**
 * Test script to verify window-finding logic with specific crew
 * Run with: npx tsx test-window-finding.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Shift = {
  crewId: string;
  crewName: string;
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
};

type Eligibility = {
  crewId: string;
  roleId: string;
  roleName: string;
};

function parseHour(hhmm: string): number {
  const [h] = hhmm.split(':').map(Number);
  return h;
}

function buildAvailability(
  roleId: string,
  eligibilities: Eligibility[],
  shifts: Shift[]
): number[] {
  const avail = new Array(24).fill(0);
  
  const eligibleCrewIds = new Set(
    eligibilities.filter(e => e.roleId === roleId).map(e => e.crewId)
  );
  
  for (const shift of shifts) {
    if (!eligibleCrewIds.has(shift.crewId)) continue;
    
    const startHour = parseHour(shift.start);
    const endHour = parseHour(shift.end);
    
    for (let h = startHour; h < endHour; h++) {
      avail[h]++;
    }
  }
  
  return avail;
}

/**
 * Build a map of which crew are working at each hour
 */
function buildCrewByHour(
  roleId: string,
  eligibilities: Eligibility[],
  shifts: Shift[]
): Map<number, Set<string>> {
  const crewByHour = new Map<number, Set<string>>();
  
  const eligibleCrewIds = new Set(
    eligibilities.filter(e => e.roleId === roleId).map(e => e.crewId)
  );
  
  for (let h = 0; h < 24; h++) {
    crewByHour.set(h, new Set());
  }
  
  for (const shift of shifts) {
    if (!eligibleCrewIds.has(shift.crewId)) continue;
    
    const startHour = parseHour(shift.start);
    const endHour = parseHour(shift.end);
    
    for (let h = startHour; h < endHour; h++) {
      crewByHour.get(h)!.add(shift.crewId);
    }
  }
  
  return crewByHour;
}

/**
 * Find longest contiguous windows where we can assign different crew to consecutive hours
 * CONSTRAINT: Each crew can only work 1 hour total (across the entire window)
 * So we need as many different crew as hours in the window
 */
function findLongestWindows(
  availByHour: number[],
  roleId: string,
  eligibilities: Eligibility[],
  shifts: Shift[]
): Array<{ startHour: number; endHour: number; length: number }> {
  const windows: Array<{ startHour: number; endHour: number; length: number }> = [];
  let maxLength = 0;
  
  // Get which crew are available at each hour
  const crewByHour = buildCrewByHour(roleId, eligibilities, shifts);
  
  // Try all possible contiguous segments
  for (let start = 0; start < 24; start++) {
    if (availByHour[start] === 0) continue;
    
    // Extend as far as possible while we have enough unique crew
    for (let end = start + 1; end <= 24; end++) {
      // Count unique crew available across [start, end)
      const uniqueCrew = new Set<string>();
      for (let h = start; h < end; h++) {
        crewByHour.get(h)!.forEach(crewId => uniqueCrew.add(crewId));
      }
      
      const windowLength = end - start;
      const crewCount = uniqueCrew.size;
      
      // We can only have a window as long as we have unique crew
      // (each crew can work max 1 hour)
      if (crewCount < windowLength) {
        break; // Can't extend further from this start
      }
      
      // Check if all hours have at least 1 crew
      let allHoursCovered = true;
      for (let h = start; h < end; h++) {
        if (availByHour[h] === 0) {
          allHoursCovered = false;
          break;
        }
      }
      
      if (!allHoursCovered) {
        break;
      }
      
      // This is a valid window
      if (windowLength > maxLength) {
        maxLength = windowLength;
        windows.length = 0;
        windows.push({ startHour: start, endHour: end, length: windowLength });
      } else if (windowLength === maxLength) {
        windows.push({ startHour: start, endHour: end, length: windowLength });
      }
    }
  }
  
  return windows;
}

function printAvailability(roleName: string, avail: number[], shifts: Shift[], eligibilities: Eligibility[], roleId: string) {
  console.log(`\n${roleName} Availability by Hour:`);
  
  const eligibleCrewIds = eligibilities.filter(e => e.roleId === roleId).map(e => e.crewId);
  const eligibleShifts = shifts.filter(s => eligibleCrewIds.includes(s.crewId));
  console.log(`Eligible crew (${eligibleShifts.length}):`);
  eligibleShifts.forEach(s => {
    console.log(`  ${s.crewName}: ${s.start}-${s.end}`);
  });
  
  console.log('\nHour: ' + Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, ' ')).join(' '));
  console.log('Crew: ' + avail.map(n => n.toString().padStart(2, ' ')).join(' '));
  
  const bars = avail.map(n => n > 0 ? '█'.repeat(Math.min(n, 5)) : '·');
  console.log('      ' + bars.map(b => b.padStart(2, ' ')).join(' '));
}

function runTest(testName: string, shifts: Shift[], eligibilities: Eligibility[], demoRoleId: string, wineDemoRoleId: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`TEST: ${testName}`);
  console.log('='.repeat(80));
  
  console.log('\nShifts:');
  shifts.forEach(s => {
    console.log(`  ${s.crewName.padEnd(20)} ${s.start}-${s.end}`);
  });
  
  console.log('\n' + '-'.repeat(80));
  console.log('DEMO ROLE ANALYSIS');
  console.log('-'.repeat(80));
  const demoAvail = buildAvailability(demoRoleId, eligibilities, shifts);
  printAvailability('DEMO', demoAvail, shifts, eligibilities, demoRoleId);
  
  const demoWindows = findLongestWindows(demoAvail, demoRoleId, eligibilities, shifts);
  console.log(`\nLongest DEMO windows (${demoWindows.length} found):`);
  demoWindows.forEach(w => {
    console.log(`  ${w.startHour}:00 - ${w.endHour}:00 (${w.length} hours)`);
  });
  
  console.log('\n' + '-'.repeat(80));
  console.log('WINE_DEMO ROLE ANALYSIS');
  console.log('-'.repeat(80));
  const wineDemoAvail = buildAvailability(wineDemoRoleId, eligibilities, shifts);
  printAvailability('WINE_DEMO', wineDemoAvail, shifts, eligibilities, wineDemoRoleId);
  
  const wineDemoWindows = findLongestWindows(wineDemoAvail, wineDemoRoleId, eligibilities, shifts);
  console.log(`\nLongest WINE_DEMO windows (${wineDemoWindows.length} found):`);
  wineDemoWindows.forEach(w => {
    console.log(`  ${w.startHour}:00 - ${w.endHour}:00 (${w.length} hours)`);
  });
  
  console.log('\n' + '-'.repeat(80));
  console.log('SUMMARY');
  console.log('-'.repeat(80));
  console.log(`DEMO: ${demoWindows.length} window(s) of ${demoWindows[0]?.length || 0} hours each`);
  console.log(`WINE_DEMO: ${wineDemoWindows.length} window(s) of ${wineDemoWindows[0]?.length || 0} hours each`);
}

async function main() {
  console.log('=== Window Finding Comprehensive Test ===\n');
  
  const roles = await prisma.role.findMany({
    where: { name: { in: ['DEMO', 'WINE_DEMO'] } },
  });
  
  const demoRole = roles.find(r => r.name === 'DEMO');
  const wineDemoRole = roles.find(r => r.name === 'WINE_DEMO');
  
  if (!demoRole || !wineDemoRole) {
    console.error('DEMO or WINE_DEMO role not found');
    return;
  }
  
  const crewNames = ['Chase', 'Di', 'Oliver', 'Melissa', 'Ashley', 'Abigail'];
  const crew = await prisma.crewMember.findMany({
    where: {
      OR: crewNames.map(name => ({ name: { contains: name, mode: 'insensitive' } })),
    },
    include: { roles: { include: { role: true } } },
  });
  
  console.log(`Found ${crew.length} crew members:`);
  crew.forEach(c => {
    const roleNames = c.roles.map(r => r.role.name).join(', ');
    console.log(`  ${c.name} (${c.id}): ${roleNames || 'No roles'}`);
  });
  
  if (crew.length < 6) {
    console.warn(`\nWARNING: Only found ${crew.length} crew, expected 6`);
  }
  
  const eligibilities: Eligibility[] = crew.flatMap(c =>
    c.roles.map(r => ({
      crewId: c.id,
      roleId: r.role.id,
      roleName: r.role.name,
    }))
  );
  
  console.log(`\nRole assignments:`);
  console.log(`DEMO eligible: ${eligibilities.filter(e => e.roleName === 'DEMO').map(e => {
    const c = crew.find(cr => cr.id === e.crewId);
    return c?.name || e.crewId;
  }).join(', ')}`);
  console.log(`WINE_DEMO eligible: ${eligibilities.filter(e => e.roleName === 'WINE_DEMO').map(e => {
    const c = crew.find(cr => cr.id === e.crewId);
    return c?.name || e.crewId;
  }).join(', ')}`);
  
  const crewByName = new Map(crew.map(c => [c.name.split(' ')[0].toLowerCase(), c]));
  
  const getCrewShift = (firstName: string, start: string, end: string): Shift => {
    const c = crewByName.get(firstName.toLowerCase());
    if (!c) throw new Error(`Crew ${firstName} not found`);
    return { crewId: c.id, crewName: c.name, start, end };
  };
  
  // TEST 1: Morning heavy
  const test1Shifts: Shift[] = [
    getCrewShift('Chase', '05:00', '13:00'),
    getCrewShift('Di', '06:00', '14:00'),
    getCrewShift('Oliver', '08:00', '16:00'),
    getCrewShift('Melissa', '09:00', '17:00'),
    getCrewShift('Ashley', '10:00', '18:00'),
    getCrewShift('Abigail', '14:00', '22:00'),
  ];
  
  runTest('Morning Heavy Schedule', test1Shifts, eligibilities, demoRole.id, wineDemoRole.id);
  
  // TEST 2: Afternoon/Evening heavy
  const test2Shifts: Shift[] = [
    getCrewShift('Chase', '08:00', '16:00'),
    getCrewShift('Di', '10:00', '18:00'),
    getCrewShift('Oliver', '12:00', '20:00'),
    getCrewShift('Melissa', '14:00', '22:00'),
    getCrewShift('Ashley', '15:00', '23:00'),
    getCrewShift('Abigail', '16:00', '24:00'),
  ];
  
  runTest('Afternoon/Evening Heavy Schedule', test2Shifts, eligibilities, demoRole.id, wineDemoRole.id);
  
  // TEST 3: Split schedule (gap in middle)
  const test3Shifts: Shift[] = [
    getCrewShift('Chase', '05:00', '10:00'),
    getCrewShift('Di', '06:00', '11:00'),
    getCrewShift('Oliver', '07:00', '12:00'),
    getCrewShift('Melissa', '17:00', '22:00'),
    getCrewShift('Ashley', '18:00', '23:00'),
    getCrewShift('Abigail', '19:00', '24:00'),
  ];
  
  runTest('Split Schedule (Morning/Evening Gap)', test3Shifts, eligibilities, demoRole.id, wineDemoRole.id);
  
  await prisma.$disconnect();
}

main().catch(console.error);
