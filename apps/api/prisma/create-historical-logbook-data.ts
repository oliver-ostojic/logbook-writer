/**
 * Generate historical logbook test data based on real handwritten schedules
 * 
 * This tool helps create test cases comparing manual schedules against
 * the automated solver to validate improvements.
 */

import { PrismaClient } from '@prisma/client';
import type { 
  HistoricalLogbook,
  HistoricalAssignment,
  HistoricalConstraintAnalysis
} from '../../../packages/shared-types/src/constraint-testing';
import type { SolverInput, TaskType } from '../../../packages/shared-types/src/solver';

const prisma = new PrismaClient();

const STORE_ID = 768;

/**
 * Create a historical logbook example representing a typical day
 * This would come from analyzing past handwritten logbooks
 */
async function createHistoricalLogbookExample(
  date: string,
  description: string
): Promise<Partial<HistoricalLogbook>> {
  
  console.log(`\nCreating historical logbook for ${date}: ${description}`);
  
  // Fetch actual crew from database
  const crew = await prisma.crew.findMany({
    where: { storeId: STORE_ID },
    include: {
      crewRoles: {
        include: {
          role: true
        }
      }
    },
    take: 10  // Use first 10 crew for this example
  });

  // Fetch store configuration
  const store = await prisma.store.findUnique({
    where: { id: STORE_ID }
  });

  if (!crew.length || !store) {
    throw new Error('Need crew and store data in database');
  }

  console.log(`Found ${crew.length} crew members`);
  
  // For now, return a structure showing what we need to populate
  return {
    id: `historical-${date}`,
    date,
    description,
    
    // This would be populated from actual handwritten logbook data
    assignments: [],
    
    // This would need to be constructed based on what constraints
    // should have been enforced on that day
    solverInput: {
      date,
      store: {
        storeId: store.id,
        baseSlotMinutes: store.baseSlotMinutes,
        openMinutesFromMidnight: store.openMinutesFromMidnight,
        closeMinutesFromMidnight: store.closeMinutesFromMidnight,
        startRegHour: Math.floor(store.openMinutesFromMidnight / 60),
        endRegHour: Math.floor(store.closeMinutesFromMidnight / 60),
        reqShiftLengthForBreak: store.reqShiftLengthForBreak,
        breakWindowStart: store.breakWindowStart,
        breakWindowEnd: store.breakWindowEnd,
        // Preference weights from defaults
        consecutiveProdWeight: 40,
        consecutiveRegWeight: 40,
        earlyBreakWeight: 40,
        lateBreakWeight: 40,
        productFirstHourWeight: 1000,
        productTaskWeight: 200,
        registerFirstHourWeight: 1000,
        registerTaskWeight: 200,
      },
      crew: [],  // Would be populated with actual crew who worked
      hourlyRequirements: [],
      crewRoleRequirements: [],
      coverageWindows: [],
      roleMetadata: [],
      timeLimitSeconds: 300
    },
    
    // Analysis of manual schedule
    manualAnalysis: {
      assignmentsOutsideStoreHours: 0,
      shiftsRequiringBreakWithoutBreak: 0,
      breaksOutsideWindow: 0,
      hourlyConstraintsViolated: [],
      windowConstraintsViolated: [],
      dailyConstraintsViolated: [],
      roleNonConsecutiveViolations: [],
      slotSizeViolations: [],
      preferencesSatisfied: 0,
      totalPreferences: 0,
      satisfactionScore: 0
    },
    
    notes: 'Template - needs to be populated with actual data from handwritten logbooks'
  };
}

/**
 * Instructions for creating historical logbook test data
 */
async function generateInstructions() {
  console.log('═'.repeat(80));
  console.log('HISTORICAL LOGBOOK TEST DATA CREATION GUIDE');
  console.log('═'.repeat(80));
  
  console.log('\n📝 To create test data from handwritten logbooks, you need:\n');
  
  console.log('1. HISTORICAL ASSIGNMENTS');
  console.log('   - For each crew member who worked:');
  console.log('     * crewId, crewName');
  console.log('     * role (REGISTER, PRODUCT, DEMO, etc.)');
  console.log('     * startMinutes, endMinutes (from midnight)');
  console.log('   - Example: Alice did REGISTER from 480-600 (8am-10am)\n');
  
  console.log('2. CONSTRAINT SETUP FOR THAT DAY');
  console.log('   - What were the required staffing levels?');
  console.log('     * Hourly: "Need 2 REGISTER from 9am-5pm"');
  console.log('     * Windows: "Need 2 DEMO from 11am-2pm"');
  console.log('     * Daily: "Alice must do 3 hours of ORDER_WRITER"');
  console.log('   - What were the shift times?');
  console.log('   - Which roles were each crew member qualified for?\n');
  
  console.log('3. ANALYSIS OF MANUAL SCHEDULE');
  console.log('   - Did it violate any constraints?');
  console.log('     * Missing breaks');
  console.log('     * Assignments outside store hours');
  console.log('     * Understaffed hours');
  console.log('     * Non-consecutive ORDER_WRITER blocks');
  console.log('   - How well did it satisfy preferences?');
  console.log('     * Did people get their preferred first hour role?');
  console.log('     * Did people get breaks at their preferred time?\n');
  
  console.log('4. NEXT STEPS');
  console.log('   a) Gather 3-5 representative days from past logbooks');
  console.log('   b) For each day, document:');
  console.log('      - Who worked (crew + shifts)');
  console.log('      - What they were assigned (tasks + times)');
  console.log('      - What the requirements were');
  console.log('      - Any known issues/violations');
  console.log('   c) Encode this into HistoricalLogbook JSON format');
  console.log('   d) Run solver with same constraints');
  console.log('   e) Compare results\n');
  
  console.log('═'.repeat(80));
  console.log('CONSTRAINT TEST SCENARIOS');
  console.log('═'.repeat(80));
  
  console.log('\n🧪 For testing individual constraints in isolation:\n');
  
  console.log('Create simple scenarios that test ONE thing at a time:');
  console.log('  ✓ Store hours: Crew shift 7am-10pm, store open 8am-9pm');
  console.log('  ✓ Break policy: 8-hour shift should get break in 3-4.5h window');
  console.log('  ✓ Hourly constraint: Need exactly 2 REGISTER at 10am');
  console.log('  ✓ Window constraint: Need 2 DEMO from 11am-2pm');
  console.log('  ✓ Daily constraint: Crew must do exactly 3h ORDER_WRITER');
  console.log('  ✓ Consecutive: ORDER_WRITER must be one continuous block');
  console.log('  ✓ Min/max slots: REGISTER blocks must be 2-5 hours');
  console.log('  ✓ Outside hours: TRUCK can happen before store opens\n');
  
  console.log('These can be created programmatically once we have the');
  console.log('constraint analysis tool working.\n');
  
  console.log('═'.repeat(80));
  
  // Show example structure
  const example = await createHistoricalLogbookExample(
    '2025-11-20',
    'Typical Wednesday - moderate staffing'
  );
  
  const fs = await import('fs/promises');
  await fs.writeFile(
    './historical-logbook-template.json',
    JSON.stringify(example, null, 2)
  );
  
  console.log('\n✅ Created template: ./historical-logbook-template.json');
  console.log('   Fill this in with actual data from handwritten logbooks\n');
}

async function main() {
  await generateInstructions();
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
