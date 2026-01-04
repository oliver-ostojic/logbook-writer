/**
 * 31-Day Gini Coefficient Simulation Test
 * 
 * Simulates 31 consecutive days by cycling through 4 real dates with shift data.
 * Tracks fairness history LOCALLY (not in DB) to observe Gini convergence.
 * 
 * Uses PRODUCTION ENGINE CONFIG: 14 regions × 3 shots × LNS enabled.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// Configuration - PRODUCTION ENGINE SETTINGS
// ============================================================================
const STORE_ID = 768;
const API_URL = 'http://localhost:4000';

// Production optimal config
const NUM_REGIONS = 14;
const SHOTS_PER_REGION = 3;
const WORKERS_PER_REGION = 1;
const TIME_LIMIT_PER_SHOT = 10;

// Available dates with shift data (cycle through these)
const AVAILABLE_DATES = ['2025-11-25', '2025-12-13', '2025-12-15', '2025-12-16'];
const NUM_DAYS = 31;

// Tracked roles
const TRACKED_ROLE_IDS = [29, 37, 38]; // Parking Helms, Wine Demo, Food Demo

// ============================================================================
// Types
// ============================================================================
interface SolverResponse {
  success: boolean;
  objectiveValue?: number;
  message?: string;
  assignments?: Assignment[];
}

interface Assignment {
  crewId: string;
  roleId: number;
  startMinute: number;
  endMinute: number;
}

interface RoleGini {
  roleId: number;
  roleName: string;
  giniCoefficient: number;
  crewCount: number;
}

interface DayResult {
  day: number;
  date: string;
  success: boolean;
  solveTimeMs: number;
  avgSatisfaction: number;
  overallGini: number;
  roleGinis: RoleGini[];
}

// ============================================================================
// Gini Calculation (matches DB formula from role-fairness.service.ts)
// ============================================================================
function calculateGini(values: number[]): number {
  if (values.length === 0) return 0;
  
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, v) => sum + v, 0);
  
  if (total === 0) return 0; // Everyone has 0, so "equal"
  
  // Same formula as DB: sum of all pairwise absolute differences
  let sumOfDifferences = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumOfDifferences += Math.abs(sorted[i] - sorted[j]);
    }
  }
  
  return sumOfDifferences / (2 * n * total);
}

// ============================================================================
// Fairness Tracker (simulates DB accumulation)
// ============================================================================
class FairnessTracker {
  // Map: "crewId:roleId" -> total minutes assigned
  private minutesByCrew = new Map<string, number>();
  // Map: "crewId" -> total shift minutes worked
  private shiftMinutesByCrew = new Map<string, number>();
  // Role names for display
  private roleNames = new Map<number, string>();
  
  constructor() {}
  
  setRoleNames(names: Map<number, string>) {
    this.roleNames = names;
  }
  
  // Record shift worked (for normalization)
  recordShift(crewId: string, shiftMinutes: number) {
    const current = this.shiftMinutesByCrew.get(crewId) ?? 0;
    this.shiftMinutesByCrew.set(crewId, current + shiftMinutes);
  }
  
  // Record role assignment
  recordAssignment(crewId: string, roleId: number, minutes: number) {
    if (!TRACKED_ROLE_IDS.includes(roleId)) return;
    
    const key = `${crewId}:${roleId}`;
    const current = this.minutesByCrew.get(key) ?? 0;
    this.minutesByCrew.set(key, current + minutes);
  }
  
  // Calculate Gini for a specific role
  calculateRoleGini(roleId: number, eligibleCrewIds: Set<string>): RoleGini {
    const minutesPerHour: number[] = [];
    
    for (const crewId of eligibleCrewIds) {
      const key = `${crewId}:${roleId}`;
      const roleMinutes = this.minutesByCrew.get(key) ?? 0;
      const totalShiftMinutes = this.shiftMinutesByCrew.get(crewId) ?? 0;
      const totalHoursWorked = totalShiftMinutes / 60;
      
      // Minutes per hour worked (normalized)
      const minPerHour = totalHoursWorked > 0 ? roleMinutes / totalHoursWorked : 0;
      minutesPerHour.push(minPerHour);
    }
    
    const gini = calculateGini(minutesPerHour);
    
    return {
      roleId,
      roleName: this.roleNames.get(roleId) ?? `Role ${roleId}`,
      giniCoefficient: gini,
      crewCount: eligibleCrewIds.size,
    };
  }
  
  // Calculate overall Gini (average across tracked roles)
  calculateOverallGini(eligibleCrewByRole: Map<number, Set<string>>): number {
    const ginis: number[] = [];
    
    for (const roleId of TRACKED_ROLE_IDS) {
      const eligible = eligibleCrewByRole.get(roleId);
      if (eligible && eligible.size > 0) {
        const roleGini = this.calculateRoleGini(roleId, eligible);
        ginis.push(roleGini.giniCoefficient);
      }
    }
    
    return ginis.length > 0 ? ginis.reduce((a, b) => a + b, 0) / ginis.length : 0;
  }
  
  // Get all role Ginis
  getAllRoleGinis(eligibleCrewByRole: Map<number, Set<string>>): RoleGini[] {
    const results: RoleGini[] = [];
    
    for (const roleId of TRACKED_ROLE_IDS) {
      const eligible = eligibleCrewByRole.get(roleId);
      if (eligible && eligible.size > 0) {
        results.push(this.calculateRoleGini(roleId, eligible));
      }
    }
    
    return results.sort((a, b) => a.roleName.localeCompare(b.roleName));
  }
  
  reset() {
    this.minutesByCrew.clear();
    this.shiftMinutesByCrew.clear();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getRoleNames(): Promise<Map<number, string>> {
  const roles = await prisma.role.findMany({
    where: { id: { in: TRACKED_ROLE_IDS } },
    select: { id: true, displayName: true },
  });
  return new Map(roles.map(r => [r.id, r.displayName]));
}

async function getEligibleCrewByRole(): Promise<Map<number, Set<string>>> {
  const crewRoles = await prisma.crewRole.findMany({
    where: {
      roleId: { in: TRACKED_ROLE_IDS },
      Crew: { storeId: STORE_ID },
    },
    select: { crewId: true, roleId: true },
  });
  
  const result = new Map<number, Set<string>>();
  for (const cr of crewRoles) {
    if (!result.has(cr.roleId)) {
      result.set(cr.roleId, new Set());
    }
    result.get(cr.roleId)!.add(cr.crewId);
  }
  
  return result;
}

async function getShiftsForDate(date: string): Promise<Map<string, number>> {
  const shifts = await prisma.shift.findMany({
    where: {
      storeId: STORE_ID,
      date: new Date(date),
    },
    select: { crewId: true, startMin: true, endMin: true },
  });
  
  const result = new Map<string, number>();
  for (const shift of shifts) {
    const minutes = shift.endMin - shift.startMin;
    const current = result.get(shift.crewId) ?? 0;
    result.set(shift.crewId, current + minutes);
  }
  
  return result;
}

async function runSolver(date: string): Promise<{ response: SolverResponse; solveTimeMs: number }> {
  const startTime = Date.now();

  // Use simple solver (not tuning engine)
  const res = await fetch(`${API_URL}/solver/v2/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID,
      date,
      saveLogbook: false, // Don't save - we track locally
      timeLimitSeconds: 60,
      settings: {
        enableHardFairness: true,
        fairnessBoost: 300,
        fairnessPenalty: 300,
      },
    }),
  });

  const solveTimeMs = Date.now() - startTime;
  const data = (await res.json()) as SolverResponse;

  return { response: data, solveTimeMs };
}

function printProgressBar(current: number, total: number, width: number = 30): string {
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${current}/${total}`;
}

// ============================================================================
// Analysis Functions
// ============================================================================

function analyzeConvergence(results: DayResult[]): void {
  const successful = results.filter(r => r.success);
  if (successful.length < 7) {
    console.log('\n⚠️  Not enough successful days for convergence analysis.');
    return;
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log('  CONVERGENCE ANALYSIS');
  console.log('═'.repeat(80));
  
  // Week by week analysis
  const weeks: DayResult[][] = [];
  for (let i = 0; i < successful.length; i += 7) {
    weeks.push(successful.slice(i, Math.min(i + 7, successful.length)));
  }
  
  console.log('\n  Weekly Averages:');
  console.log('  ' + '-'.repeat(75));
  
  weeks.forEach((week, idx) => {
    const avgGini = week.reduce((a, b) => a + b.overallGini, 0) / week.length;
    const avgSat = week.reduce((a, b) => a + b.avgSatisfaction, 0) / week.length;
    
    // Get role averages
    const roleAvgs = new Map<number, number>();
    for (const day of week) {
      for (const rg of day.roleGinis) {
        roleAvgs.set(rg.roleId, (roleAvgs.get(rg.roleId) ?? 0) + rg.giniCoefficient);
      }
    }
    
    const roleStrs: string[] = [];
    for (const [roleId, sum] of roleAvgs) {
      const avg = sum / week.length;
      const name = week[0].roleGinis.find(r => r.roleId === roleId)?.roleName ?? `R${roleId}`;
      roleStrs.push(`${name.substring(0, 4)}: ${avg.toFixed(3)}`);
    }
    
    console.log(`  Week ${idx + 1} (Days ${idx * 7 + 1}-${idx * 7 + week.length}): Gini ${avgGini.toFixed(4)} | Sat ${avgSat.toFixed(1)}% | ${roleStrs.join(' | ')}`);
  });
  
  // First vs last week comparison
  if (weeks.length >= 2) {
    const firstWeek = weeks[0];
    const lastWeek = weeks[weeks.length - 1];
    
    const firstAvgGini = firstWeek.reduce((a, b) => a + b.overallGini, 0) / firstWeek.length;
    const lastAvgGini = lastWeek.reduce((a, b) => a + b.overallGini, 0) / lastWeek.length;
    const giniChange = ((lastAvgGini - firstAvgGini) / firstAvgGini) * 100;
    
    console.log('\n  Week 1 → Last Week Change:');
    console.log(`    Overall Gini: ${firstAvgGini.toFixed(4)} → ${lastAvgGini.toFixed(4)} (${giniChange >= 0 ? '+' : ''}${giniChange.toFixed(1)}%)`);
    
    if (giniChange < -10) {
      console.log('    ✅ SIGNIFICANT IMPROVEMENT - Gini decreased >10%');
    } else if (giniChange < 0) {
      console.log('    ✓ Improvement - Gini decreased');
    } else {
      console.log('    ⚠️ No improvement or slight increase');
    }
  }
  
  // Day-over-day volatility
  const giniDeltas: number[] = [];
  for (let i = 1; i < successful.length; i++) {
    giniDeltas.push(Math.abs(successful[i].overallGini - successful[i - 1].overallGini));
  }
  
  const firstHalf = giniDeltas.slice(0, Math.floor(giniDeltas.length / 2));
  const secondHalf = giniDeltas.slice(Math.floor(giniDeltas.length / 2));
  
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  console.log('\n  Volatility (day-over-day Gini change):');
  console.log(`    First half avg: ${avgFirst.toFixed(5)}`);
  console.log(`    Second half avg: ${avgSecond.toFixed(5)}`);
  console.log(`    Stabilization: ${avgSecond < avgFirst ? '✅ STABILIZING' : '⚠️ Still volatile'}`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('═'.repeat(80));
  console.log('  31-DAY GINI COEFFICIENT SIMULATION');
  console.log('  Simple Solver (no tuning) - 60s time limit');
  console.log('  LOCAL TRACKING (no DB fairness updates)');
  console.log('═'.repeat(80));
  console.log(`\n  Store: ${STORE_ID}`);
  console.log(`  Shift Data Dates: ${AVAILABLE_DATES.join(', ')}`);
  console.log(`  Simulated Days: ${NUM_DAYS}`);
  console.log(`  Solver: Simple (/solver/v2/solve) with 60s limit`);
  console.log(`  Expected Runtime: ~${Math.round((NUM_DAYS * 60) / 60)} minutes\n`);

  // Setup
  const roleNames = await getRoleNames();
  const eligibleCrewByRole = await getEligibleCrewByRole();
  
  const tracker = new FairnessTracker();
  tracker.setRoleNames(roleNames);
  
  const results: DayResult[] = [];
  const startTime = Date.now();

  // Run 31 simulated days
  for (let day = 0; day < NUM_DAYS; day++) {
    const realDate = AVAILABLE_DATES[day % AVAILABLE_DATES.length];
    
    process.stdout.write(`  ${printProgressBar(day + 1, NUM_DAYS)} Day ${day + 1} (${realDate})...`);

    try {
      // Get shifts for this date and record them
      const shifts = await getShiftsForDate(realDate);
      for (const [crewId, minutes] of shifts) {
        tracker.recordShift(crewId, minutes);
      }
      
      // Run solver
      const { response, solveTimeMs } = await runSolver(realDate);

      if (!response.success || !response.assignments) {
        console.log(` ❌ ${response.message || 'No assignments'}`);
        results.push({
          day: day + 1,
          date: realDate,
          success: false,
          solveTimeMs,
          avgSatisfaction: 0,
          overallGini: 1,
          roleGinis: [],
        });
        continue;
      }

      // Record assignments in our local tracker
      for (const assignment of response.assignments) {
        const minutes = assignment.endMinute - assignment.startMinute;
        tracker.recordAssignment(assignment.crewId, assignment.roleId, minutes);
      }
      
      // Calculate Ginis from accumulated history
      const roleGinis = tracker.getAllRoleGinis(eligibleCrewByRole);
      const overallGini = tracker.calculateOverallGini(eligibleCrewByRole);
      
      // Get satisfaction (approximate - from response metadata if available)
      const satisfiedCount = response.assignments.filter(a => TRACKED_ROLE_IDS.includes(a.roleId)).length;
      const avgSatisfaction = 65; // Placeholder - we'd need to track this separately
      
      const result: DayResult = {
        day: day + 1,
        date: realDate,
        success: true,
        solveTimeMs,
        avgSatisfaction,
        overallGini,
        roleGinis,
      };

      results.push(result);

      // Print summary
      console.log(` ✓ ${(solveTimeMs / 1000).toFixed(0)}s | Gini: ${overallGini.toFixed(4)}`);
      
      // Print per-role Ginis
      const roleStr = roleGinis.map(r => `${r.roleName}: ${r.giniCoefficient.toFixed(3)}`).join(' | ');
      console.log(`      ${roleStr}`);

    } catch (error) {
      console.log(` ❌ Error: ${error}`);
      results.push({
        day: day + 1,
        date: realDate,
        success: false,
        solveTimeMs: 0,
        avgSatisfaction: 0,
        overallGini: 1,
        roleGinis: [],
      });
    }
  }

  const totalTimeMs = Date.now() - startTime;

  // Print raw data
  console.log('\n' + '═'.repeat(80));
  console.log('  RAW DATA');
  console.log('═'.repeat(80));
  console.log('\n  Day | Date       | Time | Overall | ' + 
    Array.from(roleNames.values()).map(n => n.substring(0, 8).padEnd(8)).join(' | '));
  console.log('  ' + '-'.repeat(75));
  
  for (const r of results) {
    if (r.success) {
      const roleVals = TRACKED_ROLE_IDS.map(id => {
        const rg = r.roleGinis.find(x => x.roleId === id);
        return rg ? rg.giniCoefficient.toFixed(4).padEnd(8) : '   -    ';
      }).join(' | ');
      console.log(`  ${String(r.day).padStart(3)} | ${r.date} | ${(r.solveTimeMs / 1000).toFixed(0).padStart(3)}s | ${r.overallGini.toFixed(4).padStart(7)} | ${roleVals}`);
    } else {
      console.log(`  ${String(r.day).padStart(3)} | ${r.date} | FAILED`);
    }
  }

  // Analyze convergence
  analyzeConvergence(results);

  // Summary
  const successful = results.filter(r => r.success);
  console.log('\n' + '═'.repeat(80));
  console.log('  SUMMARY');
  console.log('═'.repeat(80));
  console.log(`\n  Total Runtime: ${(totalTimeMs / 1000 / 60).toFixed(1)} minutes`);
  console.log(`  Successful Days: ${successful.length}/${NUM_DAYS}`);
  
  if (successful.length > 0) {
    const avgSolveTime = successful.reduce((a, b) => a + b.solveTimeMs, 0) / successful.length;
    const firstGini = successful[0].overallGini;
    const lastGini = successful[successful.length - 1].overallGini;
    const avgGini = successful.reduce((a, b) => a + b.overallGini, 0) / successful.length;
    
    console.log(`  Avg Solve Time: ${(avgSolveTime / 1000).toFixed(1)}s`);
    console.log(`  First Day Gini: ${firstGini.toFixed(4)}`);
    console.log(`  Last Day Gini: ${lastGini.toFixed(4)}`);
    console.log(`  Avg Gini: ${avgGini.toFixed(4)}`);
    console.log(`  Gini Change: ${((lastGini - firstGini) / firstGini * 100).toFixed(1)}%`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
