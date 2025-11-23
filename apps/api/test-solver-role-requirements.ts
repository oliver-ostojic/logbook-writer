import { PrismaClient } from '@prisma/client';
import { segmentShiftByRegisterWindow } from './src/services/segmentation';

// TODO: Add register amount preference feature
// - Add Store.minRequiredReg (default: 2) and Store.maxRequiredReg (default: 5) fields
//   These are set by management to define the range of acceptable register hours
// - Add Crew.prefRegisterAmount field (values: 2, 3, 4, or 5)
//   Allows crew to express how many hours of register work they prefer
// - Enhance solver objective function to penalize deviation from preferred register amount
//   Similar to existing preference weights (prefFirstHour, prefTask, prefBreakTiming)
// - This adds another dimension of crew satisfaction and improves schedule quality

const prisma = new PrismaClient();

type RoleAssignmentStrategy = 'UNIVERSAL' | 'COVERAGE_WINDOW' | 'CREW_SPECIFIC';
type RoleMetadata = Awaited<ReturnType<typeof prisma.role.findMany>>[number] & {
  assignmentStrategy: RoleAssignmentStrategy;
};

interface RoleRequirement {
  roleId: number;
  crewId: string;  // For CREW_SPECIFIC requirements
  requiredHours: number;
}

interface TestResult {
  crewSize: number;
  roleId: number;
  roleName: string;
  roleRequirements: RoleRequirement[];
  objectiveScore: number;
  satisfactionMetrics: any;
  executionTime: number;
  solverStatus?: string;
  violations?: string[];
  numAssignments?: number;
  mipGap?: number;
  preferenceSatisfaction?: {
    perCrew: Array<{
      crewId: string;
      firstHourSatisfied: boolean;
      taskSatisfied: boolean;
      breakSatisfied: boolean;
      totalSatisfied: number;
      totalPreferences: number;
      satisfactionRate: number;
    }>;
    stats: {
      mean: number;
      stdDev: number;
      variance: number;
      min: number;
      max: number;
    };
  };
}

// Helper: Convert minutes to HH:MM
function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Generate realistic hourly requirements based on store operations
function generateHourlyRequirements(): any[] {
  const requirements = [];
  
  // Store hours: 8am - 9pm (13 hours)
  for (let hour = 8; hour <= 20; hour++) {
    let requiredRegister: number;
    let requiredProduct: number;
    
    // Slow hours: 8-9am and 8-9pm
    if (hour === 8 || hour === 20) {
      requiredRegister = Math.floor(Math.random() * 2) + 4; // 4-5 crew
      requiredProduct = 3; // Moderate product coverage
    }
    // Peak hours: 12-3pm and 5-8pm
    else if ((hour >= 12 && hour <= 14) || (hour >= 17 && hour <= 19)) {
      requiredRegister = Math.floor(Math.random() * 4) + 10; // 10-13 crew (can't exceed 9 registers, but solver will handle)
      requiredProduct = 6; // High product coverage during peak
    }
    // Normal hours
    else {
      requiredRegister = Math.floor(Math.random() * 3) + 6; // 6-8 crew
      requiredProduct = 4; // Standard product coverage
    }
    
    requirements.push({
      hour,
      requiredRegister: Math.min(requiredRegister, 9), // Cap at 9 registers available
      requiredProduct,
      requiredParkingHelm: 2 // Always 2 parking helm per hour
    });
  }
  
  return requirements;
}

// Helper: Calculate statistics
function calculateStats(values: number[]): { mean: number; stdDev: number; variance: number; min: number; max: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0, variance: 0, min: 0, max: 0 };
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  return { mean, stdDev, variance, min, max };
}

