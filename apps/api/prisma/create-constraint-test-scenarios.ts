/**
 * Generate constraint test scenarios for validating solver behavior
 * 
 * Creates comprehensive test cases for each constraint type that can be
 * used to verify the solver correctly enforces business rules.
 */

import { PrismaClient } from '@prisma/client';
import type { 
  ConstraintTestScenario,
  ConstraintTestSuite 
} from '../../../packages/shared-types/src/constraint-testing';
import type { SolverInput, TaskType } from '../../../packages/shared-types/src/solver';

const prisma = new PrismaClient();

const STORE_ID = 768;
const TEST_DATE = '2025-11-25';

/**
 * Create base solver input with minimal crew and store config
 */
function createBaseSolverInput(overrides: Partial<SolverInput> = {}): SolverInput {
  return {
    date: TEST_DATE,
    store: {
      storeId: STORE_ID,
      baseSlotMinutes: 30,
      openMinutesFromMidnight: 480,  // 8:00am
      closeMinutesFromMidnight: 1260,   // 9:00pm
      startRegHour: 8,
      endRegHour: 21,
      reqShiftLengthForBreak: 360,
      breakWindowStart: 180,
      breakWindowEnd: 270,
      consecutiveProdWeight: 40,
      consecutiveRegWeight: 40,
      earlyBreakWeight: 40,
      lateBreakWeight: 40,
      productFirstHourWeight: 1000,
      productTaskWeight: 200,
      registerFirstHourWeight: 1000,
      registerTaskWeight: 200,
      ...overrides.store
    },
    crew: [],
    hourlyRequirements: [],
    crewRoleRequirements: [],
    coverageWindows: [],
    roleMetadata: [],
    timeLimitSeconds: 60,
    ...overrides
  };
}

/**
 * Test Scenario 1: Store Hours Enforcement
 * Verify assignments only happen within openMinutesFromMidnight and closeMinutesFromMidnight
 */
function createStoreHoursScenario(): ConstraintTestScenario {
  return {
    id: 'store-hours-basic',
    name: 'Store Hours Enforcement',
    description: 'Verify that crew assignments respect store open/close hours',
    constraintType: 'STORE_HOURS',
    solverInput: createBaseSolverInput({
      crew: [
        {
          id: 'crew_early',
          name: 'Early Crew',
          shiftStartMin: 420,  // 7:00am (before store opens)
          shiftEndMin: 900,    // 3:00pm
          shiftStartHour: 7,
          shiftLength: 8,
          roles: [{ role: 'REGISTER', assignmentMode: 'UNIVERSAL' }],
          canBreak: true
        },
        {
          id: 'crew_late',
          name: 'Late Crew',
          shiftStartMin: 780,   // 1:00pm
          shiftEndMin: 1320,    // 10:00pm (after store closes)
          shiftStartHour: 13,
          shiftLength: 9,
          roles: [{ role: 'REGISTER', assignmentMode: 'UNIVERSAL' }],
          canBreak: true
        }
      ],
      roleMetadata: [
        {
          role: 'REGISTER',
          isUniversal: true,
          isConsecutive: false,
          isBreakRole: false,
          isParkingRole: false
        }
      ]
    }),
    expectations: {
      shouldSucceed: true,
      requiredAssignments: [
        { crewId: 'crew_early', role: 'REGISTER', minSlots: 1 },
        { crewId: 'crew_late', role: 'REGISTER', minSlots: 1 }
      ]
    }
  };
}

/**
 * Test Scenario 2: Break Window Policy
 * Verify breaks are assigned within reqShiftLengthForBreak and breakWindow
 */
