/**
 * Test script for finding the top 3 DEMO + WINE_DEMO window combinations
 * that allow for the most crew reorderings (flexibility for optimization).
 * 
 * Run with: tsx test-window-combinations.ts
 */

type CoverageWindow = {
  startHour: number;
  endHour: number;
  length: number;
};

type Shift = {
  crewId: string;
  start: string; // ISO datetime
  end: string;   // ISO datetime
};

type Eligibility = {
  crewId: string;
  roleId: string;
  roleName: string;
};

/**
 * Build a 24-hour array of how many eligible crew are available at each hour
 */
function buildAvailability(
  roleId: string,
  eligibilities: Eligibility[],
  shifts: Shift[]
): number[] {
  const eligibleCrewIds = new Set(
    eligibilities.filter(e => e.roleId === roleId).map(e => e.crewId)
  );

  const avail = new Array(24).fill(0);
  
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

type WindowCombination = {
  demoWindow: CoverageWindow;
  wineDemoWindow: CoverageWindow;
  totalReorderings: number;
};

type Assignment = {
  hour: number;
  roleId: string;
  crewId: string;
};

type FullAssignment = {
  demo: Assignment[];
  wineDemo: Assignment[];
};

/**
 * Parse ISO datetime to hour (0-23)
 */
function parseHour(isoString: string): number {
  return new Date(isoString).getHours();
}

/**
 * Build a map of hour -> Set of crew IDs working at that hour
 */
function buildCrewByHour(
  roleId: string,
  eligibilities: Eligibility[],
  shifts: Shift[]
): Map<number, Set<string>> {
  const eligibleCrewIds = new Set(
    eligibilities.filter(e => e.roleId === roleId).map(e => e.crewId)
  );

  const crewByHour = new Map<number, Set<string>>();
  
  for (const shift of shifts) {
    if (!eligibleCrewIds.has(shift.crewId)) continue;
    
    const startHour = parseHour(shift.start);
    const endHour = parseHour(shift.end);
    
    for (let h = startHour; h < endHour; h++) {
      if (!crewByHour.has(h)) {
        crewByHour.set(h, new Set());
      }
      crewByHour.get(h)!.add(shift.crewId);
    }
  }
  
  return crewByHour;
}

/**
 * Find all longest contiguous windows where unique_crew_count >= window_length
 * (respecting the 1-hour-per-crew constraint)
 */
function findAllLongestWindows(
  availByHour: number[],
  roleId: string,
  eligibilities: Eligibility[],
  shifts: Shift[]
): CoverageWindow[] {
  const crewByHour = buildCrewByHour(roleId, eligibilities, shifts);
  
  let maxLength = 0;
  const windows: CoverageWindow[] = [];
  
  for (let start = 0; start < 24; start++) {
    if (availByHour[start] === 0) continue;
    
    for (let end = start + 1; end <= 24; end++) {
      const length = end - start;
      
      // Count unique crew across this window
      const uniqueCrew = new Set<string>();
      for (let h = start; h < end; h++) {
        const crewAtHour = crewByHour.get(h);
        if (crewAtHour) {
          crewAtHour.forEach(c => uniqueCrew.add(c));
        }
      }
      
      const uniqueCount = uniqueCrew.size;
      
      // Window is valid if we have enough unique crew
      if (uniqueCount >= length) {
        if (length > maxLength) {
          maxLength = length;
          windows.length = 0;
          windows.push({ startHour: start, endHour: end, length });
        } else if (length === maxLength) {
          windows.push({ startHour: start, endHour: end, length });
        }
      } else {
        // Can't extend further from this start
        break;
      }
    }
  }
  
  return windows;
}

/**
 * Count the number of valid crew reorderings for a given DEMO + WINE_DEMO window pair.
 * This uses backtracking to enumerate ALL possible assignments that satisfy:
 * 1. Each hour in each window gets exactly 1 crew
 * 2. Each crew works max 1 hour per role
 * 3. No crew is assigned to both roles at the same hour (conflict check)
 */
function countNonConflictingAssignments(
  demoWindow: CoverageWindow,
  wineDemoWindow: CoverageWindow,
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
  
  // Backtracking function
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
      // 1. Crew hasn't been used in this role yet
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
 * OLD IMPLEMENTATION - INCORRECT (doesn't account for conflicts)
 * Count the number of valid crew reorderings for a given window.
 */
function countReorderingsSimple(
  window: CoverageWindow,
  crewByHour: Map<number, Set<string>>
): number {
  const { startHour, endHour, length } = window;
  
  // Collect all unique crew available across the entire window
  const allCrewInWindow = new Set<string>();
  for (let h = startHour; h < endHour; h++) {
    const crewAtHour = crewByHour.get(h);
    if (crewAtHour) {
      crewAtHour.forEach(c => allCrewInWindow.add(c));
    }
  }
  
  const uniqueCrewCount = allCrewInWindow.size;
  
  console.log(`  Window ${startHour}:00-${endHour}:00: ${uniqueCrewCount} unique crew for ${length} hours`);
  
  // If not enough crew, no valid orderings
  if (uniqueCrewCount < length) {
    console.log(`    -> Not enough crew (need ${length}, have ${uniqueCrewCount})`);
    return 0;
  }
  
  // Calculate permutations: P(n, k) = n!/(n-k)!
  const reorderings = factorial(uniqueCrewCount) / factorial(uniqueCrewCount - length);
  console.log(`    -> ${reorderings.toLocaleString()} possible orderings`);
  
  return reorderings;
}

/**
 * Calculate factorial (for small numbers)
 */
function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

/**
 * Find the top 3 combinations of DEMO + WINE_DEMO windows
 * that allow for the most total crew reorderings.
 */
function findTopWindowCombinations(
  demoWindows: CoverageWindow[],
  wineDemoWindows: CoverageWindow[],
  demoRoleId: string,
  wineDemoRoleId: string,
  eligibilities: Eligibility[],
  shifts: Shift[]
): WindowCombination[] {
  const demoCrewByHour = buildCrewByHour(demoRoleId, eligibilities, shifts);
  const wineDemoCrewByHour = buildCrewByHour(wineDemoRoleId, eligibilities, shifts);
  
  const combinations: WindowCombination[] = [];
  
  console.log('Computing non-conflicting assignments for each combination...\n');
  
  // Try all combinations of DEMO and WINE_DEMO windows
  for (const demoWindow of demoWindows) {
    for (const wineDemoWindow of wineDemoWindows) {
      console.log(`Testing DEMO ${demoWindow.startHour}:00-${demoWindow.endHour}:00 × WINE_DEMO ${wineDemoWindow.startHour}:00-${wineDemoWindow.endHour}:00`);
      
      // Count all valid non-conflicting assignments
      const totalReorderings = countNonConflictingAssignments(
        demoWindow,
        wineDemoWindow,
        demoCrewByHour,
        wineDemoCrewByHour
      );
      
      console.log(`  -> ${totalReorderings.toLocaleString()} valid non-conflicting assignments\n`);
      
      combinations.push({
        demoWindow,
        wineDemoWindow,
        totalReorderings,
      });
    }
  }
  
  // Sort by total reorderings (descending) and return top 3
  combinations.sort((a, b) => b.totalReorderings - a.totalReorderings);
  
  return combinations.slice(0, 3);
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

function runTest() {
  console.log('\n=== WINDOW COMBINATION TEST ===\n');
  
  // Use the same crew from our window-finding test
  const demoRoleId = 'demo-role-id';
  const wineDemoRoleId = 'wine-demo-role-id';
  
  const eligibilities: Eligibility[] = [
    // DEMO eligible
    { crewId: 'oliver', roleId: demoRoleId, roleName: 'DEMO' },
    { crewId: 'melissa', roleId: demoRoleId, roleName: 'DEMO' },
    { crewId: 'ashley', roleId: demoRoleId, roleName: 'DEMO' },
    
    // WINE_DEMO eligible (everyone except Oliver)
    { crewId: 'chase', roleId: wineDemoRoleId, roleName: 'WINE_DEMO' },
    { crewId: 'di', roleId: wineDemoRoleId, roleName: 'WINE_DEMO' },
    { crewId: 'melissa', roleId: wineDemoRoleId, roleName: 'WINE_DEMO' },
    { crewId: 'ashley', roleId: wineDemoRoleId, roleName: 'WINE_DEMO' },
    { crewId: 'abigail', roleId: wineDemoRoleId, roleName: 'WINE_DEMO' },
  ];
  
  // Test scenario: Morning heavy
  const shifts: Shift[] = [
    { crewId: 'chase', start: '2025-01-15T07:00:00Z', end: '2025-01-15T15:00:00Z' },
    { crewId: 'di', start: '2025-01-15T08:00:00Z', end: '2025-01-15T16:00:00Z' },
    { crewId: 'oliver', start: '2025-01-15T09:00:00Z', end: '2025-01-15T17:00:00Z' },
    { crewId: 'melissa', start: '2025-01-15T10:00:00Z', end: '2025-01-15T18:00:00Z' },
    { crewId: 'ashley', start: '2025-01-15T11:00:00Z', end: '2025-01-15T19:00:00Z' },
    { crewId: 'abigail', start: '2025-01-15T12:00:00Z', end: '2025-01-15T20:00:00Z' },
  ];
  
  // Step 1: Find all longest windows for DEMO
  console.log('Step 1: Finding longest DEMO windows...\n');
  const demoAvail = buildAvailability(demoRoleId, eligibilities, shifts);
  const demoWindows = findAllLongestWindows(demoAvail, demoRoleId, eligibilities, shifts);
  
  console.log(`Found ${demoWindows.length} DEMO window(s) of ${demoWindows[0]?.length || 0} hours each:`);
  demoWindows.forEach(w => {
    console.log(`  ${w.startHour}:00 - ${w.endHour}:00`);
  });
  
  // Step 2: Find all longest windows for WINE_DEMO
  console.log('\nStep 2: Finding longest WINE_DEMO windows...\n');
  const wineDemoAvail = buildAvailability(wineDemoRoleId, eligibilities, shifts);
  const wineDemoWindows = findAllLongestWindows(wineDemoAvail, wineDemoRoleId, eligibilities, shifts);
  
  console.log(`Found ${wineDemoWindows.length} WINE_DEMO window(s) of ${wineDemoWindows[0]?.length || 0} hours each:`);
  wineDemoWindows.forEach(w => {
    console.log(`  ${w.startHour}:00 - ${w.endHour}:00`);
  });
  
  // Step 3: Find top 3 combinations
  console.log('\n\nStep 3: Finding top 3 window combinations...\n');
  const topCombinations = findTopWindowCombinations(
    demoWindows,
    wineDemoWindows,
    demoRoleId,
    wineDemoRoleId,
    eligibilities,
    shifts
  );
  
  console.log('\nTop 3 Window Combinations:\n');
  topCombinations.forEach((combo, idx) => {
    console.log(`${idx + 1}. DEMO: ${combo.demoWindow.startHour}:00-${combo.demoWindow.endHour}:00 | WINE_DEMO: ${combo.wineDemoWindow.startHour}:00-${combo.wineDemoWindow.endHour}:00`);
    console.log(`   Total Reorderings: ${combo.totalReorderings.toLocaleString()}\n`);
  });
}

runTest();
