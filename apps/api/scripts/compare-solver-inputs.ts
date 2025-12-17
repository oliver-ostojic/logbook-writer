/**
 * Compare solver inputs between two dates to find differences
 * that might explain why one is INFEASIBLE and the other works
 */

const API_URL = 'http://localhost:4000';
const STORE_ID = 768;
const DATE_WORKING = '2025-12-15';
const DATE_BROKEN = '2025-11-25';

interface SolverInput {
  crew: Array<{
    id: string;
    name: string;
    shiftStartMin: number;
    shiftEndMin: number;
    roleIds: number[];
  }>;
  coverageWindows: Array<{
    roleId: number;
    roleCode: string;
    startMin: number;
    endMin: number;
    crewCount: number;
    taskLength: number;
  }>;
  crewQuotas: Array<{
    crewId: string;
    crewName: string;
    roleId: number;
    roleCode: string;
    minMinutes: number;
    windowStart: number;
    windowEnd: number;
  }>;
  roleRules: Array<{
    roleId: number;
    roleCode: string;
    ruleType: string;
  }>;
  roles: Array<{
    id: number;
    code: string;
  }>;
}

function minutesToTime(min: number): string {
  const hours = Math.floor(min / 60);
  const mins = min % 60;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${h}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

async function fetchSolverInput(date: string): Promise<SolverInput> {
  const response = await fetch(`${API_URL}/solver/v2/input?storeId=${STORE_ID}&date=${date}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch solver input for ${date}: ${response.status}`);
  }
  const json = await response.json();
  return json.data || json;
}

function getCrewByHour(crew: SolverInput['crew']): Map<number, number> {
  const byHour = new Map<number, number>();
  
  // Initialize hours 5am to 10pm
  for (let h = 5; h <= 22; h++) {
    byHour.set(h * 60, 0);
  }
  
  for (const c of crew) {
    for (let min = c.shiftStartMin; min < c.shiftEndMin; min += 60) {
      const hour = Math.floor(min / 60) * 60;
      byHour.set(hour, (byHour.get(hour) || 0) + 1);
    }
  }
  
  return byHour;
}

function getCoverageByHour(windows: SolverInput['coverageWindows'], roleId: number): Map<number, number> {
  const byHour = new Map<number, number>();
  
  for (const cw of windows) {
    if (cw.roleId !== roleId) continue;
    
    for (let min = cw.startMin; min < cw.endMin; min += 60) {
      const hour = Math.floor(min / 60) * 60;
      byHour.set(hour, Math.max(byHour.get(hour) || 0, cw.crewCount));
    }
  }
  
  return byHour;
}

function getEligibleCrewByHourAndRole(crew: SolverInput['crew'], roleId: number): Map<number, number> {
  const byHour = new Map<number, number>();
  
  for (let h = 5; h <= 22; h++) {
    byHour.set(h * 60, 0);
  }
  
  for (const c of crew) {
    if (!c.roleIds.includes(roleId)) continue;
    
    for (let min = c.shiftStartMin; min < c.shiftEndMin; min += 60) {
      const hour = Math.floor(min / 60) * 60;
      byHour.set(hour, (byHour.get(hour) || 0) + 1);
    }
  }
  
  return byHour;
}