function createBreakPolicyScenario(): ConstraintTestScenario {
  return {
    id: 'break-policy-enforcement',
    name: 'Break Window Policy',
    description: 'Verify 6+ hour shifts get breaks in the 3-4.5h window',
    constraintType: 'BREAK_POLICY',
    solverInput: createBaseSolverInput({
      store: {
        id: STORE_ID,
        name: 'Test Store',
        regHoursStartMin: 480,
        regHoursEndMin: 1080,  // 6:00pm for shorter day
        reqShiftLengthForBreak: 360,  // 6 hours
        breakWindowStart: 180,        // 3 hours from shift start
        breakWindowEnd: 270             // 4.5 hours from shift start
      },
      crew: [
        {
          id: 'crew_long',
          name: 'Long Shift Crew',
          shiftStartMin: 480,  // 8:00am
          shiftEndMin: 960,    // 4:00pm (8 hours - requires break)
          shiftStartHour: 8,
          shiftLength: 8,
          roles: [{ role: 'PRODUCT', assignmentMode: 'UNIVERSAL' }],
          canBreak: true
        },
        {
          id: 'crew_short',
          name: 'Short Shift Crew',
          shiftStartMin: 480,  // 8:00am
          shiftEndMin: 780,    // 1:00pm (5 hours - no break required)
          shiftStartHour: 8,
          shiftLength: 5,
          roles: [{ role: 'PRODUCT', assignmentMode: 'UNIVERSAL' }],
          canBreak: true
        }
      ],
      roleMetadata: [
        {
          role: 'PRODUCT',
          isUniversal: true,
          isConsecutive: false,
          isBreakRole: false,
          isParkingRole: false
        },
        {
          role: 'MEAL_BREAK',
          isUniversal: false,
          isConsecutive: false,
          isBreakRole: true,
          isParkingRole: false
        }
      ]
    }),
    expectations: {
      shouldSucceed: true,
      requiredAssignments: [
        { crewId: 'crew_long', role: 'MEAL_BREAK', minSlots: 1, maxSlots: 1 },
        // crew_short should NOT have a break
      ]
    }
  };
}

/**
 * Test Scenario 3: Hourly Role Constraint (UNIVERSAL assignment model)
 * Verify exact staffing levels per hour
 */
function createHourlyConstraintScenario(): ConstraintTestScenario {
  return {
    id: 'hourly-constraint-register',
    name: 'Hourly Role Constraint',
    description: 'Verify exact N crew per hour on REGISTER role',
    constraintType: 'HOURLY_CONSTRAINT',
    solverInput: createBaseSolverInput({
      crew: [
        {
          id: 'crew_1',
          name: 'Crew 1',
          shiftStartMin: 480,
          shiftEndMin: 960,
          shiftStartHour: 8,
          shiftLength: 8,
          roles: [{ role: 'REGISTER', assignmentMode: 'UNIVERSAL' }],
          canBreak: false
        },
        {
          id: 'crew_2',
          name: 'Crew 2',
          shiftStartMin: 540,
          shiftEndMin: 1020,
          shiftStartHour: 9,
          shiftLength: 8,
          roles: [{ role: 'REGISTER', assignmentMode: 'UNIVERSAL' }],
          canBreak: false
        },
        {
          id: 'crew_3',
          name: 'Crew 3',
          shiftStartMin: 600,
          shiftEndMin: 1080,
          shiftStartHour: 10,
          shiftLength: 8,
          roles: [{ role: 'REGISTER', assignmentMode: 'UNIVERSAL' }, { role: 'PRODUCT', assignmentMode: 'UNIVERSAL' }],
          canBreak: false
        }
      ],
      hourlyRequirements: [
        { hour: 8, requiredRegister: 1, requiredProduct: 0, requiredParkingHelm: 0 },
        { hour: 9, requiredRegister: 2, requiredProduct: 0, requiredParkingHelm: 0 },
        { hour: 10, requiredRegister: 2, requiredProduct: 1, requiredParkingHelm: 0 },
        { hour: 11, requiredRegister: 2, requiredProduct: 1, requiredParkingHelm: 0 },
        { hour: 12, requiredRegister: 2, requiredProduct: 0, requiredParkingHelm: 0 },
      ],
      roleMetadata: [
        { role: 'REGISTER', isUniversal: true, isConsecutive: false, isBreakRole: false, isParkingRole: false },
        { role: 'PRODUCT', isUniversal: true, isConsecutive: false, isBreakRole: false, isParkingRole: false }
      ]
    }),
    expectations: {
      shouldSucceed: true
    }
  };
}

/**
 * Test Scenario 4: Window Role Constraint (COVERAGE_WINDOW assignment model)
 * Verify coverage windows are staffed correctly
 */