// Helper: Analyze preference satisfaction from assignments
async function analyzePreferenceSatisfaction(
  crewIds: string[],
  assignments: any[]
): Promise<TestResult['preferenceSatisfaction']> {
  // Fetch crew preferences
  const crew = await prisma.crew.findMany({
    where: { id: { in: crewIds } },
    select: {
      id: true,
      prefFirstHour: true,
      prefTask: true,
      prefBreakTiming: true
    }
  });
  
  const perCrew = crew.map(c => {
    const crewAssignments = assignments.filter(a => a.crewId === c.id);
    
    // Check first hour (first slot 0-30 or 30-60 depending on shift start)
    const firstAssignment = crewAssignments.length > 0 ? crewAssignments[0] : null;
    const firstHourSatisfied = firstAssignment && c.prefFirstHour
      ? (c.prefFirstHour === 'PRODUCT' && firstAssignment.taskType === 'PRODUCT') ||
        (c.prefFirstHour === 'REGISTER' && firstAssignment.taskType === 'REGISTER')
      : false;
    
    // Check overall task preference (majority of shift)
    const taskCounts = new Map<string, number>();
    crewAssignments.forEach(a => {
      if (a.taskType !== 'MEAL_BREAK') {
        taskCounts.set(a.taskType, (taskCounts.get(a.taskType) || 0) + 1);
      }
    });
    const dominantTask = Array.from(taskCounts.entries()).reduce((a, b) => a[1] > b[1] ? a : b, ['', 0])[0];
    const taskSatisfied = c.prefTask
      ? (c.prefTask === 'PRODUCT' && dominantTask === 'PRODUCT') ||
        (c.prefTask === 'REGISTER' && dominantTask === 'REGISTER')
      : false;
    
    // Check break timing
    const breakAssignment = crewAssignments.find(a => a.taskType === 'MEAL_BREAK');
    const breakSatisfied = breakAssignment && c.prefBreakTiming !== null
      ? (c.prefBreakTiming < 0 && breakAssignment.startTime < 540) || // Early break (before 9am = 540min)
        (c.prefBreakTiming > 0 && breakAssignment.startTime >= 540)   // Late break (after 9am)
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
      satisfactionRate
    };
  });
  
  const satisfactionRates = perCrew.map(c => c.satisfactionRate);
  const stats = calculateStats(satisfactionRates);
  
  return { perCrew, stats };
}

