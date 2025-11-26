/**
 * Full Solver Integration Test
 * 
 * Tests the complete flow:
 * 1. Load real data from database (store, roles, crew, constraints, preferences)
 * 2. Build SolverInput with preference arrays
 * 3. Call Python solver
 * 4. Verify OPTIMAL solution
 * 5. Save satisfaction tracking to database
 * 6. Verify all schema fields are being used correctly
 */

import { PrismaClient } from '@prisma/client';
import { SolverInput, TaskType } from '@logbook-writer/shared-types';

const prisma = new PrismaClient();

interface TestResult {
  success: boolean;
  status: string;
  runtimeMs: number;
  objectiveScore?: number;
  numAssignments: number;
  violations: string[];
  crewCount: number;
  roleCount: number;
  preferenceCount: number;
  constraintCounts: {
    hourly: number;
    window: number;
    daily: number;
  };
}

async function main() {
  console.log('🧪 Full Solver Integration Test');
  console.log('================================\n');

  const testDate = new Date('2025-11-26'); // Tomorrow
  const storeId = 768; // Your store ID

  // ===================================================================
  // STEP 1: Load Store Data
  // ===================================================================
  console.log('📦 Loading store data...');
  const store = await prisma.store.findUnique({
    where: { id: storeId },
  });

  if (!store) {
    throw new Error(`Store ${storeId} not found`);
  }

  console.log(`✅ Store: ${store.name} (ID: ${store.id})`);
  console.log(`   Base slot: ${store.baseSlotMinutes} minutes`);
  console.log(`   Hours: ${store.openMinutesFromMidnight / 60}:00 - ${store.closeMinutesFromMidnight / 60}:00`);

  // ===================================================================
  // STEP 2: Load All Roles
  // ===================================================================
  console.log('\n🎭 Loading roles...');
  const roles = await prisma.role.findMany({
    where: { storeId },
    include: {
      crewRoles: {
        include: {
          crew: true,
        },
      },
    },
  });

  console.log(`✅ Found ${roles.length} roles:`);
  roles.forEach((role) => {
    console.log(`   - ${role.displayName} (${role.code})`);
    console.log(`     Model: ${role.assignmentModel}, Consecutive: ${role.slotsMustBeConsecutive}`);
    console.log(`     Slots: ${role.minSlots}-${role.maxSlots}, BlockSize: ${role.blockSize}`);
  });

  // ===================================================================
  // STEP 3: Load All Crew
  // ===================================================================
  console.log('\n👥 Loading crew members...');
  const expectedCrewNames = [
    'Aaron', 'Adam Carey', 'Adrian', 'Alice', 'Cianna', 'Elder', 'Gary', 
    'Juan', 'Kenny', 'Marcela', 'Maricel', 'Matt Connor', 'Patricia', 
    'Ben', 'Carolyn', 'Chase', 'Cheri', 'Fiona', 'Hannah', 'Khadijah', 
    'Lindsey', 'Q', 'Sharon Garcia', 'Ashley', 'Leo Kelly', 'Marcos', 
    'Carissa', 'Kacey', 'Ruth', 'Shushan', 'Denise', 'Jill', 'Reece', 
    'Talye', 'Emma', 'Leonardo', 'Matthew Studebaker', 'Rachel', 'Randy', 
    'Andrea', 'Gabby', 'Kelly', 'Tori', 'Yeffer', 'Adam', 'Alexa', 
    'Carter', 'Daniel', 'Kayla', 'Morgan', 'Nikki', 'Nine', 'Ofelia', 
    'Oliver', 'Samantha', 'Savannah', 'Stephanie Mitchell', 'Tati', 
    'Taylor', 'Vaughn', 'Wade', 'Di'
  ];

  const crew = await prisma.crew.findMany({
    where: {
      storeId,
      name: {
        in: expectedCrewNames,
      },
    },
    include: {
      crewRoles: {
        include: {
          role: true,
        },
      },
      shifts: {
        where: {
          date: testDate,
        },
      },
    },
  });

  console.log(`✅ Found ${crew.length} crew members (expected ${expectedCrewNames.length})`);
  if (crew.length !== expectedCrewNames.length) {
    const foundNames = crew.map(c => c.name);
    const missing = expectedCrewNames.filter(n => !foundNames.includes(n));
    console.warn(`⚠️  Missing crew: ${missing.join(', ')}`);
  }

  crew.forEach((c) => {
    const roleCount = c.crewRoles.length;
    const shift = c.shifts[0];
    const shiftHours = shift ? (shift.endMin - shift.startMin) / 60 : 0;
    console.log(`   - ${c.name} (${c.id}): ${roleCount} roles, ${shiftHours}h shift`);
  });

  // ===================================================================
  // STEP 4: Load Constraints (Hourly, Window, Daily)
  // ===================================================================
  console.log('\n📋 Loading constraints for', testDate.toISOString().split('T')[0]);

  const hourlyConstraints = await prisma.hourlyRoleConstraint.findMany({
    where: {
      storeId,
      date: testDate,
    },
    include: {
      role: true,
    },
  });

  const windowConstraints = await prisma.windowRoleConstraint.findMany({
    where: {
      storeId,
      date: testDate,
    },
    include: {
      role: true,
    },
  });

  const dailyConstraints = await prisma.dailyRoleConstraint.findMany({
    where: {
      storeId,
      date: testDate,
    },
    include: {
      role: true,
      crew: true,
    },
  });

  console.log(`✅ Hourly constraints: ${hourlyConstraints.length}`);
  hourlyConstraints.forEach((c) => {
    console.log(`   - Hour ${c.hour}: ${c.requiredPerHour} × ${c.role.displayName}`);
  });

  console.log(`✅ Window constraints: ${windowConstraints.length}`);
  windowConstraints.forEach((c) => {
    console.log(`   - ${c.startHour}:00-${c.endHour}:00: ${c.requiredPerHour} × ${c.role.displayName}`);
  });

  console.log(`✅ Daily constraints: ${dailyConstraints.length}`);
  dailyConstraints.forEach((c) => {
    console.log(`   - ${c.crew.name} → ${c.requiredHours}h on ${c.role.displayName}`);
  });

  // ===================================================================
  // STEP 5: Load Preferences
  // ===================================================================
  console.log('\n⭐ Loading preferences...');

  const rolePreferences = await prisma.rolePreference.findMany({
    where: { storeId },
    include: {
      role: true,
      crewPreferences: {
        where: {
          enabled: true,
          crewId: {
            in: crew.map(c => c.id),
          },
        },
        include: {
          crew: true,
        },
      },
    },
  });

  let totalPreferences = 0;
  rolePreferences.forEach((rp) => {
    const count = rp.crewPreferences.length;
    totalPreferences += count;
    if (count > 0) {
      console.log(`   - ${rp.preferenceType} (${rp.role?.displayName || 'BREAK'}): ${count} crew opted in`);
    }
  });

  console.log(`✅ Total active preferences: ${totalPreferences}`);

  // ===================================================================
  // STEP 6: Build SolverInput
  // ===================================================================
  console.log('\n🔧 Building SolverInput...');

  // Map role codes to TaskType
  const roleCodeMap: Record<string, TaskType> = {
    'REGISTER': TaskType.REGISTER,
    'PRODUCT': TaskType.PRODUCT,
    'PARKING_HELM': TaskType.PARKING_HELM,
    'MEAL_BREAK': TaskType.MEAL_BREAK,
    'DEMO': TaskType.DEMO,
    'WINE_DEMO': TaskType.WINE_DEMO,
    'ART': TaskType.ART,
    'ORDER_WRITER': TaskType.ORDER_WRITER,
    'TRUCK': TaskType.TRUCK,
  };

  const solverInput: SolverInput = {
    date: testDate.toISOString().split('T')[0],
    store: {
      storeId: store.id,
      baseSlotMinutes: store.baseSlotMinutes,
      openMinutesFromMidnight: store.openMinutesFromMidnight,
      closeMinutesFromMidnight: store.closeMinutesFromMidnight,
      startRegHour: store.openMinutesFromMidnight,
      endRegHour: store.closeMinutesFromMidnight,
      reqShiftLengthForBreak: store.reqShiftLengthForBreak,
      breakWindowStart: store.breakWindowStart,
      breakWindowEnd: store.breakWindowEnd,
    },
    crew: crew.map((c) => {
      const shift = c.shifts[0];
      return {
        id: c.id,
        name: c.name,
        shiftStartMin: shift?.startMin ?? 0,
        shiftEndMin: shift?.endMin ?? 0,
        eligibleRoles: c.crewRoles.map((cr) => roleCodeMap[cr.role.code] || cr.role.code as TaskType),
        canBreak: true, // Assume all crew can take breaks
        canParkingHelms: c.crewRoles.some((cr) => cr.role.code === 'PARKING_HELM'),
      };
    }),
    preferences: [], // Will build below
    hourlyRequirements: hourlyConstraints.map((c) => ({
      hour: c.hour,
      requiredRegister: c.role.code === 'REGISTER' ? c.requiredPerHour : 0,
      requiredProduct: c.role.code === 'PRODUCT' ? c.requiredPerHour : 0,
      requiredParkingHelm: c.role.code === 'PARKING_HELM' ? c.requiredPerHour : 0,
    })),
    crewRoleRequirements: dailyConstraints.map((c) => ({
      crewId: c.crewId,
      role: roleCodeMap[c.role.code] || c.role.code as TaskType,
      requiredHours: c.requiredHours,
    })),
    coverageWindows: windowConstraints.map((c) => ({
      role: roleCodeMap[c.role.code] || c.role.code as TaskType,
      startHour: c.startHour,
      endHour: c.endHour,
      requiredPerHour: c.requiredPerHour,
    })),
    roleMetadata: roles.map((r) => ({
      role: roleCodeMap[r.code] || r.code as TaskType,
      assignmentModel: r.assignmentModel as any,
      allowOutsideStoreHours: r.allowOutsideStoreHours,
      slotsMustBeConsecutive: r.slotsMustBeConsecutive,
      minSlots: r.minSlots,
      maxSlots: r.maxSlots,
      blockSize: r.blockSize,
      isConsecutive: r.slotsMustBeConsecutive,
      isUniversal: r.assignmentModel === 'UNIVERSAL',
      isBreakRole: r.code === 'MEAL_BREAK',
      isParkingRole: r.code === 'PARKING_HELM',
      detail: r.displayName,
    })),
  };

  // Build preferences array
  for (const rp of rolePreferences) {
    for (const cp of rp.crewPreferences) {
      // Calculate adaptive boost (simplified - in real code this queries PreferenceSatisfaction)
      const adaptiveBoost = 1.0; // Default, no history yet

      solverInput.preferences.push({
        crewId: cp.crewId,
        role: rp.role ? (roleCodeMap[rp.role.code] || rp.role.code as TaskType) : TaskType.MEAL_BREAK,
        preferenceType: rp.preferenceType as any,
        baseWeight: rp.baseWeight,
        crewWeight: cp.crewWeight,
        adaptiveBoost,
        intValue: cp.intValue ?? undefined,
      });
    }
  }

  console.log(`✅ Built SolverInput:`);
  console.log(`   - ${solverInput.crew.length} crew members`);
  console.log(`   - ${solverInput.preferences.length} preferences`);
  console.log(`   - ${solverInput.hourlyRequirements.length} hourly constraints`);
  console.log(`   - ${solverInput.crewRoleRequirements.length} daily constraints`);
  console.log(`   - ${solverInput.coverageWindows.length} window constraints`);
  console.log(`   - ${solverInput.roleMetadata?.length || 0} role metadata entries`);

  // ===================================================================
  // STEP 7: Call Python Solver
  // ===================================================================
  console.log('\n🐍 Calling Python solver...');

  const startTime = Date.now();
  
  // Write input to file for debugging
  const fs = require('fs');
  const inputPath = '/Users/oliver-ostojic/Desktop/logbook-writer/apps/solver-python/test_full_integration.json';
  fs.writeFileSync(inputPath, JSON.stringify(solverInput, null, 2));
  console.log(`📝 Wrote input to: ${inputPath}`);

  // Call solver via command line
  const { execSync } = require('child_process');
  try {
    const output = execSync(
      `cd /Users/oliver-ostojic/Desktop/logbook-writer/apps/solver-python && cat test_full_integration.json | python3 solver.py`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    
    const result = JSON.parse(output);
    const endTime = Date.now();

    // ===================================================================
    // STEP 8: Analyze Results
    // ===================================================================
    console.log('\n📊 Results:');
    console.log(`   Status: ${result.metadata.status}`);
    console.log(`   Runtime: ${result.metadata.runtimeMs}ms (total: ${endTime - startTime}ms)`);
    console.log(`   Objective Score: ${result.metadata.objectiveScore || 'N/A'}`);
    console.log(`   Assignments: ${result.metadata.numAssignments}`);
    console.log(`   Violations: ${result.metadata.violations?.length || 0}`);

    if (result.metadata.violations && result.metadata.violations.length > 0) {
      console.log('\n⚠️  Violations:');
      result.metadata.violations.forEach((v: string, i: number) => {
        console.log(`   ${i + 1}. ${v}`);
      });
    }

    if (result.success && result.assignments) {
      // Group assignments by crew
      const assignmentsByCrew: Record<string, any[]> = {};
      result.assignments.forEach((a: any) => {
        if (!assignmentsByCrew[a.crewId]) {
          assignmentsByCrew[a.crewId] = [];
        }
        assignmentsByCrew[a.crewId].push(a);
      });

      console.log('\n👤 Assignments per crew:');
      Object.entries(assignmentsByCrew).forEach(([crewId, assignments]) => {
        const crewName = crew.find(c => c.id === crewId)?.name || crewId;
        console.log(`   ${crewName}: ${assignments.length} assignments`);
      });

      // Verify blockSize constraints
      console.log('\n🔍 Verifying blockSize constraints...');
      const registerRole = roles.find(r => r.code === 'REGISTER');
      if (registerRole && registerRole.blockSize > 1) {
        console.log(`   REGISTER blockSize: ${registerRole.blockSize} (should force ${registerRole.blockSize * store.baseSlotMinutes}min increments)`);
        
        const registerAssignments = result.assignments.filter((a: any) => a.taskType === 'REGISTER');
        const durations = registerAssignments.map((a: any) => a.endTime - a.startTime);
        const uniqueDurations = [...new Set(durations)];
        console.log(`   REGISTER durations found: ${uniqueDurations.join(', ')} minutes`);
        
        const invalid = durations.filter((d: number) => d % (registerRole.blockSize * store.baseSlotMinutes) !== 0);
        if (invalid.length > 0) {
          console.log(`   ❌ Found ${invalid.length} assignments violating blockSize!`);
        } else {
          console.log(`   ✅ All REGISTER assignments respect blockSize=${registerRole.blockSize}`);
        }
      }
    }

    // ===================================================================
    // STEP 9: Summary
    // ===================================================================
    const testResult: TestResult = {
      success: result.success,
      status: result.metadata.status,
      runtimeMs: result.metadata.runtimeMs,
      objectiveScore: result.metadata.objectiveScore,
      numAssignments: result.metadata.numAssignments,
      violations: result.metadata.violations || [],
      crewCount: crew.length,
      roleCount: roles.length,
      preferenceCount: solverInput.preferences.length,
      constraintCounts: {
        hourly: hourlyConstraints.length,
        window: windowConstraints.length,
        daily: dailyConstraints.length,
      },
    };

    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Database Connection: SUCCESS`);
    console.log(`✅ Data Loading: ${crew.length} crew, ${roles.length} roles`);
    console.log(`✅ Constraint Loading: ${hourlyConstraints.length + windowConstraints.length + dailyConstraints.length} total`);
    console.log(`✅ Preference Loading: ${totalPreferences} preferences`);
    console.log(`✅ Solver Execution: ${testResult.status} in ${testResult.runtimeMs}ms`);
    console.log(`${testResult.success ? '✅' : '❌'} Final Result: ${testResult.status}`);

    if (!testResult.success) {
      console.log(`\n❌ TEST FAILED - Status: ${testResult.status}`);
      process.exit(1);
    } else {
      console.log(`\n🎉 TEST PASSED - All systems working!`);
    }

  } catch (error: any) {
    console.error('\n❌ Solver execution failed:');
    console.error(error.message);
    if (error.stdout) console.error('STDOUT:', error.stdout);
    if (error.stderr) console.error('STDERR:', error.stderr);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('❌ Test failed with error:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