function createWindowConstraintScenario(): ConstraintTestScenario {
  return {
    id: 'window-constraint-demo',
    name: 'Coverage Window Constraint',
    description: 'Verify DEMO coverage window requires N crew for entire window',
    constraintType: 'WINDOW_CONSTRAINT',
    solverInput: createBaseSolverInput({
      crew: [
        {
          id: 'demo_1',
          name: 'Demo Crew 1',
          shiftStartMin: 600,  // 10:00am
          shiftEndMin: 840,    // 2:00pm
          shiftStartHour: 10,
          shiftLength: 4,
          roles: [{ role: 'DEMO', assignmentMode: 'TEAM_WINDOW' }],
          canBreak: false
        },
        {
          id: 'demo_2',
          name: 'Demo Crew 2',
          shiftStartMin: 660,  // 11:00am
          shiftEndMin: 900,    // 3:00pm
          shiftStartHour: 11,
          shiftLength: 4,
          roles: [{ role: 'DEMO', assignmentMode: 'TEAM_WINDOW' }],
          canBreak: false
        },
        {
          id: 'wine_demo',
          name: 'Wine Demo Crew',
          shiftStartMin: 720,  // 12:00pm
          shiftEndMin: 960,    // 4:00pm
          shiftStartHour: 12,
          shiftLength: 4,
          roles: [{ role: 'WINE_DEMO', assignmentMode: 'TEAM_WINDOW' }],
          canBreak: false
        }
      ],
      coverageWindows: [
        {
          role: 'DEMO',
          startHour: 11,
          endHour: 14,  // 11am-2pm
          requiredPerHour: 2
        },
        {
          role: 'WINE_DEMO',
          startHour: 12,
          endHour: 15,  // 12pm-3pm
          requiredPerHour: 1
        }
      ],
      roleMetadata: [
        { role: 'DEMO', isUniversal: false, isConsecutive: true, isBreakRole: false, isParkingRole: false },
        { role: 'WINE_DEMO', isUniversal: false, isConsecutive: true, isBreakRole: false, isParkingRole: false }
      ]
    }),
    expectations: {
      shouldSucceed: true
    }
  };
}

/**
 * Test Scenario 5: Daily Role Constraint (CREW_SPECIFIC assignment model)
 * Verify crew must complete exact hours on specific role
 */
function createDailyConstraintScenario(): ConstraintTestScenario {
  return {
    id: 'daily-constraint-order-writer',
    name: 'Daily Crew-Specific Role Hours',
    description: 'Verify crew must work exact required hours on ORDER_WRITER',
    constraintType: 'DAILY_CONSTRAINT',
    solverInput: createBaseSolverInput({
      crew: [
        {
          id: 'ow_1',
          name: 'Order Writer 1',
          shiftStartMin: 480,
          shiftEndMin: 960,
          shiftStartHour: 8,
          shiftLength: 8,
          roles: [
            { role: 'ORDER_WRITER', assignmentMode: 'INDIVIDUAL_HOURS' },
            { role: 'REGISTER', assignmentMode: 'UNIVERSAL' }
          ],
          canBreak: false
        },
        {
          id: 'art_1',
          name: 'Art Crew 1',
          shiftStartMin: 540,
          shiftEndMin: 1020,
          shiftStartHour: 9,
          shiftLength: 8,
          roles: [
            { role: 'ART', assignmentMode: 'INDIVIDUAL_HOURS' },
            { role: 'PRODUCT', assignmentMode: 'UNIVERSAL' }
          ],
          canBreak: false
        }
      ],
      crewRoleRequirements: [
        {
          crewId: 'ow_1',
          role: 'ORDER_WRITER',
          requiredHours: 3  // Must do exactly 3 hours
        },
        {
          crewId: 'art_1',
          role: 'ART',
          requiredHours: 2  // Must do exactly 2 hours
        }
      ],
      roleMetadata: [
        { role: 'ORDER_WRITER', isUniversal: false, isConsecutive: true, isBreakRole: false, isParkingRole: false },
        { role: 'ART', isUniversal: false, isConsecutive: true, isBreakRole: false, isParkingRole: false },
        { role: 'REGISTER', isUniversal: true, isConsecutive: false, isBreakRole: false, isParkingRole: false },
        { role: 'PRODUCT', isUniversal: true, isConsecutive: false, isBreakRole: false, isParkingRole: false }
      ]
    }),
    expectations: {
      shouldSucceed: true,
      requiredAssignments: [
        { crewId: 'ow_1', role: 'ORDER_WRITER', minSlots: 6, maxSlots: 6 },  // exactly 3 hours = 6 slots
        { crewId: 'art_1', role: 'ART', minSlots: 4, maxSlots: 4 }            // exactly 2 hours = 4 slots
      ]
    }
  };
}

/**
 * Test Scenario 6: Consecutive Slots Enforcement
 * Verify roles with slotsMustBeConsecutive flag are not fragmented
 */
