# Constraint Testing & Historical Logbook Comparison

This directory contains tools for validating solver constraints and comparing automated schedules against historical handwritten logbooks.

## Overview

The goal is to:
1. **Test constraints in isolation** - Verify each business rule works correctly
2. **Compare against manual schedules** - Measure whether automation improves upon handwritten logbooks
3. **Track constraint violations** - Identify which rules are being broken and why

## Files Created

### Type Definitions
- **`/packages/shared-types/src/constraint-testing.ts`**
  - `HistoricalLogbook` - Represents a past handwritten schedule with constraints
  - `HistoricalAssignment` - A single crew->role assignment with timing
  - `HistoricalConstraintAnalysis` - Detailed violation report
  - `ConstraintTestScenario` - Test case for a specific constraint type
  - `ScheduleComparison` - Side-by-side manual vs automated comparison
  
### Tools
- **`/apps/api/src/services/constraint-analyzer.ts`**
  - `analyzeConstraintSatisfaction()` - Analyzes any schedule for violations
  - `summarizeAnalysis()` - Human-readable violation report
  - `solverToHistoricalAssignments()` - Convert solver output to comparable format
  
- **`/apps/api/prisma/create-historical-logbook-data.ts`**
  - Generates template for encoding past schedules
  - Instructions for gathering historical data
  
- **`/apps/api/prisma/create-constraint-test-scenarios.ts`** ⚠️ (Has TypeScript errors - needs fixing)
  - Generates test scenarios for each constraint type
  - Currently incomplete due to type mismatches

## Workflow

### Phase 1: Gather Historical Data

1. **Find 3-5 representative handwritten logbooks** from different scenarios:
   - Typical weekday
   - Busy weekend
   - Understaffed day
   - Day with many demos/special tasks
   
2. **For each day, document:**
   - Who worked (crew names + shift times)
   - What they were assigned (role + time blocks)
   - What the requirements were (staffing levels, coverage windows, individual assignments)
   - Any known issues (missing breaks, understaffing, preference violations)
   
3. **Run the template generator:**
   ```bash
   cd apps/api
   npx tsx prisma/create-historical-logbook-data.ts
   ```
   
4. **Fill in `historical-logbook-template.json`** with real data

### Phase 2: Create Constraint Test Scenarios

These are simple, isolated tests that verify ONE constraint at a time:

| Constraint Type | Test Scenario |
|----------------|---------------|
| Store Hours | Crew shift 7am-10pm, store open 8am-9pm → assignments only 8am-9pm |
| Break Policy | 8-hour shift → exactly one break in 3-4.5h window |
| Hourly Constraint | Need 2 REGISTER at 10am → exactly 2 crew on REGISTER |
| Window Constraint | Need 2 DEMO 11am-2pm → 2 crew on DEMO for all hours |
| Daily Constraint | Crew must do 3h ORDER_WRITER → exactly 3 hours assigned |
| Consecutive Slots | ORDER_WRITER must be consecutive → one continuous block |
| Min/Max Slots | REGISTER blocks 2-5 hours → no blocks shorter/longer |
| Outside Hours Allowed | TRUCK before store opens → allowed when flag is true |
| Preference Weights | PRODUCT FIRST_HOUR pref → crew gets PRODUCT in first hour |

### Phase 3: Test Constraints in Isolation

1. **Create simple solver input** for each scenario above
2. **Run through solver**
3. **Analyze with `constraint-analyzer.ts`**
4. **Verify expected behavior:**
   - Success cases: all constraints satisfied
   - Failure cases: specific violations detected

Example usage:
```typescript
import { analyzeConstraintSatisfaction, summarizeAnalysis } from './services/constraint-analyzer';

// Run solver
const solverOutput = await callPythonSolver(testInput);

// Analyze results
const analysis = analyzeConstraintSatisfaction(
  solverToHistoricalAssignments(solverOutput, crewNameMap),
  testInput
);

// Print report
console.log(summarizeAnalysis(analysis));
```

### Phase 4: Compare Against Historical Logbooks

1. **For each historical logbook:**
   - Analyze the manual schedule to find violations
   - Run solver with same constraints
   - Analyze the automated schedule
   - Compare violations and preference satisfaction
   