// Run solver via API (using fetch instead of axios)
async function runSolver(
  crewIds: string[],
  date: string,
  roleRequirements: RoleRequirement[],
  coverageWindows: any[],
  hourlyRequirements: any[]
): Promise<any> {
  const startTime = Date.now();
  
  try {
    // First, fetch crew to get their shift times
    const crew = await prisma.crew.findMany({
      where: { id: { in: crewIds } }
    });
    
    // Build shifts array from crew data
    const shifts = crew.map(c => ({
      crewId: c.id,
      start: formatTime(c.shiftStartMin),
      end: formatTime(c.shiftEndMin)
    }));
    
    const response = await fetch('http://localhost:4000/solve-logbook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        store_id: 768,
        shifts,
        hourly_requirements: hourlyRequirements,
        role_requirements: roleRequirements,
        coverage_windows: coverageWindows,
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(JSON.stringify(error));
    }
    
    const data = await response.json();
    const executionTime = Date.now() - startTime;
    
    // Extract detailed solver metadata
    const metadata = data.solver?.metadata || {};
    const objectiveScore = metadata.objectiveScore || 0;
    const assignments = data.solver?.assignments || [];
    const solverStatus = metadata.status || 'UNKNOWN';
    const violations = metadata.violations || [];
    const numAssignments = metadata.numAssignments || assignments.length;
    const mipGap = metadata.mipGap || 0;
    
    // Analyze preference satisfaction only if we have assignments
    let preferenceSatisfaction = undefined;
    if (assignments.length > 0) {
      preferenceSatisfaction = await analyzePreferenceSatisfaction(crewIds, assignments);
    }
    
    return {
      ...data,
      objectiveScore,
      solverStatus,
      violations,
      numAssignments,
      mipGap,
      preferenceSatisfaction,
      executionTime
    };
  } catch (error: any) {
    console.error('Solver error:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🧪 Starting Comprehensive Role Requirements Testing\n');
  console.log('='  .repeat(80));
  
  const storeId = 768;
  const date = '2025-11-22'; // Tomorrow
  // Test with realistic crew sizes for a small store (45-65 crew, increasing by 5)
  const crewSizes = [45, 50, 55, 60, 65];
  
  const results: TestResult[] = [];
  
  // Fetch store to get register hours
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { regHoursStartMin: true, regHoursEndMin: true }
  });
  
  if (!store) {
    throw new Error(`Store ${storeId} not found`);
  }
  
  const storeStartMin = store.regHoursStartMin; // e.g., 480 = 8:00 AM
  const storeEndMin = store.regHoursEndMin;     // e.g., 1260 = 9:00 PM
  
  console.log(`\n🏪 Store hours: ${formatTime(storeStartMin)} - ${formatTime(storeEndMin)}`);
  console.log(`   (Special roles can ONLY be assigned during store hours)\n`);
  
  // Fetch all crew from store
  const allCrew = await prisma.crew.findMany({
    where: { storeId },
    include: { CrewRole: true },
    orderBy: { id: 'asc' }
  });
  
  console.log(`\n📊 Total crew available: ${allCrew.length}\n`);
  
  // Generate realistic hourly requirements (will be same for all tests)
  const hourlyRequirements = generateHourlyRequirements();
  console.log(`📋 Generated hourly requirements for store hours (8am-9pm):`);
  console.log(`   Peak hours (12-3pm, 5-8pm): 10-13 registers + 2 parking helm`);
  console.log(`   Slow hours (8-9am, 8-9pm): 4-5 registers + 2 parking helm`);
  console.log(`   Normal hours: 6-8 registers + 2 parking helm\n`);
  
  for (const size of crewSizes) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎯 Testing with ${size} crew members`);
    console.log('='.repeat(80));
    
    // Sample crew
    const sampledCrew = allCrew.slice(0, size);
    const crewIds = sampledCrew.map(c => c.id);
    
    // Find crew members who have role assignments (CrewRole records)
    const crewWithRoles = sampledCrew.filter(c => c.CrewRole && c.CrewRole.length > 0);
    
    console.log(`\n📋 Sample has ${crewWithRoles.length} crew with role assignments:`);
    console.log(`   Will run ${crewWithRoles.length} incremental tests (0 to ${crewWithRoles.length} role requirements)`);
    
    // Run incremental tests: 0 role requirements, 1 role requirement, 2, 3, ... N
    for (let numRequirements = 0; numRequirements <= crewWithRoles.length; numRequirements++) {
      // Select first N crew with roles to get requirements
      const crewForRequirements = crewWithRoles.slice(0, numRequirements);
      
      // Fetch role metadata to determine assignment strategy
      const roleIds = crewForRequirements
        .flatMap(c => c.CrewRole.map(cr => cr.roleId))
        .filter((id, i, arr) => arr.indexOf(id) === i); // unique
      
      const roles = await prisma.role.findMany({
        where: { id: { in: roleIds } }
      });
      
      const roleMap = new Map<number, RoleMetadata>(roles.map(r => [r.id, r as RoleMetadata]));
      
      // Separate requirements by assignment strategy
  const roleRequirementsList: RoleRequirement[] = [];
      const coverageWindowsList: any[] = [];
      
      crewForRequirements.forEach(crew => {
        if (crew.CrewRole && crew.CrewRole.length > 0) {
          // Pick first role assignment for this crew
          const assignment = crew.CrewRole[0];
          const role = roleMap.get(assignment.roleId);
          
          if (!role) return;
          
          // Use production segmentation logic to find FLEX window
          const { segments } = segmentShiftByRegisterWindow(
            crew.shiftStartMin,
            crew.shiftEndMin,
            storeStartMin,
            storeEndMin
          );
          
          // Find FLEX segments (where special roles can be assigned)
          const flexSegments = segments.filter(s => s.kind === 'FLEX');
          
          if (flexSegments.length > 0) {
            // Calculate total flex time available
            const totalFlexMin = flexSegments.reduce((sum, s) => sum + (s.endMin - s.startMin), 0);
            
            // Only create requirement if there's at least 1 hour of flex time
            if (totalFlexMin >= 60) {
              // Use the largest flex segment for simplicity
              const largestFlexSegment = flexSegments.reduce((largest, seg) => 
                (seg.endMin - seg.startMin) > (largest.endMin - largest.startMin) ? seg : largest
              );
              
              const flexStart = largestFlexSegment.startMin;
              const flexEnd = largestFlexSegment.endMin;
              const flexWindow = flexEnd - flexStart;

              // Random duration: 1-2 hours (but not exceeding flex window)
              const durationHours = Math.random() < 0.5 ? 1 : 2;
              let durationMin = Math.min(durationHours * 60, flexWindow);

              // Demo roles are hard-capped at 1 hour
              if (role.code === 'DEMO' || role.code === 'WINE_DEMO') {
                durationMin = Math.min(60, flexWindow);
              }

              // Ensure end time fits within flex window
              const maxStartMin = flexEnd - durationMin;
              if (maxStartMin >= flexStart) {
                // Generate random time and snap based on role's slotSizeMode
                const randomStart = flexStart + Math.floor(Math.random() * (maxStartMin - flexStart + 1));
                let startMin: number;

                // HOUR_ONLY roles must start on full hour boundaries
                if (role.slotSizeMode === 'HOUR_ONLY') {
                  startMin = Math.round(randomStart / 60) * 60; // Snap to :00 only
                } else {
                  startMin = Math.round(randomStart / 30) * 30; // Snap to :00 or :30
                }

                const endMin = startMin + durationMin;

                // Route based on assignment strategy
                if (role.assignmentStrategy === 'COVERAGE_WINDOW') {
                  // Coverage window: "Need N crew doing this role during these hours"
                  coverageWindowsList.push({
                    roleCode: role.code,
                    startMin,
                    endMin,
                    requiredCrew: 1 // Need 1 person doing this role
                  });
                } else if (role.assignmentStrategy === 'CREW_SPECIFIC') {
                  // Crew-specific requirement: specify total hours, not fixed windows
                  roleRequirementsList.push({
                    roleId: assignment.roleId,
                    crewId: crew.id,
                    requiredHours: durationMin / 60
                  });
                }
                // UNIVERSAL roles don't need requirements - they're assigned as needed
              }
            }
          }
        }
      });
      
      // Run test
      console.log(`\n--- Test ${numRequirements}: ${numRequirements} Role Requirements ---`);
      
      if (coverageWindowsList.length > 0 || roleRequirementsList.length > 0) {
        if (coverageWindowsList.length > 0) {
          console.log(`   Coverage Windows (anyone qualified):`);
          coverageWindowsList.forEach(cw => {
            console.log(`      - ${cw.roleCode}: ${formatTime(cw.startMin)}-${formatTime(cw.endMin)} (need ${cw.requiredCrew} crew)`);
          });
        }
        if (roleRequirementsList.length > 0) {
          console.log(`   Crew-Specific Requirements:`);
          roleRequirementsList.forEach(req => {
            const crew = crewForRequirements.find(c => c.id === req.crewId);
            const roleName = crew?.CrewRole.find(cr => cr.roleId === req.roleId)?.roleName || `Role ${req.roleId}`;
            const crewName = crew?.name || req.crewId;
            console.log(`      - ${crewName} must log ${req.requiredHours}h of ${roleName} (spread anywhere during flex)`);
          });
        }
      } else {
        console.log(`   No role requirements (baseline test)`);
      }
      
      try {
        const result = await runSolver(crewIds, date, roleRequirementsList, coverageWindowsList, hourlyRequirements);
        
        results.push({
          crewSize: size,
          roleId: numRequirements,
          roleName: `${numRequirements} requirements`,
          roleRequirements: roleRequirementsList,
          objectiveScore: result.objectiveScore || 0,
          satisfactionMetrics: result.satisfactionMetrics || result.solver?.satisfactionMetrics,
          executionTime: result.executionTime,
          solverStatus: result.solverStatus,
          violations: result.violations,
          numAssignments: result.numAssignments,
          mipGap: result.mipGap,
          preferenceSatisfaction: result.preferenceSatisfaction
        });
        
        const satStats = result.preferenceSatisfaction?.stats;
        const statusEmoji = result.solverStatus === 'OPTIMAL' ? '✅' : 
                           result.solverStatus === 'INFEASIBLE' ? '❌' : 
                           result.solverStatus === 'FEASIBLE' ? '⚠️' : '❓';
        
        console.log(`   ${statusEmoji} Status: ${result.solverStatus} | Obj: ${result.objectiveScore?.toFixed(0) || 'N/A'} | Sat: ${satStats ? (satStats.mean * 100).toFixed(1) : 'N/A'}% (σ=${satStats ? (satStats.stdDev * 100).toFixed(1) : 'N/A'}%) | Assignments: ${result.numAssignments} | Time: ${result.executionTime}ms`);
        
        if (result.violations && result.violations.length > 0) {
          console.log(`      🚨 Violations: ${result.violations.join(', ')}`);
        }
      } catch (error: any) {
        console.log(`   ❌ Test failed: ${error.message}`);
      }
    }
  }
  
  // Summary Report
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('📊 COMPREHENSIVE TEST SUMMARY WITH TRENDS');
  console.log('='.repeat(80));
  
  // First, analyze failures
  const failures = results.filter(r => r.solverStatus === 'INFEASIBLE' || r.objectiveScore === 0);
  const successes = results.filter(r => r.solverStatus === 'OPTIMAL' && r.objectiveScore > 0);
  
  console.log(`\n🔍 FAILURE ANALYSIS:`);
  console.log(`   Total Tests: ${results.length}`);
  console.log(`   Successes (OPTIMAL): ${successes.length} (${(successes.length / results.length * 100).toFixed(1)}%)`);
  console.log(`   Failures (INFEASIBLE/0): ${failures.length} (${(failures.length / results.length * 100).toFixed(1)}%)`);
  
  if (failures.length > 0) {
    console.log(`\n   📉 Failure Patterns:`);
    
    // Group failures by crew size
    const failuresBySize = new Map<number, TestResult[]>();
    failures.forEach(f => {
      if (!failuresBySize.has(f.crewSize)) {
        failuresBySize.set(f.crewSize, []);
      }
      failuresBySize.get(f.crewSize)!.push(f);
    });
    
    failuresBySize.forEach((fails, size) => {
      console.log(`\n      ${size} crew: ${fails.length} failures`);
      
      // Find the threshold where failures start
      const allForSize = results.filter(r => r.crewSize === size).sort((a, b) => a.roleId - b.roleId);
      let firstFailure = allForSize.find(r => r.solverStatus === 'INFEASIBLE' || r.objectiveScore === 0);
      
      if (firstFailure) {
        console.log(`         First failure at: ${firstFailure.roleId} role requirements`);
        console.log(`         Status: ${firstFailure.solverStatus}`);
        if (firstFailure.violations && firstFailure.violations.length > 0) {
          console.log(`         Violations: ${firstFailure.violations.join(', ')}`);
        }
        
        // Show the role requirements that caused the first failure
        if (firstFailure.roleRequirements && firstFailure.roleRequirements.length > 0) {
          console.log(`         Role requirements causing issues:`);
          firstFailure.roleRequirements.forEach((req, idx) => {
            console.log(`            ${idx + 1}. Crew ${req.crewId} needs ${req.requiredHours}h on role ${req.roleId}`);
          });
        }
      }
      
      // Check for common violation patterns
      const allViolations = fails.flatMap(f => f.violations || []);
      if (allViolations.length > 0) {
        const violationCounts = new Map<string, number>();
        allViolations.forEach(v => {
          violationCounts.set(v, (violationCounts.get(v) || 0) + 1);
        });
        
        console.log(`         Common violations:`);
        Array.from(violationCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .forEach(([violation, count]) => {
            console.log(`            - ${violation}: ${count} occurrences`);
          });
      }
    });
  }
  
  console.log(`\n${'-'.repeat(80)}\n`);
  
  for (const size of crewSizes) {
    const sizeResults = results.filter(r => r.crewSize === size);
    if (sizeResults.length === 0) continue;
    
    console.log(`\n🎯 ${size} Crew Members (${sizeResults.length} tests):`);
    console.log(`${'─'.repeat(80)}`);
    
    // Trend Analysis
    const sortedTests = sizeResults.sort((a, b) => a.roleId - b.roleId);
    
    console.log(`\n   📈 Trend Analysis:`);
    console.log(`      Constraints │ Obj Score │ Satisfaction │  Std Dev  │   Min   │   Max   │  Time`);
    console.log(`      ${'─'.repeat(73)}`);
    
    sortedTests.forEach(test => {
      const sat = test.preferenceSatisfaction?.stats;
      console.log(`      ${test.roleId.toString().padStart(5)} req   │   ${test.objectiveScore.toString().padStart(5)}   │    ${((sat?.mean || 0) * 100).toFixed(1).padStart(5)}%   │   ${((sat?.stdDev || 0) * 100).toFixed(1).padStart(5)}%  │  ${((sat?.min || 0) * 100).toFixed(0).padStart(5)}%  │  ${((sat?.max || 0) * 100).toFixed(0).padStart(5)}%  │ ${test.executionTime.toString().padStart(4)}ms`);
    });
    
    // Calculate trend statistics
    const objScores = sortedTests.map(t => t.objectiveScore);
    const satMeans = sortedTests.map(t => t.preferenceSatisfaction?.stats.mean || 0);
    const satStdDevs = sortedTests.map(t => t.preferenceSatisfaction?.stats.stdDev || 0);
    
    console.log(`\n   📊 Statistics:`);
    console.log(`      Objective Score:     ${Math.min(...objScores).toFixed(0)} → ${Math.max(...objScores).toFixed(0)} (Δ ${(Math.max(...objScores) - Math.min(...objScores)).toFixed(0)})`);
    console.log(`      Satisfaction Mean:   ${(Math.min(...satMeans) * 100).toFixed(1)}% → ${(Math.max(...satMeans) * 100).toFixed(1)}% (Δ ${((Math.max(...satMeans) - Math.min(...satMeans)) * 100).toFixed(1)}%)`);
    console.log(`      Satisfaction StdDev: ${(Math.min(...satStdDevs) * 100).toFixed(1)}% → ${(Math.max(...satStdDevs) * 100).toFixed(1)}% (Δ ${((Math.max(...satStdDevs) - Math.min(...satStdDevs)) * 100).toFixed(1)}%)`);
  }
  
  console.log(`\n\n✅ Testing complete! Ran ${results.length} total tests.\n`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