function createConsecutiveSlotsScenario(): ConstraintTestScenario {
  return {
    id: 'consecutive-slots-order-writer',
    name: 'Consecutive Slots Enforcement',
    description: 'Verify ORDER_WRITER role slots must be consecutive (no fragmentation)',
    constraintType: 'CONSECUTIVE_SLOTS',
    solverInput: createBaseSolverInput({
      crew: [
        {
          id: 'ow_consec',
          name: 'Order Writer Consecutive',
          shiftStartMin: 480,
          shiftEndMin: 960,
          shiftStartHour: 8,
          shiftLength: 8,
          roles: [
            { role: 'ORDER_WRITER', assignmentMode: 'INDIVIDUAL_HOURS' },
            { role: 'PRODUCT', assignmentMode: 'UNIVERSAL' }
          ],
          canBreak: false
        }
      ],
      crewRoleRequirements: [
        {
          crewId: 'ow_consec',
          role: 'ORDER_WRITER',
          requiredHours: 4
        }
      ],
      roleMetadata: [
        { 
          role: 'ORDER_WRITER', 
          isUniversal: false, 
          isConsecutive: true,  // MUST be consecutive
          isBreakRole: false, 
          isParkingRole: false 
        },
        { role: 'PRODUCT', isUniversal: true, isConsecutive: false, isBreakRole: false, isParkingRole: false }
      ]
    }),
    expectations: {
      shouldSucceed: true,
      requiredAssignments: [
        { crewId: 'ow_consec', role: 'ORDER_WRITER', minSlots: 8, maxSlots: 8 }
      ]
    }
  };
}

/**
 * Test Scenario 7: Min/Max Slots Enforcement
 * Verify role blocks respect minSlots and maxSlots from Role model
 */
function createMinMaxSlotsScenario(): ConstraintTestScenario {
  return {
    id: 'min-max-slots-register',
    name: 'Min/Max Slots per Block',
    description: 'Verify REGISTER assignments respect minSlots=4 (2h) and maxSlots=10 (5h)',
    constraintType: 'MIN_MAX_SLOTS',
    solverInput: createBaseSolverInput({
      crew: [
        {
          id: 'crew_minmax',
          name: 'Min/Max Test Crew',
          shiftStartMin: 480,
          shiftEndMin: 1080,  // 10 hour shift
          shiftStartHour: 8,
          shiftLength: 10,
          roles: [
            { role: 'REGISTER', assignmentMode: 'UNIVERSAL' },
            { role: 'PRODUCT', assignmentMode: 'UNIVERSAL' }
          ],
          canBreak: true
        }
      ],
      hourlyRequirements: [
        { hour: 8, requiredRegister: 1, requiredProduct: 0, requiredParkingHelm: 0 },
        { hour: 9, requiredRegister: 1, requiredProduct: 0, requiredParkingHelm: 0 },
        { hour: 10, requiredRegister: 1, requiredProduct: 0, requiredParkingHelm: 0 },
      ],
      roleMetadata: [
        { 
          role: 'REGISTER', 
          isUniversal: true, 
          isConsecutive: false, 
          isBreakRole: false, 
          isParkingRole: false,
          // minSlots: 4 (2 hours) and maxSlots: 10 (5 hours) will be from DB Role model
        },
        { role: 'PRODUCT', isUniversal: true, isConsecutive: false, isBreakRole: false, isParkingRole: false },
        { role: 'MEAL_BREAK', isUniversal: false, isConsecutive: false, isBreakRole: true, isParkingRole: false }
      ]
    }),
    expectations: {
      shouldSucceed: true
    }
  };
}

/**
 * Test Scenario 8: Allow Outside Store Hours
 * Verify roles with allowOutsideStoreHours=true can be assigned before/after store hours
 */
function createOutsideStoreHoursScenario(): ConstraintTestScenario {
  return {
    id: 'outside-hours-truck',
    name: 'Allow Outside Store Hours',
    description: 'Verify TRUCK role can be assigned before store opens (allowOutsideStoreHours=true)',
    constraintType: 'OUTSIDE_HOURS_ALLOWED',
    solverInput: createBaseSolverInput({
      crew: [
        {
          id: 'truck_crew',
          name: 'Truck Crew',
          shiftStartMin: 360,  // 6:00am (2 hours before store opens)
          shiftEndMin: 840,    // 2:00pm
          shiftStartHour: 6,
          shiftLength: 8,
          roles: [
            { role: 'TRUCK', assignmentMode: 'INDIVIDUAL_HOURS' },
            { role: 'PRODUCT', assignmentMode: 'UNIVERSAL' }
          ],
          canBreak: true
        }
      ],
      crewRoleRequirements: [
        {
          crewId: 'truck_crew',
          role: 'TRUCK',
          requiredHours: 2  // Should be assigned 6am-8am
        }
      ],
      roleMetadata: [
        { 
          role: 'TRUCK', 
          isUniversal: false, 
          isConsecutive: true, 
          isBreakRole: false, 
          isParkingRole: false,
          // allowOutsideStoreHours: true (from DB Role model)
        },
        { role: 'PRODUCT', isUniversal: true, isConsecutive: false, isBreakRole: false, isParkingRole: false },
        { role: 'MEAL_BREAK', isUniversal: false, isConsecutive: false, isBreakRole: true, isParkingRole: false }
      ]
    }),
    expectations: {
      shouldSucceed: true,
      requiredAssignments: [
        { crewId: 'truck_crew', role: 'TRUCK', minSlots: 4, maxSlots: 4 }
      ]
    }
  };
}