2. **Generate comparison report:**
   ```
   MANUAL SCHEDULE VIOLATIONS: 12
     • 3 shifts missing required breaks
     • 5 hourly staffing violations
     • 2 breaks outside window
     • 2 role blocks not consecutive
     
   SOLVER SCHEDULE VIOLATIONS: 0
     ✓ All constraints satisfied!
     
   IMPROVEMENT METRICS:
     ✓ Fixed all break policy violations
     ✓ Fixed all staffing level violations
     ✓ Preference satisfaction: 75% → 92% (+17%)
     ✓ Objective score improved by 2,340 points
     
   VERDICT: BETTER ✅
   ```

3. **Track patterns:**
   - Which constraints were most often violated manually?
   - Which preferences get satisfied more with automation?
   - Are there any regressions (things that got worse)?

## Constraint Analyzer API

The `constraint-analyzer.ts` service validates these constraints:

### Hard Constraints
1. **Store Hours** - No assignments outside `openMinutesFromMidnight` to `closeMinutesFromMidnight` (unless `allowOutsideStoreHours=true`)
2. **Break Policy** - Shifts ≥ `reqShiftLengthForBreak` get exactly one break in `breakWindowStart`-`breakWindowEnd`
3. **Hourly Staffing** - Exact crew count per hour matches `HourlyRoleConstraint` requirements
4. **Coverage Windows** - Exact crew count for entire window matches `WindowRoleConstraint`
5. **Daily Role Hours** - Crew completes exact hours from `DailyRoleConstraint`
6. **Consecutive Slots** - Roles with `slotsMustBeConsecutive=true` are not fragmented
7. **Slot Size Limits** - Role blocks respect `minSlots` and `maxSlots` from Role model

### Soft Constraints (Preferences)
8. **First Hour Preference** - Crew gets preferred role in first working hour
9. **Task Preference** - Crew gets preferred role (PRODUCT vs REGISTER)
10. **Break Timing** - Crew gets break early vs late based on preference
11. **Consecutive Preference** - Minimize role switches for crew who prefer it

The analyzer returns:
```typescript
interface HistoricalConstraintAnalysis {
  assignmentsOutsideStoreHours: number;
  shiftsRequiringBreakWithoutBreak: number;
  breaksOutsideWindow: number;
  hourlyConstraintsViolated: Array<{hour, role, required, actual}>;
  windowConstraintsViolated: Array<{startHour, endHour, role, required, actual}>;
  dailyConstraintsViolated: Array<{crewId, crewName, role, requiredHours, actualHours}>;
  roleNonConsecutiveViolations: Array<{crewId, crewName, role, fragmentCount}>;
  slotSizeViolations: Array<{crewId, crewName, role, blockSlots, minSlots, maxSlots}>;
  preferencesSatisfied: number;
  totalPreferences: number;
  satisfactionScore: number;
}
```

## Next Steps

✅ **Completed:**
- Type definitions for historical logbooks and test scenarios
- Constraint analyzer tool
- Historical logbook template generator
- Documentation

🔨 **To Do:**
1. Fix TypeScript errors in `create-constraint-test-scenarios.ts`
2. Gather actual historical logbook data
3. Create schedule comparison tool
4. Write tests for constraint analyzer
5. Build automated test runner
6. Generate comparison reports

## Example: Testing Store Hours Constraint

```typescript
// Simple test case
const testInput = {
  date: '2025-11-25',
  store: {
    storeId: 768,
    baseSlotMinutes: 30,
    openMinutesFromMidnight: 480,  // 8:00am
    closeMinutesFromMidnight: 1260,  // 9:00pm
    // ... other fields
  },
  crew: [{
    id: 'crew1',
    name: 'Alice',
    shiftStartMin: 420,  // 7:00am (before store opens)
    shiftEndMin: 900,    // 3:00pm
    eligibleRoles: ['REGISTER'],
    canBreak: true,
    canParkingHelms: false
  }],
  hourlyRequirements: [],
  crewRoleRequirements: [],
  coverageWindows: [],
  roleMetadata: [{
    role: 'REGISTER',
    assignmentModel: 'UNIVERSAL',
    allowOutsideStoreHours: false  // Should NOT allow before 8am
  }]
};

// Run solver
const output = await runSolver(testInput);

// Analyze
const analysis = analyzeConstraintSatisfaction(
  solverToHistoricalAssignments(output, new Map([['crew1', 'Alice']])),
  testInput
);

// Verify
console.assert(analysis.assignmentsOutsideStoreHours === 0, 'Should not assign before store opens');
```

## Questions?

Contact the team or refer to:
- `/packages/shared-types/src/solver.ts` - Solver input/output types
- `/apps/api/prisma/schema.prisma` - Database schema for constraints
- `/apps/solver-python/solver.py` - Python solver implementation
