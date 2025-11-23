/**
 * End-to-End Solver Test
 * 
 * Tests the complete pipeline:
 * 1. Fetch crew from database
 * 2. Build solver input with store-based weights
 * 3. Run Python MILP solver
 * 4. Display satisfaction results
 */

import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();

const STORE_ID = 768;
const TEST_DATE = '2025-11-22'; // Tomorrow

interface SolverOutput {
  success: boolean;
  metadata: {
    status: string;
    objectiveScore?: number;
    runtimeMs: number;
    mipGap?: number;
    numCrew: number;
    numHours: number;
    numAssignments: number;
    violations?: string[];
  };
  assignments?: Array<{
    crewId: string;
    taskType: string;
    startTime: number;
    endTime: number;
  }>;
}

async function buildSolverInput() {
  console.log('📦 Building solver input...\n');
  
  // Get store with weights
  const store = await prisma.store.findUnique({
    where: { id: STORE_ID },
    select: {
      id: true,
      name: true,
      regHoursStartMin: true,
      regHoursEndMin: true,
      productFirstHourWeight: true,
      registerFirstHourWeight: true,
      productTaskWeight: true,
      registerTaskWeight: true,
      earlyBreakWeight: true,
      lateBreakWeight: true,
      consecutiveProdWeight: true,
      consecutiveRegWeight: true,
    }
  });
  
  if (!store) {
    throw new Error(`Store ${STORE_ID} not found`);
  }
  
  console.log(`Store: ${store.name}`);
  console.log(`Weights: PRODUCT task=${store.productTaskWeight}, REGISTER task=${store.registerTaskWeight}`);
  console.log(`         Early break=${store.earlyBreakWeight}, Late break=${store.lateBreakWeight}\n`);
  
  // Get all crew with roles and preferences
  const crew = await prisma.crew.findMany({
    where: { storeId: STORE_ID },
    include: {
      CrewRole: {
        include: {
          Role: true
        }
      }
    }
  });
  
  console.log(`Crew Members: ${crew.length}\n`);
  
  // Count preference distribution
  const prefStats = {
    task: { PRODUCT: 0, REGISTER: 0, NONE: 0 },
    firstHour: { PRODUCT: 0, REGISTER: 0, NONE: 0 },
    breakTiming: { early: 0, late: 0, none: 0 }
  };
  
  crew.forEach(c => {
    if (c.prefTask === 'PRODUCT') prefStats.task.PRODUCT++;
    else if (c.prefTask === 'REGISTER') prefStats.task.REGISTER++;
    else prefStats.task.NONE++;
    
    if (c.prefFirstHour === 'PRODUCT') prefStats.firstHour.PRODUCT++;
    else if (c.prefFirstHour === 'REGISTER') prefStats.firstHour.REGISTER++;
    else prefStats.firstHour.NONE++;
    
    if (c.prefBreakTiming === -1) prefStats.breakTiming.early++;
    else if (c.prefBreakTiming === 1) prefStats.breakTiming.late++;
    else prefStats.breakTiming.none++;
  });
  
  console.log('Preference Distribution:');
  console.log(`  Task: PRODUCT=${prefStats.task.PRODUCT}, REGISTER=${prefStats.task.REGISTER}, None=${prefStats.task.NONE}`);
  console.log(`  First Hour: PRODUCT=${prefStats.firstHour.PRODUCT}, REGISTER=${prefStats.firstHour.REGISTER}, None=${prefStats.firstHour.NONE}`);
  console.log(`  Break: Early=${prefStats.breakTiming.early}, Late=${prefStats.breakTiming.late}, None=${prefStats.breakTiming.none}\n`);
  
  // Build crew array for solver
  const solverCrew = crew.map(c => {
    const eligibleRoles: string[] = [];
    c.CrewRole.forEach(cr => {
      if (cr.Role.code) {
        eligibleRoles.push(cr.Role.code);
      }
    });
    
    // Always add MEAL_BREAK if they can break
    if (!eligibleRoles.includes('MEAL_BREAK')) {
      eligibleRoles.push('MEAL_BREAK');
    }
    
    // Look up weights from store based on preferences
    const prefFirstHourWeight = c.prefFirstHour === 'PRODUCT'
      ? store.productFirstHourWeight
      : c.prefFirstHour === 'REGISTER'
      ? store.registerFirstHourWeight
      : undefined;
    
    const prefTaskWeight = c.prefTask === 'PRODUCT'
      ? store.productTaskWeight
      : c.prefTask === 'REGISTER'
      ? store.registerTaskWeight
      : undefined;
    
    const prefBreakTimingWeight = c.prefBreakTiming === -1
      ? store.earlyBreakWeight
      : c.prefBreakTiming === 1
      ? store.lateBreakWeight
      : undefined;
    
    return {
      id: c.id,
      name: c.name,
      shiftStartMin: 480, // 8:00 AM
      shiftEndMin: 1020,  // 5:00 PM (9 hours)
      eligibleRoles,
      canBreak: true,
      canParkingHelms: eligibleRoles.includes('PARKING_HELM'),
      prefFirstHour: c.prefFirstHour || undefined,
      prefFirstHourWeight,
      prefTask: c.prefTask || undefined,
      prefTaskWeight,
      consecutiveProdWeight: store.consecutiveProdWeight,
      consecutiveRegWeight: store.consecutiveRegWeight,
      prefBreakTiming: c.prefBreakTiming || undefined,
      prefBreakTimingWeight,
    };
  });
  
  // Basic solver input (minimal for testing)
  const solverInput = {
    date: TEST_DATE,
    store: {
      storeId: store.id,
      minRegisterHours: 0,
      maxRegisterHours: 24,
  regHoursStartMin: store.regHoursStartMin,
  regHoursEndMin: store.regHoursEndMin,
    },
    crew: solverCrew,
    hourlyRequirements: [],
    crewRoleRequirements: [],
    coverageWindows: [],
    roleMetadata: [],
    timeLimitSeconds: 60, // 1 minute for testing
  };
  
  return solverInput;
}