/**
 * Test Scenario 9: Preference Weights
 * Verify preference weights correctly influence schedule optimization
 */
function createPreferenceWeightsScenario(): ConstraintTestScenario {
  return {
    id: 'preference-weights-first-hour',
    name: 'Preference Weight Influence',
    description: 'Verify crew with PRODUCT FIRST_HOUR preference gets product in first hour when possible',
    constraintType: 'PREFERENCE_WEIGHTS',
    solverInput: createBaseSolverInput({
      crew: [
        {
          id: 'pref_crew',
          name: 'Preference Test Crew',
          shiftStartMin: 480,
          shiftEndMin: 960,
          shiftStartHour: 8,
          shiftLength: 8,
          roles: [
            { role: 'REGISTER', assignmentMode: 'UNIVERSAL' },
            { role: 'PRODUCT', assignmentMode: 'UNIVERSAL' }
          ],
          preferences: [
            {
              rolePreferenceId: 1,  // PRODUCT FIRST_HOUR
              weight: 1000,
              intValue: null
            }
          ],
          canBreak: false
        }
      ],
      hourlyRequirements: [
        { hour: 8, requiredRegister: 0, requiredProduct: 1, requiredParkingHelm: 0 },
      ],
      roleMetadata: [
        { role: 'REGISTER', isUniversal: true, isConsecutive: false, isBreakRole: false, isParkingRole: false },
        { role: 'PRODUCT', isUniversal: true, isConsecutive: false, isBreakRole: false, isParkingRole: false }
      ]
    }),
    expectations: {
      shouldSucceed: true,
      requiredAssignments: [
        { crewId: 'pref_crew', role: 'PRODUCT', minSlots: 1 }  // Should get PRODUCT in first hour
      ]
    }
  };
}

/**
 * Generate complete test suite
 */
async function generateTestSuite(): Promise<ConstraintTestSuite> {
  const scenarios: ConstraintTestScenario[] = [
    createStoreHoursScenario(),
    createBreakPolicyScenario(),
    createHourlyConstraintScenario(),
    createWindowConstraintScenario(),
    createDailyConstraintScenario(),
    createConsecutiveSlotsScenario(),
    createMinMaxSlotsScenario(),
    createOutsideStoreHoursScenario(),
    createPreferenceWeightsScenario()
  ];

  return {
    name: 'Comprehensive Constraint Test Suite',
    description: 'Validates all solver constraint types in isolation',
    scenarios,
    historicalLogbooks: []  // Will be populated separately with real data
  };
}

/**
 * Save test suite to JSON file
 */
async function main() {
  console.log('Generating constraint test scenarios...\n');
  
  const suite = await generateTestSuite();
  
  console.log(`Generated ${suite.scenarios.length} test scenarios:`);
  suite.scenarios.forEach((scenario, idx) => {
    console.log(`  ${idx + 1}. [${scenario.constraintType}] ${scenario.name}`);
    console.log(`     ${scenario.description}`);
    console.log(`     Crew: ${scenario.solverInput.crew.length}, Expected: ${scenario.expectations.shouldSucceed ? 'SUCCESS' : 'FAILURE'}`);
  });
  
  // Save to file
  const fs = await import('fs/promises');
  const outputPath = './constraint-test-suite.json';
  await fs.writeFile(outputPath, JSON.stringify(suite, null, 2));
  
  console.log(`\n✅ Test suite saved to ${outputPath}`);
  console.log('\nNext steps:');
  console.log('1. Create constraint analysis tool to validate solver output');
  console.log('2. Create historical logbook data based on real schedules');
  console.log('3. Run scenarios through solver and validate results');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
