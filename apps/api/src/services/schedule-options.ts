/**
 * Schedule Options Generator
 * 
 * Generates schedule options for DEMO/WINE_DEMO coverage windows.
 * CONSTRAINT: Each crew can only work 1 hour total of DEMO/WINE_DEMO per day.
 * 
 * This means window length is limited by the number of unique eligible crew.
 * Example: With 3 DEMO-eligible crew, max DEMO window is 3 hours.
 */

export type Shift = {
  crewId: string;
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
};

export type Eligibility = {
  crewId: string;
  roleId: string;
  roleName: string;
};

export type DemoWindow = {
  startHour: number;
  endHour: number;
  length: number;
};

export type ScheduleOption = {
  name: string;
  description: string;
  demoWindow: DemoWindow | null;
  wineDemoWindow: DemoWindow | null;
  totalCombinations: number;
};

/**
 * Parse HH:mm to hour (0-23)
 */
function parseHour(hhmm: string): number {
  const [h] = hhmm.split(':').map(Number);
  return h;
}

/**
 * Build availability array [0-23] for a specific role
 */
export function buildAvailability(
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
 * Find all longest contiguous windows where we can assign different crew to consecutive hours.
 * CONSTRAINT: Each crew can only work 1 hour total (across the entire window).
 * So we need as many different crew as hours in the window.
 */
export function findAllLongestWindows(
  availByHour: number[],
  roleId: string,
  eligibilities: Eligibility[],
  shifts: Shift[]
): DemoWindow[] {
  const windows: DemoWindow[] = [];
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

/**
 * Count crew orderings for a given window configuration using CSP backtracking
 * to enumerate ALL valid non-conflicting assignments
 */
function countNonConflictingAssignments(
  demoWindow: DemoWindow,
  wineDemoWindow: DemoWindow,
  demoCrewByHour: Map<number, Set<string>>,
  wineDemoCrewByHour: Map<number, Set<string>>
): number {
  const demoHours: number[] = [];
  for (let h = demoWindow.startHour; h < demoWindow.endHour; h++) {
    demoHours.push(h);
  }
  
  const wineDemoHours: number[] = [];
  for (let h = wineDemoWindow.startHour; h < wineDemoWindow.endHour; h++) {
    wineDemoHours.push(h);
  }
  
  let validCount = 0;
  
  // Backtracking function to enumerate all valid assignments
  function backtrack(
    hourIndex: number,
    role: 'demo' | 'wineDemo',
    demoAssignments: Map<number, string>, // hour -> crewId
    wineDemoAssignments: Map<number, string>, // hour -> crewId
    usedDemoCrew: Set<string>,
    usedWineDemoCrew: Set<string>
  ): void {
    // Base case: finished assigning all hours for both roles
    if (role === 'demo' && hourIndex >= demoHours.length) {
      // Move to WINE_DEMO
      backtrack(0, 'wineDemo', demoAssignments, wineDemoAssignments, usedDemoCrew, usedWineDemoCrew);
      return;
    }
    
    if (role === 'wineDemo' && hourIndex >= wineDemoHours.length) {
      // Successfully assigned all hours for both roles
      validCount++;
      return;
    }
    
    const currentHour = role === 'demo' ? demoHours[hourIndex] : wineDemoHours[hourIndex];
    const crewByHour = role === 'demo' ? demoCrewByHour : wineDemoCrewByHour;
    const usedCrew = role === 'demo' ? usedDemoCrew : usedWineDemoCrew;
    const assignments = role === 'demo' ? demoAssignments : wineDemoAssignments;
    
    const availableCrew = crewByHour.get(currentHour);
    if (!availableCrew || availableCrew.size === 0) {
      // No crew available at this hour - invalid path
      return;
    }
    
    // Try assigning each available crew member
    for (const crewId of availableCrew) {
      // Check constraints:
      // 1. Crew hasn't been used in this role yet (1 hour per crew per role)
      if (usedCrew.has(crewId)) continue;
      
      // 2. If this crew is assigned to the other role at this same hour, skip (conflict)
      if (role === 'demo') {
        if (wineDemoAssignments.has(currentHour) && wineDemoAssignments.get(currentHour) === crewId) {
          continue;
        }
      } else {
        if (demoAssignments.has(currentHour) && demoAssignments.get(currentHour) === crewId) {
          continue;
        }
      }
      
      // Assign this crew to this hour
      assignments.set(currentHour, crewId);
      usedCrew.add(crewId);
      
      // Recurse to next hour
      backtrack(
        hourIndex + 1,
        role,
        demoAssignments,
        wineDemoAssignments,
        usedDemoCrew,
        usedWineDemoCrew
      );
      
      // Backtrack
      assignments.delete(currentHour);
      usedCrew.delete(crewId);
    }
  }
  
  // Start backtracking
  backtrack(0, 'demo', new Map(), new Map(), new Set(), new Set());
  
  return validCount;
}

/**
 * Count crew orderings for a given window configuration
 * For now, returns a simple estimate based on crew availability
 * TODO: Implement actual CSP solver for precise counts
 */
function countCombinations(
  demoWindow: DemoWindow | null,
  wineDemoWindow: DemoWindow | null,
  demoRoleId: string,
  wineDemoRoleId: string,
  eligibilities: Eligibility[],
  shifts: Shift[]
): number {
  // Simple heuristic: count total eligible crew for each role
  const demoEligible = eligibilities.filter(e => e.roleId === demoRoleId).length;
  const wineEligible = eligibilities.filter(e => e.roleId === wineDemoRoleId).length;
  
  // Return product as rough estimate of combinations
  // This will be replaced with actual CSP solver
  if (demoWindow && wineDemoWindow) {
    return demoEligible * wineEligible;
  } else if (demoWindow) {
    return demoEligible;
  } else if (wineDemoWindow) {
    return wineEligible;
  }
  
  return 0;
}

/**
 * Generate all possible schedule option combinations.
 * Tests all combinations of longest DEMO windows with longest WINE_DEMO windows
 * and returns them sorted by number of valid crew orderings (descending).
 * Filters out any combinations with 0 valid orderings.
 */
export function generateScheduleOptions(
  demoRoleId: string,
  wineDemoRoleId: string,
  eligibilities: Eligibility[],
  shifts: Shift[]
): ScheduleOption[] {
  // Build availability for each role
  const demoAvail = buildAvailability(demoRoleId, eligibilities, shifts);
  const wineDemoAvail = buildAvailability(wineDemoRoleId, eligibilities, shifts);
  
  // Find all longest windows for each role (respecting 1-hour-per-crew constraint)
  const demoWindows = findAllLongestWindows(demoAvail, demoRoleId, eligibilities, shifts);
  const wineDemoWindows = findAllLongestWindows(wineDemoAvail, wineDemoRoleId, eligibilities, shifts);
  
  console.log(`DEMO longest windows: ${demoWindows.length} windows of ${demoWindows[0]?.length || 0} hours`);
  console.log(`WINE_DEMO longest windows: ${wineDemoWindows.length} windows of ${wineDemoWindows[0]?.length || 0} hours`);
  
  // Build crew-by-hour maps for CSP solver
  const demoCrewByHour = buildCrewByHour(demoRoleId, eligibilities, shifts);
  const wineDemoCrewByHour = buildCrewByHour(wineDemoRoleId, eligibilities, shifts);
  
  const allOptions: ScheduleOption[] = [];
  
  // Generate all combinations of DEMO + WINE_DEMO windows
  console.log('Computing non-conflicting assignments for each combination...');
  
  for (const demo of demoWindows) {
    for (const wine of wineDemoWindows) {
      // Use CSP solver to count actual non-conflicting assignments
      const validAssignments = countNonConflictingAssignments(
        demo,
        wine,
        demoCrewByHour,
        wineDemoCrewByHour
      );
      
      // Only include combinations with at least 1 valid assignment
      if (validAssignments > 0) {
        allOptions.push({
          name: `DEMO ${demo.startHour}:00-${demo.endHour}:00 + WINE_DEMO ${wine.startHour}:00-${wine.endHour}:00`,
          description: `${demo.length}h DEMO window and ${wine.length}h WINE_DEMO window`,
          demoWindow: demo,
          wineDemoWindow: wine,
          totalCombinations: validAssignments,
        });
      }
    }
  }
  
  // Sort by number of valid combinations (descending)
  allOptions.sort((a, b) => b.totalCombinations - a.totalCombinations);
  
  console.log(`\nGenerated ${allOptions.length} valid combinations (excluded ${(demoWindows.length * wineDemoWindows.length) - allOptions.length} with 0 orderings)`);
  console.log('Top combinations by crew orderings:');
  allOptions.slice(0, 10).forEach((opt, idx) => {
    console.log(`  ${idx + 1}. ${opt.name}: ${opt.totalCombinations} valid orderings`);
  });
  
  // Return all valid options (sorted by score)
  return allOptions;
}

/**
 * Format a schedule option for logging
 */
export function formatScheduleOption(option: ScheduleOption): string {
  const lines = [`${option.name}`, `  ${option.description}`];
  
  if (option.demoWindow) {
    lines.push(`  DEMO: ${option.demoWindow.startHour}:00 - ${option.demoWindow.endHour}:00`);
  } else {
    lines.push(`  DEMO: None`);
  }
  
  if (option.wineDemoWindow) {
    lines.push(`  WINE_DEMO: ${option.wineDemoWindow.startHour}:00 - ${option.wineDemoWindow.endHour}:00`);
  } else {
    lines.push(`  WINE_DEMO: None`);
  }
  
  lines.push(`  Valid crew orderings: ${option.totalCombinations}`);
  
  return lines.join('\n');
}