async function callPythonSolver(input: any): Promise<SolverOutput> {
  return new Promise((resolve, reject) => {
    const SOLVER_DIR = path.join(process.cwd(), '..', 'solver-python');
    const PYTHON_VENV = path.join(SOLVER_DIR, 'venv', 'bin', 'python');
    const solverScript = path.join(SOLVER_DIR, 'solver.py');
    
    console.log('🐍 Calling Python solver...\n');
    
    const pythonProcess = spawn(PYTHON_VENV, [solverScript], {
      cwd: SOLVER_DIR,
    });
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Solver failed with code ${code}: ${stderr}`));
        return;
      }
      
      try {
        const result: SolverOutput = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse solver output: ${e}\nOutput: ${stdout}`));
      }
    });
    
    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to start solver: ${err.message}`));
    });
    
    // Write input to stdin
    pythonProcess.stdin.write(JSON.stringify(input));
    pythonProcess.stdin.end();
  });
}

function analyzeResults(output: SolverOutput, inputCrew: any[]) {
  console.log('\n' + '='.repeat(80));
  console.log('SOLVER RESULTS');
  console.log('='.repeat(80) + '\n');
  
  console.log(`Status: ${output.metadata.status}`);
  console.log(`Success: ${output.success ? '✅' : '❌'}`);
  console.log(`Runtime: ${output.metadata.runtimeMs}ms`);
  console.log(`Crew: ${output.metadata.numCrew}`);
  console.log(`Assignments: ${output.metadata.numAssignments}`);
  
  if (output.metadata.objectiveScore !== undefined) {
    console.log(`\nObjective Score: ${output.metadata.objectiveScore}`);
    console.log(`  Per Crew: ${(output.metadata.objectiveScore / output.metadata.numCrew).toFixed(1)}`);
    console.log(`  Per Assignment: ${(output.metadata.objectiveScore / output.metadata.numAssignments).toFixed(1)}`);
  }
  
  if (output.metadata.mipGap !== undefined) {
    console.log(`MIP Gap: ${(output.metadata.mipGap * 100).toFixed(2)}%`);
  }
  
  if (output.metadata.violations && output.metadata.violations.length > 0) {
    console.log(`\n⚠️  Violations: ${output.metadata.violations.length}`);
    output.metadata.violations.forEach(v => console.log(`  - ${v}`));
  }
  
  if (output.success && output.assignments) {
    console.log('\n' + '='.repeat(80));
    console.log('PREFERENCE SATISFACTION ANALYSIS');
    console.log('='.repeat(80) + '\n');
    
    // Analyze preference satisfaction
    const crewSatisfaction: Record<string, {
      name: string;
      prefFirstHour?: string;
      prefTask?: string;
      prefBreakTiming?: number;
      firstHourMet: boolean;
      taskSlots: { PRODUCT: number; REGISTER: number };
      breakSlot?: number;
    }> = {};
    
    // Initialize crew satisfaction tracking
    inputCrew.forEach(c => {
      crewSatisfaction[c.id] = {
        name: c.name,
        prefFirstHour: c.prefFirstHour,
        prefTask: c.prefTask,
        prefBreakTiming: c.prefBreakTiming,
        firstHourMet: false,
        taskSlots: { PRODUCT: 0, REGISTER: 0 },
      };
    });
    
    // Analyze assignments
    output.assignments.forEach(assignment => {
      const crew = crewSatisfaction[assignment.crewId];
      if (!crew) return;
      
      const slotIndex = assignment.startTime / 30;
      const firstSlot = 480 / 30; // 8:00 AM = slot 16
      
      // Check first hour preference
      if (slotIndex === firstSlot && assignment.taskType === crew.prefFirstHour) {
        crew.firstHourMet = true;
      }
      
      // Count task types
      if (assignment.taskType === 'PRODUCT') {
        crew.taskSlots.PRODUCT++;
      } else if (assignment.taskType === 'REGISTER') {
        crew.taskSlots.REGISTER++;
      } else if (assignment.taskType === 'MEAL_BREAK') {
        crew.breakSlot = slotIndex;
      }
    });
    
    // Calculate statistics
    let firstHourSatisfied = 0;
    let taskPreferenceSatisfied = 0;
    let crewWithPreferences = 0;
    
    Object.values(crewSatisfaction).forEach(crew => {
      let hasPreferences = false;
      
      if (crew.prefFirstHour) {
        hasPreferences = true;
        if (crew.firstHourMet) firstHourSatisfied++;
      }
      
      if (crew.prefTask) {
        hasPreferences = true;
        const preferredSlots = crew.taskSlots[crew.prefTask as 'PRODUCT' | 'REGISTER'] || 0;
        const totalTaskSlots = crew.taskSlots.PRODUCT + crew.taskSlots.REGISTER;
        if (totalTaskSlots > 0 && preferredSlots / totalTaskSlots > 0.5) {
          taskPreferenceSatisfied++;
        }
      }
      
      if (hasPreferences) crewWithPreferences++;
    });
    
    console.log('Overall Satisfaction:');
    if (crewWithPreferences > 0) {
      console.log(`  First Hour: ${firstHourSatisfied}/${crewWithPreferences} (${(firstHourSatisfied / crewWithPreferences * 100).toFixed(1)}%)`);
      console.log(`  Task Preference: ${taskPreferenceSatisfied}/${crewWithPreferences} (${(taskPreferenceSatisfied / crewWithPreferences * 100).toFixed(1)}%)`);
    } else {
      console.log('  No preferences set');
    }
    
    // Show sample assignments
    console.log('\nSample Assignments (first 5 crew):');
    Object.entries(crewSatisfaction).slice(0, 5).forEach(([id, crew]) => {
      console.log(`\n  ${crew.name} (${id}):`);
      if (crew.prefFirstHour) {
        console.log(`    First Hour Pref: ${crew.prefFirstHour} ${crew.firstHourMet ? '✅' : '❌'}`);
      }
      if (crew.prefTask) {
        console.log(`    Task Pref: ${crew.prefTask} (P:${crew.taskSlots.PRODUCT}, R:${crew.taskSlots.REGISTER})`);
      }
    });
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
}

async function main() {
  console.log('🚀 End-to-End Solver Test\n');
  console.log(`Date: ${TEST_DATE}`);
  console.log(`Store: ${STORE_ID}\n`);
  
  try {
    // Step 1: Build input
    const solverInput = await buildSolverInput();
    
    // Step 2: Call solver
    const solverOutput = await callPythonSolver(solverInput);
    
    // Step 3: Analyze results
    analyzeResults(solverOutput, solverInput.crew);
    
    console.log('✅ End-to-end test complete!\n');
    
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