async function main() {
  console.log('='.repeat(70));
  console.log('SOLVER INPUT COMPARISON');
  console.log(`Working: ${DATE_WORKING} vs Broken: ${DATE_BROKEN}`);
  console.log('='.repeat(70));
  
  const [working, broken] = await Promise.all([
    fetchSolverInput(DATE_WORKING),
    fetchSolverInput(DATE_BROKEN),
  ]);
  
  // 1. High-level summary
  console.log('\n### HIGH-LEVEL SUMMARY ###\n');
  console.log('                          WORKING    BROKEN     DIFF');
  console.log('-'.repeat(60));
  console.log(`Crew count:               ${working.crew.length.toString().padStart(7)}    ${broken.crew.length.toString().padStart(6)}    ${(broken.crew.length - working.crew.length > 0 ? '+' : '') + (broken.crew.length - working.crew.length)}`);
  console.log(`Coverage windows:         ${working.coverageWindows.length.toString().padStart(7)}    ${broken.coverageWindows.length.toString().padStart(6)}    ${(broken.coverageWindows.length - working.coverageWindows.length > 0 ? '+' : '') + (broken.coverageWindows.length - working.coverageWindows.length)}`);
  console.log(`Crew quotas:              ${working.crewQuotas.length.toString().padStart(7)}    ${broken.crewQuotas.length.toString().padStart(6)}    ${(broken.crewQuotas.length - working.crewQuotas.length > 0 ? '+' : '') + (broken.crewQuotas.length - working.crewQuotas.length)}`);
  console.log(`Role rules:               ${working.roleRules.length.toString().padStart(7)}    ${broken.roleRules.length.toString().padStart(6)}    ${(broken.roleRules.length - working.roleRules.length > 0 ? '+' : '') + (broken.roleRules.length - working.roleRules.length)}`);
  
  // 2. Crew hours comparison
  console.log('\n### CREW AVAILABLE BY HOUR ###\n');
  const workingCrewByHour = getCrewByHour(working.crew);
  const brokenCrewByHour = getCrewByHour(broken.crew);
  
  console.log('Hour        WORKING  BROKEN   DIFF');
  console.log('-'.repeat(40));
  for (let h = 5; h <= 22; h++) {
    const hour = h * 60;
    const w = workingCrewByHour.get(hour) || 0;
    const b = brokenCrewByHour.get(hour) || 0;
    const diff = b - w;
    const diffStr = diff === 0 ? '  0' : (diff > 0 ? `+${diff}` : `${diff}`);
    const flag = diff < -5 ? ' ⚠️' : '';
    console.log(`${minutesToTime(hour).padEnd(12)}${w.toString().padStart(7)}  ${b.toString().padStart(6)}   ${diffStr}${flag}`);
  }
  
  // 3. Coverage requirements comparison
  console.log('\n### COVERAGE REQUIREMENTS BY ROLE ###\n');
  
  // Get unique roles from coverage windows
  const allRoleIds = new Set([
    ...working.coverageWindows.map(cw => cw.roleId),
    ...broken.coverageWindows.map(cw => cw.roleId),
  ]);
  
  for (const roleId of allRoleIds) {
    const roleName = working.coverageWindows.find(cw => cw.roleId === roleId)?.roleCode ||
                     broken.coverageWindows.find(cw => cw.roleId === roleId)?.roleCode ||
                     `Role ${roleId}`;
    
    console.log(`\n--- ${roleName} (ID: ${roleId}) ---`);
    
    const workingCov = getCoverageByHour(working.coverageWindows, roleId);
    const brokenCov = getCoverageByHour(broken.coverageWindows, roleId);
    const workingEligible = getEligibleCrewByHourAndRole(working.crew, roleId);
    const brokenEligible = getEligibleCrewByHourAndRole(broken.crew, roleId);
    
    console.log('Hour        REQ(W) REQ(B)  ELIG(W) ELIG(B)  RATIO(W)  RATIO(B)  PROBLEM?');
    console.log('-'.repeat(80));
    
    for (let h = 5; h <= 22; h++) {
      const hour = h * 60;
      const reqW = workingCov.get(hour) || 0;
      const reqB = brokenCov.get(hour) || 0;
      const eligW = workingEligible.get(hour) || 0;
      const eligB = brokenEligible.get(hour) || 0;
      
      if (reqW === 0 && reqB === 0) continue;
      
      const ratioW = eligW > 0 ? (reqW / eligW * 100).toFixed(0) + '%' : 'N/A';
      const ratioB = eligB > 0 ? (reqB / eligB * 100).toFixed(0) + '%' : 'N/A';
      
      // Flag problems
      let problem = '';
      if (reqB > eligB) problem = '❌ NOT ENOUGH CREW';
      else if (reqB > 0 && eligB > 0 && reqB / eligB > 0.8) problem = '⚠️ TIGHT';
      
      console.log(`${minutesToTime(hour).padEnd(12)}${reqW.toString().padStart(6)} ${reqB.toString().padStart(6)}  ${eligW.toString().padStart(7)} ${eligB.toString().padStart(7)}  ${ratioW.padStart(8)}  ${ratioB.padStart(8)}  ${problem}`);
    }
  }
  
  // 4. Quota comparison by role
  console.log('\n### QUOTA REQUIREMENTS BY ROLE ###\n');
  
  const workingQuotasByRole: Record<string, { count: number; totalMin: number }> = {};
  const brokenQuotasByRole: Record<string, { count: number; totalMin: number }> = {};
  
  for (const q of working.crewQuotas) {
    const key = q.roleCode || `Role ${q.roleId}`;
    if (!workingQuotasByRole[key]) workingQuotasByRole[key] = { count: 0, totalMin: 0 };
    workingQuotasByRole[key].count++;
    workingQuotasByRole[key].totalMin += q.minMinutes;
  }
  
  for (const q of broken.crewQuotas) {
    const key = q.roleCode || `Role ${q.roleId}`;
    if (!brokenQuotasByRole[key]) brokenQuotasByRole[key] = { count: 0, totalMin: 0 };
    brokenQuotasByRole[key].count++;
    brokenQuotasByRole[key].totalMin += q.minMinutes;
  }
  
  const allQuotaRoles = new Set([...Object.keys(workingQuotasByRole), ...Object.keys(brokenQuotasByRole)]);
  
  console.log('Role                COUNT(W) COUNT(B)  TOTAL_MIN(W) TOTAL_MIN(B)');
  console.log('-'.repeat(70));
  for (const role of allQuotaRoles) {
    const w = workingQuotasByRole[role] || { count: 0, totalMin: 0 };
    const b = brokenQuotasByRole[role] || { count: 0, totalMin: 0 };
    console.log(`${role.padEnd(20)}${w.count.toString().padStart(8)} ${b.count.toString().padStart(8)}  ${w.totalMin.toString().padStart(12)} ${b.totalMin.toString().padStart(12)}`);
  }
  
  // 5. Check for impossibilities
  console.log('\n### POTENTIAL IMPOSSIBILITIES ###\n');
  
  let impossibilities = 0;
  
  for (const roleId of allRoleIds) {
    const roleName = broken.coverageWindows.find(cw => cw.roleId === roleId)?.roleCode || `Role ${roleId}`;
    const brokenCov = getCoverageByHour(broken.coverageWindows, roleId);
    const brokenEligible = getEligibleCrewByHourAndRole(broken.crew, roleId);
    
    for (let h = 5; h <= 22; h++) {
      const hour = h * 60;
      const req = brokenCov.get(hour) || 0;
      const elig = brokenEligible.get(hour) || 0;
      
      if (req > 0 && req > elig) {
        console.log(`❌ ${roleName} at ${minutesToTime(hour)}: Need ${req} but only ${elig} eligible crew`);
        impossibilities++;
      }
    }
  }
  
  if (impossibilities === 0) {
    console.log('✓ No obvious impossibilities in coverage requirements');
  } else {
    console.log(`\nTotal: ${impossibilities} impossible coverage slots`);
  }
  
  // 6. Check quota feasibility
  console.log('\n### QUOTA FEASIBILITY CHECK ###\n');
  
  // For each crew with a quota, check if they have enough time in their shift
  let quotaProblems = 0;
  for (const q of broken.crewQuotas) {
    const crew = broken.crew.find(c => c.id === q.crewId);
    if (!crew) {
      console.log(`❌ Quota for ${q.crewName} (${q.crewId}): Crew not found in input!`);
      quotaProblems++;
      continue;
    }
    
    // Check if crew is even eligible for the role
    if (!crew.roleIds.includes(q.roleId)) {
      console.log(`❌ ${q.crewName} has quota for ${q.roleCode} but is NOT ELIGIBLE for that role!`);
      quotaProblems++;
      continue;
    }
    
    // Check if quota window overlaps with shift
    const overlapStart = Math.max(crew.shiftStartMin, q.windowStart);
    const overlapEnd = Math.min(crew.shiftEndMin, q.windowEnd);
    const overlapMinutes = Math.max(0, overlapEnd - overlapStart);
    
    if (overlapMinutes < q.minMinutes) {
      console.log(`⚠️ ${q.crewName} needs ${q.minMinutes}min of ${q.roleCode} in window ${minutesToTime(q.windowStart)}-${minutesToTime(q.windowEnd)}, but only ${overlapMinutes}min overlap with shift (${minutesToTime(crew.shiftStartMin)}-${minutesToTime(crew.shiftEndMin)})`);
      quotaProblems++;
    }
  }
  
  if (quotaProblems === 0) {
    console.log('✓ All quotas appear feasible based on shift overlap');
  } else {
    console.log(`\nTotal: ${quotaProblems} quota feasibility issues`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('COMPARISON COMPLETE');
  console.log('='.repeat(70));
}

main().catch(console.error);
